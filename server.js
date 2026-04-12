const express = require('express');
const path = require('path');

require('./src/db'); // ensures schema + seed

const authRoutes = require('./src/routes/auth');
const ticketsRoutes = require('./src/routes/tickets');
const mileageRoutes = require('./src/routes/mileage');
const vacationsRoutes = require('./src/routes/vacations');
const timeclockRoutes = require('./src/routes/timeclock');
const adminRoutes = require('./src/routes/admin');
const attachmentsRoutes = require('./src/routes/attachments');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// basic security headers (no external deps)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/mileage', mileageRoutes);
app.use('/api/vacations', vacationsRoutes);
app.use('/api/time', timeclockRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/attachments', attachmentsRoutes);

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// static frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// global error handler
app.use((err, req, res, next) => {
  console.error('[ERR]', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\nGestor Contable Empleado iniciado en http://localhost:${PORT}`);
  console.log('Usuarios demo:');
  console.log('  admin@demo.local      / admin123');
  console.log('  manager@demo.local    / manager123');
  console.log('  empleado@demo.local   / empleado123');
  console.log('  juan@demo.local       / juan123\n');
});
