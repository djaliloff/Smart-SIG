require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const scoreRouter  = require('./routes/score');
const searchRouter = require('./routes/search');
const manageRouter = require('./routes/manage');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const { query } = require('./db');
    const result = await query('SELECT NOW() AS time, version() AS pg_version');
    return res.json({
      status: 'ok',
      timestamp: result.rows[0].time,
      pg_version: result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1],
    });
  } catch (err) {
    return res.status(503).json({ status: 'error', message: err.message });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/score',  scoreRouter);
app.use('/api/search', searchRouter);
app.use('/api/manage', manageRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🗺️  DJT-SIG Backend running at http://localhost:${PORT}`);
  console.log(`📡 API Base:  http://localhost:${PORT}/api`);
  console.log(`❤️  Health:   http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
