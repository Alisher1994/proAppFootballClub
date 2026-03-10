"""
Owner Telegram bot for platform-level service control.
Does not depend on client/student bot flows.
"""
import os
import time
import requests
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters

port = os.environ.get('PORT', '5000')
APP_URL = os.environ.get('APP_URL', f'http://127.0.0.1:{port}')

SERVICE_OPTIONS = {
    'football_club': 'Футбольный клуб'
}


def get_owner_bot_token():
    return (os.environ.get('OWNER_TELEGRAM_BOT_TOKEN') or '').strip()


def build_main_keyboard():
    return ReplyKeyboardMarkup(
        [
            [KeyboardButton("🛠 Сервисы")],
            [KeyboardButton("🆔 Мой Chat ID")]
        ],
        resize_keyboard=True
    )


def build_service_select_keyboard():
    keyboard = [
        [InlineKeyboardButton(service_name, callback_data=f"svc_select:{service_key}")]
        for service_key, service_name in SERVICE_OPTIONS.items()
    ]
    return InlineKeyboardMarkup(keyboard)


def build_service_action_keyboard(service_key, enabled):
    toggle_label = "🔴 Выключить сервис" if enabled else "🟢 Включить сервис"
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(toggle_label, callback_data=f"svc_toggle:{service_key}")],
        [InlineKeyboardButton("⬅️ Назад к сервисам", callback_data="svc_back")]
    ])


def fetch_service_status(chat_id, service_key):
    try:
        response = requests.get(
            f"{APP_URL}/api/telegram/service-control/status",
            params={'chat_id': str(chat_id), 'service': service_key},
            timeout=10
        )
        data = response.json()
        if response.status_code != 200:
            return {'success': False, 'message': data.get('message', 'Ошибка доступа')}
        return data
    except Exception as e:
        print(f"[owner-bot] status error: {e}")
        return {'success': False, 'message': 'Ошибка соединения с API'}


def toggle_service_status(chat_id, service_key):
    try:
        response = requests.post(
            f"{APP_URL}/api/telegram/service-control/toggle",
            json={'chat_id': str(chat_id), 'service': service_key},
            timeout=10
        )
        data = response.json()
        if response.status_code != 200:
            return {'success': False, 'message': data.get('message', 'Ошибка переключения')}
        return data
    except Exception as e:
        print(f"[owner-bot] toggle error: {e}")
        return {'success': False, 'message': 'Ошибка соединения с API'}


def format_service_status_text(payload):
    service_name = payload.get('service_name', 'Сервис')
    enabled = bool(payload.get('enabled', True))
    month_label = payload.get('month_label', '')
    support_phone = payload.get('support_phone', '')
    updated_at = payload.get('updated_at') or '-'

    status_icon = '🟢' if enabled else '🔴'
    status_text = 'Включен' if enabled else 'Выключен'
    lines = [
        f"🛠 <b>{service_name}</b>",
        f"Статус: {status_icon} <b>{status_text}</b>",
    ]

    if not enabled:
        lines.append(f"Причина: {payload.get('message', 'Система временно отключена')}")
        if month_label:
            lines.append(f"Период: {month_label}")
        if support_phone:
            lines.append(f"Контакт: <code>{support_phone}</code>")

    lines.append(f"Обновлено: {updated_at}")
    return "\n".join(lines)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        (
            "Owner bot запущен.\n"
            f"Ваш chat_id: <code>{chat_id}</code>\n\n"
            "Если доступ запрещен, добавьте этот chat_id в переменную "
            "<code>OWNER_BOT_ALLOWED_CHAT_IDS</code> (через запятую)."
        ),
        parse_mode='HTML',
        reply_markup=build_main_keyboard()
    )


async def handle_my_chat_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        f"Ваш chat_id: <code>{chat_id}</code>",
        parse_mode='HTML',
        reply_markup=build_main_keyboard()
    )


async def handle_services(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Выберите сервис для управления:",
        reply_markup=build_service_select_keyboard()
    )


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    chat_id = query.from_user.id

    if data == "svc_back":
        await query.edit_message_text(
            "Выберите сервис для управления:",
            reply_markup=build_service_select_keyboard()
        )
        return

    if data.startswith("svc_select:"):
        service_key = data.split(":", 1)[1]
        payload = fetch_service_status(chat_id, service_key)
        if not payload.get('success'):
            await query.edit_message_text(
                "❌ " + payload.get('message', 'Ошибка доступа') +
                "\n\nПроверьте OWNER_BOT_ALLOWED_CHAT_IDS."
            )
            return

        await query.edit_message_text(
            format_service_status_text(payload),
            parse_mode='HTML',
            reply_markup=build_service_action_keyboard(service_key, bool(payload.get('enabled', True)))
        )
        return

    if data.startswith("svc_toggle:"):
        service_key = data.split(":", 1)[1]
        payload = toggle_service_status(chat_id, service_key)
        if not payload.get('success'):
            await query.edit_message_text(
                "❌ " + payload.get('message', 'Ошибка переключения') +
                "\n\nПроверьте OWNER_BOT_ALLOWED_CHAT_IDS."
            )
            return

        await query.edit_message_text(
            format_service_status_text(payload),
            parse_mode='HTML',
            reply_markup=build_service_action_keyboard(service_key, bool(payload.get('enabled', True)))
        )


async def unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (update.message.text or '').strip()
    if text == "🛠 Сервисы":
        await handle_services(update, context)
        return
    if text == "🆔 Мой Chat ID":
        await handle_my_chat_id(update, context)
        return

    await update.message.reply_text("Используйте /start")


def main():
    token = get_owner_bot_token()
    if not token:
        print("OWNER_TELEGRAM_BOT_TOKEN не задан. Owner bot пропущен.")
        return

    print("[owner-bot] starting...")
    print(f"[owner-bot] API URL: {APP_URL}")

    application = Application.builder().token(token).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.Regex("^🛠 Сервисы$"), handle_services))
    application.add_handler(MessageHandler(filters.Regex("^🆔 Мой Chat ID$"), handle_my_chat_id))
    application.add_handler(CallbackQueryHandler(callback_handler))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, unknown))

    while True:
        try:
            application.run_polling(allowed_updates=Update.ALL_TYPES)
            break
        except Exception as e:
            if "Conflict" in str(e):
                print("[owner-bot] conflict, retry in 10 sec...")
                time.sleep(10)
            else:
                print(f"[owner-bot] fatal error: {e}. retry in 5 sec...")
                time.sleep(5)


if __name__ == '__main__':
    main()
