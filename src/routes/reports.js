const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');
const { EXPENSE_CATEGORIES, INCOME_SOURCES } = require('../constants');
const stats = require('../services/stats');

const router = express.Router();

// GET /api/reports?month=YYYY-MM  - category table, summary figures and 6-month expense trend
router.get('/', asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const month = v.validateMonth(req.query.month);
  const [totals, spend, incomeBySource, trend] = await Promise.all([
    stats.getTotals(uid), stats.getCategorySpend(uid), stats.getIncomeBySource(uid), stats.getExpenseTrend(uid, month, 6),
  ]);

  // Array.sort is stable, so ties keep the original category order
  const categoryExpenses = EXPENSE_CATEGORIES.map((c) => ({ category: c, spent: spend[c] })).sort((a, b) => b.spent - a.spent);
  const savingsPct = totals.income > 0 ? ((totals.income - totals.expense) / totals.income) * 100 : 0;

  res.json({
    month,
    categoryExpenses,
    incomeBySource: INCOME_SOURCES.map((s) => ({ source: s, total: incomeBySource[s] })).filter((r) => r.total > 0),
    summary: {
      income: totals.income,
      expense: totals.expense,
      highestCategory: categoryExpenses[0] && categoryExpenses[0].spent > 0 ? categoryExpenses[0].category : null,
      savingsPct: v.round2(savingsPct),
    },
    trend,
  });
}));

module.exports = router;
