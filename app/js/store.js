// Data layer.
// - Always keeps a local copy in this browser (fast start, works offline).
// - Optionally connected to the shared Google Sheet (see sync.js + apps-script/).
//   Every change is applied locally right away and queued as an "op"
//   ({op:'add'|'update', tx} or {op:'remove', id}). The queue is sent to the
//   sheet in the background and survives reloads, so nothing is lost offline.

import { uid, normKey, baseKey, round2 } from './util.js';
import { SheetsRemote } from './sync.js';

const KEY = 'budget.v1';
const SYNC_KEY = 'budget.sync';
const PENDING_KEY = 'budget.pending';
const SETTINGS_PENDING_KEY = 'budget.settingsPending';

export const MAX_PEOPLE = 6;

export const DEFAULT_SETTINGS = {
  configured: false,           // false until the welcome setup (names, currency) is done
  people: ['', ''],
  currency: '',
  expenseCategories: [
    'Housing', 'Utilities', 'Food', 'Transportation', 'Health', 'Fun',
    'Personal', 'Savings', 'Gifts', 'Pets', 'Debt', 'Other',
  ],
  incomeCategories: ['Salary', 'Bonus', 'Other income'],
  // Expenses whose name contains a keyword are shown in that colour (case ignored, first match wins).
  keywordRules: [
    { keyword: 'Joint', color: 'purple' },
    { keyword: 'Cash', color: 'green' },
  ],
  updatedAt: 0,                // time of the last settings change (used to sync settings between phones)
};

// Settings of the first users (before v3.5): used for data saved by earlier versions.
const LEGACY_SETTINGS = {
  people: ['Gabi', 'Oana'],
  expenseCategories: [
    'Utilities', 'Food', 'Pets', 'Transportation', 'Health/medical', 'Fun',
    'Personal', 'Savings', 'Gifts', 'Home', 'Household', 'Rata Masina',
    'Debt Gabi', 'Debt Oana', 'Other',
  ],
  incomeCategories: ['Paycheck', 'Bonuri', 'Other income'],
  keywordRules: [
    { keyword: 'Joint', color: 'purple' },
    { keyword: 'Cash', color: 'green' },
    { keyword: 'Emergencyfamiglia', color: 'orangered' },
    { keyword: 'Buget Fun', color: 'orangepink' },
    { keyword: 'Budget Fun', color: 'orangepink' },
  ],
};

const readJSON = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const writeJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('storage', e); } };

export function normalizeTx(t) {
  const date = t.date || `${t.month}-01`;
  return {
    id: String(t.id || uid()),
    date,
    month: t.month || date.slice(0, 7),
    description: String(t.description || '').trim(),
    category: t.category || 'Other',
    amount: round2(t.amount),
    payer: t.payer || '',
    type: t.type === 'income' ? 'income' : 'expense',
    paid: t.type === 'income' ? true : Boolean(t.paid),
    createdAt: t.createdAt ?? Date.now(),
    updatedAt: t.updatedAt || Date.now(),
  };
}

export class Store {
  constructor() {
    this.tx = [];
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.listeners = new Set();
    this.syncListeners = new Set();
    this.remote = null;
    this.pending = [];
    this.sync = { state: 'local', error: '', lastPull: 0 };
    this.flushPromise = null;
    this.pullPromise = null;
    this.settingsPending = false;   // local settings changes not yet sent to the sheet
    this.settingsSynced = true;     // false when the sheet's script is too old to store settings
  }

