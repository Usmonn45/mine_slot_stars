// Конфигурация игры
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const ATTEMPT_PRICES = {
    1: { stars: 1, amount: 1 },
    5: { stars: 4, amount: 5 },
    10: { stars: 7, amount: 10 }
};
const WITHDRAW_OPTIONS = [15, 25, 50];
const INITIAL_BALANCE = 0; // Начинаем с 0 попыток

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Данные пользователя
let userData = {
    id: null,
    balance: INITIAL_BALANCE,
    stars: 0,
    level: 1,
    referrals: 0,
    username: 'Игрок',
    firstTime: true,
    bonusGiven: false
};

// Состояние игры
let gameState = {
    isSpinning: false,
    lastWin: 0,
    spinTimeout: null,
    slotAnimations: []
};

// Инициализация игры
function initGame() {
    loadUserData();
    setupEventListeners();
    setupModalHandlers();
    setupReferralLink();
    updateUI();
    
    // Даем бонус только при первом входе, если еще не давали
    if (userData.firstTime && !userData.bonusGiven) {
        giveInitialBonus();
    }
}

// Выдача начального бонуса
function giveInitialBonus() {
    userData.balance += 10; // Даем 10 начальных попыток
    userData.bonusGiven = true;
    userData.firstTime = false;
    saveGameState();
    showToast("Вы получили 10 бесплатных попыток!");
    updateUI();
}

// Загрузка данных пользователя
function loadUserData() {
    // Загрузка из Telegram
    if (tg.initDataUnsafe?.user) {
        userData.id = tg.initDataUnsafe.user.id;
        userData.username = tg.initDataUnsafe.user.first_name;
        document.getElementById('username').textContent = userData.username;
        
        if (tg.initDataUnsafe.user.photo_url) {
            document.getElementById('user-avatar').src = tg.initDataUnsafe.user.photo_url;
        }
    }
    
    // Загрузка из localStorage
    const savedData = localStorage.getItem('slotGameState');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            userData.balance = parsed.balance || INITIAL_BALANCE;
            userData.stars = parsed.stars || 0;
            userData.level = parsed.level || 1;
            userData.referrals = parsed.referrals || 0;
            userData.firstTime = parsed.firstTime !== undefined ? parsed.firstTime : true;
            userData.bonusGiven = parsed.bonusGiven || false;
        } catch (e) {
            console.error('Ошибка загрузки:', e);
        }
    }
    
    checkReferral();
    updateUI();
}

// Проверка реферальной ссылки
function checkReferral() {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('start');
    
    if (refParam && refParam.startsWith('ref_')) {
        const referrerId = refParam.split('_')[1];
        if (referrerId && referrerId !== userData.id?.toString()) {
            showToast(`Вы зашли по реферальной ссылке от пользователя ${referrerId}`);
            // Здесь можно добавить логику начисления бонуса рефереру
        }
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

// Логика вращения с исправлениями
function spin() {
    if (gameState.isSpinning || userData.balance <= 0) return;
    
    // Очистка предыдущих анимаций
    gameState.slotAnimations.forEach(clearTimeout);
    gameState.slotAnimations = [];
    if (gameState.spinTimeout) clearTimeout(gameState.spinTimeout);
    
    gameState.isSpinning = true;
    userData.balance--;
    updateUI();
    
    const slots = document.querySelectorAll('.slot');
    const results = [];
    
    // Анимация вращения
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
                    saveGameState();
                    updateUI();
                }, 500);
            }
        }, 1000 + (index * 500));
        
        gameState.slotAnimations.push(animTimeout);
    });
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
}

// Покупка попыток
function buyAttempts(amount, starsPrice) {
    if (!tg.openInvoice) {
        showToast("Функция покупки доступна только в Telegram");
        return;
    }
    
    const invoice = {
        title: `Покупка ${amount} попыток`,
        description: `Вы получите ${amount} попыток в игре`,
        currency: "USD",
        prices: [{ label: "Stars", amount: starsPrice * 100 }],
        payload: JSON.stringify({
            type: "buy_attempts",
            amount: amount
        })
    };
    
    tg.openInvoice(invoice, (status) => {
        if (status === 'paid') {
            userData.balance += amount;
            updateUI();
            saveGameState();
            showToast(`Успешно! Получено ${amount} попыток`);
        } else {
            showToast("Покупка отменена");
        }
    });
}

// Запрос на вывод
function requestWithdraw(amount) {
    if (userData.stars < amount) {
        showToast("Недостаточно звёзд для вывода");
        return;
    }
    
    const adminLink = "https://t.me/Usmon110";
    const message = `Запрос на вывод ${amount} ⭐\nID: ${userData.id}\nНик: ${userData.username}\nСвязь: ${adminLink}`;
    document.getElementById('withdraw-message').textContent = message;
    
    document.getElementById('copy-withdraw-btn').onclick = () => {
        copyToClipboard(message);
        showToast("Текст скопирован");
    };
    
    if (tg.sendData) {
        tg.sendData(JSON.stringify({
            action: "withdraw",
            amount: amount,
            user_id: userData.id,
            username: userData.username
        }));
    }
    
    showToast(`Запрос на вывод ${amount} звёзд отправлен`);
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

// Настройка обработчиков
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
}

function setupModalHandlers() {
    document.getElementById('buy-button').addEventListener('click', () => {
        document.getElementById('buy-modal').style.display = 'block';
    });
    
    document.getElementById('withdraw-button').addEventListener('click', () => {
        document.getElementById('withdraw-modal').style.display = 'block';
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
    localStorage.setItem('slotGameState', JSON.stringify({
        balance: userData.balance,
        stars: userData.stars,
        level: userData.level,
        referrals: userData.referrals,
        firstTime: userData.firstTime,
        bonusGiven: userData.bonusGiven
    }));
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
// ... (предыдущие константы остаются без изменений)

// Запрос на вывод звёзд с списанием баланса
function requestWithdraw(amount) {
    if (userData.stars < amount) {
        showToast("Недостаточно звёзд для вывода");
        return;
    }
    
    // Списываем звёзды сразу
    userData.stars -= amount;
    saveGameState();
    updateUI();
    
    const adminLink = "https://t.me/usmon110";
    const message = `Запрос на вывод ${amount} ⭐\nID: ${userData.id}\nНик: ${userData.username}\nСвязь: ${adminLink}\nОстаток звёзд: ${userData.stars}`;
    document.getElementById('withdraw-message').textContent = message;
    
    document.getElementById('copy-withdraw-btn').onclick = () => {
        copyToClipboard(message);
        showToast("Текст скопирован");
    };
    
    if (tg.sendData) {
        tg.sendData(JSON.stringify({
            action: "withdraw",
            amount: amount,
            user_id: userData.id,
            username: userData.username,
            remaining_stars: userData.stars
        }));
    }
    
    showToast(`Запрос на вывод ${amount} звёзд отправлен. Списано ${amount}⭐`);
    document.getElementById('withdraw-modal').style.display = 'none';
}

// Остальной код остаётся без изменений
// ...

// Запуск игры
document.addEventListener('DOMContentLoaded', initGame);