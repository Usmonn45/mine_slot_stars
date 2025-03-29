// Конфигурация
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const ATTEMPT_PRICES = {
    1: { stars: 1, amount: 1 },
    5: { stars: 4, amount: 5 },
    10: { stars: 7, amount: 10 }
};
const WITHDRAW_OPTIONS = [15, 25, 50];
const CHANNEL_LINK = "https://t.me/mine_not_ru";
const API_BASE_URL = "https://usmonn45.pythonanywhere.com/"; // ЗАМЕНИТЕ НА ВАШ АДРЕС БЭКЕНДА

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Получение user_id из URL
const urlParams = new URLSearchParams(window.location.search);
const userIdFromUrl = urlParams.get('user_id');

// Данные пользователя
let userData = {
    id: userIdFromUrl || tg.initDataUnsafe?.user?.id,
    balance: 0,
    stars: 0,
    level: 1,
    referrals: 0,
    username: 'Игрок',
    photoUrl: '',
    friends: [],
    dailyBonus: {
        lastClaim: null,
        streak: 0
    },
    tasks: {
        subscribe: false,
        spins: 0,
        referrals: 0
    }
};

// Состояние игры
let gameState = {
    isSpinning: false,
    lastWin: 0,
    spinTimeout: null,
    slotAnimations: [],
    currentSort: 'recent'
};

