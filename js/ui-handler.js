function setSyncStatus(text, color = 'text-slate-500') {
  const el = document.getElementById('syncStatus');
  el.className = `text-xs ${color}`;
  el.textContent = text;
}

const PAGE_TITLES = {
  home: 'หน้าหลัก',
  transactions: 'รายการทั้งหมด',
  reports: 'รายงานสรุป',
  planner: 'วางแผนการเงิน',
  categories: 'จัดการหมวด',
  settings: 'ตั้งค่า',
};

function switchPage(name) {
  if (!PAGE_TITLES[name]) name = 'home';
  App.currentTab = name;
  document.querySelectorAll('.page').forEach(s => s.classList.add('hidden'));
  const target = document.querySelector(`.page[data-page="${name}"]`);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });
  switch (name) {
    case 'home': renderTransactions(); break;
    case 'transactions': renderAllTransactions(); break;
    case 'reports': renderSummary(); break;
    case 'planner': renderPlanner(); break;
    case 'categories': renderCategoryLists(); break;
    case 'settings': renderSettings(); break;
  }
}

// Backward-compat alias (legacy callers still call switchTab)
function switchTab(name) {
  const map = { transactions: 'home', summary: 'reports' };
  switchPage(map[name] || name);
}

function populateCategorySelect() {
  const select = document.querySelector('#formTransaction select[name="category"]');
  if (!select) return;
  const type = document.querySelector('#formTransaction input[name="type"]:checked').value;
  if (type === 'income' || type === 'expense') {
    const cats = App.categories[type] || [];
    select.innerHTML = cats.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  }
  toggleFormFields(type);
}

function toggleFormFields(type) {
  document.querySelectorAll('#formTransaction [data-show-for]').forEach(el => {
    const showFor = el.dataset.showFor.split(' ');
    const show = showFor.includes(type);
    el.classList.toggle('hidden', !show);
    el.querySelectorAll('[data-required]').forEach(input => {
      if (show) input.setAttribute('required', '');
      else input.removeAttribute('required');
    });
  });
}

function renderTransactions() {
  const date = App.currentMonth;
  document.getElementById('currentMonthLabel').textContent = `(${fmtMonthThai(date)})`;
  const { income, expense, txns } = monthSummary(date);
  const monthInvs = App.investments.filter(i => inMonth(i.date, date));
  const invest = monthInvs.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const balance = income - expense - invest;

  // Hero balance
  const heroBalance = document.getElementById('heroBalance');
  heroBalance.textContent = (balance >= 0 ? '+' : '-') + fmtBaht(balance);
  heroBalance.style.color = balance >= 0 ? '#d1fae5' : '#fecaca';

  // Hero stats (2-col: savings rate + daily expense) — mirror Reports
  const savingsRate = income > 0 ? (invest / income) * 100 : 0;
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dailyExpense = expense / daysInMonth;
  document.getElementById('homeSaving').textContent = savingsRate.toFixed(1) + '%';
  document.getElementById('homeDaily').textContent = fmtBaht(dailyExpense);
  document.getElementById('homeDailySub').textContent = `จาก ${daysInMonth} วัน`;

  // KPI mini cards
  document.getElementById('sumIncome').textContent = '+' + fmtBaht(income);
  document.getElementById('sumExpense').textContent = '-' + fmtBaht(expense);
  document.getElementById('sumInvest').textContent = fmtBaht(invest);
  const incomeCount = txns.filter(t => t.type === 'income').length;
  const expenseCount = txns.filter(t => t.type === 'expense').length;
  document.getElementById('sumIncomeCount').textContent = `${incomeCount} รายการ`;
  document.getElementById('sumExpenseCount').textContent = `${expenseCount} รายการ`;
  document.getElementById('sumInvestCount').textContent = `${monthInvs.length} รายการ • สะสม ${fmtBaht(totalInvestment())}`;

  // Activity feed
  renderActivityFeed();
}

