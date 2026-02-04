"""
Сервис для работы с Telegram ботом
"""
import requests
from backend.models.models import db, ClubSettings, Student, Group
from datetime import datetime, timedelta


def get_bot_token():
    """Получить токен бота из настроек"""
    settings = ClubSettings.query.first()
    if not settings:
        return None
    return settings.telegram_bot_token


def get_notification_template():
    """Получить шаблон уведомления из настроек"""
    settings = ClubSettings.query.first()
    if not settings or not settings.telegram_notification_template:
        # Шаблон по умолчанию
        return "📅 Напоминание: занятие группы {group_name} через 3 часа в {time}.\n\n{additional_text}"
    return settings.telegram_notification_template


def get_reward_template():
    """Получить шаблон уведомления о вознаграждении"""
    settings = ClubSettings.query.first()
    if not settings or not settings.telegram_reward_template:
        # Шаблон по умолчанию
        return "⭐ Вам выдано вознаграждение!\n\nТип: {reward_name}\nБаллы: +{points}\nВсего баллов за месяц: {total_points}\n\n{reason}"
    return settings.telegram_reward_template


def get_card_template():
    """Получить шаблон уведомления о карточке"""
    settings = ClubSettings.query.first()
    if not settings or not settings.telegram_card_template:
        # Шаблон по умолчанию
        return "🟨 Вам выдана карточка!\n\nТип: {card_name}\nПричина: {reason}"
    return settings.telegram_card_template


def get_payment_template():
    """Получить шаблон уведомления об оплате"""
    settings = ClubSettings.query.first()
    if not settings or not settings.telegram_payment_template:
        # Шаблон по умолчанию
        return "💳 Оплата получена!\n\nФИО: {full_name}\nДата оплаты: {payment_date}\nМесяц: {month}\nТип оплаты: {payment_type}\nСумма оплаты: {amount_paid} сум{debt_info}"
    return settings.telegram_payment_template


