function cacheKey() { return userKey('cache'); }
function pendingKey() { return userKey('pending'); }

function loadCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return false;
    const obj = JSON.parse(raw);
    App.transactions = obj.transactions || [];
    App.investments = obj.investments || [];
    if (obj.categories?.expense?.length) App.categories.expense = obj.categories.expense;
    if (obj.categories?.income?.length) App.categories.income = obj.categories.income;
    App.cache.loaded = true;
    App.cache.lastSync = obj.lastSync || null;
    return true;
  } catch (e) { return false; }
}

function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      transactions: App.transactions,
      investments: App.investments,
      categories: App.categories,
      lastSync: App.cache.lastSync,
    }));
  } catch (e) { console.warn('saveCache failed', e); }
}

function loadPending() {
  try {
    const raw = localStorage.getItem(pendingKey());
    App.pending = raw ? JSON.parse(raw) : [];
  } catch (e) { App.pending = []; }
}

function savePending() {
  try { localStorage.setItem(pendingKey(), JSON.stringify(App.pending)); }
  catch (e) { console.warn('savePending failed', e); }
}

function enqueueOp(action, payload) {
  App.pending.push({
    opId: 'op_' + genId(),
    action,
    payload,
    retries: 0,
    createdAt: new Date().toISOString(),
  });
  savePending();
  updateSyncIndicator();
  syncPending();
}

function applyPendingToLocal() {
  for (const op of App.pending) {
    switch (op.action) {
      case 'addTransaction': {
        const t = op.payload.transaction;
        if (!App.transactions.find(x => x.id === t.id)) App.transactions.push(t);
        break;
      }
      case 'addInvestment': {
        const i = op.payload.investment;
        if (!App.investments.find(x => x.id === i.id)) App.investments.push(i);
        break;
      }
      case 'delete': {
        const { kind, id } = op.payload;
        if (kind === 'transaction') App.transactions = App.transactions.filter(t => t.id !== id);
        else if (kind === 'investment') App.investments = App.investments.filter(i => i.id !== id);
        break;
      }
      case 'setCategories':
        if (op.payload.categories) App.categories = op.payload.categories;
        break;
    }
  }
}

async function syncPending() {
  if (App.syncing) return;
  if (!App.settings.apiUrl) { updateSyncIndicator(); return; }
  if (App.pending.length === 0) { updateSyncIndicator(); return; }
  App.syncing = true;
  updateSyncIndicator();
  try {
    while (App.pending.length > 0) {
      const op = App.pending[0];
      try {
        await apiRequest(op.action, op.payload);
        App.pending.shift();
        savePending();
        updateSyncIndicator();
      } catch (err) {
        op.retries = (op.retries || 0) + 1;
        if (op.retries >= 5) {
          console.error('Drop op after 5 retries:', op, err);
          App.pending.shift();
        }
        savePending();
        updateSyncIndicator();
        break;
      }
    }
  } finally {
    App.syncing = false;
    updateSyncIndicator();
  }
}

async function fetchAndMerge() {
  if (!App.settings.apiUrl) { updateSyncIndicator(); return; }
  try {
    await fetchAllData();
    applyPendingToLocal();
    App.cache.lastSync = new Date().toISOString();
    saveCache();
    populateCategorySelect();
    switch (App.currentTab) {
      case 'home': renderTransactions(); break;
      case 'transactions': renderAllTransactions(); break;
      case 'reports': renderSummary(); break;
      case 'categories': renderCategoryLists(); break;
    }
  } catch (e) {
    console.error('fetchAndMerge failed:', e);
  }
  updateSyncIndicator();
}

function updateSyncIndicator() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (!App.settings.apiUrl) {
    el.className = 'text-xs text-amber-600';
    el.textContent = '⚠ ยังไม่ตั้งค่า';
    return;
  }
  if (App.syncing) {
    el.className = 'text-xs text-amber-600';
    el.textContent = `⏳ Sync ${App.pending.length}...`;
  } else if (App.pending.length > 0) {
    el.className = 'text-xs text-amber-600';
    el.textContent = `☁ รอ ${App.pending.length}`;
  } else {
    el.className = 'text-xs text-emerald-600';
    el.textContent = '✓ Sync แล้ว';
  }
}

function startBackgroundSync(intervalSec = 10) {
  setInterval(syncPending, intervalSec * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { syncPending(); fetchAndMerge(); }
  });
  window.addEventListener('online', () => syncPending());
}
