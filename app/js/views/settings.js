// Settings: shared Google Sheet, people, categories, highlight colours, import/export.
import { esc, todayISO, KW_COLORS } from '../util.js';
import { parseCSV, rowsToTransactions, toCSV, download } from '../csv.js';
import { normalizeTx, DEFAULT_SETTINGS } from '../store.js';
import { isLikelyScriptUrl, makeInviteCode, makeInviteLink, parseInvite } from '../sync.js';
import { peopleEditorHTML, bindPeopleEditor } from '../people-editor.js';

const GUIDE = 'https://github.com/GGR992/First/blob/main/app/apps-script/SETUP.md';
const TEMPLATE_URL = 'apps-script/Code.gs';

let template = '';        // the Apps Script code, fetched from this app
let scriptShown = false;  // fallback box with the script, if the clipboard is blocked

function makeSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, 'x').replace(/\//g, 'y').replace(/=+$/, '');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

async function loadTemplate() {
  if (template) return template;
  try {
    const r = await fetch(TEMPLATE_URL, { cache: 'no-cache' });
    if (r.ok) template = await r.text();
  } catch { /* offline */ }
  return template;
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
  /** Builds the Apps Script with a fresh secret already filled in, and copies it. */
  async 'copy-script'(el, ctx) {
    const keyInput = document.getElementById('sync-key');
    if (!keyInput.value.trim()) keyInput.value = makeSecret();
    const code = (await loadTemplate()).replace("'PASTE_YOUR_SECRET_HERE'", `'${keyInput.value.trim()}'`);
    if (!code || code.indexOf(keyInput.value.trim()) < 0) { ctx.toast('Could not load the script. Check your connection.'); return; }
    const box = document.getElementById('script-box');
    box.value = code;
    if (await copyText(code)) {
      ctx.toast('Script copied — paste it in Apps Script');
    } else {
      // Some browsers block the clipboard: show the code so it can be selected by hand.
      scriptShown = true;
      document.getElementById('script-wrap').hidden = false;
      box.focus();
      box.select();
      ctx.toast('Select all in the box below and copy it');
    }
  },
  async 'sync-pull'(el, ctx) {
    try { await ctx.store.pull(); ctx.toast('Up to date'); } catch (e) { ctx.toast(`Sync failed: ${e.message}`); }
  },
  /** Share the connection with another person: opens the phone's share sheet (WhatsApp, e-mail, …). */
  async 'share-invite'(el, ctx) {
    const cfg = ctx.store.syncConfig();
    if (!cfg) return;
    const link = makeInviteLink(cfg.url, cfg.key);
    const code = makeInviteCode(cfg.url, cfg.key);
    const text = `Join our shared budget.\n\n1) Open this link in your phone's browser (Safari / Chrome):\n${link}\n\n` +
      `2) If it opens inside another app, copy this code instead and paste it in the Budget app → Settings → Join:\n${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join our budget', text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (await copyText(text)) ctx.toast('Invitation copied — paste it into any app');
    else prompt('Copy this invitation and send it privately:', text);
  },
  async 'copy-code'(el, ctx) {
    const cfg = ctx.store.syncConfig();
    if (!cfg) return;
    if (await copyText(makeInviteCode(cfg.url, cfg.key))) ctx.toast('Code copied');
    else prompt('Copy this code:', makeInviteCode(cfg.url, cfg.key));
  },
  'disconnect'(el, ctx) {
    if (!confirm('Disconnect this device from the Google Sheet? The sheet keeps all data; this device keeps a copy that will no longer sync.')) return;
    ctx.store.disconnect();
    ctx.toast('Disconnected');
  },
};

function connectedCard(store) {
  const st = store.sync;
  const last = st.lastPull ? new Date(st.lastPull).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
  const bad = st.state === 'error' || st.state === 'offline';
  return `<div class="card">
    <div class="card-head"><h2>Shared Google Sheet</h2></div>
    <div class="status-line"><span class="status-dot ${bad ? 'bad' : 'on'}"></span>
      <span>${bad ? esc(st.error || 'Not synced') : 'Connected'} · last update ${esc(last)}${store.pending.length ? ` · ${store.pending.length} change(s) waiting` : ''}</span></div>
    <p class="muted">Everything you add, pay or edit is written to the <b>DB_Transactions</b> tab, and changes made by others show up here.
      ${store.settingsSynced ? 'Names, categories and colours are shared too.' : ''}</p>
    ${store.settingsSynced ? '' : `<p class="callout slim">The script in your sheet is an older version, so names and categories are <b>not</b> shared between phones yet.
      Update it with the current code — see <a href="${GUIDE}" target="_blank" rel="noopener">the guide</a>, “Updating the script”.</p>`}
    <div class="btn-row wrap">
      <button class="btn primary" data-action="share-invite">Share via…</button>
      <button class="btn" data-action="copy-code">Copy code</button>
      <button class="btn" data-action="sync-pull">Sync now</button>
    </div>
    <p class="hint left">“Share via…” opens your phone's share menu (WhatsApp, e-mail, messages…). The invitation contains your secret key — only send it to people you trust.</p>
    <button class="btn ghost danger" data-action="disconnect">Disconnect this device</button>
  </div>`;
}

function setupCard() {
  return `<div class="card">
    <div class="card-head"><h2>Shared Google Sheet</h2></div>
    <p class="muted">Keep your budget in <b>your own Google Sheet</b> so everyone sees the same data on every phone. It's free, and only people you invite can use it. One-time setup, about 10 minutes on a computer.</p>
    <ol class="steps">
      <li>Create a blank Google Sheet (open <b>sheets.new</b>) and name it anything.</li>
      <li>In it choose <b>Extensions → Apps Script</b> and delete all the code in the editor.</li>
      <li>Tap <b>Copy script</b> below, paste it into the editor and click Save 💾.</li>
      <li>Click <b>Deploy → New deployment</b> → ⚙ <b>Web app</b>. Set “Execute as” to <b>Me</b> and “Who has access” to <b>Anyone</b>, then Deploy and Authorize (Google's “unverified app” warning is normal for your own script: Advanced → Go to… → Allow).</li>
      <li>Copy the <b>Web app URL</b> (ends in <b>/exec</b>), paste it below and tap <b>Connect</b>.</li>
    </ol>
    <button type="button" class="btn block" data-action="copy-script">Copy script</button>
    <div id="script-wrap" ${scriptShown ? '' : 'hidden'}><textarea id="script-box" class="script-box" readonly rows="6" aria-label="Script to copy"></textarea></div>
    <form id="sync-form" class="form" autocomplete="off">
      <label class="field"><span>Web app URL</span>
        <input id="sync-url" name="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" required></label>
      <label class="field"><span>Secret key <small>(filled in by “Copy script”; if you already have a script, type its secret)</small></span>
        <input id="sync-key" name="key" type="text" autocapitalize="off" spellcheck="false" required placeholder="secret"></label>
      <p class="form-error" role="alert"></p>
      <button class="btn primary block">Connect</button>
    </form>
    <p class="hint left">Stuck? <a href="${GUIDE}" target="_blank" rel="noopener">Open the step-by-step guide</a>.</p>
  </div>
  <div class="card">
    <div class="card-head"><h2>Join an existing shared budget</h2></div>
    <p class="muted">If someone sent you a link or a code (starts with <b>BUDGET-</b>), paste it here.</p>
    <form id="join-form" class="form" autocomplete="off">
      <label class="field"><span>Link or code</span><input name="invite" placeholder="Paste the link or the BUDGET-… code" autocapitalize="off" spellcheck="false" required></label>
      <p class="form-error" role="alert"></p>
      <button class="btn">Join</button>
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
    <p class="hint left">${store.connected && store.settingsSynced ? 'Shared with everyone connected to the sheet.' : 'Saved on this device.'}</p>
    <button class="btn ghost block" data-action="reset-rules">Restore defaults</button>
  </div>`;
}

function catBlock(store, key, title) {
  const list = store.settings[key];
  return `<div class="card">
    <div class="card-head"><h2>${title}</h2></div>
    <div class="chips-wrap">${list.map((c) => `<span class="chip static">${esc(c)}
      <button type="button" data-action="remove-cat" data-kind="${key}" data-cat="${esc(c)}" aria-label="Remove ${esc(c)}">✕</button></span>`).join('')}</div>
    <form class="inline-form" data-add-cat="${key}">
      <input name="name" placeholder="New category" required aria-label="New category">
      <button class="btn">Add</button>
    </form>
  </div>`;
}

export function render({ store }) {
  const s = store.settings;
  return `<section class="stack">
    ${store.connected ? connectedCard(store) : setupCard()}

    <div class="card">
      <div class="card-head"><h2>People</h2></div>
      <p class="muted">Who shares this budget — from one person to six.</p>
      ${peopleEditorHTML(s.people.filter(Boolean), { currency: s.currency, submit: 'Save',
        hint: 'Renaming a person also updates their past transactions. With one person, expenses are never assigned to anybody.' })}
    </div>

    ${rulesCard(store)}
    ${catBlock(store, 'expenseCategories', 'Expense categories')}
    ${catBlock(store, 'incomeCategories', 'Income categories')}

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

    <p class="hint">Budget app · v3.5 · works offline · <a href="https://github.com/GGR992/First" target="_blank" rel="noopener">source</a></p>
  </section>`;
}

export function mount(root, ctx) {
  const { store } = ctx;
  if (!store.connected) loadTemplate(); // ready before “Copy script” is tapped (clipboard needs a quick reaction)

  const syncForm = root.querySelector('#sync-form');
  if (syncForm) syncForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = syncForm.querySelector('.form-error');
    const url = syncForm.elements.url.value.trim();
    const key = syncForm.elements.key.value.trim();
    if (!isLikelyScriptUrl(url)) { err.textContent = 'That does not look like an Apps Script web app URL (https://script.google.com/macros/s/…/exec).'; return; }
    const btn = syncForm.querySelector('button.primary');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    err.textContent = '';
    try {
      const n = await store.connect(url, key);
      ctx.toast(`Connected · ${n} transactions loaded`);
    } catch (ex) {
      err.textContent = `Could not connect: ${ex.message}. Check the URL, that the secret is the same as in the script, and that “Who has access” is “Anyone”. After editing the script, deploy a new version.`;
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  });

  const join = root.querySelector('#join-form');
  if (join) join.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = join.querySelector('.form-error');
    const inv = parseInvite(join.elements.invite.value);
    if (!inv) { err.textContent = 'That does not look like a link or code from the app.'; return; }
    err.textContent = '';
    await ctx.connectTo(inv.url, inv.key);
  });

  bindPeopleEditor(root.querySelector('.people-form'), async ({ people, renames, removed, currency }) => {
    const affected = removed.reduce((n, name) => n + store.tx.filter((t) => t.payer === name).length, 0);
    if (removed.length && !confirm(`Remove ${removed.join(', ')}? Their ${affected} transaction${affected === 1 ? '' : 's'} stay in History but are no longer counted per person.`)) return;
    await store.saveSettings({ people, currency, configured: true });
    for (const [from, to] of renames) {
      const ids = store.tx.filter((t) => t.payer === from).map((t) => t.id);
      if (ids.length) await store.updateMany(ids, { payer: to });
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
