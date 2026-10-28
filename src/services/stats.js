// Shared aggregate queries used by the dashboard, budgets and reports routes.
// Every query is parameterised and scoped to a single user_id.
const { pool } = require('../config/db');
const { EXPENSE_CATEGORIES, INCOME_SOURCES, DEFAULT_MONTHLY_BUDGET } = require('../constants');
const { round2 } = require('../utils/validate');
const { monthRange, lastNMonths } = require('../utils/dates');

async function getTotals(userId) {
  const [rows] = await pool.execute(
    'SELECT type, COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? GROUP BY type',
    [userId]
  );
  let income = 0;
  let expense = 0;
  rows.forEach((r) => { if (r.type === 'income') income = Number(r.total); else expense = Number(r.total); });
  income = round2(income);
  expense = round2(expense);
  return { income, expense, balance: round2(income - expense) };
}

// { Food: 12.5, Transport: 0, ... } for every expense category (all-time)
async function getCategorySpend(userId) {
  const [rows] = await pool.execute(
    "SELECT category, SUM(amount) AS total FROM transactions WHERE user_id = ? AND type = 'expense' GROUP BY category",
    [userId]
  );
  const out = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  rows.forEach((r) => { if (r.category in out) out[r.category] = round2(Number(r.total)); });
  return out;
}

async function getIncomeBySource(userId) {
  const [rows] = await pool.execute(
    "SELECT category, SUM(amount) AS total FROM transactions WHERE user_id = ? AND type = 'income' GROUP BY category",
    [userId]
  );
  const out = Object.fromEntries(INCOME_SOURCES.map((c) => [c, 0]));
  rows.forEach((r) => { if (r.category in out) out[r.category] = round2(Number(r.total)); });
  return out;
}

async function getMonthSpend(userId, month) {
  const { start, end } = monthRange(month);
  const [rows] = await pool.execute(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND type = 'expense' AND txn_date >= ? AND txn_date < ?",
    [userId, start, end]
  );
  return round2(Number(rows[0].total));
}

async function getSettings(userId) {
  const [rows] = await pool.execute(
    'SELECT display_name, monthly_budget FROM user_settings WHERE user_id = ?',
    [userId]
  );
  if (rows.length === 0) return { displayName: '', monthlyBudget: DEFAULT_MONTHLY_BUDGET };
  return { displayName: rows[0].display_name, monthlyBudget: Number(rows[0].monthly_budget) };
}

// { Food: 100, ... } - categories without a row default to 0
async function getCategoryLimits(userId) {
  const [rows] = await pool.execute('SELECT category, limit_amount FROM budgets WHERE user_id = ?', [userId]);
  const out = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  rows.forEach((r) => { if (r.category in out) out[r.category] = Number(r.limit_amount); });
  return out;
}

// Expense per month for the last n months (oldest first), zero-filled
async function getExpenseTrend(userId, month, n = 6) {
  const months = lastNMonths(n, month);
  const { start } = monthRange(months[0]);
  const { end } = monthRange(months[months.length - 1]);
  const [rows] = await pool.execute(
    "SELECT DATE_FORMAT(txn_date, '%Y-%m') AS ym, SUM(amount) AS total FROM transactions WHERE user_id = ? AND type = 'expense' AND txn_date >= ? AND txn_date < ? GROUP BY ym",
    [userId, start, end]
  );
  const byMonth = Object.fromEntries(rows.map((r) => [r.ym, round2(Number(r.total))]));
  return months.map((m) => ({ month: m, expense: byMonth[m] || 0 }));
}

module.exports = {
  getTotals, getCategorySpend, getIncomeBySource, getMonthSpend, getSettings, getCategoryLimits, getExpenseTrend,
};