def send_telegram_message(chat_id, message):
    """
    Отправить сообщение в Telegram
    
    Args:
        chat_id: ID чата (telegram_chat_id ученика)
        message: Текст сообщения
    
    Returns:
        bool: True если успешно, False если ошибка
    """
    token = get_bot_token()
    if not token:
        return False, "Токен бота не настроен"
    
    if not chat_id:
        return False, "Chat ID не указан"
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    
    try:
        response = requests.post(url, json=data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                return True, "Сообщение отправлено"
            else:
                return False, result.get("description", "Ошибка отправки")
        else:
            return False, f"HTTP {response.status_code}: {response.text}"
    except requests.exceptions.RequestException as e:
        return False, f"Ошибка соединения: {str(e)}"


def format_reward_message(reward_name, points, total_points, reason=""):
    """
    Форматировать сообщение о вознаграждении
    
    Args:
        reward_name: Название вознаграждения
        points: Количество баллов
        total_points: Всего баллов за месяц
        reason: Примечание (опционально)
    
    Returns:
        str: Отформатированное сообщение
    """
    template = get_reward_template()
    
    import re
    
    # Подготовить переменные
    variables = {
        'reward_name': reward_name,
        'points': points,
        'total_points': total_points,
        'reason': reason
    }
    
    # Безопасное форматирование
    message = template
    for var_name, var_value in variables.items():
        pattern = r'\{' + re.escape(var_name) + r'\}'
        message = re.sub(pattern, str(var_value) if var_value else '', message)
    
    # Удаляем оставшиеся фигурные скобки
    message = re.sub(r'\{([^}]+)\}', r'\1', message)
    
    return message


def format_card_message(card_name, reason):
    """
    Форматировать сообщение о карточке
    
    Args:
        card_name: Название карточки
        reason: Причина выдачи
    
    Returns:
        str: Отформатированное сообщение
    """
    template = get_card_template()
    
    import re
    
    # Подготовить переменные
    variables = {
        'card_name': card_name,
        'reason': reason
    }
    
    # Безопасное форматирование
    message = template
    for var_name, var_value in variables.items():
        pattern = r'\{' + re.escape(var_name) + r'\}'
        message = re.sub(pattern, str(var_value) if var_value else '', message)
    
    # Удаляем оставшиеся фигурные скобки
    message = re.sub(r'\{([^}]+)\}', r'\1', message)
    
    return message


def send_reward_notification(student_id, reward_name, points, total_points, reason=""):
    """
    Отправить уведомление о вознаграждении ученику
    
    Args:
        student_id: ID ученика
        reward_name: Название вознаграждения
        points: Количество баллов
        total_points: Всего баллов за месяц
        reason: Примечание
    
    Returns:
        tuple: (success: bool, message: str)
    """
    student = Student.query.get(student_id)
    if not student or not student.telegram_chat_id or not student.telegram_notifications_enabled:
        return False, "Ученик не привязан к Telegram или уведомления отключены"
    
    message = format_reward_message(reward_name, points, total_points, reason)
    return send_telegram_message(student.telegram_chat_id, message)


def send_card_notification(student_id, card_name, reason):
    """
    Отправить уведомление о карточке ученику
    
    Args:
        student_id: ID ученика
        card_name: Название карточки
        reason: Причина выдачи
    
    Returns:
        tuple: (success: bool, message: str)
    """
    student = Student.query.get(student_id)
    if not student or not student.telegram_chat_id or not student.telegram_notifications_enabled:
        return False, "Ученик не привязан к Telegram или уведомления отключены"
    
    message = format_card_message(card_name, reason)
    return send_telegram_message(student.telegram_chat_id, message)


def format_notification_message(group, additional_text=""):
    """
    Форматировать сообщение уведомления по шаблону
    
    Args:
        group: Объект Group
        additional_text: Дополнительный текст (из шаблона админа)
    
    Returns:
        str: Отформатированное сообщение
    """
    template = get_notification_template()
    
    # Форматировать время занятия
    time_str = group.schedule_time.strftime("%H:%M")
    
    # Форматировать дни недели
    days_map = {1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс'}
    days_list = group.get_schedule_days_list()
    days_str = ", ".join([days_map.get(day, str(day)) for day in days_list])
    
    # Подготовить переменные для замены
    variables = {
        'group_name': group.name,
        'time': time_str,
        'days': days_str,
        'additional_text': additional_text
    }
    
    # Безопасное форматирование - заменяем только известные переменные
    import re
    
    # Найти все известные переменные и заменить их
    message = template
    for var_name, var_value in variables.items():
        # Заменяем {var_name} на значение
        pattern = r'\{' + re.escape(var_name) + r'\}'
        message = re.sub(pattern, str(var_value) if var_value else '', message)
    
    # Удаляем оставшиеся фигурные скобки (неизвестные переменные)
    # Но оставляем текст внутри скобок (например: {Привет ученики} -> Привет ученики)
    message = re.sub(r'\{([^}]+)\}', r'\1', message)
    
    return message


def send_group_notification(group_id, additional_text=""):
    """
    Отправить уведомление всем активным ученикам группы
    
    Args:
        group_id: ID группы
        additional_text: Дополнительный текст
    
    Returns:
        dict: Результат отправки {success_count, failed_count, errors}
    """
    group = Group.query.get(group_id)
    if not group:
        return {"success": False, "message": "Группа не найдена"}
    
    # Получить всех активных учеников группы с привязанным Telegram
    students = Student.query.filter_by(
        group_id=group_id,
        status='active'
    ).filter(
        Student.telegram_chat_id.isnot(None),
        Student.telegram_notifications_enabled == True
    ).all()
    
    if not students:
        return {
            "success": True,
            "message": "Нет учеников с привязанным Telegram в этой группе",
            "success_count": 0,
            "failed_count": 0
        }
    
    # Форматировать сообщение
    message = format_notification_message(group, additional_text)
    
    # Отправить каждому ученику
    success_count = 0
    failed_count = 0
    errors = []
    
    for student in students:
        success, error_msg = send_telegram_message(student.telegram_chat_id, message)
        if success:
            success_count += 1
        else:
            failed_count += 1
            errors.append(f"{student.full_name}: {error_msg}")
    
    return {
        "success": True,
        "message": f"Отправлено {success_count} из {len(students)}",
        "success_count": success_count,
        "failed_count": failed_count,
        "errors": errors
    }


def register_student_by_code(chat_id, code):
    """
    Привязать ученика к Telegram по коду
    
    Args:
        chat_id: Telegram chat ID
        code: Код привязки (A001, B002 и т.д.)
    
    Returns:
        tuple: (success: bool, message: str, student: Student or None)
    """
    if not code:
        return False, "Код не указан", None
    
    code = code.strip().upper()
    
    # Найти ученика по коду
    student = Student.query.filter_by(telegram_link_code=code).first()
    
    if not student:
        return False, "Код не найден. Проверьте правильность кода.", None
    
    # Проверить, не привязан ли уже этот chat_id к другому ученику
    existing = Student.query.filter_by(telegram_chat_id=chat_id).first()
    if existing and existing.id != student.id:
        return False, f"Этот Telegram аккаунт уже привязан к ученику: {existing.full_name}", None
    
    # Привязать
    student.telegram_chat_id = chat_id
    student.telegram_notifications_enabled = True
    
    try:
        db.session.commit()
        return True, f"✅ Ты успешно зарегистрирован, {student.full_name}! Теперь ты будешь получать уведомления о занятиях.", student
    except Exception as e:
        db.session.rollback()
        return False, f"Ошибка при регистрации: {str(e)}", None


def format_payment_message(full_name, payment_date, month, payment_type, amount_paid, debt=None):
    """
    Форматировать сообщение об оплате
    
    Args:
        full_name: ФИО ученика
        payment_date: Дата оплаты
        month: Месяц (строка вида "01/2024")
        payment_type: Тип оплаты (cash, card, click, payme, uzum)
        amount_paid: Сумма оплаты
        debt: Долг (опционально, если None - не показываем)
    
    Returns:
        str: Отформатированное сообщение
    """
    template = get_payment_template()
    
    # Форматировать тип оплаты
    payment_type_map = {
        'cash': 'Наличные',
        'card': 'Карта',
        'click': 'Click',
        'payme': 'Payme',
        'uzum': 'Uzum',
        'reminder': 'Напоминание об оплате'
    }
    payment_type_display = payment_type_map.get(payment_type, payment_type)
    
    # Форматировать дату
    if isinstance(payment_date, str):
        try:
            from datetime import datetime
            payment_date_obj = datetime.fromisoformat(payment_date.replace('Z', '+00:00'))
            payment_date_str = payment_date_obj.strftime('%d.%m.%Y')
        except:
            payment_date_str = payment_date
    else:
        payment_date_str = payment_date.strftime('%d.%m.%Y') if hasattr(payment_date, 'strftime') else str(payment_date)
    
    # Форматировать месяц
    month_names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
    try:
        if '/' in month:
            m, y = month.split('/')
            month_display = f"{month_names[int(m) - 1]} {y}"
        else:
            month_display = month
    except:
        month_display = month
    
    # Долг
    debt_info = ""
    if debt and debt > 0:
        debt_info = f"\nДолг: {debt:.0f} сум"
    
    import re
    
    # Подготовить переменные
    variables = {
        'full_name': full_name,
        'payment_date': payment_date_str,
        'month': month_display,
        'payment_type': payment_type_display,
        'amount_paid': f"{amount_paid:.0f}",
        'debt_info': debt_info
    }
    
    # Безопасное форматирование
    message = template
    for var_name, var_value in variables.items():
        pattern = r'\{' + re.escape(var_name) + r'\}'
        message = re.sub(pattern, str(var_value) if var_value else '', message)
    
    # Удаляем оставшиеся фигурные скобки
    message = re.sub(r'\{([^}]+)\}', r'\1', message)
    
    return message


def send_payment_notification(student_id, payment_date, month, payment_type, amount_paid, debt=None):
    """
    Отправить уведомление об оплате ученику
    
    Args:
        student_id: ID ученика
        payment_date: Дата оплаты
        month: Месяц (строка вида "01/2024")
        payment_type: Тип оплаты
        amount_paid: Сумма оплаты
        debt: Долг (опционально)
    
    Returns:
        tuple: (success: bool, message: str)
    """
    student = Student.query.get(student_id)
    if not student or not student.telegram_chat_id or not student.telegram_notifications_enabled:
        return False, "Ученик не привязан к Telegram или уведомления отключены"
    
    message = format_payment_message(
        full_name=student.full_name,
        payment_date=payment_date,
        month=month,
        payment_type=payment_type,
        amount_paid=amount_paid,
        debt=debt
    )
    return send_telegram_message(student.telegram_chat_id, message)


def send_monthly_payment_reminders():
    """
    Отправить уведомления об оплате в начале месяца всем ученикам, которые не оплатили
    
    Логика:
    - Отправляем только тем, кто НЕ оплатил (не отправляем тем, кто оплатил полностью или частично)
    - Отправляем только в начале месяца (1-3 число)
    - Отправляем только активным ученикам с привязанным Telegram
    
    Returns:
        dict: Результат отправки {success_count, failed_count, errors}
    """
    from datetime import date, datetime
    from backend.models.models import Payment
    
    today = date.today()
    
    # Отправляем только в начале месяца (1-3 число)
    if today.day > 3:
        return {
            "success": True,
            "message": "Отправка напоминаний только в начале месяца (1-3 число)",
            "success_count": 0,
            "failed_count": 0
        }
    
    current_month = today.month
    current_year = today.year
    
    # Получить всех активных учеников с привязанным Telegram
    students = Student.query.filter_by(
        status='active'
    ).filter(
        Student.telegram_chat_id.isnot(None),
        Student.telegram_notifications_enabled == True
    ).all()
    
    if not students:
        return {
            "success": True,
            "message": "Нет учеников с привязанным Telegram",
            "success_count": 0,
            "failed_count": 0
        }
    
    success_count = 0
    failed_count = 0
    errors = []
    
    for student in students:
        # Проверить, есть ли тариф
        if not student.tariff or not student.tariff.price:
            continue
        
        tariff_price = float(student.tariff.price)
        
        # Получить все платежи за текущий месяц
        month_payments = Payment.query.filter(
            Payment.student_id == student.id,
            Payment.payment_year == current_year,
            Payment.payment_month == current_month
        ).all()
        
        # Подсчитать сумму оплат за месяц
        total_paid = sum(p.amount_paid for p in month_payments)
        
        # Если оплатил полностью или частично - не отправляем
        if total_paid > 0:
            continue
        
        # Если не оплатил - отправляем уведомление
        debt = tariff_price
        
        # Форматировать месяц
        month_names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
        month_display = f"{month_names[current_month - 1]} {current_year}"
        month_label = f"{current_month}/{current_year}"
        
        # Отправить уведомление
        try:
            success, error_msg = send_payment_notification(
                student_id=student.id,
                payment_date=today,
                month=month_label,
                payment_type='reminder',  # Специальный тип для напоминания
                amount_paid=0,
                debt=debt
            )
            
            if success:
                success_count += 1
            else:
                failed_count += 1
                errors.append(f"{student.full_name}: {error_msg}")
        except Exception as e:
            failed_count += 1
            errors.append(f"{student.full_name}: {str(e)}")
    
    return {
        "success": True,
        "message": f"Отправлено {success_count} из {len(students)}",
        "success_count": success_count,
        "failed_count": failed_count,
        "errors": errors
    }

