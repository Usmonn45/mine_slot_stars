// --- Чтение user_id из Telegram Mini App ---
let tg = null;
try {
  tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
  }
} catch (e) {
  console.error('Ошибка Telegram WebApp:', e);
}
const tg_user_id = tg?.initDataUnsafe?.user?.id;
const tg_username = tg?.initDataUnsafe?.user?.username || 'Игрок';
const tg_photo_url = tg?.initDataUnsafe?.user?.photo_url || '';

// --- Конфигурация ---
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const WITHDRAW_MIN_REFERRALS = 5;
const CHANNEL_LINK  = 'https://t.me/rullet_777';
const CHANNEL_LINK_2 = 'https://t.me/LOHUTI_TJ';
const ADMIN_CONTACT = '@usmonkhan';
const API_BASE      = 'https://minestars-theta.vercel.app';

// --- Данные пользователя ---
let userData = {
  id: tg_user_id,
  balance: 0,
  stars: 0,
  level: 1,
  referrals: 0,
  username: tg_username,
  photoUrl: tg_photo_url,
  friends: [],
  dailyBonus: { lastClaim: null, streak: 0 },
  tasks: { subscribe: false, subscribe2: false, spins: 0, referrals: 0 }
};

let withdrawRequests = JSON.parse(localStorage.getItem('withdrawRequests') || '[]');
let promoCodes       = JSON.parse(localStorage.getItem('promoCodes') || '{}');
let customTasks      = JSON.parse(localStorage.getItem('customTasks') || '[]');

// ----------------- API -----------------
async function apiPost(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.ok ? res.json() : null;
}
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.ok ? res.json() : null;
}

// --- 1. Авторизация при старте ---
async function loadUserData() {
  if (!userData.id) { showToast('Не удалось получить ID'); return; }
  const data = await apiPost('/api/auth/verify_init', { init_data: tg.initData });
  if (data) Object.assign(userData, data);
  updateUI();
  loadFriends();
  syncUserData(); // сохраняем на сервер
}

// --- 2. Синхронизация после изменений ---
async function syncUserData() {
  if (!userData.id) return;
  apiPost('/api/update', userData).catch(console.error);
  localStorage.setItem('slotGameState', JSON.stringify(userData));
}

// --- 3. Промокод ---
async function applyPromo(code) {
  const res = await apiPost('/api/promo/apply', { user_id: userData.id, code });
  if (!res) return showToast('Ошибка промокода');
  if (res.success) {
    userData.balance += res.reward;
    syncUserData(); updateUI();
    showToast(`Промокод активирован! +${res.reward}`);
  } else {
    showToast(res.message || 'Промокод недействителен');
  }
}

// --- 4. Друзья ---
async function loadFriends() {
  const list = await apiGet(`/api/friends/${userData.id}`);
  if (list) { userData.friends = list; updateFriendsUI(); }
}

// --- 5. Вывод ---
async function requestWithdraw(amount) {
  if (userData.stars < amount) return showToast('Недостаточно звёзд');
  if (userData.referrals < WITHDRAW_MIN_REFERRALS) return showToast(`Нужно ${WITHDRAW_MIN_REFERRALS} друзей`);
  const res = await apiPost('/api/withdraw/request', { user_id: userData.id, amount });
  if (res?.success) {
    userData.stars -= amount;
    syncUserData(); updateUI();
    showToast('Заявка на вывод отправлена!');
  } else {
    showToast(res?.message || 'Ошибка вывода');
  }
}

// --- 6. Покупка попыток через Telegram Stars ---
async function buyAttempts(attempts, price_stars) {
  const res = await apiPost('/api/stars/create_invoice', {
    user_id: userData.id, attempts_pack: attempts, price_stars
  });
  if (res?.invoice_link) {
    tg.openTelegramLink(res.invoice_link);
  } else {
    showToast('Не удалось создать счёт');
  }
}

// ----------------- UI -----------------
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function updateUI() {
  ['balance', 'stars-count', 'user-level', 'referrals-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = userData[id.replace('-count', '').replace('user-', '')];
  });
  const prize = document.getElementById('prize-info');
  if (prize) prize.textContent = `${BASE_WIN_STARS * userData.level}⭐`;

  const spinBtn   = document.getElementById('spin-button');
  const spinAllBtn = document.getElementById('spin-all-button');
  if (spinBtn)   { spinBtn.textContent = userData.balance > 0 ? `Крутить (1 попытка)` : "Нет попыток"; spinBtn.disabled = userData.balance <= 0; }
  if (spinAllBtn) { spinAllBtn.textContent = userData.balance > 0 ? `Крутить все (${userData.balance})` : "Нет попыток"; spinAllBtn.disabled = userData.balance <= 0; }
}

