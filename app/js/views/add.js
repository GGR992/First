// Add: expense / income / copy-from-last-month (top-left + left parts of the sheet).
import { money, esc, monthName, addMonths, parseAmount, defaultDateFor, baseKey, sum } from '../util.js';
import { summarize, topItems, incomesOf, inMonth } from '../stats.js';
import { txForm, bindTxForm, readTxForm, statStrip, segmented, emptyState, personIndex, deltaBadge, kwAttrs } from '../ui.js';

let mode = 'expense';
// Per-row choices in "Last month" mode, keyed by source tx id. Reset when month changes.
let picks = new Map();
let picksMonth = null;

export function enter(ctx) {
  const q = ctx.state.query;
  if (q === 'income' || q === 'last' || q === 'expense') mode = q;
}

export const actions = {
  mode(el, ctx) { mode = el.dataset.value; ctx.render(); },
  'quick-fill'(el) {
    const form = document.getElementById('add-form');
    form.elements.description.value = el.dataset.desc;
    form.elements.amount.value = '';
    form.elements.description.dispatchEvent(new Event('change', { bubbles: true }));
    form.elements.amount.focus();
    form.elements.amount.select();
  },
  async 'del-income'(el, ctx) {
    const t = ctx.store.get(el.dataset.id);
    await ctx.store.remove(t.id);
    ctx.toast('Income removed', { undo: () => ctx.store.add(t) });
  },
  async 'copy-income'(el, ctx) {
    const { store, state } = ctx;
    const prev = incomesOf(inMonth(store.tx, addMonths(state.month, -1)));
    await store.add(prev.map((t) => ({ ...t, id: undefined, month: state.month, date: defaultDateFor(state.month) })));
    ctx.toast(`${prev.length} income entries copied`);
  },
  'pick-toggle'(el, ctx) {
    const p = picks.get(el.dataset.id);
    p.on = !p.on;
    ctx.render();
  },
  'pick-swap'(el, ctx) {
    const p = picks.get(el.dataset.id);
    const ppl = ctx.store.settings.people;
    p.payer = ppl[(ppl.indexOf(p.payer) + 1) % ppl.length];
    ctx.render();
  },
  'pick-all'(el, ctx) {
    const on = el.dataset.value === 'on';
    for (const p of picks.values()) if (!p.already || !on) p.on = on;
    ctx.render();
  },
  async 'pick-add'(el, ctx) {
    const { store, state } = ctx;
    const chosen = [...picks.entries()].filter(([, p]) => p.on);
    const items = chosen.map(([id, p]) => {
      const src = store.get(id);
      return { ...src, id: undefined, amount: p.amount, payer: p.payer, month: state.month, date: defaultDateFor(state.month), paid: false };
    });
    if (!items.length) return;
    await store.add(items);
    for (const [, p] of chosen) { p.on = false; p.already = true; }
    ctx.toast(`${items.length} added to ${monthName(state.month)}`);
  },
};

export function render(ctx) {
  const tabs = segmented('mode', [
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'last', label: 'From last month' },
  ], mode, { action: 'mode' });
  const body = mode === 'income' ? renderIncome(ctx) : mode === 'last' ? renderLast(ctx) : renderExpense(ctx);
  return `<section class="stack"><div class="toolbar">${tabs}</div>${body}</section>`;
}

export function mount(root, ctx) {
  const form = root.querySelector('#add-form');
  if (form) {
    bindTxForm(form, ctx.store);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { tx, error } = readTxForm(form);
      if (error) { form.querySelector('.form-error').textContent = error; return; }
      await ctx.store.add(tx);
      ctx.toast(`${tx.type === 'income' ? 'Income' : 'Expense'} added to ${monthName(tx.month)}`);
    });
  }
  root.querySelectorAll('form[data-income]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseAmount(f.elements.amount.value);
    if (Number.isNaN(amount) || !amount) { f.elements.amount.focus(); return; }
    const m = ctx.state.month;
    await ctx.store.add({
      type: 'income', payer: f.dataset.income, amount, month: m, date: defaultDateFor(m),
      description: f.elements.description.value.trim() || `Salary ${f.dataset.income}`,
      category: f.elements.category.value,
    });
    ctx.toast('Income added');
  }));
  root.querySelectorAll('input[data-pick-amount]').forEach((inp) => inp.addEventListener('input', () => {
    const v = parseAmount(inp.value);
    if (!Number.isNaN(v)) picks.get(inp.dataset.pickAmount).amount = v;
    const total = sum([...picks.values()].filter((p) => p.on));
    const out = root.querySelector('[data-pick-total]');
    if (out) out.textContent = money(total);
  }));
}

/* ----- Expense ----- */
function renderExpense({ store, state }) {
  const cur = summarize(store.tx, state.month, store.settings.people);
  // Quick picks: most frequent descriptions from the last 3 months.
  const recent = store.tx.filter((t) => t.type === 'expense' && t.month >= addMonths(state.month, -3) && t.month <= state.month);
  const quick = topItems(recent).sort((a, b) => b.count - a.count).slice(0, 10);
  return `
    ${statStrip([
      { label: `Spent in ${monthName(state.month).slice(0, 3)}`, value: money(cur.expenses) },
      { label: 'To pay', value: money(cur.unpaidAmount), tone: cur.unpaid.length ? 'warn' : '' },
      { label: 'Left', value: money(cur.remaining), tone: cur.remaining < 0 ? 'bad' : 'good' },
    ])}
    ${quick.length ? `<div class="chips-scroll" aria-label="Quick fill">${quick.map((q) =>
      `<button type="button" class="chip" data-action="quick-fill" data-desc="${esc(q.last.description)}">${esc(q.last.description)}</button>`).join('')}</div>` : ''}
    <form id="add-form" class="card form" autocomplete="off">
      ${txForm(store, { type: 'expense', month: state.month }, { month: state.month, idPrefix: 'add' })}
      <p class="form-error" role="alert"></p>
      <button type="submit" class="btn primary block">Add</button>
    </form>`;
}

