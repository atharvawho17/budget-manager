// JSON export / import. The file format matches what the original localStorage app produced,
// so old exports can be imported.
const express = require('express');
const { pool, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const v = require('../utils/validate');
const stats = require('../services/stats');
const { EXPENSE_CATEGORIES, INCOME_SOURCES, MAX_IMPORT_TRANSACTIONS } = require('../constants');

const router = express.Router();

// GET /api/data/export
router.get('/export', asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const [rows] = await pool.execute(
    'SELECT id, type, description, amount, category, txn_date FROM transactions WHERE user_id = ? ORDER BY id DESC',
    [uid]
  );
  const [settings, budgets] = await Promise.all([stats.getSettings(uid), stats.getCategoryLimits(uid)]);
  res.json({
    transactions: rows.map((r) => ({
      id: r.id, date: r.txn_date, desc: r.description, category: r.category, type: r.type, amount: Number(r.amount),
    })),
    budgets,
    monthlyBudget: settings.monthlyBudget,
    profile: settings.displayName,
  });
}));

function cleanTransaction(t) {
  v.requireObject(t);
  const type = v.validateType(t.type);
  const description = v.validateText(t.desc !== undefined ? t.desc : t.description, 'Description', 255);
  const amount = v.validateAmount(t.amount, 'Amount');
  const date = v.validateDate(t.date);
  const list = type === 'income' ? INCOME_SOURCES : EXPENSE_CATEGORIES;
  const category = list.includes(t.category) ? t.category : 'Other'; // unknown categories fall back to Other
  return { type, description, amount, category, date };
}

// POST /api/data/import - REPLACES the user's transactions and budgets with the file's contents
router.post('/import', asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  if (!Array.isArray(body.transactions)) throw new HttpError(400, "That file isn't a valid budget JSON.");
  if (!body.budgets || typeof body.budgets !== 'object' || Array.isArray(body.budgets)) {
    throw new HttpError(400, "That file isn't a valid budget JSON.");
  }
  if (body.transactions.length > MAX_IMPORT_TRANSACTIONS) {
    throw new HttpError(400, `Too many transactions (max ${MAX_IMPORT_TRANSACTIONS}).`);
  }

  const txs = body.transactions.map((t, i) => {
    try { return cleanTransaction(t); } catch (e) { throw new HttpError(400, `Transaction #${i + 1}: ${e.message}`); }
  });

  const limits = [];
  EXPENSE_CATEGORIES.forEach((c) => {
    if (body.budgets[c] !== undefined) limits.push([c, v.validateAmount(body.budgets[c], `Budget for ${c}`, { allowZero: true })]);
  });
  const monthlyBudget = body.monthlyBudget === undefined ? null : v.validateAmount(body.monthlyBudget, 'Monthly budget', { allowZero: true });
  const profile = typeof body.profile === 'string' ? body.profile.trim().slice(0, 100) : null;

  const uid = req.user.id;
  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM transactions WHERE user_id = ?', [uid]);

    // Insert oldest-first so the first entry in the file ends up with the highest id (= top of the ledger)
    const ordered = txs.slice().reverse();
    for (let i = 0; i < ordered.length; i += 200) {
      const chunk = ordered.slice(i, i + 200);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      await conn.execute(
        `INSERT INTO transactions (user_id, type, description, amount, category, txn_date) VALUES ${placeholders}`,
        chunk.flatMap((t) => [uid, t.type, t.description, t.amount, t.category, t.date])
      );
    }
    for (const [category, limit] of limits) {
      await conn.execute(
        `INSERT INTO budgets (user_id, category, limit_amount) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)`,
        [uid, category, limit]
      );
    }
    if (monthlyBudget !== null) {
      await conn.execute(
        `INSERT INTO user_settings (user_id, monthly_budget) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE monthly_budget = VALUES(monthly_budget)`,
        [uid, monthlyBudget]
      );
    }
    if (profile !== null) {
      await conn.execute(
        `INSERT INTO user_settings (user_id, display_name) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
        [uid, profile]
      );
    }
  });

  const settings = await stats.getSettings(uid);
  res.json({ message: 'Import complete.', imported: txs.length, displayName: settings.displayName });
}));

module.exports = router;
