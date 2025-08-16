// --- Чтение user_id из startapp ---
const urlParams = new URLSearchParams(window.location.search);
const startAppParam = urlParams.get('startapp');
let userIdFromUrl = null;

if (startAppParam?.startsWith('user_id_')) {
  userIdFromUrl = Number(startAppParam.replace('user_id_', ''));
}

// --- Telegram WebApp ---
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

// --- Конфигурация ---
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const WITHDRAW_MIN_REFERRALS = 5;
const CHANNEL_LINK = "https://t.me/rullet_777";
const CHANNEL_LINK_2 = "https://t.me/LOHUTI_TJ";
const ADMIN_CONTACT = "@usmonkhan";

// --- Данные пользователя ---
let userData = {
  id: userIdFromUrl || tg?.initDataUnsafe?.user?.id,
  balance: 0,
  stars: 0,
  level: 1,
  referrals: 0,
  username: tg?.initDataUnsafe?.user?.username || 'Игрок',
  photoUrl: tg?.initDataUnsafe?.user?.photo_url || '',
  friends: [],
  dailyBonus: { lastClaim: null, streak: 0 },
  tasks: { subscribe: false, subscribe2: false, spins: 0, referrals: 0 }
};

let withdrawRequests = JSON.parse(localStorage.getItem('withdrawRequests') || '[]');
let promoCodes = JSON.parse(localStorage.getItem('promoCodes') || '{}');
let customTasks = JSON.parse(localStorage.getItem('customTasks') || '[]');

// --- API ---
const API_BASE = "https://minestars-api.onrender.com";

async function loadUserData() {
  if (!userData.id) {
    showToast("Необходимо авторизоваться через бота");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/user?user_id=${userData.id}`);
    if (res.ok) {
      const data = await res.json();
      Object.assign(userData, data);
    } else {
      loadFromLocalStorage();
    }
  } catch (e) {
    console.error('Ошибка загрузки:', e);
    loadFromLocalStorage();
  }

  checkReferral();
  updateUI();
  updateFriendsUI();
  updateTasksUI();
}

async function syncUserData() {
  if (!userData.id) return;
  try {
    await fetch(`${API_BASE}/api/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  } catch (e) {
    console.error('Ошибка синхронизации:', e);
  }
  saveGameState();
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('slotGameState');
    if (saved) Object.assign(userData, JSON.parse(saved));
  } catch (e) {
    console.error('Ошибка localStorage:', e);
  }
}

function saveGameState() {
  try {
    localStorage.setItem('slotGameState', JSON.stringify(userData));
  } catch (e) {
    console.error('Ошибка сохранения localStorage:', e);
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function updateUI() {
  const balanceEl = document.getElementById('balance');
  const starsEl = document.getElementById('stars-count');
  const levelEl = document.getElementById('user-level');
  const prizeInfoEl = document.getElementById('prize-info');
  const referralsEl = document.getElementById('referrals-count');

  if (balanceEl) balanceEl.textContent = userData.balance;
  if (starsEl) starsEl.textContent = userData.stars;
  if (levelEl) levelEl.textContent = userData.level;
  if (prizeInfoEl) prizeInfoEl.textContent = `${BASE_WIN_STARS * userData.level}⭐`;
  if (referralsEl) referralsEl.textContent = userData.referrals;

  const spinBtn = document.getElementById('spin-button');
  const spinAllBtn = document.getElementById('spin-all-button');

  if (spinBtn) {
    spinBtn.textContent = userData.balance > 0 ? `Крутить (1 попытка)` : "Нет попыток";
    spinBtn.disabled = userData.balance <= 0;
  }

  if (spinAllBtn) {
    spinAllBtn.textContent = userData.balance > 0 ? `Крутить все (${userData.balance})` : "Нет попыток";
    spinAllBtn.disabled = userData.balance <= 0;
  }
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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🔧 Инициализация...');
    await loadUserData();
    setupEventListeners();
    setupModalHandlers();
    setupPromoAndAdmin();
    setupReferralLink();
    document.body.classList.add('loaded');
    document.getElementById('loading-screen')?.remove();
    document.getElementById('preloader')?.remove();
  } catch (err) {
    console.error('❌ Ошибка инициализации:', err);
    document.body.classList.add('loaded');
  }
});

