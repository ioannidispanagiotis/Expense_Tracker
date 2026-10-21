(function () {
'use strict';

var KEY = 'mny.v2';
var OLD_KEY = 'mny.v1';
var DAY = 864e5;

/* ---------- data ---------- */
function defaultAccount(name) {
  return {
    name: name,
    opening: 0,
    entries: [],
    cats: {
      expense: ['Food', 'Groceries', 'Rent/Bills', 'Transport', 'Health', 'Entertainment', 'Shopping', 'Other'],
      income: ['Salary', 'Freelance', 'Other']
    },
    pays: ['Cash', 'Card', 'Bank transfer', 'Other'],
    budgets: {}
  };
}
function defaults() {
  return {
    v: 2,
    accounts: [defaultAccount('Account 1'), defaultAccount('Account 2')],
    settings: { monthStart: 1, theme: 'dark' }
  };
}
function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
function isStr(s) { return typeof s === 'string'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function sanitizeAccount(raw, defName) {
  var a = defaultAccount(defName);
  if (!raw || typeof raw !== 'object') return a;
  if (isStr(raw.name) && raw.name.trim()) a.name = raw.name.trim().slice(0, 20);
  if (isInt(raw.opening)) a.opening = raw.opening;
  if (raw.cats && typeof raw.cats === 'object') {
    ['expense', 'income'].forEach(function (t) {
      if (Array.isArray(raw.cats[t])) {
        var l = raw.cats[t].filter(function (x) { return isStr(x) && x.trim(); }).slice(0, 50);
        if (l.length) a.cats[t] = l;
      }
    });
  }
  if (Array.isArray(raw.pays)) {
    var p = raw.pays.filter(function (x) { return isStr(x) && x.trim(); }).slice(0, 20);
    if (p.length) a.pays = p;
  }
  if (raw.budgets && typeof raw.budgets === 'object') {
    Object.keys(raw.budgets).forEach(function (k) {
      if (isInt(raw.budgets[k]) && raw.budgets[k] > 0) a.budgets[k] = raw.budgets[k];
    });
  }
  if (Array.isArray(raw.entries)) {
    raw.entries.forEach(function (e) {
      if (!e || (e.type !== 'income' && e.type !== 'expense')) return;
      if (!isInt(e.amount) || e.amount <= 0) return;
      var ts = +e.ts;
      if (!isFinite(ts)) return;
      a.entries.push({
        id: isStr(e.id) && e.id ? e.id : uid(),
        type: e.type, amount: e.amount,
        cat: isStr(e.cat) && e.cat ? e.cat : 'Other',
        pay: isStr(e.pay) ? e.pay : '',
        note: isStr(e.note) ? e.note : '',
        ts: ts
      });
    });
  }
  return a;
}

function sanitizeSettings(s, d) {
  s = s && typeof s === 'object' ? s : {};
  if (isInt(s.monthStart) && s.monthStart >= 1 && s.monthStart <= 28) d.monthStart = s.monthStart;
  if (s.theme === 'light' || s.theme === 'dark') d.theme = s.theme;
}

/* accepts the new two-account format and the old single-account format */
function sanitize(raw) {
  var d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  if (Array.isArray(raw.accounts)) {
    d.accounts = [sanitizeAccount(raw.accounts[0], 'Account 1'), sanitizeAccount(raw.accounts[1], 'Account 2')];
    sanitizeSettings(raw.settings, d.settings);
    return d;
  }
  if (Array.isArray(raw.entries)) {
    var s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    d.accounts[0] = sanitizeAccount({
      entries: raw.entries, opening: s.opening, cats: s.cats, pays: s.pays, budgets: s.budgets
    }, 'Account 1');
    sanitizeSettings(s, d.settings);
  }
  return d;
}

var db;
function load() {
  var raw = null, migrated = false;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw === null) {
    try { raw = localStorage.getItem(OLD_KEY); migrated = raw !== null; } catch (e) {}
  }
  try { db = sanitize(JSON.parse(raw)); } catch (e) { db = defaults(); }
  if (migrated) save(); // old key is left untouched as a safety copy
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('Could not save: storage full or blocked'); return false; }
}
function S() { return db.settings; }

/* ---------- ui state ---------- */
var ui = { tab: 'add', offset: 0, filter: 'all', acct: 0 };
var drafts = { add: [null, null], edit: null };
function A() { return db.accounts[ui.acct]; }

/* ---------- money & dates ---------- */
var nf = null;
try { nf = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }); } catch (e) {}
function fmt(c) { var v = c / 100; return nf ? nf.format(v) : (v < 0 ? '-' : '') + '€' + Math.abs(v).toFixed(2); }
function signed(e) { return (e.type === 'income' ? '+' : '−') + fmt(e.amount); }
function parseMoney(s, allowNeg) {
  s = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return NaN;
  if (!allowNeg && s.charAt(0) === '-') return NaN;
  var n = Math.round(parseFloat(s) * 100);
  return Math.abs(n) > 1e11 ? NaN : n;
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function toLocalInput(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtDay(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

/* period = month starting on settings.monthStart (shared by both accounts) */
function range(offset) {
  var st = S().monthStart, now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  if (now.getDate() < st) m--;
  var start = new Date(y, m + offset, st);
  var end = new Date(y, m + offset + 1, st);
  var label = st === 1
    ? start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : fmtDay(start) + ' – ' + fmtDay(new Date(end.getTime() - DAY)) + ' ' + end.getFullYear();
  return { start: start.getTime(), end: end.getTime(), label: label, startDate: start };
}
function inRange(r) {
  return A().entries.filter(function (e) { return e.ts >= r.start && e.ts < r.end; });
}
function totals(list) {
  var i = 0, x = 0;
  list.forEach(function (e) { if (e.type === 'income') i += e.amount; else x += e.amount; });
  return { inc: i, exp: x, net: i - x };
}
function balanceOf(acct) { return acct.opening + totals(acct.entries).net; }
function sortedDesc(list) { return list.slice().sort(function (a, b) { return b.ts - a.ts; }); }

function newDraft(prev) {
  var t = prev ? prev.type : 'expense';
  var pays = A().pays;
  return {
    type: t,
    amount: '',
    cat: A().cats[t][0],
    pay: prev && pays.indexOf(prev.pay) >= 0 ? prev.pay : pays[0],
    note: '',
    when: toLocalInput(Date.now())
  };
}
function D(scope) {
  if (scope === 'edit') return drafts.edit;
  if (!drafts.add[ui.acct]) drafts.add[ui.acct] = newDraft();
  return drafts.add[ui.acct];
}

var $ = function (s) { return document.querySelector(s); };

function applyTheme() {
  document.documentElement.setAttribute('data-theme', S().theme);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', S().theme === 'light' ? '#f3f4f7' : '#0f1115');
}

var toastTimer;
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
}

/* ---------- views ---------- */
function acctBar() {
  return '<div class="acct">' + db.accounts.map(function (a, i) {
    return '<button class="' + (i === ui.acct ? 'on' : '') + '" data-act="acct" data-v="' + i + '">' + esc(a.name) + '</button>';
  }).join('') + '</div>';
}

function formHTML(d, scope) {
  var a = A();
  var cats = a.cats[d.type].slice();
  if (d.cat && cats.indexOf(d.cat) < 0) cats.push(d.cat);
  var pays = a.pays.slice();
  if (d.pay && pays.indexOf(d.pay) < 0) pays.push(d.pay);
  var h = '<div class="seg">' + ['expense', 'income'].map(function (t) {
    return '<button class="' + (d.type === t ? 'on ' + t : '') + '" data-act="type" data-scope="' + scope + '" data-v="' + t + '">' +
      (t === 'expense' ? 'Expense' : 'Income') + '</button>';
  }).join('') + '</div>';
  h += '<label class="fld"><span>Amount (€)</span><input class="amt" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' +
    esc(d.amount) + '" data-field="amount" data-scope="' + scope + '"></label>';
  h += '<div class="fld"><span>Category</span><div class="chips">' + cats.map(function (c) {
    return '<button class="chip' + (d.cat === c ? ' on' : '') + '" data-act="cat" data-scope="' + scope + '" data-v="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('') + '</div></div>';
  h += '<div class="fld"><span>Payment method</span><div class="chips">' + pays.map(function (c) {
    return '<button class="chip' + (d.pay === c ? ' on' : '') + '" data-act="pay" data-scope="' + scope + '" data-v="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('') + '</div></div>';
  h += '<label class="fld"><span>Note (optional)</span><input type="text" maxlength="200" placeholder="e.g. lunch with Nick" value="' +
    esc(d.note) + '" data-field="note" data-scope="' + scope + '"></label>';
  h += '<label class="fld"><span>Date &amp; time</span><input type="datetime-local" value="' + esc(d.when) + '" data-field="when" data-scope="' + scope + '"></label>';
  return h;
}

function rowHTML(e, showDate) {
  var sub = [e.pay, e.note].filter(Boolean).join(' · ');
  if (showDate) sub = new Date(e.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (sub ? ' · ' + sub : '');
  else sub = new Date(e.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + (sub ? ' · ' + sub : '');
  return '<button class="hrow" data-act="open" data-id="' + esc(e.id) + '"><div class="m"><div class="c">' + esc(e.cat) +
    '</div><div class="n">' + esc(sub) + '</div></div><div class="a ' + (e.type === 'income' ? 'inc' : 'exp') + '">' + signed(e) + '</div></button>';
}

function addView() {
  var d = D('add'), a = A();
  var r = range(0), t = totals(inRange(r)), bal = balanceOf(a);
  var all = balanceOf(db.accounts[0]) + balanceOf(db.accounts[1]);
  var h = '<h1>Add</h1>' + acctBar();
  h += '<div class="card"><div class="lbl">' + esc(a.name) + ' balance</div><div class="big ' + (bal < 0 ? 'exp' : '') + '">' + fmt(bal) + '</div>' +
    '<div class="sub">' + esc(r.label) + ': <span class="inc">+' + fmt(t.inc) + '</span> · <span class="exp">−' + fmt(t.exp) + '</span></div>' +
    '<div class="sub" data-total="1">Both accounts: ' + fmt(all) + '</div></div>';
  h += '<div class="card">' + formHTML(d, 'add') + '<button class="btn" data-act="save" data-scope="add">Save entry</button></div>';
  var recent = sortedDesc(a.entries).slice(0, 5);
  if (recent.length) {
    h += '<h2>Recent</h2>' + recent.map(function (e) { return rowHTML(e, true); }).join('');
  }
  return h;
}

function navHTML(r) {
  return '<div class="nav2"><button data-act="prev" aria-label="Previous period">‹</button><div class="t">' + esc(r.label) +
    '</div><button data-act="next" aria-label="Next period"' + (ui.offset >= 0 ? ' disabled' : '') + '>›</button></div>';
}

function historyView() {
  var r = range(ui.offset), list = inRange(r), t = totals(list);
  var h = '<h1>History</h1>' + acctBar() + navHTML(r);
  h += '<div class="sum"><div><div class="lbl">Income</div><div class="v inc">' + fmt(t.inc) + '</div></div>' +
    '<div><div class="lbl">Expenses</div><div class="v exp">' + fmt(t.exp) + '</div></div>' +
    '<div><div class="lbl">Net</div><div class="v ' + (t.net < 0 ? 'exp' : 'inc') + '">' + fmt(t.net) + '</div></div></div>';
  h += '<div class="seg">' + [['all', 'All'], ['expense', 'Expenses'], ['income', 'Income']].map(function (f) {
    return '<button class="' + (ui.filter === f[0] ? 'on' : '') + '" data-act="filter" data-v="' + f[0] + '">' + f[1] + '</button>';
  }).join('') + '</div>';
  if (ui.filter !== 'all') list = list.filter(function (e) { return e.type === ui.filter; });
  list = sortedDesc(list);
  if (!list.length) return h + '<div class="empty">No entries in this period.</div>';
  var groups = [], map = {};
  list.forEach(function (e) {
    var k = new Date(e.ts).toDateString();
    if (!map[k]) { map[k] = { ts: e.ts, items: [] }; groups.push(map[k]); }
    map[k].items.push(e);
  });
  groups.forEach(function (g) {
    var gt = totals(g.items);
    h += '<div class="day"><span>' + esc(new Date(g.ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })) +
      '</span><span>' + (gt.net < 0 ? '−' : '+') + fmt(Math.abs(gt.net)) + '</span></div>';
    h += g.items.map(function (e) { return rowHTML(e, false); }).join('');
  });
  return h;
}

function dailyChart(list, r) {
  var n = Math.max(1, Math.round((r.end - r.start) / DAY)), vals = [], i;
  for (i = 0; i < n; i++) vals.push(0);
  list.forEach(function (e) {
    if (e.type !== 'expense') return;
    var d = new Date(e.ts); d.setHours(0, 0, 0, 0);
    var idx = Math.round((d.getTime() - r.start) / DAY);
    if (idx >= 0 && idx < n) vals[idx] += e.amount;
  });
  var max = Math.max.apply(null, vals);
  if (!max) return '<div class="empty">No expenses in this period.</div>';
  var W = 340, H = 110, base = 92, top = 8, bw = (W - 16) / n, s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily expenses">';
  vals.forEach(function (v, k) {
    var bh = v ? Math.max(2, (v / max) * (base - top)) : 0;
    if (v) s += '<rect x="' + (8 + k * bw + 0.5).toFixed(1) + '" y="' + (base - bh).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) +
      '" height="' + bh.toFixed(1) + '" rx="1.5" fill="var(--exp)"/>';
  });
  s += '<line x1="8" y1="' + base + '" x2="' + (W - 8) + '" y2="' + base + '" stroke="var(--line)"/>';
  s += '<text x="8" y="106">' + new Date(r.start).getDate() + '</text>';
  s += '<text x="' + (W - 8) + '" y="106" text-anchor="end">' + new Date(r.end - DAY).getDate() + '</text>';
  s += '<text x="' + (W / 2) + '" y="106" text-anchor="middle">max ' + esc(fmt(max)) + '/day</text></svg>';
  return s;
}

function trendChart() {
  var rows = [], k, saved = ui.offset;
  for (k = -5; k <= 0; k++) {
    var r = range(saved + k), t = totals(inRange(r));
    rows.push({ label: r.startDate.toLocaleDateString('en-GB', { month: 'short' }), inc: t.inc, exp: t.exp });
  }
  var max = Math.max.apply(null, rows.map(function (x) { return Math.max(x.inc, x.exp); }));
  if (!max) return '<div class="empty">Not enough data yet.</div>';
  var W = 340, H = 130, base = 110, top = 8, gw = (W - 16) / rows.length, s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Income and expenses, last 6 periods">';
  rows.forEach(function (x, i) {
    var gx = 8 + i * gw, bw = Math.min(18, (gw - 10) / 2);
    var ih = x.inc ? Math.max(2, x.inc / max * (base - top)) : 0, eh = x.exp ? Math.max(2, x.exp / max * (base - top)) : 0;
    var cx = gx + gw / 2;
    if (ih) s += '<rect x="' + (cx - bw - 1).toFixed(1) + '" y="' + (base - ih).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ih.toFixed(1) + '" rx="2" fill="var(--inc)"/>';
    if (eh) s += '<rect x="' + (cx + 1).toFixed(1) + '" y="' + (base - eh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + eh.toFixed(1) + '" rx="2" fill="var(--exp)"/>';
    s += '<text x="' + cx.toFixed(1) + '" y="124" text-anchor="middle">' + esc(x.label) + '</text>';
  });
  s += '<line x1="8" y1="' + base + '" x2="' + (W - 8) + '" y2="' + base + '" stroke="var(--line)"/></svg>';
  return s;
}

function statsView() {
  var r = range(ui.offset), list = inRange(r), t = totals(list), a = A();
  var h = '<h1>Stats</h1>' + acctBar() + navHTML(r);
  h += '<div class="sum"><div><div class="lbl">Income</div><div class="v inc">' + fmt(t.inc) + '</div></div>' +
    '<div><div class="lbl">Expenses</div><div class="v exp">' + fmt(t.exp) + '</div></div>' +
    '<div><div class="lbl">Net</div><div class="v ' + (t.net < 0 ? 'exp' : 'inc') + '">' + fmt(t.net) + '</div></div></div>';

  var spent = {};
  list.forEach(function (e) { if (e.type === 'expense') spent[e.cat] = (spent[e.cat] || 0) + e.amount; });

  var budgets = a.budgets, bk = Object.keys(budgets);
  h += '<h2>Budgets</h2><div class="card">';
  if (!bk.length) h += '<div class="sub">No budgets set. Add them in Settings.</div>';
  else bk.forEach(function (c) {
    var sp = spent[c] || 0, lim = budgets[c], pct = sp / lim * 100;
    h += '<div class="line"><span>' + esc(c) + '</span><span class="' + (pct > 100 ? 'exp' : '') + '">' + fmt(sp) + ' / ' + fmt(lim) + '</span></div>' +
      '<div class="bar"><i class="' + (pct > 100 ? 'over' : pct >= 80 ? 'warn' : '') + '" style="width:' + Math.min(100, pct).toFixed(1) + '%"></i></div>';
  });
  h += '</div>';

  h += '<h2>Expenses by category</h2><div class="card">';
  var ek = Object.keys(spent).sort(function (x, y) { return spent[y] - spent[x]; });
  if (!ek.length) h += '<div class="sub">No expenses in this period.</div>';
  else ek.forEach(function (c) {
    var pct = t.exp ? spent[c] / t.exp * 100 : 0;
    h += '<div class="line"><span>' + esc(c) + '</span><span>' + fmt(spent[c]) + ' · ' + pct.toFixed(0) + '%</span></div>' +
      '<div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  });
  h += '</div>';

  var earned = {};
  list.forEach(function (e) { if (e.type === 'income') earned[e.cat] = (earned[e.cat] || 0) + e.amount; });
  var ik = Object.keys(earned).sort(function (x, y) { return earned[y] - earned[x]; });
  if (ik.length) {
    h += '<h2>Income by category</h2><div class="card">' + ik.map(function (c) {
      return '<div class="line"><span>' + esc(c) + '</span><span class="inc">' + fmt(earned[c]) + '</span></div>';
    }).join('') + '</div>';
  }

  h += '<h2>Daily expenses</h2><div class="card">' + dailyChart(list, r) + '</div>';
  h += '<h2>Last 6 periods</h2><div class="card">' + trendChart() +
    '<div class="hint"><span class="inc">■</span> income &nbsp; <span class="exp">■</span> expenses</div></div>';
  return h;
}

function settingsView() {
  var s = S(), a = A(), h = '<h1>Settings</h1>';
  h += '<h2>Appearance</h2><div class="seg">' + ['dark', 'light'].map(function (t) {
    return '<button class="' + (s.theme === t ? 'on' : '') + '" data-act="theme" data-v="' + t + '">' + (t === 'dark' ? 'Dark' : 'Light') + '</button>';
  }).join('') + '</div>';

  h += '<h2>General (both accounts)</h2><div class="card">' +
    db.accounts.map(function (ac, i) {
      return '<label class="fld"><span>Account ' + (i + 1) + ' name</span><input type="text" maxlength="20" data-acctname="' + i + '" value="' + esc(ac.name) + '"></label>';
    }).join('') +
    '<label class="fld" style="margin-bottom:0"><span>Month starts on day (1–28)</span><input type="number" inputmode="numeric" min="1" max="28" data-set="monthStart" value="' + s.monthStart + '"></label>' +
    '<div class="hint">Set to your payday (e.g. 25) so periods run from payday to payday.</div></div>';

  h += '<h2>Settings for</h2>' + acctBar() +
    '<div class="hint" style="margin-top:-4px;margin-bottom:10px">Everything below applies only to <b>' + esc(a.name) + '</b>. Swipe or tap the names to switch account.</div>';

  h += '<div class="card"><label class="fld" style="margin-bottom:0"><span>Opening balance (€)</span><input type="text" inputmode="decimal" data-set="opening" value="' + (a.opening / 100).toFixed(2) + '"></label></div>';

  h += '<h2>Monthly budgets (expenses)</h2><div class="card">' + a.cats.expense.map(function (c) {
    return '<label class="fld"><span>' + esc(c) + '</span><input type="text" inputmode="decimal" placeholder="No budget" data-budget="' + esc(c) + '" value="' +
      (a.budgets[c] ? (a.budgets[c] / 100).toFixed(2) : '') + '"></label>';
  }).join('') + '<div class="hint" style="margin-top:-4px">Leave empty for no budget.</div></div>';

  [['expense', 'Expense categories'], ['income', 'Income categories']].forEach(function (p) {
    h += '<h2>' + p[1] + '</h2><div class="card"><div class="chips">' + a.cats[p[0]].map(function (c) {
      return '<button class="chip rm" data-act="rmcat" data-t="' + p[0] + '" data-v="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('') + '</div><div class="add-inline"><input type="text" maxlength="30" placeholder="New category" data-newcat="' + p[0] +
      '"><button data-act="addcat" data-t="' + p[0] + '">Add</button></div></div>';
  });
  h += '<h2>Payment methods</h2><div class="card"><div class="chips">' + a.pays.map(function (c) {
    return '<button class="chip rm" data-act="rmpay" data-v="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('') + '</div><div class="add-inline"><input type="text" maxlength="30" placeholder="New method" data-newpay="1">' +
    '<button data-act="addpay">Add</button></div></div>';
  h += '<div class="hint">Removing a category or method does not change past entries.</div>';

  h += '<h2>Data (both accounts)</h2><div class="card">' +
    '<div class="sub" style="margin-bottom:10px">' + esc(db.accounts[0].name) + ': ' + db.accounts[0].entries.length + ' entries · ' +
    esc(db.accounts[1].name) + ': ' + db.accounts[1].entries.length + ' entries. Stored on this device only.</div>' +
    '<button class="btn sec" data-act="csv">Export CSV</button>' +
    '<button class="btn sec" data-act="backup">Export backup (JSON)</button>' +
    '<button class="btn sec" data-act="import">Import backup (JSON)</button>' +
    '<input type="file" id="file" accept="application/json,.json" hidden>' +
    '<button class="btn danger" data-act="reset" style="margin-top:14px">Delete all data</button></div>';
  h += '<div class="hint">Data lives in this browser’s storage. Clearing Safari website data deletes it, so export a backup regularly.</div>';
  return h;
}

var views = { add: addView, history: historyView, stats: statsView, settings: settingsView };

function tabKey() { return ui.tab === 'add' ? (ui.acct === 1 ? 'add2' : 'add') : ui.tab; }

function render(keepScroll, dir) {
  var y = keepScroll ? window.scrollY : 0;
  var v = $('#view');
  v.innerHTML = views[ui.tab]();
  v.classList.remove('in-l', 'in-r');
  if (dir) {
    void v.offsetWidth;
    v.classList.add(dir === 'l' ? 'in-l' : 'in-r');
  }
  var k = tabKey();
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    b.classList.toggle('on', b.dataset.tab === k);
  });
  window.scrollTo(0, y);
}

function switchAcct(i) {
  if (i === ui.acct || !db.accounts[i]) return;
  var dir = i > ui.acct ? 'l' : 'r';
  ui.acct = i;
  var dd = drafts.add[i];
  if (ui.tab === 'add' && dd && !dd.amount) dd.when = toLocalInput(Date.now());
  render(false, dir);
}

function openSheet(id) {
  var e = A().entries.filter(function (x) { return x.id === id; })[0];
  if (!e) return;
  drafts.edit = { id: e.id, type: e.type, amount: (e.amount / 100).toFixed(2), cat: e.cat, pay: e.pay, note: e.note, when: toLocalInput(e.ts) };
  renderSheet();
  $('#sheet').hidden = false;
}
function renderSheet() {
  $('#sheet').innerHTML = '<div class="backdrop" data-act="close"></div><div class="sheet"><h1>Edit entry</h1>' +
    '<div class="hint" style="margin-top:-8px;margin-bottom:10px">' + esc(A().name) + '</div>' + formHTML(drafts.edit, 'edit') +
    '<button class="btn" data-act="save" data-scope="edit">Save changes</button>' +
    '<button class="btn danger" data-act="del">Delete entry</button>' +
    '<button class="btn sec" data-act="close">Cancel</button></div>';
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; drafts.edit = null; }

/* ---------- actions ---------- */
function redraw(scope) { if (scope === 'edit') renderSheet(); else render(true); }

function saveDraft(scope) {
  var d = D(scope), a = A();
  var amt = parseMoney(d.amount, false);
  if (!(amt > 0)) { toast('Enter a valid amount, e.g. 12.50'); return; }
  var ts = new Date(d.when).getTime();
  if (!isFinite(ts)) { toast('Enter a valid date and time'); return; }
  var entry;
  if (scope === 'add') {
    entry = { id: uid(), type: d.type, amount: amt, cat: d.cat, pay: d.pay, note: d.note.trim(), ts: ts };
    a.entries.push(entry);
  } else {
    entry = a.entries.filter(function (x) { return x.id === d.id; })[0];
    if (!entry) { closeSheet(); return; }
    entry.type = d.type; entry.amount = amt; entry.cat = d.cat; entry.pay = d.pay; entry.note = d.note.trim(); entry.ts = ts;
  }
  if (!save()) return;
  var msg = scope === 'add' ? 'Saved to ' + a.name : 'Changes saved';
  if (entry.type === 'expense') {
    var lim = a.budgets[entry.cat];
    if (lim) {
      var r = range(0);
      if (entry.ts >= r.start && entry.ts < r.end) {
        var sp = 0;
        inRange(r).forEach(function (e) { if (e.type === 'expense' && e.cat === entry.cat) sp += e.amount; });
        if (sp > lim) msg = 'Over budget: ' + entry.cat + ' ' + fmt(sp) + ' of ' + fmt(lim);
        else if (sp >= lim * 0.8) msg = 'Near budget: ' + entry.cat + ' ' + fmt(sp) + ' of ' + fmt(lim);
      }
    }
  }
  if (scope === 'add') drafts.add[ui.acct] = newDraft(d);
  else closeSheet();
  toast(msg);
  render(true);
}

function saveFile(name, text, mime) {
  var blob = new Blob([text], { type: mime });
  try {
    var file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(function () {});
      return;
    }
  } catch (e) {}
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function stamp() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function csvCell(v) { v = String(v); return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCSV() {
  var rows = ['account,date,time,type,amount,category,payment,note'];
  db.accounts.forEach(function (acc) {
    sortedDesc(acc.entries).reverse().forEach(function (e) {
      var l = toLocalInput(e.ts).split('T');
      rows.push([acc.name, l[0], l[1], e.type, (e.amount / 100).toFixed(2), e.cat, e.pay, e.note].map(csvCell).join(','));
    });
  });
  saveFile('moneylog-' + stamp() + '.csv', '﻿' + rows.join('\r\n'), 'text/csv');
}
function exportBackup() { saveFile('moneylog-backup-' + stamp() + '.json', JSON.stringify(db, null, 1), 'application/json'); }

function cleanName(s) { return String(s || '').trim().replace(/\s+/g, ' '); }

document.addEventListener('click', function (ev) {
  var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
  if (!t) return;
  var a = t.dataset.act, v = t.dataset.v, scope = t.dataset.scope, d, ac = A();
  if (a === 'tab') {
    var tb = t.dataset.tab, prevAcct = ui.acct;
    if (tb === 'add2') { ui.tab = 'add'; ui.acct = 1; }
    else if (tb === 'add') { ui.tab = 'add'; ui.acct = 0; }
    else ui.tab = tb;
    ui.offset = 0;
    var dd = drafts.add[ui.acct];
    if (ui.tab === 'add' && dd && !dd.amount) dd.when = toLocalInput(Date.now());
    render(false, ui.acct !== prevAcct ? (ui.acct > prevAcct ? 'l' : 'r') : null);
  } else if (a === 'acct') { switchAcct(parseInt(v, 10)); }
  else if (a === 'type') {
    d = D(scope);
    if (d.type !== v) { d.type = v; d.cat = ac.cats[v][0]; }
    redraw(scope);
  } else if (a === 'cat') { D(scope).cat = v; redraw(scope); }
  else if (a === 'pay') { D(scope).pay = v; redraw(scope); }
  else if (a === 'save') saveDraft(scope);
  else if (a === 'open') openSheet(t.dataset.id);
  else if (a === 'close') closeSheet();
  else if (a === 'del') {
    if (drafts.edit && confirm('Delete this entry?')) {
      var id = drafts.edit.id;
      ac.entries = ac.entries.filter(function (x) { return x.id !== id; });
      save(); closeSheet(); toast('Deleted'); render(true);
    }
  }
  else if (a === 'prev') { ui.offset--; render(false); }
  else if (a === 'next') { if (ui.offset < 0) { ui.offset++; render(false); } }
  else if (a === 'filter') { ui.filter = v; render(true); }
  else if (a === 'theme') { S().theme = v; save(); applyTheme(); render(true); }
  else if (a === 'addcat') {
    var inp = document.querySelector('[data-newcat="' + t.dataset.t + '"]'), n = cleanName(inp && inp.value), list = ac.cats[t.dataset.t];
    if (!n) return;
    if (list.some(function (c) { return c.toLowerCase() === n.toLowerCase(); })) { toast('Already exists'); return; }
    list.push(n); save(); render(true);
  }
  else if (a === 'rmcat') {
    var l2 = ac.cats[t.dataset.t];
    if (l2.length <= 1) { toast('Keep at least one category'); return; }
    ac.cats[t.dataset.t] = l2.filter(function (c) { return c !== v; });
    if (t.dataset.t === 'expense') delete ac.budgets[v];
    drafts.add[ui.acct] = null; save(); render(true);
  }
  else if (a === 'addpay') {
    var pi = document.querySelector('[data-newpay]'), pn = cleanName(pi && pi.value);
    if (!pn) return;
    if (ac.pays.some(function (c) { return c.toLowerCase() === pn.toLowerCase(); })) { toast('Already exists'); return; }
    ac.pays.push(pn); save(); render(true);
  }
  else if (a === 'rmpay') {
    if (ac.pays.length <= 1) { toast('Keep at least one method'); return; }
    ac.pays = ac.pays.filter(function (c) { return c !== v; });
    drafts.add[ui.acct] = null; save(); render(true);
  }
  else if (a === 'csv') exportCSV();
  else if (a === 'backup') exportBackup();
  else if (a === 'import') { var f = $('#file'); if (f) f.click(); }
  else if (a === 'reset') {
    if (confirm('Delete ALL entries and settings of BOTH accounts? This cannot be undone.') && confirm('Really delete everything?')) {
      db = defaults(); drafts.add = [null, null]; save(); applyTheme(); toast('All data deleted'); render(false);
    }
  }
});

document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t.dataset && t.dataset.field && (t.dataset.scope === 'edit' ? drafts.edit : true)) D(t.dataset.scope)[t.dataset.field] = t.value;
});

document.addEventListener('change', function (ev) {
  var t = ev.target, ac = A();
  if (!t.dataset) return;
  if (t.dataset.set === 'opening') {
    var n = parseMoney(t.value, true);
    if (isNaN(n)) { toast('Invalid amount'); render(true); return; }
    ac.opening = n; save(); toast('Saved');
  } else if (t.dataset.set === 'monthStart') {
    var m = parseInt(t.value, 10);
    if (!(m >= 1 && m <= 28)) { toast('Use a day from 1 to 28'); render(true); return; }
    S().monthStart = m; save(); toast('Saved');
  } else if (t.dataset.acctname !== undefined) {
    var idx = parseInt(t.dataset.acctname, 10), nm = cleanName(t.value).slice(0, 20);
    if (!nm) { toast('Name cannot be empty'); render(true); return; }
    db.accounts[idx].name = nm; save(); toast('Saved'); render(true);
  } else if (t.dataset.budget) {
    var c = t.dataset.budget;
    if (String(t.value).trim() === '') { delete ac.budgets[c]; save(); toast('Budget removed'); return; }
    var b = parseMoney(t.value, false);
    if (!(b > 0)) { toast('Invalid budget'); render(true); return; }
    ac.budgets[c] = b; save(); toast('Saved');
  } else if (t.id === 'file' && t.files && t.files[0]) {
    var rd = new FileReader();
    rd.onload = function () {
      var parsed;
      try { parsed = JSON.parse(rd.result); } catch (e) { toast('Not a valid backup file'); return; }
      var isNew = parsed && Array.isArray(parsed.accounts), isOld = parsed && Array.isArray(parsed.entries);
      if (!isNew && !isOld) { toast('Not a Money Log backup'); return; }
      var next = sanitize(parsed);
      var msg = isNew
        ? 'Replace ALL current data (both accounts) with this backup? (' + next.accounts[0].entries.length + ' + ' + next.accounts[1].entries.length + ' entries)'
        : 'This is an old single-account backup (' + next.accounts[0].entries.length + ' entries). It will replace ALL current data and go into Account 1. Continue?';
      if (confirm(msg)) {
        db = next; drafts.add = [null, null]; save(); applyTheme(); toast('Backup imported'); render(false);
      }
    };
    rd.readAsText(t.files[0]);
  }
});

/* ---------- swipe between accounts ---------- */
var sw = null;
document.addEventListener('touchstart', function (ev) {
  var sheet = $('#sheet');
  if ((sheet && !sheet.hidden) || !ev.touches || ev.touches.length !== 1) { sw = null; return; }
  var tg = ev.target;
  if (tg && tg.closest && tg.closest('input,textarea,select,#tabs')) { sw = null; return; }
  sw = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
}, { passive: true });
document.addEventListener('touchend', function (ev) {
  if (!sw) return;
  var p = ev.changedTouches && ev.changedTouches[0], s0 = sw;
  sw = null;
  if (!p) return;
  var dx = p.clientX - s0.x, dy = p.clientY - s0.y;
  if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) switchAcct(dx < 0 ? 1 : 0);
}, { passive: true });
document.addEventListener('touchcancel', function () { sw = null; }, { passive: true });

/* ---------- start ---------- */
load();
applyTheme();
render(false);
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
})();