// Инициализация игры
async function initGame() {
    document.getElementById('preloader').style.display = 'none';
    document.querySelector('.user-header').style.display = 'flex';
    document.querySelector('.content').style.display = 'block';
    
    await loadUserData();
    setupEventListeners();
    setupModalHandlers();
    setupReferralLink();
    updateUI();
    
    // Загружаем аватар из Telegram, если доступен
    if (tg.initDataUnsafe?.user?.photo_url) {
        document.getElementById('user-avatar').src = tg.initDataUnsafe.user.photo_url;
        userData.photoUrl = tg.initDataUnsafe.user.photo_url;
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    if (!userData.id) {
        showToast("Необходимо авторизоваться через бота");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/user?user_id=${userData.id}`);
        if (response.ok) {
            const data = await response.json();
            Object.assign(userData, data);
            
            // Обновляем UI
            document.getElementById('username').textContent = userData.username;
            if (userData.photoUrl) {
                document.getElementById('user-avatar').src = userData.photoUrl;
            }
            
            updateDailyBonusUI();
            updateFriendsUI();
            updateTasksUI();
        } else {
            console.error('Ошибка загрузки данных:', response.status);
            loadFromLocalStorage();
        }
    } catch (e) {
        console.error('Ошибка загрузки:', e);
        loadFromLocalStorage();
    }
    
    checkReferral();
    updateUI();
}

// Загрузка из локального хранилища
function loadFromLocalStorage() {
    const savedData = localStorage.getItem('slotGameState');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            Object.assign(userData, parsed);
        } catch (e) {
            console.error('Ошибка загрузки из localStorage:', e);
        }
    }
}

// Синхронизация данных с сервером
async function syncUserData() {
    if (!userData.id) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            console.error('Ошибка синхронизации:', response.status);
        }
    } catch (e) {
        console.error('Ошибка синхронизации:', e);
    }
    
    saveGameState();
}

// Проверка реферальной ссылки
function checkReferral() {
    const refParam = urlParams.get('start');
    
    if (refParam && refParam.startsWith('ref_')) {
        const referrerId = refParam.split('_')[1];
        if (referrerId && referrerId !== userData.id?.toString()) {
            if (!userData.friends.some(f => f.id === referrerId)) {
                const referrerName = `Пользователь ${referrerId}`;
                addFriend(referrerId, referrerName, null);
                showToast(`Вы зашли по реферальной ссылке от ${referrerName}`);
            }
        }
    }
}

// Добавление друга
function addFriend(friendId, friendName, friendAvatar) {
    if (userData.friends.some(f => f.id === friendId)) return;
    
    userData.friends.push({
        id: friendId,
        name: friendName,
        avatar: friendAvatar,
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
    showToast("Вы получили 1 попытку и 0.5 звезды за приглашение друга!");
}

// Обновление UI списка друзей
function updateFriendsUI() {
    const friendsList = document.getElementById('friends-list');
    const totalFriends = document.getElementById('referrals-count');
    
    totalFriends.textContent = userData.referrals;
    
    if (userData.friends.length === 0) {
        friendsList.innerHTML = `
            <div class="empty-state">
                <img src="https://cdn-icons-png.flaticon.com/512/4076/4076478.png" alt="No friends">
                <p>Вы пока не пригласили друзей</p>
            </div>
        `;
        return;
    }
    
    friendsList.innerHTML = '';
    let sortedFriends = [...userData.friends];
    
    if (gameState.currentSort === 'recent') {
        sortedFriends.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
        sortedFriends.sort((a, b) => b.starsEarned - a.starsEarned);
    }
    
    sortedFriends.forEach(friend => {
        const friendCard = document.createElement('div');
        friendCard.className = 'friend-card';
        friendCard.innerHTML = `
            <img src="${friend.avatar || 'default_avatar.png'}" class="friend-avatar">
            <div class="friend-info">
                <h4 class="friend-name">${friend.name}</h4>
                <span class="friend-date">${formatDate(friend.date)}</span>
                <span class="friend-level ${getFriendLevel(friend.starsEarned).toLowerCase()}">
                    ${getFriendLevel(friend.starsEarned)}
                </span>
            </div>
            <div class="friend-stats">
                <span class="friend-stars">${friend.starsEarned.toFixed(1)} ⭐</span>
                <span class="friend-attempts">${friend.attemptsEarned} попыток</span>
            </div>
        `;
        friendsList.appendChild(friendCard);
    });
}

// Получение уровня друга
function getFriendLevel(starsEarned) {
    if (starsEarned >= 100) return 'VIP';
    if (starsEarned >= 30) return 'Активный';
    return 'Новичок';
}

// Настройка ежедневных бонусов
function setupDailyBonus() {
    const today = new Date().toDateString();
    const lastClaim = userData.dailyBonus.lastClaim ? 
        new Date(userData.dailyBonus.lastClaim).toDateString() : null;
    
    if (lastClaim !== today) {
        if (!lastClaim || isConsecutiveDay(lastClaim, today)) {
            userData.dailyBonus.streak += 1;
        } else {
            userData.dailyBonus.streak = 1;
        }
        
        userData.dailyBonus.lastClaim = new Date().toISOString();
        syncUserData();
    }
    
    updateDailyBonusUI();
}

function isConsecutiveDay(lastDate, currentDate) {
    const dayMs = 24 * 60 * 60 * 1000;
    return (new Date(currentDate) - new Date(lastDate)) / dayMs === 1;
}

// Обновление UI ежедневных бонусов
function updateDailyBonusUI() {
    const calendar = document.querySelector('.bonus-calendar');
    if (!calendar) return;
    
    const days = calendar.querySelectorAll('.bonus-day');
    const currentStreak = userData.dailyBonus.streak;
    const lastClaim = userData.dailyBonus.lastClaim;
    const today = new Date().toDateString();
    
    days.forEach(day => {
        const dayNum = parseInt(day.dataset.day);
        const status = day.querySelector('.day-status');
        
        day.classList.remove('active', 'completed');
        
        if (dayNum === currentStreak && lastClaim && 
            new Date(lastClaim).toDateString() !== today) {
            day.classList.add('active');
            status.textContent = '🔓';
        } else if (dayNum < currentStreak) {
            day.classList.add('completed');
            status.textContent = '✅';
        } else {
            status.textContent = '🔒';
        }
    });
    
    const claimBtn = document.getElementById('claim-bonus-btn');
    if (claimBtn) {
        claimBtn.disabled = !(currentStreak > 0 && lastClaim && 
                             new Date(lastClaim).toDateString() !== today);
    }
}

// Получение ежедневного бонуса
function claimDailyBonus() {
    const currentStreak = userData.dailyBonus.streak;
    let bonusStars = 0;
    
    switch(currentStreak) {
        case 1: bonusStars = 1; break;
        case 2: bonusStars = 2; break;
        case 3: bonusStars = 3; break;
        case 4: bonusStars = 5; break;
        case 5: bonusStars = 7; break;
        case 6: bonusStars = 10; break;
        case 7: bonusStars = 15; break;
        default: bonusStars = 0;
    }
    
    if (bonusStars > 0) {
        userData.stars += bonusStars;
        userData.balance += bonusStars;
        userData.dailyBonus.lastClaim = new Date().toISOString();
        
        syncUserData();
        showToast(`Вы получили ${bonusStars} звёзд и ${bonusStars} попыток за ${currentStreak}-й день!`);
        updateDailyBonusUI();
        updateUI();
    }
}

// Настройка заданий
function updateTasksUI() {
    const subscribeBtn = document.getElementById('subscribe-task-btn');
    if (subscribeBtn) {
        subscribeBtn.disabled = userData.tasks.subscribe;
        subscribeBtn.textContent = userData.tasks.subscribe ? '✅ Выполнено' : 'Выполнить';
    }
    
    const spinsProgress = document.querySelector('.task-card:nth-child(2) .task-progress progress');
    const spinsText = document.querySelector('.task-card:nth-child(2) .task-progress span');
    if (spinsProgress && spinsText) {
        spinsProgress.value = userData.tasks.spins;
        spinsText.textContent = `${userData.tasks.spins}/10`;
    }
    
    const refsProgress = document.querySelector('.task-card:nth-child(3) .task-progress progress');
    const refsText = document.querySelector('.task-card:nth-child(3) .task-progress span');
    if (refsProgress && refsText) {
        refsProgress.value = userData.tasks.referrals;
        refsText.textContent = `${userData.tasks.referrals}/3`;
    }
    
    checkTasksProgress();
}

// Выполнение задания на подписку
function completeSubscribeTask() {
    if (userData.tasks.subscribe) return;
    
    if (tg.openLink) {
        tg.openLink(CHANNEL_LINK);
    } else {
        window.open(CHANNEL_LINK, '_blank');
    }
    
    userData.balance += 5;
    userData.tasks.subscribe = true;
    syncUserData();
    showToast("Вы получили 5 попыток за подписку на канал!");
}

// Проверка прогресса заданий
function checkTasksProgress() {
    if (userData.tasks.spins >= 10) {
        userData.stars += 10;
        userData.tasks.spins = 0;
        showToast("Вы выполнили задание и получили 10 звёзд!");
    }
    
    if (userData.tasks.referrals >= 3) {
        userData.stars += 15;
        userData.tasks.referrals = 0;
        showToast("Вы выполнили задание и получили 15 звёзд!");
    }
    
    syncUserData();
}

// Настройка реферальной ссылки
function setupReferralLink() {
    const refCode = userData.id ? `https://t.me/mine_stars_minenot_bot?start=ref_${userData.id}` : 'Недоступно';
    document.getElementById('referral-code').textContent = refCode;
    
    document.getElementById('copy-ref-btn').addEventListener('click', () => {
        copyToClipboard(refCode);
        showToast("Реферальная ссылка скопирована");
    });
}

// Логика вращения
function spin() {
    if (gameState.isSpinning || userData.balance <= 0) return;
    
    clearSpinAnimations();
    
    gameState.isSpinning = true;
    userData.balance--;
    userData.tasks.spins++;
    
    updateUI();
    
    const slots = document.querySelectorAll('.slot');
    const results = [];
    
    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.add('spinning');
        
        const animTimeout = setTimeout(() => {
            const result = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            results.push(result);
            slot.textContent = result;
            slot.classList.remove('spinning');
            
            if (index === slots.length - 1) {
                gameState.spinTimeout = setTimeout(() => {
                    checkWin(results);
                    gameState.isSpinning = false;
                    syncUserData();
                }, 500);
            }
        }, 1000 + (index * 500));
        
        gameState.slotAnimations.push(animTimeout);
    });
}

