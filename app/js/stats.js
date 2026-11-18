// Pure calculations — no DOM here.
import { addMonths, sum, normKey } from './util.js';

export const inMonth = (txs, m) => txs.filter((t) => t.month === m);
export const expensesOf = (txs) => txs.filter((t) => t.type === 'expense');
export const incomesOf = (txs) => txs.filter((t) => t.type === 'income');

export function summarize(txs, month, people) {
  const list = inMonth(txs, month);
  const exp = expensesOf(list);
  const inc = incomesOf(list);
  const expenses = sum(exp);
  const income = sum(inc);
  const unpaid = exp.filter((t) => !t.paid);

  const byPerson = {};
  const ensure = (p) => (byPerson[p] ||= { spent: 0, income: 0, unpaid: 0, count: 0 });
  people.forEach(ensure);
  for (const t of exp) {
    const p = ensure(t.payer || '—');
    p.spent += t.amount;
    p.count += 1;
    if (!t.paid) p.unpaid += t.amount;
  }
  for (const t of inc) ensure(t.payer || '—').income += t.amount;

  const fairShare = people.length ? expenses / people.length : 0;
  const balances = people.map((name) => ({ name, diff: byPerson[name].spent - fairShare }));

  const cat = {};
  for (const t of exp) cat[t.category] = (cat[t.category] || 0) + t.amount;
  const byCategory = Object.entries(cat)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    month, list, exp, inc, expenses, income,
    remaining: income - expenses,
    unpaid, unpaidAmount: sum(unpaid), paidAmount: expenses - sum(unpaid),
    byPerson, fairShare, balances, byCategory,
  };
}

/** For two people: who should send how much to whom to even out. */
export function settlement(summary) {
  const b = summary.balances;
  if (b.length < 2) return null;
  const sorted = [...b].sort((x, y) => y.diff - x.diff);
  const over = sorted[0];
  const under = sorted[sorted.length - 1];
  if (Math.abs(over.diff) < 0.5) return { even: true };
  return { even: false, from: under.name, to: over.name, amount: Math.min(over.diff, -under.diff) || over.diff };
}

export function trend(txs, endMonth, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    const list = inMonth(txs, m);
    out.push({ month: m, expenses: sum(expensesOf(list)), income: sum(incomesOf(list)) });
  }
  return out;
}

export function categoryTrend(txs, category, endMonth, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    out.push({ month: m, expenses: sum(txs.filter((t) => t.month === m && t.type === 'expense' && t.category === category)) });
  }
  return out;
}

/** Groups by description: total, count, average, last amount. */
export function topItems(txs) {
  const g = new Map();
  for (const t of txs) {
    const k = normKey(t.description);
    const e = g.get(k) || { description: t.description, total: 0, count: 0, last: null };
    e.total += t.amount;
    e.count += 1;
    if (!e.last || t.month >= e.last.month) e.last = t;
    g.set(k, e);
  }
  return [...g.values()].sort((a, b) => b.total - a.total);
}

export function allTime(txs) {
  const exp = expensesOf(txs);
  const months = new Set(exp.map((t) => t.month));
  const total = sum(exp);
  return { total, months: months.size, avg: months.size ? total / months.size : 0, income: sum(incomesOf(txs)) };
}

export function yearTable(txs, year) {
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const list = inMonth(txs, key);
    rows.push({ month: key, expenses: sum(expensesOf(list)), income: sum(incomesOf(list)) });
  }
  return rows;
}

export function personTrend(txs, people, endMonth, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    const exp = txs.filter((t) => t.month === m && t.type === 'expense');
    const row = { month: m };
    for (const p of people) row[p] = sum(exp.filter((t) => t.payer === p));
    out.push(row);
  }
  return out;
}

export function delta(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}
