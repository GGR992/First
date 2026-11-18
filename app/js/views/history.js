// History: every transaction, like the DB_Transactions sheet, with filters.
import { money, esc, monthLabel, sum, normKey, debounce } from '../util.js';
import { statStrip, txRow, emptyState } from '../ui.js';

const f = { q: '', type: 'all', month: 'all', category: 'all', payer: 'all', status: 'all' };
let limit = 150;

export const actions = {
  'more'(el, ctx) { limit += 300; ctx.render(); },
  'reset-filters'(el, ctx) { Object.assign(f, { q: '', type: 'all', month: 'all', category: 'all', payer: 'all', status: 'all' }); ctx.render(); },
  'this-month'(el, ctx) { f.month = ctx.state.month; ctx.render(); },
};

function filtered(store) {
  const q = normKey(f.q);
  return store.tx.filter((t) =>
    (f.type === 'all' || t.type === f.type) &&
    (f.month === 'all' || t.month === f.month) &&
    (f.category === 'all' || t.category === f.category) &&
    (f.payer === 'all' || t.payer === f.payer) &&
    (f.status === 'all' || (f.status === 'paid' ? t.paid : !t.paid)) &&
    (!q || normKey(t.description).includes(q) || normKey(t.category).includes(q) || String(t.amount).includes(q)),
  ).sort((a, b) => b.month.localeCompare(a.month) || b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function listHtml(store) {
  const rows = filtered(store);
  const exp = rows.filter((t) => t.type === 'expense');
  const inc = rows.filter((t) => t.type === 'income');
  const shown = rows.slice(0, limit);
  let html = '';
  let curMonth = null;
  for (const t of shown) {
    if (t.month !== curMonth) {
      if (curMonth) html += '</ul>';
      curMonth = t.month;
      const mExp = sum(rows.filter((x) => x.month === curMonth && x.type === 'expense'));
      html += `<h3 class="group-head"><span>${esc(monthLabel(curMonth))}</span><span>${money(mExp, { decimals: 0 })}</span></h3><ul class="tx-list card flush">`;
    }
    html += txRow(store, t);
  }
  if (curMonth) html += '</ul>';
  return `
    ${statStrip([
      { label: 'Results', value: String(rows.length) },
      { label: 'Expenses', value: money(sum(exp), { decimals: 0 }) },
      { label: 'Income', value: money(sum(inc), { decimals: 0 }) },
    ])}
    ${rows.length ? html : emptyState('No matches', 'Try another search or clear the filters.', '<button class="btn" data-action="reset-filters">Clear filters</button>')}
    ${rows.length > limit ? `<button class="btn block" data-action="more">Show more (${rows.length - limit} left)</button>` : ''}`;
}

const sel = (name, label, options, value) => `<label class="field compact"><span>${label}</span>
  <select data-filter="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

export function render({ store }) {
  if (!store.tx.length) {
    return emptyState('History is empty', 'Everything you add shows up here. You can also import your Google Sheet in Settings.',
      '<a class="btn" href="#/settings">Import data</a>');
  }
  const months = [...new Set(store.tx.map((t) => t.month))].sort().reverse();
  const cats = [...new Set(store.tx.map((t) => t.category))].sort();
  const active = ['type', 'month', 'category', 'payer', 'status'].filter((k) => f[k] !== 'all').length;
  return `<section class="stack">
    <div class="search">
      <input type="search" id="hist-q" placeholder="Search description, category, amount…" value="${esc(f.q)}" aria-label="Search">
    </div>
    <details class="card filters" ${active ? 'open' : ''}>
      <summary>Filters ${active ? `<span class="count">${active}</span>` : ''}</summary>
      <div class="filter-grid">
        ${sel('type', 'Type', [['all', 'All'], ['expense', 'Expenses'], ['income', 'Income']], f.type)}
        ${sel('status', 'Status', [['all', 'All'], ['unpaid', 'To pay'], ['paid', 'Paid']], f.status)}
        ${sel('month', 'Month', [['all', 'All months'], ...months.map((m) => [m, monthLabel(m)])], f.month)}
        ${sel('category', 'Category', [['all', 'All'], ...cats.map((c) => [c, c])], f.category)}
        ${sel('payer', 'Payer', [['all', 'Everyone'], ...store.settings.people.map((p) => [p, p])], f.payer)}
      </div>
      <div class="btn-row"><button class="btn ghost" data-action="this-month">Selected month</button><button class="btn ghost" data-action="reset-filters">Clear</button></div>
    </details>
    <div id="hist-list" class="stack">${listHtml(store)}</div>
  </section>`;
}

export function mount(root, ctx) {
  const list = root.querySelector('#hist-list');
  const q = root.querySelector('#hist-q');
  if (q) q.addEventListener('input', debounce(() => { f.q = q.value; limit = 150; list.innerHTML = listHtml(ctx.store); }, 150));
  root.querySelectorAll('[data-filter]').forEach((s) => s.addEventListener('change', () => {
    f[s.dataset.filter] = s.value;
    limit = 150;
    ctx.render();
  }));
}