function renderActivityFeed() {
  const all = [
    ...App.transactions.map(t => ({ ...t, _kind: t.type })),
    ...App.investments.map(i => ({ id: i.id, date: i.date, amount: i.amount, category: i.asset, note: i.note, _kind: 'invest' })),
  ];
  all.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const recent = all.slice(0, 20);
  document.getElementById('activityHint').textContent = `${recent.length} รายการล่าสุด`;

  const feed = document.getElementById('activityFeed');
  if (recent.length === 0) {
    feed.innerHTML = `<div class="activity-empty">ยังไม่มีรายการ — เพิ่มรายการแรกได้เลย</div>`;
    return;
  }

  const today = todayIso();
  const yesterday = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return isoDate(d);
  })();

  function dateLabel(iso) {
    if (iso === today) return 'วันนี้';
    if (iso === yesterday) return 'เมื่อวาน';
    return fmtDateThai(iso);
  }

  const groups = {};
  for (const item of recent) {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
  }

  let html = '';
  for (const dateKey of Object.keys(groups)) {
    html += `<div class="activity-date-group">${dateLabel(dateKey)}</div>`;
    for (const it of groups[dateKey]) {
      const kind = it._kind;
      const icon = kind === 'invest' ? '📈' : getCategoryIcon(kind, it.category);
      const amtSign = kind === 'income' ? '+' : kind === 'expense' ? '-' : '';
      const meta = [];
      if (kind === 'expense') {
        if (it.expense_kind) meta.push(`<span class="badge ${expenseKindBadgeClass(it.expense_kind)}">${it.expense_kind}</span>`);
        if (it.payment_method) meta.push(`<span class="badge ${it.payment_method === 'สด' ? 'badge-amber' : 'badge-slate'}">${it.payment_method}</span>`);
      }
      if (it.note) meta.push(`<span>${escapeHtml(it.note)}</span>`);
      html += `<div class="activity-item">
        <div class="activity-icon ${kind}">${icon}</div>
        <div class="activity-body">
          <div class="activity-title">${escapeHtml(it.category)}</div>
          <div class="activity-meta">${meta.join('')}</div>
        </div>
        <div class="activity-amount ${kind}">${amtSign}${fmtBaht(it.amount)}</div>
      </div>`;
    }
  }
  feed.innerHTML = html;
}

function renderSummary() {
  const period = computePeriod(App.report.preset, App.report.customStart, App.report.customEnd);
  App.report.start = period.start;
  App.report.end = period.end;
  App.report.label = period.label;

  document.querySelectorAll('.period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === App.report.preset);
  });
  document.getElementById('customRange').classList.toggle('hidden', App.report.preset !== 'custom');
  document.getElementById('periodStart').value = App.report.customStart || period.start;
  document.getElementById('periodEnd').value = App.report.customEnd || period.end;
  document.getElementById('periodLabel').textContent = `${period.label} · ${period.days} วัน`;

  const k = computeKpis(period);
  const kt = expenseKindTotals(period.start, period.end);

  // HERO
  const heroBal = document.getElementById('kpiBalance');
  heroBal.textContent = (k.balance >= 0 ? '+' : '-') + fmtBaht(k.balance);
  heroBal.style.color = k.balance >= 0 ? '#d1fae5' : '#fecaca';
  document.getElementById('kpiBalanceSub').textContent = `(${period.label})`;
  document.getElementById('kpiSaving').textContent = k.savingsRate.toFixed(1) + '%';
  document.getElementById('kpiSavingSub').textContent = 'ลงทุน ÷ รายรับ';
  document.getElementById('kpiDaily').textContent = fmtBaht(k.dailyExpense);
  document.getElementById('kpiDailySub').textContent = `จาก ${k.days} วัน`;

  // 3 KPI
  document.getElementById('kpiIncome').textContent = '+' + fmtBaht(k.income);
  document.getElementById('kpiIncomeSub').textContent = `${k.incomeCount} รายการ`;
  document.getElementById('kpiExpense').textContent = '-' + fmtBaht(k.expense);
  document.getElementById('kpiExpenseSub').textContent = `${k.expenseCount} รายการ`;
  document.getElementById('kpiInvest').textContent = fmtBaht(k.invest);
  document.getElementById('kpiInvestSub').textContent = `${k.investCount} รายการ • สะสมตลอด ${fmtBaht(k.investCumulative)}`;

  // Expense kind cards (4: ประจำ / ผ่อน / บัตรเครดิต / ทั่วไป)
  const kindTotal = kt.total || 1;
  const pct = v => `${((v / kindTotal) * 100).toFixed(1)}% ของรายจ่าย`;
  document.getElementById('kindRegular').textContent = fmtBaht(kt.regular);
  document.getElementById('kindRegularSub').textContent = pct(kt.regular);
  document.getElementById('kindInstallment').textContent = fmtBaht(kt.installment);
  document.getElementById('kindInstallmentSub').textContent = pct(kt.installment);
  document.getElementById('kindCredit').textContent = fmtBaht(kt.credit);
  document.getElementById('kindCreditSub').textContent = pct(kt.credit);
  document.getElementById('kindGeneral').textContent = fmtBaht(kt.general);
  document.getElementById('kindGeneralSub').textContent = pct(kt.general);

  // Breakdown tables with bar chart
  const monthly = monthlyBreakdown(new Date(period.end).getFullYear());
  renderCategoryBreakdown('tblIncomeByCategory', incomeByCategoryRange(period.start, period.end), 'income', 'emerald');
  renderExpenseKindBreakdown(expenseByCategoryKindRange(period.start, period.end));

  // Monthly breakdown
  document.getElementById('tblMonthly').innerHTML = monthly.map(r => `
    <tr>
      <td class="px-2 py-1">${r.month}</td>
      <td class="px-2 py-1 text-right text-emerald-700">${r.income ? '+' + fmtBaht(r.income) : '-'}</td>
      <td class="px-2 py-1 text-right text-rose-700">${r.expense ? '-' + fmtBaht(r.expense) : '-'}</td>
      <td class="px-2 py-1 text-right font-medium ${r.balance >= 0 ? 'text-teal-700' : 'text-rose-700'}">${r.balance ? (r.balance >= 0 ? '+' : '-') + fmtBaht(r.balance) : '-'}</td>
      <td class="px-2 py-1 text-right text-slate-600">${r.invest ? fmtBaht(r.invest) : '-'}</td>
    </tr>`).join('');
}

