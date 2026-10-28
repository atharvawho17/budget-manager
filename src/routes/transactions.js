const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { today } = require('../utils/dates');
const v = require('../utils/validate');

const router = express.Router();

const toTx = (r) => ({
  id: r.id,
  type: r.type,
  description: r.description,
  amount: Number(r.amount),
  category: r.category,
  date: r.txn_date,
});
const COLUMNS = 'id, type, description, amount, category, txn_date';

// GET /api/transactions?type=&category=&from=&to=&limit=   (newest entry first)
router.get('/', asyncHandler(async (req, res) => {
  const where = ['user_id = ?'];
  const params = [req.user.id];
  const q = req.query;
  if (q.type !== undefined) { where.push('type = ?'); params.push(v.validateType(q.type)); }
  if (q.category !== undefined) { where.push('category = ?'); params.push(v.validateText(q.category, 'Category', 50)); }
  if (q.from !== undefined) { where.push('txn_date >= ?'); params.push(v.validateDate(q.from, 'from')); }
  if (q.to !== undefined) { where.push('txn_date <= ?'); params.push(v.validateDate(q.to, 'to')); }

  let sql = `SELECT ${COLUMNS} FROM transactions WHERE ${where.join(' AND ')} ORDER BY id DESC`;
  if (q.limit !== undefined) sql += ` LIMIT ${v.validateInt(q.limit, 'limit', 1, 5000)}`; // validated integer
  const [rows] = await pool.execute(sql, params);
  res.json({ count: rows.length, transactions: rows.map(toTx) });
}));

// GET /api/transactions/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = v.validateId(req.params.id);
  const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM transactions WHERE id = ? AND user_id = ?`, [id, req.user.id]);
  if (rows.length === 0) throw new HttpError(404, 'Transaction not found.');
  res.json({ transaction: toTx(rows[0]) });
}));

// POST /api/transactions  { type, description, amount, category, date? }
router.post('/', asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  const type = v.validateType(body.type);
  const description = v.validateText(body.description, 'Description', 255);
  const amount = v.validateAmount(body.amount, 'Amount');
  const category = v.validateCategory(type, body.category);
  const date = (body.date === undefined || body.date === null || body.date === '') ? today() : v.validateDate(body.date);

  const [result] = await pool.execute(
    'INSERT INTO transactions (user_id, type, description, amount, category, txn_date) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, type, description, amount, category, date]
  );
  res.status(201).json({ transaction: { id: result.insertId, type, description, amount, category, date } });
}));

// DELETE /api/transactions/:id  (only your own rows can match)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = v.validateId(req.params.id);
  const [result] = await pool.execute('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Transaction not found.');
  res.json({ message: 'Transaction deleted.', id });
}));

module.exports = router;
