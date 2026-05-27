function withBusy(form, fn) {
  return async (e) => {
    e.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = '1';
    try { await fn(e); }
    finally { delete form.dataset.busy; }
  };
}

function fillTransactionFormFromSlip(parsed) {
  const form = document.getElementById('formTransaction');
  if (parsed.date) form.querySelector('input[name="date"]').value = parsed.date;
  if (parsed.amount) form.querySelector('input[name="amount"]').value = parsed.amount;
  // Slip = money out (transfer) → expense + payment โอน
  form.querySelector('input[name="type"][value="expense"]').checked = true;
  form.querySelector('input[name="payment_method"][value="โอน"]').checked = true;
  populateCategorySelect();
  const note = buildSlipNote(parsed);
  if (note) form.querySelector('input[name="note"]').value = note;
  form.querySelector('select[name="category"]').focus();
}

async function processSlipFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const preview = document.getElementById('slipPreview');
  const previewImg = document.getElementById('slipPreviewImg');
  const status = document.getElementById('slipStatus');
  const resultEl = document.getElementById('slipResult');
  preview.classList.remove('hidden');
  preview.classList.add('flex');
  previewImg.src = URL.createObjectURL(file);
  resultEl.textContent = '';
  status.textContent = '⏳ กำลังโหลด OCR (ครั้งแรก ~10 วินาที)...';
  status.className = 'text-slate-600 mb-1';
  try {
    const { parsed } = await recognizeSlip(file, m => {
      if (m.status === 'recognizing text') {
        status.textContent = `⏳ อ่านสลิป... ${Math.round(m.progress * 100)}%`;
      } else if (m.status) {
        status.textContent = `⏳ ${m.status}...`;
      }
    });
    fillTransactionFormFromSlip(parsed);
    const bits = [];
    if (parsed.date) bits.push(`📅 ${parsed.date}`);
    if (parsed.amount) bits.push(`💰 ฿${parsed.amount.toLocaleString()}`);
    if (parsed.recipient) bits.push(`→ ${parsed.recipient}`);
    status.textContent = '✓ อ่านเสร็จ — ตรวจฟอร์มด้านล่างก่อนบันทึก';
    status.className = 'text-emerald-700 mb-1 font-medium';
    resultEl.innerHTML = bits.map(b => `<div>${b}</div>`).join('');
  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.className = 'text-rose-600 mb-1';
    console.error(err);
  }
}

function bindSlipEvents() {
  const zone = document.getElementById('slipDropZone');
  const input = document.getElementById('slipFileInput');
  const preview = document.getElementById('slipPreview');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => {
    if (e.target.files[0]) processSlipFile(e.target.files[0]);
    e.target.value = '';
  });

  ['dragenter', 'dragover'].forEach(ev => {
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('border-teal-500', 'bg-teal-50'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('border-teal-500', 'bg-teal-50'); });
  });
  zone.addEventListener('drop', e => {
    if (e.dataTransfer.files[0]) processSlipFile(e.dataTransfer.files[0]);
  });

  document.addEventListener('paste', e => {
    if (App.currentTab !== 'home') return;
    const item = [...(e.clipboardData?.items || [])].find(it => it.type.startsWith('image/'));
    if (item) processSlipFile(item.getAsFile());
  });

  document.getElementById('slipClear').addEventListener('click', () => {
    preview.classList.add('hidden');
    preview.classList.remove('flex');
    document.getElementById('slipPreviewImg').src = '';
    document.getElementById('slipResult').textContent = '';
  });
}