function setupEventListeners() {
  document.getElementById('spin-button')?.addEventListener('click', () => spin(false));
  document.getElementById('spin-all-button')?.addEventListener('click', () => spin(true));
  document.getElementById('subscribe-task-btn')?.addEventListener('click', () => completeSubscribeTask(1));
  document.getElementById('subscribe-task-btn-2')?.addEventListener('click', () => completeSubscribeTask(2));
  document.getElementById('claim-bonus-btn')?.addEventListener('click', claimDailyBonus);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const tab = document.getElementById(btn.dataset.tab);
      if (tab) tab.classList.add('active');
    });
  });

  document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').style.display = 'none';
    });
  });

  document.querySelectorAll('.offer').forEach(el => {
    el.addEventListener('click', () => {
      const attempts = parseInt(el.dataset.offer);
      const stars = parseInt(el.dataset.stars);
      buyAttempts(attempts, stars);
      document.getElementById('buy-modal').style.display = 'none';
    });
  });

  document.querySelectorAll('.withdraw-option').forEach(el => {
    el.addEventListener('click', () => {
      requestWithdraw(parseInt(el.dataset.amount));
      document.getElementById('withdraw-modal').style.display = 'none';
    });
  });
}

function setupModalHandlers() {
  document.getElementById('buy-button')?.addEventListener('click', () => {
    document.getElementById('buy-modal').style.display = 'block';
  });
  document.getElementById('withdraw-button')?.addEventListener('click', () => {
    document.getElementById('withdraw-modal').style.display = 'block';
  });
}

function setupPromoAndAdmin() {
  const isAdmin = userData.id === 6079178039 || userData.username === 'usmonkhan';
  if (isAdmin) {
    document.getElementById('admin-panel-btn')?.style.setProperty('display', 'inline-block');
    document.getElementById('admin-withdraw-btn')?.style.setProperty('display', 'inline-block');
  }

  document.getElementById('promo-btn')?.addEventListener('click', () => {
    document.getElementById('promo-modal').style.display = 'block';
  });

  document.getElementById('admin-panel-btn')?.addEventListener('click', () => {
    document.getElementById('admin-modal').style.display = 'block';
  });

  document.getElementById('admin-withdraw-btn')?.addEventListener('click', () => {
    renderWithdrawRequests();
    document.getElementById('admin-withdraw-modal').style.display = 'block';
  });

  document.getElementById('apply-promo-btn')?.addEventListener('click', () => {
    const code = document.getElementById('promo-input')?.value.trim();
    const result = document.getElementById('promo-result');
    if (!code) return result.textContent = 'Введите промокод!';

    const promo = promoCodes[code];
    if (!promo) return result.textContent = 'Промокод не найден.';

    if ((promo.usedBy || []).includes(userData.id)) {
      return result.textContent = 'Вы уже использовали этот промокод.';
    }

    if ((promo.usedBy || []).length >= (promo.limit || Infinity)) {
      return result.textContent = 'Промокод исчерпан.';
    }

    userData.balance += Number(promo.reward || 1);
    promo.usedBy = (promo.usedBy || []).concat(userData.id);
    localStorage.setItem('promoCodes', JSON.stringify(promoCodes));
    syncUserData();
    updateUI();
    result.textContent = `Промокод активирован! +${promo.reward}`;
  });

  document.getElementById('add-promo-btn')?.addEventListener('click', () => {
    const code = document.getElementById('admin-promo-code')?.value.trim();
    const reward = Number(document.getElementById('admin-promo-reward')?.value);
    const limit = Number(prompt('Лимит использований:')) || 1;
    const result = document.getElementById('admin-promo-result');
    if (!code || !reward) return result.textContent = 'Заполните поля!';
    promoCodes[code] = { reward, usedBy: [], limit };
    localStorage.setItem('promoCodes', JSON.stringify(promoCodes));
    result.textContent = `Промокод ${code} добавлен с лимитом ${limit}!`;
  });

  document.getElementById('add-task-btn')?.addEventListener('click', () => {
    const title = document.getElementById('admin-task-title')?.value.trim();
    const desc = document.getElementById('admin-task-desc')?.value.trim();
    const reward = Number(document.getElementById('admin-task-reward')?.value);
    const result = document.getElementById('admin-task-result');
    if (!title || !desc || !reward) return result.textContent = 'Заполните поля!';
    customTasks.push({ title, desc, reward });
    localStorage.setItem('customTasks', JSON.stringify(customTasks));
    result.textContent = 'Задание добавлено!';
  });
}

function setupReferralLink() {
  const ref = userData.id ? `https://t.me/free_stars01Bot/MineStars2?startapp=user_id_${userData.id}` : 'Недоступно';
  const refEl = document.getElementById('referral-code');
  if (refEl) refEl.textContent = ref;

  document.getElementById('copy-ref-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(ref).then(() => showToast("Ссылка скопирована"));
  });
}

