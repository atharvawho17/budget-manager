const pad = (n) => String(n).padStart(2, '0');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function currentMonth() { return today().slice(0, 7); }

function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}
// [start, end) range of dates covering the month, as 'YYYY-MM-DD'
function monthRange(ym) { return { start: `${ym}-01`, end: `${addMonths(ym, 1)}-01` }; }
// Oldest-first list of the last n months ending at ym
function lastNMonths(n, ym = currentMonth()) {
  return Array.from({ length: n }, (_, i) => addMonths(ym, i - (n - 1)));
}

module.exports = { today, currentMonth, addMonths, monthRange, lastNMonths };