/* ----- Income ----- */
function renderIncome({ store, state }) {
  const s = store.settings;
  const m = state.month;
  const prevKey = addMonths(m, -1);
  const cur = summarize(store.tx, m, s.people);
  const prev = summarize(store.tx, prevKey, s.people);
  const cats = s.incomeCategories;

  const cards = s.people.map((p) => {
    const mine = cur.inc.filter((t) => t.payer === p);
    const last = prev.inc.find((t) => t.payer === p);
    return `<div class="card">
      <div class="card-head"><h2><span class="avatar sm p${personIndex(store, p)}">${esc(p[0])}</span> ${esc(p)}</h2>
        <b>${money(sum(mine))}</b></div>
      ${mine.length ? `<ul class="mini-list">${mine.map((t) => `<li>
        <button type="button" class="linkish" data-action="edit" data-id="${t.id}">${esc(t.description)} <small>${esc(t.category)}</small></button>
        <span>${money(t.amount)}</span>
        <button type="button" class="icon-btn sm" data-action="del-income" data-id="${t.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>` : ''}
      <form class="inline-form" data-income="${esc(p)}">
        <input name="amount" inputmode="decimal" placeholder="${last ? esc(String(last.amount)) : 'Amount'}" aria-label="Amount for ${esc(p)}" required>
        <input name="description" placeholder="Salary ${esc(p)}" aria-label="Description">
        <select name="category" aria-label="Category">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <button class="btn primary">Add</button>
      </form>
      ${last ? `<p class="hint left">Last month: ${esc(last.description)} ${money(last.amount)}</p>` : ''}
    </div>`;
  }).join('');

  return `
    ${statStrip([
      { label: `Income ${monthName(m).slice(0, 3)}`, value: money(cur.income), sub: deltaBadge(cur.income, prev.income, { goodWhenDown: false }) },
      { label: 'Expenses', value: money(cur.expenses) },
      { label: 'Left', value: money(cur.remaining), tone: cur.remaining < 0 ? 'bad' : 'good' },
    ])}
    ${!cur.inc.length && prev.inc.length ? `<button class="btn block" data-action="copy-income">Copy ${monthName(prevKey)} income (${money(prev.income)})</button>` : ''}
    ${cards}`;
}

/* ----- Copy from last month ----- */
function renderLast({ store, state }) {
  const s = store.settings;
  const m = state.month;
  const prevKey = addMonths(m, -1);
  const prev = summarize(store.tx, prevKey, s.people);
  const curDescs = new Set(inMonth(store.tx, m).filter((t) => t.type === 'expense').map((t) => baseKey(t.description)));

  if (picksMonth !== m) {
    picks = new Map();
    picksMonth = m;
  }
  for (const t of prev.exp) {
    if (!picks.has(t.id)) {
      const already = curDescs.has(baseKey(t.description));
      picks.set(t.id, { on: !already, already, amount: t.amount, payer: t.payer });
    }
  }
  if (!prev.exp.length) {
    return emptyState(`Nothing in ${monthName(prevKey)}`, 'There are no expenses last month to copy from.');
  }
  const rows = prev.exp.slice().sort((a, b) => a.category.localeCompare(b.category) || b.amount - a.amount);
  const selected = rows.filter((t) => picks.get(t.id).on);
  const selTotal = sum(selected.map((t) => picks.get(t.id)));

  return `
    ${statStrip([
      { label: `${monthName(prevKey).slice(0, 3)} total`, value: money(prev.expenses), sub: `${prev.exp.length} items` },
      { label: 'Already added', value: String(rows.filter((t) => picks.get(t.id).already).length) },
      { label: 'Selected', value: `<span data-pick-total>${money(selTotal)}</span>`, sub: `${selected.length} items` },
    ])}
    <div class="toolbar between">
      <span class="muted">Copy bills from ${esc(monthName(prevKey))} → ${esc(monthName(m))}</span>
      <span>
        <button class="chip" data-action="pick-all" data-value="on">All</button>
        <button class="chip" data-action="pick-all" data-value="off">None</button>
      </span>
    </div>
    <ul class="card flush pick-list">${rows.map((t) => {
      const p = picks.get(t.id);
      const kw = kwAttrs(store, t.description);
      return `<li class="pick${p.on ? ' on' : ''}${p.already ? ' already' : ''}${kw.cls}"${kw.attr}>
        <button type="button" class="check${p.on ? ' on' : ''}" data-action="pick-toggle" data-id="${t.id}" aria-pressed="${p.on}" aria-label="Select ${esc(t.description)}">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        <div class="pick-main">
          <span class="tx-title">${esc(t.description)}</span>
          <span class="tx-sub">${esc(t.category)}${p.already ? ' · <b>already this month</b>' : ''}</span>
        </div>
        <input class="pick-amt" data-pick-amount="${t.id}" inputmode="decimal" value="${p.amount}" aria-label="Amount">
        <button type="button" class="payer p${personIndex(store, p.payer)}" data-action="pick-swap" data-id="${t.id}">${esc(p.payer)}<span class="swap-ico">⇄</span></button>
      </li>`;
    }).join('')}</ul>
    <div class="sticky-cta"><button class="btn primary block" data-action="pick-add" ${selected.length ? '' : 'disabled'}>
      Add ${selected.length} to ${esc(monthName(m))}</button></div>
    <p class="hint">Copied items start as “to pay”. Adjust the amount or tap the name to change who pays.</p>`;
}
