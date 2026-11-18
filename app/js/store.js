// Data layer.
// - Always keeps a local copy in this browser (fast start, works offline).
// - Optionally connected to the shared Google Sheet (see sync.js + apps-script/).
//   Every change is applied locally right away and queued as an "op"
//   ({op:'add'|'update', tx} or {op:'remove', id}). The queue is sent to the
//   sheet in the background and survives reloads, so nothing is lost offline.

import { uid, normKey, round2 } from './util.js';
import { SheetsRemote } from './sync.js';

const KEY = 'budget.v1';
const SYNC_KEY = 'budget.sync';
const PENDING_KEY = 'budget.pending';

export const DEFAULT_SETTINGS = {
  people: ['Gabi', 'Oana'],
  currency: 'lei',
  expenseCategories: [
    'Utilities', 'Food', 'Pets', 'Transportation', 'Health/medical', 'Fun',
    'Personal', 'Savings', 'Gifts', 'Home', 'Household', 'Rata Masina',
    'Debt Gabi', 'Debt Oana', 'Other',
  ],
  incomeCategories: ['Paycheck', 'Bonuri', 'Other income'],
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
  }

  async init() {
    const data = readJSON(KEY);
    if (data) {
      this.tx = (data.transactions || []).map(normalizeTx);
      this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(data.settings || {}) };
      this.sync.lastPull = data.lastPull || 0;
    }
    this.pending = readJSON(PENDING_KEY) || [];
    const cfg = readJSON(SYNC_KEY);
    if (cfg?.url && cfg?.key) {
      this.remote = new SheetsRemote(cfg.url, cfg.key);
      this.sync.state = this.pending.length ? 'pending' : 'synced';
    }
  }

  /* ---------- events ---------- */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }
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
        this.setSync(this.pending.length ? 'pending' : 'synced');
        this.emit();
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
    this.saveLocal();
    this.setSync('synced');
    this.emit();
    return this.tx.length;
  }

  disconnect() {
    this.remote = null;
    this.pending = [];
    writeJSON(SYNC_KEY, null);
    this.saveLocal();
    this.setSync('local');
    this.emit();
  }

  syncConfig() { return readJSON(SYNC_KEY); }

  /* ---------- data operations ---------- */
  get(id) { return this.tx.find((t) => t.id === id); }

  async add(items) {
    const now = Date.now();
    const list = [].concat(items).map((t) => normalizeTx({ ...t, createdAt: now, updatedAt: now }));
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
      const n = normalizeTx({ ...t, ...p, id: t.id, updatedAt: Date.now() });
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
    this.settings = { ...this.settings, ...patch };
    await this.persist();
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

  lastByDescription(desc) {
    const k = normKey(desc);
    if (!k) return null;
    let best = null;
    for (const t of this.tx) {
      if (normKey(t.description) === k && (!best || t.month > best.month || (t.month === best.month && t.createdAt > best.createdAt))) best = t;
    }
    return best;
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