function bindEvents() {
  bindSlipEvents();

  document.querySelectorAll('.nav-link, .bottom-nav-link, .activity-link').forEach(b => {
    b.addEventListener('click', (e) => { e.preventDefault(); switchPage(b.dataset.page); });
  });

  document.getElementById('prevMonth').addEventListener('click', () => {
    App.currentMonth = new Date(App.currentMonth.getFullYear(), App.currentMonth.getMonth() - 1, 1);
    renderTransactions();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    App.currentMonth = new Date(App.currentMonth.getFullYear(), App.currentMonth.getMonth() + 1, 1);
    renderTransactions();
  });

  // Planner toolbar
  document.getElementById('plannerAddIncome')?.addEventListener('click', addBudgetIncome);
  document.getElementById('plannerAddExpense')?.addEventListener('click', addBudgetExpense);
  document.getElementById('plannerPrevYear')?.addEventListener('click', () => {
    App.budget.year = (App.budget.year || new Date().getFullYear()) - 1;
    saveBudget();
    queueBudgetSync();
    renderPlanner();
  });
  document.getElementById('plannerNextYear')?.addEventListener('click', () => {
    App.budget.year = (App.budget.year || new Date().getFullYear()) + 1;
    saveBudget();
    queueBudgetSync();
    renderPlanner();
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      App.report.preset = btn.dataset.preset;
      if (btn.dataset.preset === 'custom' && !App.report.customStart) {
        const today = new Date();
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        App.report.customStart = isoDate(first);
        App.report.customEnd = isoDate(today);
      }
      renderSummary();
    });
  });
  document.getElementById('periodStart').addEventListener('change', (e) => {
    App.report.customStart = e.target.value;
    App.report.preset = 'custom';
    renderSummary();
  });
  document.getElementById('periodEnd').addEventListener('change', (e) => {
    App.report.customEnd = e.target.value;
    App.report.preset = 'custom';
    renderSummary();
  });

  document.querySelectorAll('#formTransaction input[name="type"]').forEach(r => {
    r.addEventListener('change', populateCategorySelect);
  });

  const formTx = document.getElementById('formTransaction');
  formTx.addEventListener('submit', withBusy(formTx, async (e) => {
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const date = fd.get('date');
    const amount = Number(fd.get('amount'));
    const note = fd.get('note') || '';
    if (type === 'investment') {
      const inv = { id: genId(), date, amount, asset: fd.get('asset'), note };
      App.investments.push(inv);
      enqueueOp('addInvestment', { investment: inv });
    } else {
      const txn = { id: genId(), date, type, category: fd.get('category'), amount, note };
      if (type === 'expense') {
        txn.expense_kind = fd.get('expense_kind') || 'ทั่วไป';
        txn.payment_method = fd.get('payment_method') || 'โอน';
      }
      App.transactions.push(txn);
      enqueueOp('addTransaction', { transaction: txn });
    }
    saveCache();
    e.target.reset();
    e.target.querySelector('input[name="date"]').value = date;
    e.target.querySelector('input[name="type"][value="expense"]').checked = true;
    e.target.querySelector('input[name="expense_kind"][value="ทั่วไป"]').checked = true;
    e.target.querySelector('input[name="payment_method"][value="โอน"]').checked = true;
    populateCategorySelect();
    const slipPrev = document.getElementById('slipPreview');
    if (!slipPrev.classList.contains('hidden')) {
      slipPrev.classList.add('hidden');
      slipPrev.classList.remove('flex');
      document.getElementById('slipPreviewImg').src = '';
      document.getElementById('slipResult').textContent = '';
    }
    rerenderCurrentPage();
  }));

  function rerenderCurrentPage() {
    switch (App.currentTab) {
      case 'home': renderTransactions(); break;
      case 'transactions': renderAllTransactions(); break;
      case 'reports': renderSummary(); break;
      case 'categories': renderCategoryLists(); break;
    }
  }

  document.body.addEventListener('click', (e) => {
    const tgt = e.target;
    if (tgt.dataset.delTx) {
      if (!confirm('ลบรายการนี้?')) return;
      const id = tgt.dataset.delTx;
      App.transactions = App.transactions.filter(t => t.id !== id);
      saveCache();
      enqueueOp('delete', { kind: 'transaction', id });
      rerenderCurrentPage();
    } else if (tgt.dataset.delInv) {
      if (!confirm('ลบรายการนี้?')) return;
      const id = tgt.dataset.delInv;
      App.investments = App.investments.filter(i => i.id !== id);
      saveCache();
      enqueueOp('delete', { kind: 'investment', id });
      rerenderCurrentPage();
    } else if (tgt.dataset.delCatType !== undefined) {
      const type = tgt.dataset.delCatType;
      const idx = Number(tgt.dataset.delCatIdx);
      App.categories[type].splice(idx, 1);
      saveCache();
      enqueueOp('setCategories', { categories: App.categories });
      renderCategoryLists();
      populateCategorySelect();
    }
  });

  for (const [formId, type] of [['formAddExpenseCat', 'expense'], ['formAddIncomeCat', 'income']]) {
    const form = document.getElementById(formId);
    form.addEventListener('submit', withBusy(form, async (e) => {
      const fd = new FormData(e.target);
      const name = (fd.get('name') || '').trim();
      const icon = (fd.get('icon') || '').trim() || '📌';
      if (!name) return;
      App.categories[type].push({ name, icon });
      saveCache();
      enqueueOp('setCategories', { categories: App.categories });
      renderCategoryLists();
      populateCategorySelect();
      e.target.reset();
    }));
  }

  document.getElementById('btnSaveUrl').addEventListener('click', async () => {
    App.settings.apiUrl = document.getElementById('settingsUrl').value.trim();
    saveSettings();
    await fetchAndMerge();
    syncPending();
    alert('บันทึก URL แล้ว — ดึงข้อมูลจาก Sheet');
  });

  document.getElementById('btnLogout')?.addEventListener('click', performLogout);

  // Transactions page filters
  ['filterType', 'filterCategory', 'filterFrom', 'filterTo', 'filterSearch'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if (App.currentTab === 'transactions') renderAllTransactions();
    });
  });
  const filterClear = document.getElementById('filterClear');
  if (filterClear) filterClear.addEventListener('click', () => {
    ['filterType','filterCategory','filterFrom','filterTo','filterSearch'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    renderAllTransactions();
  });

  document.getElementById('btnTestUrl').addEventListener('click', async () => {
    const url = document.getElementById('settingsUrl').value.trim();
    const result = document.getElementById('testResult');
    result.textContent = '⏳ ทดสอบ...';
    result.className = 'text-sm text-slate-500';
    const oldUrl = App.settings.apiUrl;
    App.settings.apiUrl = url;
    try {
      await pingServer();
      result.textContent = '✓ เชื่อมต่อสำเร็จ';
      result.className = 'text-sm text-emerald-600';
    } catch (err) {
      result.textContent = '✗ ' + err.message;
      result.className = 'text-sm text-rose-600';
    } finally {
      App.settings.apiUrl = oldUrl;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  bindLoginEvents();
  if (!App.currentUser || !USERS[App.currentUser]) {
    showLogin();
    return;
  }
  bootApp();
});

function bootApp() {
  loadSettings();
  loadBudget();
  App.categories.expense = [...DEFAULT_CATEGORIES.expense];
  App.categories.income = [...DEFAULT_CATEGORIES.income];
  loadCache();
  loadPending();
  document.querySelector('#formTransaction input[name="date"]').value = todayIso();
  populateCategorySelect();
  bindEvents();
  switchPage('home');
  updateSyncIndicator();
  updateUserIndicator();
  if (App.settings.apiUrl) {
    fetchAndMerge();
    syncPending();
    startBackgroundSync(10);
  }
  registerPWA();
}

// ─── Login ───────────────────────────────────────────────────
let _loginSelectedUser = null;

function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
}

function hideLogin() {
  document.getElementById('loginOverlay').classList.add('hidden');
}

function bindLoginEvents() {
  document.querySelectorAll('[data-login-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      _loginSelectedUser = btn.dataset.loginUser;
      document.getElementById('loginSelectedName').textContent = _loginSelectedUser;
      document.querySelector('.login-users').classList.add('hidden');
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('loginError').textContent = '';
      setTimeout(() => document.getElementById('loginPassword').focus(), 50);
    });
  });
  document.getElementById('loginBackBtn').addEventListener('click', () => {
    _loginSelectedUser = null;
    document.getElementById('loginForm').classList.add('hidden');
    document.querySelector('.login-users').classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
  });
  document.getElementById('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const pw = document.getElementById('loginPassword').value;
    if (!_loginSelectedUser || !USERS[_loginSelectedUser]) return;
    if (pw !== USERS[_loginSelectedUser].password) {
      document.getElementById('loginError').textContent = '❌ รหัสไม่ถูกต้อง';
      document.getElementById('loginPassword').value = '';
      return;
    }
    setCurrentUser(_loginSelectedUser);
    document.getElementById('loginPassword').value = '';
    hideLogin();
    bootApp();
  });
}

