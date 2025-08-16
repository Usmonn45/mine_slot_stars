// --- Чтение user_id из startapp ---
const urlParams = new URLSearchParams(window.location.search);
const startAppParam = urlParams.get('startapp');
let userIdFromUrl = null;

if (startAppParam && startAppParam.startsWith('user_id_')) {
    userIdFromUrl = Number(startAppParam.replace('user_id_', ''));
}

// --- Telegram WebApp ---
let tg = null;
try {
    tg = window.Telegram?.WebApp;
    if (tg) {
        tg.expand();
        tg.enableClosingConfirmation();
    } else {
        console.warn('Telegram WebApp не доступен');
    }
} catch (e) {
    console.error('Ошибка инициализации Telegram WebApp:', e);
}

// --- Конфигурация ---
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const WITHDRAW_MIN_REFERRALS = 25;
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

// --- Заявки на вывод ---
let withdrawRequests = JSON.parse(localStorage.getItem('withdrawRequests') || '[]');

// --- Состояние игры ---
let gameState = {
    isSpinning: false,
    lastWin: 0,
    spinTimeout: null,
    slotAnimations: [],
    currentSort: 'recent'
};

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

// --- localStorage fallback ---
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('slotGameState');
        if (saved) {
            Object.assign(userData, JSON.parse(saved));
        }
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

// --- Реферал ---
function checkReferral() {
    const ref = urlParams.get('ref') || urlParams.get('start');
    if (ref && ref.startsWith('ref_')) {
        const refId = ref.split('_')[1];
        if (refId && refId !== userData.id.toString()) {
            if (!userData.friends.some(f => f.id === refId)) {
                addFriend(refId, `Приглашенный ${refId}`, null);
            }
        }
    }
}

