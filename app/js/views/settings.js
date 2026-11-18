// Settings: shared Google Sheet, people, categories, currency, import/export.
import { esc, todayISO, KW_COLORS } from '../util.js';
import { DEFAULT_SETTINGS } from '../store.js';
import { parseCSV, rowsToTransactions, toCSV, download } from '../csv.js';
import { normalizeTx } from '../store.js';
import { isLikelyScriptUrl } from '../sync.js';

const SETUP_GUIDE = 'https://github.com/GGR992/First/blob/main/apps-script/SETUP.md';

function makeSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, 'x').replace(/\//g, 'y').replace(/=+$/, '');
}

function inviteLink(store) {
  const cfg = store.syncConfig();
  if (!cfg) return '';
  const base = location.origin + location.pathname;
  return `${base}#/connect?u=${encodeURIComponent(cfg.url)}&k=${encodeURIComponent(cfg.key)}`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const actions = {
  'remove-rule'(el, ctx) {
    const rules = ctx.store.settings.keywordRules.filter((_, i) => i !== Number(el.dataset.i));
    ctx.store.saveSettings({ keywordRules: rules });
  },
  'reset-rules'(el, ctx) {
    if (!confirm('Restore the default highlight colours? Your own rules on this device will be removed.')) return;
    ctx.store.saveSettings({ keywordRules: structuredClone(DEFAULT_SETTINGS.keywordRules) });
  },
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
    if (ctx.store.connected) {
      await ctx.store.clear();
      ctx.toast('Reloaded from the Google Sheet');
      return;
    }
    if (!confirm('Delete ALL transactions on this device? Export a backup first if unsure.')) return;
    await ctx.store.clear();
    ctx.toast('All data cleared');
  },
  'gen-secret'() {
    const inp = document.getElementById('sync-key');
    inp.value = makeSecret();
    inp.type = 'text';
    copyText(inp.value);
  },
  async 'copy-secret'(el, ctx) {
    const v = document.getElementById('sync-key').value;
    if (v && await copyText(v)) ctx.toast('Secret copied');
  },
  async 'sync-pull'(el, ctx) {
    try { await ctx.store.pull(); ctx.toast('Up to date'); } catch (e) { ctx.toast(`Sync failed: ${e.message}`); }
  },
  async 'share-invite'(el, ctx) {
    const link = inviteLink(ctx.store);
    const text = 'Open this link on your phone to connect the budget app to our shared sheet:';
    if (navigator.share) {
      try { await navigator.share({ title: 'Home Budget', text, url: link }); return; } catch { /* cancelled */ }
    }
    if (await copyText(link)) ctx.toast('Invite link copied – send it privately');
    else prompt('Copy this link and send it privately:', link);
  },
  'disconnect'(el, ctx) {
    if (!confirm('Disconnect this device from the Google Sheet? The sheet keeps all data; this device keeps a copy that will no longer sync.')) return;
    ctx.store.disconnect();
    ctx.toast('Disconnected');
  },
};

