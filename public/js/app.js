'use strict';

// Budget Manager frontend. All data lives in MySQL behind the REST API; the only thing
// kept in the browser is the JWT (so a page refresh keeps you logged in).

const CATEGORIES = ['Food','Transport','Shopping','Education','Entertainment','Bills','Healthcare','Other'];
const INCOME_SOURCES = ['Salary','Allowance','Gift','Freelance','Other'];
// Same-origin by default (Express serves this page). To host the frontend elsewhere,
// set window.BUDGET_API_BASE = 'http://localhost:3000/api' before this script loads.
const API_BASE = window.BUDGET_API_BASE || '/api';
const TOKEN_KEY = 'budget-manager-token';

let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
let data = { transactions: [], profile: '' };
let dash = null, budgetInfo = null, reportInfo = null;   // server-calculated figures
let selectedType = 'expense', currentUser = null;
const $ = id => document.getElementById(id);

function setToken(t) {
  token = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}
function resetState() {
  data = { transactions: [], profile: '' };
  dash = budgetInfo = reportInfo = null;
}
function pad(n) { return String(n).padStart(2, '0'); }
function localDate() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localMonth() { return localDate().slice(0, 7); }

// ---- API helper ----
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  let payload = null;
  try { payload = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (res.status === 401 && token) handleSessionExpired();
    throw new Error((payload && payload.error && payload.error.message) || `Request failed (${res.status})`);
  }
  return payload;
}

function handleSessionExpired() {
  setToken(null); currentUser = null; resetState();
  $('appRoot').style.display = 'none'; $('authScreen').style.display = '';
  $('authError').textContent = 'Session expired. Please log in again.';
}

