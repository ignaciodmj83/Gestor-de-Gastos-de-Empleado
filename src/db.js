// Uses Node's built-in node:sqlite (Node 22+) so we don't need a native build chain.
// Wraps DatabaseSync with the small subset of better-sqlite3-style helpers
// that the rest of the codebase relies on (pragma, transaction).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'erp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const raw = new DatabaseSync(DB_PATH);

// Compat layer: add pragma() + transaction() so route code is portable.
const db = new Proxy(raw, {
  get(target, prop, receiver) {
    if (prop === 'pragma') {
      return (stmt) => target.exec(`PRAGMA ${stmt};`);
    }
    if (prop === 'transaction') {
      return (fn) => () => {
        target.exec('BEGIN');
        try {
          const result = fn();
          target.exec('COMMIT');
          return result;
        } catch (err) {
          try { target.exec('ROLLBACK'); } catch (_) {}
          throw err;
        }
      };
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      mileage_rate REAL NOT NULL DEFAULT 0.26,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES company(id),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','manager','employee')),
      manager_id INTEGER REFERENCES user(id),
      vacation_days_year INTEGER NOT NULL DEFAULT 22,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL REFERENCES user(id),
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      approver_id INTEGER REFERENCES user(id),
      decision_comment TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES user(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attachment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_type TEXT NOT NULL,
      object_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mileage_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES user(id),
      title TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      total_km REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      approver_id INTEGER REFERENCES user(id),
      decision_comment TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mileage_trip (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES mileage_report(id) ON DELETE CASCADE,
      trip_date TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      km REAL NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS leave_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES user(id),
      leave_type TEXT NOT NULL DEFAULT 'vacation',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      approver_id INTEGER REFERENCES user(id),
      decision_comment TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES user(id),
      event_type TEXT NOT NULL CHECK(event_type IN ('IN','OUT','BREAK_START','BREAK_END')),
      ts TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      created_by INTEGER NOT NULL REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_correction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES user(id),
      target_date TEXT NOT NULL,
      requested_event_type TEXT NOT NULL,
      requested_ts TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      approver_id INTEGER REFERENCES user(id),
      decision_comment TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES user(id),
      action TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id INTEGER,
      details TEXT,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES company(id),
      token TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','manager','employee')),
      manager_id INTEGER REFERENCES user(id),
      vacation_days_year INTEGER NOT NULL DEFAULT 22,
      created_by INTEGER NOT NULL REFERENCES user(id),
      expires_at TEXT,
      used_at TEXT,
      used_by_user_id INTEGER REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_invite_token ON invite(token);
    CREATE INDEX IF NOT EXISTS idx_invite_company ON invite(company_id);

    CREATE TABLE IF NOT EXISTS join_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES company(id),
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      decided_by INTEGER REFERENCES user(id),
      decided_at TEXT,
      created_user_id INTEGER REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_join_request_company ON join_request(company_id);
  `);

  // ---- Idempotent migrations for already-created DBs ----
  const companyCols = db.prepare("PRAGMA table_info('company')").all();
  if (!companyCols.some(c => c.name === 'code')) {
    db.exec("ALTER TABLE company ADD COLUMN code TEXT");
  }

  const tripCols = db.prepare("PRAGMA table_info('mileage_trip')").all();
  if (!tripCols.some(c => c.name === 'km_start')) {
    db.exec("ALTER TABLE mileage_trip ADD COLUMN km_start REAL");
  }
  if (!tripCols.some(c => c.name === 'km_end')) {
    db.exec("ALTER TABLE mileage_trip ADD COLUMN km_end REAL");
  }
}

// Generates a short, human-friendly org code (e.g. "ACM-3F8K")
function generateOrgCode(name) {
  const prefix = (name || 'ORG')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${suffix}`;
}

function ensureCompanyCode(companyId, name) {
  const row = db.prepare('SELECT code FROM company WHERE id = ?').get(companyId);
  if (row && row.code) return row.code;
  // generate, retry on collision
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateOrgCode(name);
    const dupe = db.prepare('SELECT id FROM company WHERE code = ?').get(candidate);
    if (!dupe) {
      db.prepare('UPDATE company SET code = ? WHERE id = ?').run(candidate, companyId);
      return candidate;
    }
  }
  throw new Error('No se pudo generar un código de organización único');
}

function seed() {
  // Always ensure existing companies have a code (idempotent)
  const allCompanies = db.prepare('SELECT id, name, code FROM company').all();
  for (const c of allCompanies) {
    if (!c.code) ensureCompanyCode(c.id, c.name);
  }

  const companyCount = allCompanies.length;
  if (companyCount > 0) return;

  const insertCompany = db.prepare('INSERT INTO company (name, mileage_rate) VALUES (?, ?)');
  const companyId = insertCompany.run('Demo S.L.', 0.26).lastInsertRowid;
  ensureCompanyCode(companyId, 'Demo S.L.');

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare(
    `INSERT INTO user (company_id, email, password_hash, full_name, role, manager_id, vacation_days_year)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const adminId = insertUser.run(Number(companyId), 'admin@demo.local', hash('admin123'), 'Ana Admin', 'admin', null, 22).lastInsertRowid;
  const managerId = insertUser.run(Number(companyId), 'manager@demo.local', hash('manager123'), 'Marta Manager', 'manager', Number(adminId), 22).lastInsertRowid;
  insertUser.run(Number(companyId), 'empleado@demo.local', hash('empleado123'), 'Eva Empleada', 'employee', Number(managerId), 22);
  insertUser.run(Number(companyId), 'juan@demo.local', hash('juan123'), 'Juan Pérez', 'employee', Number(managerId), 22);

  console.log('Seed creado. Usuarios:');
  console.log('  admin@demo.local / admin123');
  console.log('  manager@demo.local / manager123');
  console.log('  empleado@demo.local / empleado123');
  console.log('  juan@demo.local / juan123');
}

init();
seed();

module.exports = db;
module.exports.ensureCompanyCode = ensureCompanyCode;
module.exports.generateOrgCode = generateOrgCode;

if (require.main === module && process.argv.includes('--seed')) {
  console.log('DB inicializada en', DB_PATH);
}