function syncCard(store) {
  if (store.connected) {
    const st = store.sync;
    const last = st.lastPull ? new Date(st.lastPull).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
    const bad = st.state === 'error' || st.state === 'offline';
    return `<div class="card">
      <div class="card-head"><h2>Shared Google Sheet</h2></div>
      <div class="status-line"><span class="status-dot ${bad ? 'bad' : 'on'}"></span>
        <span>${bad ? esc(st.error || 'Not synced') : 'Connected'} · last update ${esc(last)}${store.pending.length ? ` · ${store.pending.length} change(s) waiting` : ''}</span></div>
      <p class="muted">Everything you add, pay or edit is written to <b>DB_Transactions</b>, and changes made by the other phone (or in the sheet) show up here.</p>
      <div class="btn-row wrap">
        <button class="btn primary" data-action="share-invite">Invite the other phone</button>
        <button class="btn" data-action="sync-pull">Sync now</button>
        <button class="btn ghost danger" data-action="disconnect">Disconnect</button>
      </div>
      <p class="hint left">The invite link contains your secret key. Only send it in a private chat.</p>
    </div>`;
  }
  return `<div class="card">
    <div class="card-head"><h2>Shared Google Sheet</h2></div>
    <p class="muted">Connect to your <b>DB_Transactions</b> tab so you both see and edit the same data.
      You need a small script in your Google account first (one-time, ~10 min): <a href="${SETUP_GUIDE}" target="_blank" rel="noopener">step-by-step guide</a>.</p>
    <form id="sync-form" class="form" autocomplete="off">
      <label class="field"><span>Web app URL (ends with /exec)</span>
        <input id="sync-url" name="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" required></label>
      <label class="field"><span>Secret key (the same one you put in the script)</span>
        <div class="secret-row"><input id="sync-key" name="key" type="password" required placeholder="secret">
          <button type="button" class="btn" data-action="gen-secret" title="Generate a random secret">Generate</button></div></label>
      <p class="hint left">Tip: tap Generate, then paste the copied secret into the script's <code>SECRET</code> line.</p>
      <p class="form-error" role="alert"></p>
      <button class="btn primary block">Connect</button>
    </form>
  </div>`;
}

const colorOptions = (sel) => KW_COLORS.map((c) => `<option value="${c.key}" ${c.key === sel ? 'selected' : ''}>${c.label}</option>`).join('');

