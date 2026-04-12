const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const JWT_EXPIRES = '12h';

function issueSession(user) {
  const token = jwt.sign(
    { id: user.id, company_id: user.company_id, email: user.email, role: user.role, name: user.full_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  return {
    token,
    user: {
      id: user.id,
      company_id: user.company_id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      manager_id: user.manager_id,
    },
  };
}

function login(email, password) {
  const user = db.prepare('SELECT * FROM user WHERE email = ? AND active = 1').get(email);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return issueSession(user);
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM user WHERE id = ? AND active = 1').get(payload.id);
    if (!user) return res.status(401).json({ error: 'user not found' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'no auth' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', required: roles });
    }
    next();
  };
}

function audit(actorId, action, objectType, objectId, details) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, action, object_type, object_id, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(actorId || null, action, objectType, objectId || null, details ? JSON.stringify(details) : null);
}

module.exports = { login, issueSession, authRequired, roleRequired, audit };
