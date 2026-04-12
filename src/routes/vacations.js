const express = require('express');
const db = require('../db');
const { authRequired, audit } = require('../auth');

const router = express.Router();
router.use(authRequired);

function diffDays(start, end) {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000) + 1;
}

function getBalance(employeeId) {
  const u = db.prepare('SELECT vacation_days_year FROM user WHERE id = ?').get(employeeId);
  const allocated = u ? u.vacation_days_year : 22;
  const year = new Date().getFullYear();
  const used = db.prepare(
    `SELECT COALESCE(SUM(days), 0) AS used FROM leave_request
      WHERE employee_id = ? AND status = 'approved'
        AND substr(start_date, 1, 4) = ?`
  ).get(employeeId, String(year)).used;
  const pending = db.prepare(
    `SELECT COALESCE(SUM(days), 0) AS pending FROM leave_request
      WHERE employee_id = ? AND status = 'submitted'
        AND substr(start_date, 1, 4) = ?`
  ).get(employeeId, String(year)).pending;
  return { allocated, used, pending, remaining: allocated - used };
}

router.get('/balance', (req, res) => {
  res.json(getBalance(req.user.id));
});

router.get('/', (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'admin') {
    rows = db.prepare(
      `SELECT l.*, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE e.company_id = ?
        ORDER BY l.start_date DESC`
    ).all(u.company_id);
  } else if (u.role === 'manager') {
    rows = db.prepare(
      `SELECT l.*, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.employee_id = ? OR e.manager_id = ?
        ORDER BY l.start_date DESC`
    ).all(u.id, u.id);
  } else {
    rows = db.prepare(
      `SELECT l.*, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.employee_id = ?
        ORDER BY l.start_date DESC`
    ).all(u.id);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { leave_type, start_date, end_date, reason } = req.body || {};
  if (!start_date || !end_date) return res.status(400).json({ error: 'dates required' });
  if (end_date < start_date) return res.status(400).json({ error: 'end_date < start_date' });
  const days = diffDays(start_date, end_date);
  if (days <= 0) return res.status(400).json({ error: 'invalid range' });

  // overlap check (simple): no approved/submitted requests overlapping for same employee
  const overlap = db.prepare(
    `SELECT 1 FROM leave_request
      WHERE employee_id = ? AND status IN ('submitted','approved')
        AND NOT (end_date < ? OR start_date > ?)`
  ).get(req.user.id, start_date, end_date);
  if (overlap) return res.status(400).json({ error: 'overlap with existing request' });

  const result = db.prepare(
    `INSERT INTO leave_request (employee_id, leave_type, start_date, end_date, days, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, 'submitted')`
  ).run(req.user.id, leave_type || 'vacation', start_date, end_date, days, reason || null);
  audit(req.user.id, 'create', 'leave_request', result.lastInsertRowid, { start_date, end_date, days });
  res.status(201).json({ id: result.lastInsertRowid, days });
});

router.post('/:id/decision', (req, res) => {
  const { action, comment } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|reject' });
  }
  const lr = db.prepare('SELECT * FROM leave_request WHERE id = ?').get(req.params.id);
  if (!lr) return res.status(404).json({ error: 'not found' });
  let allowed = req.user.role === 'admin';
  if (!allowed && req.user.role === 'manager') {
    const emp = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(lr.employee_id);
    if (emp && emp.manager_id === req.user.id) allowed = true;
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  if (lr.status !== 'submitted') return res.status(400).json({ error: 'not pending' });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(
    `UPDATE leave_request SET status = ?, approver_id = ?, decision_comment = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(newStatus, req.user.id, comment || null, req.params.id);
  audit(req.user.id, action, 'leave_request', req.params.id, { comment });
  res.json({ ok: true, status: newStatus });
});

router.post('/:id/cancel', (req, res) => {
  const lr = db.prepare('SELECT * FROM leave_request WHERE id = ?').get(req.params.id);
  if (!lr || lr.employee_id !== req.user.id) return res.status(404).json({ error: 'not found' });
  if (lr.status !== 'submitted') return res.status(400).json({ error: 'cannot cancel' });
  db.prepare("UPDATE leave_request SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  audit(req.user.id, 'cancel', 'leave_request', req.params.id, null);
  res.json({ ok: true });
});

// team calendar — approved leaves visible to manager/admin and to the employee themselves
router.get('/calendar', (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'admin') {
    rows = db.prepare(
      `SELECT l.id, l.start_date, l.end_date, l.leave_type, l.status, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.status IN ('submitted','approved') AND e.company_id = ?
        ORDER BY l.start_date`
    ).all(u.company_id);
  } else if (u.role === 'manager') {
    rows = db.prepare(
      `SELECT l.id, l.start_date, l.end_date, l.leave_type, l.status, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.status IN ('submitted','approved') AND (e.manager_id = ? OR l.employee_id = ?)
        ORDER BY l.start_date`
    ).all(u.id, u.id);
  } else {
    rows = db.prepare(
      `SELECT l.id, l.start_date, l.end_date, l.leave_type, l.status, e.full_name AS employee_name
         FROM leave_request l JOIN user e ON e.id = l.employee_id
        WHERE l.status IN ('submitted','approved') AND l.employee_id = ?
        ORDER BY l.start_date`
    ).all(u.id);
  }
  res.json(rows);
});

module.exports = router;
