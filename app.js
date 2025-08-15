// --- Чтение user_id из startapp ---
const urlParams = new URLSearchParams(window.location.search);
const startAppParam = urlParams.get('startapp');
let userIdFromUrl = null;

if (startAppParam && startAppParam.startsWith('user_id_')) {
    userIdFromUrl = Number(startAppParam.replace('user_id_', ''));
}

// --- Telegram WebApp ---
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// --- Конфигурация ---
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const WITHDRAW_MIN_REFERRALS = 25;
const CHANNEL_LINK = "https://t.me/rullet_777";
const CHANNEL_LINK_2 = "https://t.me/LOHUTI_TJ";
const ADMIN_CONTACT = "@usmonkhan";

// --- Данные пользователя ---
let userData = {
    id: userIdFromUrl || tg.initDataUnsafe?.user?.id,
    balance: 0,
    stars: 0,
    level: 1,
    referrals: 0,
    username: tg.initDataUnsafe?.user?.username || 'Игрок',
    photoUrl: tg.initDataUnsafe?.user?.photo_url || '',
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
const API_BASE = 'http://localhost:5000';

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
    const saved = localStorage.getItem('slotGameState');
    if (saved) {
        try {
            Object.assign(userData, JSON.parse(saved));
        } catch (e) {
            console.error('Ошибка localStorage:', e);
        }
    }
}

