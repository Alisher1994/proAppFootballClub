#!/bin/bash
# Клиентский бот (можно отключить: RUN_CLIENT_TELEGRAM_BOT=0)
if [ "$RUN_CLIENT_TELEGRAM_BOT" = "0" ]; then
  echo "ℹ️ RUN_CLIENT_TELEGRAM_BOT=0. Client bot skipped."
else
  echo "🚀 Starting Telegram bot process..."
  python telegram_bot.py &
fi

# Отдельный owner-бот (если задан OWNER_TELEGRAM_BOT_TOKEN)
if [ -n "$OWNER_TELEGRAM_BOT_TOKEN" ]; then
  echo "🚀 Starting Owner Telegram bot process..."
  python owner_telegram_bot.py &
else
  echo "ℹ️ OWNER_TELEGRAM_BOT_TOKEN not set. Owner bot skipped."
fi

# Ждем пару секунд, чтобы процессы не перекрывали вывод приветствия
sleep 2

# Запускаем веб-сервер
echo "🚀 Starting Web Server (gunicorn)..."
exec gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
