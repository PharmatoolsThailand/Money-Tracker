/**
 * Money Tracker - Google Apps Script backend
 *
 * Setup:
 * 1. Open a Google Sheet -> Extensions -> Apps Script
 * 2. Paste this entire file (replace any existing code)
 * 3. Save (Ctrl+S), give the project a name
 * 4. Deploy -> New deployment -> Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone   (required for file:// fetch)
 * 5. Authorize (click Advanced -> Go to ... unsafe -> Allow)
 * 6. Copy the deployment URL (ends with /exec) into app Settings
 *
 * After editing this file: Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy.
 * URL stays the same.
 *
 * Sheets are created automatically on first request: Transactions, Investments, Categories.
 */

const SHEET_TXN = 'Transactions';
const SHEET_INV = 'Investments';
const SHEET_CAT = 'Categories';
const SHEET_BUDGET = 'Budget';

const TXN_HEADERS = ['id', 'date', 'type', 'category', 'amount', 'note', 'expense_kind', 'payment_method'];
const INV_HEADERS = ['id', 'date', 'asset', 'amount', 'note'];
const CAT_HEADERS = ['type', 'name', 'icon'];
const BUDGET_HEADERS = ['id', 'kind', 'year', 'name', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const action = req.action;
    let result;
    switch (action) {
      case 'ping':           result = { pong: true, time: new Date().toISOString() }; break;
      case 'getAll':         result = getAll(); break;
      case 'addTransaction': result = addRow(SHEET_TXN, TXN_HEADERS, req.transaction); break;
      case 'addInvestment':  result = addRow(SHEET_INV, INV_HEADERS, req.investment); break;
      case 'delete':         result = deleteById(req.kind, req.id); break;
      case 'setCategories':  result = setCategories(req.categories); break;
      case 'setBudget':      result = setBudget(req.budget); break;
      case 'getBudget':      result = getBudget(); break;
      case 'batchImport':    result = batchImport(req.transactions, req.investments); break;
      case 'migrate':        result = backfillExpenseFields(); break;
      case 'tzDiag':         result = tzDiag(); break;
      case 'fixDates':       result = fixDates(req.shiftDays || 0, req.kinds); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return jsonOut({ ok: true, result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return jsonOut({ ok: true, result: { pong: true, hint: 'use POST for data ops' } });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else {
    ensureHeaders(sh, headers);
  }
  // Force date column to text format — prevents Sheets auto-parsing strings into Date with wrong TZ
  const dateIdx = headers.indexOf('date');
  if (dateIdx >= 0) {
    sh.getRange(1, dateIdx + 1, sh.getMaxRows(), 1).setNumberFormat('@');
  }
  return sh;
}

function ensureHeaders(sh, headers) {
  const currentCols = sh.getLastColumn();
  const currentHeaders = currentCols > 0
    ? sh.getRange(1, 1, 1, currentCols).getValues()[0].map(String)
    : [];
  const missing = headers.slice(currentHeaders.length);
  if (missing.length) {
    sh.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
}

function sheetToObjects(sh, headers) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const tz = Session.getScriptTimeZone();
  const data = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let v = row[i];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      obj[h] = v;
    });
    return obj;
  }).filter(o => Object.values(o).some(v => v !== '' && v != null));
}

function addRow(sheetName, headers, obj) {
  const sh = getOrCreateSheet(sheetName, headers);
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.appendRow(row);
  return { added: obj.id };
}

function deleteById(kind, id) {
  let sheetName, headers;
  if (kind === 'transaction')      { sheetName = SHEET_TXN; headers = TXN_HEADERS; }
  else if (kind === 'investment')  { sheetName = SHEET_INV; headers = INV_HEADERS; }
  else throw new Error('Bad kind: ' + kind);
  const sh = getOrCreateSheet(sheetName, headers);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { deleted: 0 };
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      return { deleted: 1 };
    }
  }
  return { deleted: 0 };
}

function setCategories(categories) {
  const sh = getOrCreateSheet(SHEET_CAT, CAT_HEADERS);
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) sh.getRange(2, 1, lastRow - 1, CAT_HEADERS.length).clear();
  const rows = [];
  for (const type of ['expense', 'income']) {
    for (const c of (categories[type] || [])) {
      rows.push([type, c.name, c.icon || '']);
    }
  }
  if (rows.length) sh.getRange(2, 1, rows.length, CAT_HEADERS.length).setValues(rows);
  return { saved: rows.length };
}

function getCategories() {
  const sh = getOrCreateSheet(SHEET_CAT, CAT_HEADERS);
  const rows = sheetToObjects(sh, CAT_HEADERS).filter(r => r.type);
  const out = { expense: [], income: [] };
  for (const r of rows) {
    if (r.type === 'expense' || r.type === 'income') {
      out[r.type].push({ name: r.name, icon: r.icon });
    }
  }
  return out;
}