function clearSpinAnimations() {
    gameState.slotAnimations.forEach(clearTimeout);
    gameState.slotAnimations = [];
    if (gameState.spinTimeout) clearTimeout(gameState.spinTimeout);
}

// Проверка выигрыша
function checkWin(results) {
    if (results[0] === results[1] && results[1] === results[2]) {
        const starsWon = BASE_WIN_STARS * userData.level;
        userData.stars += starsWon;
        gameState.lastWin = starsWon;
        showWinAnimation(results.join(''), starsWon);
    } else {
        gameState.lastWin = 0;
    }
    
    updateUI();
    checkTasksProgress();
}

// Покупка попыток через Telegram Stars
function buyAttempts(amount, starsPrice) {
    if (!tg.openInvoice) {
        showToast("Функция покупки доступна только в Telegram");
        return;
    }
    
    if (userData.stars < starsPrice) {
        showToast("Недостаточно звёзд для покупки");
        return;
    }
    
    const invoice = {
        title: `Покупка ${amount} попыток`,
        description: `Вы получите ${amount} попыток в игре`,
        currency: "USD",
        prices: [{ label: "Stars", amount: starsPrice * 100 }],
        payload: JSON.stringify({
            type: "buy_attempts",
            amount: amount,
            user_id: userData.id
        })
    };
    
    tg.openInvoice(invoice, (status) => {
        if (status === 'paid') {
            userData.balance += amount;
            userData.stars -= starsPrice;
            syncUserData();
            showToast(`Успешно! Получено ${amount} попыток`);
        } else {
            showToast("Покупка отменена");
        }
    });
}

