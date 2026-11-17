// Current month: the list where you swap payer and mark as paid (bottom-right part of the sheet).
import { money, esc, monthName, addMonths } from '../util.js';
import { summarize, settlement } from '../stats.js';
import { statStrip, txRow, segmented, emptyState } from '../ui.js';

let filter = 'todo';

export const actions = {
  filter(el, ctx) { filter = el.dataset.value; ctx.render(); },
  async 'pay-all'(el, ctx) {
    const { store, state } = ctx;
    const ids = summarize(store.tx, state.month, store.settings.people).unpaid.map((t) => t.id);
    if (!ids.length || !confirm(`Mark all ${ids.length} as paid?`)) return;
    for (const id of ids) {
      const t = store.get(id);
      t.paid = true;
      t.updatedAt = Date.now();
    }
    await store.persist();
    ctx.toast(`${ids.length} marked as paid`, {
      undo: async () => { ids.forEach((id) => { store.get(id).paid = false; }); await store.persist(); },
    });
  },
};

export function render({ store, state }) {
  const s = store.settings;
  const cur = summarize(store.tx, state.month, s.people);
  const settle = settlement(cur);
  const sortFn = (a, b) => a.category.localeCompare(b.category) || b.amount - a.amount;
  const lists = {
    todo: cur.unpaid.slice().sort(sortFn),
    paid: cur.exp.filter((t) => t.paid).sort(sortFn),
    all: cur.exp.slice().sort((a, b) => (a.paid - b.paid) || sortFn(a, b)),
  };
  const list = lists[filter];

  const perPerson = s.people.map((p) => {
    const d = cur.byPerson[p];
    return { label: p, value: money(d.spent), sub: d.unpaid ? `<span class="warn-text">${money(d.unpaid)} to pay</span>` : 'all paid' };
  });

  const empty = filter === 'todo' && cur.exp.length
    ? emptyState('All paid ✅', `Everything for ${esc(monthName(state.month))} is paid. Paid items live in History.`)
    : emptyState('No expenses here', `Add one, or copy the bills from ${esc(monthName(addMonths(state.month, -1)))}.`,
        `<div class="btn-row"><button class="btn primary" data-action="new-expense">Add expense</button><a class="btn" href="#/add?last">Copy last month</a></div>`);

  return `<section class="stack">
    ${statStrip([
      { label: 'Total', value: money(cur.expenses), sub: `${cur.exp.length} items` },
      { label: 'Paid', value: money(cur.paidAmount), tone: 'good' },
      { label: 'To pay', value: money(cur.unpaidAmount), tone: cur.unpaid.length ? 'warn' : '', sub: `${cur.unpaid.length} left` },
    ])}
    ${statStrip(perPerson)}
    ${settle && !settle.even ? `<div class="callout slim"><b>${esc(settle.to)}</b> paid ${money(settle.amount)} more than their share.</div>` : ''}

    <div class="toolbar">
      ${segmented('filter', [
        { value: 'todo', label: `To pay <span class="count">${lists.todo.length}</span>` },
        { value: 'paid', label: `Paid <span class="count">${lists.paid.length}</span>` },
        { value: 'all', label: 'All' },
      ], filter, { action: 'filter' })}
    </div>

    ${list.length ? `<ul class="tx-list card flush">${list.map((t) => txRow(store, t)).join('')}</ul>` : empty}

    <p class="hint">Tap ✓ to mark paid · tap the name to swap who pays · tap a row to edit.</p>
    ${filter === 'todo' && list.length > 1 ? '<button class="btn ghost block" data-action="pay-all">Mark all as paid</button>' : ''}
  </section>`;
}
