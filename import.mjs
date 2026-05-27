// One-shot importer: reads source-data.csv, pushes to Money Tracker API.
// Run: node import.mjs
import fs from 'node:fs';

const API_URL = 'https://script.google.com/macros/s/AKfycbyihocCMsbnXSqlLHp4HZEVarAOPasoN_ezBdl3jD8ryIPZhUx4L5AZ4jq5ZgVotXDx5w/exec';
const CSV_PATH = './source-data.csv';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(d) {
  // "1/5/2026" -> "2026-05-01"
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
  if (!m) return null;
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

function parseAmount(s) {
  // "฿765.00" or "฿7,060.07"
  return Number(String(s).replace(/[฿,\s]/g, '')) || 0;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function apiCall(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
}

const CATEGORIES = {
  income: [
    { name: 'เงิน Part-time ร้านยา YA', icon: '💼' },
    { name: 'เงิน กยศ', icon: '🎓' },
    { name: 'เงินก่อนเรียนจบ', icon: '📚' },
    { name: 'เงินจ้างทั่วไป', icon: '💰' },
    { name: 'ค่า Youtube', icon: '📺' },
    { name: 'อื่นๆ', icon: '🎁' },
  ],
  expense: [
    { name: 'ค่าอาหาร', icon: '🍔' },
    { name: 'ซื้อของทั่วไป', icon: '🛒' },
    { name: 'ซื้อของเข้าบ้าน', icon: '🏠' },
    { name: 'เติมน้ำมัน', icon: '⛽' },
    { name: 'สุขภาพ', icon: '💊' },
    { name: 'บันเทิง', icon: '🎮' },
    { name: 'ให้ที่บ้าน', icon: '🎁' },
    { name: 'ลงทุน', icon: '📈' },
    { name: 'ช่วยงานสังคม (งานบุญ งานแต่ง)', icon: '💒' },
    { name: 'ค่าไฟ', icon: '💡' },
    { name: 'อื่นๆ', icon: '📌' },
  ],
};

async function main() {
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(text);
  // Drop section-header row 1 + column-header row 2
  const data = rows.slice(2);

  const transactions = [];
  const investments = [];

  for (const r of data) {
    // Income: cols 0-2 (date, category, amount)
    if (r[0] && r[1] && r[2]) {
      const date = parseDate(r[0]);
      const amount = parseAmount(r[2]);
      if (date && amount > 0) {
        transactions.push({
          id: genId(),
          date,
          type: 'income',
          category: r[1].trim(),
          amount,
          note: '',
        });
      }
    }
    // Expense: cols 4-9 (date, category, type, store, payment, amount)
    if (r[4] && r[5] && r[9]) {
      const date = parseDate(r[4]);
      const amount = parseAmount(r[9]);
      if (date && amount > 0) {
        const noteParts = [r[6], r[7], r[8]].map(s => (s || '').trim()).filter(Boolean);
        transactions.push({
          id: genId(),
          date,
          type: 'expense',
          category: r[5].trim(),
          amount,
          note: noteParts.join(' • '),
        });
      }
    }
    // Investment: cols 11-14 (date, type, app, amount)
    if (r[11] && r[12] && r[14]) {
      const date = parseDate(r[11]);
      const amount = parseAmount(r[14]);
      if (date && amount > 0) {
        investments.push({
          id: genId(),
          date,
          asset: r[12].trim(),
          amount,
          note: (r[13] || '').trim(),
        });
      }
    }
  }

  console.log(`Parsed: ${transactions.length} transactions, ${investments.length} investments`);
  console.log(`Setting categories...`);
  await apiCall('setCategories', { categories: CATEGORIES });
  console.log(`Batch importing...`);
  const result = await apiCall('batchImport', { transactions, investments });
  console.log(`Done:`, result);
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
