async function apiRequest(action, payload = {}) {
  if (!App.settings.apiUrl) {
    throw new Error('ยังไม่ได้ตั้งค่า URL');
  }
  const body = JSON.stringify({ action, ...payload });
  // text/plain avoids CORS preflight (Apps Script can't respond to OPTIONS)
  const res = await fetch(App.settings.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Unknown error');
  return data.result;
}

async function fetchAllData() {
  const result = await apiRequest('getAll');
  App.transactions = result.transactions || [];
  App.investments = result.investments || [];
  if (result.categories?.expense?.length) App.categories.expense = result.categories.expense;
  if (result.categories?.income?.length) App.categories.income = result.categories.income;
  if (result.budget && (result.budget.income?.length || result.budget.expense?.length)) {
    App.budget = {
      year: result.budget.year || App.budget.year || new Date().getFullYear(),
      income: result.budget.income || [],
      expense: result.budget.expense || [],
    };
    if (typeof saveBudget === 'function') saveBudget();
  }
}

async function pushTransaction(t) {
  return apiRequest('addTransaction', { transaction: t });
}

async function pushInvestment(i) {
  return apiRequest('addInvestment', { investment: i });
}

async function deleteRecord(kind, id) {
  return apiRequest('delete', { kind, id });
}

async function pushCategories() {
  return apiRequest('setCategories', { categories: App.categories });
}

async function saveBudgetToSheet(budget) {
  return apiRequest('setBudget', { budget });
}

async function pingServer() {
  return apiRequest('ping');
}