function backfillExpenseFields() {
  const sh = getOrCreateSheet(SHEET_TXN, TXN_HEADERS);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { migrated: 0, total: 0 };
  const range = sh.getRange(2, 1, lastRow - 1, TXN_HEADERS.length);
  const data = range.getValues();
  const iType = TXN_HEADERS.indexOf('type');
  const iNote = TXN_HEADERS.indexOf('note');
  const iKind = TXN_HEADERS.indexOf('expense_kind');
  const iMethod = TXN_HEADERS.indexOf('payment_method');
  let migrated = 0;
  for (const row of data) {
    if (row[iType] !== 'expense') continue;
    let note = String(row[iNote] || '');
    let kind = String(row[iKind] || '');
    let method = String(row[iMethod] || '');
    let changed = false;
    if (!kind) {
      if (note.indexOf('ใช้จ่ายทั่วไป') >= 0) { kind = 'ทั่วไป'; note = note.replace(/ใช้จ่ายทั่วไป/g, ''); changed = true; }
      else if (note.indexOf('ใช้จ่ายประจำ') >= 0) { kind = 'ประจำ'; note = note.replace(/ใช้จ่ายประจำ/g, ''); changed = true; }
    }
    if (!method) {
      if (note.indexOf('เงินโอน') >= 0) { method = 'โอน'; note = note.replace(/เงินโอน/g, ''); changed = true; }
      else if (note.indexOf('เงินสด') >= 0) { method = 'สด'; note = note.replace(/เงินสด/g, ''); changed = true; }
    }
    if (changed) {
      note = note.replace(/\s*•\s*•\s*/g, ' • ').replace(/^\s*•\s*|\s*•\s*$/g, '').replace(/\s+/g, ' ').trim();
      row[iNote] = note;
      row[iKind] = kind;
      row[iMethod] = method;
      migrated++;
    }
  }
  range.setValues(data);
  return { migrated, total: data.length };
}

function batchImport(transactions, investments) {
  let tAdded = 0, iAdded = 0;
  if (transactions && transactions.length) {
    const sh = getOrCreateSheet(SHEET_TXN, TXN_HEADERS);
    const rows = transactions.map(t => TXN_HEADERS.map(h => t[h] !== undefined ? t[h] : ''));
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, TXN_HEADERS.length).setValues(rows);
    tAdded = rows.length;
  }
  if (investments && investments.length) {
    const sh = getOrCreateSheet(SHEET_INV, INV_HEADERS);
    const rows = investments.map(i => INV_HEADERS.map(h => i[h] !== undefined ? i[h] : ''));
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, INV_HEADERS.length).setValues(rows);
    iAdded = rows.length;
  }
  return { transactions: tAdded, investments: iAdded };
}

function tzDiag() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet(SHEET_TXN, TXN_HEADERS);
  const sampleRow = sh.getRange(2, 2).getValue();
  return {
    scriptTz: Session.getScriptTimeZone(),
    sheetTz: ss.getSpreadsheetTimeZone(),
    sheetLocale: ss.getSpreadsheetLocale(),
    sampleDateCell: sampleRow instanceof Date
      ? { iso: sampleRow.toISOString(), local: sampleRow.toString(), formatted: Utilities.formatDate(sampleRow, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss z') }
      : { value: String(sampleRow), type: typeof sampleRow },
  };
}

function fixDates(shiftDays) {
  const tz = 'Asia/Bangkok';
  function shiftValue(v) {
    if (v instanceof Date) {
      const shifted = new Date(v.getTime() + shiftDays * 86400000);
      return Utilities.formatDate(shifted, tz, 'yyyy-MM-dd');
    }
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const shifted = new Date(d.getTime() + shiftDays * 86400000);
        return Utilities.formatDate(shifted, tz, 'yyyy-MM-dd');
      }
    }
    return null;
  }
  function processSheet(sheetName, headers) {
    const sh = getOrCreateSheet(sheetName, headers);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return 0;
    const dateCol = headers.indexOf('date') + 1;
    const range = sh.getRange(2, dateCol, lastRow - 1, 1);
    const values = range.getValues();
    let n = 0;
    for (let i = 0; i < values.length; i++) {
      const newV = shiftValue(values[i][0]);
      if (newV !== null) { values[i][0] = newV; n++; }
    }
    range.setNumberFormat('@');
    range.setValues(values);
    return n;
  }
  const kinds = (Array.isArray(arguments[1]) && arguments[1].length) ? arguments[1] : ['txn', 'inv'];
  let fixed = 0;
  if (kinds.indexOf('txn') >= 0) fixed += processSheet(SHEET_TXN, TXN_HEADERS);
  if (kinds.indexOf('inv') >= 0) fixed += processSheet(SHEET_INV, INV_HEADERS);
  return { fixed, shiftDays, kinds };
}

function getAll() {
  const txnSh = getOrCreateSheet(SHEET_TXN, TXN_HEADERS);
  const invSh = getOrCreateSheet(SHEET_INV, INV_HEADERS);
  return {
    transactions: sheetToObjects(txnSh, TXN_HEADERS),
    investments: sheetToObjects(invSh, INV_HEADERS),
    categories: getCategories(),
    budget: getBudget(),
  };
}

function setBudget(budget) {
  const sh = getOrCreateSheet(SHEET_BUDGET, BUDGET_HEADERS);
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) sh.getRange(2, 1, lastRow - 1, BUDGET_HEADERS.length).clear();
  const rows = [];
  const year = budget.year || new Date().getFullYear();
  for (const kind of ['income', 'expense']) {
    for (const item of (budget[kind] || [])) {
      const amounts = Array.isArray(item.amounts) ? item.amounts : [];
      const row = [item.id, kind, year, item.name || ''];
      for (let i = 0; i < 12; i++) row.push(Number(amounts[i]) || 0);
      rows.push(row);
    }
  }
  if (rows.length) sh.getRange(2, 1, rows.length, BUDGET_HEADERS.length).setValues(rows);
  return { saved: rows.length };
}

function getBudget() {
  const sh = getOrCreateSheet(SHEET_BUDGET, BUDGET_HEADERS);
  const rows = sheetToObjects(sh, BUDGET_HEADERS).filter(r => r.id);
  const out = { year: new Date().getFullYear(), income: [], expense: [] };
  for (const r of rows) {
    if (r.kind !== 'income' && r.kind !== 'expense') continue;
    out.year = Number(r.year) || out.year;
    const amounts = [];
    for (let i = 1; i <= 12; i++) amounts.push(Number(r['m' + i]) || 0);
    out[r.kind].push({ id: r.id, name: r.name, amounts });
  }
  return out;
}
