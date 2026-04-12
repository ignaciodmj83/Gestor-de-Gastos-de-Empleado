const express = require('express');
const db = require('../db');
const { authRequired, audit } = require('../auth');

const router = express.Router();
router.use(authRequired);

function getCompanyRate() {
  const c = db.prepare('SELECT mileage_rate FROM company LIMIT 1').get();
  return c ? c.mileage_rate : 0.26;
}

function canView(user, report) {
  if (!report) return false;
  if (user.role === 'admin') return true;
  if (report.employee_id === user.id) return true;
  if (user.role === 'manager') {
    const emp = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(report.employee_id);
    if (emp && emp.manager_id === user.id) return true;
  }
  return false;
}

function recalcTotals(reportId) {
  const trips = db.prepare('SELECT km, amount FROM mileage_trip WHERE report_id = ?').all(reportId);
  const totalKm = trips.reduce((s, t) => s + t.km, 0);
  const totalAmount = trips.reduce((s, t) => s + t.amount, 0);
  db.prepare('UPDATE mileage_report SET total_km = ?, total_amount = ? WHERE id = ?')
    .run(totalKm, totalAmount, reportId);
}

router.get('/', (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'admin') {
    rows = db.prepare(
      `SELECT r.*, e.full_name AS employee_name
         FROM mileage_report r JOIN user e ON e.id = r.employee_id
        ORDER BY r.created_at DESC`
    ).all();
  } else if (u.role === 'manager') {
    rows = db.prepare(
      `SELECT r.*, e.full_name AS employee_name
         FROM mileage_report r JOIN user e ON e.id = r.employee_id
        WHERE r.employee_id = ? OR e.manager_id = ?
        ORDER BY r.created_at DESC`
    ).all(u.id, u.id);
  } else {
    rows = db.prepare(
      `SELECT r.*, e.full_name AS employee_name
         FROM mileage_report r JOIN user e ON e.id = r.employee_id
        WHERE r.employee_id = ?
        ORDER BY r.created_at DESC`
    ).all(u.id);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { title, period_start, period_end } = req.body || {};
  if (!title || !period_start || !period_end) {
    return res.status(400).json({ error: 'title/period_start/period_end required' });
  }
  const result = db.prepare(
    `INSERT INTO mileage_report (employee_id, title, period_start, period_end, status)
     VALUES (?, ?, ?, ?, 'draft')`
  ).run(req.user.id, title, period_start, period_end);
  audit(req.user.id, 'create', 'mileage_report', result.lastInsertRowid, { title });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const report = db.prepare(
    `SELECT r.*, e.full_name AS employee_name, a.full_name AS approver_name
       FROM mileage_report r
       JOIN user e ON e.id = r.employee_id
       LEFT JOIN user a ON a.id = r.approver_id
      WHERE r.id = ?`
  ).get(req.params.id);
  if (!canView(req.user, report)) return res.status(404).json({ error: 'not found' });
  const trips = db.prepare(
    `SELECT * FROM mileage_trip WHERE report_id = ? ORDER BY trip_date ASC`
  ).all(req.params.id);
  const attachments = db.prepare(
    `SELECT id, original_name, mime, size FROM attachment
      WHERE object_type = 'mileage_report' AND object_id = ?`
  ).all(req.params.id);
  res.json({ ...report, trips, attachments });
});

router.post('/:id/trips', (req, res) => {
  const report = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(req.params.id);
  if (!report || report.employee_id !== req.user.id) {
    return res.status(404).json({ error: 'not found' });
  }
  if (report.status !== 'draft') return res.status(400).json({ error: 'report not editable' });
  const { trip_date, origin, destination, km, notes } = req.body || {};
  if (!trip_date || !origin || !destination || km == null) {
    return res.status(400).json({ error: 'fields required' });
  }
  const rate = getCompanyRate();
  const amount = Math.round(km * rate * 100) / 100;
  db.prepare(
    `INSERT INTO mileage_trip (report_id, trip_date, origin, destination, km, rate, amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, trip_date, origin, destination, km, rate, amount, notes || null);
  recalcTotals(req.params.id);
  res.status(201).json({ ok: true, amount });
});

router.delete('/:id/trips/:tripId', (req, res) => {
  const report = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(req.params.id);
  if (!report || report.employee_id !== req.user.id) return res.status(404).json({ error: 'not found' });
  if (report.status !== 'draft') return res.status(400).json({ error: 'report not editable' });
  db.prepare('DELETE FROM mileage_trip WHERE id = ? AND report_id = ?')
    .run(req.params.tripId, req.params.id);
  recalcTotals(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/submit', (req, res) => {
  const report = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(req.params.id);
  if (!report || report.employee_id !== req.user.id) return res.status(404).json({ error: 'not found' });
  if (report.status !== 'draft') return res.status(400).json({ error: 'already submitted' });
  db.prepare("UPDATE mileage_report SET status = 'submitted' WHERE id = ?").run(req.params.id);
  audit(req.user.id, 'submit', 'mileage_report', req.params.id, null);
  res.json({ ok: true });
});

router.post('/:id/decision', (req, res) => {
  const { action, comment } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|reject' });
  }
  const report = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'not found' });
  let allowed = req.user.role === 'admin';
  if (!allowed && req.user.role === 'manager') {
    const emp = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(report.employee_id);
    if (emp && emp.manager_id === req.user.id) allowed = true;
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  if (report.status !== 'submitted') return res.status(400).json({ error: 'not pending' });
  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(
    `UPDATE mileage_report SET status = ?, approver_id = ?, decision_comment = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(newStatus, req.user.id, comment || null, req.params.id);
  audit(req.user.id, action, 'mileage_report', req.params.id, { comment });
  res.json({ ok: true, status: newStatus });
});

// CSV export (for accounting handoff)
router.get('/:id/export.csv', (req, res) => {
  const report = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(req.params.id);
  if (!canView(req.user, report)) return res.status(404).json({ error: 'not found' });
  const trips = db.prepare('SELECT * FROM mileage_trip WHERE report_id = ? ORDER BY trip_date').all(req.params.id);
  const lines = ['date,origin,destination,km,rate,amount,notes'];
  for (const t of trips) {
    const safe = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    lines.push([t.trip_date, safe(t.origin), safe(t.destination), t.km, t.rate, t.amount, safe(t.notes)].join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mileage_${report.id}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