function renderExpenseKindBreakdown(rows) {
  const tbody = document.getElementById('tblExpenseByCategory');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-2 py-2 text-center text-slate-400">ไม่มีข้อมูลในช่วงนี้</td></tr>`;
    return;
  }
  const grandTotal = rows.reduce((s, r) => s + r.total, 0) || 1;
  const max = rows[0]?.total || 1;
  tbody.innerHTML = rows.map(r => {
    const share = ((r.total / grandTotal) * 100).toFixed(1);
    const regPct = r.total ? (r.regular / r.total) * 100 : 0;
    const instPct = r.total ? (r.installment / r.total) * 100 : 0;
    const credPct = r.total ? (r.credit / r.total) * 100 : 0;
    const genPct = r.total ? (r.general / r.total) * 100 : 0;
    const widthPct = Math.round((r.total / max) * 100);
    const tooltip = `ประจำ ${fmtBaht(r.regular)} • ผ่อน ${fmtBaht(r.installment)} • บัตร ${fmtBaht(r.credit)} • ทั่วไป ${fmtBaht(r.general)}`;
    return `<tr>
      <td class="px-2 py-1 w-32">${getCategoryIcon('expense', r.category)} ${escapeHtml(r.category)}</td>
      <td class="px-2 py-1">
        <div class="h-4 bg-rose-100 rounded relative overflow-hidden">
          <div class="h-full flex" style="width:${widthPct}%" title="${tooltip}">
            <div class="bg-rose-600" style="width:${regPct}%"></div>
            <div class="bg-rose-500" style="width:${instPct}%"></div>
            <div class="bg-rose-400" style="width:${credPct}%"></div>
            <div class="bg-rose-300" style="width:${genPct}%"></div>
          </div>
        </div>
      </td>
      <td class="px-2 py-1 text-right text-xs text-rose-700 w-16">${r.regular ? fmtBaht(r.regular) : '—'}</td>
      <td class="px-2 py-1 text-right text-xs text-rose-600 w-16">${r.installment ? fmtBaht(r.installment) : '—'}</td>
      <td class="px-2 py-1 text-right text-xs text-rose-500 w-16">${r.credit ? fmtBaht(r.credit) : '—'}</td>
      <td class="px-2 py-1 text-right text-xs text-slate-700 w-16">${r.general ? fmtBaht(r.general) : '—'}</td>
      <td class="px-2 py-1 text-right text-xs text-slate-500 w-12">${share}%</td>
      <td class="px-2 py-1 text-right font-medium text-rose-700 w-24">-${fmtBaht(r.total)}</td>
    </tr>`;
  }).join('');
}

