const express = require('express');
const cors = require('cors');
const { pool } = require('./src/config/db');
const authenticate = require('./src/middleware/auth');
const { HttpError } = require('./src/utils/httpError');

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

// Public authentication routes
app.use('/api/auth', require('./src/routes/auth'));

// All remaining API routes require authentication
app.use('/api/dashboard', authenticate, require('./src/routes/dashboard'));
app.use('/api/transactions', authenticate, require('./src/routes/transactions'));
app.use('/api/budgets', authenticate, require('./src/routes/budgets'));
app.use('/api/profile', authenticate, require('./src/routes/profile'));
app.use('/api/reports', authenticate, require('./src/routes/reports'));
app.use('/api/data', authenticate, require('./src/routes/data'));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found.' } });
});

// Central error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status || 500;

  if (status >= 500) {
    console.error('Server error:', err);
  }

  res.status(status).json({
    error: {
      message: status >= 500
        ? 'Internal server error.'
        : err.message,
    },
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Budget Manager API listening on port ${PORT}`);
});