// Запрос на вывод звёзд
async function requestWithdraw(amount) {
    if (userData.stars < amount) {
        showToast("Недостаточно звёзд для вывода");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/withdraw`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userData.id,
                username: userData.username,
                amount: amount,
                balance: userData.stars,
                referrals: userData.referrals,
                timestamp: new Date().toISOString()
            })
        });

        if (response.ok) {
            userData.stars -= amount;
            syncUserData();
            showToast(`Запрос на вывод ${amount}⭐ отправлен! Ожидайте.`);
            
            // Формируем сообщение для админа
            const message = `Запрос на вывод ${amount}⭐\nID: ${userData.id}\nUser: ${userData.username}`;
            document.getElementById('withdraw-message').textContent = message;
        } else {
            showToast("Ошибка при отправке запроса");
        }
    } catch (e) {
        console.error('Ошибка вывода:', e);
        showToast("Ошибка соединения с сервером");
    }
}

// Копирование текста
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

// Обновление интерфейса
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
    
    updateLevelProgress();
}

function updateLevelProgress() {
    const progress = document.getElementById('level-progress');
    let required = 0, current = 0;
    
    if (userData.level === 1) {
        required = 50;
        current = userData.referrals;
    } else if (userData.level === 2) {
        required = 100;
        current = userData.referrals;
    } else {
        progress.value = 1;
        progress.max = 1;
        document.getElementById('level-status').textContent = "Максимальный уровень";
        return;
    }
    
    progress.value = current;
    progress.max = required;
    document.getElementById('level-status').textContent = 
        `Нужно ещё ${required - current} друзей для ${userData.level + 1} уровня`;
}

// Настройка обработчиков событий
function setupEventListeners() {
    document.getElementById('spin-button').addEventListener('click', spin);
    
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
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            gameState.currentSort = btn.dataset.sort;
            updateFriendsUI();
        });
    });
    
    document.getElementById('daily-bonus-btn')?.addEventListener('click', () => {
        document.getElementById('daily-bonus-modal').style.display = 'block';
        updateDailyBonusUI();
    });
    
    document.getElementById('subscribe-task-btn')?.addEventListener('click', completeSubscribeTask);
    document.getElementById('claim-bonus-btn')?.addEventListener('click', claimDailyBonus);
}

function setupModalHandlers() {
    // Обработчики модальных окон
    document.getElementById('buy-button').addEventListener('click', () => {
        document.getElementById('buy-modal').style.display = 'block';
    });
    
    document.getElementById('withdraw-button').addEventListener('click', () => {
        document.getElementById('withdraw-modal').style.display = 'block';
        document.getElementById('withdraw-message').textContent = 
            `Запрос на вывод\nID: ${userData.id}\nUser: ${userData.username}`;
    });
    
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });
    
    document.querySelectorAll('.offer').forEach(offer => {
        offer.addEventListener('click', () => {
            const amount = parseInt(offer.dataset.offer);
            const stars = parseInt(offer.dataset.stars);
            buyAttempts(amount, stars);
            document.getElementById('buy-modal').style.display = 'none';
        });
    });
    
    document.querySelectorAll('.withdraw-option').forEach(option => {
        option.addEventListener('click', () => {
            const amount = parseInt(option.dataset.amount);
            requestWithdraw(amount);
            document.getElementById('withdraw-modal').style.display = 'none';
        });
    });
}

// Сохранение данных
function saveGameState() {
    localStorage.setItem('slotGameState', JSON.stringify(userData));
}

// Вспомогательные функции
function showWinAnimation(combination, stars) {
    const popup = document.createElement('div');
    popup.className = 'win-popup';
    popup.innerHTML = `
        <h2>Победа!</h2>
        <div class="win-combination">${combination}</div>
        <p>+${stars} ⭐</p>
        <p>Теперь у вас: ${userData.stars} ⭐</p>
    `;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 3000);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Запуск игры
document.addEventListener('DOMContentLoaded', initGame);