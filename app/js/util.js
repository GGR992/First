// Small, dependency-free helpers shared across the app.

export const pad = (n) => String(n).padStart(2, '0');

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function monthDate(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export const monthLabel = (key) =>
  monthDate(key).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const monthShort = (key) =>
  monthDate(key).toLocaleDateString('en-GB', { month: 'short' });

export const monthName = (key) =>
  monthDate(key).toLocaleDateString('en-GB', { month: 'long' });

/** Default date for a new entry in a given budget month. */
export function defaultDateFor(month) {
  return month === monthKey() ? todayISO() : `${month}-01`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

let currency = 'lei';
export const setCurrency = (c) => { currency = c || ''; };

export function money(n, { sign = false, decimals } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const dec = decimals ?? (abs % 1 === 0 ? 0 : 2);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const prefix = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${prefix}${s}${currency ? ' ' + currency : ''}`;
}

export const sum = (list, f = (t) => t.amount) => list.reduce((a, t) => a + (Number(f(t)) || 0), 0);

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Accepts "1,923.50", "1.923,50", "120+45", "300" … returns a number or NaN. */
export function parseAmount(input) {
  let s = String(input ?? '').replace(/\s/g, '').replace(/[^\d.,+\-]/g, '');
  if (!s) return NaN;
  const norm = (part) => {
    if (/,\d{1,2}$/.test(part)) return part.replace(/\./g, '').replace(',', '.');
    return part.replace(/,/g, '');
  };
  // Allow simple sums like 120+45-10
  const terms = s.match(/[+\-]?[^+\-]+/g) || [];
  let total = 0;
  for (const t of terms) {
    const v = Number(norm(t));
    if (Number.isNaN(v)) return NaN;
    total += v;
  }
  return round2(total);
}

export const normKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const pct = (part, whole) => (whole ? (part / whole) * 100 : 0);

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- names: "Chiria (cash)" and "Chiria" are the same expense ---------- */

/** Description without any "(…)" notes: "Chiria (cash)" -> "Chiria". */
export function baseName(desc) {
  const raw = String(desc || '');
  const cleaned = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || raw.trim();
}
export const baseKey = (desc) => normKey(baseName(desc));

/* ---------- spending load colour: green → orange → red ---------- */

/** Hue (0–360) for spent/income ratio. ≤75% green, ~97–100% orange, above 100% → red. */
export function loadHue(ratio) {
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (ratio <= 0.75) return 145;
  if (ratio <= 0.97) return lerp(145, 35, (ratio - 0.75) / 0.22);
  if (ratio <= 1) return 35;
  return lerp(35, 3, (ratio - 1) / 0.1);
}

/* ---------- keyword highlight colours ---------- */

export const KW_COLORS = [
  { key: 'purple', label: 'Purple' },
  { key: 'green', label: 'Green' },
  { key: 'orangered', label: 'Orange-red' },
  { key: 'orangepink', label: 'Orange-pink' },
  { key: 'blue', label: 'Blue' },
  { key: 'teal', label: 'Teal' },
  { key: 'gold', label: 'Gold' },
  { key: 'red', label: 'Red' },
  { key: 'grey', label: 'Grey' },
];

/** First rule whose keyword appears in the description (case ignored) → colour key, or null. */
export function kwColor(rules, desc) {
  const d = String(desc || '').toLowerCase();
  for (const r of rules || []) {
    if (r.keyword && d.includes(String(r.keyword).toLowerCase())) return r.color;
  }
  return null;
}

export const monthLabelShort = (key) =>
  monthDate(key).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
