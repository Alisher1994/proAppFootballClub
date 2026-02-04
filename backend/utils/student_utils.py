"""
Утилиты для работы с учениками
"""
from backend.models.models import db, Student
import string


def generate_telegram_link_code():
    """
    Генерирует уникальный 4-значный код для привязки Telegram
    Формат: A001, A002...A999, B001...B999, C001...C999 и т.д.
    """
    letters = string.ascii_uppercase  # A-Z
    used_codes = set(
        db.session.query(Student.telegram_link_code)
        .filter(Student.telegram_link_code.isnot(None))
        .all()
    )
    used_codes = {code[0] for code in used_codes if code[0]}
    
    # Перебираем буквы и номера
    for letter in letters:
        for num in range(1, 1000):  # 001-999
            code = f"{letter}{num:03d}"  # A001, A002, ..., A999
            if code not in used_codes:
                return code
    
    # Если все коды заняты (маловероятно), начинаем с AA001, AB001 и т.д.
    for letter1 in letters:
        for letter2 in letters:
            for num in range(1, 1000):
                code = f"{letter1}{letter2}{num:03d}"
                if code not in used_codes:
                    return code
    
    # В крайнем случае возвращаем случайный код
    import random
    return f"{random.choice(letters)}{random.randint(1, 999):03d}"


def get_next_available_student_number(group_id):
    """
    Получить следующий доступный номер ученика для группы (0-99)
    Номера должны быть уникальными только в рамках группы
    """
    if not group_id:
        return "1"
    
    # Получить все занятые номера в этой группе
    used_numbers = db.session.query(Student.student_number).filter(
        Student.group_id == group_id,
        Student.status == 'active'
    ).all()
    
    used_numbers = {int(num[0]) for num in used_numbers if num[0] and num[0].isdigit()}
    
    # Найти первый свободный номер от 1 до 99
    for num in range(1, 100):
        if num not in used_numbers:
            return str(num)
    
    # Если все номера заняты, возвращаем 99 (максимум)
    return "99"


def validate_student_number(student_number, group_id, exclude_student_id=None):
    """
    Валидация номера ученика:
    - Только цифры
    - От 0 до 99
    - Уникален только в рамках группы
    """
    if not student_number:
        return False, "Номер ученика обязателен"
    
    # Проверка: только цифры
    if not student_number.isdigit():
        return False, "Номер ученика должен содержать только цифры"
    
    # Проверка: диапазон 0-99
    num = int(student_number)
    if num < 0 or num > 99:
        return False, "Номер ученика должен быть от 0 до 99"
    
    # Проверка уникальности в группе
    if group_id:
        query = Student.query.filter_by(
            student_number=student_number,
            group_id=group_id
        )
        if exclude_student_id:
            query = query.filter(Student.id != exclude_student_id)
        
        existing = query.first()
        if existing:
            return False, f"Номер {student_number} уже занят в этой группе"
    
    return True, ""


def ensure_student_has_telegram_code(student):
    """
    Убедиться, что у ученика есть код для Telegram
    Если нет - сгенерировать
    """
    if not student.telegram_link_code:
        student.telegram_link_code = generate_telegram_link_code()
        db.session.commit()
    return student.telegram_link_code




