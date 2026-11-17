// Settings: people, categories, currency, import/export.
import { esc, todayISO } from '../util.js';
import { parseCSV, rowsToTransactions, toCSV, download } from '../csv.js';
import { normalizeTx } from '../store.js';

export const actions = {
  'remove-cat'(el, ctx) {
    const key = el.dataset.kind;
    ctx.store.saveSettings({ [key]: ctx.store.settings[key].filter((c) => c !== el.dataset.cat) });
  },
  'export-csv'(el, ctx) { download(`budget-${todayISO()}.csv`, toCSV(ctx.store.tx)); },
  'export-json'(el, ctx) {
    download(`budget-backup-${todayISO()}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: ctx.store.settings, transactions: ctx.store.tx }, null, 1),
      'application/json');
  },
  async 'clear-all'(el, ctx) {
    if (!confirm('Delete ALL transactions on this device? Export a backup first if unsure.')) return;
    await ctx.store.clear();
    ctx.toast('All data cleared');
  },
};

export function render({ store }) {
  const s = store.settings;
  const catBlock = (key, title) => `
    <div class="card">
      <div class="card-head"><h2>${title}</h2></div>
      <div class="chips-wrap">${s[key].map((c) => `<span class="chip static">${esc(c)}
        <button type="button" data-action="remove-cat" data-kind="${key}" data-cat="${esc(c)}" aria-label="Remove ${esc(c)}">✕</button></span>`).join('')}</div>
      <form class="inline-form" data-add-cat="${key}">
        <input name="name" placeholder="New category" required aria-label="New category">
        <button class="btn">Add</button>
      </form>
    </div>`;

  return `<section class="stack">
    <div class="card">
      <div class="card-head"><h2>People</h2></div>
      <form id="people-form" class="form">
        ${s.people.map((p, i) => `<label class="field"><span>Person ${i + 1}</span><input name="p${i}" value="${esc(p)}" required></label>`).join('')}
        <label class="field"><span>Currency label</span><input name="currency" value="${esc(s.currency)}" placeholder="lei"></label>
        <p class="hint left">Renaming a person also updates their past transactions.</p>
        <button class="btn primary">Save</button>
      </form>
    </div>

    ${catBlock('expenseCategories', 'Expense categories')}
    ${catBlock('incomeCategories', 'Income categories')}

    <div class="card">
      <div class="card-head"><h2>Data</h2></div>
      <p class="muted">${store.tx.length} transactions · stored in <b>${esc(store.adapter.label)}</b>.
        Until cloud sync is set up, each phone has its own copy — use export/import to move data.</p>
      <div class="btn-row wrap">
        <button class="btn" data-action="export-csv">Export CSV</button>
        <button class="btn" data-action="export-json">Backup (JSON)</button>
      </div>
      <label class="field"><span>Import CSV (Google Sheet → DB_Transactions → File › Download › CSV) or JSON backup</span>
        <input type="file" id="import-file" accept=".csv,.json,text/csv,application/json">
      </label>
      <label class="toggle"><input type="checkbox" id="import-replace"><span class="toggle-ui" aria-hidden="true"></span><span>Replace everything (otherwise merge, skipping duplicates)</span></label>
      <p id="import-msg" class="hint left" role="status"></p>
      <hr>
      <button class="btn danger ghost" data-action="clear-all">Delete all data on this device</button>
    </div>

    <p class="hint">Budget app · v1 · works offline · <a href="https://github.com/ggr992/first" target="_blank" rel="noopener">source</a></p>
  </section>`;
}

export function mount(root, ctx) {
  const { store } = ctx;
  root.querySelector('#people-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const old = store.settings.people;
    const people = old.map((_, i) => f[`p${i}`].value.trim()).filter(Boolean);
    if (new Set(people).size !== people.length) { ctx.toast('Names must be different'); return; }
    old.forEach((name, i) => {
      if (people[i] && people[i] !== name) store.tx.forEach((t) => { if (t.payer === name) t.payer = people[i]; });
    });
    await store.saveSettings({ people, currency: f.currency.value.trim() });
    ctx.toast('Saved');
  });
  root.querySelectorAll('form[data-add-cat]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = form.dataset.addCat;
    const name = form.elements.name.value.trim();
    if (name && !store.settings[key].includes(name)) await store.saveSettings({ [key]: [...store.settings[key], name] });
  }));
  root.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const msg = root.querySelector('#import-msg');
    if (!file) return;
    try {
      const text = await file.text();
      let txs, settings, skipped = [];
      if (file.name.endsWith('.json') || text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        txs = (data.transactions || []).map(normalizeTx);
        settings = data.settings;
      } else {
        ({ transactions: txs, skipped } = rowsToTransactions(parseCSV(text)));
      }
      const replace = root.querySelector('#import-replace').checked;
      const months = new Set(txs.map((t) => t.month)).size;
      if (!confirm(`${replace ? 'Replace all data with' : 'Merge'} ${txs.length} transactions across ${months} months?`)) { e.target.value = ''; return; }
      if (settings) await store.saveSettings(settings);
      await store.import(txs, replace ? 'replace' : 'merge');
      ctx.toast(`Imported ${txs.length} transactions`);
      if (skipped.length) setTimeout(() => {
        const m = document.getElementById('import-msg');
        if (m) m.textContent = `Skipped ${skipped.length} rows without a month/description (rows ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}).`;
      }, 0);
    } catch (err) {
      console.error(err);
      msg.textContent = `Could not import: ${err.message}`;
    }
  });
}
