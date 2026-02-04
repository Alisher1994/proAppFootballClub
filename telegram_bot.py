"""
Telegram бот для уведомлений учеников
Запускается отдельным процессом

Установка зависимостей:
pip install python-telegram-bot

Запуск:
python telegram_bot.py
"""
import os
import requests
import time
from datetime import datetime, timedelta
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# URL вашего приложения
# Для локальной разработки:
APP_URL = os.environ.get('APP_URL', 'http://localhost:5000')
# Для Railway (если используете):
# APP_URL = os.environ.get('RAILWAY_PUBLIC_DOMAIN', 'https://ваш-проект.up.railway.app')

# Получить токен бота из настроек через API
def get_bot_token():
    """Получить токен бота из настроек приложения"""
    # Сначала пробуем получить из переменной окружения
    token = os.environ.get('TELEGRAM_BOT_TOKEN')
    
    if not token:
        # Если нет в переменной окружения, получаем из настроек через API
        try:
            response = requests.get(f'{APP_URL}/api/club-settings/public', timeout=5)
            if response.status_code == 200:
                data = response.json()
                token = data.get('telegram_bot_token')
                if token:
                    print("✓ Токен получен из настроек приложения")
                    return token
        except Exception as e:
            print(f"⚠️ Не удалось получить токен из API: {e}")
            print("   Используйте переменную окружения TELEGRAM_BOT_TOKEN")
    
    if token:
        print("✓ Токен получен из переменной окружения")
    
    return token


# Обработчик команды /start
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    await update.message.reply_text(
        "👋 Привет! Я бот для уведомлений о занятиях.\n\n"
        "Для регистрации отправь мне свой код привязки.\n"
        "Код можно получить у администратора.\n\n"
        "Введи код:"
    )


# Обработчик текстовых сообщений (код привязки)
async def handle_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик кода привязки"""
    chat_id = update.message.chat_id
    code = update.message.text.strip().upper()
    
    # Проверка формата кода
    if len(code) != 4 or not (code[0].isalpha() and code[1:].isdigit()):
        await update.message.reply_text(
            "❌ Неверный формат кода.\n\n"
            "Код должен состоять из буквы и трех цифр.\n"
            "Проверь правильность кода и попробуй еще раз:"
        )
        return
    
    # Отправить код на сервер для регистрации
    try:
        response = requests.post(
            f'{APP_URL}/api/telegram/register',
            json={
                'chat_id': chat_id,
                'code': code
            },
            timeout=10
        )
        
        result = response.json()
        
        if result.get('success'):
            student = result.get('student', {})
            student_name = student.get('full_name', 'ученик')
            group_name = student.get('group_name', 'группа')
            
            await update.message.reply_text(
                f"✅ {result.get('message', 'Регистрация успешна!')}\n\n"
                f"Теперь ты будешь получать уведомления о занятиях группы '{group_name}'."
            )
        else:
            await update.message.reply_text(
                f"❌ {result.get('message', 'Ошибка регистрации')}\n\n"
                "Проверь правильность кода и попробуй еще раз:"
            )
    except requests.exceptions.RequestException as e:
        await update.message.reply_text(
            "❌ Ошибка соединения с сервером. Попробуй позже."
        )
        print(f"Ошибка запроса к API: {e}")


# Обработчик неизвестных команд
async def unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик неизвестных команд"""
    await update.message.reply_text(
        "Не понимаю эту команду.\n\n"
        "Используй /start для начала работы."
    )


def main():
    """Запуск бота"""
    # Получить токен
    token = get_bot_token()
    
    if not token:
        print("❌ Ошибка: Токен бота не найден!")
        print("Установите переменную окружения TELEGRAM_BOT_TOKEN")
        print("Или добавьте токен в настройки приложения")
        return
    
    print(f"🤖 Запуск Telegram бота...")
    print(f"📡 Подключение к приложению: {APP_URL}")
    
    # Создать приложение
    application = Application.builder().token(token).build()
    
    # Регистрация обработчиков
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_code))
    application.add_handler(MessageHandler(filters.COMMAND, unknown))
    
    # Запустить бота
    print("✅ Бот запущен и готов к работе!")
    print("Нажмите Ctrl+C для остановки")
    
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()

