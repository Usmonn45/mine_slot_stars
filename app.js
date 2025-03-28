// Конфигурация игры
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const ATTEMPT_PRICES = {
    1: { stars: 100, amount: 1 },
    5: { stars: 450, amount: 5 },
    10: { stars: 800, amount: 10 },
    50: { stars: 3500, amount: 50 },
    100: { stars: 6000, amount: 100 }
};
const WITHDRAW_OPTIONS = [15, 25, 50, 100];

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Данные пользователя
let userData = {
    id: null,
    balance: 10,  // Попытки
    stars: 0,     // Звёзды (только для вывода)
    level: 1,
    referrals: 0,
    username: 'Игрок'
};

// Состояние игры
let gameState = {
    isSpinning: false,
    lastWin: 0
};

// Инициализация игры
function initGame() {
    loadUserData();
    setupEventListeners();
    setupModalHandlers();
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
            userData.balance = parsed.balance || 10;
            userData.stars = parsed.stars || 0;
            userData.level = parsed.level || 1;
            userData.referrals = parsed.referrals || 0;
        } catch (e) {
            console.error('Ошибка загрузки:', e);
        }
    }
    
    // Обновление UI
    updateUI();
}

// Логика вращения
function spin() {
    if (gameState.isSpinning || userData.balance <= 0) return;
    
    gameState.isSpinning = true;
    userData.balance--;
    updateUI();
    
    const slots = document.querySelectorAll('.slot');
    const results = [];
    
    // Анимация вращения
    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.add('spinning');
        
        setTimeout(() => {
            const result = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            results.push(result);
            slot.textContent = result;
            slot.classList.remove('spinning');
            
            if (index === slots.length - 1) {
                setTimeout(() => {
                    checkWin(results);
                    gameState.isSpinning = false;
                    saveGameState();
                }, 500);
            }
        }, 1000 + (index * 500));
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
    updateUI();
}

// Покупка попыток через Telegram Stars
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

// Запрос на вывод звёзд
function requestWithdraw(amount) {
    if (userData.stars < amount) {
        showToast("Недостаточно звёзд для вывода");
        return;
    }
    
    // Создаем сообщение для админа
    const message = `Хочу вывести ${amount} звёзд\nМой ID: ${userData.id}\nНик: ${userData.username}`;
    document.getElementById('withdraw-message').textContent = message;
    
    // В реальном приложении отправляем данные в бот
    if (tg.sendData) {
        tg.sendData(JSON.stringify({
            action: "withdraw",
            amount: amount,
            user_id: userData.id,
            username: userData.username
        }));
    }
    
    // Списание звёзд (в реальности только после подтверждения админа)
    // userData.stars -= amount;
    // saveGameState();
    
    showToast(`Запрос на вывод ${amount} звёзд отправлен`);
}

// Обновление интерфейса
function updateUI() {
    document.getElementById('balance').textContent = userData.balance;
    document.getElementById('stars-count').textContent = userData.stars;
    document.getElementById('user-level').textContent = userData.level;
    document.getElementById('level').textContent = userData.level;
    document.getElementById('prize-info').textContent = `${BASE_WIN_STARS * userData.level}⭐`;
    document.getElementById('referrals-count').textContent = userData.referrals;
    document.getElementById('referral-code').textContent = userData.id ? `ref_${userData.id}` : 'Недоступно';
    
    // Кнопка вращения
    const spinBtn = document.getElementById('spin-button');
    spinBtn.textContent = userData.balance > 0 ? `Крутить (1 попытка)` : "Нет попыток";
    spinBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
    
    // Прогресс уровня
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
    
    // Переключение вкладок
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
    // Покупка попыток
    document.getElementById('buy-button').addEventListener('click', () => {
        document.getElementById('buy-modal').style.display = 'block';
    });
    
    // Вывод звёзд
    document.getElementById('withdraw-button').addEventListener('click', () => {
        document.getElementById('withdraw-modal').style.display = 'block';
    });
    
    // Закрытие модалок
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });
    
    // Выбор предложения покупки
    document.querySelectorAll('.offer').forEach(offer => {
        offer.addEventListener('click', () => {
            const amount = parseInt(offer.dataset.offer);
            const stars = parseInt(offer.dataset.stars);
            buyAttempts(amount, stars);
            document.getElementById('buy-modal').style.display = 'none';
        });
    });
    
    // Выбор суммы вывода
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
    localStorage.setItem('slotGameState', JSON.stringify({
        balance: userData.balance,
        stars: userData.stars,
        level: userData.level,
        referrals: userData.referrals
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

// Запуск игры
document.addEventListener('DOMContentLoaded', initGame);