function rulesCard(store) {
  const rules = store.settings.keywordRules || [];
  return `<div class="card">
    <div class="card-head"><h2>Highlight colours</h2></div>
    <p class="muted">An expense whose name contains a keyword is shown in that colour everywhere (lists, month, history).
      Upper/lower case is ignored. If several keywords match, the first one in the list wins.</p>
    <ul class="rules">${rules.map((r, i) => `<li style="--kw:var(--kc-${esc(r.color)})">
      <span class="rule-sample">Aa</span>
      <b class="rule-word">${esc(r.keyword)}</b>
      <select data-rule-color="${i}" aria-label="Colour for ${esc(r.keyword)}">${colorOptions(r.color)}</select>
      <button type="button" class="icon-btn sm" data-action="remove-rule" data-i="${i}" aria-label="Remove ${esc(r.keyword)}">✕</button></li>`).join('')}</ul>
    <form id="rule-form" class="inline-form">
      <input name="keyword" placeholder="Keyword, e.g. Joint" required aria-label="Keyword">
      <select name="color" aria-label="Colour">${colorOptions('blue')}</select>
      <button class="btn">Add rule</button>
    </form>
    <p class="hint left">Rules are saved on this device. Set the same ones on the other phone if you change them.</p>
    <button class="btn ghost block" data-action="reset-rules">Restore defaults</button>
  </div>`;
}

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
    ${syncCard(store)}

    <div class="card">
      <div class="card-head"><h2>People</h2></div>
      <form id="people-form" class="form">
        ${s.people.map((p, i) => `<label class="field"><span>Person ${i + 1}</span><input name="p${i}" value="${esc(p)}" required></label>`).join('')}
        <label class="field"><span>Currency label</span><input name="currency" value="${esc(s.currency)}" placeholder="lei"></label>
        <p class="hint left">Names must match the Payer column in the sheet. Renaming also updates past transactions.</p>
        <button class="btn primary">Save</button>
      </form>
    </div>

    ${rulesCard(store)}

    ${catBlock('expenseCategories', 'Expense categories')}
    ${catBlock('incomeCategories', 'Income categories')}

    <div class="card">
      <div class="card-head"><h2>Data</h2></div>
      <p class="muted">${store.tx.length} transactions · stored in <b>${esc(store.storageLabel)}</b>.</p>
      <div class="btn-row wrap">
        <button class="btn" data-action="export-csv">Export CSV</button>
        <button class="btn" data-action="export-json">Backup (JSON)</button>
      </div>
      ${store.connected ? '' : `
      <label class="field"><span>Import CSV (Google Sheet → DB_Transactions → File › Download › CSV) or JSON backup</span>
        <input type="file" id="import-file" accept=".csv,.json,text/csv,application/json">
      </label>
      <label class="toggle"><input type="checkbox" id="import-replace"><span class="toggle-ui" aria-hidden="true"></span><span>Replace everything (otherwise merge, skipping duplicates)</span></label>
      <p id="import-msg" class="hint left" role="status"></p>`}
      <hr>
      ${store.connected
        ? '<button class="btn ghost" data-action="clear-all">Reload this device from the sheet</button>'
        : '<button class="btn danger ghost" data-action="clear-all">Delete all data on this device</button>'}
    </div>

    <p class="hint">Budget app · v3 · works offline · <a href="https://github.com/GGR992/First" target="_blank" rel="noopener">source</a></p>
  </section>`;
}

export function mount(root, ctx) {
  const { store } = ctx;

  const syncForm = root.querySelector('#sync-form');
  if (syncForm) syncForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = syncForm.querySelector('.form-error');
    const url = syncForm.elements.url.value.trim();
    const key = syncForm.elements.key.value.trim();
    if (!isLikelyScriptUrl(url)) { err.textContent = 'That does not look like an Apps Script web app URL (https://script.google.com/macros/s/…/exec).'; return; }
    if (store.tx.length && !confirm(`This device has ${store.tx.length} transactions. After connecting, it will show the data from the Google Sheet instead. Continue?`)) return;
    const btn = syncForm.querySelector('button.primary');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    err.textContent = '';
    try {
      const n = await store.connect(url, key);
      ctx.toast(`Connected · ${n} transactions loaded`);
    } catch (ex) {
      err.textContent = `Could not connect: ${ex.message}. Check the URL, the secret, and that the deployment has access “Anyone”.`;
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });

  root.querySelector('#people-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const old = store.settings.people;
    const people = old.map((_, i) => f[`p${i}`].value.trim()).filter(Boolean);
    if (new Set(people).size !== people.length) { ctx.toast('Names must be different'); return; }
    await store.saveSettings({ people, currency: f.currency.value.trim() });
    for (let i = 0; i < old.length; i++) {
      if (people[i] && people[i] !== old[i]) {
        const ids = store.tx.filter((t) => t.payer === old[i]).map((t) => t.id);
        if (ids.length) await store.updateMany(ids, { payer: people[i] });
      }
    }
    ctx.toast('Saved');
  });

  root.querySelectorAll('select[data-rule-color]').forEach((sel) => sel.addEventListener('change', () => {
    const rules = store.settings.keywordRules.map((r, i) => (i === Number(sel.dataset.ruleColor) ? { ...r, color: sel.value } : r));
    store.saveSettings({ keywordRules: rules });
  }));
  root.querySelector('#rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const keyword = f.keyword.value.trim();
    if (!keyword) return;
    const rules = store.settings.keywordRules || [];
    if (rules.some((r) => r.keyword.toLowerCase() === keyword.toLowerCase())) { ctx.toast('That keyword already exists'); return; }
    await store.saveSettings({ keywordRules: [...rules, { keyword, color: f.color.value }] });
  });

  root.querySelectorAll('form[data-add-cat]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = form.dataset.addCat;
    const name = form.elements.name.value.trim();
    if (name && !store.settings[key].includes(name)) await store.saveSettings({ [key]: [...store.settings[key], name] });
  }));

  const file = root.querySelector('#import-file');
  if (file) file.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    const msg = root.querySelector('#import-msg');
    if (!f) return;
    try {
      const text = await f.text();
      let txs, settings, skipped = [];
      if (f.name.endsWith('.json') || text.trim().startsWith('{')) {
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
