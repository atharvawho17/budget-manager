const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');
const { EXPENSE_CATEGORIES } = require('../constants');
const stats = require('../services/stats');

const router = express.Router();

// GET /api/budgets?month=YYYY-MM
// monthSpend is for the chosen month; each category's `spent` is the all-time total
// for that category (this matches how the original localStorage app behaved).
router.get('/', asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const month = v.validateMonth(req.query.month);
  const [settings, limits, spend, monthSpend] = await Promise.all([
    stats.getSettings(uid), stats.getCategoryLimits(uid), stats.getCategorySpend(uid), stats.getMonthSpend(uid, month),
  ]);
  res.json({
    month,
    monthlyBudget: settings.monthlyBudget,
    monthSpend,
    categories: EXPENSE_CATEGORIES.map((c) => ({ category: c, limit: limits[c], spent: spend[c] })),
  });
}));

// PUT /api/budgets/monthly  { amount }
router.put('/monthly', asyncHandler(async (req, res) => {
  const body = v.requireObject(req.body);
  const amount = v.validateAmount(body.amount, 'Monthly budget', { allowZero: true });
  await pool.execute(
    `INSERT INTO user_settings (user_id, monthly_budget) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE monthly_budget = VALUES(monthly_budget)`,
    [req.user.id, amount]
  );
  res.json({ monthlyBudget: amount });
}));

// PUT /api/budgets/categories/:category  { limit }
router.put('/categories/:category', asyncHandler(async (req, res) => {
  const category = v.validateExpenseCategory(req.params.category);
  const body = v.requireObject(req.body);
  const limit = v.validateAmount(body.limit, 'Budget limit', { allowZero: true });
  await pool.execute(
    `INSERT INTO budgets (user_id, category, limit_amount) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)`,
    [req.user.id, category, limit]
  );
  res.json({ category, limit });
}));

module.exports = router;