function renderCategoryBreakdown(tbodyId, cats, catType, color) {
  const total = cats.reduce((s, c) => s + c.total, 0) || 1;
  const max = cats[0]?.total || 1;
  const tbody = document.getElementById(tbodyId);
  if (cats.length === 0) {
    tbody.innerHTML = `<tr><td class="px-2 py-2 text-center text-slate-400">ไม่มีข้อมูลในช่วงนี้</td></tr>`;
    return;
  }
  tbody.innerHTML = cats.map(c => {
    const pct = Math.round((c.total / max) * 100);
    const share = ((c.total / total) * 100).toFixed(1);
    const sign = catType === 'income' ? '+' : '-';
    return `<tr>
      <td class="px-2 py-1 w-32">${getCategoryIcon(catType, c.category)} ${escapeHtml(c.category)}</td>
      <td class="px-2 py-1">
        <div class="h-4 bg-${color}-100 rounded relative overflow-hidden">
          <div class="h-full bg-${color}-400" style="width:${pct}%"></div>
        </div>
      </td>
      <td class="px-2 py-1 text-right text-xs text-slate-500 w-12">${share}%</td>
      <td class="px-2 py-1 text-right font-medium text-${color}-700 w-28">${sign}${fmtBaht(c.total)}</td>
    </tr>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSettings() {
  document.getElementById('settingsUrl').value = App.settings.apiUrl || '';
  document.getElementById('testResult').textContent = '';
}

function renderCategoryLists() {
  for (const type of ['expense', 'income']) {
    const ul = document.getElementById(type === 'expense' ? 'listExpenseCats' : 'listIncomeCats');
    ul.innerHTML = App.categories[type].map((c, idx) => `
      <li>
        <span>${c.icon} ${escapeHtml(c.name)}</span>
        <button class="btn-delete" data-del-cat-type="${type}" data-del-cat-idx="${idx}">×</button>
      </li>`).join('');
  }
}

// ─── Transactions page (full list with filter) ─────────────
function renderAllTransactions() {
  const all = [
    ...App.transactions.map(t => ({ ...t, _kind: t.type })),
    ...App.investments.map(i => ({ id: i.id, date: i.date, amount: i.amount, category: i.asset, note: i.note, _kind: 'investment' })),
  ];

  const fType = document.getElementById('filterType').value;
  const fCat = document.getElementById('filterCategory').value;
  const fFrom = document.getElementById('filterFrom').value;
  const fTo = document.getElementById('filterTo').value;
  const fSearch = (document.getElementById('filterSearch').value || '').toLowerCase().trim();

  let filtered = all;
  if (fType) filtered = filtered.filter(t => t._kind === fType);
  if (fCat) filtered = filtered.filter(t => t.category === fCat);
  if (fFrom) filtered = filtered.filter(t => t.date >= fFrom);
  if (fTo) filtered = filtered.filter(t => t.date <= fTo);
  if (fSearch) filtered = filtered.filter(t =>
    String(t.note || '').toLowerCase().includes(fSearch) ||
    String(t.category || '').toLowerCase().includes(fSearch)
  );

  filtered.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // Populate category select (union of all categories present)
  const catSel = document.getElementById('filterCategory');
  const cats = [...new Set(all.map(t => t.category).filter(Boolean))].sort();
  const currentCat = catSel.value;
  catSel.innerHTML = `<option value="">ทุกหมวด</option>` + cats.map(c => `<option value="${escapeHtml(c)}" ${c === currentCat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  // Stat line
  const total = filtered.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  document.getElementById('filterStat').textContent =
    filtered.length ? `แสดง ${filtered.length}/${all.length} รายการ • รวม ${fmtBaht(total)}` : 'ไม่พบรายการตาม filter';

  const tbody = document.getElementById('tblAllTransactions');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">ไม่พบรายการ</div></td></tr>`;
    return;
  }
  const today = todayIso();
  tbody.innerHTML = filtered.map(t => {
    const kind = t._kind;
    const typeLabel = kind === 'income' ? '💰 รายรับ' : kind === 'expense' ? '🛒 รายจ่าย' : '📈 ลงทุน';
    const sign = kind === 'income' ? '+' : kind === 'expense' ? '-' : '';
    const color = kind === 'income' ? 'text-emerald-700' : kind === 'expense' ? 'text-rose-700' : 'text-indigo-700';
    const delAttr = kind === 'investment' ? `data-del-inv="${t.id}"` : `data-del-tx="${t.id}"`;
    const badges = [];
    if (kind === 'expense') {
      if (t.expense_kind) badges.push(`<span class="badge ${expenseKindBadgeClass(t.expense_kind)}">${t.expense_kind}</span>`);
      if (t.payment_method) badges.push(`<span class="badge ${t.payment_method === 'สด' ? 'badge-amber' : 'badge-slate'}">${t.payment_method}</span>`);
    }
    return `<tr class="${t.date === today ? 'today' : ''}">
      <td class="px-3 py-2">${fmtDateThai(t.date)}</td>
      <td class="px-3 py-2 text-xs text-slate-500">${typeLabel}</td>
      <td class="px-3 py-2">${kind === 'investment' ? '📈' : getCategoryIcon(kind, t.category)} ${escapeHtml(t.category)}</td>
      <td class="px-3 py-2 text-right font-medium ${color}">${sign}${fmtBaht(t.amount)}</td>
      <td class="px-3 py-2 text-slate-600">${badges.join(' ')} ${escapeHtml(t.note || '')}</td>
      <td class="px-3 py-2 text-right"><button class="btn-delete" ${delAttr} title="ลบ">×</button></td>
    </tr>`;
  }).join('');
}
