// Stats: detailed view (the "trend analyzer" + charts part of the sheet).
import { money, esc, monthName, monthLabel, addMonths, pct, monthShort } from '../util.js';
import { summarize, trend, categoryTrend, topItems, allTime, personTrend, expensesOf } from '../stats.js';
import { monthBars, hbars, catColor } from '../charts.js';
import { statStrip, segmented, emptyState, deltaBadge, txRow } from '../ui.js';

let range = 12;
let category = null;
let itemsScope = 'all'; // 'all' | 'month'

export const actions = {
  range(el, ctx) { range = Number(el.dataset.value); ctx.render(); },
  'pick-cat'(el, ctx) {
    category = el.dataset.category;
    ctx.render();
    requestAnimationFrame(() => document.getElementById('drill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  },
  scope(el, ctx) { itemsScope = el.dataset.value; ctx.render(); },
};

export function mount(root, ctx) {
  root.querySelector('#cat-select')?.addEventListener('change', (e) => { category = e.target.value; ctx.render(); });
}

export function render({ store, state }) {
  const s = store.settings;
  const m = state.month;
  if (!store.tx.length) return emptyState('No data yet', 'Stats appear once you add some expenses.');

  const cur = summarize(store.tx, m, s.people);
  const prev = summarize(store.tx, addMonths(m, -1), s.people);
  const t = trend(store.tx, m, range);
  const all = allTime(store.tx);
  const withData = t.filter((d) => d.expenses);
  const avgRange = withData.length ? withData.reduce((a, d) => a + d.expenses, 0) / withData.length : 0;

  // Category table with change vs last month
  const prevCat = Object.fromEntries(prev.byCategory.map((c) => [c.category, c.amount]));
  const catRows = cur.byCategory.map((c) => ({
    label: c.category,
    value: c.amount,
    color: catColor(c.category, s.expenseCategories),
    extra: prevCat[c.category] != null
      ? `${monthShort(addMonths(m, -1))}: ${money(prevCat[c.category])} ${deltaBadge(c.amount, prevCat[c.category])}`
      : `<span class="muted">new this month</span>`,
  }));
  // Categories that disappeared this month
  const gone = prev.byCategory.filter((c) => !cur.byCategory.some((x) => x.category === c.category));

  // Drill-down
  const usedCats = [...new Set(expensesOf(store.tx).map((x) => x.category))].sort();
  if (!category || !usedCats.includes(category)) category = cur.byCategory[0]?.category || usedCats[0];
  const ct = categoryTrend(store.tx, category, m, range);
  const catTx = store.tx.filter((x) => x.type === 'expense' && x.category === category);
  const catAll = catTx.reduce((a, x) => a + x.amount, 0);
  const catMonths = new Set(catTx.map((x) => x.month)).size;
  const scoped = itemsScope === 'month' ? catTx.filter((x) => x.month === m) : catTx;
  const items = topItems(scoped).slice(0, 12);

  // Person trend
  const pt = personTrend(store.tx, s.people, m, Math.min(range, 6));

  return `<section class="stack">
    ${statStrip([
      { label: 'All-time spent', value: money(all.total, { decimals: 0 }) },
      { label: 'Avg / month', value: money(all.avg, { decimals: 0 }), sub: `${all.months} months` },
      { label: `${monthShort(m)} vs avg`, value: money(cur.expenses - avgRange, { sign: true, decimals: 0 }), tone: cur.expenses > avgRange ? 'bad' : 'good' },
    ])}

    <div class="card">
      <div class="card-head"><h2>Trend</h2>
        ${segmented('range', [{ value: '6', label: '6m' }, { value: '12', label: '12m' }, { value: '24', label: '24m' }], String(range), { action: 'range' })}
      </div>
      ${monthBars(t, { selected: m })}
      <div class="chart-legend"><span><i class="sw bar"></i>Expenses</span><span><i class="sw line"></i>Income</span><span class="muted">Tap a bar to open that month</span></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>${esc(monthLabel(m))} by category</h2><span class="muted">${money(cur.expenses)}</span></div>
      ${catRows.length ? hbars(catRows, { total: cur.expenses, action: 'pick-cat' }) : '<p class="muted">No expenses this month.</p>'}
      ${gone.length ? `<p class="hint left">Not spent this month: ${gone.map((g) => `${esc(g.category)} (${money(g.amount)} last month)`).join(', ')}</p>` : ''}
    </div>

    <div class="card" id="drill">
      <div class="card-head"><h2>Category detail</h2>
        <select id="cat-select" aria-label="Category">${usedCats.map((c) => `<option ${c === category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </div>
      ${statStrip([
        { label: 'Total ever', value: money(catAll, { decimals: 0 }) },
        { label: 'Avg / month', value: money(catMonths ? catAll / catMonths : 0, { decimals: 0 }) },
        { label: monthShort(m), value: money(ct[ct.length - 1].expenses, { decimals: 0 }) },
      ])}
      ${monthBars(ct, { selected: m, showIncome: false })}
      <div class="card-head sub"><h3>Top expenses</h3>
        ${segmented('scope', [{ value: 'all', label: 'All time' }, { value: 'month', label: monthShort(m) }], itemsScope, { action: 'scope' })}
      </div>
      ${items.length ? `<table class="table">
        <thead><tr><th>Item</th><th class="num">Times</th><th class="num">Last</th><th class="num">Total</th></tr></thead>
        <tbody>${items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.count}</td><td class="num">${money(i.last.amount, { decimals: 0 })}</td><td class="num"><b>${money(i.total, { decimals: 0 })}</b></td></tr>`).join('')}</tbody>
      </table>` : '<p class="muted">Nothing here.</p>'}
      ${itemsScope === 'month' && scoped.length ? `<ul class="tx-list">${scoped.map((x) => txRow(store, x)).join('')}</ul>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Who paid, by month</h2></div>
      <table class="table">
        <thead><tr><th>Month</th>${s.people.map((p) => `<th class="num">${esc(p)}</th>`).join('')}<th class="num">Diff</th></tr></thead>
        <tbody>${pt.slice().reverse().map((r) => {
          const vals = s.people.map((p) => r[p]);
          const diff = vals.length === 2 ? vals[0] - vals[1] : 0;
          return `<tr class="${r.month === m ? 'sel' : ''}" data-action="pick-month" data-month="${r.month}">
            <td>${esc(monthName(r.month))} <small class="muted">${r.month.slice(0, 4)}</small></td>
            ${vals.map((v) => `<td class="num">${money(v, { decimals: 0 })}</td>`).join('')}
            <td class="num">${vals.length === 2 ? money(diff, { sign: true, decimals: 0 }) : ''}</td></tr>`;
        }).join('')}</tbody>
      </table>
      ${s.people.length === 2 ? `<p class="hint left">Diff = ${esc(s.people[0])} − ${esc(s.people[1])}. Positive means ${esc(s.people[0])} paid more.</p>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Month vs last month</h2></div>
      <table class="table">
        <thead><tr><th></th><th class="num">${esc(monthShort(addMonths(m, -1)))}</th><th class="num">${esc(monthShort(m))}</th><th class="num">Change</th></tr></thead>
        <tbody>
          ${[['Income', cur.income, prev.income, false], ['Expenses', cur.expenses, prev.expenses, true], ['Left', cur.remaining, prev.remaining, false]].map(([l, a, b, gd]) =>
            `<tr><td>${l}</td><td class="num">${money(b, { decimals: 0 })}</td><td class="num">${money(a, { decimals: 0 })}</td><td class="num">${deltaBadge(a, b, { goodWhenDown: gd }) || '—'}</td></tr>`).join('')}
          <tr><td>Share of income spent</td><td class="num">${pct(prev.expenses, prev.income).toFixed(0)}%</td><td class="num">${pct(cur.expenses, cur.income).toFixed(0)}%</td><td></td></tr>
        </tbody>
      </table>
    </div>
  </section>`;
}
