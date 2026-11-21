// Stats: detailed view (the "trend analyzer" + charts part of the sheet).
import { money, esc, monthName, monthLabel, addMonths, pct, monthShort, baseKey } from '../util.js';
import { summarize, trend, categoryTrend, sparseTrend, topItems, allTime, expensesOf } from '../stats.js';
import { monthBars, hbars, catColor } from '../charts.js';
import { statStrip, segmented, emptyState, deltaBadge, txRow } from '../ui.js';

let range = 12;
let category = null;
let itemsScope = 'all'; // 'all' | 'month'
let item = null;        // baseKey of the expense the category graph is narrowed to

export const actions = {
  range(el, ctx) { range = Number(el.dataset.value); ctx.render(); },
  'pick-cat'(el, ctx) {
    category = el.dataset.category;
    item = null;
    ctx.render();
    requestAnimationFrame(() => document.getElementById('drill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  },
  scope(el, ctx) { itemsScope = el.dataset.value; ctx.render(); },
  // Tap an expense in "Top expenses" to see only its month-by-month evolution; tap again to go back.
  'pick-item'(el, ctx) {
    item = item === el.dataset.key ? null : el.dataset.key;
    ctx.render();
    if (item) requestAnimationFrame(() => document.getElementById('drill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  },
  'clear-item'(el, ctx) { item = null; ctx.render(); },
};

export function mount(root, ctx) {
  root.querySelector('#cat-select')?.addEventListener('change', (e) => { category = e.target.value; item = null; ctx.render(); });
}

export function render({ store, state }) {
  const s = store.settings;
  const m = state.month;
  // The person selector at the top narrows everything on this screen to one person's expenses and income.
  const who = s.people.length > 1 && s.people.includes(state.person) ? state.person : 'all';
  const txs = store.txFor(who);
  if (!txs.length) return emptyState('No data yet', who === 'all' ? 'Stats appear once you add some expenses.' : `${esc(who)} has nothing recorded yet.`);

  const cur = summarize(txs, m, s.people);
  const prev = summarize(txs, addMonths(m, -1), s.people);
  let t = trend(txs, m, range);
  const firstWithData = t.findIndex((d) => d.expenses || d.income);
  if (firstWithData > 0) t = t.slice(firstWithData); // no empty bars before the first month with data
  const all = allTime(txs);
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
  const usedCats = [...new Set(expensesOf(txs).map((x) => x.category))].sort();
  if (!category || !usedCats.includes(category)) category = cur.byCategory[0]?.category || usedCats[0];
  const catTx = txs.filter((x) => x.type === 'expense' && x.category === category);
  if (item && !catTx.some((x) => baseKey(x.description) === item)) item = null;
  const itemTx = item ? catTx.filter((x) => baseKey(x.description) === item) : catTx;
  const itemName = item ? topItems(catTx).find((i) => i.key === item)?.description : '';
  // Used in only a few months? Show exactly those months (with the year when needed) instead of an empty window.
  const sparse = sparseTrend(txs, category, item, 12);
  let ct = sparse || categoryTrend(txs, category, m, range, item);
  if (sparse) {
    const years = new Set(sparse.map((d) => d.month.slice(0, 4)));
    const withYear = years.size > 1 || !years.has(m.slice(0, 4));
    ct = sparse.map((d) => ({ ...d, label: withYear ? `${monthShort(d.month)} ’${d.month.slice(2, 4)}` : monthShort(d.month) }));
  }
  const thisMonthValue = itemTx.filter((x) => x.month === m).reduce((a, x) => a + x.amount, 0);
  const catAll = itemTx.reduce((a, x) => a + x.amount, 0);
  const catMonths = new Set(itemTx.map((x) => x.month)).size;
  const scoped = itemsScope === 'month' ? catTx.filter((x) => x.month === m) : catTx;
  const items = topItems(scoped).slice(0, 12);
  const monthList = itemsScope === 'month' ? (item ? scoped.filter((x) => baseKey(x.description) === item) : scoped) : [];

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
      <div class="card-head"><h2>${esc(monthLabel(m))} by category${who !== 'all' ? ` · ${esc(who)}` : ''}</h2><span class="muted">${money(cur.expenses)}</span></div>
      ${catRows.length ? hbars(catRows, { total: cur.expenses, action: 'pick-cat' }) : '<p class="muted">No expenses this month.</p>'}
      ${gone.length ? `<p class="hint left">Not spent this month: ${gone.map((g) => `${esc(g.category)} (${money(g.amount)} last month)`).join(', ')}</p>` : ''}
    </div>

    <div class="card" id="drill">
      <div class="card-head"><h2>Category detail</h2>
        <select id="cat-select" aria-label="Category">${usedCats.map((c) => `<option ${c === category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </div>
      ${item ? `<button type="button" class="filter-chip" data-action="clear-item" aria-label="Show the whole category again">${esc(itemName)} only <span aria-hidden="true">✕</span></button>` : ''}
      ${statStrip([
        { label: 'Total ever', value: money(catAll, { decimals: 0 }) },
        { label: 'Avg / month', value: money(catMonths ? catAll / catMonths : 0, { decimals: 0 }) },
        { label: monthShort(m), value: money(thisMonthValue, { decimals: 0 }) },
      ])}
      ${monthBars(ct, { selected: m, showIncome: false })}
      ${sparse ? `<p class="hint left">Only the ${sparse.length} month${sparse.length === 1 ? '' : 's'} with spending in this ${item ? 'expense' : 'category'} are shown.</p>` : ''}
      <div class="card-head sub"><h3>Top expenses</h3>
        ${segmented('scope', [{ value: 'all', label: 'All time' }, { value: 'month', label: monthShort(m) }], itemsScope, { action: 'scope' })}
      </div>
      ${items.length ? `<table class="table">
        <thead><tr><th>Item</th><th class="num">Times</th><th class="num">Last</th><th class="num">Total</th></tr></thead>
        <tbody>${items.map((i) => `<tr data-action="pick-item" data-key="${esc(i.key)}" class="${i.key === item ? 'sel' : ''}" tabindex="0" aria-pressed="${i.key === item}"><td>${esc(i.description)}</td><td class="num">${i.count}</td><td class="num">${money(i.last.amount, { decimals: 0 })}</td><td class="num"><b>${money(i.total, { decimals: 0 })}</b></td></tr>`).join('')}</tbody>
      </table>` : '<p class="muted">Nothing here.</p>'}
      ${items.length ? '<p class="hint left">Tap an expense to see only its month-by-month evolution above. Tap it again to go back. Notes like “(cash)” are ignored, so “Chiria (cash)” and “Chiria” count as one.</p>' : ''}
      ${monthList.length ? `<ul class="tx-list">${monthList.map((x) => txRow(store, x)).join('')}</ul>` : ''}
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
