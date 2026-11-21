// Editor for the list of people (1–6) and the currency label.
// Used by the welcome screen and by Settings. Rows are added/removed in place, so typed text is never lost.
import { esc } from './util.js';
import { MAX_PEOPLE } from './store.js';

const row = (name, i, canRemove) => `<div class="person-edit" data-orig="${esc(name)}">
  <input name="person" value="${esc(name)}" placeholder="Name ${i + 1}" maxlength="24" autocomplete="off" aria-label="Person ${i + 1}">
  <button type="button" class="icon-btn sm" data-remove-person aria-label="Remove person" ${canRemove ? '' : 'hidden'}>✕</button>
</div>`;

/** names: current names (use [''] for a blank start). */
export function peopleEditorHTML(names, { currency, submit = 'Save', hint = '' } = {}) {
  const list = names.length ? names : [''];
  return `<form class="form people-form" autocomplete="off">
    <div class="people-rows">${list.map((n, i) => row(n, i, list.length > 1)).join('')}</div>
    <button type="button" class="btn ghost" data-add-person ${list.length >= MAX_PEOPLE ? 'hidden' : ''}>+ Add person</button>
    <label class="field"><span>Currency label</span><input name="currency" value="${esc(currency ?? '')}" placeholder="lei, €, $ …" maxlength="8"></label>
    ${hint ? `<p class="hint left">${hint}</p>` : ''}
    <p class="form-error" role="alert"></p>
    <button class="btn primary" type="submit">${esc(submit)}</button>
  </form>`;
}

/**
 * onSubmit receives { people: [names], renames: [[old, new]], removed: [old names], currency }.
 * Return a string to show it as an error and keep the form open.
 */
export function bindPeopleEditor(form, onSubmit) {
  const rows = form.querySelector('.people-rows');
  const addBtn = form.querySelector('[data-add-person]');
  const refresh = () => {
    const items = [...rows.children];
    items.forEach((r, i) => {
      r.querySelector('input').placeholder = `Name ${i + 1}`;
      r.querySelector('input').setAttribute('aria-label', `Person ${i + 1}`);
      r.querySelector('[data-remove-person]').hidden = items.length < 2;
    });
    addBtn.hidden = items.length >= MAX_PEOPLE;
  };
  addBtn.addEventListener('click', () => {
    if (rows.children.length >= MAX_PEOPLE) return;
    rows.insertAdjacentHTML('beforeend', row('', rows.children.length, true));
    refresh();
    rows.lastElementChild.querySelector('input').focus();
  });
  rows.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-person]');
    if (!b || rows.children.length < 2) return;
    b.closest('.person-edit').remove();
    refresh();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const entries = [...rows.children]
      .map((r) => ({ orig: r.dataset.orig || '', name: r.querySelector('input').value.trim() }))
      .filter((x) => x.name);
    const names = entries.map((x) => x.name);
    if (!names.length) { err.textContent = 'Add at least one name'; return; }
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) { err.textContent = 'Names must be different'; return; }
    const kept = new Set(entries.map((x) => x.orig).filter(Boolean));
    const originals = [...rows.children].map((r) => r.dataset.orig).filter(Boolean);
    const removed = [...new Set([...form.dataset.origAll.split('\u0001').filter(Boolean), ...originals])].filter((n) => !kept.has(n));
    const renames = entries.filter((x) => x.orig && x.orig !== x.name).map((x) => [x.orig, x.name]);
    err.textContent = '';
    const problem = await onSubmit({ people: names, renames, removed, currency: form.elements.currency.value.trim() });
    if (typeof problem === 'string') err.textContent = problem;
  });
  // Remember every original name so removals of rows are detected.
  form.dataset.origAll = [...rows.children].map((r) => r.dataset.orig).filter(Boolean).join('\u0001');
}
