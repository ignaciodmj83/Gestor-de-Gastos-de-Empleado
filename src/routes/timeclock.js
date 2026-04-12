const express = require('express');
const db = require('../db');
const { authRequired, audit } = require('../auth');

const router = express.Router();
router.use(authRequired);

const VALID_TYPES = ['IN', 'OUT', 'BREAK_START', 'BREAK_END'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// last event of today for a user
function lastEventToday(userId) {
  return db.prepare(
    `SELECT * FROM time_event
      WHERE employee_id = ? AND substr(ts, 1, 10) = ?
      ORDER BY ts DESC LIMIT 1`
  ).get(userId, todayISO());
}

router.get('/status', (req, res) => {
  const last = lastEventToday(req.user.id);
  const events = db.prepare(
    `SELECT * FROM time_event
      WHERE employee_id = ? AND substr(ts, 1, 10) = ?
      ORDER BY ts ASC`
  ).all(req.user.id, todayISO());
  res.json({ last, events });
});

// post a clock event for the current user
router.post('/event', (req, res) => {
  const { event_type } = req.body || {};
  if (!VALID_TYPES.includes(event_type)) {
    return res.status(400).json({ error: 'invalid event_type' });
  }
  // basic state machine: enforce IN before OUT/BREAK
  const last = lastEventToday(req.user.id);
  if (event_type === 'IN' && last && last.event_type !== 'OUT') {
    return res.status(400).json({ error: 'already clocked in' });
  }
  if (event_type === 'OUT' && (!last || last.event_type === 'OUT')) {
    return res.status(400).json({ error: 'not clocked in' });
  }
  if (event_type === 'BREAK_START' && (!last || last.event_type !== 'IN')) {
    return res.status(400).json({ error: 'must be working to start break' });
  }
  if (event_type === 'BREAK_END' && (!last || last.event_type !== 'BREAK_START')) {
    return res.status(400).json({ error: 'no break in progress' });
  }
  const ts = nowISO();
  const result = db.prepare(
    `INSERT INTO time_event (employee_id, event_type, ts, source, created_by)
     VALUES (?, ?, ?, 'web', ?)`
  ).run(req.user.id, event_type, ts, req.user.id);
  audit(req.user.id, 'clock', 'time_event', result.lastInsertRowid, { event_type });
  res.status(201).json({ id: result.lastInsertRowid, event_type, ts });
});

// shift / day summary for an employee — own data, or manager/admin for team
router.get('/shifts', (req, res) => {
  const u = req.user;
  const employeeId = parseInt(req.query.employee_id || u.id, 10);
  if (employeeId !== u.id) {
    let allowed = u.role === 'admin';
    if (!allowed && u.role === 'manager') {
      const emp = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(employeeId);
      if (emp && emp.manager_id === u.id) allowed = true;
    }
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
  }
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  const events = db.prepare(
    `SELECT * FROM time_event
      WHERE employee_id = ? AND substr(ts, 1, 10) BETWEEN ? AND ?
      ORDER BY ts ASC`
  ).all(employeeId, from, to);

  // group by day & compute worked minutes (excludes breaks)
  const byDay = {};
  for (const e of events) {
    const day = e.ts.slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(e);
  }
  const shifts = [];
  for (const [day, evs] of Object.entries(byDay)) {
    let workedMin = 0;
    let inAt = null;
    let breakAt = null;
    for (const e of evs) {
      if (e.event_type === 'IN') inAt = new Date(e.ts.replace(' ', 'T') + 'Z');
      if (e.event_type === 'BREAK_START' && inAt) {
        breakAt = new Date(e.ts.replace(' ', 'T') + 'Z');
        workedMin += (breakAt - inAt) / 60000;
        inAt = null;
      }
      if (e.event_type === 'BREAK_END' && breakAt) {
        inAt = new Date(e.ts.replace(' ', 'T') + 'Z');
        breakAt = null;
      }
      if (e.event_type === 'OUT' && inAt) {
        const out = new Date(e.ts.replace(' ', 'T') + 'Z');
        workedMin += (out - inAt) / 60000;
        inAt = null;
      }
    }
    shifts.push({
      date: day,
      events: evs,
      worked_minutes: Math.round(workedMin),
      worked_hours: Math.round(workedMin / 6) / 10,
    });
  }
  shifts.sort((a, b) => a.date.localeCompare(b.date));
  res.json(shifts);
});

// CSV export — required for 4-year retention / audits
router.get('/export.csv', (req, res) => {
  const u = req.user;
  const employeeId = parseInt(req.query.employee_id || u.id, 10);
  if (employeeId !== u.id && u.role === 'employee') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  const rows = db.prepare(
    `SELECT te.*, e.full_name AS employee_name
       FROM time_event te JOIN user e ON e.id = te.employee_id
      WHERE te.employee_id = ? AND substr(te.ts, 1, 10) BETWEEN ? AND ?
      ORDER BY te.ts`
  ).all(employeeId, from, to);
  const lines = ['employee,event_type,ts,source'];
  for (const r of rows) {
    lines.push(`"${r.employee_name}",${r.event_type},${r.ts},${r.source}`);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="time_${employeeId}_${from}_${to}.csv"`);
  res.send(lines.join('\n'));
});

// --- Corrections (employee asks, manager/admin approves) ---
router.get('/corrections', (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'admin') {
    rows = db.prepare(
      `SELECT c.*, e.full_name AS employee_name
         FROM time_correction c JOIN user e ON e.id = c.employee_id
        ORDER BY c.created_at DESC`
    ).all();
  } else if (u.role === 'manager') {
    rows = db.prepare(
      `SELECT c.*, e.full_name AS employee_name
         FROM time_correction c JOIN user e ON e.id = c.employee_id
        WHERE c.employee_id = ? OR e.manager_id = ?
        ORDER BY c.created_at DESC`
    ).all(u.id, u.id);
  } else {
    rows = db.prepare(
      `SELECT c.*, e.full_name AS employee_name
         FROM time_correction c JOIN user e ON e.id = c.employee_id
        WHERE c.employee_id = ?
        ORDER BY c.created_at DESC`
    ).all(u.id);
  }
  res.json(rows);
});

router.post('/corrections', (req, res) => {
  const { target_date, requested_event_type, requested_ts, reason } = req.body || {};
  if (!target_date || !requested_event_type || !requested_ts || !reason) {
    return res.status(400).json({ error: 'all fields required' });
  }
  if (!VALID_TYPES.includes(requested_event_type)) {
    return res.status(400).json({ error: 'invalid event_type' });
  }
  const result = db.prepare(
    `INSERT INTO time_correction (employee_id, target_date, requested_event_type, requested_ts, reason, status)
     VALUES (?, ?, ?, ?, ?, 'submitted')`
  ).run(req.user.id, target_date, requested_event_type, requested_ts, reason);
  audit(req.user.id, 'create', 'time_correction', result.lastInsertRowid, { target_date, requested_event_type });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post('/corrections/:id/decision', (req, res) => {
  const { action, comment } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|reject' });
  }
  const corr = db.prepare('SELECT * FROM time_correction WHERE id = ?').get(req.params.id);
  if (!corr) return res.status(404).json({ error: 'not found' });
  let allowed = req.user.role === 'admin';
  if (!allowed && req.user.role === 'manager') {
    const emp = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(corr.employee_id);
    if (emp && emp.manager_id === req.user.id) allowed = true;
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  if (corr.status !== 'submitted') return res.status(400).json({ error: 'not pending' });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE time_correction SET status = ?, approver_id = ?, decision_comment = ?, decided_at = datetime('now') WHERE id = ?`
    ).run(newStatus, req.user.id, comment || null, req.params.id);

    // if approved, materialize the corrected event in time_event
    if (action === 'approve') {
      db.prepare(
        `INSERT INTO time_event (employee_id, event_type, ts, source, created_by)
         VALUES (?, ?, ?, 'correction', ?)`
      ).run(corr.employee_id, corr.requested_event_type, corr.requested_ts, req.user.id);
    }
  });
  tx();
  audit(req.user.id, action, 'time_correction', req.params.id, { comment });
  res.json({ ok: true, status: newStatus });
});

module.exports = router;
