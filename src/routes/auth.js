const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ensureCompanyCode } = require('../db');
const { login, issueSession, authRequired, audit } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });
  const result = login(email, password);
  if (!result) return res.status(401).json({ error: 'invalid credentials' });
  audit(result.user.id, 'login', 'user', result.user.id, null);
  res.json(result);
});

router.get('/me', authRequired, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    company_id: u.company_id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    manager_id: u.manager_id,
    vacation_days_year: u.vacation_days_year,
  });
});

// Crear una nueva organización + cuenta admin (registro público)
router.post('/register', (req, res) => {
  const { company_name, full_name, email, password } = req.body || {};
  if (!company_name || !full_name || !email || !password) {
    return res.status(400).json({ error: 'company_name, full_name, email y password son obligatorios' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'la contraseña debe tener al menos 6 caracteres' });

  const existing = db.prepare('SELECT id FROM user WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'ya existe un usuario con ese email' });

  const tx = db.transaction(() => {
    const c = db.prepare('INSERT INTO company (name, mileage_rate) VALUES (?, ?)').run(company_name, 0.26);
    const u = db.prepare(
      `INSERT INTO user (company_id, email, password_hash, full_name, role, manager_id, vacation_days_year)
       VALUES (?, ?, ?, ?, 'admin', NULL, 22)`
    ).run(c.lastInsertRowid, email, bcrypt.hashSync(password, 10), full_name);
    return { companyId: c.lastInsertRowid, userId: u.lastInsertRowid };
  });
  const ids = tx();
  ensureCompanyCode(ids.companyId, company_name);

  const user = db.prepare('SELECT * FROM user WHERE id = ?').get(ids.userId);
  const session = issueSession(user);
  audit(user.id, 'register_company', 'company', ids.companyId, { company_name, email });
  res.status(201).json(session);
});

// Info pública de una invitación (sin requerir auth)
router.get('/invite/:token', (req, res) => {
  const inv = db.prepare(
    `SELECT i.*, c.name AS company_name, u.full_name AS inviter_name
       FROM invite i
       JOIN company c ON c.id = i.company_id
       LEFT JOIN user u ON u.id = i.created_by
      WHERE i.token = ?`
  ).get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'invitación no encontrada' });
  if (inv.used_at) return res.status(410).json({ error: 'invitación ya utilizada' });
  if (inv.expires_at && inv.expires_at < new Date().toISOString()) {
    return res.status(410).json({ error: 'invitación caducada' });
  }
  res.json({
    company_name: inv.company_name,
    inviter_name: inv.inviter_name,
    role: inv.role,
    email: inv.email,
  });
});

// Aceptar invitación → crea usuario y devuelve sesión
router.post('/invite/:token/accept', (req, res) => {
  const { full_name, password, email } = req.body || {};
  if (!full_name || !password) return res.status(400).json({ error: 'full_name y password obligatorios' });
  if (password.length < 6) return res.status(400).json({ error: 'la contraseña debe tener al menos 6 caracteres' });

  const inv = db.prepare('SELECT * FROM invite WHERE token = ?').get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'invitación no encontrada' });
  if (inv.used_at) return res.status(410).json({ error: 'invitación ya utilizada' });
  if (inv.expires_at && inv.expires_at < new Date().toISOString()) {
    return res.status(410).json({ error: 'invitación caducada' });
  }

  const finalEmail = (inv.email || email || '').trim().toLowerCase();
  if (!finalEmail) return res.status(400).json({ error: 'email obligatorio' });
  const dupe = db.prepare('SELECT id FROM user WHERE email = ?').get(finalEmail);
  if (dupe) return res.status(409).json({ error: 'ya existe un usuario con ese email' });

  let newUserId;
  const tx = db.transaction(() => {
    const u = db.prepare(
      `INSERT INTO user (company_id, email, password_hash, full_name, role, manager_id, vacation_days_year)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      inv.company_id,
      finalEmail,
      bcrypt.hashSync(password, 10),
      full_name,
      inv.role,
      inv.manager_id || null,
      inv.vacation_days_year || 22
    );
    newUserId = u.lastInsertRowid;
    db.prepare(
      `UPDATE invite SET used_at = datetime('now'), used_by_user_id = ? WHERE id = ?`
    ).run(newUserId, inv.id);
  });
  tx();

  const user = db.prepare('SELECT * FROM user WHERE id = ?').get(newUserId);
  const session = issueSession(user);
  audit(user.id, 'accept_invite', 'invite', inv.id, { email: finalEmail, role: inv.role });
  res.status(201).json(session);
});

// Look up an organization by its public code (no auth)
router.get('/org/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'código requerido' });
  const c = db.prepare('SELECT id, name, code FROM company WHERE code = ?').get(code);
  if (!c) return res.status(404).json({ error: 'organización no encontrada' });
  res.json({ id: c.id, name: c.name, code: c.code });
});

// Submit a request to join an organization (no auth — public form)
router.post('/request-access', (req, res) => {
  const { code, full_name, email, password, message } = req.body || {};
  if (!code || !full_name || !email || !password) {
    return res.status(400).json({ error: 'code, full_name, email y password son obligatorios' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'la contraseña debe tener al menos 6 caracteres' });

  const company = db.prepare('SELECT id, name, code FROM company WHERE code = ?').get(String(code).trim().toUpperCase());
  if (!company) return res.status(404).json({ error: 'organización no encontrada' });

  const finalEmail = String(email).trim().toLowerCase();
  const existingUser = db.prepare('SELECT id FROM user WHERE email = ?').get(finalEmail);
  if (existingUser) return res.status(409).json({ error: 'ya existe un usuario con ese email' });

  // de-duplicate pending requests
  const existingReq = db.prepare(
    `SELECT id FROM join_request WHERE company_id = ? AND email = ? AND status = 'pending'`
  ).get(company.id, finalEmail);
  if (existingReq) return res.status(409).json({ error: 'ya tienes una solicitud pendiente para esta organización' });

  const result = db.prepare(
    `INSERT INTO join_request (company_id, email, full_name, password_hash, message, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(company.id, finalEmail, full_name, bcrypt.hashSync(password, 10), message || null);
  audit(null, 'request_access', 'join_request', result.lastInsertRowid, { email: finalEmail, company: company.code });
  res.status(201).json({ id: result.lastInsertRowid, company_name: company.name });
});

module.exports = router;
