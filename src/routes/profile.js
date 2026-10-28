const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { signToken } = require('../utils/token');
const v = require('../utils/validate');

const router = express.Router();
const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

// GET /api/profile
router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT u.username, u.created_at, COALESCE(s.display_name, '') AS display_name
       FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
      WHERE u.id = ?`,
    [req.user.id]
  );
  res.json({ username: rows[0].username, displayName: rows[0].display_name, createdAt: rows[0].created_at });
}));

// PUT /api/profile  { displayName }
router.put('/', asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  const displayName = v.validateText(body.displayName, 'Name', 100, { allowEmpty: true });
  await pool.execute(
    `INSERT INTO user_settings (user_id, display_name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
    [req.user.id, displayName]
  );
  res.json({ displayName });
}));

// PUT /api/profile/password  { newPassword, currentPassword? }
// currentPassword is verified when supplied. All older tokens are revoked and a fresh one returned.
router.put('/password', asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  const newPassword = v.validatePassword(body.newPassword);

  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (body.currentPassword !== undefined) {
    const ok = typeof body.currentPassword === 'string'
      && await bcrypt.compare(body.currentPassword, rows[0].password_hash);
    if (!ok) throw new HttpError(400, 'Current password is incorrect.');
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await pool.execute(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
    [hash, req.user.id]
  );
  const [fresh] = await pool.execute('SELECT id, token_version FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Password updated.', token: signToken(fresh[0]) });
}));

module.exports = router;
