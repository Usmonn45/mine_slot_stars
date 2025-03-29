// Конфигурация
const BOT_API_URL = "http://localhost:5000/api"; // Замените на ваш хостинг (PythonAnywhere/Heroku)
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const BASE_WIN_STARS = 15;
const WITHDRAW_OPTIONS = [15, 25, 50];

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Данные пользователя
let userData = {
    id: tg.initDataUnsafe?.user?.id,
    username: tg.initDataUnsafe?.user?.first_name || "Игрок",
    balance: 0,
    stars: 0,
    level: 1,
    referrals: 0,
    friends: [],
    tasks: {
        subscribe: false,
        spins: 0,
        referrals: 0
    }
};

// Состояние игры
let gameState = {
    isSpinning: false,
    currentSort: 'recent'
};

// ------------ Основные функции ------------ //

// Загрузить данные пользователя из бота
async function loadUserData() {
    try {
        if (!userData.id) return;
        
        const response = await fetch(`${BOT_API_URL}/user?user_id=${userData.id}`);
        if (response.ok) {
            const data = await response.json();
            Object.assign(userData, data);
            updateUI();
        }
    } catch (e) {
        console.error("Ошибка загрузки:", e);
    }
}

// Сохранить данные через API бота
async function saveGameState() {
    try {
        await fetch(`${BOT_API_URL}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userData.id,
                ...userData
            })
        });
    } catch (e) {
        console.error("Ошибка сохранения:", e);
    }
}

// Показать уведомление
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ------------ Игровая логика ------------ //

// Вращение слотов
async function spin() {
    if (gameState.isSpinning || userData.balance <= 0) return;

    gameState.isSpinning = true;
    userData.balance--;
    userData.tasks.spins++;
    await saveGameState();
    
    // Анимация вращения
    const slots = document.querySelectorAll('.slot');
    slots.forEach(slot => slot.classList.add('spinning'));

    setTimeout(() => {
        slots.forEach(slot => slot.classList.remove('spinning'));
        
        // Генерация случайных результатов
        const results = [
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
        ];
        
        checkWin(results);
        gameState.isSpinning = false;
        updateUI();
    }, 1000);
}

// Проверка выигрыша
function checkWin(results) {
    if (results[0] === results[1] && results[1] === results[2]) {
        const starsWon = BASE_WIN_STARS * userData.level;
        userData.stars += starsWon;
        showToast(`🎉 Победа! +${starsWon}⭐`);
        saveGameState();
    }
}

// ------------ Реферальная система ------------ //

// Проверить реферальную ссылку
function checkReferral() {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('start');
    
    if (refParam?.startsWith('ref_')) {
        const referrerId = refParam.split('_')[1];
        if (referrerId && referrerId !== userData.id) {
            addFriend(referrerId, `Друг ${referrerId}`);
        }
    }
}

// Добавить друга
async function addFriend(friendId, friendName) {
    if (userData.friends.some(f => f.id === friendId)) return;
    
    userData.friends.push({
        id: friendId,
        name: friendName,
        date: new Date().toISOString()
    });
    
    userData.referrals++;
    userData.tasks.referrals++;
    await saveGameState();
    updateUI();
    checkTasks();
}

// ------------ Задания ------------ //

// Проверить выполнение заданий
function checkTasks() {
    // Задание "Пригласи 3 друзей"
    if (userData.tasks.referrals >= 3) {
        userData.stars += 15;
        userData.tasks.referrals = 0;
        showToast("🎉 Задание выполнено: +15⭐!");
        saveGameState();
    }
    
    // Задание "Сыграй 10 раз"
    if (userData.tasks.spins >= 10) {
        userData.stars += 10;
        userData.tasks.spins = 0;
        showToast("🎉 Задание выполнено: +10⭐!");
        saveGameState();
    }
}

// ------------ UI Обновление ------------ //

// Обновить интерфейс
function updateUI() {
    // Баланс
    document.getElementById('balance').textContent = userData.balance;
    document.getElementById('stars-count').textContent = userData.stars;
    document.getElementById('user-level').textContent = userData.level;
    document.getElementById('referrals-count').textContent = userData.referrals;
    
    // Кнопка вращения
    const spinBtn = document.getElementById('spin-button');
    spinBtn.textContent = userData.balance > 0 ? "Крутить (1 попытка)" : "Нет попыток";
    spinBtn.disabled = userData.balance <= 0 || gameState.isSpinning;
    
    // Друзья
    updateFriendsUI();
    // Задания
    updateTasksUI();
}

// Обновить список друзей
function updateFriendsUI() {
    const friendsList = document.getElementById('friends-list');
    friendsList.innerHTML = '';
    
    userData.friends
        .sort((a, b) => gameState.currentSort === 'recent' 
            ? new Date(b.date) - new Date(a.date) 
            : 0)
        .forEach(friend => {
            friendsList.innerHTML += `
                <div class="friend-card">
                    <div class="friend-info">
                        <h4>${friend.name}</h4>
                        <span>${new Date(friend.date).toLocaleDateString()}</span>
                    </div>
                </div>
            `;
        });
}

// Обновить прогресс заданий
function updateTasksUI() {
    // Задание "Пригласи 3 друзей"
    const refTask = document.querySelector('.task-card:nth-child(3) .task-progress');
    if (refTask) {
        refTask.querySelector('progress').value = userData.tasks.referrals;
        refTask.querySelector('span').textContent = `${userData.tasks.referrals}/3`;
    }
    
    // Задание "Сыграй 10 раз"
    const spinsTask = document.querySelector('.task-card:nth-child(2) .task-progress');
    if (spinsTask) {
        spinsTask.querySelector('progress').value = userData.tasks.spins;
        spinsTask.querySelector('span').textContent = `${userData.tasks.spins}/10`;
    }
}

// ------------ Инициализация ------------ //

// Запуск игры
document.addEventListener('DOMContentLoaded', async () => {
    // Показываем прелоадер 2 секунды
    setTimeout(async () => {
        document.getElementById('preloader').style.display = 'none';
        await loadUserData();
        checkReferral();
        setupEventListeners();
        updateUI();
    }, 2000);
});

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка вращения
    document.getElementById('spin-button').addEventListener('click', spin);
    
    // Вкладки
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
    
    // Кнопка задания "Подписаться"
    document.getElementById('subscribe-task-btn')?.addEventListener('click', () => {
        tg.openLink("https://t.me/mine_not_ru");
        userData.tasks.subscribe = true;
        userData.balance += 5;
        saveGameState();
        updateUI();
    });
    
    // Сортировка друзей
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.currentSort = btn.dataset.sort;
            updateFriendsUI();
        });
    });
}