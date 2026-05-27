let _ocrWorker = null;
let _ocrLoading = null;

async function getOcrWorker(onProgress) {
  if (_ocrWorker) return _ocrWorker;
  if (_ocrLoading) return _ocrLoading;
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js ยังโหลดไม่เสร็จ — ต่อ internet?');
  }
  _ocrLoading = (async () => {
    const worker = await Tesseract.createWorker(['tha', 'eng'], 1, {
      logger: m => { if (onProgress) onProgress(m); },
    });
    _ocrWorker = worker;
    return worker;
  })();
  return _ocrLoading;
}

async function recognizeSlip(file, onProgress) {
  const worker = await getOcrWorker(onProgress);
  const { data } = await worker.recognize(file);
  return { parsed: parseSlip(data.text), raw: data.text };
}

// Thai month abbreviations (with or without dots) → month number
const THAI_MONTHS = [
  ['ม.ค', 1], ['ก.พ', 2], ['มี.ค', 3], ['เม.ย', 4], ['พ.ค', 5], ['มิ.ย', 6],
  ['ก.ค', 7], ['ส.ค', 8], ['ก.ย', 9], ['ต.ค', 10], ['พ.ย', 11], ['ธ.ค', 12],
];

function thaiMonthToNum(raw) {
  const stripped = raw.replace(/\./g, '').toLowerCase();
  for (const [k, v] of THAI_MONTHS) {
    if (k.replace(/\./g, '').toLowerCase() === stripped) return v;
  }
  return null;
}

function parseSlip(text) {
  const result = { date: null, amount: null, recipient: null, sender: null, ref: null };

  // Date: e.g. "26 พ.ค. 2569" / "26 พ.ค 2569" / "26พ.ค.2569"
  const dateRe = /(\d{1,2})\s*(ม\.?\s*ค|ก\.?\s*พ|มี\.?\s*ค|เม\.?\s*ย|พ\.?\s*ค|มิ\.?\s*ย|ก\.?\s*ค|ส\.?\s*ค|ก\.?\s*ย|ต\.?\s*ค|พ\.?\s*ย|ธ\.?\s*ค)\.?\s*(\d{4})/;
  const dm = text.match(dateRe);
  if (dm) {
    const day = Number(dm[1]);
    const month = thaiMonthToNum(dm[2]);
    let year = Number(dm[3]);
    if (year > 2400) year -= 543;
    if (month) {
      result.date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Amount: "3,000.00 บาท" — pick the LARGEST match (skip fee 0.00)
  const amountMatches = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})\s*บาท/g)];
  if (amountMatches.length) {
    const nums = amountMatches.map(m => Number(m[1].replace(/,/g, '')));
    result.amount = Math.max(...nums);
  }

  // Recipient: text after "ไปยัง" (next non-empty line)
  const recipMatch = text.match(/ไปยัง[^\n]*\n+([^\n]+)/);
  if (recipMatch) result.recipient = cleanName(recipMatch[1]);

  // Sender: text after "จาก"
  const senderMatch = text.match(/จาก[^\n]*\n+([^\n]+)/);
  if (senderMatch) result.sender = cleanName(senderMatch[1]);

  // Reference id: รหัสอ้างอิง XXXXX
  const refMatch = text.match(/รหัสอ้างอิง\s*([A-Za-z0-9]+)/);
  if (refMatch) result.ref = refMatch[1];

  return result;
}

function cleanName(s) {
  return s.replace(/\s+/g, ' ').replace(/[\*]+/g, '').trim();
}

function buildSlipNote(parsed) {
  const parts = [];
  if (parsed.recipient) parts.push('→ ' + parsed.recipient);
  if (parsed.ref) parts.push('ref:' + parsed.ref);
  return parts.join(' | ');
}
