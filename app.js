const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const BOT_USERNAME = '@mine_stars_minenot_bot';
const PAYMENT_PRICES = { 1: 100, 5: 400, 10: 700 };

const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

let gameState = {
  isSpinning: false,
  lastWin: 0,
  paymentInProgress: false
};

let userData = {
  id: tg.initDataUnsafe?.user?.id,
  balance: 0,
  stars: 0,
  level: 1,
  referrals: 0,
  username: tg.initDataUnsafe?.user?.first_name || 'Игрок'
};

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('preloader').style.display = 'none';
  await loadUserData();
  setupEventListeners();
  checkPaymentStatus();
});

function checkPaymentStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment') === 'success') {
    showToast('Оплата прошла успешно!');
    createConfetti();
  }
}

async function loadUserData() {
  if (!userData.id) {
    showToast("Авторизуйтесь через Telegram");
    return;
  }

  try {
    const response = await fetch(`/api/user?user_id=${userData.id}`);
    if (response.ok) {
      const data = await response.json();
      Object.assign(userData, data);
      updateUI();
    }
  } catch (e) {
    console.error("Ошибка загрузки:", e);
    showToast("Ошибка загрузки данных");
  }
}

async function buyAttempts(amount) {
  if (gameState.paymentInProgress) return;
  gameState.paymentInProgress = true;

  const price = PAYMENT_PRICES[amount];
  if (!price) {
    gameState.paymentInProgress = false;
    return;
  }

  try {
    tg.openInvoice(`https://t.me/${BOT_USERNAME}?start=pay_${amount}`, async (status) => {
      if (status === 'paid') {
        try {
          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: userData.id,
              balance: userData.balance + amount
            })
          });
          await loadUserData();
          showToast(`✅ Получено ${amount} попыток!`);
          createConfetti();
        } catch (e) {
          console.error("Ошибка синхронизации:", e);
          showToast("❌ Ошибка синхронизации");
        }
      } else {
        showToast("❌ Оплата не завершена");
      }
      gameState.paymentInProgress = false;
    });
  } catch (e) {
    console.error("Ошибка платежа:", e);
    showToast("❌ Ошибка при оплате");
    gameState.paymentInProgress = false;
  }
}

function spin(allAttempts = false) {
  if (gameState.isSpinning || userData.balance <= 0) return;

  gameState.isSpinning = true;
  const attemptsToUse = allAttempts ? userData.balance : 1;
  userData.balance -= attemptsToUse;

  const slots = document.querySelectorAll('.slot');
  const results = [];

  slots.forEach((slot, index) => {
    slot.textContent = '';
    slot.classList.add('spinning');

    setTimeout(() => {
      const result = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      results.push(result);
      slot.textContent = result;
      slot.classList.remove('spinning');

      if (index === slots.length - 1) {
        checkWin(results, attemptsToUse);
        gameState.isSpinning = false;
        updateUserData();
      }
    }, 1000 + (index * 500));
  });

  updateUI();
}

function checkWin(results, attemptsUsed) {
  if (results[0] === results[1] && results[1] === results[2]) {
    const starsWon = BASE_WIN_STARS * userData.level * attemptsUsed;
    userData.stars += starsWon;
    gameState.lastWin = starsWon;
    showWinAnimation(results.join(''), starsWon);
    createConfetti();
    updateUserData();
  }
}

async function updateUserData() {
  try {
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  } catch (e) {
    console.error("Ошибка синхронизации:", e);
  }
}

function setupEventListeners() {
  document.getElementById('spin-button').addEventListener('click', () => spin());
  document.getElementById('spin-all-button').addEventListener('click', () => spin(true));
  document.getElementById('buy-button').addEventListener('click', () => {
    document.getElementById('buy-modal').style.display = 'block';
  });

  document.querySelectorAll('.offer').forEach(offer => {
    offer.addEventListener('click', () => {
      const amount = parseInt(offer.dataset.offer);
      buyAttempts(amount);
      document.getElementById('buy-modal').style.display = 'none';
    });
  });

  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').style.display = 'none';
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });

      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

function updateUI() {
  document.getElementById('balance').textContent = userData.balance;
  document.getElementById('stars-count').textContent = userData.stars;
  document.getElementById('user-level').textContent = userData.level;
  document.getElementById('referrals-count').textContent = userData.referrals;
  document.getElementById('username').textContent = userData.name || userData.username || 'Игрок';

  const avatarEl = document.getElementById('user-avatar');
  if (userData.avatar) {
    avatarEl.src = `https://api.telegram.org/file/bot<BOT_TOKEN>/${userData.avatar}`;
  } else {
    avatarEl.src = 'default_avatar.png';
  }

  const spinBtn = document.getElementById('spin-button');
  spinBtn.textContent = userData.balance > 0 ? "Крутить (1 попытка)" : "Нет попыток";
  spinBtn.disabled = userData.balance <= 0 || gameState.isSpinning;

  const spinAllBtn = document.getElementById('spin-all-button');
  spinAllBtn.textContent = userData.balance > 0 ? `Крутить все (${userData.balance})` : "Нет попыток";
  spinAllBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showWinAnimation(combination, stars) {
  const popup = document.createElement('div');
  popup.className = 'win-popup';
  popup.innerHTML = `
    <h2>Победа!</h2>
    <div class="win-combination">${combination}</div>
    <p>+${stars} ⭐</p>
  `;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}

function createConfetti() {
  const colors = ['#f1c40f', '#e67e22', '#2ecc71', '#3498db', '#9b59b6'];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = `${Math.random() * 100}vw`;
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
}