  async init() {
    const data = readJSON(KEY);
    if (data) {
      this.tx = (data.transactions || []).map(normalizeTx);
      const saved = data.settings || {};
      // Data saved by an earlier version: keep its names, categories and colours.
      const legacy = saved.configured === undefined ? { ...structuredClone(LEGACY_SETTINGS), configured: true } : {};
      this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...legacy, ...saved };
      this.sync.lastPull = data.lastPull || 0;
    }
    this.settingsPending = Boolean(readJSON(SETTINGS_PENDING_KEY));
    this.pending = readJSON(PENDING_KEY) || [];
    const cfg = readJSON(SYNC_KEY);
    if (cfg?.url && cfg?.key) {
      this.remote = new SheetsRemote(cfg.url, cfg.key);
      this.sync.state = this.pending.length ? 'pending' : 'synced';
    }
  }

  /* ---------- events ---------- */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(info) { for (const fn of this.listeners) fn(info); }
  onSync(fn) { this.syncListeners.add(fn); return () => this.syncListeners.delete(fn); }
  setSync(state, error = '') {
    this.sync = { ...this.sync, state, error };
    for (const fn of this.syncListeners) fn(this.sync);
  }

  get connected() { return Boolean(this.remote); }
  get storageLabel() { return this.connected ? 'the shared Google Sheet (with a copy on this device)' : 'this device only (browser storage)'; }

  saveLocal() {
    writeJSON(KEY, { version: 1, transactions: this.tx, settings: this.settings, lastPull: this.sync.lastPull });
    writeJSON(PENDING_KEY, this.pending);
  }

  async persist() { this.saveLocal(); this.emit(); }

  /* ---------- remote queue ---------- */
  queue(ops) {
    if (!this.remote || !ops.length) return;
    this.pending.push(...ops);
    this.saveLocal();
    this.setSync('pending');
    this.flush();
  }

  flush() {
    if (!this.remote) return Promise.resolve();
    if (this.flushPromise) return this.flushPromise;
    if (!this.pending.length) return Promise.resolve();
    this.flushPromise = (async () => {
      this.setSync('syncing');
      try {
        while (this.pending.length && this.remote) {
          const batch = this.pending.slice(0, 150);
          await this.remote.batch(batch);
          this.pending.splice(0, batch.length);
          this.saveLocal();
        }
        this.setSync('synced');
      } catch (e) {
        this.setSync(e.code === 'offline' ? 'offline' : 'error', e.message);
        throw e;
      } finally {
        this.flushPromise = null;
      }
    })();
    this.flushPromise.catch(() => {});
    return this.flushPromise;
  }

  /** Send queued changes, then download the latest data from the sheet. */
  pull() {
    if (!this.remote) return Promise.resolve();
    if (this.pullPromise) return this.pullPromise;
    this.pullPromise = (async () => {
      try {
        await this.flush();
        this.setSync('syncing');
        const data = await this.remote.list();
        const local = new Map(this.tx.map((t) => [t.id, t]));
        let list = data.transactions.map((t) => normalizeTx({ ...t, createdAt: t.row ?? local.get(String(t.id))?.createdAt }));
        // Re-apply anything queued while we were downloading.
        for (const op of this.pending) list = applyOp(list, op);
        this.tx = list;
        this.learnCategories(list);
        this.sync.lastPull = Date.now();
        this.saveLocal();
        await this.syncSettings();
        this.setSync(this.pending.length ? 'pending' : 'synced');
        this.emit({ background: true });
      } catch (e) {
        this.setSync(e.code === 'offline' ? 'offline' : 'error', e.message);
        throw e;
      } finally {
        this.pullPromise = null;
      }
    })();
    return this.pullPromise;
  }

  async connect(url, key) {
    const remote = new SheetsRemote(url, key);
    const data = await remote.list(); // throws on wrong URL / key
    this.remote = remote;
    this.pending = [];
    writeJSON(SYNC_KEY, { url: remote.url, key });
    this.tx = data.transactions.map((t) => normalizeTx({ ...t, createdAt: t.row }));
    this.learnCategories(this.tx);
    this.sync.lastPull = Date.now();
    this.settings.configured = this.settings.configured || data.transactions.length > 0;
    this.saveLocal();
    await this.syncSettings({ adoptRemote: true });
    this.setSync('synced');
    this.emit();
    return this.tx.length;
  }

  /**
   * Shared settings (names, currency, categories, colours) live in the sheet's App_Settings tab.
   * The newest change wins. Older scripts without this feature are tolerated: settings then stay on each phone.
   */
  async syncSettings({ adoptRemote = false } = {}) {
    if (!this.remote) return;
    try {
      const r = await this.remote.getSettings();
      this.settingsSynced = true;
      const remote = r.settings;
      const mine = this.settings.updatedAt || 0;
      if (remote && (adoptRemote ? !this.settingsPending : (r.updatedAt > mine && !this.settingsPending))) {
        // The sheet has newer (or, when joining, the shared) settings: use them.
        this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...remote, configured: true, updatedAt: r.updatedAt };
      } else if (this.settings.configured && (!remote || this.settingsPending || mine > r.updatedAt)) {
        // This phone has the newer settings (or the sheet has none yet): send them.
        const at = this.settings.updatedAt || Date.now();
        this.settings.updatedAt = at;
        await this.remote.setSettings(this.settings, at);
        this.settingsPending = false;
        writeJSON(SETTINGS_PENDING_KEY, null);
      }
      this.saveLocal();
    } catch (e) {
      if (e.code === 'unknown_action') this.settingsSynced = false; // old script: keep settings on this device
      else if (this.settings.configured) { this.settingsPending = true; writeJSON(SETTINGS_PENDING_KEY, true); }
    }
  }

  disconnect() {
    this.remote = null;
    this.pending = [];
    writeJSON(SYNC_KEY, null);
    writeJSON(SETTINGS_PENDING_KEY, null);
    this.saveLocal();
    this.setSync('local');
    this.emit();
  }

  syncConfig() { return readJSON(SYNC_KEY); }

  /* ---------- data operations ---------- */
  get(id) { return this.tx.find((t) => t.id === id); }

  /** With a single person every expense and income belongs to them. */
  fixPayer(t) {
    const p = this.settings.people;
    return p.length === 1 && t.payer !== p[0] ? { ...t, payer: p[0] } : t;
  }

  /**
   * Transactions as seen by one person (or everyone): person = 'all' | a name.
   * With a single person, every transaction is treated as theirs, whatever the payer column says.
   */
  txFor(person = 'all') {
    const p = this.settings.people;
    if (p.length === 1) return this.tx.map((t) => this.fixPayer(t));
    return person === 'all' ? this.tx : this.tx.filter((t) => t.payer === person);
  }

  async add(items) {
    const now = Date.now();
    const list = [].concat(items).map((t) => normalizeTx(this.fixPayer({ ...t, createdAt: now, updatedAt: now })));
    this.tx.push(...list);
    this.learnCategories(list);
    await this.persist();
    this.queue(list.map((tx) => ({ op: 'add', tx })));
    return list;
  }

  async update(id, patch) {
    return (await this.updateMany([id], patch))[0] || null;
  }

  /** patch can be an object or a function (tx) => object */
  async updateMany(ids, patch) {
    const set = new Set(ids);
    const changed = [];
    this.tx = this.tx.map((t) => {
      if (!set.has(t.id)) return t;
      const p = typeof patch === 'function' ? patch(t) : patch;
      const n = normalizeTx(this.fixPayer({ ...t, ...p, id: t.id, updatedAt: Date.now() }));
      changed.push(n);
      return n;
    });
    if (!changed.length) return [];
    this.learnCategories(changed);
    await this.persist();
    this.queue(changed.map((tx) => ({ op: 'update', tx })));
    return changed;
  }

  async remove(id) {
    const before = this.tx.length;
    this.tx = this.tx.filter((t) => t.id !== id);
    if (this.tx.length === before) return;
    await this.persist();
    this.queue([{ op: 'remove', id }]);
  }

  /** Import: 'merge' keeps existing and skips duplicate ids, 'replace' wipes first (local only). */
  async import(items, mode = 'merge') {
    const incoming = items.map(normalizeTx);
    if (mode === 'replace' && !this.connected) {
      this.tx = incoming;
      this.learnCategories(incoming);
      await this.persist();
      return incoming.length;
    }
    const ids = new Set(this.tx.map((t) => t.id));
    const fresh = incoming.filter((t) => !ids.has(t.id));
    this.tx.push(...fresh);
    this.learnCategories(fresh);
    await this.persist();
    this.queue(fresh.map((tx) => ({ op: 'add', tx })));
    return fresh.length;
  }

  /** Not connected: deletes everything. Connected: only refreshes this device's copy from the sheet. */
  async clear() {
    if (this.connected) {
      await this.pull();
      return;
    }
    this.tx = [];
    await this.persist();
  }

  async saveSettings(patch) {
    this.settings = { ...this.settings, ...patch, updatedAt: Date.now() };
    if (this.remote) { this.settingsPending = true; writeJSON(SETTINGS_PENDING_KEY, true); }
    await this.persist();
    if (this.remote) this.syncSettings().then(() => this.emit({ background: true }));
  }

  learnCategories(list) {
    const s = this.settings;
    for (const t of list) {
      const key = t.type === 'income' ? 'incomeCategories' : 'expenseCategories';
      if (t.category && !s[key].includes(t.category)) s[key] = [...s[key], t.category];
    }
  }

  categoriesFor(type) {
    return type === 'income' ? this.settings.incomeCategories : this.settings.expenseCategories;
  }

  /** Latest transaction with this name: exact match first, otherwise the same name ignoring "(…)" notes. */
  lastByDescription(desc) {
    const exact = normKey(desc);
    const base = baseKey(desc);
    if (!exact) return null;
    const newer = (t, best) => !best || t.month > best.month || (t.month === best.month && t.createdAt > best.createdAt);
    let bestExact = null, bestBase = null;
    for (const t of this.tx) {
      if (normKey(t.description) === exact && newer(t, bestExact)) bestExact = t;
      else if (baseKey(t.description) === base && newer(t, bestBase)) bestBase = t;
    }
    return bestExact || bestBase;
  }

  descriptions() {
    return [...new Set(this.tx.map((t) => t.description).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }
}

function applyOp(list, op) {
  if (op.op === 'remove') return list.filter((t) => t.id !== op.id);
  const tx = normalizeTx(op.tx);
  const i = list.findIndex((t) => t.id === tx.id);
  if (i < 0) return [...list, tx];
  const copy = list.slice();
  copy[i] = tx;
  return copy;
}
