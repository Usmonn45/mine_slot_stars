import json
import os
from flask import Flask, request, jsonify
from telebot import TeleBot, types
from threading import Thread

# Конфигурация
TOKEN = '7574117171:AAE2bfU_vgtoSHFqHtCAQTBuxj8PaLiy8ew'
USERS_FILE = 'users.json'
app = Flask(__name__)
bot = TeleBot(TOKEN)

# Инициализация базы пользователей
if os.path.exists(USERS_FILE):
    with open(USERS_FILE, 'r') as f:
        users = json.load(f)
else:
    users = {}

def save_users():
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def get_user(user_id):
    user_id = str(user_id)
    if user_id not in users:
        users[user_id] = {
            'id': user_id,
            'balance': 0,
            'stars': 0,
            'referrals': 0,
            'level': 1,
            'name': '',
            'avatar': ''
        }
        save_users()
    return users[user_id]

# API для веб-приложения
@app.route('/api/user', methods=['GET'])
def api_get_user():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400
    user = get_user(user_id)
    # Получаем имя и аватарку из Telegram, если доступны
    try:
        chat = bot.get_chat(int(user_id))
        user['name'] = chat.first_name or ''
        user['avatar'] = chat.photo.small_file_id if getattr(chat, 'photo', None) else ''
    except Exception:
        pass
    return jsonify(user)

@app.route('/api/update', methods=['POST'])
def api_update_user():
    data = request.json
    user_id = str(data.get('id'))
    if not user_id:
        return jsonify({'error': 'id required'}), 400
    user = get_user(user_id)
    # Запрещаем изменять баланс попыток через API
    if 'balance' in data:
        del data['balance']
    user.update(data)
    save_users()
    return jsonify({'status': 'ok'})

# Платежная система через Telegram Stars
@bot.message_handler(commands=['buy'])
def buy_handler(message):
    prices = [
        types.LabeledPrice("1 попытка", 100),  # 1 звезда = 100 центов
        types.LabeledPrice("Бонус", 0)  # Можно добавить бонусы
    ]
    
    bot.send_invoice(
        message.chat.id,
        title="Покупка попыток",
        description="1 попытка для игры в слоты",
        invoice_payload="attempts_1",
        provider_token="",  # Для XTR не требуется
        currency="XTR",
        prices=prices,
        start_parameter="buy_attempts"
    )

@bot.pre_checkout_query_handler(func=lambda query: True)
def process_pre_checkout(pre_checkout_query):
    bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)

@bot.message_handler(content_types=['successful_payment'])
def process_payment(message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    # Добавляем попытки за оплату
    if message.successful_payment.invoice_payload.startswith('attempts_'):
        attempts = int(message.successful_payment.invoice_payload.split('_')[1])
        user['balance'] += attempts
        save_users()
        
        bot.send_message(
            message.chat.id,
            f"✅ Оплата принята! Получено {attempts} попыток.\n"
            f"Баланс: {user['balance']} попыток"
        )
        
        # Синхронизация с веб-приложением
        sync_with_webapp(user_id)

def sync_with_webapp(user_id):
    user = get_user(user_id)
    try:
        response = request.post(
            'https://mine-slot-stars-jazq.vercel.app/',
            json=user,
            timeout=5
        )
        if not response.ok:
            print(f"Ошибка синхронизации: {response.status_code}")
    except Exception as e:
        print(f"Ошибка подключения к веб-приложению: {e}")

# Запуск бота и сервера
def run_bot():
    bot.infinity_polling()

if __name__ == '__main__':
    Thread(target=run_bot).start()
    app.run(port=3000)