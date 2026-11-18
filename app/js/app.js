import { Store } from './store.js';
import { monthKey, addMonths, monthLabel, setCurrency } from './util.js';
import { openTxSheet, toast } from './ui.js';
import * as home from './views/home.js';
import * as current from './views/current.js';
import * as add from './views/add.js';
import * as stats from './views/stats.js';
import * as history from './views/history.js';
import * as settings from './views/settings.js';

const views = { home, current, add, stats, history, settings };
const TITLES = { home: 'Overview', current: 'This month', add: 'Add', stats: 'Stats', history: 'History', settings: 'Settings' };

const state = { month: monthKey(), tab: 'home', query: '' };
try { const m = sessionStorage.getItem('budget.month'); if (/^\d{4}-\d{2}$/.test(m)) state.month = m; } catch { /* ignore */ }

const store = new Store();
const root = document.getElementById('view');

const ctx = {
  store,
  state,
  toast,
  render: () => render(),
  go: (tab) => { location.hash = `#/${tab}`; },
  setMonth(m) {
    state.month = m;
    try { sessionStorage.setItem('budget.month', m); } catch { /* ignore */ }
    render();
  },
  openTx: (tx, defaults) => openTxSheet(ctx, tx, defaults),
};

// Actions available on every screen.
const shared = {
  async 'toggle-paid'(el) {
    const t = store.get(el.dataset.id);
    if (!t) return;
    const was = t.paid;
    await store.update(t.id, { paid: !was });
    toast(was ? `“${t.description}” back to “to pay”` : `“${t.description}” paid`, { undo: () => store.update(t.id, { paid: was }) });
  },
  async swap(el) {
    const t = store.get(el.dataset.id);
    const ppl = store.settings.people;
    if (!t || ppl.length < 2) return;
    const next = ppl[(ppl.indexOf(t.payer) + 1) % ppl.length];
    await store.update(t.id, { payer: next });
    toast(`${t.description}: now paid by ${next}`);
  },
  edit(el) { const t = store.get(el.dataset.id); if (t) ctx.openTx(t); },
  'new-expense'() { ctx.openTx(null, { type: 'expense' }); },
  'new-income'() { ctx.openTx(null, { type: 'income' }); },
  'month-prev'() { ctx.setMonth(addMonths(state.month, -1)); },
  'month-next'() { ctx.setMonth(addMonths(state.month, 1)); },
  'month-today'() { ctx.setMonth(monthKey()); },
  'pick-month'(el) { ctx.setMonth(el.dataset.month); },
  async 'sync-now'() {
    if (!store.connected) { ctx.go('settings'); return; }
    try { await store.pull(); toast('Up to date with the Google Sheet'); } catch (e) { toast(`Sync failed: ${e.message}`); }
  },
};

/* ---------- sync status + invite links ---------- */
const SYNC_TEXT = {
  synced: '✓ Synced', syncing: '↻ Syncing…', pending: '↑ Saving…', offline: '⏸ Offline', error: '⚠ Sync error',
};
function renderSync() {
  const b = document.getElementById('syncBtn');
  const st = store.sync.state;
  b.hidden = st === 'local';
  b.dataset.state = st;
  const n = store.pending.length;
  b.textContent = SYNC_TEXT[st] + ((st === 'offline' || st === 'error') && n ? ` · ${n} waiting` : '');
  b.title = store.sync.error || 'Tap to sync now';
}
store.onSync(() => { renderSync(); if (state.tab === 'settings' && store.connected) render(); });

async function handleInvite(query) {
  const p = new URLSearchParams(query);
  window.history.replaceState(null, '', '#/settings'); // don't keep the secret in the address bar
  const url = p.get('u'), key = p.get('k');
  if (!url || !key) return;
  if (store.connected && store.syncConfig()?.url === url) { toast('Already connected'); return; }
  if (!confirm('Connect this device to your shared Google Sheet?\n\nThe budget on this device will be replaced by the data from the sheet.')) return;
  toast('Connecting…');
  try {
    const n = await store.connect(url, key);
    toast(`Connected · ${n} transactions loaded`);
  } catch (e) {
    alert(`Could not connect: ${e.message}`);
  }
}

function route() {
  const [tab, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  if (tab === 'connect') { handleInvite(query).then(route); return; }
  state.tab = views[tab] ? tab : 'home';
  state.query = query;
  views[state.tab].enter?.(ctx);
  render();
  window.scrollTo(0, 0);
}

function render() {
  setCurrency(store.settings.currency);
  const label = document.getElementById('monthLabel');
  label.textContent = monthLabel(state.month);
  label.classList.toggle('is-now', state.month === monthKey());
  document.getElementById('pageTitle').textContent = TITLES[state.tab];
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === state.tab));
  document.body.dataset.tab = state.tab;
  const v = views[state.tab];
  const y = window.scrollY;
  root.innerHTML = v.render(ctx);
  v.mount?.(root, ctx);
  window.scrollTo(0, y);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('dialog')) return;
  const name = el.dataset.action;
  const fn = views[state.tab].actions?.[name] || shared[name];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el, ctx, e);
  } catch (err) {
    console.error(err);
    toast('Something went wrong');
  }
});

store.subscribe(render);
await store.init();
window.addEventListener('hashchange', route);
route();
renderSync();

// Keep both phones up to date: on start, when the app comes back to the
// foreground, when the connection returns, and every 2 minutes while open.
const autoPull = (minAgeMs) => {
  if (!store.connected || document.visibilityState !== 'visible') return;
  if (Date.now() - store.sync.lastPull < minAgeMs) { store.flush(); return; }
  store.pull().catch(() => {});
};
autoPull(0);
document.addEventListener('visibilitychange', () => autoPull(15000));
window.addEventListener('online', () => autoPull(0));
setInterval(() => autoPull(110000), 120000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