function updateFriendsUI() {
  const list = document.getElementById('friends-list');
  if (!list) return;
  if (userData.friends.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <img src="https://cdn-icons-png.flaticon.com/512/4076/4076478.png" alt="No friends">
        <p>Вы пока не пригласили друзей</p>
      </div>`;
    return;
  }

  list.innerHTML = '';
  const sorted = [...userData.friends].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(f => {
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `
      <img src="${f.avatar || 'default_avatar.png'}" class="friend-avatar" />
      <div class="friend-info">
        <h4>${f.name}</h4>
        <span>${new Date(f.date).toLocaleDateString()}</span>
      </div>
      <div class="friend-stats">
        <span>${f.starsEarned} ⭐</span><br>
        <span>${f.attemptsEarned} попыток</span>
      </div>`;
    list.appendChild(card);
  });
}

function updateTasksUI() {
  document.getElementById('subscribe-task-btn') && (document.getElementById('subscribe-task-btn').textContent = userData.tasks.subscribe ? '✅ Выполнено' : 'Выполнить');
  document.getElementById('subscribe-task-btn-2') && (document.getElementById('subscribe-task-btn-2').textContent = userData.tasks.subscribe2 ? '✅ Выполнено' : 'Выполнить');
  document.getElementById('spins-task-btn') && (document.getElementById('spins-task-btn').textContent = userData.tasks.spins >= 10 ? 'Забрать награду' : 'В процессе');
  document.getElementById('referrals-task-btn') && (document.getElementById('referrals-task-btn').textContent = userData.tasks.referrals >= 25 ? 'Забрать награду' : 'В процессе');
}

function checkReferral() {
  const ref = urlParams.get('ref') || urlParams.get('start');
  if (ref?.startsWith('ref_')) {
    const refId = ref.split('_')[1];
    if (refId && refId !== userData.id?.toString()) {
      if (!userData.friends.some(f => f.id === refId)) {
        userData.friends.push({
          id: refId,
          name: `Приглашенный ${refId}`,
          avatar: null,
          date: new Date().toISOString(),
          starsEarned: 0.5,
          attemptsEarned: 1,
          lastActive: new Date().toISOString()
        });
        userData.balance += 1;
        userData.stars += 0.5;
        userData.referrals += 1;
        userData.tasks.referrals += 1;
        syncUserData();
        updateFriendsUI();
        updateUI();
      }
    }
  }
}

function buyAttempts(attempts, stars) {
  if (!tg) return showToast('Telegram WebApp не доступен.');
  const invoiceUrl = `https://t.me/free_stars01Bot?start=invoice_${attempts}_${stars}`;
  tg.openLink(invoiceUrl);
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
  if (userData.tasks[key]) {
    showToast('Уже выполнено!');
    return;
  }
  userData.tasks[key] = true;
  userData.balance += 2;
  syncUserData();
  updateTasksUI();
  showToast('Задание выполнено! +2 попытки');
}

function requestWithdraw(amount) {
  if (userData.stars < amount) return showToast("Недостаточно звёзд");
  if (userData.referrals < WITHDRAW_MIN_REFERRALS) return showToast(`Нужно ${WITHDRAW_MIN_REFERRALS} друзей`);
  userData.stars -= amount;
  syncUserData();
  updateUI();

  withdrawRequests.push({
    id: Date.now(),
    userId: userData.id,
    username: userData.username,
    amount,
    status: 'pending',
    date: new Date().toISOString()
  });
  localStorage.setItem('withdrawRequests', JSON.stringify(withdrawRequests));
  showToast('Заявка на вывод отправлена!');
}

function renderWithdrawRequests() {
  const list = document.getElementById('admin-withdraw-list');
  if (!list) return;
  list.innerHTML = '';
  if (!withdrawRequests.length) {
    list.innerHTML = '<p>Нет заявок</p>';
    return;
  }
  withdrawRequests.reverse().forEach(req => {
    const div = document.createElement('div');
    div.className = 'withdraw-admin-item';
    div.innerHTML = `
      <b>${req.username}</b> (ID: ${req.userId})<br>
      Сумма: <b>${req.amount} ⭐</b><br>
      Дата: ${new Date(req.date).toLocaleString()}<br>
      Статус: <span style="color:${req.status === 'pending' ? 'orange' : req.status === 'accepted' ? 'green' : 'red'}">${req.status}</span>
    `;
    if (req.status === 'pending') {
      const accept = document.createElement('button');
      accept.textContent = 'Принять';
      accept.onclick = () => updateWithdrawStatus(req.id, 'accepted');
      const reject = document.createElement('button');
      reject.textContent = 'Отклонить';
      reject.onclick = () => updateWithdrawStatus(req.id, 'rejected');
      div.appendChild(accept);
      div.appendChild(reject);
    }
    list.appendChild(div);
  });
}

function updateWithdrawStatus(id, status) {
  const req = withdrawRequests.find(r => r.id === id);
  if (req) {
    req.status = status;
    localStorage.setItem('withdrawRequests', JSON.stringify(withdrawRequests));
    renderWithdrawRequests();
  }
}
