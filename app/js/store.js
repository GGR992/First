// Data layer. All reads/writes go through Store, which talks to an "adapter".
// Today the adapter is LocalAdapter (this browser only). Later we can add a
// GoogleSheetsAdapter / cloud adapter with the same two methods (load, save)
// without touching any of the screens.

import { uid, normKey, round2 } from './util.js';

const KEY = 'budget.v1';

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

export class LocalAdapter {
  label = 'This device only (browser storage)';
  memory = null;
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return this.memory;
    }
  }
  async save(data) {
    this.memory = data;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not persist to localStorage', e);
    }
  }
}

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
    createdAt: t.createdAt || Date.now(),
    updatedAt: t.updatedAt || Date.now(),
  };
}

export class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.tx = [];
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.listeners = new Set();
  }

  async init() {
    const data = await this.adapter.load();
    if (data) {
      this.tx = (data.transactions || []).map(normalizeTx);
      this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(data.settings || {}) };
    }
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  async persist() {
    await this.adapter.save({ version: 1, transactions: this.tx, settings: this.settings });
    this.emit();
  }

  get(id) { return this.tx.find((t) => t.id === id); }

  async add(items) {
    const now = Date.now();
    const list = [].concat(items).map((t) => normalizeTx({ ...t, createdAt: now, updatedAt: now }));
    this.tx.push(...list);
    this.learnCategories(list);
    await this.persist();
    return list;
  }

  async update(id, patch) {
    const i = this.tx.findIndex((t) => t.id === id);
    if (i < 0) return null;
    this.tx[i] = normalizeTx({ ...this.tx[i], ...patch, id, updatedAt: Date.now() });
    this.learnCategories([this.tx[i]]);
    await this.persist();
    return this.tx[i];
  }

  async remove(id) {
    const before = this.tx.length;
    this.tx = this.tx.filter((t) => t.id !== id);
    if (this.tx.length !== before) await this.persist();
  }

  /** Import: mode 'merge' keeps existing and skips duplicate ids, 'replace' wipes first. */
  async import(items, mode = 'merge') {
    const incoming = items.map(normalizeTx);
    if (mode === 'replace') {
      this.tx = incoming;
    } else {
      const ids = new Set(this.tx.map((t) => t.id));
      this.tx.push(...incoming.filter((t) => !ids.has(t.id)));
    }
    this.learnCategories(incoming);
    await this.persist();
  }

  async clear() { this.tx = []; await this.persist(); }

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

  /** Most recent transaction with this description (for autofill). */
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
