const express = require('express');
const db = require('../db');
const { authRequired, audit } = require('../auth');

const router = express.Router();
router.use(authRequired);

// helper: can the current user see this ticket?
function canView(user, ticket) {
  if (!ticket) return false;
  if (user.role === 'admin') return true;
  if (ticket.requester_id === user.id) return true;
  if (user.role === 'manager') {
    // manager can see tickets from their direct reports
    const requester = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(ticket.requester_id);
    if (requester && requester.manager_id === user.id) return true;
  }
  return false;
}

// list tickets — employees see their own; managers see theirs+team; admin sees all
router.get('/', (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'admin') {
    rows = db.prepare(
      `SELECT t.*, u.full_name AS requester_name
         FROM ticket t JOIN user u ON u.id = t.requester_id
        ORDER BY t.created_at DESC`
    ).all();
  } else if (u.role === 'manager') {
    rows = db.prepare(
      `SELECT t.*, u.full_name AS requester_name
         FROM ticket t JOIN user u ON u.id = t.requester_id
        WHERE t.requester_id = ? OR u.manager_id = ?
        ORDER BY t.created_at DESC`
    ).all(u.id, u.id);
  } else {
    rows = db.prepare(
      `SELECT t.*, u.full_name AS requester_name
         FROM ticket t JOIN user u ON u.id = t.requester_id
        WHERE t.requester_id = ?
        ORDER BY t.created_at DESC`
    ).all(u.id);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { category, priority, subject, description } = req.body || {};
  if (!category || !subject) return res.status(400).json({ error: 'category and subject required' });
  const result = db.prepare(
    `INSERT INTO ticket (requester_id, category, priority, subject, description, status)
     VALUES (?, ?, ?, ?, ?, 'submitted')`
  ).run(req.user.id, category, priority || 'normal', subject, description || '');
  audit(req.user.id, 'create', 'ticket', result.lastInsertRowid, { subject });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare(
    `SELECT t.*, u.full_name AS requester_name, a.full_name AS approver_name
       FROM ticket t
       JOIN user u ON u.id = t.requester_id
       LEFT JOIN user a ON a.id = t.approver_id
      WHERE t.id = ?`
  ).get(req.params.id);
  if (!canView(req.user, ticket)) return res.status(404).json({ error: 'not found' });
  const comments = db.prepare(
    `SELECT c.*, u.full_name AS author_name
       FROM ticket_comment c JOIN user u ON u.id = c.author_id
      WHERE c.ticket_id = ? ORDER BY c.created_at ASC`
  ).all(req.params.id);
  const attachments = db.prepare(
    `SELECT id, original_name, mime, size FROM attachment
      WHERE object_type = 'ticket' AND object_id = ?`
  ).all(req.params.id);
  res.json({ ...ticket, comments, attachments });
});

router.post('/:id/comments', (req, res) => {
  const ticket = db.prepare('SELECT * FROM ticket WHERE id = ?').get(req.params.id);
  if (!canView(req.user, ticket)) return res.status(404).json({ error: 'not found' });
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  db.prepare(
    `INSERT INTO ticket_comment (ticket_id, author_id, body) VALUES (?, ?, ?)`
  ).run(req.params.id, req.user.id, body);
  res.status(201).json({ ok: true });
});

// delete — requester (own, undecided) or admin
router.delete('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM ticket WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });
  const isOwner = ticket.requester_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });
  if (isOwner && !isAdmin && ticket.status !== 'submitted') {
    return res.status(400).json({ error: 'only pending tickets can be deleted by the requester' });
  }
  db.prepare('DELETE FROM ticket WHERE id = ?').run(req.params.id);
  audit(req.user.id, 'delete', 'ticket', req.params.id, null);
  res.json({ ok: true });
});

// approve / reject — admin or manager of requester
router.post('/:id/decision', (req, res) => {
  const { action, comment } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|reject' });
  }
  const ticket = db.prepare('SELECT * FROM ticket WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'not found' });
  // authorize: admin always; manager only for direct reports
  let allowed = req.user.role === 'admin';
  if (!allowed && req.user.role === 'manager') {
    const requester = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(ticket.requester_id);
    if (requester && requester.manager_id === req.user.id) allowed = true;
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  if (ticket.status !== 'submitted') return res.status(400).json({ error: 'already decided' });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(
    `UPDATE ticket SET status = ?, approver_id = ?, decision_comment = ?, decided_at = datetime('now')
      WHERE id = ?`
  ).run(newStatus, req.user.id, comment || null, req.params.id);
  audit(req.user.id, action, 'ticket', req.params.id, { comment });
  res.json({ ok: true, status: newStatus });
});

module.exports = router;
