const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired, roleRequired, audit } = require('../auth');

const router = express.Router();
router.use(authRequired);

// users CRUD — admin only, scoped to admin's company
router.get('/users', roleRequired('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT u.id, u.email, u.full_name, u.role, u.manager_id, u.vacation_days_year, u.active,
            m.full_name AS manager_name
       FROM user u LEFT JOIN user m ON m.id = u.manager_id
      WHERE u.company_id = ?
      ORDER BY u.full_name`
  ).all(req.user.company_id);
  res.json(rows);
});

// list of usable managers — managers/admins, scoped to current company
router.get('/users/list', roleRequired('admin', 'manager'), (req, res) => {
  const rows = db.prepare(
    `SELECT id, full_name, role FROM user
      WHERE active = 1 AND company_id = ?
      ORDER BY full_name`
  ).all(req.user.company_id);
  res.json(rows);
});

router.post('/users', roleRequired('admin'), (req, res) => {
  const { email, password, full_name, role, manager_id, vacation_days_year } = req.body || {};
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'email/password/full_name/role required' });
  }
  if (!['admin', 'manager', 'employee'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  try {
    const result = db.prepare(
      `INSERT INTO user (company_id, email, password_hash, full_name, role, manager_id, vacation_days_year)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.company_id,
      email,
      bcrypt.hashSync(password, 10),
      full_name,
      role,
      manager_id || null,
      vacation_days_year || 22
    );
    audit(req.user.id, 'create', 'user', result.lastInsertRowid, { email, role });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'email already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id', roleRequired('admin'), (req, res) => {
  // ownership: only allow editing users in the admin's own company
  const target = db.prepare('SELECT id, company_id FROM user WHERE id = ?').get(req.params.id);
  if (!target || target.company_id !== req.user.company_id) {
    return res.status(404).json({ error: 'user not found' });
  }
  const allowed = ['full_name', 'role', 'manager_id', 'vacation_days_year', 'active'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      updates.push(`${k} = ?`);
      values.push(req.body[k]);
    }
  }
  if (req.body.password) {
    updates.push('password_hash = ?');
    values.push(bcrypt.hashSync(req.body.password, 10));
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.id);
  db.prepare(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  audit(req.user.id, 'update', 'user', req.params.id, req.body);
  res.json({ ok: true });
});

// company settings — scoped to the admin's company
router.get('/company', roleRequired('admin'), (req, res) => {
  const c = db.prepare('SELECT * FROM company WHERE id = ?').get(req.user.company_id);
  if (c && !c.code) {
    const { ensureCompanyCode } = require('../db');
    c.code = ensureCompanyCode(c.id, c.name);
  }
  res.json(c);
});

router.patch('/company', roleRequired('admin'), (req, res) => {
  const { name, mileage_rate } = req.body || {};
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (mileage_rate !== undefined) { updates.push('mileage_rate = ?'); values.push(mileage_rate); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.user.company_id);
  db.prepare(`UPDATE company SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  audit(req.user.id, 'update', 'company', req.user.company_id, req.body);
  res.json({ ok: true });
});

// audit log — admin only, scoped to current company actors
router.get('/audit', roleRequired('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT a.*, u.full_name AS actor_name
       FROM audit_log a
       JOIN user u ON u.id = a.actor_id
      WHERE u.company_id = ?
      ORDER BY a.ts DESC LIMIT 500`
  ).all(req.user.company_id);
  res.json(rows);
});

// approvals inbox — pending items the current user can decide on
router.get('/inbox', (req, res) => {
  const u = req.user;
  let tickets, mileage, leaves, corrections;
  if (u.role === 'admin') {
    tickets = db.prepare(
      `SELECT t.id, t.subject, t.created_at, e.full_name AS requester_name
         FROM ticket t JOIN user e ON e.id = t.requester_id
        WHERE t.status = 'submitted' AND e.company_id = ?
        ORDER BY t.created_at DESC`
    ).all(u.company_id);
    mileage = db.prepare(
      `SELECT r.id, r.title, r.total_amount, r.created_at, e.full_name AS employee_name
         FROM mileage_report r JOIN user e ON e.id = r.employee_id
        WHERE r.status = 'submitted' AND e.company_id = ?
        ORDER BY r.created_at DESC`
    ).all(u.company_id);
    leaves = db.prepare(
      `SELECT l.id, l.start_date, l.end_date, l.days, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.status = 'submitted' AND e.company_id = ?
        ORDER BY l.created_at DESC`
    ).all(u.company_id);
    corrections = db.prepare(
      `SELECT c.id, c.target_date, c.requested_event_type, c.reason, e.full_name AS employee_name
         FROM time_correction c JOIN user e ON e.id = c.employee_id
        WHERE c.status = 'submitted' AND e.company_id = ?
        ORDER BY c.created_at DESC`
    ).all(u.company_id);
  } else if (u.role === 'manager') {
    tickets = db.prepare(
      `SELECT t.id, t.subject, t.created_at, e.full_name AS requester_name
         FROM ticket t JOIN user e ON e.id = t.requester_id
        WHERE t.status = 'submitted' AND e.manager_id = ?
        ORDER BY t.created_at DESC`
    ).all(u.id);
    mileage = db.prepare(
      `SELECT r.id, r.title, r.total_amount, r.created_at, e.full_name AS employee_name
         FROM mileage_report r JOIN user e ON e.id = r.employee_id
        WHERE r.status = 'submitted' AND e.manager_id = ?
        ORDER BY r.created_at DESC`
    ).all(u.id);
    leaves = db.prepare(
      `SELECT l.id, l.start_date, l.end_date, l.days, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.status = 'submitted' AND e.manager_id = ?
        ORDER BY l.created_at DESC`
    ).all(u.id);
    corrections = db.prepare(
      `SELECT c.id, c.target_date, c.requested_event_type, c.reason, e.full_name AS employee_name
         FROM time_correction c JOIN user e ON e.id = c.employee_id
        WHERE c.status = 'submitted' AND e.manager_id = ?
        ORDER BY c.created_at DESC`
    ).all(u.id);
  } else {
    tickets = []; mileage = []; leaves = []; corrections = [];
  }
  res.json({ tickets, mileage, leaves, corrections });
});

