#!/bin/bash
# Запускаем бота в фоне, логи пишем прямо в поток (чтобы видеть в Railway)
echo "🚀 Starting Telegram bot process..."
python telegram_bot.py &

# Ждем пару секунд, чтобы процессы не перекрывали вывод приветствия
sleep 2

# Запускаем веб-сервер
echo "🚀 Starting Web Server (gunicorn)..."
exec gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
