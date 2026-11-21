// Shared UI building blocks.
import { esc, money, fmtDate, parseAmount, defaultDateFor, monthLabel, addMonths, kwColor } from './util.js';
import { catColor } from './charts.js';

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, { undo } = {}) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="toast-undo">Undo</button>' : ''}`;
  el.classList.add('show');
  if (undo) el.querySelector('.toast-undo').onclick = () => { el.classList.remove('show'); undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2200);
}

/* ---------- small pieces ---------- */
export const personIndex = (store, name) => {
  const i = store.settings.people.indexOf(name);
  return i < 0 ? 9 : i;
};

export function payerChip(store, t, { swap = true } = {}) {
  if (store.settings.people.length < 2) return ''; // one person: nothing to assign
  const i = personIndex(store, t.payer);
  const canSwap = swap && store.settings.people.length > 1;
  return `<button type="button" class="payer p${i}" ${canSwap ? `data-action="swap" data-id="${t.id}" aria-label="Change payer (now ${esc(t.payer)})"` : 'disabled'}>
    ${esc(t.payer || '—')}${canSwap ? '<span class="swap-ico" aria-hidden="true">⇄</span>' : ''}</button>`;
}

/** Attributes that colour an expense row according to the keyword rules in Settings. */
export function kwAttrs(store, description) {
  const k = kwColor(store.settings.keywordRules, description);
  return k ? { cls: ' kw', attr: ` style="--kw:var(--kc-${esc(k)})"` } : { cls: '', attr: '' };
}

export function txRow(store, t, { check = true, swap = true, showMonth = false } = {}) {
  const color = catColor(t.category, store.categoriesFor(t.type));
  const isIncome = t.type === 'income';
  const kw = isIncome ? { cls: '', attr: '' } : kwAttrs(store, t.description);
  const left = isIncome
    ? `<span class="check income" aria-hidden="true">+</span>`
    : check
      ? `<button type="button" class="check${t.paid ? ' on' : ''}" data-action="toggle-paid" data-id="${t.id}" aria-label="${t.paid ? 'Mark as not paid' : 'Mark as paid'}" aria-pressed="${t.paid}">
           <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`
      : '';
  return `<li class="tx${t.paid && !isIncome ? ' is-paid' : ''}${isIncome ? ' is-income' : ''}${kw.cls}"${kw.attr}>
    ${left}
    <button type="button" class="tx-main" data-action="edit" data-id="${t.id}">
      <span class="tx-title">${esc(t.description || '(no description)')}</span>
      <span class="tx-sub"><i class="dot" style="background:${color}"></i>${esc(t.category)} · ${showMonth ? esc(monthLabel(t.month)) : fmtDate(t.date)}</span>
    </button>
    <div class="tx-right">
      <span class="tx-amt${isIncome ? ' pos' : ''}">${isIncome ? '+' : ''}${money(t.amount)}</span>
      ${payerChip(store, t, { swap })}
    </div>
  </li>`;
}

/** items: [{label, value, tone?, sub?, action?, tab?}] */
export function statStrip(items) {
  return `<div class="strip">${items.map((s) => {
    const tag = s.tab ? 'a' : 'div';
    const href = s.tab ? ` href="#/${s.tab}"` : '';
    return `<${tag} class="strip-item${s.tone ? ' ' + s.tone : ''}"${href}>
      <span class="strip-label">${esc(s.label)}</span>
      <span class="strip-value">${s.value}</span>
      ${s.sub ? `<span class="strip-sub">${s.sub}</span>` : ''}
    </${tag}>`;
  }).join('')}</div>`;
}

export function deltaBadge(cur, prev, { goodWhenDown = true, suffix = '' } = {}) {
  if (!prev) return '';
  const d = ((cur - prev) / prev) * 100;
  if (!isFinite(d)) return '';
  const up = d > 0.5, down = d < -0.5;
  const tone = !up && !down ? 'flat' : (up === !goodWhenDown ? 'good' : 'bad');
  return `<span class="delta ${tone}">${up ? '▲' : down ? '▼' : '•'} ${Math.abs(d).toFixed(0)}%${suffix}</span>`;
}