// ---- auth ----
let authMode = 'login';
$('authToggle').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  $('authTitle').textContent = authMode === 'login' ? 'Welcome back' : 'Create an account';
  $('authSub').textContent = authMode === 'login' ? 'Log in to your budget manager.' : 'Set a username and password.';
  $('authSubmit').textContent = authMode === 'login' ? 'Log in' : 'Register';
  $('authToggle').textContent = authMode === 'login' ? 'Register' : 'Log in instead';
  $('authToggle').previousSibling.textContent = authMode === 'login' ? 'No account? ' : 'Have an account? ';
  $('authError').textContent = '';
});
$('authSubmit').addEventListener('click', async () => {
  const u = $('authUser').value.trim(), p = $('authPass').value;
  if (!u || !p) { $('authError').textContent = 'Enter a username and password.'; return; }
  const btn = $('authSubmit'); btn.disabled = true; $('authError').textContent = '';
  try {
    const res = await api(authMode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body: { username: u, password: p } });
    setToken(res.token);
    await startSession(res.user);
  } catch (err) {
    $('authError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

async function startSession(user) {
  currentUser = user.username;
  const prof = await api('/profile');
  data.profile = prof.displayName || '';
  await loadAll();
  $('authScreen').style.display = 'none'; $('appRoot').style.display = '';
  $('profileUserOut').textContent = currentUser;
  $('profileName').value = data.profile;
  $('date').value = localDate();
  fillCategorySelect();
  renderAll();
}
$('logoutBtn').addEventListener('click', async () => {
  try { await fetch(API_BASE + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch (e) {}
  setToken(null); currentUser = null; resetState();
  $('appRoot').style.display = 'none'; $('authScreen').style.display = '';
  $('authUser').value = ''; $('authPass').value = ''; $('authError').textContent = '';
});
$('changePassBtn').addEventListener('click', async () => {
  const np = $('newPass').value; const el = $('profileStatus');
  if (!np) { el.style.color = 'var(--expense)'; el.textContent = 'Enter a new password.'; return; }
  try {
    const res = await api('/profile/password', { method: 'PUT', body: { newPassword: np } });
    setToken(res.token); // the server revoked the old token, so keep the fresh one
    $('newPass').value = ''; el.style.color = 'var(--income)'; el.textContent = 'Password updated.';
  } catch (err) {
    el.style.color = 'var(--expense)'; el.textContent = err.message;
  }
  setTimeout(() => { el.textContent = ''; }, 2200);
});

// ---- helpers ----
function fmt(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function showStatus(msg, err) {
  const el = $('statusMsg'); el.textContent = msg; el.style.color = err ? 'var(--expense)' : 'var(--income)';
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, err ? 5000 : 2200);
}
// The status line lives on the Ledger tab; if that tab isn't showing, make sure the error is still seen.
function reportError(err) {
  showStatus(err.message, true);
  if ($('statusMsg').offsetParent === null) alert(err.message);
}

// ---- data loading (everything below is calculated by the API) ----
async function loadAll() {
  const month = localMonth();
  const [tx, d, b, r] = await Promise.all([
    api('/transactions'),
    api('/dashboard?month=' + month),
    api('/budgets?month=' + month),
    api('/reports?month=' + month),
  ]);
  data.transactions = tx.transactions; dash = d; budgetInfo = b; reportInfo = r;
}
async function refreshAll() {
  try { await loadAll(); renderAll(); } catch (err) { if (err.message) reportError(err); }
}

// ---- tabs ----
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.tabpage').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); $('tab-' + b.dataset.tab).classList.add('on');
}));

// ---- profile ----
$('profileName').addEventListener('change', async () => {
  try {
    const res = await api('/profile', { method: 'PUT', body: { displayName: $('profileName').value.trim() } });
    data.profile = res.displayName;
  } catch (err) {
    $('profileName').value = data.profile; reportError(err);
  }
});

// ---- entry type ----
$('typeExp').addEventListener('click', () => setType('expense'));
$('typeInc').addEventListener('click', () => setType('income'));
function setType(t) {
  selectedType = t;
  $('typeExp').classList.toggle('sel', t === 'expense'); $('typeInc').classList.toggle('sel', t === 'income');
  $('catLabel').textContent = t === 'income' ? 'Source' : 'Category';
  $('descLabel').textContent = t === 'income' ? 'Description' : 'Description';
  fillCategorySelect();
}
function fillCategorySelect() {
  const sel = $('category'); sel.innerHTML = '';
  const opts = selectedType === 'income' ? INCOME_SOURCES : CATEGORIES;
  opts.forEach(c => { const o = document.createElement('option'); o.textContent = c; sel.appendChild(o); });
}

$('addBtn').addEventListener('click', async () => {
  const desc = $('desc').value.trim(), amt = parseFloat($('amount').value), cat = $('category').value, date = $('date').value || localDate();
  if (!desc || isNaN(amt) || amt <= 0) { showStatus('Enter a description and a positive amount.', true); return; }
  const btn = $('addBtn'); btn.disabled = true;
  try {
    await api('/transactions', { method: 'POST', body: { type: selectedType, description: desc, amount: Math.round(amt * 100) / 100, category: cat, date } });
    $('desc').value = ''; $('amount').value = ''; showStatus('Added to ledger.', false);
    await refreshAll();
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

async function deleteTx(id) {
  try { await api('/transactions/' + id, { method: 'DELETE' }); } catch (err) { reportError(err); }
  await refreshAll();
}

// ---- render: summary cards ----
function renderSummary() {
  if (!dash) return;
  const t = dash.totals;
  $('summaryCards').innerHTML = `
    <div class="stat income"><div class="l">Total income</div><div class="v">${fmt(t.income)}</div></div>
    <div class="stat expense"><div class="l">Total expenses</div><div class="v">${fmt(t.expense)}</div></div>
    <div class="stat"><div class="l">Remaining</div><div class="v">${fmt(t.balance)}</div></div>
    <div class="stat"><div class="l">Monthly budget</div><div class="v">${fmt(dash.monthlyBudget)}</div></div>
    <div class="stat income"><div class="l">Savings</div><div class="v">${dash.savingsPct.toFixed(0)}%</div></div>`;
}

// ---- render: ledger ----
function renderLedger() {
  const list = $('ledgerList'); $('entryCount').textContent = data.transactions.length;
  if (data.transactions.length === 0) { list.innerHTML = '<div class="empty-note">No entries yet.</div>'; return; }
  list.innerHTML = '';
  data.transactions.forEach(t => {
    const row = document.createElement('div'); row.className = 'entry';
    row.innerHTML = `<span class="date">${esc(t.date)}</span><span class="desc">${esc(t.description)}<span class="cat">${esc(t.category)}</span></span>
      <span class="amt ${t.type === 'income' ? 'inc' : 'exp'}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</span>
      <button class="del" data-id="${t.id}">✕</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => deleteTx(parseInt(b.dataset.id, 10))));
}

// ---- render: budgets ----
function renderBudgets() {
  if (!budgetInfo) return;
  const monthly = budgetInfo.monthlyBudget, spentM = budgetInfo.monthSpend;
  $('monthlyBudget').value = monthly;
  const pctM = monthly > 0 ? Math.min(100, (spentM / monthly) * 100) : 0;
  $('monthlyNums').textContent = `${fmt(spentM)} / ${fmt(monthly)}`;
  const fill = $('monthlyFill'); fill.style.width = pctM + '%'; fill.className = 'bud-fill' + (spentM > monthly ? ' over' : '');

  const bl = $('budgetList'); bl.innerHTML = '';
  budgetInfo.categories.forEach(({ category: cat, limit, spent }) => {
    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0, over = limit > 0 && spent > limit;
    const row = document.createElement('div'); row.className = 'bud-row';
    row.innerHTML = `<div class="bud-head"><span>${esc(cat)}</span><span class="nums">${fmt(spent)} / <input type="text" inputmode="decimal" class="bud-limit-input" data-cat="${esc(cat)}" value="${limit}"></span></div>
      <div class="bud-track"><div class="bud-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>`;
    bl.appendChild(row);
  });
  bl.querySelectorAll('.bud-limit-input').forEach(inp => inp.addEventListener('change', async () => {
    const v = parseFloat(inp.value);
    try {
      await api('/budgets/categories/' + encodeURIComponent(inp.dataset.cat), { method: 'PUT', body: { limit: isNaN(v) ? 0 : v } });
    } catch (err) { reportError(err); }
    await refreshAll();
  }));
}
$('monthlyBudget').addEventListener('change', async () => {
  const v = parseFloat($('monthlyBudget').value);
  try {
    await api('/budgets/monthly', { method: 'PUT', body: { amount: isNaN(v) ? 0 : v } });
  } catch (err) { reportError(err); }
  await refreshAll();
});

// ---- render: reports ----
function renderReports() {
  if (!reportInfo) return;
  $('catTable').innerHTML = reportInfo.categoryExpenses.map(r => `<tr><td>${esc(r.category)}</td><td class="num">${fmt(r.spent)}</td></tr>`).join('');
  const s = reportInfo.summary;
  $('summaryTable').innerHTML = `
    <tr><td>Income vs expenditure</td><td class="num">${fmt(s.income)} / ${fmt(s.expense)}</td></tr>
    <tr><td>Highest spending category</td><td class="num">${s.highestCategory ? esc(s.highestCategory) : '—'}</td></tr>
    <tr><td>Savings percentage</td><td class="num">${s.savingsPct.toFixed(1)}%</td></tr>`;
  renderTrend();
}

// ---- charts (inline SVG) ----
const svgNS = 'http://www.w3.org/2000/svg';
function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
function renderBar() {
  if (!dash) return;
  const svg = $('barChart'); clearSvg(svg); const t = dash.totals; const max = Math.max(t.income, t.expense, 1);
  const bars = [{ l: 'Income', v: t.income, c: 'var(--income)' }, { l: 'Expenses', v: t.expense, c: 'var(--expense)' }];
  bars.forEach((b, i) => {
    const h = (b.v / max) * 110, x = 40 + i * 100;
    const r = document.createElementNS(svgNS, 'rect'); r.setAttribute('x', x); r.setAttribute('y', 130 - h); r.setAttribute('width', 60); r.setAttribute('height', h); r.setAttribute('fill', b.c); svg.appendChild(r);
    const t1 = document.createElementNS(svgNS, 'text'); t1.setAttribute('x', x + 30); t1.setAttribute('y', 145); t1.setAttribute('text-anchor', 'middle'); t1.setAttribute('font-size', '11'); t1.setAttribute('fill', 'var(--ink-soft)'); t1.textContent = b.l; svg.appendChild(t1);
    const t2 = document.createElementNS(svgNS, 'text'); t2.setAttribute('x', x + 30); t2.setAttribute('y', 124 - h); t2.setAttribute('text-anchor', 'middle'); t2.setAttribute('font-size', '11'); t2.setAttribute('fill', 'var(--ink)'); t2.textContent = fmt(b.v); svg.appendChild(t2);
  });
}
function renderPie() {
  if (!dash) return;
  const svg = $('pieChart'); clearSvg(svg); const rows = CATEGORIES.map(c => ({ c, s: dash.categorySpend[c] || 0 })).filter(r => r.s > 0);
  const cx = 80, cy = 80, r = 70; const total = rows.reduce((s, x) => s + x.s, 0);
  const colors = ['#3F7150', '#A6432D', '#C9972B', '#5D7B99', '#8A5A8C', '#B98C4A', '#4F9C9E', '#726B57'];
  let leg = ''; if (total === 0) { const t = document.createElementNS(svgNS, 'text'); t.setAttribute('x', cx); t.setAttribute('y', cy); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '11'); t.setAttribute('fill', 'var(--ink-soft)'); t.textContent = 'No expenses yet'; svg.appendChild(t); $('pieLegend').innerHTML = ''; return; }
  let ang = -Math.PI / 2;
  rows.forEach((row, i) => {
    const frac = row.s / total, a2 = ang + frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('d', `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`); path.setAttribute('fill', colors[i % colors.length]); svg.appendChild(path);
    leg += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="width:9px;height:9px;background:${colors[i % colors.length]};display:inline-block;border-radius:2px;"></span>${esc(row.c)} — ${fmt(row.s)}</div>`;
    ang = a2;
  });
  $('pieLegend').innerHTML = leg;
}
function renderTrend() {
  if (!reportInfo) return;
  const svg = $('trendChart'); clearSvg(svg);
  const months = reportInfo.trend.map(p => p.month), vals = reportInfo.trend.map(p => p.expense);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [60 + i * 95, 140 - (v / max) * 110]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  const line = document.createElementNS(svgNS, 'path'); line.setAttribute('d', path); line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'var(--accent)'); line.setAttribute('stroke-width', '2'); svg.appendChild(line);
  pts.forEach((p, i) => {
    const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', '3'); c.setAttribute('fill', 'var(--expense)'); svg.appendChild(c);
    const lab = document.createElementNS(svgNS, 'text'); lab.setAttribute('x', p[0]); lab.setAttribute('y', 155); lab.setAttribute('text-anchor', 'middle'); lab.setAttribute('font-size', '10'); lab.setAttribute('fill', 'var(--ink-soft)'); lab.textContent = months[i].slice(5); svg.appendChild(lab);
  });
}

// ---- import/export (served by /api/data) ----
$('exportBtn').addEventListener('click', async () => {
  try {
    const payload = await api('/data/export');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'budget-manager.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); showStatus('Exported budget-manager.json', false);
  } catch (err) { showStatus(err.message, true); }
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (err) { showStatus("That file isn't a valid budget JSON.", true); return; }
    try {
      const res = await api('/data/import', { method: 'POST', body: parsed });
      if (typeof res.displayName === 'string') { data.profile = res.displayName; $('profileName').value = res.displayName; }
      await refreshAll();
      showStatus('Imported ' + file.name, false);
    } catch (err) { showStatus(err.message || "That file isn't a valid budget JSON.", true); }
  };
  reader.readAsText(file); e.target.value = '';
});

function renderAll() { renderSummary(); renderLedger(); renderBudgets(); renderReports(); renderBar(); renderPie(); }

// ---- init: restore the session if a valid token is stored ----
fillCategorySelect();
if (token) {
  (async () => {
    try {
      const res = await api('/auth/me');
      await startSession(res.user);
    } catch (err) {
      $('authError').textContent = err.message;
    }
  })();
}
