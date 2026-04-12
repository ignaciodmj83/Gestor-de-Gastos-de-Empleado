const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authRequired, audit } = require('../auth');

const router = express.Router();
router.use(authRequired);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/pdf',
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('mime not allowed: ' + file.mimetype));
    }
    cb(null, true);
  },
});

const VALID_OBJECTS = new Set(['ticket', 'mileage_report']);

function canAttach(user, objectType, objectId) {
  if (objectType === 'ticket') {
    const t = db.prepare('SELECT * FROM ticket WHERE id = ?').get(objectId);
    if (!t) return false;
    if (user.role === 'admin') return true;
    if (t.requester_id === user.id) return true;
    return false;
  }
  if (objectType === 'mileage_report') {
    const r = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(objectId);
    if (!r) return false;
    if (user.role === 'admin') return true;
    if (r.employee_id === user.id && r.status === 'draft') return true;
    return false;
  }
  return false;
}

router.post('/', upload.single('file'), (req, res) => {
  const { object_type, object_id } = req.body || {};
  if (!VALID_OBJECTS.has(object_type) || !object_id) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'object_type/object_id required' });
  }
  if (!canAttach(req.user, object_type, parseInt(object_id, 10))) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!req.file) return res.status(400).json({ error: 'file required' });

  const result = db.prepare(
    `INSERT INTO attachment (object_type, object_id, filename, original_name, mime, size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    object_type,
    parseInt(object_id, 10),
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size,
    req.user.id
  );
  audit(req.user.id, 'upload', 'attachment', result.lastInsertRowid, { object_type, object_id });
  res.status(201).json({
    id: result.lastInsertRowid,
    original_name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
  });
});

router.get('/:id', (req, res) => {
  const att = db.prepare('SELECT * FROM attachment WHERE id = ?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'not found' });
  // authorize via parent object
  let allowed = req.user.role === 'admin';
  if (!allowed) {
    if (att.object_type === 'ticket') {
      const t = db.prepare('SELECT * FROM ticket WHERE id = ?').get(att.object_id);
      if (t && (t.requester_id === req.user.id)) allowed = true;
      if (t && req.user.role === 'manager') {
        const reqer = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(t.requester_id);
        if (reqer && reqer.manager_id === req.user.id) allowed = true;
      }
    } else if (att.object_type === 'mileage_report') {
      const r = db.prepare('SELECT * FROM mileage_report WHERE id = ?').get(att.object_id);
      if (r && r.employee_id === req.user.id) allowed = true;
      if (r && req.user.role === 'manager') {
        const emp = db.prepare('SELECT manager_id FROM user WHERE id = ?').get(r.employee_id);
        if (emp && emp.manager_id === req.user.id) allowed = true;
      }
    }
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  const filePath = path.join(UPLOAD_DIR, att.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file missing' });
  res.setHeader('Content-Type', att.mime);
  res.setHeader('Content-Disposition', `inline; filename="${att.original_name}"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