export function segmented(name, options, value, { action } = {}) {
  return `<div class="seg" role="tablist">${options.map((o) => `
    <button type="button" role="tab" class="seg-btn${o.value === value ? ' on' : ''}" aria-selected="${o.value === value}"
      ${action ? `data-action="${action}"` : ''} data-value="${esc(o.value)}" data-name="${name}">${o.label}</button>`).join('')}</div>`;
}

export function emptyState(title, body, actions = '') {
  return `<div class="empty"><div class="empty-ico" aria-hidden="true">🪙</div><h3>${esc(title)}</h3><p>${body}</p>${actions}</div>`;
}

/* ---------- transaction form ---------- */
export function txForm(store, tx, { month, idPrefix = 'f' } = {}) {
  const s = store.settings;
  const type = tx?.type || 'expense';
  const m = tx?.month || month;
  const payer = tx?.payer || s.people[0];
  const cats = store.categoriesFor(type);
  const listId = `${idPrefix}-desc`;
  return `
  <input type="hidden" name="id" value="${esc(tx?.id || '')}">
  <div class="seg seg-type" role="radiogroup" aria-label="Type">
    ${['expense', 'income'].map((v) => `<label class="seg-btn${type === v ? ' on' : ''}">
      <input type="radio" name="type" value="${v}" ${type === v ? 'checked' : ''}>${v === 'expense' ? 'Expense' : 'Income'}</label>`).join('')}
  </div>
  <label class="field"><span>Description</span>
    <input name="description" list="${listId}" autocomplete="off" required placeholder="e.g. Chiria, Vodafone…" value="${esc(tx?.description || '')}">
    <datalist id="${listId}">${store.descriptions().map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
  </label>
  <label class="field"><span>Amount (${esc(s.currency)})</span>
    <input name="amount" inputmode="decimal" autocomplete="off" required placeholder="0" value="${tx?.amount ?? ''}">
  </label>
  ${s.people.length < 2
    ? `<input type="hidden" name="payer" value="${esc(s.people[0] || '')}">`
    : `<div class="field"><span>Paid by</span>
    <div class="seg${s.people.length > 3 ? ' wrap' : ''}" role="radiogroup" aria-label="Payer">
      ${s.people.map((p, i) => `<label class="seg-btn p${i}${payer === p ? ' on' : ''}">
        <input type="radio" name="payer" value="${esc(p)}" ${payer === p ? 'checked' : ''}>${esc(p)}</label>`).join('')}
    </div>
  </div>`}
  <label class="field"><span>Category</span>
    <select name="category">${cats.map((c) => `<option ${c === tx?.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
  </label>
  <div class="row2">
    <label class="field"><span>Budget month</span>
      <input type="month" name="month" required value="${esc(m)}">
    </label>
    <label class="field"><span>Date</span>
      <input type="date" name="date" value="${esc(tx?.date || defaultDateFor(m))}">
    </label>
  </div>
  <div class="month-quick">
    <button type="button" class="chip" data-set-month="${addMonths(month, -1)}">Last month</button>
    <button type="button" class="chip" data-set-month="${month}">This month</button>
    <button type="button" class="chip" data-set-month="${addMonths(month, 1)}">Next month</button>
  </div>
  <label class="toggle paid-toggle" ${type === 'income' ? 'hidden' : ''}>
    <input type="checkbox" name="paid" ${tx?.paid ? 'checked' : ''}>
    <span class="toggle-ui" aria-hidden="true"></span>
    <span>Already paid <small>(paid items move to History)</small></span>
  </label>`;
}

/** Wires up dynamic bits of a txForm: type switch, segmented look, autofill, month chips. */
export function bindTxForm(form, store) {
  const sync = () => {
    form.querySelectorAll('.seg-btn input').forEach((inp) => inp.closest('.seg-btn').classList.toggle('on', inp.checked));
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') {
      const type = e.target.value;
      const sel = form.elements.category;
      sel.innerHTML = store.categoriesFor(type).map((c) => `<option>${esc(c)}</option>`).join('');
      form.querySelector('.paid-toggle').hidden = type === 'income';
    }
    if (e.target.name === 'month') {
      const m = e.target.value;
      if (m && form.elements.date.value.slice(0, 7) !== m) form.elements.date.value = defaultDateFor(m);
    }
    sync();
  });
  form.querySelectorAll('[data-set-month]').forEach((b) => b.addEventListener('click', () => {
    form.elements.month.value = b.dataset.setMonth;
    form.elements.month.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  const desc = form.elements.description;
  desc.addEventListener('change', () => {
    if (form.elements.id.value) return; // don't override when editing
    const last = store.lastByDescription(desc.value);
    if (!last) return;
    const typeInput = form.querySelector(`input[name=type][value=${last.type}]`);
    if (typeInput && !typeInput.checked) { typeInput.checked = true; typeInput.dispatchEvent(new Event('change', { bubbles: true })); }
    form.elements.category.value = last.category;
    const p = form.querySelector(`input[name=payer][value="${CSS.escape(last.payer)}"]`);
    if (p) p.checked = true;
    if (!form.elements.amount.value) form.elements.amount.value = last.amount;
    sync();
  });
}

export function readTxForm(form) {
  const f = form.elements;
  const amount = parseAmount(f.amount.value);
  if (!f.description.value.trim()) return { error: 'Add a description' };
  if (Number.isNaN(amount)) return { error: 'Amount is not a number' };
  const type = form.querySelector('input[name=type]:checked').value;
  return {
    tx: {
      id: f.id.value || undefined,
      type,
      description: f.description.value.trim(),
      amount,
      payer: form.querySelector('input[name=payer]:checked')?.value || form.querySelector('input[type=hidden][name=payer]')?.value || '',
      category: f.category.value,
      month: f.month.value,
      date: f.date.value || `${f.month.value}-01`,
      paid: type === 'income' ? true : f.paid.checked,
    },
  };
}

/* ---------- bottom sheet editor ---------- */
export function openTxSheet(ctx, tx, defaults = {}) {
  const { store, state } = ctx;
  const dlg = document.getElementById('sheet');
  const draft = tx || { type: 'expense', month: state.month, ...defaults };
  const editing = Boolean(tx);
  dlg.innerHTML = `
    <form method="dialog" class="sheet-body">
      <div class="sheet-head">
        <h2>${editing ? 'Edit' : draft.type === 'income' ? 'Add income' : 'Add expense'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      ${txForm(store, draft, { month: state.month, idPrefix: 'sheet' })}
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions">
        ${editing ? '<button type="button" class="btn danger ghost" data-delete>Delete</button>' : ''}
        ${editing && tx.month !== state.month ? `<button type="button" class="btn ghost" data-dup>Copy to ${esc(monthLabel(state.month).split(' ')[0])}</button>` : ''}
        <button type="submit" class="btn primary">${editing ? 'Save' : 'Add'}</button>
      </div>
    </form>`;
  const form = dlg.querySelector('form');
  bindTxForm(form, store);
  const close = () => dlg.close();
  dlg.querySelector('[data-close]').onclick = close;
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { tx: data, error } = readTxForm(form);
    if (error) { form.querySelector('.form-error').textContent = error; return; }
    if (editing) {
      await store.update(tx.id, data);
      toast('Saved');
    } else {
      await store.add(data);
      toast(data.type === 'income' ? 'Income added' : 'Expense added');
    }
    close();
  };
  const del = dlg.querySelector('[data-delete]');
  if (del) del.onclick = async () => {
    const copy = { ...tx };
    await store.remove(tx.id);
    close();
    toast('Deleted', { undo: () => store.add(copy) });
  };
  const dup = dlg.querySelector('[data-dup]');
  if (dup) dup.onclick = async () => {
    await store.add({ ...tx, id: undefined, month: state.month, date: defaultDateFor(state.month), paid: false });
    close();
    toast(`Copied to ${monthLabel(state.month)}`);
  };
  dlg.showModal();
  if (!editing) setTimeout(() => form.elements.description.focus(), 50);
}
