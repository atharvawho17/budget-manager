const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');
const stats = require('../services/stats');

const router = express.Router();

// GET /api/dashboard?month=YYYY-MM
router.get('/', asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const month = v.validateMonth(req.query.month);
  const [totals, categorySpend, monthSpend, settings] = await Promise.all([
    stats.getTotals(uid), stats.getCategorySpend(uid), stats.getMonthSpend(uid, month), stats.getSettings(uid),
  ]);
  const savingsPct = totals.income > 0 ? Math.max(0, ((totals.income - totals.expense) / totals.income) * 100) : 0;
  res.json({
    month,
    totals,
    savingsPct: v.round2(savingsPct),
    monthlyBudget: settings.monthlyBudget,
    monthSpend,
    monthlyBudgetRemaining: v.round2(settings.monthlyBudget - monthSpend),
    categorySpend,
  });
}));

module.exports = router;
