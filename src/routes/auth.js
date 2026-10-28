const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { pool, withTransaction } = require('../config/db');
const authenticate = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { signToken } = require('../utils/token');
const v = require('../utils/validate');
const { EXPENSE_CATEGORIES, DEFAULT_CATEGORY_BUDGET, DEFAULT_MONTHLY_BUDGET } = require('../constants');

const router = express.Router();
const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
// Compared against when the username doesn't exist, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again in a few minutes.' } },
});

// POST /api/auth/register
router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  const username = v.validateUsername(body.username);
  const password = v.validatePassword(body.password);
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await withTransaction(async (conn) => {
      const [result] = await conn.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
      const id = result.insertId;
      await conn.execute(
        'INSERT INTO user_settings (user_id, display_name, monthly_budget) VALUES (?, ?, ?)',
        [id, '', DEFAULT_MONTHLY_BUDGET]
      );
      const placeholders = EXPENSE_CATEGORIES.map(() => '(?, ?, ?)').join(', ');
      await conn.execute(
        `INSERT INTO budgets (user_id, category, limit_amount) VALUES ${placeholders}`,
        EXPENSE_CATEGORIES.flatMap((c) => [id, c, DEFAULT_CATEGORY_BUDGET])
      );
      return { id, username, token_version: 0 };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That username is taken.');
    throw err;
  }
  res.status(201).json({ token: signToken(user), user: { id: user.id, username: user.username } });
}));

// POST /api/auth/login
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  if (typeof body.username !== 'string' || typeof body.password !== 'string'
      || !body.username.trim() || !body.password
      || body.username.length > 100 || body.password.length > 200) {
    throw new HttpError(400, 'Enter a username and password.');
  }
  const [rows] = await pool.execute(
    'SELECT id, username, password_hash, token_version FROM users WHERE username = ?',
    [body.username.trim()]
  );
  const user = rows[0];
  const ok = await bcrypt.compare(body.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect username or password.');
  res.json({ token: signToken(user), user: { id: user.id, username: user.username } });
}));

// POST /api/auth/logout - revokes every token issued so far for this user
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await pool.execute('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  res.json({ message: 'Logged out.' });
}));

// GET /api/auth/me - used by the frontend to restore a session on page load
router.get('/me', authenticate, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

module.exports = router;
