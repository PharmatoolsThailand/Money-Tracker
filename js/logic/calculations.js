function inMonth(isoDate, dateObj) {
  const d = new Date(isoDate);
  return d.getFullYear() === dateObj.getFullYear() && d.getMonth() === dateObj.getMonth();
}

function inYear(isoDate, year) {
  const d = new Date(isoDate);
  return d.getFullYear() === year;
}

function monthSummary(dateObj) {
  const txns = App.transactions.filter(t => inMonth(t.date, dateObj));
  let income = 0, expense = 0;
  for (const t of txns) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else expense += amt;
  }
  return { income, expense, balance: income - expense, txns };
}

function yearSummary(year) {
  let income = 0, expense = 0;
  for (const t of App.transactions) {
    if (!inYear(t.date, year)) continue;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else expense += amt;
  }
  return { income, expense, balance: income - expense };
}

function expenseByCategory(year) {
  const grouped = {};
  for (const t of App.transactions) {
    if (t.type !== 'expense') continue;
    if (!inYear(t.date, year)) continue;
    grouped[t.category] = (grouped[t.category] || 0) + (Number(t.amount) || 0);
  }
  return Object.entries(grouped)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function monthlyBreakdown(year) {
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(year, m, 1);
    const { income, expense } = monthSummary(monthDate);
    const invest = App.investments
      .filter(i => inMonth(i.date, monthDate))
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const balance = income - expense - invest;
    rows.push({ month: m + 1, income, expense, balance, invest });
  }
  return rows;
}

function totalInvestment() {
  return App.investments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function daysBetween(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function computePeriod(preset, customStart, customEnd) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  let start, end, label;
  switch (preset) {
    case 'all': {
      const dates = [...App.transactions, ...App.investments].map(x => x.date).filter(Boolean).sort();
      start = dates[0] || isoDate(new Date(y, 0, 1));
      end = isoDate(today);
      label = `ทั้งหมด (${fmtDateThai(start)} – ${fmtDateThai(end)})`;
      break;
    }
    case 'thisMonth':
      start = isoDate(new Date(y, m, 1));
      end = isoDate(new Date(y, m + 1, 0));
      label = `เดือน ${fmtMonthThai(today)}`;
      break;
    case 'ytd':
      start = isoDate(new Date(y, 0, 1));
      end = isoDate(today);
      label = `YTD: 1 ม.ค. ${y + 543} – ${fmtDateThai(end)}`;
      break;
    case 'thisYear':
      start = isoDate(new Date(y, 0, 1));
      end = isoDate(new Date(y, 11, 31));
      label = `ปี ${y + 543}`;
      break;
    case 'last30': {
      const s = new Date(today); s.setDate(d - 29);
      start = isoDate(s);
      end = isoDate(today);
      label = `30 วันล่าสุด`;
      break;
    }
    case 'last90': {
      const s = new Date(today); s.setDate(d - 89);
      start = isoDate(s);
      end = isoDate(today);
      label = `90 วันล่าสุด`;
      break;
    }
    case 'custom':
      start = customStart || isoDate(new Date(y, 0, 1));
      end = customEnd || isoDate(today);
      label = `${fmtDateThai(start)} – ${fmtDateThai(end)}`;
      break;
    default:
      start = isoDate(new Date(y, m, 1));
      end = isoDate(new Date(y, m + 1, 0));
      label = `เดือน ${fmtMonthThai(today)}`;
  }
  return { start, end, label, days: daysBetween(start, end) };
}

function filterByDateRange(items, start, end) {
  return items.filter(it => it.date && it.date >= start && it.date <= end);
}

function computeKpis(period) {
  const txns = filterByDateRange(App.transactions, period.start, period.end);
  const invs = filterByDateRange(App.investments, period.start, period.end);
  const incomeTxns = txns.filter(t => t.type === 'income');
  const expenseTxns = txns.filter(t => t.type === 'expense');
  const income = incomeTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expense = expenseTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const invest = invs.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const balance = income - expense - invest;
  const savingsRate = income > 0 ? (invest / income) * 100 : 0;
  const dailyExpense = expense / period.days;
  const investRate = income > 0 ? (invest / income) * 100 : 0;
  return {
    income, expense, balance, invest,
    incomeCount: incomeTxns.length,
    expenseCount: expenseTxns.length,
    investCount: invs.length,
    savingsRate, dailyExpense, investRate, days: period.days,
    investCumulative: App.investments
      .filter(i => i.date && i.date <= period.end)
      .reduce((s, i) => s + (Number(i.amount) || 0), 0),
  };
}

function expenseByCategoryRange(start, end) {
  return groupByCategoryRange('expense', start, end);
}

function incomeByCategoryRange(start, end) {
  return groupByCategoryRange('income', start, end);
}

function groupByCategoryRange(type, start, end) {
  const grouped = {};
  for (const t of App.transactions) {
    if (t.type !== type) continue;
    if (!t.date || t.date < start || t.date > end) continue;
    grouped[t.category] = (grouped[t.category] || 0) + (Number(t.amount) || 0);
  }
  return Object.entries(grouped)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function expenseByCategoryKindRange(start, end) {
  // returns [{ category, regular, general, credit, installment, total }]
  const grouped = {};
  for (const t of App.transactions) {
    if (t.type !== 'expense') continue;
    if (!t.date || t.date < start || t.date > end) continue;
    const c = t.category;
    if (!grouped[c]) grouped[c] = { regular: 0, general: 0, credit: 0, installment: 0 };
    const amt = Number(t.amount) || 0;
    const k = t.expense_kind;
    if (k === 'ประจำ') grouped[c].regular += amt;
    else if (k === 'บัตรเครดิต') grouped[c].credit += amt;
    else if (k === 'ผ่อน') grouped[c].installment += amt;
    else grouped[c].general += amt;
  }
  return Object.entries(grouped)
    .map(([category, v]) => ({
      category,
      regular: v.regular,
      general: v.general,
      credit: v.credit,
      installment: v.installment,
      total: v.regular + v.general + v.credit + v.installment,
    }))
    .sort((a, b) => b.total - a.total);
}

function expenseKindTotals(start, end) {
  let regular = 0, general = 0, credit = 0, installment = 0;
  for (const t of App.transactions) {
    if (t.type !== 'expense') continue;
    if (!t.date || t.date < start || t.date > end) continue;
    const amt = Number(t.amount) || 0;
    const k = t.expense_kind;
    if (k === 'ประจำ') regular += amt;
    else if (k === 'บัตรเครดิต') credit += amt;
    else if (k === 'ผ่อน') installment += amt;
    else general += amt;
  }
  return { regular, general, credit, installment, total: regular + general + credit + installment };
}

function availableYears() {
  const years = new Set();
  for (const t of App.transactions) {
    const y = new Date(t.date).getFullYear();
    if (!isNaN(y)) years.add(y);
  }
  for (const i of App.investments) {
    const y = new Date(i.date).getFullYear();
    if (!isNaN(y)) years.add(y);
  }
  if (years.size === 0) years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}
