// CSV import/export, compatible with the Google Sheet "DB_Transactions" layout:
// Date, Month, Description, Category, Amount, Payer, Type, ID, Status
// Status: Active = still to pay, Hidden/Inactive = paid (moved to the back).
import { monthName, pad } from './util.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function toNumber(s) {
  let v = String(s || '').replace(/[^\d.,\-]/g, '');
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  return Number(v) || 0;
}

function toISODate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); // dd/mm/yyyy (RO)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d = new Date(s);
  return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Budget month from a month name + the row's date (picks the nearest year). */
function budgetMonth(name, iso) {
  const raw = String(name || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const idx = MONTHS.indexOf(raw.toLowerCase());
  if (!iso) return null;
  const [y, mo] = iso.split('-').map(Number);
  if (idx < 0) return iso.slice(0, 7);
  let best = null, bestDist = Infinity;
  for (const yy of [y - 1, y, y + 1]) {
    const dist = Math.abs(yy * 12 + idx - (y * 12 + mo - 1));
    if (dist < bestDist) { bestDist = dist; best = `${yy}-${pad(idx + 1)}`; }
  }
  return best;
}

export function rowsToTransactions(rows) {
  const [header, ...data] = rows;
  const h = header.map((x) => x.trim().toLowerCase());
  const col = (...names) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const c = {
    date: col('date'), month: col('month'), budget: col('budgetmonth', 'budget month'),
    desc: col('description', 'item'), cat: col('category'), amount: col('amount', 'cost'),
    payer: col('payer', 'person'), type: col('type'), id: col('id'), status: col('status'), paid: col('paid'),
  };
  if (c.desc < 0 || c.amount < 0) throw new Error('CSV needs at least Description and Amount columns');
  const out = [];
  const skipped = [];
  data.forEach((r, i) => {
    const get = (k) => (c[k] >= 0 ? (r[c[k]] ?? '').trim() : '');
    const date = toISODate(get('date'));
    const month = (c.budget >= 0 && /^\d{4}-\d{2}$/.test(get('budget')) && get('budget')) || budgetMonth(get('month'), date);
    if (!month || !get('desc')) { skipped.push(i + 2); return; }
    const type = /income/i.test(get('type')) ? 'income' : 'expense';
    const status = get('status').toLowerCase();
    const paidCol = get('paid').toLowerCase();
    const paid = type === 'income' || (paidCol ? ['true', 'yes', '1', 'paid'].includes(paidCol) : status !== 'active');
    out.push({
      id: get('id') || undefined,
      date: date || `${month}-01`,
      month,
      description: get('desc'),
      category: get('cat') || 'Other',
      amount: toNumber(get('amount')),
      payer: get('payer'),
      type,
      paid,
    });
  });
  return { transactions: out, skipped };
}

const q = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(txs) {
  const head = ['Date', 'Month', 'Description', 'Category', 'Amount', 'Payer', 'Type', 'ID', 'Status', 'BudgetMonth'];
  const lines = txs
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date))
    .map((t) => [t.date, monthName(t.month), t.description, t.category, t.amount.toFixed(2), t.payer,
      t.type === 'income' ? 'Income' : 'Expense', t.id, t.paid ? 'Hidden' : 'Active', t.month].map(q).join(','));
  return [head.join(','), ...lines].join('\n');
}

export function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