function updateUserIndicator() {
  const name = App.currentUser || '—';
  const initial = name === '—' ? '?' : name[0].toUpperCase();
  document.getElementById('currentUserLabel').textContent = name;
  document.getElementById('currentUserAvatar').textContent = initial;
  const sName = document.getElementById('settingsUserName');
  const sAva = document.getElementById('settingsUserAvatar');
  if (sName) sName.textContent = name;
  if (sAva) sAva.textContent = initial;
}

function performLogout() {
  if (!confirm('ออกจากระบบ? ข้อมูล cache จะยังอยู่ในเครื่อง ครั้งหน้า login เข้ามาใหม่จะเห็นข้อมูลเดิม')) return;
  logoutUser();
  location.reload();
}

// ─── PWA: service worker + install prompt ───────────────────
let _pwaPrompt = null;
function registerPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW register failed', err));
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _pwaPrompt = e;
    document.getElementById('pwaInstallBtn')?.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    _pwaPrompt = null;
    document.getElementById('pwaInstallBtn')?.classList.add('hidden');
  });
  document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
    if (!_pwaPrompt) {
      alert('แอปติดตั้งแล้ว หรือเบราว์เซอร์ยังไม่รองรับ install prompt — ลองเปิดเมนูเบราว์เซอร์ → "Install" / "Add to Home Screen"');
      return;
    }
    _pwaPrompt.prompt();
    await _pwaPrompt.userChoice;
    _pwaPrompt = null;
    document.getElementById('pwaInstallBtn')?.classList.add('hidden');
  });
}
