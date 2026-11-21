import { Store } from './store.js';
import { monthKey, addMonths, monthLabelShort, setCurrency, esc } from './util.js';
import { openTxSheet, toast } from './ui.js';
import * as home from './views/home.js';
import * as current from './views/current.js';
import * as add from './views/add.js';
import * as stats from './views/stats.js';
import * as history from './views/history.js';
import * as settings from './views/settings.js';
import * as welcome from './views/welcome.js';
import { personIndex } from './ui.js';

const views = { home, current, add, stats, history, settings, welcome };
// Screens that follow the person selector (All / one person).
const PERSON_TABS = new Set(['home', 'current', 'stats']);
let personMenuOpen = false;
const TITLES = { home: 'Overview', current: 'This month', add: 'Add', stats: 'Stats', history: 'History', settings: 'Settings' };

const state = { month: monthKey(), tab: 'home', query: '', person: 'all' };
try { state.person = localStorage.getItem('budget.person') || 'all'; } catch { /* ignore */ }
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
  /** Connect this device to a shared Google Sheet (after asking for confirmation when data would be replaced). */
  async connectTo(url, key, { confirmFirst = true } = {}) {
    if (store.connected && store.syncConfig()?.url === url) { toast('Already connected'); return true; }
    if (confirmFirst && store.tx.length && !confirm('Connect this device to the shared Google Sheet?\n\nThe budget on this device will be replaced by the data from the sheet.')) return false;
    toast('Connecting…');
    try {
      const n = await store.connect(url, key);
      toast(`Connected · ${n} transactions loaded`);
      return true;
    } catch (e) {
      alert(`Could not connect: ${e.message}`);
      return false;
    }
  },
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
  'set-person'(el) {
    state.person = el.dataset.value;
    personMenuOpen = false;
    try { localStorage.setItem('budget.person', state.person); } catch { /* ignore */ }
    render();
  },
  'toggle-person-menu'() { personMenuOpen = !personMenuOpen; render(); },
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
// Background updates (sync) must never wipe a field the person is typing in: wait until they leave it.
let renderPending = false;
const isEditing = () => {
  const a = document.activeElement;
  if (!a || !root.contains(a)) return false;
  return a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(a.type));
};
function renderBackground() {
  if (isEditing()) { renderPending = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !isEditing()) { renderPending = false; render(); } }, 150));
store.onSync(() => { renderSync(); if (state.tab === 'settings' && store.connected) renderBackground(); });

async function handleInvite(query) {
  const p = new URLSearchParams(query);
  window.history.replaceState(null, '', '#/settings'); // don't keep the secret in the address bar
  const url = p.get('u'), key = p.get('k');
  if (!url || !key) return;
  await ctx.connectTo(url, key);
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

function renderPersonControl(people, tab) {
  const box = document.getElementById('personSeg');
  const show = people.length > 1 && PERSON_TABS.has(tab);
  box.hidden = !show;
  if (!show) { personMenuOpen = false; return; }
  const all = state.person === 'all';
  if (people.length === 2) {
    box.className = 'seg compact';
    box.innerHTML = ['all', ...people].map((v) => `<button type="button" role="tab" class="seg-btn${v === state.person ? ' on' : ''}" aria-selected="${v === state.person}" data-action="set-person" data-value="${esc(v)}">${v === 'all' ? 'All' : esc(v)}</button>`).join('');
    return;
  }
  // Three or more people: one button showing the current choice; tapping it opens a small menu.
  const dot = (name) => (name === 'all' ? '<span class="avatar xs all">∗</span>' : `<span class="avatar xs p${personIndex(store, name)}">${esc(name[0] || '?')}</span>`);
  box.className = 'person-wrap';
  box.innerHTML = `<button type="button" class="person-btn" data-action="toggle-person-menu" aria-haspopup="listbox" aria-expanded="${personMenuOpen}">
      ${dot(state.person)}<b>${all ? 'All' : esc(state.person)}</b><span class="chev" aria-hidden="true">▾</span></button>
    ${personMenuOpen ? `<ul class="menu" role="listbox" aria-label="Whose budget">${['all', ...people].map((v) =>
      `<li><button type="button" role="option" class="menu-item${v === state.person ? ' on' : ''}" aria-selected="${v === state.person}" data-action="set-person" data-value="${esc(v)}">${dot(v)}<span>${v === 'all' ? 'All' : esc(v)}</span>${v === state.person ? '<span class="tick" aria-hidden="true">✓</span>' : ''}</button></li>`).join('')}</ul>` : ''}`;
}

function render() {
  setCurrency(store.settings.currency);
  const label = document.getElementById('monthLabel');
  label.textContent = monthLabelShort(state.month);
  label.setAttribute('aria-label', `${new Date(state.month + '-01T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}${state.month === monthKey() ? '' : ', tap to return to today'}`);
  const people = store.settings.people;
  if (state.person !== 'all' && !people.includes(state.person)) state.person = 'all';
  const tab = !store.settings.configured && state.tab !== 'settings' ? 'welcome' : state.tab;
  renderPersonControl(people, tab);
  label.classList.toggle('is-now', state.month === monthKey());
  document.getElementById('pageTitle').textContent = tab === 'welcome' ? 'Welcome' : TITLES[tab];
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.body.dataset.tab = tab;
  const v = views[tab];
  const y = window.scrollY;
  document.documentElement.style.setProperty('--hdr', document.querySelector('.topbar').offsetHeight + 'px');
  root.innerHTML = v.render(ctx);
  v.mount?.(root, ctx);
  window.scrollTo(0, y);
}

document.addEventListener('click', (e) => {
  if (personMenuOpen && !e.target.closest('.person-wrap')) { personMenuOpen = false; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && personMenuOpen) { personMenuOpen = false; render(); }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('dialog')) return;
  const name = el.dataset.action;
  const view = views[!store.settings.configured && state.tab !== 'settings' ? 'welcome' : state.tab];
  const fn = view.actions?.[name] || shared[name];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el, ctx, e);
  } catch (err) {
    console.error(err);
    toast('Something went wrong');
  }
});

store.subscribe((info) => (info?.background ? renderBackground() : render()));
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
