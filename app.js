// Конфигурация
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const ATTEMPT_PRICES = {
    1: { stars: 1, amount: 1 },
    5: { stars: 4, amount: 5 },
    10: { stars: 7, amount: 10 }
};
const WITHDRAW_OPTIONS = [25, 50, 100]; // Обновленные суммы для вывода
const WITHDRAW_MIN_REFERRALS = 25; // Минимальное количество рефералов для вывода
const CHANNEL_LINK = "https://t.me/mine_not_ru";
const CHANNEL_LINK_2 = "https://t.me/LOHUTI_TJ"; // Замените на реальную ссылку
const ADMIN_CONTACT = "@usmon110";

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
        subscribe2: false, // Новое задание на подписку
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
    
    // Загружаем аватар из Telegram
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
        const response = await fetch(`/api/user?user_id=${userData.id}`);
        if (response.ok) {
            const data = await response.json();
            Object.assign(userData, data);
            
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
        const response = await fetch('/api/update', {
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
    const refParam = urlParams.get('ref') || urlParams.get('start');
    
    if (refParam && refParam.startsWith('ref_')) {
        const referrerId = refParam.split('_')[1];
        if (referrerId && referrerId !== userData.id?.toString()) {
            if (!userData.friends.some(f => f.id === referrerId)) {
                let referrerName = `Пользователь ${referrerId}`;
                let referrerAvatar = null;
                
                if (tg.initDataUnsafe?.user?.id === referrerId) {
                    referrerName = tg.initDataUnsafe.user.first_name;
                    if (tg.initDataUnsafe.user.last_name) {
                        referrerName += ' ' + tg.initDataUnsafe.user.last_name;
                    }
                    referrerAvatar = tg.initDataUnsafe.user.photo_url;
                }
                
                addFriend(referrerId, referrerName, referrerAvatar);
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
    updateFriendsUI();
    updateUI();
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
        createConfetti();
    }
}

// Настройка заданий
function updateTasksUI() {
    const subscribeBtn = document.getElementById('subscribe-task-btn');
    const subscribeBtn2 = document.getElementById('subscribe-task-btn-2');
    const spinsBtn = document.getElementById('spins-task-btn');
    const referralsBtn = document.getElementById('referrals-task-btn');
    
    if (subscribeBtn) {
        subscribeBtn.disabled = userData.tasks.subscribe;
        subscribeBtn.textContent = userData.tasks.subscribe ? '✅ Выполнено' : 'Выполнить';
    }
    
    if (subscribeBtn2) {
        subscribeBtn2.disabled = userData.tasks.subscribe2;
        subscribeBtn2.textContent = userData.tasks.subscribe2 ? '✅ Выполнено' : 'Выполнить';
    }
    
    const spinsProgress = document.querySelector('.task-card:nth-child(3) .task-progress progress');
    const spinsText = document.querySelector('.task-card:nth-child(3) .task-progress span');
    if (spinsProgress && spinsText) {
        spinsProgress.value = userData.tasks.spins;
        spinsText.textContent = `${userData.tasks.spins}/10`;
    }
    
    const refsProgress = document.querySelector('.task-card:nth-child(4) .task-progress progress');
    const refsText = document.querySelector('.task-card:nth-child(4) .task-progress span');
    if (refsProgress && refsText) {
        refsProgress.value = userData.tasks.referrals;
        refsText.textContent = `${userData.tasks.referrals}/25`;
    }
    
    if (spinsBtn) {
        spinsBtn.disabled = userData.tasks.spins < 10;
        spinsBtn.textContent = userData.tasks.spins < 10 ? 'В процессе' : 'Забрать награду';
    }
    
    if (referralsBtn) {
        referralsBtn.disabled = userData.tasks.referrals < 25;
        referralsBtn.textContent = userData.tasks.referrals < 25 ? 'В процессе' : 'Забрать награду';
    }
    
    checkTasksProgress();
}

// Выполнение задания на подписку
function completeSubscribeTask(channel = 1) {
    if ((channel === 1 && userData.tasks.subscribe) || 
        (channel === 2 && userData.tasks.subscribe2)) return;
    
    const link = channel === 1 ? CHANNEL_LINK : CHANNEL_LINK_2;
    
    if (tg.openLink) {
        tg.openLink(link);
    } else {
        window.open(link, '_blank');
    }
    
    userData.balance += 3;
    if (channel === 1) {
        userData.tasks.subscribe = true;
    } else {
        userData.tasks.subscribe2 = true;
    }
    
    syncUserData();
    updateTasksUI();
    showToast(`Вы получили 3 попытки за подписку на канал!`);
    createConfetti();
}

// Проверка прогресса заданий
function checkTasksProgress() {
    if (userData.tasks.spins >= 10) {
        userData.stars += 10;
        userData.tasks.spins = 0;
        syncUserData();
        showWinAnimation("🎰", 10);
        updateTasksUI();
    }
    
    if (userData.tasks.referrals >= 25) {
        userData.stars += 50;
        userData.tasks.referrals = 0;
        syncUserData();
        showWinAnimation("👥", 50);
        updateTasksUI();
    }
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
function spin(allAttempts = false) {
    if (gameState.isSpinning || userData.balance <= 0) return;
    
    clearSpinAnimations();
    
    gameState.isSpinning = true;
    const attemptsToUse = allAttempts ? userData.balance : 1;
    
    userData.balance -= attemptsToUse;
    userData.tasks.spins += attemptsToUse;
    
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
                    checkWin(results, attemptsToUse);
                    gameState.isSpinning = false;
                    syncUserData();
                    updateUI();
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
function checkWin(results, attemptsUsed = 1) {
    if (results[0] === results[1] && results[1] === results[2]) {
        const starsWon = BASE_WIN_STARS * userData.level * attemptsUsed;
        userData.stars += starsWon;
        gameState.lastWin = starsWon;
        showWinAnimation(results.join(''), starsWon);
        createConfetti();
    } else {
        gameState.lastWin = 0;
    }
    
    checkTasksProgress();
}

// Покупка попыток за внутренние звезды
function buyAttempts(amount, starsPrice) {
    if (userData.stars < starsPrice) {
        showToast("Недостаточно звёзд для покупки");
        return;
    }

    userData.balance += amount;
    userData.stars -= starsPrice;
    syncUserData();
    updateUI();
    showToast(`Успешно! Получено ${amount} попыток`);
    createConfetti();
}

// Запрос на вывод звёзд
function requestWithdraw(amount) {
    if (userData.stars < amount) {
        showToast("Недостаточно звёзд для вывода");
        return;
    }

    if (userData.referrals < WITHDRAW_MIN_REFERRALS) {
        showToast(`Для вывода нужно пригласить ${WITHDRAW_MIN_REFERRALS} друзей`);
        return;
    }

    userData.stars -= amount;
    syncUserData();
    updateUI();

    const message = `Запрос на вывод ${amount}⭐\nID: ${userData.id}\nUser: ${userData.username}\nБаланс: ${userData.stars}⭐`;
    
    const modal = document.getElementById('withdraw-modal');
    const messageElement = document.getElementById('withdraw-message');
    messageElement.textContent = message;
    
    document.getElementById('copy-withdraw-btn').onclick = () => {
        copyToClipboard(message);
        showToast("Текст скопирован, отправьте его админу");
    };
    
    modal.style.display = 'block';
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
    
    const spinAllBtn = document.getElementById('spin-all-button');
    spinAllBtn.textContent = userData.balance > 0 ? `Крутить все (${userData.balance} попыток)` : "Нет попыток";
    spinAllBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
    
    updateLevelProgress();
}

function updateLevelProgress() {
    const progress = document.getElementById('level-progress');
    const levelStatus = document.getElementById('level-status');
    
    const levels = [
        { required: 0, reward: 0 },
        { required: 50, reward: 5 },    // Уровень 2: 50 рефералов
        { required: 150, reward: 15 },  // Уровень 3: 150 рефералов
        { required: 300, reward: 30 },  // Уровень 4: 300 рефералов
        { required: 500, reward: 50 }   // Уровень 5: 500 рефералов
    ];
    
    let currentLevel = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (userData.referrals >= levels[i].required) {
            currentLevel = i + 1;
            break;
        }
    }
    
    if (currentLevel > userData.level) {
        userData.level = currentLevel;
        userData.stars += levels[currentLevel].reward;
        syncUserData();
        showWinAnimation("⭐", levels[currentLevel].reward);
    }
    
    const nextLevel = currentLevel < levels.length ? currentLevel + 1 : currentLevel;
    const needed = levels[nextLevel-1]?.required - userData.referrals || 0;
    
    progress.value = userData.referrals - levels[currentLevel-1]?.required || 0;
    progress.max = levels[nextLevel-1]?.required - levels[currentLevel-1]?.required || 1;
    
    if (currentLevel >= levels.length) {
        levelStatus.textContent = "Максимальный уровень достигнут!";
    } else {
        levelStatus.textContent = `До ${nextLevel} уровня: ${needed} рефералов`;
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    document.getElementById('spin-button').addEventListener('click', () => spin());
    document.getElementById('spin-all-button').addEventListener('click', () => spin(true));
    
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
    
    document.getElementById('subscribe-task-btn')?.addEventListener('click', () => completeSubscribeTask(1));
    document.getElementById('subscribe-task-btn-2')?.addEventListener('click', () => completeSubscribeTask(2));
    document.getElementById('claim-bonus-btn')?.addEventListener('click', claimDailyBonus);
    document.getElementById('spins-task-btn')?.addEventListener('click', checkTasksProgress);
    document.getElementById('referrals-task-btn')?.addEventListener('click', checkTasksProgress);
}

function setupModalHandlers() {
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

function createConfetti() {
    const colors = ['#f1c40f', '#e67e22', '#2ecc71', '#3498db', '#9b59b6'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = `${Math.random() * 100}vw`;
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.width = `${Math.random() * 10 + 5}px`;
        confetti.style.height = `${Math.random() * 10 + 5}px`;
        confetti.style.animationDuration = `${Math.random() * 2 + 2}s`;
        document.body.appendChild(confetti);
        
        setTimeout(() => {
            confetti.remove();
        }, 3000);
    }
}

// Запуск игры
document.addEventListener('DOMContentLoaded', initGame);