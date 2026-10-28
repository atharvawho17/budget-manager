const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { HttpError } = require('../utils/httpError');

// Verifies the Bearer token, then confirms the user still exists and the token
// has not been revoked (logout / password change bump users.token_version).
// Sets req.user = { id, username }. Every query downstream filters by req.user.id.
async function authenticate(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required.');

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (e) {
      throw new HttpError(401, e.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token.');
    }

    const [rows] = await pool.execute('SELECT id, username, token_version FROM users WHERE id = ?', [payload.sub]);
    if (rows.length === 0 || rows[0].token_version !== payload.tv) {
      throw new HttpError(401, 'Session is no longer valid. Please log in again.');
    }
    req.user = { id: rows[0].id, username: rows[0].username };
    next();
  } catch (err) {
    next(err);
  }
}
module.exports = authenticate;