// ===== Invitaciones =====

router.get('/invites', roleRequired('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT i.id, i.token, i.email, i.role, i.manager_id, i.vacation_days_year,
            i.expires_at, i.used_at, i.used_by_user_id, i.created_at,
            cb.full_name AS created_by_name,
            ub.full_name AS used_by_name,
            m.full_name AS manager_name
       FROM invite i
       LEFT JOIN user cb ON cb.id = i.created_by
       LEFT JOIN user ub ON ub.id = i.used_by_user_id
       LEFT JOIN user m ON m.id = i.manager_id
      WHERE i.company_id = ?
      ORDER BY i.created_at DESC`
  ).all(req.user.company_id);
  res.json(rows);
});

router.post('/invites', roleRequired('admin'), (req, res) => {
  const { email, role, manager_id, vacation_days_year, expires_in_days } = req.body || {};
  const finalRole = role || 'employee';
  if (!['admin', 'manager', 'employee'].includes(finalRole)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  if (manager_id) {
    const m = db.prepare('SELECT company_id FROM user WHERE id = ?').get(manager_id);
    if (!m || m.company_id !== req.user.company_id) {
      return res.status(400).json({ error: 'manager_id no pertenece a tu organización' });
    }
  }
  const token = crypto.randomBytes(24).toString('base64url');
  let expiresAt = null;
  if (expires_in_days && Number(expires_in_days) > 0) {
    const d = new Date();
    d.setDate(d.getDate() + Number(expires_in_days));
    expiresAt = d.toISOString();
  }
  const result = db.prepare(
    `INSERT INTO invite (company_id, token, email, role, manager_id, vacation_days_year, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.company_id,
    token,
    email || null,
    finalRole,
    manager_id || null,
    vacation_days_year || 22,
    req.user.id,
    expiresAt
  );
  audit(req.user.id, 'create', 'invite', result.lastInsertRowid, { email, role: finalRole });
  res.status(201).json({ id: result.lastInsertRowid, token, expires_at: expiresAt });
});

router.delete('/invites/:id', roleRequired('admin'), (req, res) => {
  const inv = db.prepare('SELECT id, company_id FROM invite WHERE id = ?').get(req.params.id);
  if (!inv || inv.company_id !== req.user.company_id) {
    return res.status(404).json({ error: 'invite not found' });
  }
  db.prepare('DELETE FROM invite WHERE id = ?').run(req.params.id);
  audit(req.user.id, 'revoke', 'invite', req.params.id, null);
  res.json({ ok: true });
});

// ===== Solicitudes de acceso (entrantes) =====

router.get('/join-requests', roleRequired('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT jr.id, jr.email, jr.full_name, jr.message, jr.status, jr.created_at, jr.decided_at,
            db_user.full_name AS decided_by_name
       FROM join_request jr
       LEFT JOIN user db_user ON db_user.id = jr.decided_by
      WHERE jr.company_id = ?
      ORDER BY jr.created_at DESC`
  ).all(req.user.company_id);
  res.json(rows);
});

router.post('/join-requests/:id/decision', roleRequired('admin'), (req, res) => {
  const { action, role, manager_id, vacation_days_year, comment } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|reject' });
  }
  const jr = db.prepare('SELECT * FROM join_request WHERE id = ?').get(req.params.id);
  if (!jr || jr.company_id !== req.user.company_id) {
    return res.status(404).json({ error: 'join request not found' });
  }
  if (jr.status !== 'pending') return res.status(400).json({ error: 'not pending' });

  if (action === 'reject') {
    db.prepare(
      `UPDATE join_request SET status = 'rejected', decided_by = ?, decided_at = datetime('now') WHERE id = ?`
    ).run(req.user.id, req.params.id);
    audit(req.user.id, 'reject', 'join_request', req.params.id, { comment });
    return res.json({ ok: true, status: 'rejected' });
  }

  // approve → create user and link
  const finalRole = role || 'employee';
  if (!['admin', 'manager', 'employee'].includes(finalRole)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const dupe = db.prepare('SELECT id FROM user WHERE email = ?').get(jr.email);
  if (dupe) return res.status(409).json({ error: 'ya existe un usuario con ese email' });

  let newUserId;
  const tx = db.transaction(() => {
    const u = db.prepare(
      `INSERT INTO user (company_id, email, password_hash, full_name, role, manager_id, vacation_days_year)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.company_id,
      jr.email,
      jr.password_hash,
      jr.full_name,
      finalRole,
      manager_id || null,
      vacation_days_year || 22
    );
    newUserId = u.lastInsertRowid;
    db.prepare(
      `UPDATE join_request SET status = 'approved', decided_by = ?, decided_at = datetime('now'), created_user_id = ? WHERE id = ?`
    ).run(req.user.id, newUserId, req.params.id);
  });
  tx();
  audit(req.user.id, 'approve', 'join_request', req.params.id, { user_id: newUserId, role: finalRole });
  res.json({ ok: true, status: 'approved', user_id: newUserId });
});

module.exports = router;
