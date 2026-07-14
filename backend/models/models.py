from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime, time
import json
import pytz
import secrets

# Часовой пояс Ташкента (UTC+5)
TASHKENT_TZ = pytz.timezone('Asia/Tashkent')

def get_local_datetime():
    """Получить текущий локальный datetime Ташкента (без timezone для совместимости с БД)"""
    return datetime.now(TASHKENT_TZ).replace(tzinfo=None)

def get_local_date():
    """Получить текущую локальную дату Ташкента"""
    return datetime.now(TASHKENT_TZ).date()

db = SQLAlchemy()

class User(UserMixin, db.Model):
    """Пользователи системы (администратор, финансист)"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'admin', 'financier', 'payment_admin', или 'teacher' (для обратной совместимости)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=True)  # Новая система ролей
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=True)  # Для учителей - их группа
    full_name = db.Column(db.String(200))  # Полное имя пользователя
    phone = db.Column(db.String(30))  # Телефон сотрудника
    email = db.Column(db.String(255), unique=True, nullable=True)  # Email для Google входа и восстановления
    google_sub = db.Column(db.String(255), unique=True, nullable=True)  # ID Google аккаунта
    photo_path = db.Column(db.String(300))  # Фото для Face ID / турникета
    password_reset_token_hash = db.Column(db.String(128), nullable=True)
    password_reset_expires_at = db.Column(db.DateTime, nullable=True)
    salary_type = db.Column(db.String(20), default='fixed')  # fixed | floating
    fixed_salary = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)  # Активен ли пользователь
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def has_permission(self, section, permission='view'):
        """Проверить, есть ли у пользователя право на раздел"""
        # Администратор имеет все права (проверяем как старую роль, так и роль через role_id)
        if self.role == 'admin':
            return True
        
        # Если используется новая система ролей
        if self.role_id:
            # Используем прямой SQL запрос для избежания проблем с forward references и lazy loading
            from sqlalchemy import text
            
            # Проверяем название роли
            role_result = db.session.execute(
                text("SELECT name FROM roles WHERE id = :role_id"),
                {"role_id": self.role_id}
            ).fetchone()
            
            if role_result:
                role_name = role_result[0]
                # Системные администраторы имеют полный доступ.
                if role_name in {'Администратор', 'Администратор системы', 'Superadministrator'}:
                    return True
                
                # Проверяем права роли через прямой SQL запрос
                perm_result = db.session.execute(
                    text("""
                        SELECT can_view, can_edit 
                        FROM role_permissions 
                        WHERE role_id = :role_id AND section = :section
                    """),
                    {"role_id": self.role_id, "section": section}
                ).fetchone()
                
                if perm_result:
                    can_view, can_edit = perm_result
                    if permission == 'view':
                        return bool(can_view)
                    elif permission == 'edit':
                        return bool(can_edit)
            return False
        
        # Старая система ролей (для обратной совместимости)
        if self.role == 'financier':
            return section in ['dashboard', 'finances', 'expenses', 'cash']
        elif self.role == 'teacher':
            return section in ['dashboard', 'attendance', 'camera']
        elif self.role == 'payment_admin':
            return section in ['dashboard', 'students', 'finances']
        
        return False


class Group(db.Model):
    """Группы занятий"""
    __tablename__ = 'groups'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # Например: "Группа 1", "Младшая"
    schedule_time = db.Column(db.String(500), nullable=False)  # Время занятия: "13:00" или JSON {"1":"14:00","3":"15:00"}
    duration_minutes = db.Column(db.Integer, default=60)  # Длительность занятия в минутах
    schedule_days = db.Column(db.String(50))  # Дни недели в формате "1,3,5" (Пн, Ср, Пт)
    late_threshold = db.Column(db.Integer, default=15)  # Опоздание в минутах
    max_students = db.Column(db.Integer)  # Максимальное количество учеников
    field_blocks = db.Column(db.Integer, default=1)  # Количество блоков поля, которые занимает группа
    field_block_indices = db.Column(db.Text)  # Индексы блоков поля (JSON-массив, напр. [0,1,2])
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Связи
    students = db.relationship('Student', backref='group', lazy=True)
    trainer_links = db.relationship('GroupTrainer', backref='group', lazy=True, cascade='all, delete-orphan')
    
    def get_schedule_days_list(self):
        """Получить список дней недели (1=Пн, 7=Вс)"""
        if self.schedule_days:
            return [int(d) for d in self.schedule_days.split(',') if d]
        return []
    
    def set_schedule_days_list(self, days_list):
        """Сохранить список дней недели"""
        self.schedule_days = ','.join(map(str, sorted(days_list)))

    def get_field_block_indices(self):
        """Получить список индексов блоков поля, которые занимает группа"""
        if not self.field_block_indices:
            # Если нет сохранённых индексов, считаем, что заняты первые field_blocks блоков
            return list(range(self.field_blocks or 0))
        try:
            data = json.loads(self.field_block_indices)
            return [int(i) for i in data]
        except Exception:
            return list(range(self.field_blocks or 0))

    def set_field_block_indices(self, indices):
        """Сохранить индексы блоков поля как JSON"""
        if not indices:
            self.field_block_indices = None
            self.field_blocks = 0
            return
        sorted_indices = sorted(set(int(i) for i in indices))
        self.field_block_indices = json.dumps(sorted_indices, ensure_ascii=False)
        self.field_blocks = len(sorted_indices)

    def is_full(self):
        """Проверить, заполнена ли группа"""
        if not self.max_students:
            return False
        active_students = sum(1 for s in self.students if s.status == 'active')
        return active_students >= self.max_students
    
    def get_current_students_count(self):
        """Получить текущее количество активных учеников"""
        return sum(1 for s in self.students if s.status == 'active')

    def get_schedule_time_for_day(self, day):
        """Получить время занятия для конкретного дня"""
        try:
            time_map = json.loads(self.schedule_time)
            if isinstance(time_map, dict):
                return time_map.get(str(day), list(time_map.values())[0] if time_map else None)
        except (json.JSONDecodeError, ValueError):
            pass
        return self.schedule_time

    def get_schedule_time_map(self):
        """Получить словарь {день: время} или None если одно время для всех"""
        try:
            time_map = json.loads(self.schedule_time)
            if isinstance(time_map, dict):
                return {int(k): v for k, v in time_map.items()}
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    def get_schedule_days_display(self):
        days_map = {
            1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс'
        }
        return ', '.join(days_map.get(day, str(day)) for day in self.get_schedule_days_list())
    
    def __repr__(self):
        return f'<Group {self.name} at {self.schedule_time}>'


class GroupTrainer(db.Model):
    """Закрепление тренеров и помощников за группами"""
    __tablename__ = 'group_trainers'
    __table_args__ = (
        db.UniqueConstraint('group_id', 'user_id', name='uq_group_trainer_user'),
    )

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='primary')  # primary | assistant
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('trainer_group_links', lazy=True, cascade='all, delete-orphan'))

    def __repr__(self):
        return f'<GroupTrainer group={self.group_id} user={self.user_id} role={self.role}>'


class Tariff(db.Model):
    """Тарифные планы"""
    __tablename__ = 'tariffs'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)  # "Тариф 8 занятий"
    lessons_count = db.Column(db.Integer, nullable=False)  # Количество занятий
    price = db.Column(db.Float, nullable=False)  # Стоимость тарифа
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<Tariff {self.name}: {self.lessons_count} lessons for {self.price}>'


class Student(db.Model):
    """Ученики футбольной школы"""
    __tablename__ = 'students'
    
    id = db.Column(db.Integer, primary_key=True)
    student_number = db.Column(db.String(20), nullable=False)  # Номер ученика (уникален только в рамках группы, 0-99)
    school_number = db.Column(db.String(100))  # Номер школы
    full_name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(20))
    parent_phone = db.Column(db.String(20))
    photo_path = db.Column(db.String(300))
    face_encoding = db.Column(db.Text)  # JSON строка с encoding лица
    balance = db.Column(db.Integer, default=0)  # Оставшиеся занятия
    tariff_type = db.Column(db.String(50))  # Например: "8 занятий"
    tariff_id = db.Column(db.Integer, db.ForeignKey('tariffs.id'), nullable=True)  # Связь с тарифом
    status = db.Column(db.String(20), default='active')  # active, inactive, blacklist
    blacklist_reason = db.Column(db.Text)  # Причина добавления в чёрный список
    admission_date = db.Column(db.Date)  # Дата принятия в клуб
    
    # Группа
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=True)
    
    # Telegram
    telegram_link_code = db.Column(db.String(10), unique=True, nullable=True)  # Уникальный код для привязки Telegram (A001, A002...)
    telegram_chat_id = db.Column(db.BigInteger, nullable=True)  # Chat ID в Telegram
    telegram_notifications_enabled = db.Column(db.Boolean, default=True)  # Включены ли уведомления
    
    # Адрес
    city = db.Column(db.String(100))
    district = db.Column(db.String(100))
    street = db.Column(db.String(200))
    house_number = db.Column(db.String(50))
    
    # Паспортные данные
    birth_year = db.Column(db.Integer)
    passport_series = db.Column(db.String(10))
    passport_number = db.Column(db.String(20))
    passport_issued_by = db.Column(db.String(200))
    passport_issue_date = db.Column(db.Date)
    passport_expiry_date = db.Column(db.Date)
    
    # Финансирование
    club_funded = db.Column(db.Boolean, default=False)  # Финансирование за счёт клуба
    
    # Физические параметры
    height = db.Column(db.Integer)  # Рост в см
    weight = db.Column(db.Float)  # Вес в кг
    dominant_side = db.Column(db.String(10))  # Ведущая сторона: right/left
    jersey_size = db.Column(db.String(20))  # Размер футболки (XS, S, M, L, XL и т.д.)
    shorts_size = db.Column(db.String(20))  # Размер шорт
    boots_size = db.Column(db.String(20))  # Размер бутс
    equipment_notes = db.Column(db.Text)  # Дополнительные заметки по снаряжению
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Связи
    payments = db.relationship('Payment', backref='student', lazy=True, cascade='all, delete-orphan')
    attendances = db.relationship('Attendance', backref='student', lazy=True, cascade='all, delete-orphan')
    tariff = db.relationship('Tariff', backref='students', lazy=True)
    
    def get_face_encoding(self):
        """Получить face encoding как numpy array"""
        if self.face_encoding:
            return json.loads(self.face_encoding)
        return None
    
    def set_face_encoding(self, encoding):
        """Сохранить face encoding"""
        if encoding is not None:
            self.face_encoding = json.dumps(encoding.tolist())
    
    def __repr__(self):
        return f'<Student {self.full_name}>'


class Payment(db.Model):
    """Платежи учеников"""
    __tablename__ = 'payments'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    tariff_id = db.Column(db.Integer, db.ForeignKey('tariffs.id'), nullable=True)  # Связь с тарифом
    amount_paid = db.Column(db.Float, nullable=False)  # Сколько заплатил ученик
    amount_due = db.Column(db.Float, default=0)  # Сколько осталось доплатить (долг)
    lessons_added = db.Column(db.Integer, nullable=False)  # Сколько занятий добавлено
    is_full_payment = db.Column(db.Boolean, default=True)  # Полная оплата или частичная
    payment_date = db.Column(db.DateTime, default=get_local_datetime)
    # Момент внесения записи в CRM. Не путать с payment_date, которую выбирает кассир.
    created_at = db.Column(db.DateTime, default=get_local_datetime, index=True)
    tariff_name = db.Column(db.String(100))  # Дублируем название тарифа для истории
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    
    # Для помесячной системы оплаты
    payment_month = db.Column(db.Integer)  # Месяц оплаты (1-12)
    payment_year = db.Column(db.Integer)  # Год оплаты
    payment_type = db.Column(db.String(20), default='cash')  # Тип оплаты: cash, card, click, payme, uzum
    
    # Связь с тарифом
    tariff = db.relationship('Tariff', foreign_keys=[tariff_id])
    
    def __repr__(self):
        return f'<Payment {self.amount_paid} for Student {self.student_id}>'


class Attendance(db.Model):
    """Посещаемость"""
    __tablename__ = 'attendance'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    check_in = db.Column(db.DateTime, default=get_local_datetime)
    check_out = db.Column(db.DateTime, nullable=True)
    date = db.Column(db.Date, default=get_local_date)
    lesson_deducted = db.Column(db.Boolean, default=False)  # Списано ли занятие
    is_late = db.Column(db.Boolean, default=False)  # Опоздал ли ученик
    late_minutes = db.Column(db.Integer, default=0)  # На сколько минут опоздал
    
    def __repr__(self):
        return f'<Attendance Student {self.student_id} on {self.date}>'


class AccessLog(db.Model):
    """Журнал проходов через Face ID / турникет."""
    __tablename__ = 'access_logs'

    id = db.Column(db.Integer, primary_key=True)
    event_uid = db.Column(db.String(160), unique=True, nullable=True, index=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=True, index=True)
    attendance_id = db.Column(db.Integer, db.ForeignKey('attendance.id'), nullable=True)
    person_type = db.Column(db.String(20), default='student')  # student, staff, unknown
    employee_no = db.Column(db.String(40), nullable=True, index=True)
    full_name = db.Column(db.String(200), nullable=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=True)
    group_name = db.Column(db.String(100), nullable=True)
    direction = db.Column(db.String(10), nullable=False, index=True)  # entry, exit
    device_name = db.Column(db.String(80), nullable=True)
    device_ip = db.Column(db.String(80), nullable=True)
    event_time = db.Column(db.DateTime, default=get_local_datetime, index=True)
    event_date = db.Column(db.Date, default=get_local_date, index=True)
    result = db.Column(db.String(30), default='granted')  # granted, denied, error
    source = db.Column(db.String(40), default='hikvision')
    face_verification_status = db.Column(db.String(24), nullable=True)
    face_similarity = db.Column(db.Float, nullable=True)
    face_verification_reason = db.Column(db.String(300), nullable=True)
    face_verified_at = db.Column(db.DateTime, nullable=True)
    raw_event = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)

    student = db.relationship('Student', foreign_keys=[student_id], lazy=True)
    attendance = db.relationship('Attendance', foreign_keys=[attendance_id], lazy=True)
    group = db.relationship('Group', foreign_keys=[group_id], lazy=True)

    def set_raw_event(self, value):
        self.raw_event = json.dumps(value or {}, ensure_ascii=False)

    def get_raw_event(self):
        if not self.raw_event:
            return {}
        try:
            return json.loads(self.raw_event)
        except Exception:
            return {}

    def __repr__(self):
        return f'<AccessLog {self.direction} {self.employee_no} at {self.event_time}>'


class DeviceCommand(db.Model):
    """Команды для локального bridge Hikvision."""
    __tablename__ = 'device_commands'

    id = db.Column(db.Integer, primary_key=True)
    command = db.Column(db.String(50), nullable=False)
    payload = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='pending', index=True)
    result = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime, index=True)
    picked_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)

    def get_payload(self):
        if not self.payload:
            return {}
        try:
            return json.loads(self.payload)
        except Exception:
            return {}

    def set_payload(self, payload):
        self.payload = json.dumps(payload or {}, ensure_ascii=False)


class BridgeStatus(db.Model):
    """Live-состояние локального Hikvision bridge."""
    __tablename__ = 'bridge_status'

    id = db.Column(db.Integer, primary_key=True)
    bridge_id = db.Column(db.String(80), unique=True, nullable=False, default='hikvision-school-bridge')
    status = db.Column(db.String(30), default='offline')
    host = db.Column(db.String(120), nullable=True)
    pid = db.Column(db.Integer, nullable=True)
    version = db.Column(db.String(50), nullable=True)
    uptime_seconds = db.Column(db.Integer, default=0)
    current_command_id = db.Column(db.Integer, nullable=True)
    current_action = db.Column(db.String(200), nullable=True)
    metrics = db.Column(db.Text, nullable=True)
    logs = db.Column(db.Text, nullable=True)
    last_seen_at = db.Column(db.DateTime, nullable=True, index=True)
    updated_at = db.Column(db.DateTime, default=get_local_datetime, onupdate=get_local_datetime)

    def get_metrics(self):
        if not self.metrics:
            return {}
        try:
            return json.loads(self.metrics)
        except Exception:
            return {}

    def set_metrics(self, value):
        self.metrics = json.dumps(value or {}, ensure_ascii=False)

    def get_logs(self):
        if not self.logs:
            return []
        try:
            data = json.loads(self.logs)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def set_logs(self, lines):
        self.logs = json.dumps((lines or [])[-500:], ensure_ascii=False)


class Expense(db.Model):
    """Расходы школы"""
    __tablename__ = 'expenses'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(100), nullable=False)  # аренда, зарплата, оборудование
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text)
    expense_date = db.Column(db.DateTime, default=get_local_datetime)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    expense_source = db.Column(db.String(50), default='cash')  # cash | bank
    employee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    employee_name = db.Column(db.String(200), nullable=True)
    salary_year = db.Column(db.Integer, nullable=True)
    salary_month = db.Column(db.Integer, nullable=True)
    
    def __repr__(self):
        return f'<Expense {self.category} {self.amount}>'


class ClubSettings(db.Model):
    """Настройки клуба (рабочие часы и вместимость поля)"""
    __tablename__ = 'club_settings'

    id = db.Column(db.Integer, primary_key=True)
    system_name = db.Column(db.String(200), default='FK QORASUV')
    logo_path = db.Column(db.String(300), nullable=True)
    square_logo_path = db.Column(db.String(300), nullable=True)
    working_days = db.Column(db.String(50), default='1,2,3,4,5')  # Дни недели, когда клуб работает
    work_start_time = db.Column(db.Time, default=time(9, 0))
    work_end_time = db.Column(db.Time, default=time(21, 0))
    max_groups_per_slot = db.Column(db.Integer, default=4)
    block_future_payments = db.Column(db.Boolean, default=False)  # Запрет оплаты за будущие месяцы
    rewards_reset_period_months = db.Column(db.Integer, default=1)  # Период сброса вознаграждений (1-12 месяцев)
    podium_display_count = db.Column(db.Integer, default=20)  # Количество учеников для отображения в пьедестале (5-50 с шагом 5)
    telegram_bot_url = db.Column(db.String(300), nullable=True)  # Ссылка/username Telegram-бота для портала
    telegram_bot_token = db.Column(db.String(200), nullable=True)  # Токен Telegram бота
    
    # Контакты руководства для уведомлений
    director_phone = db.Column(db.String(20))
    founder_phone = db.Column(db.String(20))
    cashier_phone = db.Column(db.String(20))
    
    # Telegram ID руководства (заполняются автоматически ботом)
    director_chat_id = db.Column(db.String(50))
    founder_chat_id = db.Column(db.String(50))
    cashier_chat_id = db.Column(db.String(50), nullable=True)
    telegram_notification_template = db.Column(db.Text, nullable=True)  # Шаблон уведомления о занятии
    telegram_reward_template = db.Column(db.Text, nullable=True)  # Шаблон уведомления о вознаграждении
    telegram_card_template = db.Column(db.Text, nullable=True)  # Шаблон уведомления о карточке
    telegram_payment_template = db.Column(db.Text, nullable=True)  # Шаблон уведомления об оплате
    rtsp_url = db.Column(db.String(300), nullable=True)  # URL RTSP камеры
    payment_click_enabled = db.Column(db.Boolean, default=False)  # Включен Click
    payment_click_qr_url = db.Column(db.String(500), nullable=True)  # QR для Click
    payment_payme_enabled = db.Column(db.Boolean, default=False)  # Включен Payme
    payment_payme_qr_url = db.Column(db.String(500), nullable=True)  # QR для Payme
    payment_uzum_enabled = db.Column(db.Boolean, default=False)  # Включен Uzum
    payment_uzum_qr_url = db.Column(db.String(500), nullable=True)  # QR для Uzum
    payment_uzcard_enabled = db.Column(db.Boolean, default=False)  # Включен UZCARD
    payment_humo_enabled = db.Column(db.Boolean, default=False)  # Включен HUMO
    payment_paynet_enabled = db.Column(db.Boolean, default=False)  # Включен Paynet
    payment_paynet_qr_url = db.Column(db.String(500), nullable=True)  # QR для Paynet
    payment_multicard_enabled = db.Column(db.Boolean, default=False)  # Включен Multicard
    payment_multicard_qr_url = db.Column(db.String(500), nullable=True)  # QR для Multicard
    payment_oson_enabled = db.Column(db.Boolean, default=False)  # Включен Oson
    payment_oson_qr_url = db.Column(db.String(500), nullable=True)  # QR для Oson
    payment_transfer_enabled = db.Column(db.Boolean, default=False)  # Включен Перечисление
    payment_provider_configs = db.Column(db.Text, nullable=True)  # JSON-конфиг API/sandbox для платежных провайдеров
    expense_categories = db.Column(db.Text, nullable=True)  # JSON-массив статей расхода
    service_controls = db.Column(db.Text, nullable=True)  # JSON-конфиг включения/выключения сервисов
    access_block_day = db.Column(db.Integer, default=10)  # День месяца, с которого долг блокирует доступ
    access_debt_start_year = db.Column(db.Integer, nullable=True)  # С какого года учитывать долг для доступа
    access_debt_start_month = db.Column(db.Integer, nullable=True)  # С какого месяца учитывать долг для доступа
    access_max_debt_months = db.Column(db.Integer, default=0)  # Лимит старых долгов для режима с долгами; 0 = не используется
    access_payment_policy = db.Column(db.String(40), default='partial_current_month')  # Правило допуска по оплате
    hikvision_daily_sync_time = db.Column(db.String(5), default='03:00')  # Время полной синхронизации HH:MM (Asia/Tashkent)
    hikvision_device_key = db.Column(db.String(120), nullable=True)  # Ключ локального bridge
    hikvision_devices = db.Column(db.Text, nullable=True)  # JSON-массив терминалов Hikvision
    hikvision_parallel_devices = db.Column(db.Boolean, default=False)  # Писать вход/выход параллельно
    hikvision_cleanup_stale_users = db.Column(db.Boolean, default=True)  # Удалять из терминалов лишние записи

    def get_working_days_list(self):
        if self.working_days:
            return [int(d) for d in self.working_days.split(',') if d]
        return []

    def set_working_days_list(self, days_list):
        self.working_days = ','.join(map(str, sorted(days_list)))

    def ensure_hikvision_device_key(self):
        if not self.hikvision_device_key:
            self.hikvision_device_key = secrets.token_hex(24)
        return self.hikvision_device_key

    def get_hikvision_devices(self):
        if not self.hikvision_devices:
            return []
        try:
            data = json.loads(self.hikvision_devices)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def set_hikvision_devices(self, devices):
        clean = []
        for item in devices or []:
            if not isinstance(item, dict):
                continue
            ip = str(item.get('ip') or '').strip()
            if not ip:
                continue
            clean.append({
                'name': str(item.get('name') or '').strip() or f'terminal{len(clean) + 1}',
                'ip': ip,
                'protocol': str(item.get('protocol') or 'https').strip().lower(),
                'port': int(item.get('port') or 443),
                'doorNo': int(item.get('doorNo') or 1),
            })
        self.hikvision_devices = json.dumps(clean, ensure_ascii=False) if clean else None

    def get_payment_provider_configs(self):
        if not self.payment_provider_configs:
            return {}
        try:
            data = json.loads(self.payment_provider_configs)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def set_payment_provider_configs(self, configs):
        self.payment_provider_configs = json.dumps(configs or {}, ensure_ascii=False) if configs else None


class RewardType(db.Model):
    """Типы вознаграждений"""
    __tablename__ = 'reward_types'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)  # Название вознаграждения (например, "Дисциплина")
    points = db.Column(db.Integer, nullable=False, default=1)  # Количество баллов
    description = db.Column(db.Text)  # Описание (опционально)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=get_local_datetime, onupdate=get_local_datetime)
    
    def __repr__(self):
        return f'<RewardType {self.name}: {self.points} баллов>'


class StudentReward(db.Model):
    """Выданные вознаграждения ученикам"""
    __tablename__ = 'student_rewards'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    reward_type_id = db.Column(db.Integer, db.ForeignKey('reward_types.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)  # Количество баллов (копия из reward_type для истории)
    reward_name = db.Column(db.String(200), nullable=False)  # Название вознаграждения (копия для истории)
    issued_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Кто выдал
    issued_at = db.Column(db.DateTime, default=datetime.utcnow)
    month = db.Column(db.Integer, nullable=False)  # Месяц выдачи (1-12)
    year = db.Column(db.Integer, nullable=False)  # Год выдачи
    
    # Связи
    student = db.relationship('Student', backref='rewards')
    reward_type = db.relationship('RewardType')
    issuer = db.relationship('User')
    
    def __repr__(self):
        return f'<StudentReward Student {self.student_id}: {self.points} баллов за {self.reward_name}>'


class CardType(db.Model):
    """Типы карточек"""
    __tablename__ = 'card_types'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)  # Название (например, "Желтая", "Красная")
    color = db.Column(db.String(20), nullable=False)  # Цвет карточки (yellow, red, orange и т.д.)
    description = db.Column(db.Text)  # Описание
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<CardType {self.name}>'


class StudentCard(db.Model):
    """Выданные карточки ученикам"""
    __tablename__ = 'student_cards'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    card_type_id = db.Column(db.Integer, db.ForeignKey('card_types.id'), nullable=False)
    reason = db.Column(db.Text, nullable=False)  # Причина выдачи
    issued_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Кто выдал
    issued_at = db.Column(db.DateTime, default=datetime.utcnow)
    removed_at = db.Column(db.DateTime, nullable=True)  # Когда снята
    removed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Кто снял
    is_active = db.Column(db.Boolean, default=True)  # Активна ли карточка (не снята)
    
    # Связи
    student = db.relationship('Student', backref='cards')
    card_type = db.relationship('CardType')
    issuer_user = db.relationship('User', foreign_keys=[issued_by])
    remover_user = db.relationship('User', foreign_keys=[removed_by])
    
    def __repr__(self):
        return f'<StudentCard Student {self.student_id}: {self.card_type.name} - {"Active" if self.is_active else "Removed"}>'


class Tournament(db.Model):
    """Турниры и внутренние соревнования клуба"""
    __tablename__ = 'tournaments'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    season = db.Column(db.String(80), nullable=True)
    location = db.Column(db.String(200), nullable=True)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(30), default='planned')  # planned, active, finished
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)
    updated_at = db.Column(db.DateTime, default=get_local_datetime, onupdate=get_local_datetime)

    creator = db.relationship('User', foreign_keys=[created_by])
    matches = db.relationship('TournamentMatch', backref='tournament', lazy=True, cascade='all, delete-orphan')
    teams = db.relationship('TournamentTeam', backref='tournament', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Tournament {self.name}>'


class TournamentTeam(db.Model):
    """Команда-участник турнира: наша, сборная из групп или внешняя команда"""
    __tablename__ = 'tournament_teams'

    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournaments.id'), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    team_type = db.Column(db.String(20), default='internal')  # internal, external
    logo_path = db.Column(db.String(300), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)
    updated_at = db.Column(db.DateTime, default=get_local_datetime, onupdate=get_local_datetime)

    source_groups = db.relationship('TournamentTeamSourceGroup', backref='team', lazy=True, cascade='all, delete-orphan')
    players = db.relationship('TournamentTeamPlayer', backref='team', lazy=True, cascade='all, delete-orphan')
    external_players = db.relationship('TournamentExternalPlayer', backref='team', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<TournamentTeam {self.name}>'


class TournamentTeamSourceGroup(db.Model):
    """Группы-источники, из которых собирается команда турнира"""
    __tablename__ = 'tournament_team_source_groups'
    __table_args__ = (
        db.UniqueConstraint('team_id', 'group_id', name='uq_tournament_team_source_group'),
    )

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('tournament_teams.id'), nullable=False, index=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=False, index=True)

    group = db.relationship('Group', foreign_keys=[group_id])


class TournamentTeamPlayer(db.Model):
    """Игрок из базы школы, заявленный за команду турнира"""
    __tablename__ = 'tournament_team_players'
    __table_args__ = (
        db.UniqueConstraint('team_id', 'student_id', name='uq_tournament_team_player'),
    )

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('tournament_teams.id'), nullable=False, index=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False, index=True)
    shirt_number = db.Column(db.String(10), nullable=True)
    position = db.Column(db.String(30), nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)

    student = db.relationship('Student', foreign_keys=[student_id])


class TournamentExternalPlayer(db.Model):
    """Игрок внешней команды, существующий только внутри турнира"""
    __tablename__ = 'tournament_external_players'

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('tournament_teams.id'), nullable=False, index=True)
    full_name = db.Column(db.String(200), nullable=False)
    shirt_number = db.Column(db.String(10), nullable=True)
    position = db.Column(db.String(30), nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)


class TournamentMatch(db.Model):
    """Матчи в рамках турнира"""
    __tablename__ = 'tournament_matches'

    id = db.Column(db.Integer, primary_key=True)
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournaments.id'), nullable=False, index=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id'), nullable=True, index=True)
    home_team_id = db.Column(db.Integer, db.ForeignKey('tournament_teams.id'), nullable=True, index=True)
    away_team_id = db.Column(db.Integer, db.ForeignKey('tournament_teams.id'), nullable=True, index=True)
    match_date = db.Column(db.DateTime, nullable=True)
    home_team = db.Column(db.String(160), nullable=False, default='Наша команда')
    away_team = db.Column(db.String(160), nullable=False, default='Соперник')
    home_score = db.Column(db.Integer, default=0)
    away_score = db.Column(db.Integer, default=0)
    status = db.Column(db.String(30), default='scheduled')  # scheduled, live, finished
    round_name = db.Column(db.String(80), nullable=True)  # group, quarterfinal, semifinal, final
    bracket_side = db.Column(db.String(20), nullable=True)  # left, right, center
    bracket_order = db.Column(db.Integer, default=0)
    formation = db.Column(db.String(20), default='4-3-3')
    venue = db.Column(db.String(200), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)
    updated_at = db.Column(db.DateTime, default=get_local_datetime, onupdate=get_local_datetime)

    group = db.relationship('Group', foreign_keys=[group_id])
    home_team_ref = db.relationship('TournamentTeam', foreign_keys=[home_team_id])
    away_team_ref = db.relationship('TournamentTeam', foreign_keys=[away_team_id])
    lineups = db.relationship('TournamentLineup', backref='match', lazy=True, cascade='all, delete-orphan')
    events = db.relationship('TournamentEvent', backref='match', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<TournamentMatch {self.home_team} - {self.away_team}>'


class TournamentLineup(db.Model):
    """Расстановка игроков по позициям на матч"""
    __tablename__ = 'tournament_lineups'
    __table_args__ = (
        db.UniqueConstraint('match_id', 'student_id', 'team_side', name='uq_tournament_lineup_player_side'),
    )

    id = db.Column(db.Integer, primary_key=True)
    match_id = db.Column(db.Integer, db.ForeignKey('tournament_matches.id'), nullable=False, index=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False, index=True)
    team_side = db.Column(db.String(10), default='home')  # home, away
    position = db.Column(db.String(30), nullable=False, default='Игрок')
    shirt_number = db.Column(db.String(10), nullable=True)
    is_starter = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=get_local_datetime)

    student = db.relationship('Student', foreign_keys=[student_id])

    def __repr__(self):
        return f'<TournamentLineup match={self.match_id} student={self.student_id}>'


class TournamentEvent(db.Model):
    """События матча: голы, карточки, заметки"""
    __tablename__ = 'tournament_events'

    id = db.Column(db.Integer, primary_key=True)
    match_id = db.Column(db.Integer, db.ForeignKey('tournament_matches.id'), nullable=False, index=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=True, index=True)
    assist_student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=True)
    external_player_id = db.Column(db.Integer, db.ForeignKey('tournament_external_players.id'), nullable=True, index=True)
    external_assist_player_id = db.Column(db.Integer, db.ForeignKey('tournament_external_players.id'), nullable=True)
    event_type = db.Column(db.String(30), nullable=False)  # goal, card
    team_side = db.Column(db.String(10), default='home')
    half = db.Column(db.Integer, default=1)
    minute = db.Column(db.Integer, nullable=False, default=1)
    card_color = db.Column(db.String(20), nullable=True)  # yellow, red
    note = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=get_local_datetime)

    student = db.relationship('Student', foreign_keys=[student_id])
    assist_student = db.relationship('Student', foreign_keys=[assist_student_id])
    external_player = db.relationship('TournamentExternalPlayer', foreign_keys=[external_player_id])
    external_assist_player = db.relationship('TournamentExternalPlayer', foreign_keys=[external_assist_player_id])
    creator = db.relationship('User', foreign_keys=[created_by])

    def __repr__(self):
        return f'<TournamentEvent {self.event_type} {self.minute}>'


class CashTransfer(db.Model):
    """Передача денег из кассы управляющему"""
    __tablename__ = 'cash_transfers'
    
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)  # Сумма передачи
    recipient = db.Column(db.String(200), nullable=False)  # Кому передано
    transfer_date = db.Column(db.DateTime, nullable=False)  # Дата передачи
    notes = db.Column(db.Text)  # Примечания
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))  # Кто создал запись
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=get_local_datetime, onupdate=get_local_datetime)
    
    # Связи
    creator = db.relationship('User')
    
    def __repr__(self):
        return f'<CashTransfer {self.amount} to {self.recipient} on {self.transfer_date}>'


class Role(db.Model):
    """Роли пользователей"""
    __tablename__ = 'roles'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)  # Название роли
    description = db.Column(db.Text)  # Описание роли
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Связи
    users = db.relationship('User', backref='role_obj', lazy=True)
    permissions = db.relationship('RolePermission', backref='role', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Role {self.name}>'


class RolePermission(db.Model):
    """Права доступа ролей к разделам"""
    __tablename__ = 'role_permissions'
    
    id = db.Column(db.Integer, primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    section = db.Column(db.String(50), nullable=False)  # Раздел: dashboard, students, groups, etc.
    can_view = db.Column(db.Boolean, default=True)  # Право просмотра
    can_edit = db.Column(db.Boolean, default=False)  # Право редактирования
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Уникальность: одна роль - один раздел
    __table_args__ = (db.UniqueConstraint('role_id', 'section', name='unique_role_section'),)
    
    def __repr__(self):
        return f'<RolePermission Role {self.role_id} Section {self.section}>'
