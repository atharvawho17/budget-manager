const { HttpError } = require('./httpError');
const { EXPENSE_CATEGORIES, INCOME_SOURCES, MAX_AMOUNT } = require('../constants');
const { currentMonth } = require('./dates');

const bad = (msg) => { throw new HttpError(400, msg); };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Request body must be a JSON object.');
  return body;
}

function validateText(val, label, max, { allowEmpty = false } = {}) {
  if (typeof val !== 'string') bad(`${label} must be text.`);
  const s = val.trim();
  if (!allowEmpty && s.length === 0) bad(`${label} is required.`);
  if (s.length > max) bad(`${label} must be at most ${max} characters.`);
  return s;
}

function validateUsername(val) {
  if (typeof val !== 'string' || !/^[A-Za-z0-9_.-]{3,30}$/.test(val.trim())) {
    bad('Username must be 3-30 characters: letters, numbers, dot, dash or underscore.');
  }
  return val.trim();
}

function validatePassword(val) {
  if (typeof val !== 'string') bad('Password is required.');
  if (val.length < 6) bad('Password must be at least 6 characters.');
  if (Buffer.byteLength(val, 'utf8') > 72) bad('Password is too long (max 72 bytes).');
  return val;
}

function validateAmount(val, label = 'Amount', { allowZero = false } = {}) {
  let n;
  if (typeof val === 'number') n = val;
  else if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val.trim())) n = Number(val.trim());
  else bad(`${label} must be a number.`);
  if (!Number.isFinite(n)) bad(`${label} must be a number.`);
  if (n < 0 || (!allowZero && n <= 0)) bad(`${label} must be ${allowZero ? '0 or more' : 'greater than 0'}.`);
  if (n > MAX_AMOUNT) bad(`${label} is too large.`);
  const r = round2(n);
  if (!allowZero && r <= 0) bad(`${label} must be at least 0.01.`);
  return r;
}

function validateDate(val, label = 'Date') {
  if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) bad(`${label} must be in YYYY-MM-DD format.`);
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    bad(`${label} is not a valid date.`);
  }
  return val;
}

function validateMonth(val) {
  if (val === undefined || val === '') return currentMonth();
  if (typeof val !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(val)) bad('Month must be in YYYY-MM format.');
  return val;
}

function validateInt(val, label, min, max) {
  if (!/^\d+$/.test(String(val))) bad(`${label} must be a whole number.`);
  const n = Number(val);
  if (n < min || n > max) bad(`${label} must be between ${min} and ${max}.`);
  return n;
}

function validateId(val) {
  if (!/^\d+$/.test(String(val)) || !Number.isSafeInteger(Number(val))) bad('Invalid id.');
  return Number(val);
}

function validateType(val) {
  if (val !== 'income' && val !== 'expense') bad('Type must be "income" or "expense".');
  return val;
}

function validateCategory(type, val) {
  const list = type === 'income' ? INCOME_SOURCES : EXPENSE_CATEGORIES;
  if (typeof val !== 'string' || !list.includes(val)) bad(`Category must be one of: ${list.join(', ')}.`);
  return val;
}

function validateExpenseCategory(val) {
  return validateCategory('expense', val);
}

module.exports = {
  round2, requireObject, validateText, validateUsername, validatePassword, validateAmount,
  validateDate, validateMonth, validateInt, validateId, validateType, validateCategory, validateExpenseCategory,
};
