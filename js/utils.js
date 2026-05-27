function fmtBaht(n) {
  const num = Number(n) || 0;
  return '฿' + Math.abs(num).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function expenseKindBadgeClass(kind) {
  switch (kind) {
    case 'ประจำ': return 'badge-blue';
    case 'ผ่อน': return 'badge-indigo';
    case 'บัตรเครดิต': return 'badge-purple';
    default: return 'badge-slate';
  }
}

function fmtDateThai(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d)) return isoDate;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtMonthThai(date) {
  return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getCategoryIcon(type, name) {
  const cats = App.categories[type] || [];
  const found = cats.find(c => c.name === name);
  return found?.icon || '📌';
}
