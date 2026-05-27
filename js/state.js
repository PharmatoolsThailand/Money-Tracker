const USERS = {
  P:    { name: 'P',    password: '100644', apiUrl: 'https://script.google.com/macros/s/AKfycbyihocCMsbnXSqlLHp4HZEVarAOPasoN_ezBdl3jD8ryIPZhUx4L5AZ4jq5ZgVotXDx5w/exec' },
  June: { name: 'June', password: '080644', apiUrl: 'https://script.google.com/macros/s/AKfycbxSblnjEu98Nci3IoETKJ1awgqIJhGmZQYPxitgkAsyrLVzcOPM8RVA-Du2O4ePjQur/exec' },
};

const App = {
  currentUser: null,
  settings: {
    apiUrl: '',
  },
  transactions: [],
  investments: [],
  categories: {
    expense: [],
    income: [],
  },
  budget: {
    year: new Date().getFullYear(),
    income: [],
    expense: [],
  },
  currentTab: 'transactions',
  currentMonth: new Date(),
  cache: { loaded: false, lastSync: null },
  pending: [],
  syncing: false,
  report: {
    preset: 'thisMonth',
    start: null,
    end: null,
    label: '',
    customStart: '',
    customEnd: '',
  },
};

const DEFAULT_CATEGORIES = {
  expense: [
    { name: 'อาหาร', icon: '🍔' },
    { name: 'เดินทาง', icon: '🚗' },
    { name: 'ค่าน้ำ/ไฟ/เน็ต', icon: '💡' },
    { name: 'ค่าเช่า/บ้าน', icon: '🏠' },
    { name: 'ของใช้', icon: '🛒' },
    { name: 'สุขภาพ', icon: '💊' },
    { name: 'บันเทิง', icon: '🎮' },
    { name: 'อื่นๆ', icon: '📌' },
  ],
  income: [
    { name: 'เงินเดือน', icon: '💰' },
    { name: 'freelance', icon: '💵' },
    { name: 'อื่นๆ', icon: '🎁' },
  ],
};

function userKey(name) {
  const u = App.currentUser || 'default';
  return `moneyTracker.${u}.${name}`;
}

function loadCurrentUser() {
  App.currentUser = localStorage.getItem('moneyTracker.currentUser') || null;
}

function setCurrentUser(user) {
  App.currentUser = user;
  localStorage.setItem('moneyTracker.currentUser', user);
}

function logoutUser() {
  App.currentUser = null;
  localStorage.removeItem('moneyTracker.currentUser');
}

function loadSettings() {
  const raw = localStorage.getItem(userKey('settings'));
  if (raw) {
    try { App.settings = { ...App.settings, ...JSON.parse(raw) }; } catch (e) {}
  }
  // Default to current user's pre-configured URL if blank
  if (!App.settings.apiUrl && App.currentUser && USERS[App.currentUser]) {
    App.settings.apiUrl = USERS[App.currentUser].apiUrl;
  }
}

function saveSettings() {
  localStorage.setItem(userKey('settings'), JSON.stringify(App.settings));
}

function loadBudget() {
  App.budget = { year: new Date().getFullYear(), income: [], expense: [] };
  const raw = localStorage.getItem(userKey('budget'));
  if (raw) {
    try { App.budget = { ...App.budget, ...JSON.parse(raw) }; } catch (e) {}
  }
  if (!Array.isArray(App.budget.income)) App.budget.income = [];
  if (!Array.isArray(App.budget.expense)) App.budget.expense = [];
}

function saveBudget() {
  localStorage.setItem(userKey('budget'), JSON.stringify(App.budget));
}
