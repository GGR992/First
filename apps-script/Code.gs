/**
 * Home Budget – Google Sheets API
 * ---------------------------------------------------------------
 * Paste this whole file into a NEW Apps Script project
 * (https://script.google.com → New project). See SETUP.md.
 *
 * It reads and writes the "DB_Transactions" tab in the same format
 * the spreadsheet already uses:
 *   A Date | B Month | C Description | D Category | E Amount |
 *   F Payer | G Type | H ID | I Status
 * Status: Active = still to pay · Hidden / Inactive = paid.
 *
 * Only columns A–I are touched. Other tabs are never modified.
 */

// 1) The ID of your spreadsheet: the long part of its URL between /d/ and /edit
const SHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';

// 2) A long secret only you two know. The app must send the same one.
const SECRET = 'PASTE_YOUR_SECRET_HERE';

// Usually no need to change anything below.
const TAB = 'DB_Transactions';
const COLS = 9;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function doGet() {
  return json_({ ok: true, app: 'home-budget', message: 'The Budget API is running. Connect from the app.' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!SECRET || SECRET.indexOf('PASTE_') === 0 || body.key !== SECRET) {
    return json_({ ok: false, error: 'unauthorized' });
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    if (body.action === 'list') {
      return json_({ ok: true, transactions: listTx_(), serverTime: Date.now() });
    }
    if (body.action === 'batch') {
      const result = applyOps_(body.ops || []);
      SpreadsheetApp.flush();
      return json_({ ok: true, applied: result.applied });
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* ignore */ }
  }
}

/* ---------------- reading ---------------- */

function listTx_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = sh.getParent().getSpreadsheetTimeZone();
  const values = sh.getRange(2, 1, last - 1, COLS).getValues();
  const out = [];
  const missingIds = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const desc = String(r[2] == null ? '' : r[2]).trim();
    if (!desc && (r[4] === '' || r[4] == null)) continue; // empty row
    let id = String(r[7] == null ? '' : r[7]).trim();
    if (!id) {
      id = 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      missingIds.push({ row: i + 2, id: id });
    }
    const iso = toIso_(r[0], tz);
    const month = budgetMonth_(r[1], iso);
    if (!month) continue;
    const type = /income/i.test(String(r[6])) ? 'income' : 'expense';
    const status = String(r[8] || '').trim();
    out.push({
      id: id,
      date: iso || month + '-01',
      month: month,
      description: desc,
      category: String(r[3] || 'Other').trim(),
      amount: toNumber_(r[4]),
      payer: String(r[5] || '').trim(),
      type: type,
      paid: type === 'income' ? true : status.toLowerCase() !== 'active',
      row: i + 2,
    });
  }
  // Rows without an ID get one, so the app can edit them later.
  missingIds.forEach(function (m) { sh.getRange(m.row, 8).setValue(m.id); });
  return out;
}

/* ---------------- writing ---------------- */

function applyOps_(ops) {
  const sh = sheet_();
  const index = idIndex_(sh); // id -> row number
  let applied = 0;
  ops.forEach(function (op) {
    if (op.op === 'add' || op.op === 'update') {
      const tx = op.tx || {};
      const id = String(tx.id || '');
      if (!id) return;
      const row = index[id];
      if (row) {
        const prevStatus = String(sh.getRange(row, 9).getValue() || '');
        sh.getRange(row, 1, 1, COLS).setValues([toRow_(tx, prevStatus)]);
      } else {
        const newRow = sh.getLastRow() + 1;
        sh.getRange(newRow, 1, 1, COLS).setValues([toRow_(tx, '')]);
        index[id] = newRow;
      }
      applied++;
    } else if (op.op === 'remove') {
      const id = String(op.id || '');
      const row = index[id];
      if (!row) return;
      sh.deleteRow(row);
      delete index[id];
      Object.keys(index).forEach(function (k) { if (index[k] > row) index[k] -= 1; });
      applied++;
    }
  });
  return { applied: applied };
}

function toRow_(tx, prevStatus) {
  const month = String(tx.month || '').slice(0, 7);
  const mIdx = Number(month.slice(5, 7)) - 1;
  let status;
  if (tx.type === 'income') {
    status = prevStatus || 'Active';
  } else if (tx.paid) {
    // Keep "Inactive" (old archived rows) as it was; otherwise paid = Hidden.
    status = prevStatus && prevStatus !== 'Active' ? prevStatus : 'Hidden';
  } else {
    status = 'Active';
  }
  return [
    String(tx.date || month + '-01'),
    MONTHS[mIdx] || '',
    safeText_(tx.description),
    safeText_(tx.category),
    Number(tx.amount) || 0,
    safeText_(tx.payer),
    tx.type === 'income' ? 'Income' : 'Expense',
    String(tx.id),
    status,
  ];
}

/* ---------------- helpers ---------------- */

function sheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(TAB);
  if (!sh) throw new Error('Tab "' + TAB + '" not found');
  return sh;
}

function idIndex_(sh) {
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const ids = sh.getRange(2, 8, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0] == null ? '' : ids[i][0]).trim();
    if (id) map[id] = i + 2;
  }
  return map;
}

// Stops text like "=SUM(...)" from becoming a formula.
function safeText_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function toNumber_(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  let s = String(v || '').replace(/[^\d.,\-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return Number(s) || 0;
}

function pad_(n) { return (n < 10 ? '0' : '') + n; }

function toIso_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad_(Number(m[2])) + '-' + pad_(Number(m[3]));
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return m[3] + '-' + pad_(Number(m[2])) + '-' + pad_(Number(m[1]));
  return '';
}

// "November" + row date -> "2026-11" (nearest year to the row's date)
function budgetMonth_(name, iso) {
  const raw = String(name || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (!iso) return '';
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  const idx = MONTHS.map(function (x) { return x.toLowerCase(); }).indexOf(raw.toLowerCase());
  if (idx < 0) return iso.slice(0, 7);
  let best = '', bestDist = Infinity;
  [y - 1, y, y + 1].forEach(function (yy) {
    const dist = Math.abs(yy * 12 + idx - (y * 12 + mo - 1));
    if (dist < bestDist) { bestDist = dist; best = yy + '-' + pad_(idx + 1); }
  });
  return best;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