function addFriend(id, name, avatar) {
    if (userData.friends.some(f => f.id === id)) return;

    userData.friends.push({
        id,
        name,
        avatar,
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

// --- UI обновление ---
function updateUI() {
    const balanceEl = document.getElementById('balance');
    const starsEl = document.getElementById('stars-count');
    const levelEl = document.getElementById('user-level');
    const prizeInfoEl = document.getElementById('prize-info');
    const referralsEl = document.getElementById('referrals-count');
    const spinBtn = document.getElementById('spin-button');
    const spinAllBtn = document.getElementById('spin-all-button');

    if (balanceEl) balanceEl.textContent = userData.balance;
    if (starsEl) starsEl.textContent = userData.stars;
    if (levelEl) levelEl.textContent = userData.level;
    if (prizeInfoEl) prizeInfoEl.textContent = `${BASE_WIN_STARS * userData.level}⭐`;
    if (referralsEl) referralsEl.textContent = userData.referrals;

    if (spinBtn) {
        spinBtn.textContent = userData.balance > 0 ? `Крутить (1 попытка)` : "Нет попыток";
        spinBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
    }

    if (spinAllBtn) {
        spinAllBtn.textContent = userData.balance > 0 ? `Крутить все (${userData.balance})` : "Нет попыток";
        spinAllBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
    }
}

// --- Слоты ---
function spin(allAttempts = false) {
    if (gameState.isSpinning || userData.balance <= 0) return;

    gameState.isSpinning = true;
    const attempts = allAttempts ? userData.balance : 1;

    userData.balance -= attempts;
    userData.tasks.spins += attempts;

    updateUI();

    const slots = document.querySelectorAll('.slot');
    const results = [];

    slots.forEach((slot, index) => {
        slot.textContent = '⭐';
        slot.classList.add('spinning');

        setTimeout(() => {
            const res = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            results.push(res);
            slot.textContent = res;
            slot.classList.remove('spinning');

            if (index === slots.length - 1) {
                setTimeout(() => {
                    checkWin(results, attempts);
                    gameState.isSpinning = false;
                    syncUserData();
                    updateUI();
                }, 500);
            }
        }, 1000 + index * 500);
    });
}

function checkWin(results, attempts) {
    if (results[0] === results[1] && results[1] === results[2]) {
        const starsWon = BASE_WIN_STARS * userData.level * attempts;
        userData.stars += starsWon;
        showWinAnimation(results.join(''), starsWon);
        createConfetti();
    }
}

// --- Промокоды и админ ---
let promoCodes = JSON.parse(localStorage.getItem('promoCodes') || '{}');
let customTasks = JSON.parse(localStorage.getItem('customTasks') || '[]');

function setupPromoAndAdmin() {
    const isAdmin = userData.id === 6079178039 || userData.username === 'usmonkhan';

    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const adminWithdrawBtn = document.getElementById('admin-withdraw-btn');
    
    if (isAdmin) {
        if (adminPanelBtn) adminPanelBtn.style.display = 'inline-block';
        if (adminWithdrawBtn) adminWithdrawBtn.style.display = 'inline-block';
    }

    const promoBtn = document.getElementById('promo-btn');
    if (promoBtn) promoBtn.onclick = () => document.getElementById('promo-modal').style.display = 'block';

    const adminPanelBtnEvent = document.getElementById('admin-panel-btn');
    if (adminPanelBtnEvent) adminPanelBtnEvent.onclick = () => document.getElementById('admin-modal').style.display = 'block';

    const adminWithdrawBtnEvent = document.getElementById('admin-withdraw-btn');
    if (adminWithdrawBtnEvent) adminWithdrawBtnEvent.onclick = () => {
        renderWithdrawRequests();
        document.getElementById('admin-withdraw-modal').style.display = 'block';
    };

    const applyPromoBtn = document.getElementById('apply-promo-btn');
    if (applyPromoBtn) applyPromoBtn.onclick = () => {
        const code = document.getElementById('promo-input')?.value.trim();
        const resultDiv = document.getElementById('promo-result');
        if (!code) return resultDiv && (resultDiv.textContent = 'Введите промокод!');
        if (promoCodes[code] && !promoCodes[code].usedBy?.includes(userData.id)) {
            userData.balance += Number(promoCodes[code].reward || 1);
            promoCodes[code].usedBy = (promoCodes[code].usedBy || []).concat(userData.id);
            localStorage.setItem('promoCodes', JSON.stringify(promoCodes));
            syncUserData();
            updateUI();
            if (resultDiv) resultDiv.textContent = `Промокод активирован! +${promoCodes[code].reward}`;
        } else {
            if (resultDiv) resultDiv.textContent = 'Не найден или уже использован.';
        }
    };

    const addPromoBtn = document.getElementById('add-promo-btn');
    if (addPromoBtn) addPromoBtn.onclick = () => {
        const code = document.getElementById('admin-promo-code')?.value.trim();
        const reward = Number(document.getElementById('admin-promo-reward')?.value);
        const resultDiv = document.getElementById('admin-promo-result');
        if (!code || !reward) return resultDiv && (resultDiv.textContent = 'Заполните поля!');
        promoCodes[code] = { reward, usedBy: [] };
        localStorage.setItem('promoCodes', JSON.stringify(promoCodes));
        if (resultDiv) resultDiv.textContent = `Промокод ${code} добавлен!`;
    };

    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) addTaskBtn.onclick = () => {
        const title = document.getElementById('admin-task-title')?.value.trim();
        const desc = document.getElementById('admin-task-desc')?.value.trim();
        const reward = Number(document.getElementById('admin-task-reward')?.value);
        const resultDiv = document.getElementById('admin-task-result');
        if (!title || !desc || !reward) return resultDiv && (resultDiv.textContent = 'Заполните поля!');
        customTasks.push({ title, desc, reward });
        localStorage.setItem('customTasks', JSON.stringify(customTasks));
        if (resultDiv) resultDiv.textContent = 'Задание добавлено!';
    };
}

// --- Заявки на вывод ---
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

    withdrawRequests.slice().reverse().forEach(req => {
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

// --- UI: друзья, задания, модалки ---
function updateFriendsUI() {
    const list = document.getElementById('friends-list');
    if (!list) return;
    
    if (userData.friends.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <img src="https://cdn-icons-png.flaticon.com/512/4076/4076478.png" alt="No friends">
                <p>Вы пока не пригласили друзей</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '';
    const sorted = [...userData.friends].sort((a, b) =>
        gameState.currentSort === 'recent'
            ? new Date(b.date) - new Date(a.date)
            : b.starsEarned - a.starsEarned
    );

    sorted.forEach(f => {
        const card = document.createElement('div');
        card.className = 'friend-card';
        card.innerHTML = `
            <img src="${f.avatar || 'default_avatar.png'}" class="friend-avatar">
            <div class="friend-info">
                <h4>${f.name}</h4>
                <span>${new Date(f.date).toLocaleDateString()}</span>
            </div>
            <div class="friend-stats">
                <span>${f.starsEarned} ⭐</span><br>
                <span>${f.attemptsEarned} попыток</span>
            </div>
        `;
        list.appendChild(card);
    });
}

function updateTasksUI() {
    const btn1 = document.getElementById('subscribe-task-btn');
    const btn2 = document.getElementById('subscribe-task-btn-2');
    const btn3 = document.getElementById('spins-task-btn');
    const btn4 = document.getElementById('referrals-task-btn');

    if (btn1) btn1.textContent = userData.tasks.subscribe ? '✅ Выполнено' : 'Выполнить';
    if (btn2) btn2.textContent = userData.tasks.subscribe2 ? '✅ Выполнено' : 'Выполнить';
    if (btn3) btn3.textContent = userData.tasks.spins < 10 ? 'В процессе' : 'Забрать награду';
    if (btn4) btn4.textContent = userData.tasks.referrals < 25 ? 'В процессе' : 'Забрать награду';

    const progress3 = document.querySelector('.task-card:nth-child(3) progress');
    const span3 = document.querySelector('.task-card:nth-child(3) span');
    if (progress3) progress3.value = userData.tasks.spins;
    if (span3) span3.textContent = `${userData.tasks.spins}/10`;

    const progress4 = document.querySelector('.task-card:nth-child(4) progress');
    const span4 = document.querySelector('.task-card:nth-child(4) span');
    if (progress4) progress4.value = userData.tasks.referrals;
    if (span4) span4.textContent = `${userData.tasks.referrals}/25`;
}

function setupReferralLink() {
    const ref = userData.id ? 
        `https://t.me/free_stars01Bot/MineStars2?startapp=user_id_${userData.id}` : 
        'Недоступно';
    
    const refCodeEl = document.getElementById('referral-code');
    if (refCodeEl) refCodeEl.textContent = ref;
    
    const copyBtn = document.getElementById('copy-ref-btn');
    if (copyBtn) copyBtn.onclick = () => {
        navigator.clipboard.writeText(ref).then(() => showToast("Ссылка скопирована"));
    };
}

// --- События ---
function setupEventListeners() {
    const spinBtn = document.getElementById('spin-button');
    const spinAllBtn = document.getElementById('spin-all-button');
    const subscribeBtn1 = document.getElementById('subscribe-task-btn');
    const subscribeBtn2 = document.getElementById('subscribe-task-btn-2');
    const claimBonusBtn = document.getElementById('claim-bonus-btn');

    if (spinBtn) spinBtn.onclick = () => spin(false);
    if (spinAllBtn) spinAllBtn.onclick = () => spin(true);
    if (subscribeBtn1) subscribeBtn1.onclick = () => completeSubscribeTask(1);
    if (subscribeBtn2) subscribeBtn2.onclick = () => completeSubscribeTask(2);
    if (claimBonusBtn) claimBonusBtn.addEventListener('click', claimDailyBonus);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById(btn.dataset.tab);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    document.querySelectorAll('.close').forEach(btn => {
        btn.onclick = () => {
            const modal = btn.closest('.modal');
            if (modal) modal.style.display = 'none';
        };
    });

    document.querySelectorAll('.offer').forEach(offer => {
        offer.onclick = () => {
            buyAttempts(parseInt(offer.dataset.offer), parseInt(offer.dataset.stars));
            const buyModal = document.getElementById('buy-modal');
            if (buyModal) buyModal.style.display = 'none';
        };
    });

    document.querySelectorAll('.withdraw-option').forEach(opt => {
        opt.onclick = () => {
            requestWithdraw(parseInt(opt.dataset.amount));
            const withdrawModal = document.getElementById('withdraw-modal');
            if (withdrawModal) withdrawModal.style.display = 'none';
        };
    });
}

function setupModalHandlers() {
    const buyBtn = document.getElementById('buy-button');
    const withdrawBtn = document.getElementById('withdraw-button');

    if (buyBtn) buyBtn.onclick = () => {
        const modal = document.getElementById('buy-modal');
        if (modal) modal.style.display = 'block';
    };
    
    if (withdrawBtn) withdrawBtn.onclick = () => {
        const modal = document.getElementById('withdraw-modal');
        if (modal) modal.style.display = 'block';
    };
}

// --- Утилиты ---
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showWinAnimation(combo, stars) {
    const popup = document.createElement('div');
    popup.className = 'win-popup';
    popup.innerHTML = `
        <h2>Победа!</h2>
        <div class="win-combination">${combo}</div>
        <p>+${stars} ⭐</p>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 3000);
}

function createConfetti() {
    const colors = ['#f1c40f', '#e67e22', '#2ecc71', '#3498db', '#9b59b6'];
    for (let i = 0; i < 50; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + 'vw';
        c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        c.style.animationDuration = Math.random() * 2 + 2 + 's';
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 3000);
    }
}

// --- Запуск ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('DOM загружен, начинаем инициализацию...');
        
        // Показываем загрузку
        document.body.classList.remove('loaded');
        
        // Проверка ключевых элементов
        const requiredElements = ['balance', 'stars-count', 'spin-button'];
        const missing = requiredElements.filter(id => !document.getElementById(id));
        if (missing.length > 0) {
            console.warn('Отсутствуют элементы:', missing);
        }
        
        await loadUserData();
        setupEventListeners();
        setupModalHandlers();
        setupPromoAndAdmin();
        setupReferralLink();
        
        console.log('Инициализация завершена успешно');
        
        // Скрываем загрузку
        setTimeout(() => {
            document.body.classList.add('loaded');
        }, 500);
        
    } catch (error) {
        console.error('Критическая ошибка инициализации:', error);
        showToast('Ошибка загрузки приложения');
        document.body.classList.add('loaded');
    }
});

// Функции для задач (если не определены)
function completeSubscribeTask(channelNum) {
    if (channelNum === 1) {
        userData.tasks.subscribe = true;
    } else if (channelNum === 2) {
        userData.tasks.subscribe2 = true;
    }
    userData.balance += 2;
    syncUserData();
    updateUI();
    updateTasksUI();
    showToast('Задание выполнено! +2 попытки');
}

function buyAttempts(attempts, stars) {
    if (userData.stars >= stars) {
        userData.stars -= stars;
        userData.balance += attempts;
        syncUserData();
        updateUI();
        showToast(`Куплено ${attempts} попыток`);
    } else {
        showToast('Недостаточно звёзд');
    }
}

function claimDailyBonus() {
    const now = new Date();
    const lastClaim = userData.dailyBonus.lastClaim ? new Date(userData.dailyBonus.lastClaim) : null;
    
    if (!lastClaim || (now - lastClaim) > 24 * 60 * 60 * 1000) {
        userData.balance += 5;
        userData.dailyBonus.lastClaim = now.toISOString();
        userData.dailyBonus.streak += 1;
        syncUserData();
        updateUI();
        showToast('Ежедневный бонус получен! +5 попыток');
    } else {
        showToast('Бонус уже получен сегодня');
    }
}
// --- Остальные функции уже выше ---
// Ниже — финальные обработчики и запуск

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🔧 Инициализация приложения...');

    const required = ['balance', 'stars-count', 'spin-button', 'user-level'];
    const missing = required.filter(id => !document.getElementById(id));
    if (missing.length) {
      console.warn('⚠️ Отсутствуют элементы DOM:', missing);
    }

    await loadUserData();
    setupEventListeners();
    setupModalHandlers();
    setupPromoAndAdmin();
    setupReferralLink();

    console.log('✅ Инициализация завершена');
    document.body.classList.add('loaded');
  } catch (err) {
    console.error('❌ Ошибка инициализации:', err);
    document.body.classList.add('loaded');
  }
});
