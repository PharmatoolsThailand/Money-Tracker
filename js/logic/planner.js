const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function plannerNewId() {
  return 'b_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function plannerSum(amounts) {
  return (amounts || []).reduce((s, n) => s + (Number(n) || 0), 0);
}

function plannerEmptyAmounts() {
  return Array(12).fill(0);
}

function renderPlanner() {
  document.getElementById('plannerYear').textContent = (App.budget.year || new Date().getFullYear()) + ' (' + ((App.budget.year || new Date().getFullYear()) + 543) + ')';

  const wrap = document.getElementById('plannerTableWrap');

  // Preserve scroll + focus across rerender so editing doesn't snap back to month 1
  const oldScroller = wrap.querySelector('.planner-scroll');
  const scrollLeft = oldScroller ? oldScroller.scrollLeft : 0;
  const scrollTop = oldScroller ? oldScroller.scrollTop : 0;
  const active = document.activeElement;
  const focus = (active && wrap.contains(active)) ? {
    id: active.dataset?.budgetId,
    month: active.dataset?.budgetMonth,
    name: active.dataset?.budgetName,
    cursor: (typeof active.selectionStart === 'number') ? active.selectionStart : null,
  } : null;
  const incomeRows = App.budget.income.map(it => plannerRowHtml(it, 'income')).join('');
  const expenseRows = App.budget.expense.map(it => plannerRowHtml(it, 'expense')).join('');

  const monthHead = MONTH_LABELS.map(m => `<th class="planner-th-month">${m}</th>`).join('');

  const incomeTotals = MONTH_LABELS.map((_, mi) =>
    App.budget.income.reduce((s, it) => s + (Number(it.amounts?.[mi]) || 0), 0)
  );
  const expenseTotals = MONTH_LABELS.map((_, mi) =>
    App.budget.expense.reduce((s, it) => s + (Number(it.amounts?.[mi]) || 0), 0)
  );
  const balanceByMonth = incomeTotals.map((inc, mi) => inc - expenseTotals[mi]);

  const yearIncome = incomeTotals.reduce((a, b) => a + b, 0);
  const yearExpense = expenseTotals.reduce((a, b) => a + b, 0);
  const yearBalance = yearIncome - yearExpense;

  wrap.innerHTML = `
    <div class="planner-summary">
      <div class="planner-summary-card planner-summary-income">
        <div class="planner-summary-label">รายรับรวมทั้งปี</div>
        <div class="planner-summary-value">+${fmtBaht(yearIncome)}</div>
      </div>
      <div class="planner-summary-card planner-summary-expense">
        <div class="planner-summary-label">รายจ่ายประจำรวมทั้งปี</div>
        <div class="planner-summary-value">-${fmtBaht(yearExpense)}</div>
      </div>
      <div class="planner-summary-card planner-summary-balance">
        <div class="planner-summary-label">เหลือใช้ทั้งปี</div>
        <div class="planner-summary-value">${yearBalance >= 0 ? '+' : '-'}${fmtBaht(yearBalance)}</div>
      </div>
    </div>

    <div class="planner-scroll">
      <table class="planner-table">
        <thead>
          <tr>
            <th class="planner-th-label">รายการ</th>
            ${monthHead}
            <th class="planner-th-total">รวม</th>
            <th class="planner-th-action"></th>
          </tr>
        </thead>
        <tbody>
          <tr class="planner-section-row planner-section-income">
            <td colspan="14">💰 รายรับ</td>
          </tr>
          ${incomeRows || `<tr class="planner-empty-row"><td colspan="14">— ยังไม่มีรายการ — กด "+ รายรับ" เพื่อเพิ่ม</td></tr>`}
          <tr class="planner-total-row planner-total-income">
            <td class="planner-td-label">รวมรายรับ</td>
            ${incomeTotals.map(v => `<td class="planner-td-num">${v ? fmtBaht(v) : '-'}</td>`).join('')}
            <td class="planner-td-num planner-td-grand">${fmtBaht(yearIncome)}</td>
            <td></td>
          </tr>

          <tr class="planner-section-row planner-section-expense">
            <td colspan="14">🛒 รายจ่ายประจำ</td>
          </tr>
          ${expenseRows || `<tr class="planner-empty-row"><td colspan="14">— ยังไม่มีรายการ — กด "+ รายจ่ายประจำ" เพื่อเพิ่ม</td></tr>`}
          <tr class="planner-total-row planner-total-expense">
            <td class="planner-td-label">รวมรายจ่ายประจำ</td>
            ${expenseTotals.map(v => `<td class="planner-td-num">${v ? fmtBaht(v) : '-'}</td>`).join('')}
            <td class="planner-td-num planner-td-grand">${fmtBaht(yearExpense)}</td>
            <td></td>
          </tr>

          <tr class="planner-balance-row">
            <td class="planner-td-label">เหลือใช้</td>
            ${balanceByMonth.map(v => `<td class="planner-td-num ${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '-'}${fmtBaht(v)}</td>`).join('')}
            <td class="planner-td-num planner-td-grand ${yearBalance >= 0 ? 'pos' : 'neg'}">${yearBalance >= 0 ? '+' : '-'}${fmtBaht(yearBalance)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  bindPlannerInputs();

  // Restore scroll + focus
  const newScroller = wrap.querySelector('.planner-scroll');
  if (newScroller) {
    newScroller.scrollLeft = scrollLeft;
    newScroller.scrollTop = scrollTop;
  }
  if (focus) {
    let el = null;
    if (focus.id && focus.month !== undefined) {
      el = wrap.querySelector(`input[data-budget-id="${focus.id}"][data-budget-month="${focus.month}"]`);
    } else if (focus.name) {
      el = wrap.querySelector(`input[data-budget-name="${focus.name}"]`);
    }
    if (el) {
      el.focus({ preventScroll: true });
      if (focus.cursor != null) {
        try { el.setSelectionRange(focus.cursor, focus.cursor); } catch (e) {}
      }
    }
  }
}

function plannerRowHtml(item, kind) {
  const total = plannerSum(item.amounts);
  const cells = MONTH_LABELS.map((m, i) => {
    const val = Number(item.amounts?.[i]) || 0;
    return `<td class="planner-td-input">
      <input type="number" step="1" min="0" inputmode="numeric"
        data-budget-id="${item.id}" data-budget-month="${i}"
        value="${val || ''}" placeholder="0">
    </td>`;
  }).join('');
  return `<tr class="planner-item-row" data-budget-kind="${kind}" data-budget-id="${item.id}">
    <td class="planner-td-label">
      <input type="text" class="planner-name-input" data-budget-name="${item.id}" value="${escapeHtml(item.name || '')}" placeholder="ชื่อรายการ">
      <button class="planner-fill-btn" data-budget-fill="${item.id}" title="ใช้ค่าของเดือนแรกที่กรอก เติมทุกเดือน">⇒</button>
    </td>
    ${cells}
    <td class="planner-td-num planner-td-grand">${total ? fmtBaht(total) : '-'}</td>
    <td class="planner-td-action">
      <button class="btn-delete" data-budget-del="${item.id}" title="ลบรายการ">×</button>
    </td>
  </tr>`;
}

function bindPlannerInputs() {
  document.querySelectorAll('#plannerTableWrap input[data-budget-month]').forEach(inp => {
    inp.addEventListener('change', e => {
      const id = e.target.dataset.budgetId;
      const month = parseInt(e.target.dataset.budgetMonth, 10);
      const val = Number(e.target.value) || 0;
      const item = findBudgetItem(id);
      if (!item) return;
      if (!Array.isArray(item.amounts) || item.amounts.length !== 12) item.amounts = plannerEmptyAmounts();
      item.amounts[month] = val;
      saveBudget();
      queueBudgetSync();
      renderPlanner();
    });
  });
  document.querySelectorAll('#plannerTableWrap input[data-budget-name]').forEach(inp => {
    inp.addEventListener('change', e => {
      const id = e.target.dataset.budgetName;
      const item = findBudgetItem(id);
      if (!item) return;
      item.name = e.target.value;
      saveBudget();
      queueBudgetSync();
    });
  });
  document.querySelectorAll('#plannerTableWrap button[data-budget-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.dataset.budgetDel;
      const inIncome = App.budget.income.find(i => i.id === id);
      if (inIncome) App.budget.income = App.budget.income.filter(i => i.id !== id);
      else App.budget.expense = App.budget.expense.filter(i => i.id !== id);
      saveBudget();
      queueBudgetSync();
      renderPlanner();
    });
  });
  document.querySelectorAll('#plannerTableWrap button[data-budget-fill]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.dataset.budgetFill;
      const item = findBudgetItem(id);
      if (!item) return;
      const first = (item.amounts || []).find(n => Number(n) > 0);
      if (!first) return;
      item.amounts = Array(12).fill(Number(first));
      saveBudget();
      queueBudgetSync();
      renderPlanner();
    });
  });
}

function findBudgetItem(id) {
  return App.budget.income.find(i => i.id === id) || App.budget.expense.find(i => i.id === id);
}

function addBudgetIncome() {
  App.budget.income.push({ id: plannerNewId(), name: '', amounts: plannerEmptyAmounts() });
  saveBudget();
  queueBudgetSync();
  renderPlanner();
}

function addBudgetExpense() {
  App.budget.expense.push({ id: plannerNewId(), name: '', amounts: plannerEmptyAmounts() });
  saveBudget();
  queueBudgetSync();
  renderPlanner();
}

let _budgetSyncTimer = null;
function queueBudgetSync() {
  if (!App.settings.apiUrl || typeof saveBudgetToSheet !== 'function') return;
  clearTimeout(_budgetSyncTimer);
  _budgetSyncTimer = setTimeout(() => {
    saveBudgetToSheet(App.budget).catch(err => console.warn('budget sync failed', err));
  }, 800);
}