function spin(all = false) {
  if (userData.balance <= 0) return;
  const attempts = all ? userData.balance : 1;
  userData.balance -= attempts;
  userData.tasks.spins += attempts;
  updateUI();

  const slots = document.querySelectorAll('.slot');
  const results = [];
  slots.forEach((slot, i) => {
    slot.textContent = '⭐';
    slot.classList.add('spinning');
    setTimeout(() => {
      const res = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      results.push(res);
      slot.textContent = res;
      slot.classList.remove('spinning');
      if (i === slots.length - 1) {
        setTimeout(() => {
          if (results[0] === results[1] && results[1] === results[2]) {
            const won = BASE_WIN_STARS * userData.level * attempts;
            userData.stars += won;
            showToast(`+${won} ⭐`);
          }
          syncUserData();
          updateUI();
        }, 500);
      }
    }, 1000 + i * 500);
  });
}

function claimDailyBonus() {
  const now = new Date();
  const lastClaim = userData.dailyBonus.lastClaim ? new Date(userData.dailyBonus.lastClaim) : null;
  if (!lastClaim || now - lastClaim > 24 * 60 * 60 * 1000) {
    userData.balance += 5;
    userData.dailyBonus.lastClaim = now.toISOString();
    userData.dailyBonus.streak += 1;
    syncUserData();
    updateUI();
    showToast('Ежедневный бонус: +5 попыток');
  } else {
    showToast('Бонус уже получен сегодня');
  }
}

function completeSubscribeTask(channelNum) {
  const key = channelNum === 1 ? 'subscribe' : 'subscribe2';
  if (userData.tasks[key]) { showToast('Уже выполнено!'); return; }
  userData.tasks[key] = true;
  userData.balance += 2;
  syncUserData();
  updateUI();
  showToast('Задание выполнено! +2 попытки');
}

function setupEventListeners() {
  document.getElementById('spin-button')?.addEventListener('click', () => spin(false));
  document.getElementById('spin-all-button')?.addEventListener('click', () => spin(true));
  document.getElementById('subscribe-task-btn')?.addEventListener('click', () => completeSubscribeTask(1));
  document.getElementById('subscribe-task-btn-2')?.addEventListener('click', () => completeSubscribeTask(2));
  document.getElementById('claim-bonus-btn')?.addEventListener('click', claimDailyBonus);
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const tab = document.getElementById(btn.dataset.tab);
    if (tab) tab.classList.add('active');
  }));
  document.querySelectorAll('.close').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal').style.display = 'none'));
  document.querySelectorAll('.offer').forEach(el => el.addEventListener('click', () => { buyAttempts(parseInt(el.dataset.offer), parseInt(el.dataset.stars)); document.getElementById('buy-modal').style.display = 'none'; }));
  document.querySelectorAll('.withdraw-option').forEach(el => el.addEventListener('click', () => { requestWithdraw(parseInt(el.dataset.amount)); document.getElementById('withdraw-modal').style.display = 'none'; }));
}

function setupModalHandlers() {
  document.getElementById('buy-button')?.addEventListener('click', () => document.getElementById('buy-modal').style.display = 'block');
  document.getElementById('withdraw-button')?.addEventListener('click', () => document.getElementById('withdraw-modal').style.display = 'block');
}

function setupPromoAndAdmin() {
  const isAdmin = userData.id === 6079178039 || userData.username === 'usmonkhan';
  if (isAdmin) {
    document.getElementById('admin-panel-btn')?.style.setProperty('display', 'inline-block');
    document.getElementById('admin-withdraw-btn')?.style.setProperty('display', 'inline-block');
  }
  document.getElementById('promo-btn')?.addEventListener('click', () => document.getElementById('promo-modal').style.display = 'block');
  document.getElementById('admin-panel-btn')?.addEventListener('click', () => document.getElementById('admin-modal').style.display = 'block');
  document.getElementById('admin-withdraw-btn')?.addEventListener('click', () => { renderWithdrawRequests(); document.getElementById('admin-withdraw-modal').style.display = 'block'; });
  document.getElementById('apply-promo-btn')?.addEventListener('click', () => { const code = document.getElementById('promo-input')?.value.trim(); if (code) applyPromo(code); });
}

function setupReferralLink() {
  const ref = userData.id ? `https://t.me/free_stars01Bot/MineStars2?startapp=user_id_${userData.id}` : 'Недоступно';
  const refEl = document.getElementById('referral-code');
  if (refEl) refEl.textContent = ref;
  document.getElementById('copy-ref-btn')?.addEventListener('click', () => navigator.clipboard.writeText(ref).then(() => showToast('Ссылка скопирована')));
}

function loadFromLocalStorage() {
  try { const s = localStorage.getItem('slotGameState'); if (s) Object.assign(userData, JSON.parse(s)); } catch {}
}
function saveGameState() {
  try { localStorage.setItem('slotGameState', JSON.stringify(userData)); } catch {}
}

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', () => {
  loadUserData();
  setupEventListeners();
  setupModalHandlers();
  setupPromoAndAdmin();
  setupReferralLink();
  document.body.classList.add('loaded');
  document.getElementById('loading-screen')?.remove();
  document.getElementById('preloader')?.remove();
});