function saveGameState() {
    localStorage.setItem('slotGameState', JSON.stringify(userData));
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
    document.getElementById('balance').textContent = userData.balance;
    document.getElementById('stars-count').textContent = userData.stars;
    document.getElementById('user-level').textContent = userData.level;
    document.getElementById('level').textContent = userData.level;
    document.getElementById('prize-info').textContent = `${BASE_WIN_STARS * userData.level}⭐`;
    document.getElementById('referrals-count').textContent = userData.referrals;

    const spinBtn = document.getElementById('spin-button');
    spinBtn.textContent = userData.balance > 0 ? `Крутить (1 попытка)` : "Нет попыток";
    spinBtn.disabled = userData.balance <= 0 || gameState.isSpinning;

    const spinAllBtn = document.getElementById('spin-all-button');
    spinAllBtn.textContent = userData.balance > 0 ? `Крутить все (${userData.balance})` : "Нет попыток";
    spinAllBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
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

    if (isAdmin) {
        document.getElementById('admin-panel-btn').style.display = 'inline-block';
        document.getElementById('admin-withdraw-btn').style.display = 'inline-block';
    }

    document.getElementById('promo-btn').onclick = () => {
        document.getElementById('promo-modal').style.display = 'block';
    };

    document.getElementById('admin-panel-btn').onclick = () => {
        document.getElementById('admin-modal').style.display = 'block';
    };

    document.getElementById('admin-withdraw-btn').onclick = () => {
        renderWithdrawRequests();
        document.getElementById('admin-withdraw-modal').style.display = 'block';
    };

    document.getElementById('apply-promo-btn').onclick = () => {
        const code = document.getElementById('promo-input').value.trim();
        const resultDiv = document.getElementById('promo-result');
        if (!code) return resultDiv.textContent = 'Введите промокод!';
        if (promoCodes[code] && !promoCodes[code].usedBy?.includes(userData.id)) {
            userData.balance += Number(promoCodes[code].reward || 1);
            promoCodes[code].usedBy = (promoCodes[code].usedBy || []).concat(userData.id);
            localStorage.setItem('promoCodes', JSON.stringify(promoCodes));
            syncUserData();
            updateUI();
            resultDiv.textContent = `Промокод активирован! +${promoCodes[code].reward}`;
        } else {
            resultDiv.textContent = 'Не найден или уже использован.';
        }
    };

    document.getElementById('add-promo-btn').onclick = () => {
        const code = document.getElementById('admin-promo-code').value.trim();
        const reward = Number(document.getElementById('admin-promo-reward').value);
        const resultDiv = document.getElementById('admin-promo-result');
        if (!code || !reward) return resultDiv.textContent = 'Заполните поля!';
        promoCodes[code] = { reward, usedBy: [] };
        localStorage.setItem('promoCodes', JSON.stringify(promoCodes));
        resultDiv.textContent = `Промокод ${code} добавлен!`;
    };

    document.getElementById('add-task-btn').onclick = () => {
        const title = document.getElementById('admin-task-title').value.trim();
        const desc = document.getElementById('admin-task-desc').value.trim();
        const reward = Number(document.getElementById('admin-task-reward').value);
        const resultDiv = document.getElementById('admin-task-result');
        if (!title || !desc || !reward) return resultDiv.textContent = 'Заполните поля!';
        customTasks.push({ title, desc, reward });
        localStorage.setItem('customTasks', JSON.stringify(customTasks));
        resultDiv.textContent = 'Задание добавлено!';
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
    document.getElementById('subscribe-task-btn').textContent = userData.tasks.subscribe ? '✅ Выполнено' : 'Выполнить';
    document.getElementById('subscribe-task-btn-2').textContent = userData.tasks.subscribe2 ? '✅ Выполнено' : 'Выполнить';
    document.getElementById('spins-task-btn').textContent = userData.tasks.spins < 10 ? 'В процессе' : 'Забрать награду';
    document.getElementById('referrals-task-btn').textContent = userData.tasks.referrals < 25 ? 'В процессе' : 'Забрать награду';

    document.querySelector('.task-card:nth-child(3) progress').value = userData.tasks.spins;
    document.querySelector('.task-card:nth-child(3) span').textContent = `${userData.tasks.spins}/10`;
    document.querySelector('.task-card:nth-child(4) progress').value = userData.tasks.referrals;
    document.querySelector('.task-card:nth-child(4) span').textContent = `${userData.tasks.referrals}/25`;
}

function setupReferralLink() {
    const ref = userData.id ? `https://t.me/free_stars01Bot/MineStars2?startapp=user_id_${userData.id}` : 'Недоступно';
    document.getElementById('referral-code').textContent = ref;
    document.getElementById('copy-ref-btn').onclick = () => {
        navigator.clipboard.writeText(ref);
        showToast("Ссылка скопирована");
    };
}

// --- События ---
function setupEventListeners() {
    document.getElementById('spin-button').onclick = () => spin(false);
    document.getElementById('spin-all-button').onclick = () => spin(true);
    document.getElementById('subscribe-task-btn').onclick = () => completeSubscribeTask(1);
    document.getElementById('subscribe-task-btn-2').onclick = () => completeSubscribeTask(2);
    document.getElementById('claim-bonus-btn')?.addEventListener('click', claimDailyBonus);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    document.querySelectorAll('.close').forEach(btn => {
        btn.onclick = () => btn.closest('.modal').style.display = 'none';
    });

    document.querySelectorAll('.offer').forEach(offer => {
        offer.onclick = () => {
            buyAttempts(parseInt(offer.dataset.offer), parseInt(offer.dataset.stars));
            document.getElementById('buy-modal').style.display = 'none';
        };
    });

    document.querySelectorAll('.withdraw-option').forEach(opt => {
        opt.onclick = () => {
            requestWithdraw(parseInt(opt.dataset.amount));
            document.getElementById('withdraw-modal').style.display = 'none';
        };
    });
}

function setupModalHandlers() {
    document.getElementById('buy-button').onclick = () => document.getElementById('buy-modal').style.display = 'block';
    document.getElementById('withdraw-button').onclick = () => document.getElementById('withdraw-modal').style.display = 'block';
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
document.addEventListener('DOMContentLoaded', () => {
    loadUserData();
    setupEventListeners();
    setupModalHandlers();
    setupPromoAndAdmin();
    setupReferralLink();
});
