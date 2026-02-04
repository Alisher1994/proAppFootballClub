import os
import json
import shutil
import threading
import time
import queue
import requests
import cv2
import numpy as np
from datetime import datetime, timedelta, date, timezone
from datetime import time as dt_time
from flask import Flask, render_template, request, redirect, url_for, jsonify, send_from_directory, send_file, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import func, or_
import pytz
from PIL import Image, ImageDraw, ImageFont
import psutil
try:
    import pynvml
    pynvml.nvmlInit()
    NVML_ENABLED = True
except Exception:
    NVML_ENABLED = False

if os.name == 'nt':
    paths_to_add = [
        r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin",
        r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\libnvvp",
        r"C:\Program Files\NVIDIA\CUDNN\v9.18\bin\12.9\x64",
        r"C:\Program Files\NVIDIA\CUDNN\v9.18\bin",
        r"C:\Program Files\NVIDIA\CUDNN\v9.1\bin",
        r"C:\NVIDIA\CUDNN\v9.18\bin\12.9\x64", # На всякий случай
        os.environ.get('CUDA_PATH_V12_4', ''),
        os.environ.get('CUDA_PATH', '')
    ]
    for p in paths_to_add:
        if p and os.path.exists(p):
            try:
                os.add_dll_directory(p)
                os.environ['PATH'] = p + os.pathsep + os.environ.get('PATH', '')
                print(f"✅ Путь добавлен: {p}")
            except Exception: pass

# Отключаем лишние логи OpenCV и FFmpeg (убираем ошибки HEVC)
os.environ['OPENCV_LOG_LEVEL'] = 'ERROR'
os.environ['FFMPEG_LOG_LEVEL'] = 'quiet'
# Форсируем использование CUDA/TensorRT в ONNX
os.environ['ORT_TENSORRT_FP16_ENABLE'] = '1'

from backend.models.models import db, User, Student, Payment, Attendance, Expense, Group, Tariff, ClubSettings, RewardType, StudentReward, CashTransfer, Role, RolePermission, CardType, StudentCard
# Face recognition permanently disabled per client; keep dummy service only.
USE_FACE = False
from backend.services.face_stub import DummyFaceService as FaceService
from backend.data.locations import get_cities, get_districts
from backend.utils.student_utils import (
    generate_telegram_link_code,
    get_next_available_student_number,
    validate_student_number,
    ensure_student_has_telegram_code
)
from backend.services.telegram_service import (
    send_group_notification,
    register_student_by_code,
    send_reward_notification,
    send_card_notification,
    send_payment_notification,
    send_monthly_payment_reminders
)

# Часовой пояс Ташкента (UTC+5)
TASHKENT_TZ = pytz.timezone('Asia/Tashkent')

def get_local_time():
    """Получить текущее локальное время Ташкента"""
    return datetime.now(TASHKENT_TZ)

def get_local_date():
    """Получить текущую локальную дату Ташкента"""
    return get_local_time().date()

def get_local_datetime():
    """Получить текущий локальный datetime Ташкента (без timezone для совместимости с БД)"""
    return get_local_time().replace(tzinfo=None)

# Получить абсолютный путь к папке проекта
basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__, 
            template_folder='frontend/templates',
            static_folder='frontend/static')

# Конфигурация для production/development
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')

# PostgreSQL URL для Railway (автоматически устанавливается)
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Railway PostgreSQL использует postgres://, но SQLAlchemy требует postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    print(f"✅ ИСПОЛЬЗУЕТСЯ POSTGRESQL: {database_url.split('@')[-1]}") # Логируем (без пароля)
else:
    # Локальная разработка - SQLite
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'database', 'football_school.db')
    print("⚠️ ИСПОЛЬЗУЕТСЯ SQLITE (Локальный режим или нет DATABASE_URL)")

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'frontend', 'static', 'uploads')

UPLOAD_FOLDER = app.config['UPLOAD_FOLDER']

db.init_app(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# --- БЛОК АВТОМАТИЧЕСКОЙ ИНИЦИАЛИЗАЦИИ ПЕРЕНЕСЕН В КОНЕЦ ФАЙЛА ---
# (чтобы все функции были объявлены до их вызова)
# ---------------------------------------------

face_service = FaceService()

# RTSP Настройки камеры Ezviz (Замените ВАШ_ПАРОЛЬ на реальный пароль от камеры)
RTSP_URL = "rtsp://admin:UNZKZK@192.168.100.3:554/h264_stream"

# Глобальный объект для управления источником камеры (None = из настроек БД)
CAMERA_OVERRIDE_SOURCE = None

# Глобальный кеш шрифта
GLOBAL_FONT = None

def get_cached_font():
    global GLOBAL_FONT
    if GLOBAL_FONT is not None:
        return GLOBAL_FONT
    
    font_candidates = ["arial.ttf", "C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\tahoma.ttf", "tahoma.ttf"]
    for path in font_candidates:
        try:
            GLOBAL_FONT = ImageFont.truetype(path, 40)
            return GLOBAL_FONT
        except: continue
    GLOBAL_FONT = ImageFont.load_default()
    return GLOBAL_FONT

class VideoCamera(object):
    def __init__(self, url):
        # Если url похож на индекс камеры (0, 1...), превращаем в int
        try:
            if isinstance(url, str) and (url.isdigit() or (url.startswith('-') and url[1:].isdigit())):
                camera_id = int(url)
            else:
                camera_id = url
        except Exception:
            camera_id = url

        self.camera_id = camera_id
        self.video = None
        self.last_frame = None
        self.lock = threading.Lock()
        self.is_running = True
        self.error_count = 0
        
        # Настройки вывода
        self.output_settings = {
            'resolution': '720p',
            'quality': 70
        }
        
        # Запуск системы анализа лиц
        face_service.start()
        
        # Поток для захвата (выделяем VideoCapture сюда, чтобы не вешать главный поток)
        self.thread = threading.Thread(target=self._update, args=())
        self.thread.daemon = True
        self.thread.start()

    def _update(self):
        # Инициализация камеры внутри потока
        print(f"⚙️ Поток захвата ({self.camera_id}) запущен")
        while self.is_running:
            try:
                if self.video and self.video.isOpened():
                    # Для RTSP важно вычитывать буфер постоянно
                    ret, frame = self.video.read()
                    if ret:
                        with self.lock:
                            self.last_frame = frame
                        # Ограничиваем очередь ИИ, чтобы он не захлебнулся
                        face_service.process_frame(frame)
                        self.error_count = 0
                    else:
                        self.error_count += 1
                        if self.error_count > 10:
                            self.video.release()
                            self.video = None
                else:
                    self._open_capture()
                    time.sleep(0.5)
            except Exception as e:
                print(f"❌ Ошибка в цикле камеры {self.camera_id}: {e}")
                time.sleep(1)
            time.sleep(0.01)
            
        # Конец цикла - освобождаем ресурсы
        if self.video:
            self.video.release()
            self.video = None
        print(f"🛑 Поток захвата ({self.camera_id}) полностью остановлен")

    def _open_capture(self):
        """Внутренний метод открытия видеозахвата"""
        try:
            print(f"🔄 Открытие видео-захвата: {self.camera_id}")
            # Оптимизация для RTSP / EZVIZ
            if isinstance(self.camera_id, str) and "rtsp" in self.camera_id:
                # Настройки устанавливаются ДО открытия Capture
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|reorder_queue_size;100|max_delay;500000"
                self.video = cv2.VideoCapture(self.camera_id, cv2.CAP_FFMPEG)
                self.video.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            else:
                # Для Windows DirectShow часто лучше для веб-камер
                if isinstance(self.camera_id, int) and os.name == 'nt':
                    self.video = cv2.VideoCapture(self.camera_id, cv2.CAP_DSHOW)
                else:
                    self.video = cv2.VideoCapture(self.camera_id)

            if self.video and self.video.isOpened():
                print(f"✅ Камера {self.camera_id} успешно открыта")
                if isinstance(self.camera_id, int):
                    self.video.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                    self.video.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                    self.video.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            else:
                print(f"❌ Не удалось открыть камеру {self.camera_id}")
                self.video = None
        except Exception as e:
            print(f"❌ Критическая ошибка открытия камеры: {e}")
            self.video = None

    def get_frame(self, draw_faces=True):
        frame = None
        with self.lock:
            if self.last_frame is not None:
                frame = self.last_frame.copy()
        
        provider_name = "CPU (Slow)"
        try:
            if face_service.gpu_active:
                if 'TensorrtExecutionProvider' in face_service.providers:
                    provider_name = "TensorRT (Super Rocket!)"
                else:
                    provider_name = "CUDA (Rocket!)"
        except: pass

        if frame is None:
            black_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            cv2.putText(black_frame, "Loading camera...", (450, 340), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 2)
            cv2.putText(black_frame, f"Engine: {provider_name}", (450, 400), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (200, 200, 200), 1)
            ret, jpeg = cv2.imencode('.jpg', black_frame)
            return jpeg.tobytes() if ret else None, None

        faces, fps = face_service.get_latest_results()
        
        if draw_faces and faces:
            # Отрисовка с кешированным шрифтом
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img_pil = Image.fromarray(frame_rgb)
            draw = ImageDraw.Draw(img_pil)
            font = get_cached_font()

            for face in faces:
                bbox = face['bbox']
                name = face['name']
                color_pil = (0, 255, 0) if face['is_recognized'] else (255, 0, 0)
                
                draw.rectangle([bbox[0], bbox[1], bbox[2], bbox[3]], outline=color_pil, width=4)
                text_bbox = draw.textbbox((bbox[0], bbox[1]-55), name, font=font)
                draw.rectangle([text_bbox[0]-5, text_bbox[1]-5, text_bbox[2]+10, text_bbox[3]+5], fill=color_pil)
                draw.text((bbox[0], bbox[1]-55), name, font=font, fill=(255, 255, 255))
            
            frame = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

        cv2.putText(frame, f"AI FPS: {fps:.1f}", (20, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
        cv2.putText(frame, f"Engine: {provider_name}", (20, 100), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 0), 2)

        target_width = 1280
        if self.output_settings['resolution'] == '1080p': target_width = 1920
        elif self.output_settings['resolution'] == '2k': target_width = 2560
        
        h, w = frame.shape[:2]
        if w != target_width:
            scale = target_width / w
            frame = cv2.resize(frame, (target_width, int(h * scale)))

        ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, self.output_settings['quality']])
        return (jpeg.tobytes(), frame) if ret else (None, None)

    def _mark_attendance_optimized(self, student_id, name):
        """
        Удалено в пользу отметки через JS.
        Теперь отметка происходит в фоне только если JS неактивен (опционально)
        Для чистоты интерфейса оставляем управление браузеру.
        """
        pass

    def stop(self):
        print(f"⏳ Запрос на остановку камеры {self.camera_id}...")
        self.is_running = False
        # Освобождаем видео сразу, чтобы разблокировать .read() если он завис
        if self.video:
            self.video.release()
            self.video = None


# Глобальный объект камеры
global_camera = None
camera_lock = threading.Lock()

def get_camera():
    global global_camera, CAMERA_OVERRIDE_SOURCE
    with camera_lock:
        # Определяем URL/ID камеры
        if CAMERA_OVERRIDE_SOURCE is not None:
            db_url = CAMERA_OVERRIDE_SOURCE
        else:
            try:
                settings = get_club_settings_instance()
                db_url = settings.rtsp_url if settings.rtsp_url else RTSP_URL
            except Exception:
                db_url = RTSP_URL

        if global_camera is None:
            global_camera = VideoCamera(db_url)
        elif str(global_camera.camera_id) != str(db_url):
            print(f"🔄 Смена источника: {global_camera.camera_id} -> {db_url}")
            global_camera.stop()
            time.sleep(1.5) # Даем время на освобождение устройства
            global_camera = VideoCamera(db_url)
            
        return global_camera

def gen_frames(camera):
    while camera.is_running:
        frame_bytes, _ = camera.get_frame(draw_faces=True)
        if frame_bytes:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n\r\n')
        else:
            time.sleep(0.5) # Ждем дольше, если кадров нет совсем
            continue
        # Минимальная задержка для отзывчивости
        time.sleep(0.03) # ~30 FPS

@app.route('/video_feed')
def video_feed():
    """MJPEG поток видео с RTSP камеры"""
    try:
        return Response(gen_frames(get_camera()),
                        mimetype='multipart/x-mixed-replace; boundary=frame')
    except Exception as e:
        print(f"❌ Ошибка видео-фида: {e}")
        return "Video feed error", 500

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


DAY_LABELS = {
    1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс'
}


def ensure_payment_type_column():
    """Проверяет и добавляет колонку payment_type в таблицу payments"""
    try:
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'payments' not in tables:
            db.create_all()
            return
        
        columns = {col['name'] for col in inspector.get_columns('payments')}
        
        if 'payment_type' not in columns:
            try:
                db.session.execute(db.text("ALTER TABLE payments ADD COLUMN payment_type VARCHAR(20) DEFAULT 'cash'"))
                # Обновить существующие записи
                db.session.execute(db.text("UPDATE payments SET payment_type = 'cash' WHERE payment_type IS NULL"))
                db.session.commit()
                print("✓ Добавлена колонка payment_type в таблицу payments")
            except Exception as e:
                db.session.rollback()
                if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                    print(f"Ошибка при добавлении payment_type: {e}")
    except Exception as e:
        print(f"Ошибка при проверке колонки payment_type: {e}")


def get_club_settings_instance():
    """Получить настройки клуба (теперь без лишних проверок БД)"""
    settings = ClubSettings.query.first()
    if not settings:
        settings = ClubSettings(system_name='FK QORASUV')
        db.session.add(settings)
        db.session.commit()
    return settings


def ensure_users_table_columns():
    """Проверяет и добавляет отсутствующие колонки в таблицу users"""
    try:
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'users' not in tables:
            db.create_all()
            return
        
        columns = {col['name'] for col in inspector.get_columns('users')}
        
        # Добавляем отсутствующие колонки
        if 'role_id' not in columns:
            try:
                db.session.execute(db.text("ALTER TABLE users ADD COLUMN role_id INTEGER"))
                db.session.commit()
                print("✓ Добавлена колонка role_id в таблицу users")
            except Exception as e:
                db.session.rollback()
                if "duplicate column" not in str(e).lower():
                    print(f"Ошибка при добавлении role_id: {e}")
        
        if 'full_name' not in columns:
            try:
                db.session.execute(db.text("ALTER TABLE users ADD COLUMN full_name VARCHAR(200)"))
                db.session.commit()
                print("✓ Добавлена колонка full_name в таблицу users")
            except Exception as e:
                db.session.rollback()
                if "duplicate column" not in str(e).lower():
                    print(f"Ошибка при добавлении full_name: {e}")
        
        if 'is_active' not in columns:
            try:
                db.session.execute(db.text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                db.session.commit()
                # Обновляем существующие записи
                db.session.execute(db.text("UPDATE users SET is_active = 1 WHERE is_active IS NULL"))
                db.session.commit()
                print("✓ Добавлена колонка is_active в таблицу users")
            except Exception as e:
                db.session.rollback()
                if "duplicate column" not in str(e).lower():
                    print(f"Ошибка при добавлении is_active: {e}")
                    
    except Exception as e:
        print(f"Ошибка при обновлении таблицы users: {e}")


def ensure_roles_tables():
    """Проверяет и создает таблицы для системы ролей"""
    try:
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'roles' not in tables or 'role_permissions' not in tables:
            db.create_all()
            # Создать стандартные роли, если их нет
            create_default_roles()
    except Exception as e:
        print(f"Ошибка при проверке таблиц ролей: {e}")


def create_default_roles():
    """Создать стандартные роли с правами доступа"""
    try:
        # Роль "Администратор" - все права
        admin_role = Role.query.filter_by(name='Администратор').first()
        if not admin_role:
            admin_role = Role(name='Администратор', description='Полный доступ ко всем разделам')
            db.session.add(admin_role)
            db.session.flush()
            
            sections = ['dashboard', 'students', 'groups', 'tariffs', 'finances', 'attendance', 'camera', 'rewards', 'rating', 'users', 'cash']
            for section in sections:
                perm = RolePermission(role_id=admin_role.id, section=section, can_view=True, can_edit=True)
                db.session.add(perm)
            
            db.session.commit()
            print("✓ Создана роль 'Администратор'")
    except Exception as e:
        db.session.rollback()
        print(f"Ошибка при создании стандартных ролей: {e}")


def ensure_club_settings_columns():
    """Добавляет отсутствующие колонки в club_settings (на случай старой БД)"""
    inspector = db.inspect(db.engine)
    tables = inspector.get_table_names()
    if 'club_settings' not in tables:
        with app.app_context():
            db.create_all()
        return

    columns = {col['name'] for col in inspector.get_columns('club_settings')}
    with db.engine.begin() as conn:
        if 'system_name' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN system_name VARCHAR(200)"))
        if 'rewards_reset_period_months' not in columns:
            # SQLite использует INTEGER, PostgreSQL тоже поддерживает
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN rewards_reset_period_months INTEGER DEFAULT 1"))
        if 'podium_display_count' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN podium_display_count INTEGER DEFAULT 20"))
        if 'telegram_bot_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN telegram_bot_url VARCHAR(300)"))
        if 'telegram_bot_token' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN telegram_bot_token VARCHAR(200)"))
        if 'telegram_notification_template' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN telegram_notification_template TEXT"))
        if 'telegram_reward_template' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN telegram_reward_template TEXT"))
        if 'telegram_card_template' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN telegram_card_template TEXT"))
        if 'telegram_payment_template' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN telegram_payment_template TEXT"))
        if 'rtsp_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN rtsp_url VARCHAR(300)"))
        if 'payment_click_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_click_enabled BOOLEAN DEFAULT 0"))
        if 'payment_click_qr_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_click_qr_url VARCHAR(500)"))
        if 'payment_payme_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_payme_enabled BOOLEAN DEFAULT 0"))
        if 'payment_payme_qr_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_payme_qr_url VARCHAR(500)"))
        if 'payment_uzum_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_uzum_enabled BOOLEAN DEFAULT 0"))
        if 'payment_uzum_qr_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_uzum_qr_url VARCHAR(500)"))
        if 'payment_uzcard_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_uzcard_enabled BOOLEAN DEFAULT 0"))
        if 'payment_humo_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_humo_enabled BOOLEAN DEFAULT 0"))
        if 'payment_paynet_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_paynet_enabled BOOLEAN DEFAULT 0"))
        if 'payment_paynet_qr_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_paynet_qr_url VARCHAR(500)"))
        if 'payment_xazna_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_xazna_enabled BOOLEAN DEFAULT 0"))
        if 'payment_xazna_qr_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_xazna_qr_url VARCHAR(500)"))
        if 'payment_oson_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_oson_enabled BOOLEAN DEFAULT 0"))
        if 'payment_oson_qr_url' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_oson_qr_url VARCHAR(500)"))
        if 'payment_transfer_enabled' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN payment_transfer_enabled BOOLEAN DEFAULT 0"))
        if 'expense_categories' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN expense_categories TEXT"))
        
        # Контакты руководства
        if 'director_phone' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN director_phone VARCHAR(20)"))
        if 'founder_phone' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN founder_phone VARCHAR(20)"))
        if 'cashier_phone' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN cashier_phone VARCHAR(20)"))
            
        # Telegram ID руководства
        if 'director_chat_id' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN director_chat_id VARCHAR(50)"))
        if 'founder_chat_id' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN founder_chat_id VARCHAR(50)"))
        if 'cashier_chat_id' not in columns:
            conn.execute(db.text("ALTER TABLE club_settings ADD COLUMN cashier_chat_id VARCHAR(50)"))


def ensure_expense_columns():
    """Добавляет отсутствующие колонки в expenses"""
    inspector = db.inspect(db.engine)
    tables = inspector.get_table_names()
    if 'expenses' not in tables:
        with app.app_context():
            db.create_all()
        return

    columns = {col['name'] for col in inspector.get_columns('expenses')}
    with db.engine.begin() as conn:
        if 'expense_source' not in columns:
            conn.execute(db.text("ALTER TABLE expenses ADD COLUMN expense_source VARCHAR(50) DEFAULT 'cash'"))


def ensure_students_columns():
    """Добавляет отсутствующие колонки в students (миграция для новых полей)"""
    inspector = db.inspect(db.engine)
    tables = inspector.get_table_names()
    
    if 'students' not in tables:
        with app.app_context():
            db.create_all()
        return
    
    try:
        student_columns = {col['name'] for col in inspector.get_columns('students')}
        with db.engine.begin() as conn:
            # Telegram
            if 'telegram_link_code' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN telegram_link_code VARCHAR(10)"))
                    print("✓ Добавлена колонка telegram_link_code")
                except Exception: pass
            if 'telegram_chat_id' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN telegram_chat_id INTEGER"))
                    print("✓ Добавлена колонка telegram_chat_id")
                except Exception: pass
            if 'telegram_notifications_enabled' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN telegram_notifications_enabled INTEGER DEFAULT 1"))
                    print("✓ Добавлена колонка telegram_notifications_enabled")
                except Exception: pass
            
            # Адрес
            if 'city' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN city VARCHAR(100)"))
                    print("✓ Добавлена колонка city")
                except Exception: pass
            if 'district' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN district VARCHAR(100)"))
                except Exception: pass
            if 'street' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN street VARCHAR(200)"))
                except Exception: pass
            if 'house_number' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN house_number VARCHAR(50)"))
                except Exception: pass
                
            # Паспорт и личные данные
            if 'birth_year' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN birth_year INTEGER"))
                except Exception: pass
            if 'passport_series' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN passport_series VARCHAR(10)"))
                except Exception: pass
            if 'passport_number' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN passport_number VARCHAR(20)"))
                except Exception: pass
            if 'passport_issued_by' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN passport_issued_by VARCHAR(200)"))
                except Exception: pass
            if 'passport_issue_date' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN passport_issue_date DATE"))
                except Exception: pass
            if 'passport_expiry_date' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN passport_expiry_date DATE"))
                except Exception: pass
            if 'admission_date' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN admission_date DATE"))
                except Exception: pass
            if 'club_funded' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN club_funded INTEGER DEFAULT 0"))
                except Exception: pass
                
            # Параметры
            if 'height' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN height INTEGER"))
                except Exception: pass
            if 'weight' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN weight FLOAT"))
                except Exception: pass
            if 'jersey_size' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN jersey_size VARCHAR(20)"))
                except Exception: pass
            if 'shorts_size' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN shorts_size VARCHAR(20)"))
                except Exception: pass
            if 'boots_size' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN boots_size VARCHAR(20)"))
                except Exception: pass
            if 'equipment_notes' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN equipment_notes TEXT"))
                except Exception: pass
            if 'school_number' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN school_number VARCHAR(100)"))
                except Exception: pass
            if 'photo_path' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN photo_path VARCHAR(300)"))
                except Exception: pass
            if 'face_encoding' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN face_encoding TEXT"))
                except Exception: pass
            if 'tariff_type' not in student_columns:
                try:
                    conn.execute(db.text("ALTER TABLE students ADD COLUMN tariff_type VARCHAR(50)"))
                except Exception: pass

    except Exception as e:
        print(f"Ошибка при миграции таблицы students: {e}")
        import traceback
        traceback.print_exc()


def ensure_cash_transfers_table():
    """Проверяет и создает/обновляет таблицу cash_transfers"""
    try:
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'cash_transfers' not in tables:
            # Таблица не существует, создаем её
            db.create_all()
            return
        
        # Получаем список существующих колонок
        columns = {col['name'] for col in inspector.get_columns('cash_transfers')}
        
        # Если есть старая колонка transferred_to с NOT NULL, нужно пересоздать таблицу
        if 'transferred_to' in columns:
            print("Обнаружена старая колонка transferred_to. Пересоздаем таблицу...")
            try:
                # Сохраняем данные через raw SQL
                result = db.session.execute(db.text("SELECT id, amount, transferred_to, recipient, transfer_date, notes, created_by, created_at, updated_at FROM cash_transfers"))
                old_data = []
                for row in result:
                    old_data.append({
                        'id': row[0],
                        'amount': row[1],
                        'recipient': row[2] or row[3] or 'Не указано',  # transferred_to или recipient
                        'transfer_date': row[4],
                        'notes': row[5] or '',
                        'created_by': row[6],
                        'created_at': row[7],
                        'updated_at': row[8]
                    })
                
                print(f"Сохранено {len(old_data)} записей")
                
                # Удаляем старую таблицу
                db.session.execute(db.text("DROP TABLE cash_transfers"))
                db.session.commit()
                
                # Создаем новую таблицу через create_all
                db.create_all()
                
                # Восстанавливаем данные
                for data in old_data:
                    transfer = CashTransfer(
                        amount=data['amount'],
                        recipient=data['recipient'],
                        transfer_date=data['transfer_date'],
                        notes=data['notes'],
                        created_by=data['created_by']
                    )
                    if data.get('created_at'):
                        transfer.created_at = data['created_at']
                    if data.get('updated_at'):
                        transfer.updated_at = data['updated_at']
                    db.session.add(transfer)
                
                db.session.commit()
                print("✓ Таблица cash_transfers успешно пересоздана")
                return
            except Exception as e:
                db.session.rollback()
                print(f"Ошибка при пересоздании таблицы: {e}")
                import traceback
                traceback.print_exc()
                # Продолжаем с обычной миграцией
        
        # Обычная миграция - добавляем недостающие колонки
        columns = {col['name'] for col in inspector.get_columns('cash_transfers')}
        
        # Список колонок, которые должны быть в таблице
        required_columns = {
            'recipient': "ALTER TABLE cash_transfers ADD COLUMN recipient VARCHAR(200)",
            'created_at': "ALTER TABLE cash_transfers ADD COLUMN created_at TIMESTAMP",
            'updated_at': "ALTER TABLE cash_transfers ADD COLUMN updated_at TIMESTAMP",
            'created_by': "ALTER TABLE cash_transfers ADD COLUMN created_by INTEGER",
            'transfer_date': "ALTER TABLE cash_transfers ADD COLUMN transfer_date TIMESTAMP",
            'notes': "ALTER TABLE cash_transfers ADD COLUMN notes TEXT",
            'amount': "ALTER TABLE cash_transfers ADD COLUMN amount FLOAT"
        }
        
        # Добавляем отсутствующие колонки
        for col_name, alter_sql in required_columns.items():
            if col_name not in columns:
                try:
                    db.session.execute(db.text(alter_sql))
                    db.session.commit()
                    print(f"✓ Добавлена колонка {col_name} в таблицу cash_transfers")
                except Exception as e:
                    db.session.rollback()
                    if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                        print(f"Ошибка при добавлении колонки {col_name}: {e}")
        
        # Обновляем существующие записи для recipient
        if 'recipient' in columns:
            try:
                # Если есть transferred_to, копируем данные
                if 'transferred_to' in columns:
                    db.session.execute(db.text("UPDATE cash_transfers SET recipient = transferred_to WHERE recipient IS NULL OR recipient = ''"))
                else:
                    db.session.execute(db.text("UPDATE cash_transfers SET recipient = 'Не указано' WHERE recipient IS NULL OR recipient = ''"))
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                
    except Exception as e:
        print(f"Ошибка при обновлении таблицы cash_transfers: {e}")
        import traceback
        traceback.print_exc()


def calculate_student_balance(student):
    """
    Расчёт баланса ученика в занятиях.
    Баланс = (сумма оплат / стоимость 1 занятия) - количество посещений
    Оптимизировано: используется прямое суммирование и нормализованный расчёт.
    """
    if not student:
        return 0
    
    # 1. Получаем стоимость одного занятия
    lesson_price = 0
    if student.tariff_id:
        # Используем session.get для кеширования объектов
        tariff = db.session.get(Tariff, student.tariff_id)
        if tariff and tariff.price and tariff.lessons_count and tariff.lessons_count > 0:
            lesson_price = float(tariff.price) / float(tariff.lessons_count)
    
    if lesson_price <= 0:
        return student.balance or 0
    
    # 2. Сумма оплат (одним запросом)
    total_paid = db.session.query(db.func.sum(Payment.amount_paid)).filter(
        Payment.student_id == student.id
    ).scalar() or 0
    
    # 3. Кол-во посещений (одним запросом)
    attendance_count = db.session.query(db.func.count(Attendance.id)).filter(
        Attendance.student_id == student.id
    ).scalar() or 0
    
    paid_lessons = int(total_paid / lesson_price)
    return paid_lessons - attendance_count


def parse_days_list(raw_days):
    if raw_days is None:
        return []
    if isinstance(raw_days, list):
        return [int(day) for day in raw_days if str(day).isdigit()]
    if isinstance(raw_days, str):
        return [int(day) for day in raw_days.split(',') if day.strip().isdigit()]
    return []


def validate_group_schedule(schedule_time, schedule_days, exclude_group_id=None):
    if schedule_time is None:
        return False, 'Укажите время занятия'
    settings = get_club_settings_instance()
    working_days = set(settings.get_working_days_list())
    selected_days = set(schedule_days)
    if not selected_days:
        return False, 'Выберите хотя бы один день недели'
    if not selected_days.issubset(working_days):
        return False, 'Выбранные дни не входят в рабочий график клуба'
    
    # Парсим время из строки если это строка
    if isinstance(schedule_time, str):
        time_parts = schedule_time.split(':')
        if len(time_parts) == 2:
            schedule_time = dt_time(int(time_parts[0]), int(time_parts[1]))
        else:
            return False, 'Некорректный формат времени'
    
    if schedule_time < settings.work_start_time or schedule_time > settings.work_end_time:
        return False, 'Время занятия вне рабочего времени клуба'
    # Исправление для PostgreSQL: преобразуем время в строку перед запросом
    query_time = schedule_time
    if isinstance(schedule_time, (dt_time, datetime)):
        query_time = schedule_time.strftime('%H:%M')
        
    groups_same_time = Group.query.filter_by(schedule_time=query_time).all()
    for day in selected_days:
        count = 0
        for group in groups_same_time:
            if exclude_group_id and group.id == exclude_group_id:
                continue
            if day in group.get_schedule_days_list():
                count += 1
        if count >= settings.max_groups_per_slot:
            return False, f"Нет свободного поля на {DAY_LABELS.get(day, day)} {schedule_time.strftime('%H:%M')}"
    return True, ''


@app.template_filter('format_thousand')
def format_thousand(value):
    try:
        if value is None:
            return ''
        number = float(value)
        if number.is_integer():
            return '{:,.0f}'.format(number).replace(',', ' ')
        return '{:,.2f}'.format(number).replace(',', ' ')
    except (TypeError, ValueError):
        return value


@app.jinja_env.filters['format_currency'] = format_currency

def send_telegram_message(chat_id, text, token):
    """Отправка сообщения в Telegram"""
    if not token or not chat_id: return
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"Ошибка отправки сообщения в Telegram ({chat_id}): {e}")

def send_management_notification(message, roles=['director', 'founder', 'cashier']):
    """Отправка уведомления руководству"""
    try:
        settings = get_club_settings_instance()
        bot_token = settings.telegram_bot_token
        if not bot_token: return
        
        chat_ids = set()
        
        if 'director' in roles and settings.director_chat_id:
            chat_ids.add(settings.director_chat_id)
        if 'founder' in roles and settings.founder_chat_id:
            chat_ids.add(settings.founder_chat_id)
        if 'cashier' in roles and settings.cashier_chat_id:
            chat_ids.add(settings.cashier_chat_id)
            
        for chat_id in chat_ids:
            try:
                send_telegram_message(chat_id, message, bot_token)
            except Exception as e:
                print(f"Ошибка отправки уведомления руководству ({chat_id}): {e}")
                
    except Exception as e:
        print(f"Ошибка в send_management_notification: {e}")

# Функции для работы с изображениями
@app.template_filter('format_date')
def format_date(value, fmt='%d.%m.%Y'):
    if not value:
        return ''
    if isinstance(value, str):
        try:
            value = datetime.strptime(value, '%Y-%m-%d')
        except ValueError:
            return value
    if isinstance(value, datetime):
        return value.strftime(fmt)
    try:
        return value.strftime(fmt)
    except AttributeError:
        return value


# Кеш для названия системы
SYSTEM_NAME_CACHE = None

@app.context_processor
def inject_system_name():
    """Добавляет название системы во все шаблоны (с кешированием)"""
    global SYSTEM_NAME_CACHE
    if SYSTEM_NAME_CACHE:
        return {'system_name': SYSTEM_NAME_CACHE}
        
    try:
        # Не используем get_club_settings_instance, чтобы не плодить запросы
        settings = ClubSettings.query.first()
        SYSTEM_NAME_CACHE = settings.system_name if settings and settings.system_name else 'FK QORASUV'
    except Exception:
        SYSTEM_NAME_CACHE = 'FK QORASUV'
    return {'system_name': SYSTEM_NAME_CACHE}


# ===== МАРШРУТЫ АВТОРИЗАЦИИ =====

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json()
        # Портал: вход по номеру телефона + Telegram-коду через /login
        if data and data.get('portal'):
            phone_input = (data.get('phone') or '').strip()
            code_input = (data.get('code') or '').strip()

            if not phone_input or not code_input:
                return jsonify({'success': False, 'message': 'Введите номер и код'}), 400

            candidates = Student.query.filter(or_(Student.phone.isnot(None), Student.parent_phone.isnot(None))).all()
            matched = None
            for student in candidates:
                if phones_match(student.phone, phone_input) or phones_match(student.parent_phone, phone_input):
                    matched = student
                    break

            # Возвращаем 200 с success:false, чтобы на фронте не сыпались 404/401
            if not matched:
                return jsonify({'success': False, 'message': 'Номер не найден'})

            # Код сравниваем без регистра и с trim
            student_code = (matched.telegram_link_code or '').strip().upper()
            if not student_code or student_code != code_input.upper():
                return jsonify({'success': False, 'message': 'Неверный код'})

            session['portal_student_id'] = matched.id
            return jsonify({'success': True, 'redirect': '/portal'})

        magic = (data or {}).get('magic')
        username = data.get('username')
        password = data.get('password')

        # Магический вход для администратора
        if magic == 'adminadminadmin':
            admin_user = User.query.filter_by(role='admin').first() or User.query.first()
            if admin_user:
                login_user(admin_user)
                return jsonify({'success': True, 'role': admin_user.role, 'redirect': '/dashboard'})
            return jsonify({'success': False, 'message': 'Администратор не найден'}), 404
        
        user = User.query.filter_by(username=username).first()
        
        if user and bcrypt.check_password_hash(user.password_hash, password):
            login_user(user)
            # Перенаправление в зависимости от роли
            if user.role == 'payment_admin':
                return jsonify({'success': True, 'role': user.role, 'redirect': '/mobile-payments'})
            elif user.role == 'teacher':
                return jsonify({'success': True, 'role': user.role, 'redirect': '/teacher-attendance'})
            return jsonify({'success': True, 'role': user.role})
        else:
            return jsonify({'success': False, 'message': 'Неверный логин или пароль'}), 401
    
    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ===== ПОРТАЛ ДЛЯ РОДИТЕЛЕЙ/УЧЕНИКОВ =====
def normalize_phone(value: str) -> str:
    return ''.join(ch for ch in (value or '') if ch.isdigit())


def phones_match(a: str, b: str) -> bool:
    """Compare phone numbers leniently: exact match or matching last 9 digits."""
    a_norm = normalize_phone(a)
    b_norm = normalize_phone(b)
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    # Allow match by last 9 digits to handle country code differences
    if len(a_norm) >= 9 and len(b_norm) >= 9:
        return a_norm.endswith(b_norm[-9:]) or b_norm.endswith(a_norm[-9:])
    return False


def get_portal_student():
    student_id = session.get('portal_student_id')
    if not student_id:
        return None
    return db.session.get(Student, student_id)


def build_photo_url(photo_path):
    """Normalize stored photo path to static-relative URL"""
    if not photo_path:
        return None
    path = photo_path.replace('\\', '/').lstrip('/')
    # Remove leading frontend/ or static/
    for prefix in ['frontend/', 'static/']:
        if path.startswith(prefix):
            path = path[len(prefix):]
    return url_for('static', filename=path)


@app.route('/portal/login', methods=['GET', 'POST'])
def portal_login():
    if request.method == 'POST':
        data = request.get_json() or {}
        phone_input = (data.get('phone') or '').strip()
        code_input = (data.get('code') or '').strip()

        if not phone_input or not code_input:
            return jsonify({'success': False, 'message': 'Введите номер и код'}), 400

        candidates = Student.query.filter(or_(Student.phone.isnot(None), Student.parent_phone.isnot(None))).all()
        matched = None
        for student in candidates:
            if phones_match(student.phone, phone_input) or phones_match(student.parent_phone, phone_input):
                matched = student
                break

        # Возвращаем 200 с success:false, чтобы на фронте не сыпались 404/401
        if not matched:
            return jsonify({'success': False, 'message': 'Номер не найден'})

        # Код сравниваем без регистра и с trim
        student_code = (matched.telegram_link_code or '').strip().upper()
        if not student_code or student_code != code_input.upper():
            return jsonify({'success': False, 'message': 'Неверный код'})

        session['portal_student_id'] = matched.id
        return jsonify({'success': True, 'redirect': '/portal'})

    return render_template('portal_login.html')


@app.route('/portal/logout')
def portal_logout():
    session.pop('portal_student_id', None)
    return redirect(url_for('portal_login'))


@app.route('/portal')
def portal_home():
    student = get_portal_student()
    if not student:
        return redirect(url_for('portal_login'))
    return render_template('portal.html')


@app.route('/api/portal/me')
def portal_me():
    student = get_portal_student()
    if not student:
        return jsonify({'success': False, 'message': 'Not authorized'}), 401

    settings = get_club_settings_instance()
    telegram_bot_url = getattr(settings, 'telegram_bot_url', '') or ''

    # Информация о группе
    group_info = None
    days_list = []
    if student.group:
        try:
            days_list = student.group.get_schedule_days_list() if hasattr(student.group, 'get_schedule_days_list') else []
            days_names = [DAY_LABELS.get(d, str(d)) for d in days_list] if days_list else []
            
            # schedule_time теперь может быть строкой "HH:MM" или JSON
            schedule_time_str = '—'
            if student.group.schedule_time:
                try:
                    # Пробуем распарсить как JSON
                    time_map = json.loads(student.group.schedule_time)
                    if isinstance(time_map, dict):
                        # Показываем времена для каждого дня
                        time_strs = []
                        for day in days_list:
                            day_time = time_map.get(str(day))
                            if day_time:
                                time_strs.append(f"{DAY_LABELS.get(day, str(day))} {day_time}")
                        schedule_time_str = ', '.join(time_strs) if time_strs else '—'
                except (json.JSONDecodeError, ValueError):
                    # Обычная строка HH:MM
                    schedule_time_str = student.group.schedule_time
            
            group_info = {
                'name': student.group.name,
                'schedule_days': ', '.join(days_names) if days_names else '—',
                'schedule_days_list': days_list,
                'schedule_time': schedule_time_str,
                'schedule_time_map': student.group.get_schedule_time_map()  # Для фронтенда
            }
        except Exception as e:
            print(f"Error getting group info: {e}")
            group_info = {
                'name': student.group.name,
                'schedule_days': '—',
                'schedule_days_list': [],
                'schedule_time': '—',
                'schedule_time_map': None
            }
    
    # Информация о тарифе
    tariff_info = None
    try:
        if student.tariff:
            tariff_info = {
                'name': student.tariff.name,
                'price': student.tariff.price,
                'lessons_count': student.tariff.lessons_count
            }
        elif student.tariff_type:
            tariff_info = {'name': student.tariff_type, 'price': None, 'lessons_count': None}
    except Exception as e:
        print(f"Error getting tariff info: {e}")
        tariff_info = {'name': student.tariff_type or 'Не указан', 'price': None, 'lessons_count': None}

    rewards = StudentReward.query.filter_by(student_id=student.id).order_by(StudentReward.issued_at.desc()).limit(10).all()
    cards = StudentCard.query.filter_by(student_id=student.id).order_by(StudentCard.issued_at.desc()).limit(10).all()

    # Посещаемость за текущий месяц
    today_local = get_local_date()
    first_day = today_local.replace(day=1)
    next_month = (first_day + timedelta(days=32)).replace(day=1)
    last_day = next_month - timedelta(days=1)

    # Считаем посещения по уникальным датам (а не по количеству записей, т.к. может быть несколько чек-инов в день)
    attendance_done = db.session.query(Attendance.date).filter(
        Attendance.student_id == student.id,
        Attendance.date >= first_day,
        Attendance.date <= last_day
    ).distinct().count()

    schedule_days_for_calc = days_list or []
    attendance_plan = 0
    if schedule_days_for_calc:
        current_day = first_day
        while current_day <= last_day:
            if current_day.isoweekday() in schedule_days_for_calc:
                attendance_plan += 1
            current_day += timedelta(days=1)

    rewards_payload = [
        {
            'name': r.reward_name,
            'points': r.points,
            'issued_at': r.issued_at.isoformat() if r.issued_at else None
        }
        for r in rewards
    ]

    cards_payload = [
        {
            'name': c.card_type.name if (c.card_type and hasattr(c.card_type, 'name')) else 'Карточка',
            'card_type': c.card_type.name if (c.card_type and hasattr(c.card_type, 'name')) else (c.card_type.color if (c.card_type and hasattr(c.card_type, 'color')) else 'yellow'),
            'color': c.card_type.color if (c.card_type and hasattr(c.card_type, 'color')) else None,
            'reason': c.reason,
            'issued_at': c.issued_at.isoformat() if c.issued_at else None,
            'is_active': c.is_active
        }
        for c in cards
    ]

    # Генерируем даты тренировок для текущего и следующего месяца
    training_dates = []
    if schedule_days_for_calc and student.group:
        # Берем данные за 2 месяца (текущий и следующий)
        start_date = first_day
        end_date = last_day + timedelta(days=31)  # +месяц вперед
        
        # Получаем все посещения студента
        attended_dates = {
            att.date.isoformat(): {
                'attended': True,
                'is_late': att.is_late,
                'late_minutes': att.late_minutes
            }
            for att in Attendance.query.filter(
                Attendance.student_id == student.id,
                Attendance.date >= start_date,
                Attendance.date <= end_date
            ).all()
        }
        
        # Генерируем даты тренировок
        current_day = start_date
        schedule_time_map = student.group.get_schedule_time_map()
        
        while current_day <= end_date:
            weekday = current_day.isoweekday()
            if weekday in schedule_days_for_calc:
                date_str = current_day.isoformat()
                attendance_info = attended_dates.get(date_str)
                
                # Определяем время тренировки для этого дня
                training_time = None
                if schedule_time_map:
                    training_time = schedule_time_map.get(weekday)
                else:
                    # Простое время для всех дней
                    training_time = student.group.schedule_time
                
                training_dates.append({
                    'date': date_str,
                    'weekday': weekday,
                    'time': training_time if training_time else '—',
                    'attended': attendance_info is not None,
                    'is_late': attendance_info['is_late'] if attendance_info else False,
                    'late_minutes': attendance_info['late_minutes'] if attendance_info else 0
                })
            current_day += timedelta(days=1)

    return jsonify({
        'success': True,
        'telegram_bot_url': telegram_bot_url,
        'student': {
            'id': student.id,
            'full_name': student.full_name,
            'group': group_info,
            'tariff': tariff_info,
            'balance': student.balance,
            'phone': student.phone,
            'parent_phone': student.parent_phone,
            'status': student.status,
            'photo_url': build_photo_url(student.photo_path),
            'city': student.city,
            'district': student.district,
            'street': student.street,
            'house_number': student.house_number,
            'admission_date': student.admission_date.isoformat() if student.admission_date else None,
            'birth_year': student.birth_year,
            'passport_series': student.passport_series,
            'passport_number': student.passport_number,
            'passport_issued_by': student.passport_issued_by,
            'passport_issue_date': student.passport_issue_date.isoformat() if student.passport_issue_date else None,
            'passport_expiry_date': student.passport_expiry_date.isoformat() if student.passport_expiry_date else None,
            'height': student.height,
            'weight': student.weight,
            'jersey_size': student.jersey_size,
            'shorts_size': student.shorts_size,
            'boots_size': student.boots_size,
            'equipment_notes': student.equipment_notes
        },
        'rewards': rewards_payload,
        'cards': cards_payload,
        'attendance_month_done': attendance_done,
        'attendance_month_total': attendance_plan,
        'training_dates': training_dates  # Даты тренировок с информацией о посещении
    })


@app.route('/api/portal/attendance')
def portal_attendance():
    student = get_portal_student()
    if not student:
        return jsonify({'success': False, 'message': 'Not authorized'}), 401

    records = Attendance.query.filter_by(student_id=student.id).order_by(Attendance.date.desc()).limit(60).all()
    data = [
        {
            'date': r.date.isoformat() if r.date else None,
            'is_late': r.is_late,
            'late_minutes': r.late_minutes,
            'lesson_deducted': r.lesson_deducted
        }
        for r in records
    ]
    print(f"📊 Portal attendance for student {student.id}: {len(records)} records")
    for r in records[:5]:
        print(f"   - {r.date} (ID: {r.id})")
    return jsonify({'success': True, 'attendance': data})


@app.route('/api/portal/payments')
def portal_payments():
    student = get_portal_student()
    if not student:
        return jsonify({'success': False, 'message': 'Not authorized'}), 401

    payments = Payment.query.filter_by(student_id=student.id).order_by(Payment.payment_date.desc()).limit(60).all()
    data = [
        {
            'amount_paid': p.amount_paid,
            'amount_due': p.amount_due,
            'payment_date': p.payment_date.isoformat() if p.payment_date else None,
            'payment_type': p.payment_type,
            'notes': p.notes,
            'tariff_name': p.tariff_name
        }
        for p in payments
    ]
    return jsonify({'success': True, 'payments': data})


# ===== ГЛАВНАЯ ПАНЕЛЬ =====

@app.route('/dashboard')
@login_required
def dashboard():
    # Статистика
    total_students = Student.query.filter_by(status='active').count()
    # Подсчет студентов с низким балансом (<=2 занятия)
    active_students = Student.query.filter_by(status='active').all()
    students_low_balance = sum(1 for s in active_students if calculate_student_balance(s) <= 2)
    
    today = get_local_date()
    today_attendance = Attendance.query.filter_by(date=today).count()
    
    # Доходы за месяц
    month_start = get_local_datetime().replace(day=1)
    month_income = db.session.query(db.func.sum(Payment.amount_paid)).filter(
        Payment.payment_date >= month_start
    ).scalar() or 0
    
    # Расходы за месяц
    month_expenses = db.session.query(db.func.sum(Expense.amount)).filter(
        Expense.expense_date >= month_start
    ).scalar() or 0
    
    return render_template('dashboard.html',
                         total_students=total_students,
                         students_low_balance=students_low_balance,
                         today_attendance=today_attendance,
                         month_income=month_income,
                         month_expenses=month_expenses,
                         profit=month_income - month_expenses)


# ===== УЧЕНИКИ =====

@app.route('/students')
@login_required
def students():
    from datetime import date
    all_students = Student.query.order_by(Student.full_name.asc()).all()
    balances = {s.id: calculate_student_balance(s) for s in all_students}

    latest_payment_subquery = db.session.query(
        Payment.student_id,
        db.func.max(Payment.payment_date).label('latest_date')
    ).group_by(Payment.student_id).subquery()

    latest_payments = db.session.query(Payment).join(
        latest_payment_subquery,
        Payment.student_id == latest_payment_subquery.c.student_id
    ).filter(Payment.payment_date == latest_payment_subquery.c.latest_date).all()

    payment_info = {}
    for payment in latest_payments:
        payment_info[payment.student_id] = {
            'date': payment.payment_date.strftime('%d.%m.%Y') if payment.payment_date else None,
            'amount': payment.amount_paid,
            'debt': payment.amount_due
        }
    
    # Подсчет баллов для текущего месяца
    current_month = date.today().month
    current_year = date.today().year
    student_points = {}
    for student in all_students:
        total_points = get_student_points_sum(student.id, current_month, current_year)
        student_points[student.id] = total_points

    # Убедиться, что у всех учеников есть код Telegram
    for student in all_students:
        ensure_student_has_telegram_code(student)
    
    return render_template('students.html',
                           students=all_students,
                           payment_info=payment_info,
                           balances=balances,
                           student_points=student_points)


@app.route('/groups')
@login_required
def groups_page():
    return render_template('groups.html')


@app.route('/api/students', methods=['GET'])
@login_required
def get_students_list():
    """Возвращает всех учеников для фильтров"""
    students = Student.query.order_by(Student.full_name.asc()).all()
    result = []
    for student in students:
        result.append({
            'id': student.id,
            'full_name': student.full_name,
            'student_number': student.student_number,
            'group_id': student.group_id,
            'group_name': student.group.name if student.group else None,
            'status': student.status,
            'photo_path': student.photo_path,
            'admission_date': student.admission_date.isoformat() if student.admission_date else None
        })
    return jsonify(result)


@app.route('/api/students/add', methods=['POST'])
@login_required
def add_student():
    try:
        full_name = request.form.get('full_name')
        phone = request.form.get('phone')
        parent_phone = request.form.get('parent_phone')
        photo = request.files.get('photo')
        
        # Новые поля
        group_id = request.form.get('group_id')
        tariff_id = request.form.get('tariff_id')
        school_number = request.form.get('school_number')
        city = request.form.get('city')
        district = request.form.get('district')
        street = request.form.get('street')
        house_number = request.form.get('house_number')
        
        birth_year = request.form.get('birth_year')
        passport_series = request.form.get('passport_series')
        passport_number = request.form.get('passport_number')
        passport_issued_by = request.form.get('passport_issued_by')
        passport_issue_date = request.form.get('passport_issue_date')
        passport_expiry_date = request.form.get('passport_expiry_date')
        admission_date_raw = request.form.get('admission_date')
        
        club_funded = request.form.get('club_funded') == 'true'
        status = request.form.get('status', 'active')
        blacklist_reason = request.form.get('blacklist_reason')
        student_number = (request.form.get('student_number') or '').strip()
        group_id_int = int(group_id) if group_id else None
        
        # Если номер не указан, автогенерируем
        if not student_number and group_id_int:
            student_number = get_next_available_student_number(group_id_int)
        
        if not student_number:
            return jsonify({'success': False, 'message': 'Номер ученика обязателен'}), 400
        
        # Валидация номера
        is_valid, error_msg = validate_student_number(student_number, group_id_int)
        if not is_valid:
            return jsonify({'success': False, 'message': error_msg}), 400
        
        # Проверить, не переполнена ли группа
        if group_id:
            group = db.session.get(Group, int(group_id))
            if group and group.is_full():
                current_count = group.get_current_students_count()
                return jsonify({
                    'success': False, 
                    'message': f'Группа "{group.name}" заполнена ({current_count}/{group.max_students})'
                }), 400
        
        if admission_date_raw:
            try:
                admission_date = datetime.strptime(admission_date_raw, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'success': False, 'message': 'Некорректная дата принятия'}), 400
        else:
            admission_date = get_local_date()

        # Параметры ученика
        height = request.form.get('height')
        weight = request.form.get('weight')
        jersey_size = request.form.get('jersey_size')
        shorts_size = request.form.get('shorts_size')
        boots_size = request.form.get('boots_size')
        equipment_notes = request.form.get('equipment_notes')
        
        # Helper for safe int/float conversion
        def safe_int(val, default=None):
            try: return int(val) if val else default
            except (ValueError, TypeError): return default

        def safe_float(val, default=None):
            try: return float(val) if val else default
            except (ValueError, TypeError): return default

        # Создать ученика
        student = Student(
            student_number=student_number,
            school_number=school_number,
            full_name=full_name,
            phone=phone,
            parent_phone=parent_phone,
            balance=0,
            status=status,
            blacklist_reason=blacklist_reason if status == 'blacklist' else None,
            group_id=group_id_int,
            tariff_id=safe_int(tariff_id),
            telegram_link_code=generate_telegram_link_code(),
            city=city,
            district=district,
            street=street,
            house_number=house_number,
            birth_year=safe_int(birth_year),
            passport_series=passport_series,
            passport_number=passport_number,
            passport_issued_by=passport_issued_by,
            passport_issue_date=datetime.strptime(passport_issue_date, '%Y-%m-%d').date() if (passport_issue_date and passport_issue_date.strip()) else None,
            passport_expiry_date=datetime.strptime(passport_expiry_date, '%Y-%m-%d').date() if (passport_expiry_date and passport_expiry_date.strip()) else None,
            admission_date=admission_date,
            club_funded=club_funded,
            height=safe_int(height),
            weight=safe_float(weight),
            jersey_size=jersey_size,
            shorts_size=shorts_size,
            boots_size=boots_size,
            equipment_notes=equipment_notes
        )
        db.session.add(student)
        db.session.flush()
        
        # Сохранить фото и извлечь face encoding
        if photo:
            photo_path = face_service.save_student_photo(photo, student.id)
            student.photo_path = photo_path
            
            encoding = face_service.extract_embedding(photo_path)
            if encoding is not None:
                student.set_face_encoding(encoding)
            else:
                # Если лицо не найдено, не блокируем создание, просто нет вектора
                print(f"⚠️ Лицо не обнаружено для студента {student.id}, пропускаем создание вектора")
        
        db.session.commit()
        
        # Перезагрузить encodings
        reload_face_encodings()
        
        return jsonify({'success': True, 'student_id': student.id, 'student_number': student_number})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/students/<int:student_id>', methods=['GET'])
@login_required
def get_student(student_id):
    student = Student.query.get_or_404(student_id)
    
    # Явно загружаем тариф, если он есть
    tariff_name = None
    tariff_price = 500000  # Дефолтная цена
    if student.tariff_id:
        tariff = db.session.get(Tariff, student.tariff_id)
        if tariff:
            tariff_name = tariff.name
            tariff_price = float(tariff.price) if tariff.price else 500000
    elif student.tariff:
        # Если тариф загружен через relationship
        tariff_name = student.tariff.name if student.tariff.name else None
        tariff_price = float(student.tariff.price) if student.tariff.price else 500000
    
    # Получить информацию о группе и расписании
    group_schedule_days = []
    group_schedule_time = None
    if student.group_id:
        # Явно загружаем группу
        group = db.session.get(Group, student.group_id)
        if group:
            group_schedule_days = group.get_schedule_days_list()
            group_schedule_time = group.schedule_time if group.schedule_time else None
    
    return jsonify({
        'id': student.id,
        'student_number': student.student_number,
        'school_number': student.school_number,
        'full_name': student.full_name,
        'phone': student.phone,
        'parent_phone': student.parent_phone,
        'balance': calculate_student_balance(student),
        'status': student.status,
        'blacklist_reason': student.blacklist_reason,
        'group_id': student.group_id,
        'tariff_id': student.tariff_id,
        'tariff_name': tariff_name,
        'tariff_price': tariff_price,
        'city': student.city,
        'district': student.district,
        'street': student.street,
        'house_number': student.house_number,
        'birth_year': student.birth_year,
        'passport_series': student.passport_series,
        'passport_number': student.passport_number,
        'passport_issued_by': student.passport_issued_by,
        'passport_issue_date': student.passport_issue_date.isoformat() if student.passport_issue_date else None,
        'passport_expiry_date': student.passport_expiry_date.isoformat() if student.passport_expiry_date else None,
        'admission_date': student.admission_date.isoformat() if student.admission_date else None,
        'club_funded': student.club_funded,
        'telegram_link_code': student.telegram_link_code,
        'telegram_chat_id': student.telegram_chat_id,
        'telegram_notifications_enabled': student.telegram_notifications_enabled,
        'telegram_link_code': student.telegram_link_code,
        'telegram_chat_id': student.telegram_chat_id,
        'telegram_notifications_enabled': student.telegram_notifications_enabled,
        'photo_path': student.photo_path,
        'height': student.height,
        'weight': student.weight,
        'jersey_size': student.jersey_size,
        'shorts_size': student.shorts_size,
        'boots_size': student.boots_size,
        'equipment_notes': student.equipment_notes,
        'group_schedule_days': group_schedule_days,  # Дни недели занятий (1=Пн, 7=Вс)
        'group_schedule_time': group_schedule_time  # Время начала занятия (HH:MM)
    })


@app.route('/api/students/<int:student_id>', methods=['PUT'])
@login_required
def update_student(student_id):
    try:
        student = Student.query.get_or_404(student_id)
        
        # Определить группу для валидации
        current_group_id = student.group_id
        if 'group_id' in request.form:
            new_group_id = int(request.form['group_id']) if request.form['group_id'] else None
            # Если группа меняется, нужно проверить номер в новой группе
            if new_group_id != current_group_id:
                current_group_id = new_group_id
        
        if 'student_number' in request.form:
            new_student_number = request.form['student_number'].strip()
            if not new_student_number:
                return jsonify({'success': False, 'message': 'Номер ученика не может быть пустым'}), 400
            
            # Валидация номера
            is_valid, error_msg = validate_student_number(new_student_number, current_group_id, exclude_student_id=student.id)
            if not is_valid:
                return jsonify({'success': False, 'message': error_msg}), 400
            
            student.student_number = new_student_number

        # Обновить поля из формы
        if 'full_name' in request.form:
            student.full_name = request.form['full_name']
        if 'school_number' in request.form:
            student.school_number = request.form['school_number'] or None
        if 'phone' in request.form:
            student.phone = request.form['phone'] or None
        if 'parent_phone' in request.form:
            student.parent_phone = request.form['parent_phone'] or None
        if 'status' in request.form:
            student.status = request.form['status']
            if request.form['status'] != 'blacklist':
                student.blacklist_reason = None
        if 'blacklist_reason' in request.form:
            student.blacklist_reason = request.form['blacklist_reason'] or None
        if 'group_id' in request.form:
            new_group_id = int(request.form['group_id']) if request.form['group_id'] else None
            old_group_id = student.group_id
            
            # Проверить, не переполнена ли новая группа (если группа меняется)
            if new_group_id and new_group_id != old_group_id:
                new_group = db.session.get(Group, new_group_id)
                if new_group and new_group.is_full():
                    current_count = new_group.get_current_students_count()
                    return jsonify({
                        'success': False, 
                        'message': f'Группа "{new_group.name}" заполнена ({current_count}/{new_group.max_students})'
                    }), 400
                
                # Если группа меняется, проверить номер в новой группе
                # Если номер занят в новой группе, предложить свободный
                is_valid, error_msg = validate_student_number(student.student_number, new_group_id, exclude_student_id=student.id)
                if not is_valid:
                    # Автоматически назначить свободный номер
                    free_number = get_next_available_student_number(new_group_id)
                    student.student_number = free_number
            
            student.group_id = new_group_id
        # Helper for safe int/float conversion
        def safe_int(val, default=None):
            try: return int(val) if val else default
            except (ValueError, TypeError): return default

        def safe_float(val, default=None):
            try: return float(val) if val else default
            except (ValueError, TypeError): return default

        if 'tariff_id' in request.form:
            student.tariff_id = safe_int(request.form['tariff_id'])
        if 'city' in request.form:
            student.city = request.form['city'] or None
        if 'district' in request.form:
            student.district = request.form['district'] or None
        if 'street' in request.form:
            student.street = request.form['street'] or None
        if 'house_number' in request.form:
            student.house_number = request.form['house_number'] or None
        if 'birth_year' in request.form:
            student.birth_year = safe_int(request.form['birth_year'])
        if 'passport_series' in request.form:
            student.passport_series = request.form['passport_series'] or None
        if 'passport_number' in request.form:
            student.passport_number = request.form['passport_number'] or None
        if 'passport_issued_by' in request.form:
            student.passport_issued_by = request.form['passport_issued_by'] or None
        if 'passport_issue_date' in request.form and request.form['passport_issue_date']:
            try:
                student.passport_issue_date = datetime.strptime(request.form['passport_issue_date'], '%Y-%m-%d').date()
            except ValueError: pass
        if 'passport_expiry_date' in request.form and request.form['passport_expiry_date']:
            try:
                student.passport_expiry_date = datetime.strptime(request.form['passport_expiry_date'], '%Y-%m-%d').date()
            except ValueError: pass
        if 'admission_date' in request.form:
            if request.form['admission_date'] and request.form['admission_date'].strip():
                try:
                    student.admission_date = datetime.strptime(request.form['admission_date'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'success': False, 'message': 'Некорректная дата принятия'}), 400
            else:
                student.admission_date = None
        
        # Обработать чекбокс club_funded
        student.club_funded = 'club_funded' in request.form and request.form['club_funded'] == 'true'
        
        # Параметры ученика
        if 'height' in request.form:
            student.height = safe_int(request.form['height'])
        if 'weight' in request.form:
            student.weight = safe_float(request.form['weight'])
        if 'jersey_size' in request.form:
            student.jersey_size = request.form['jersey_size'] or None
        if 'shorts_size' in request.form:
            student.shorts_size = request.form['shorts_size'] or None
        if 'boots_size' in request.form:
            student.boots_size = request.form['boots_size'] or None
        if 'equipment_notes' in request.form:
            student.equipment_notes = request.form['equipment_notes'] or None
        
        # Обработать новое фото (если загружено)
        if 'photo' in request.files:
            photo = request.files['photo']
            if photo and photo.filename:
                # Удалить старое фото
                if student.photo_path and os.path.exists(student.photo_path):
                    os.remove(student.photo_path)
                
                # Сохранить новое фото
                # Сохранить новое фото через сервис (возвращает корректный относительный путь)
                photo_path = face_service.save_student_photo(photo, student.id)
                student.photo_path = photo_path
                
                # Создать новый face encoding через ArcFace
                try:
                    encoding = face_service.extract_embedding(photo_path)
                    if encoding is not None:
                        student.set_face_encoding(encoding)
                        reload_face_encodings()
                except Exception as e:
                    print(f"Ошибка обработки фото: {e}")
        
        # Убедиться, что у ученика есть код для Telegram
        ensure_student_has_telegram_code(student)
        
        db.session.commit()
        return jsonify({'success': True})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
@login_required
def delete_student(student_id):
    try:
        student = Student.query.get_or_404(student_id)
        student_name = student.full_name
        
        # Удалить все связанные записи перед удалением ученика
        # 1. Удалить карточки ученика
        StudentCard.query.filter_by(student_id=student_id).delete()
        
        # 2. Удалить вознаграждения ученика
        StudentReward.query.filter_by(student_id=student_id).delete()
        
        # 3. Удалить посещаемость ученика
        Attendance.query.filter_by(student_id=student_id).delete()
        
        # 4. Удалить платежи ученика
        Payment.query.filter_by(student_id=student_id).delete()
        
        # 5. Удалить фото ученика, если оно есть
        if student.photo_path and os.path.exists(student.photo_path):
            try:
                os.remove(student.photo_path)
            except Exception as photo_error:
                print(f"Ошибка при удалении фото: {photo_error}")
        
        # 6. Теперь можно безопасно удалить самого ученика
        db.session.delete(student)
        db.session.commit()
        
        # Перезагрузить encodings
        reload_face_encodings()
        
        return jsonify({'success': True, 'message': f'Ученик {student_name} удалён'})
    
    except Exception as e:
        db.session.rollback()
        print(f"Ошибка при удалении ученика {student_id}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== ПЛАТЕЖИ =====

@app.route('/api/payments/add', methods=['POST'])
@login_required
def add_payment():
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        tariff_id = data.get('tariff_id')
        amount_paid = float(data.get('amount_paid'))
        amount_due = float(data.get('amount_due', 0))
        lessons_added = int(data.get('lessons_added', 0))
        is_full_payment = data.get('is_full_payment', True)
        notes = data.get('notes', '')
        
        student = Student.query.get_or_404(student_id)
        tariff = db.session.get(Tariff, tariff_id) if tariff_id else None
        
        # Создать платёж
        payment = Payment(
            student_id=student_id,
            tariff_id=tariff_id,
            amount_paid=amount_paid,
            amount_due=amount_due,
            lessons_added=lessons_added,
            is_full_payment=is_full_payment,
            tariff_name=tariff.name if tariff else None,
            notes=notes,
            created_by=current_user.id
        )
        db.session.add(payment)
        
        # Обновить тип тарифа при полной оплате
        if is_full_payment:
            student.tariff_type = tariff.name if tariff else None
        
        db.session.commit()
        
        # Отправить уведомление в Telegram (для старого метода)
        try:
            from datetime import date
            payment_date = payment.payment_date or date.today()
            payment_month = payment.payment_month if hasattr(payment, 'payment_month') and payment.payment_month else payment_date.month
            payment_year = payment.payment_year if hasattr(payment, 'payment_year') and payment.payment_year else payment_date.year
            month_label = f"{payment_month}/{payment_year}"
            payment_type = getattr(payment, 'payment_type', 'cash') or 'cash'
            
            send_payment_notification(
                student_id=student_id,
                payment_date=payment_date,
                month=month_label,
                payment_type=payment_type,
                amount_paid=amount_paid,
                debt=amount_due if amount_due > 0 else None
            )
            
            # --- УВЕДОМЛЕНИЕ ДЛЯ РУКОВОДСТВА ---
            msg_mgmt = (
                f"💰 <b>Новая оплата!</b>\n"
                f"👤 Ученик: <b>{student.full_name}</b>\n"
                f"💵 Сумма: {format_currency(amount_paid)} сум\n"
                f"📦 Тариф: {tariff.name if tariff else 'Без тарифа'}\n"
                f"🗓 Дата: {payment_date.strftime('%d.%m.%Y')}\n"
            )
            if amount_due > 0:
                msg_mgmt += f"⚠️ Долг: {format_currency(amount_due)} сум\n"
             
            send_management_notification(msg_mgmt, roles=['director', 'founder', 'cashier'])
            
        except Exception as e:
            print(f"Ошибка отправки уведомления об оплате: {e}")
            # Не прерываем выполнение, если уведомление не отправилось
        
        return jsonify({
            'success': True, 
            'new_balance': calculate_student_balance(student),
            'is_full_payment': is_full_payment,
            'amount_due': amount_due
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== ПОСЕЩАЕМОСТЬ =====

@app.route('/attendance')
@login_required
def attendance_page():
    return render_template('attendance.html')


@app.route('/api/attendance/checkin', methods=['POST'])
def attendance_checkin():
    """Отметить вход ученика (вызывается из камеры)"""
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        
        student = Student.query.get_or_404(student_id)
        today = get_local_date()
        now = get_local_datetime()
        
        # Проверить, был ли уже чекин сегодня
        existing = Attendance.query.filter_by(
            student_id=student_id,
            date=today
        ).first()
        
        if existing:
            return jsonify({'success': False, 'message': 'Уже отмечен сегодня'})
        
        # Проверка баланса: пропускаем даже при нуле/минусе, админ решает
        current_balance = calculate_student_balance(student)
        low_balance = (not student.club_funded and current_balance <= 0)
        
        # Определить опоздание
        is_late = False
        late_minutes = 0
        
        if student.group_id:
            group = db.session.get(Group, student.group_id)
            if group and group.schedule_time:
                # Получить время для сегодняшнего дня недели
                weekday = today.weekday()
                schedule_time_str = group.get_schedule_time_for_day(weekday)
                
                if schedule_time_str:
                    # Парсим время из строки HH:MM
                    time_parts = schedule_time_str.split(':')
                    if len(time_parts) == 2:
                        schedule_time = dt_time(int(time_parts[0]), int(time_parts[1]))
                        scheduled_time = datetime.combine(today, schedule_time)
                        time_diff = (now - scheduled_time).total_seconds() / 60
                        
                        if time_diff > group.late_threshold:
                            is_late = True
                            late_minutes = int(time_diff)
        
        # Создать запись посещения
        attendance = Attendance(
            student_id=student_id,
            date=today,
            lesson_deducted=not student.club_funded,
            is_late=is_late,
            late_minutes=late_minutes
        )
        db.session.add(attendance)
        
        # Баланс теперь рассчитывается динамически (оплачено занятий - посещено)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'student_name': student.full_name,
            'remaining_balance': calculate_student_balance(student),
            'is_late': is_late,
            'late_minutes': late_minutes,
            'club_funded': student.club_funded,
            'low_balance': low_balance
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/attendance/manual-checkin', methods=['POST'])
@login_required
def manual_checkin():
    """Ручная фиксация посещения ученика (если камера сломалась)"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'Нет данных в запросе'}), 400
            
        student_id = data.get('student_id')
        year = data.get('year')
        month = data.get('month')
        day = data.get('day')
        
        # Валидация параметров
        if not student_id:
            return jsonify({'success': False, 'message': 'Не указан ID ученика'}), 400
        if not year or not month or not day:
            return jsonify({'success': False, 'message': 'Не указана дата (год, месяц, день)'}), 400
        
        try:
            student_id = int(student_id)
            year = int(year)
            month = int(month)
            day = int(day)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Некорректные параметры (должны быть числа)'}), 400
        
        student = Student.query.get_or_404(student_id)
        
        # Создать дату из параметров с валидацией
        try:
            attendance_date = date(year, month, day)
            print(f"📅 Manual checkin: student_id={student_id}, year={year}, month={month}, day={day} => attendance_date={attendance_date}")
        except ValueError as ve:
            return jsonify({'success': False, 'message': f'Некорректная дата: {str(ve)}'}), 400
            
        now = get_local_datetime()
        
        # Проверить, была ли уже фиксация в этот день
        existing = Attendance.query.filter_by(
            student_id=student_id,
            date=attendance_date
        ).first()
        
        if existing:
            return jsonify({'success': False, 'message': 'Уже отмечен в этот день'})
        
        # Определить опоздание (сравниваем с временем начала занятия в указанный день)
        is_late = False
        late_minutes = 0
        
        if student.group_id:
            group = db.session.get(Group, student.group_id)
            if group and group.schedule_time:
                # Получить время для конкретного дня недели (для JSON) или одно время
                weekday = attendance_date.weekday()
                schedule_time_str = group.get_schedule_time_for_day(weekday)
                
                if schedule_time_str:
                    # Парсим время из строки HH:MM
                    time_parts = schedule_time_str.split(':')
                    if len(time_parts) == 2:
                        schedule_time = dt_time(int(time_parts[0]), int(time_parts[1]))
                        
                        # Время начала занятия в указанный день
                        scheduled_time = datetime.combine(attendance_date, schedule_time)
                        # Текущее время для сравнения
                        current_time = now
                        
                        # Если это прошедший день, считаем что опоздание уже не актуально
                        # Но если это сегодня или будущий день, проверяем опоздание
                        if attendance_date <= get_local_date():
                            time_diff = (current_time - scheduled_time).total_seconds() / 60
                            
                            if time_diff > group.late_threshold:
                                is_late = True
                                late_minutes = int(time_diff)
        
        # Создать запись посещения
        attendance = Attendance(
            student_id=student_id,
            date=attendance_date,
            lesson_deducted=not student.club_funded,
            is_late=is_late,
            late_minutes=late_minutes
        )
        db.session.add(attendance)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Посещение {student.full_name} зафиксировано',
            'attendance_id': attendance.id,
            'check_in_time': now.isoformat(),
            'is_late': is_late,
            'late_minutes': late_minutes
        })
    
    except Exception as e:
        db.session.rollback()
        import traceback
        error_trace = traceback.format_exc()
        print(f"Ошибка ручной фиксации посещения: {error_trace}")
        return jsonify({'success': False, 'message': f'Ошибка: {str(e)}'}), 500


@app.route('/api/attendance/today')
@login_required
def today_attendance():
    """Список присутствующих сегодня"""
    try:
        today = get_local_date()
        records = Attendance.query.filter_by(date=today).all()
        
        result = []
        for record in records:
            if not record.student:
                continue
                
            photo_url = None
            if record.student.photo_path:
                normalized_path = record.student.photo_path.replace('frontend/static/', '').replace('\\', '/').lstrip('/')
                photo_url = url_for('static', filename=normalized_path)
            
            group_name = record.student.group.name if record.student.group else 'Без группы'
            student_balance = calculate_student_balance(record.student)
            low_balance = (not record.student.club_funded) and (student_balance <= 0)
            
            # Безопасное получение времени
            check_in_str = "--:--"
            if record.check_in:
                # Конвертируем в локальное время, если вдруг в БД попало UTC
                c_time = record.check_in
                if c_time.tzinfo is None:
                    # Допустим это UTC, переводим в Ташкент
                    check_in_str = (c_time + timedelta(hours=5)).strftime('%H:%M')
                else:
                    check_in_str = c_time.astimezone(TASHKENT_TZ).strftime('%H:%M')
            elif hasattr(record, 'check_in_time') and record.check_in_time:
                check_in_str = record.check_in_time.strftime('%H:%M')

            result.append({
                'id': record.id,
                'student_name': record.student.full_name,
                'photo_url': photo_url,
                'group_name': group_name,
                'check_in': check_in_str,
                'balance': student_balance,
                'low_balance': low_balance
            })
        
        return jsonify(result)
    except Exception as e:
        print(f"❌ Ошибка в today_attendance: {e}")
        import traceback
        traceback.print_exc()
        return jsonify([])


@app.route('/api/attendance/years')
@login_required
def attendance_years():
    """Возвращает список годов, в которых есть записи посещаемости"""
    from sqlalchemy import extract
    years_query = db.session.query(extract('year', Attendance.check_in).label('year')) \
        .distinct() \
        .order_by(extract('year', Attendance.check_in).desc()) \
        .all()
    years = []
    for item in years_query:
        raw_value = item.year if hasattr(item, 'year') else item[0]
        if raw_value is None:
            continue
        years.append(int(raw_value))
    current_year = get_local_datetime().year
    return jsonify({'years': years, 'current_year': current_year})


@app.route('/api/attendance/all')
@login_required
def all_attendance():
    """Список посещаемости с фильтрами"""
    from sqlalchemy import extract
    
    # Получение параметров фильтров
    year = request.args.get('year')
    month = request.args.get('month')
    group_id = request.args.get('group_id')
    student_id = request.args.get('student_id')
    
    # Базовый запрос
    query = db.session.query(Attendance).join(Student)
    
    # Применение фильтров
    if year:
        query = query.filter(extract('year', Attendance.check_in) == int(year))
    
    if month:
        query = query.filter(extract('month', Attendance.check_in) == int(month))
    
    if student_id:
        query = query.filter(Attendance.student_id == int(student_id))
    
    if group_id:
        query = query.filter(Student.group_id == int(group_id))
    
    # Сортировка по дате (сначала новые)
    records = query.order_by(Attendance.check_in.desc()).all()
    
    result = []
    for record in records:
        result.append({
            'id': record.id,
            'student_id': record.student_id,
            'student_name': record.student.full_name,
            'group_name': record.student.group.name if record.student.group else None,
            'check_in_time': record.check_in.isoformat(),
            'balance': calculate_student_balance(record.student)
        })
    
    return jsonify(result)


@app.route('/api/attendance/analytics', methods=['GET'])
@login_required
def get_attendance_analytics():
    """Аналитика посещаемости"""
    from sqlalchemy import func, extract
    from datetime import date
    
    year = request.args.get('year', type=int)
    if not year:
        year = date.today().year
    
    # Посещаемость по месяцам
    monthly_data = []
    for month in range(1, 13):
        count = db.session.query(func.count(Attendance.id)).filter(
            extract('year', Attendance.check_in) == year,
            extract('month', Attendance.check_in) == month
        ).scalar() or 0
        
        month_names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 
                      'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
        monthly_data.append({
            'month': month,
            'month_name': month_names[month - 1],
            'count': count
        })
    
    # Посещаемость по дням недели (1=Пн, 7=Вс)
    # Получаем все записи за год и группируем по дням недели в Python
    all_attendance = Attendance.query.filter(
        extract('year', Attendance.check_in) == year
    ).all()
    
    weekday_counts = {i: 0 for i in range(1, 8)}  # 1=Пн, 7=Вс
    for att in all_attendance:
        if att.check_in:
            # weekday() возвращает 0=Пн, 6=Вс, конвертируем в 1-7
            weekday = att.check_in.weekday() + 1
            weekday_counts[weekday] = weekday_counts.get(weekday, 0) + 1
    
    weekday_data = [{
        'weekday': weekday,
        'count': weekday_counts[weekday]
    } for weekday in range(1, 8)]
    
    # Посещаемость по группам
    group_stats = db.session.query(
        Group.name.label('group_name'),
        func.count(Attendance.id).label('count')
    ).join(Student, Group.id == Student.group_id)\
     .join(Attendance, Student.id == Attendance.student_id)\
     .filter(extract('year', Attendance.check_in) == year)\
     .group_by(Group.id, Group.name)\
     .all()
    
    groups_data = [{
        'group_name': g.group_name,
        'count': g.count
    } for g in group_stats]
    
    # Статистика опозданий
    total_attendance = db.session.query(func.count(Attendance.id)).filter(
        extract('year', Attendance.check_in) == year
    ).scalar() or 0
    
    total_late = db.session.query(func.count(Attendance.id)).filter(
        extract('year', Attendance.check_in) == year,
        Attendance.is_late == True
    ).scalar() or 0
    
    avg_late = db.session.query(func.avg(Attendance.late_minutes)).filter(
        extract('year', Attendance.check_in) == year,
        Attendance.is_late == True,
        Attendance.late_minutes.isnot(None)
    ).scalar() or 0
    
    late_percentage = round((total_late / total_attendance * 100) if total_attendance > 0 else 0, 1)
    
    return jsonify({
        'monthly': monthly_data,
        'weekdays': weekday_data,
        'groups': groups_data,
        'late_stats': {
            'total_late': total_late,
            'late_percentage': late_percentage,
            'avg_late_minutes': round(avg_late, 1) if avg_late else 0
        }
    })


@app.route('/api/attendance/groups-statistics', methods=['GET'])
@login_required
def get_groups_attendance_statistics():
    """Статистика посещаемости по группам на выбранную дату"""
    from datetime import date, datetime
    
    # Получаем параметры фильтра
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    day = request.args.get('day', type=int)
    
    # Если дата не указана, используем сегодняшнюю
    if not year or not month or not day:
        today = date.today()
        year = year or today.year
        month = month or today.month
        day = day or today.day
    
    selected_date = date(year, month, day)
    weekday = selected_date.weekday() + 1  # 1=Пн, 7=Вс
    
    # Получаем все группы, у которых есть занятия в этот день недели
    all_groups = Group.query.all()
    groups_with_lessons = []
    
    for group in all_groups:
        schedule_days = group.get_schedule_days_list()
        if weekday in schedule_days:
            groups_with_lessons.append(group)
    
    # Получаем всех учеников этих групп и их посещаемость на выбранную дату
    result = []
    
    for group in groups_with_lessons:
        # Получаем всех активных учеников группы
        students = Student.query.filter_by(
            group_id=group.id,
            status='active'
        ).all()
        
        # Получаем посещаемость на выбранную дату
        attendance_records = {}
        attendances = Attendance.query.filter_by(date=selected_date).join(Student).filter(
            Student.group_id == group.id
        ).all()
        
        for att in attendances:
            # Обрабатываем случай, когда check_in может быть None
            check_in_time_iso = None
            if att.check_in:
                check_in_time_iso = att.check_in.isoformat()
            elif att.date:
                # Если check_in отсутствует, но есть date, используем date с временем 00:00:00
                from datetime import datetime, time
                check_in_datetime = datetime.combine(att.date, time.min)
                check_in_time_iso = check_in_datetime.isoformat()
            
            attendance_records[att.student_id] = {
                'id': att.id,  # ID записи посещения для возможности удаления
                'check_in_time': check_in_time_iso,
                'check_in': att.check_in,  # Может быть None, но это нормально
                'is_late': att.is_late if att.is_late else False,
                'late_minutes': att.late_minutes if att.late_minutes else 0
            }
        
        # Формируем список учеников с информацией о посещаемости
        students_list = []
        for student in students:
            attendance = attendance_records.get(student.id)
            
            # Разделяем имя и фамилию
            name_parts = student.full_name.split(' ', 1)
            first_name = name_parts[0] if name_parts else ''
            last_name = name_parts[1] if len(name_parts) > 1 else ''
            
            check_in_time = None
            check_in_datetime = None
            is_late = False
            late_minutes = 0
            attendance_id = None
            if attendance:
                # Всегда получаем ID записи посещения, если она существует
                attendance_id = attendance.get('id')
                # Получаем время, если оно есть
                if attendance.get('check_in'):
                    check_in_time = attendance['check_in_time']
                    check_in_datetime = attendance['check_in'].isoformat()
                is_late = attendance.get('is_late', False)
                late_minutes = attendance.get('late_minutes', 0)
            
            students_list.append({
                'id': student.id,
                'first_name': first_name,
                'last_name': last_name,
                'full_name': student.full_name,
                'photo_path': student.photo_path,
                'has_attended': attendance is not None,
                'check_in_time': check_in_time,
                'check_in_datetime': check_in_datetime,
                'is_late': is_late,
                'late_minutes': late_minutes,
                'attendance_id': attendance_id  # ID записи посещения для удаления
            })
        
        # Сортируем: сначала те, кто пришел (по времени входа), потом те, кто не пришел
        students_list.sort(key=lambda x: (
            not x['has_attended'],  # False (пришел) идет раньше True (не пришел)
            x['check_in_datetime'] if x['check_in_datetime'] else ''  # По времени входа
        ))
        
        result.append({
            'group_id': group.id,
            'group_name': group.name,
            'schedule_time': group.schedule_time if group.schedule_time else None,
            'total_students': len(students_list),
            'attended_count': sum(1 for s in students_list if s['has_attended']),
            'students': students_list
        })
    
    # Сортируем группы по времени занятий
    result.sort(key=lambda x: x['schedule_time'] or '')
    
    return jsonify({
        'date': selected_date.isoformat(),
        'weekday': weekday,
        'groups': result
    })


@app.route('/api/attendance/delete/<int:attendance_id>', methods=['DELETE'])
@login_required
def delete_attendance(attendance_id):
    """Удалить запись посещаемости"""
    record = db.session.get(Attendance, attendance_id)
    
    if not record:
        return jsonify({'success': False, 'message': 'Запись не найдена'}), 404
    
    student = record.student
    
    db.session.delete(record)
    db.session.commit()
    
    # Баланс пересчитывается автоматически после удаления посещения
    return jsonify({
        'success': True,
        'message': f'Запись удалена, баланс {student.full_name}: {calculate_student_balance(student)}'
    })


# ===== РАСХОДЫ =====

@app.route('/expenses')
@login_required
def expenses_page():
    if current_user.role not in ['admin', 'financier']:
        return redirect(url_for('dashboard'))

    ensure_expense_columns()
    expenses = Expense.query.order_by(Expense.expense_date.desc()).limit(50).all()
    return render_template('expenses.html', expenses=expenses)


@app.route('/api/expenses/add', methods=['POST'])
@login_required
def add_expense():
    if current_user.role not in ['admin', 'financier']:
        return jsonify({'success': False, 'message': 'Нет доступа'}), 403

    ensure_expense_columns()
    try:
        data = request.get_json()
        category = (data.get('category') or '').strip()
        incasso_labels = {'инкасация', 'инкассация'}
        is_incasso = category.lower() in incasso_labels
        if is_incasso:
            category = 'Encashment'  # Храним на английском для SQLite
        source = (data.get('expense_source') or 'cash').strip()
        if source not in ['cash', 'bank']:
            source = 'cash'
        # Инкасация всегда идёт из кассы (нал)
        if is_incasso:
            source = 'cash'
        amount = float(data.get('amount'))
        expense = Expense(
            category=category,
            amount=amount,
            description=data.get('description'),
            expense_source=source,
            created_by=current_user.id
        )
        db.session.add(expense)
        db.session.flush()  # Получить ID расхода
        
        # Для инкассации создаём скрытый приход в Р/с
        if is_incasso:
            # Получить первого студента для системных платежей
            system_student = Student.query.first()
            payment = Payment(
                student_id=system_student.id if system_student else 1,
                tariff_id=None,
                amount_paid=amount,
                amount_due=0,
                payment_type='transfer',
                notes=f'Инкассация (Расход #{expense.id})',
                lessons_added=0,
                created_by=current_user.id
            )
            db.session.add(payment)
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/expenses/<int:expense_id>', methods=['PUT'])
@login_required
def update_expense(expense_id):
    if current_user.role not in ['admin', 'financier']:
        return jsonify({'success': False, 'message': 'Нет доступа'}), 403

    ensure_expense_columns()
    try:
        data = request.get_json() or {}
        expense = db.session.get(Expense, expense_id)
        if not expense:
            return jsonify({'success': False, 'message': 'Расход не найден'}), 404

        if 'category' in data:
            category = (data.get('category') or '').strip()
            incasso_labels = {'инкасация', 'инкассация'}
            if category.lower() in incasso_labels:
                category = 'Encashment'  # Храним на английском для SQLite
            expense.category = category
        old_amount = expense.amount
        new_amount = float(data.get('amount')) if 'amount' in data else old_amount
        
        if 'amount' in data:
            expense.amount = new_amount
        if 'description' in data:
            expense.description = data.get('description')
        if 'expense_source' in data:
            source = (data.get('expense_source') or 'cash').strip()
            # Проверяем уже обновлённую категорию или старую
            if expense.category == 'Encashment':
                source = 'cash'
            if source in ['cash', 'bank']:
                expense.expense_source = source
        
        # Обновить связанный платёж инкассации, если сумма изменилась
        if expense.category == 'Encashment' and new_amount != old_amount:
            related_payment = Payment.query.filter(
                Payment.notes.like(f'Инкассация (Расход #{expense_id})')
            ).first()
            if related_payment:
                related_payment.amount_paid = new_amount

        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
@login_required
def delete_expense(expense_id):
    """Удалить расход"""
    if current_user.role not in ['admin', 'financier']:
        return jsonify({'success': False, 'message': 'Нет доступа'}), 403

    try:
        expense = db.session.get(Expense, expense_id)
        if not expense:
            return jsonify({'success': False, 'message': 'Расход не найден'}), 404
        
        # Удалить связанный платёж инкассации
        if expense.category == 'Encashment':
            related_payment = Payment.query.filter(
                Payment.notes.like(f'Инкассация (Расход #{expense_id})')
            ).first()
            if related_payment:
                db.session.delete(related_payment)

        db.session.delete(expense)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Расход удалён'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== ФИНАНСЫ =====

@app.route('/finances')
@login_required
def finances_page():
    """Страница финансов"""
    return render_template('finances.html')


@app.route('/settings')
@login_required
def club_settings_page():
    """Страница настроек клуба"""
    if getattr(current_user, 'role', None) not in ['admin', 'financier']:
        return redirect(url_for('dashboard'))
    return render_template('settings.html')


# ===== МОБИЛЬНАЯ ВЕРСИЯ ДЛЯ ОПЛАТ =====

@app.route('/mobile-payments')
@login_required
def mobile_payments():
    """Мобильная страница для добавления оплат"""
    if current_user.role not in ['payment_admin', 'admin']:
        return redirect(url_for('dashboard'))
    return render_template('mobile_payment.html')


@app.route('/mobile-payment-history')
@login_required
def mobile_payment_history():
    """История оплат для мобильной версии"""
    if current_user.role not in ['payment_admin', 'admin']:
        return redirect(url_for('dashboard'))
    return render_template('mobile_payment_history.html')


@app.route('/api/mobile/payment-history', methods=['GET'])
@login_required
def get_mobile_payment_history():
    """Получить историю оплат для мобильной версии"""
    if current_user.role not in ['payment_admin', 'admin']:
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    # Получить все оплаты, отсортированные по дате
    payments = db.session.query(
        Payment.id,
        Payment.student_id,
        Payment.amount_paid,
        Payment.payment_date,
        Payment.payment_month,
        Payment.payment_year,
        Payment.notes,
        Payment.created_by,
        Student.full_name.label('student_name')
    ).join(Student).order_by(Payment.payment_date.desc()).limit(100).all()
    
    result = []
    for p in payments:
        result.append({
            'id': p.id,
            'student_id': p.student_id,
            'student_name': p.student_name,
            'amount_paid': p.amount_paid,
            'payment_date': p.payment_date.isoformat(),
            'payment_month': p.payment_month,
            'payment_year': p.payment_year,
            'notes': p.notes,
            'created_by': p.created_by
        })
    
    return jsonify(result)


# ===== МОБИЛЬНАЯ ВЕРСИЯ ДЛЯ УЧИТЕЛЯ =====

@app.route('/teacher-attendance')
@login_required
def teacher_attendance():
    """Мобильная страница переклички для учителя"""
    if current_user.role not in ['teacher', 'admin']:
        return redirect(url_for('dashboard'))
    return render_template('teacher_attendance.html')


@app.route('/api/teacher/mark-attendance', methods=['POST'])
@login_required
def teacher_mark_attendance():
    """Отметить посещаемость ученика"""
    if current_user.role not in ['teacher', 'admin']:
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    try:
        data = request.json
        student_id = data.get('student_id')
        status = data.get('status')  # 'present', 'absent', 'late'
        date_str = data.get('date')
        
        if not all([student_id, status, date_str]):
            return jsonify({'error': 'Недостаточно данных'}), 400
        
        # Проверить, существует ли уже запись на сегодня
        attendance_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        existing = Attendance.query.filter_by(
            student_id=student_id,
            date=attendance_date
        ).first()
        
        if existing:
            # Обновить существующую запись
            existing.status = status
            existing.check_in_time = datetime.now().time() if status == 'present' else None
        else:
            # Создать новую запись
            attendance = Attendance(
                student_id=student_id,
                date=attendance_date,
                status=status,
                check_in_time=datetime.now().time() if status == 'present' else None
            )
            db.session.add(attendance)
        
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Статус сохранен'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/teacher/today-attendance', methods=['GET'])
@login_required
def teacher_today_attendance():
    """Получить сегодняшнюю посещаемость для группы учителя"""
    if current_user.role not in ['teacher', 'admin']:
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    # Получить group_id учителя
    group_id = current_user.group_id if current_user.role == 'teacher' else request.args.get('group_id', type=int)
    
    if not group_id:
        return jsonify({'error': 'Группа не указана'}), 400
    
    today = date.today()
    
    # Получить сегодняшнюю посещаемость
    attendance_records = Attendance.query.filter_by(date=today).all()
    
    result = {}
    for record in attendance_records:
        if record.student and record.student.group_id == group_id:
            result[record.student_id] = {
                'status': record.status,
                'check_in_time': record.check_in_time.strftime('%H:%M') if record.check_in_time else None
            }
    
    return jsonify(result)


@app.route('/api/finances/income', methods=['GET'])
@login_required
def get_income_stats():
    """Статистика прихода"""
    from datetime import date
    from sqlalchemy import func, extract
    
    today = date.today()
    
    # Сегодня
    income_today = db.session.query(func.sum(Payment.amount_paid)).filter(
        func.date(Payment.payment_date) == today
    ).scalar() or 0
    
    # Этот месяц
    income_month = db.session.query(func.sum(Payment.amount_paid)).filter(
        extract('year', Payment.payment_date) == today.year,
        extract('month', Payment.payment_date) == today.month
    ).scalar() or 0
    
    # Всего
    income_total = db.session.query(func.sum(Payment.amount_paid)).scalar() or 0
    
    # Последние платежи
    payments = db.session.query(
        Payment,
        Student.full_name.label('student_name'),
        Student.group_id.label('group_id'),
        Student.tariff_id.label('student_tariff_id'),
        Group.name.label('group_name'),
        Tariff.name.label('student_tariff_name')
    ).join(Student, Payment.student_id == Student.id, isouter=True) \
     .join(Group, Student.group_id == Group.id, isouter=True) \
     .join(Tariff, Student.tariff_id == Tariff.id, isouter=True) \
     .order_by(Payment.payment_date.desc()).limit(50).all()
    
    payments_list = [{
        'id': p.Payment.id,
        'payment_date': p.Payment.payment_date.isoformat(),
        'student_id': p.Payment.student_id,
        'student_name': p.student_name,
        'group_id': p.group_id,
        'group_name': p.group_name,
        'tariff_name': p.Payment.tariff_name or p.student_tariff_name or '-',
        'amount_paid': p.Payment.amount_paid,
        'amount_due': p.Payment.amount_due,
        'is_full_payment': p.Payment.is_full_payment,
        'payment_type': getattr(p.Payment, 'payment_type', 'cash') or 'cash',
        'notes': p.Payment.notes
    } for p in payments]
    
    return jsonify({
        'today': income_today,
        'month': income_month,
        'total': income_total,
        'payments': payments_list
    })


@app.route('/api/finances/balance', methods=['GET'])
@login_required
def get_balance_breakdown():
    """Агрегация баланса по наличным и р/с"""
    # Включаем все безналичные типы, в т.ч. alias transfer/перечисление
    bank_methods = {
        'paynet', 'oson', 'click', 'payme', 'xazna', 'перечисление', 'transfer', 'uzum', 'uzcard', 'humo', 'card'
    }

    # Приходы (теперь transfer payments от инкассации автоматически попадут в bank_income)
    total_income = db.session.query(func.sum(Payment.amount_paid)).scalar() or 0
    bank_income = db.session.query(func.sum(Payment.amount_paid)).filter(
        func.lower(func.trim(func.coalesce(Payment.payment_type, 'cash'))).in_(bank_methods)
    ).scalar() or 0
    cash_income = total_income - bank_income

    # Расходы (все расходы считаем нормально, инкассация уже не особый случай)
    bank_expense = db.session.query(func.sum(Expense.amount)).filter(
        func.lower(func.trim(func.coalesce(Expense.expense_source, ''))) == 'bank'
    ).scalar() or 0

    cash_expense = db.session.query(func.sum(Expense.amount)).filter(
        func.lower(func.trim(func.coalesce(Expense.expense_source, ''))) != 'bank'
    ).scalar() or 0

    total_expense = bank_expense + cash_expense

    cash_balance = cash_income - cash_expense
    bank_balance = bank_income - bank_expense
    total_balance = cash_balance + bank_balance

    return jsonify({
        'cash_income': cash_income,
        'bank_income': bank_income,
        'cash_expense': cash_expense,
        'bank_expense': bank_expense,
        'cash_balance': cash_balance,
        'bank_balance': bank_balance,
        'total_income': total_income,
        'total_expense': total_expense,
        'total_balance': total_balance
    })


@app.route('/api/finances/debtors', methods=['GET'])
@login_required
def get_debtors():
    """Список должников с помесячной детализацией"""
    from datetime import date, datetime
    from sqlalchemy import func, extract
    
    # Получить всех активных учеников с тарифами
    students = Student.query.filter(
        Student.status == 'active',
        Student.tariff_id.isnot(None)
    ).all()
    
    current_year = date.today().year
    current_month = date.today().month
    
    debtors_list = []
    total_debt = 0
    
    for student in students:
        if not student.tariff:
            continue
            
        tariff_price = float(student.tariff.price)
        
        # Определить с какого месяца начинать проверку
        if student.admission_date:
            start_year = student.admission_date.year
            start_month = student.admission_date.month
        else:
            start_year = current_year
            start_month = 1
        
        # Проверить каждый месяц от даты принятия до текущего месяца
        year = start_year
        month = start_month
        
        while (year < current_year) or (year == current_year and month <= current_month):
            month_key = f"{year}-{str(month).zfill(2)}"
            
            # Получить платежи за этот месяц
            month_payments = Payment.query.filter(
                Payment.student_id == student.id,
                Payment.payment_year == year,
                Payment.payment_month == month
            ).all()
            
            total_paid = sum(p.amount_paid for p in month_payments)
            debt = max(0, tariff_price - total_paid)
            
            if debt > 0:
                total_debt += debt
                debtors_list.append({
                    'student_id': student.id,
                    'student_name': student.full_name,
                    'student_phone': student.phone or student.parent_phone or '-',
                    'tariff_name': student.tariff.name,
                    'tariff_price': tariff_price,
                    'amount_paid': total_paid,
                    'amount_due': debt,
                    'month': month,
                    'year': year,
                    'month_label': f"{month}/{year}"
                })
            
            # Следующий месяц
            month += 1
            if month > 12:
                month = 1
                year += 1
    
    unique_debtors = len({d['student_id'] for d in debtors_list})

    return jsonify({
        'total_debt': total_debt,
        'count': unique_debtors,
        'debtors': debtors_list
    })


@app.route('/api/finances/expenses', methods=['GET'])
@login_required
def get_expense_stats():
    """Статистика расходов"""
    from datetime import date
    from sqlalchemy import func, extract
    
    ensure_expense_columns()
    today = date.today()
    
    # Сегодня
    expense_today = db.session.query(func.sum(Expense.amount)).filter(
        func.date(Expense.expense_date) == today
    ).scalar() or 0
    
    # Этот месяц
    expense_month = db.session.query(func.sum(Expense.amount)).filter(
        extract('year', Expense.expense_date) == today.year,
        extract('month', Expense.expense_date) == today.month
    ).scalar() or 0
    
    # Всего
    expense_total = db.session.query(func.sum(Expense.amount)).scalar() or 0
    
    # Последние расходы
    expenses = Expense.query.order_by(Expense.expense_date.desc()).limit(50).all()
    
    expenses_list = [{
        'id': e.id,
        'expense_date': e.expense_date.isoformat(),
        'category': e.category,
        'amount': e.amount,
        'description': e.description,
        'expense_source': getattr(e, 'expense_source', 'cash') or 'cash'
    } for e in expenses]
    
    return jsonify({
        'today': expense_today,
        'month': expense_month,
        'total': expense_total,
        'expenses': expenses_list
    })


@app.route('/api/finances/analytics', methods=['GET'])
@login_required
def get_analytics():
    """Аналитика по месяцам"""
    from sqlalchemy import func, extract
    from datetime import datetime, date
    
    # Получить данные за последние 12 месяцев
    months_data = []
    
    for i in range(11, -1, -1):
        target_date = date.today().replace(day=1)
        month = target_date.month - i
        year = target_date.year
        
        if month <= 0:
            month += 12
            year -= 1
        
        # Приход за месяц
        income = db.session.query(func.sum(Payment.amount_paid)).filter(
            extract('year', Payment.payment_date) == year,
            extract('month', Payment.payment_date) == month
        ).scalar() or 0
        
        # Расход за месяц
        expense = db.session.query(func.sum(Expense.amount)).filter(
            extract('year', Expense.expense_date) == year,
            extract('month', Expense.expense_date) == month
        ).scalar() or 0
        
        # Название месяца
        month_names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 
                      'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
        month_name = f"{month_names[month - 1]} {year}"
        
        months_data.append({
            'month_name': month_name,
            'income': income,
            'expense': expense
        })
    
    return jsonify({'months': months_data})


@app.route('/api/finances/monthly', methods=['GET'])
@login_required
def get_finances_monthly():
    """Данные по месяцам: приход, расход, остаток (приход - расход)"""
    from sqlalchemy import func, extract
    from datetime import date

    # Получаем год из параметра запроса или используем текущий
    year = request.args.get('year', type=int)
    if not year:
        year = date.today().year

    months = []
    # Последовательность месяцев: январь..декабрь выбранного года
    for month in range(1, 12 + 1):
        income = db.session.query(func.sum(Payment.amount_paid)).filter(
            extract('year', Payment.payment_date) == year,
            extract('month', Payment.payment_date) == month
        ).scalar() or 0
        expense = db.session.query(func.sum(Expense.amount)).filter(
            extract('year', Expense.expense_date) == year,
            extract('month', Expense.expense_date) == month
        ).scalar() or 0
        balance = float(income) - float(expense)
        months.append({
            'income': float(income),
            'expense': float(expense),
            'balance': balance
        })

    return jsonify({'months': months})


# ===== ГРУППЫ =====

@app.route('/api/groups', methods=['GET'])
@login_required
def get_groups():
    """Получить список всех групп"""
    groups = Group.query.all()
    return jsonify([{
        'id': g.id,
        'name': g.name,
        'schedule_time': g.schedule_time if g.schedule_time else '--:--',
        'duration_minutes': g.duration_minutes or 60,
        'field_blocks': g.field_blocks or 1,
        'field_block_indices': g.get_field_block_indices(),
        'late_threshold': g.late_threshold,
        'max_students': g.max_students,
        'notes': g.notes,
        'schedule_days': g.get_schedule_days_list(),
        'schedule_days_label': g.get_schedule_days_display(),
        'student_count': len(g.students),
        'active_student_count': g.get_current_students_count(),
        'is_full': g.is_full()
    } for g in groups])


@app.route('/api/club-settings', methods=['GET'])
@login_required
def get_club_settings():
    ensure_club_settings_columns()
    settings = get_club_settings_instance()
    try:
        expense_categories_raw = getattr(settings, 'expense_categories', '') or ''
        expense_categories = json.loads(expense_categories_raw) if expense_categories_raw else []
        if not isinstance(expense_categories, list):
            expense_categories = []
    except Exception:
        expense_categories = []

    if not expense_categories:
        expense_categories = [
            'Аренда', 'Зарплата', 'Оборудование', 'Коммунальные услуги',
            'Ремонт стадиона', 'Дивидент', 'Прочее'
        ]
    
    # Фильтруем техническую категорию "Encashment" - она не должна показываться пользователю
    # В интерфейсе "Инкасация" добавляется автоматически
    expense_categories = [cat for cat in expense_categories if cat != 'Encashment']
    
    return jsonify({
        'system_name': settings.system_name or 'FK QORASUV',
        'working_days': settings.get_working_days_list(),
        'work_start_time': settings.work_start_time.strftime('%H:%M'),
        'work_end_time': settings.work_end_time.strftime('%H:%M'),
        'max_groups_per_slot': settings.max_groups_per_slot,
        'block_future_payments': bool(getattr(settings, 'block_future_payments', False)),
        'rewards_reset_period_months': getattr(settings, 'rewards_reset_period_months', 1),
        'podium_display_count': getattr(settings, 'podium_display_count', 20),
        'telegram_bot_url': getattr(settings, 'telegram_bot_url', '') or '',
        'telegram_bot_token': getattr(settings, 'telegram_bot_token', '') or '',
        'telegram_notification_template': getattr(settings, 'telegram_notification_template', '') or '',
        'telegram_reward_template': getattr(settings, 'telegram_reward_template', '') or '',
        'telegram_card_template': getattr(settings, 'telegram_card_template', '') or '',
        'telegram_payment_template': getattr(settings, 'telegram_payment_template', '') or '',
        'rtsp_url': getattr(settings, 'rtsp_url', '') or '',
        'payment_click_enabled': bool(getattr(settings, 'payment_click_enabled', False)),
        'payment_click_qr_url': getattr(settings, 'payment_click_qr_url', '') or '',
        'payment_payme_enabled': bool(getattr(settings, 'payment_payme_enabled', False)),
        'payment_payme_qr_url': getattr(settings, 'payment_payme_qr_url', '') or '',
        'payment_uzum_enabled': bool(getattr(settings, 'payment_uzum_enabled', False)),
        'payment_uzum_qr_url': getattr(settings, 'payment_uzum_qr_url', '') or '',
        'payment_uzcard_enabled': bool(getattr(settings, 'payment_uzcard_enabled', False)),
        'payment_humo_enabled': bool(getattr(settings, 'payment_humo_enabled', False)),
        'payment_paynet_enabled': bool(getattr(settings, 'payment_paynet_enabled', False)),
        'payment_paynet_qr_url': getattr(settings, 'payment_paynet_qr_url', '') or '',
        'payment_xazna_enabled': bool(getattr(settings, 'payment_xazna_enabled', False)),
        'payment_xazna_qr_url': getattr(settings, 'payment_xazna_qr_url', '') or '',
        'payment_oson_enabled': bool(getattr(settings, 'payment_oson_enabled', False)),
        'payment_oson_qr_url': getattr(settings, 'payment_oson_qr_url', '') or '',
        'payment_transfer_enabled': bool(getattr(settings, 'payment_transfer_enabled', False)),
        # Телефоны руководства
        'director_phone': getattr(settings, 'director_phone', '') or '',
        'founder_phone': getattr(settings, 'founder_phone', '') or '',
        'cashier_phone': getattr(settings, 'cashier_phone', '') or '',
        'expense_categories': expense_categories
    })


@app.route('/api/club-settings', methods=['PUT'])
@login_required
def update_club_settings():
    try:
        data = request.get_json()
        ensure_club_settings_columns()
        settings = get_club_settings_instance()

        def get_bool_setting(key, default_value):
            if key in data:
                return bool(data.get(key))
            return bool(default_value)

        def get_str_setting(key, default_value):
            if key in data:
                return (data.get(key) or '').strip()
            return (default_value or '').strip()

        system_name = (data.get('system_name') or '').strip() or 'FK QORASUV'
        working_days = parse_days_list(data.get('working_days'))
        work_start_time = datetime.strptime(data.get('work_start_time'), '%H:%M').time()
        work_end_time = datetime.strptime(data.get('work_end_time'), '%H:%M').time()
        max_groups_per_slot = int(data.get('max_groups_per_slot', 1))
        block_future_payments = bool(data.get('block_future_payments', False))
        rewards_reset_period_months = int(data.get('rewards_reset_period_months', 1))
        podium_display_count = int(data.get('podium_display_count', 20))
        telegram_bot_url = (data.get('telegram_bot_url') or '').strip()
        telegram_bot_token = (data.get('telegram_bot_token') or '').strip()
        telegram_notification_template = (data.get('telegram_notification_template') or '').strip()
        telegram_reward_template = (data.get('telegram_reward_template') or '').strip()
        telegram_card_template = (data.get('telegram_card_template') or '').strip()
        telegram_payment_template = (data.get('telegram_payment_template') or '').strip()
        rtsp_url = (data.get('rtsp_url') or '').strip()
        payment_click_enabled = get_bool_setting('payment_click_enabled', getattr(settings, 'payment_click_enabled', False))
        payment_click_qr_url = get_str_setting('payment_click_qr_url', getattr(settings, 'payment_click_qr_url', '') or '')
        payment_payme_enabled = get_bool_setting('payment_payme_enabled', getattr(settings, 'payment_payme_enabled', False))
        payment_payme_qr_url = get_str_setting('payment_payme_qr_url', getattr(settings, 'payment_payme_qr_url', '') or '')
        payment_uzum_enabled = get_bool_setting('payment_uzum_enabled', getattr(settings, 'payment_uzum_enabled', False))
        payment_uzum_qr_url = get_str_setting('payment_uzum_qr_url', getattr(settings, 'payment_uzum_qr_url', '') or '')
        payment_uzcard_enabled = get_bool_setting('payment_uzcard_enabled', getattr(settings, 'payment_uzcard_enabled', False))
        payment_humo_enabled = get_bool_setting('payment_humo_enabled', getattr(settings, 'payment_humo_enabled', False))
        payment_paynet_enabled = get_bool_setting('payment_paynet_enabled', getattr(settings, 'payment_paynet_enabled', False))
        payment_paynet_qr_url = get_str_setting('payment_paynet_qr_url', getattr(settings, 'payment_paynet_qr_url', '') or '')
        payment_xazna_enabled = get_bool_setting('payment_xazna_enabled', getattr(settings, 'payment_xazna_enabled', False))
        payment_xazna_qr_url = get_str_setting('payment_xazna_qr_url', getattr(settings, 'payment_xazna_qr_url', '') or '')
        payment_oson_enabled = get_bool_setting('payment_oson_enabled', getattr(settings, 'payment_oson_enabled', False))
        payment_oson_qr_url = get_str_setting('payment_oson_qr_url', getattr(settings, 'payment_oson_qr_url', '') or '')
        payment_transfer_enabled = get_bool_setting('payment_transfer_enabled', getattr(settings, 'payment_transfer_enabled', False))
        expense_categories = data.get('expense_categories') if isinstance(data.get('expense_categories'), list) else []
        expense_categories = [str(c).strip() for c in expense_categories if str(c).strip()]
        # Убираем техническую категорию "Encashment" и "Инкасация" - она не должна храниться в настройках
        expense_categories = [cat for cat in expense_categories if cat not in ['Encashment', 'Инкасация']]

        if not working_days:
            return jsonify({'success': False, 'message': 'Выберите рабочие дни'}), 400
        if work_end_time <= work_start_time:
            return jsonify({'success': False, 'message': 'Время окончания должно быть позже начала'}), 400
        if max_groups_per_slot <= 0:
            return jsonify({'success': False, 'message': 'Вместимость должна быть положительной'}), 400
        if rewards_reset_period_months < 1 or rewards_reset_period_months > 12:
            return jsonify({'success': False, 'message': 'Период сброса вознаграждений должен быть от 1 до 12 месяцев'}), 400
        if podium_display_count < 5 or podium_display_count > 50 or podium_display_count % 5 != 0:
            return jsonify({'success': False, 'message': 'Отображение пьедестала должно быть от 5 до 50 учеников с шагом 5'}), 400

        settings.system_name = system_name
        settings.set_working_days_list(working_days)
        settings.work_start_time = work_start_time
        settings.work_end_time = work_end_time
        settings.max_groups_per_slot = max_groups_per_slot
        settings.block_future_payments = block_future_payments
        settings.rewards_reset_period_months = rewards_reset_period_months
        settings.podium_display_count = podium_display_count
        settings.telegram_bot_url = telegram_bot_url if telegram_bot_url else None
        settings.telegram_bot_token = telegram_bot_token if telegram_bot_token else None
        
        # Сохранение телефонов руководства
        settings.director_phone = (data.get('director_phone') or '').strip() or None
        settings.founder_phone = (data.get('founder_phone') or '').strip() or None
        settings.cashier_phone = (data.get('cashier_phone') or '').strip() or None
        settings.telegram_notification_template = telegram_notification_template if telegram_notification_template else None
        settings.telegram_reward_template = telegram_reward_template if telegram_reward_template else None
        settings.telegram_card_template = telegram_card_template if telegram_card_template else None
        settings.telegram_payment_template = telegram_payment_template if telegram_payment_template else None
        settings.rtsp_url = rtsp_url if rtsp_url else None
        settings.payment_click_enabled = payment_click_enabled
        settings.payment_click_qr_url = payment_click_qr_url if payment_click_qr_url else None
        settings.payment_payme_enabled = payment_payme_enabled
        settings.payment_payme_qr_url = payment_payme_qr_url if payment_payme_qr_url else None
        settings.payment_uzum_enabled = payment_uzum_enabled
        settings.payment_uzum_qr_url = payment_uzum_qr_url if payment_uzum_qr_url else None
        settings.payment_uzcard_enabled = payment_uzcard_enabled
        settings.payment_humo_enabled = payment_humo_enabled
        settings.payment_paynet_enabled = payment_paynet_enabled
        settings.payment_paynet_qr_url = payment_paynet_qr_url if payment_paynet_qr_url else None
        settings.payment_xazna_enabled = payment_xazna_enabled
        settings.payment_xazna_qr_url = payment_xazna_qr_url if payment_xazna_qr_url else None
        settings.payment_oson_enabled = payment_oson_enabled
        settings.payment_oson_qr_url = payment_oson_qr_url if payment_oson_qr_url else None
        settings.payment_transfer_enabled = payment_transfer_enabled
        settings.expense_categories = json.dumps(expense_categories) if expense_categories else None
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/groups/add', methods=['POST'])
@login_required
def add_group():
    """Добавить новую группу"""
    try:
        data = request.get_json()
        name = data.get('name')
        schedule_time_str = data.get('schedule_time')  # "13:00"
        duration_minutes = int(data.get('duration_minutes', 60))
        # Количество блоков (на случай старых клиентов)
        field_blocks = int(data.get('field_blocks', 1))
        # Индексы блоков, которые занимает группа
        field_block_indices = data.get('field_block_indices') or []
        late_threshold = int(data.get('late_threshold', 15))
        max_students = data.get('max_students')
        if max_students:
            max_students = int(max_students)
        notes = data.get('notes', '')
        schedule_days = parse_days_list(data.get('schedule_days'))
        if not schedule_time_str:
            return jsonify({'success': False, 'message': 'Укажите время занятия'}), 400
        if not schedule_days:
            return jsonify({'success': False, 'message': 'Выберите дни недели'}), 400
        
        # Парсинг времени
        schedule_time = datetime.strptime(schedule_time_str, '%H:%M').time()
        is_valid, error_message = validate_group_schedule(schedule_time, schedule_days)
        if not is_valid:
            return jsonify({'success': False, 'message': error_message}), 400
        
        group = Group(
            name=name,
            schedule_time=schedule_time,
            duration_minutes=duration_minutes,
            late_threshold=late_threshold,
            max_students=max_students,
            notes=notes
        )
        # Если передали конкретные индексы блоков — используем их,
        # иначе считаем, что заняты первые field_blocks блока
        if field_block_indices:
            group.set_field_block_indices(field_block_indices)
        else:
            group.set_field_block_indices(list(range(field_blocks)))
        group.set_schedule_days_list(schedule_days)
        db.session.add(group)
        db.session.commit()
        
        return jsonify({'success': True, 'group_id': group.id})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/groups/<int:group_id>', methods=['PUT'])
@login_required
def update_group(group_id):
    """Обновить группу"""
    try:
        group = db.session.get(Group, group_id)
        if not group:
            return jsonify({'success': False, 'message': 'Группа не найдена'}), 404
        
        data = request.get_json()
        new_schedule_time = group.schedule_time
        new_schedule_days = group.get_schedule_days_list()
        if 'name' in data:
            group.name = data['name']
        if 'duration_minutes' in data:
            group.duration_minutes = int(data['duration_minutes'])
        # Обновление блоков поля
        if 'field_block_indices' in data:
            # Если пришёл массив индексов — сохраняем его
            group.set_field_block_indices(data['field_block_indices'])
        elif 'field_blocks' in data:
            # Старый формат: только количество блоков
            count = int(data['field_blocks'])
            group.set_field_block_indices(list(range(count)))
        if 'schedule_time' in data:
            raw_time = data.get('schedule_time')
            # Просто сохраняем как есть - строку или JSON
            new_schedule_time = raw_time
        if 'late_threshold' in data:
            group.late_threshold = int(data['late_threshold'])
        if 'max_students' in data:
            max_students = data['max_students']
            group.max_students = int(max_students) if max_students else None
        if 'notes' in data:
            group.notes = data['notes']
        if 'schedule_days' in data:
            new_schedule_days = parse_days_list(data['schedule_days'])
        
        # Валидацию пропускаем, если schedule_time - это JSON (разные времена для разных дней)
        needs_validation = ('schedule_time' in data) or ('schedule_days' in data) or not new_schedule_days
        is_json_schedule = isinstance(new_schedule_time, str) and new_schedule_time.startswith('{')
        
        if needs_validation and not is_json_schedule:
            effective_days = new_schedule_days or group.get_schedule_days_list()
            if not effective_days:
                effective_days = get_club_settings_instance().get_working_days_list()
            is_valid, error_message = validate_group_schedule(new_schedule_time, effective_days, exclude_group_id=group.id)
            if not is_valid:
                return jsonify({'success': False, 'message': error_message}), 400
            if not new_schedule_days:
                new_schedule_days = effective_days
        if new_schedule_days:
            group.set_schedule_days_list(new_schedule_days)
        group.schedule_time = new_schedule_time
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/groups/<int:group_id>', methods=['DELETE'])
@login_required
def delete_group(group_id):
    """Удалить группу"""
    try:
        group = db.session.get(Group, group_id)
        if not group:
            return jsonify({'success': False, 'message': 'Группа не найдена'}), 404
        
        # Переводим всех учеников группы в состояние "без группы"
        for student in group.students:
            student.group_id = None
        
        db.session.delete(group)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== ТАРИФЫ =====

@app.route('/tariffs')
@login_required
def tariffs_page():
    return render_template('tariffs.html')


@app.route('/api/tariffs', methods=['GET'])
@login_required
def get_tariffs():
    """Получить список всех тарифов"""
    tariffs = Tariff.query.filter_by(is_active=True).order_by(Tariff.lessons_count).all()
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'lessons_count': t.lessons_count,
        'price': t.price,
        'description': t.description,
        'price_per_lesson': round(t.price / t.lessons_count, 2) if t.lessons_count > 0 else 0
    } for t in tariffs])


@app.route('/api/tariffs/add', methods=['POST'])
@login_required
def add_tariff():
    """Добавить новый тариф"""
    try:
        data = request.get_json()
        name = data.get('name')
        lessons_count = int(data.get('lessons_count'))
        price = float(data.get('price'))
        description = data.get('description', '')
        
        tariff = Tariff(
            name=name,
            lessons_count=lessons_count,
            price=price,
            description=description
        )
        
        db.session.add(tariff)
        db.session.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/tariffs/<int:tariff_id>', methods=['PUT'])
@login_required
def update_tariff(tariff_id):
    """Обновить тариф"""
    try:
        tariff = db.session.get(Tariff, tariff_id)
        if not tariff:
            return jsonify({'success': False, 'message': 'Тариф не найден'}), 404
        
        data = request.get_json()
        if 'name' in data:
            tariff.name = data['name']
        if 'lessons_count' in data:
            tariff.lessons_count = int(data['lessons_count'])
        if 'price' in data:
            tariff.price = float(data['price'])
        if 'description' in data:
            tariff.description = data['description']
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/tariffs/<int:tariff_id>', methods=['DELETE'])
@login_required
def delete_tariff(tariff_id):
    """Удалить (деактивировать) тариф"""
    try:
        tariff = db.session.get(Tariff, tariff_id)
        if not tariff:
            return jsonify({'success': False, 'message': 'Тариф не найден'}), 404
        
        # Не удаляем физически, а деактивируем
        tariff.is_active = False
        db.session.commit()
        
        return jsonify({'success': True, 'message': f'Тариф "{tariff.name}" деактивирован'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== ВОЗНАГРАЖДЕНИЯ =====

@app.route('/rewards')
@login_required
def rewards_page():
    """Страница управления вознаграждениями"""
    if current_user.role != 'admin':
        return redirect(url_for('dashboard'))
    return render_template('rewards.html')


@app.route('/api/rewards', methods=['GET'])
@login_required
def get_rewards():
    """Получить список всех типов вознаграждений"""
    if current_user.role != 'admin':
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    rewards = RewardType.query.order_by(RewardType.created_at.desc()).all()
    return jsonify([{
        'id': r.id,
        'name': r.name,
        'points': r.points,
        'description': r.description or '',
        'created_at': r.created_at.isoformat() if r.created_at else None,
        'updated_at': r.updated_at.isoformat() if r.updated_at else None
    } for r in rewards])


@app.route('/api/rewards/add', methods=['POST'])
@login_required
def add_reward():
    """Добавить новый тип вознаграждения"""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        points = int(data.get('points', 1))
        description = data.get('description', '').strip()
        
        if not name:
            return jsonify({'success': False, 'message': 'Название вознаграждения не может быть пустым'}), 400
        
        if points < 1:
            return jsonify({'success': False, 'message': 'Количество баллов должно быть больше 0'}), 400
        
        reward = RewardType(
            name=name,
            points=points,
            description=description if description else None
        )
        
        db.session.add(reward)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Вознаграждение добавлено',
            'reward': {
                'id': reward.id,
                'name': reward.name,
                'points': reward.points,
                'description': reward.description or ''
            }
        })
    except ValueError:
        return jsonify({'success': False, 'message': 'Некорректное количество баллов'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/rewards/<int:reward_id>', methods=['PUT'])
@login_required
def update_reward(reward_id):
    """Обновить тип вознаграждения"""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        reward = db.session.get(RewardType, reward_id)
        if not reward:
            return jsonify({'success': False, 'message': 'Вознаграждение не найдено'}), 404
        
        data = request.get_json()
        if 'name' in data:
            name = data['name'].strip()
            if not name:
                return jsonify({'success': False, 'message': 'Название вознаграждения не может быть пустым'}), 400
            reward.name = name
        
        if 'points' in data:
            points = int(data['points'])
            if points < 1:
                return jsonify({'success': False, 'message': 'Количество баллов должно быть больше 0'}), 400
            reward.points = points
        
        if 'description' in data:
            reward.description = data['description'].strip() if data['description'].strip() else None
        
        reward.updated_at = get_local_datetime()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Вознаграждение обновлено',
            'reward': {
                'id': reward.id,
                'name': reward.name,
                'points': reward.points,
                'description': reward.description or ''
            }
        })
    except ValueError:
        return jsonify({'success': False, 'message': 'Некорректное количество баллов'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/rewards/<int:reward_id>', methods=['DELETE'])
@login_required
def delete_reward(reward_id):
    """Удалить тип вознаграждения"""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        reward = db.session.get(RewardType, reward_id)
        if not reward:
            return jsonify({'success': False, 'message': 'Вознаграждение не найдено'}), 404
        
        reward_name = reward.name
        db.session.delete(reward)
        db.session.commit()
        
        return jsonify({'success': True, 'message': f'Вознаграждение "{reward_name}" удалено'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== ВЫДАЧА ВОЗНАГРАЖДЕНИЙ УЧЕНИКАМ =====

@app.route('/api/students/<int:student_id>/rewards', methods=['POST'])
@login_required
def issue_reward(student_id):
    """Выдать вознаграждение ученику"""
    if current_user.role not in ['admin', 'teacher']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        data = request.get_json()
        reward_type_id = int(data.get('reward_type_id'))
        
        student = db.session.get(Student, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Ученик не найден'}), 404
        
        reward_type = db.session.get(RewardType, reward_type_id)
        if not reward_type:
            return jsonify({'success': False, 'message': 'Тип вознаграждения не найден'}), 404
        
        from datetime import date
        current_date = date.today()
        
        # Создать запись о выдаче вознаграждения
        student_reward = StudentReward(
            student_id=student_id,
            reward_type_id=reward_type_id,
            points=reward_type.points,
            reward_name=reward_type.name,
            issued_by=current_user.id,
            month=current_date.month,
            year=current_date.year
        )
        
        db.session.add(student_reward)
        db.session.commit()
        
        # Подсчитать общее количество баллов за текущий месяц
        total_points = get_student_points_sum(student_id, current_date.month, current_date.year)
        
        # Отправить уведомление в Telegram
        reason = data.get('reason', '').strip()
        try:
            send_reward_notification(
                student_id=student_id,
                reward_name=reward_type.name,
                points=reward_type.points,
                total_points=total_points,
                reason=reason
            )
        except Exception as e:
            print(f"Ошибка отправки уведомления о вознаграждении: {e}")
            # Не прерываем выполнение, если уведомление не отправилось
        
        return jsonify({
            'success': True,
            'message': f'Вознаграждение "{reward_type.name}" выдано (+{reward_type.points} баллов)',
            'total_points': total_points
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/students/<int:student_id>/rewards', methods=['GET'])
@login_required
def get_student_rewards(student_id):
    """Получить историю вознаграждений ученика"""
    try:
        month = request.args.get('month', type=int)
        year = request.args.get('year', type=int)
        all_history = request.args.get('all', type=bool, default=False)
        
        from datetime import date
        if all_history:
            # Вернуть всю историю для вкладки истории
            rewards = StudentReward.query.filter_by(
                student_id=student_id
            ).order_by(StudentReward.issued_at.desc()).all()
        elif not month or not year:
            # По умолчанию - текущий месяц
            current_date = date.today()
            month = current_date.month
            year = current_date.year
            rewards = StudentReward.query.filter_by(
                student_id=student_id,
                month=month,
                year=year
            ).order_by(StudentReward.issued_at.desc()).all()
        else:
            # Конкретный месяц и год
            rewards = StudentReward.query.filter_by(
                student_id=student_id,
                month=month,
                year=year
            ).order_by(StudentReward.issued_at.desc()).all()
        
        result = []
        for r in rewards:
            # Проверяем is_deleted через прямой запрос к БД, если поле существует
            is_deleted = False
            deleted_at = None
            try:
                inspector = db.inspect(db.engine)
                columns = {col['name'] for col in inspector.get_columns('student_rewards')}
                if 'is_deleted' in columns:
                    result_row = db.session.execute(
                        db.text("SELECT is_deleted, deleted_at FROM student_rewards WHERE id = :id"),
                        {'id': r.id}
                    ).fetchone()
                    if result_row:
                        is_deleted = bool(result_row[0]) if result_row[0] is not None else False
                        deleted_at = result_row[1].isoformat() if result_row[1] else None
            except:
                pass
            
            # Альтернативная проверка через префикс
            if not is_deleted and r.reward_name and r.reward_name.startswith('[УДАЛЕНО] '):
                is_deleted = True
            
            result.append({
                'id': r.id,
                'reward_name': r.reward_name.replace('[УДАЛЕНО] ', '') if r.reward_name.startswith('[УДАЛЕНО] ') else r.reward_name,
                'points': r.points,
                'issued_at': r.issued_at.isoformat() if r.issued_at else None,
                'issuer_name': r.issuer.username if r.issuer else 'Система',
                'is_deleted': is_deleted,
                'deleted_at': deleted_at
            })
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/students/<int:student_id>/points', methods=['GET'])
@login_required
def get_student_points(student_id):
    """Получить общее количество баллов ученика за текущий месяц"""
    try:
        from datetime import date
        current_date = date.today()
        
        total_points = get_student_points_sum(student_id, current_date.month, current_date.year)
        
        return jsonify({'points': total_points})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===== КАРТОЧКИ УЧЕНИКОВ =====

@app.route('/api/card-types', methods=['GET'])
@login_required
def get_card_types():
    """Получить список всех типов карточек"""
    try:
        # Проверить, есть ли типы карточек, если нет - создать
        card_types = CardType.query.order_by(CardType.id.asc()).all()
        if not card_types:
            # Автоматически создать типы карточек при первом запросе
            default_types = [
                CardType(name='Желтая', color='yellow', description='Предупреждение'),
                CardType(name='Красная', color='red', description='Удаление с поля'),
                CardType(name='Оранжевая', color='orange', description='Серьезное нарушение'),
                CardType(name='Синяя', color='blue', description='Замечание'),
                CardType(name='Зеленая', color='green', description='Положительное поведение')
            ]
            for card_type in default_types:
                db.session.add(card_type)
            db.session.commit()
            card_types = CardType.query.order_by(CardType.id.asc()).all()
        
        return jsonify([{
            'id': ct.id,
            'name': ct.name,
            'color': ct.color,
            'description': ct.description or ''
        } for ct in card_types])
    except Exception as e:
        # Если ошибка из-за отсутствия таблицы, создать её
        try:
            db.create_all()
            # Попробовать снова создать типы
            default_types = [
                CardType(name='Желтая', color='yellow', description='Предупреждение'),
                CardType(name='Красная', color='red', description='Удаление с поля'),
                CardType(name='Оранжевая', color='orange', description='Серьезное нарушение'),
                CardType(name='Синяя', color='blue', description='Замечание'),
                CardType(name='Зеленая', color='green', description='Положительное поведение')
            ]
            for card_type in default_types:
                db.session.add(card_type)
            db.session.commit()
            card_types = CardType.query.order_by(CardType.id.asc()).all()
            return jsonify([{
                'id': ct.id,
                'name': ct.name,
                'color': ct.color,
                'description': ct.description or ''
            } for ct in card_types])
        except Exception as e2:
            return jsonify({'error': str(e2)}), 500


@app.route('/api/students/<int:student_id>/cards', methods=['GET'])
@login_required
def get_student_cards(student_id):
    """Получить активные карточки ученика"""
    try:
        active_cards = StudentCard.query.filter_by(
            student_id=student_id,
            is_active=True
        ).order_by(StudentCard.issued_at.desc()).all()
        
        return jsonify([{
            'id': card.id,
            'card_type_id': card.card_type_id,
            'card_type_name': card.card_type.name,
            'card_type_color': card.card_type.color,
            'reason': card.reason,
            'issued_at': card.issued_at.isoformat() if card.issued_at else None,
            'issued_by': card.issuer_user.username if card.issuer_user else 'Система'
        } for card in active_cards])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/students/<int:student_id>/cards/history', methods=['GET'])
@login_required
def get_student_cards_history(student_id):
    """Получить всю историю карточек ученика"""
    try:
        all_cards = StudentCard.query.filter_by(
            student_id=student_id
        ).order_by(StudentCard.issued_at.desc()).all()
        
        result = []
        for card in all_cards:
            # Проверяем is_deleted через прямой запрос к БД, если поле существует
            is_deleted = False
            deleted_at = None
            try:
                inspector = db.inspect(db.engine)
                columns = {col['name'] for col in inspector.get_columns('student_cards')}
                if 'is_deleted' in columns:
                    result_row = db.session.execute(
                        db.text("SELECT is_deleted, deleted_at FROM student_cards WHERE id = :id"),
                        {'id': card.id}
                    ).fetchone()
                    if result_row:
                        is_deleted = bool(result_row[0]) if result_row[0] is not None else False
                        deleted_at = result_row[1].isoformat() if result_row[1] else None
            except:
                pass
            
            # Альтернативная проверка через префикс
            if not is_deleted and card.reason and card.reason.startswith('[УДАЛЕНО] '):
                is_deleted = True
            
            result.append({
                'id': card.id,
                'card_type_id': card.card_type_id,
                'card_type_name': card.card_type.name,
                'card_type_color': card.card_type.color,
                'reason': card.reason.replace('[УДАЛЕНО] ', '') if card.reason.startswith('[УДАЛЕНО] ') else card.reason,
                'issued_at': card.issued_at.isoformat() if card.issued_at else None,
                'issued_by': card.issuer_user.username if card.issuer_user else 'Система',
                'removed_at': card.removed_at.isoformat() if card.removed_at else None,
                'removed_by': card.remover_user.username if card.remover_user else None,
                'is_active': card.is_active,
                'is_deleted': is_deleted,
                'deleted_at': deleted_at
            })
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/students/<int:student_id>/cards', methods=['POST'])
@login_required
def issue_card(student_id):
    """Выдать карточку ученику"""
    if current_user.role not in ['admin', 'teacher']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        data = request.get_json()
        card_type_id = int(data.get('card_type_id'))
        reason = data.get('reason', '').strip()
        
        if not reason:
            return jsonify({'success': False, 'message': 'Укажите причину выдачи карточки'}), 400
        
        student = db.session.get(Student, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Ученик не найден'}), 404
        
        card_type = db.session.get(CardType, card_type_id)
        if not card_type:
            return jsonify({'success': False, 'message': 'Тип карточки не найден'}), 404
        
        # Создать запись о выдаче карточки
        student_card = StudentCard(
            student_id=student_id,
            card_type_id=card_type_id,
            reason=reason,
            issued_by=current_user.id,
            is_active=True
        )
        
        db.session.add(student_card)
        db.session.commit()
        
        # Отправить уведомление в Telegram
        try:
            send_card_notification(
                student_id=student_id,
                card_name=card_type.name,
                reason=reason
            )
        except Exception as e:
            print(f"Ошибка отправки уведомления о карточке: {e}")
            # Не прерываем выполнение, если уведомление не отправилось
        
        return jsonify({
            'success': True,
            'message': f'Карточка "{card_type.name}" выдана',
            'card': {
                'id': student_card.id,
                'card_type_id': card_type.id,
                'card_type_name': card_type.name,
                'card_type_color': card_type.color,
                'reason': reason
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/students/<int:student_id>/cards/<int:card_id>/remove', methods=['POST'])
@login_required
def remove_card(student_id, card_id):
    """Снять карточку с ученика"""
    if current_user.role not in ['admin', 'teacher']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        student_card = db.session.get(StudentCard, card_id)
        if not student_card or student_card.student_id != student_id:
            return jsonify({'success': False, 'message': 'Карточка не найдена'}), 404
        
        if not student_card.is_active:
            return jsonify({'success': False, 'message': 'Карточка уже снята'}), 400
        
        student_card.is_active = False
        student_card.removed_at = get_local_datetime()
        student_card.removed_by = current_user.id
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Карточка снята'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


def ensure_deleted_columns():
    """Добавить колонки is_deleted и deleted_at в таблицы student_rewards и student_cards если их нет"""
    try:
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'student_rewards' in tables:
            columns = {col['name'] for col in inspector.get_columns('student_rewards')}
            if 'is_deleted' not in columns:
                try:
                    db.session.execute(db.text("ALTER TABLE student_rewards ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE"))
                    db.session.commit()
                    print("✓ Добавлена колонка is_deleted в student_rewards")
                except Exception as e:
                    db.session.rollback()
                    if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                        print(f"Ошибка при добавлении is_deleted в student_rewards: {e}")
            
            if 'deleted_at' not in columns:
                try:
                    db.session.execute(db.text("ALTER TABLE student_rewards ADD COLUMN deleted_at TIMESTAMP"))
                    db.session.commit()
                    print("✓ Добавлена колонка deleted_at в student_rewards")
                except Exception as e:
                    db.session.rollback()
                    if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                        print(f"Ошибка при добавлении deleted_at в student_rewards: {e}")
        
        if 'student_cards' in tables:
            columns = {col['name'] for col in inspector.get_columns('student_cards')}
            if 'is_deleted' not in columns:
                try:
                    db.session.execute(db.text("ALTER TABLE student_cards ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE"))
                    db.session.commit()
                    print("✓ Добавлена колонка is_deleted в student_cards")
                except Exception as e:
                    db.session.rollback()
                    if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                        print(f"Ошибка при добавлении is_deleted в student_cards: {e}")
            
            if 'deleted_at' not in columns:
                try:
                    db.session.execute(db.text("ALTER TABLE student_cards ADD COLUMN deleted_at TIMESTAMP"))
                    db.session.commit()
                    print("✓ Добавлена колонка deleted_at в student_cards")
                except Exception as e:
                    db.session.rollback()
                    if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                        print(f"Ошибка при добавлении deleted_at в student_cards: {e}")
    except Exception as e:
        print(f"Ошибка при проверке колонок удаления: {e}")


def get_student_points_sum(student_id, month=None, year=None):
    """Подсчитать сумму очков ученика за указанный месяц/год с учетом удаленных вознаграждений"""
    try:
        from datetime import date
        if month is None or year is None:
            current_date = date.today()
            month = month or current_date.month
            year = year or current_date.year
        
        # Проверить наличие колонки is_deleted
        inspector = db.inspect(db.engine)
        columns = {col['name'] for col in inspector.get_columns('student_rewards')}
        
        if 'is_deleted' in columns:
            # Использовать SQL запрос с фильтром is_deleted
            result = db.session.execute(
                db.text("""
                    SELECT COALESCE(SUM(points), 0) 
                    FROM student_rewards 
                    WHERE student_id = :student_id 
                    AND month = :month 
                    AND year = :year 
                    AND (is_deleted = 0 OR is_deleted IS NULL)
                """),
                {'student_id': student_id, 'month': month, 'year': year}
            ).scalar()
            return result or 0
        else:
            # Если колонки нет, использовать обычный запрос, но исключить записи с префиксом [УДАЛЕНО]
            total_points = db.session.query(func.sum(StudentReward.points)).filter(
                StudentReward.student_id == student_id,
                StudentReward.month == month,
                StudentReward.year == year,
                ~StudentReward.reward_name.like('[УДАЛЕНО]%')
            ).scalar() or 0
            return total_points
    except Exception as e:
        print(f"Ошибка при подсчете очков ученика {student_id}: {e}")
        # В случае ошибки вернуть 0 или попробовать базовый запрос
        try:
            total_points = db.session.query(func.sum(StudentReward.points)).filter(
                StudentReward.student_id == student_id,
                StudentReward.month == month,
                StudentReward.year == year
            ).scalar() or 0
            return total_points
        except:
            return 0


@app.route('/api/students/<int:student_id>/rewards/<int:reward_id>/delete', methods=['POST'])
@login_required
def delete_student_reward(student_id, reward_id):
    """Удалить вознаграждение (пометить как удаленное)"""
    if current_user.role not in ['admin', 'teacher']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        ensure_deleted_columns()
        reward = StudentReward.query.filter_by(id=reward_id, student_id=student_id).first()
        if not reward:
            return jsonify({'success': False, 'message': 'Вознаграждение не найдено'}), 404
        
        # Пометить как удаленное (мягкое удаление)
        # Используем прямой SQL-запрос для надежности
        inspector = db.inspect(db.engine)
        columns = {col['name'] for col in inspector.get_columns('student_rewards')}
        
        updated = False
        if 'deleted_at' in columns and 'is_deleted' in columns:
            try:
                db.session.execute(
                    db.text("UPDATE student_rewards SET is_deleted = 1, deleted_at = :deleted_at WHERE id = :id"),
                    {'deleted_at': get_local_datetime(), 'id': reward_id}
                )
                db.session.commit()
                updated = True
                print(f"✓ Вознаграждение {reward_id} помечено как удаленное через SQL (с deleted_at)")
            except Exception as sql_error:
                print(f"Ошибка SQL при удалении вознаграждения (с deleted_at): {sql_error}")
                db.session.rollback()
        
        if not updated and 'is_deleted' in columns:
            try:
                db.session.execute(
                    db.text("UPDATE student_rewards SET is_deleted = 1 WHERE id = :id"),
                    {'id': reward_id}
                )
                db.session.commit()
                updated = True
                print(f"✓ Вознаграждение {reward_id} помечено как удаленное через SQL (только is_deleted)")
            except Exception as sql_error:
                print(f"Ошибка SQL при удалении вознаграждения (только is_deleted): {sql_error}")
                db.session.rollback()
        
        if not updated:
            # Альтернативный способ - префикс в названии
            reward = StudentReward.query.filter_by(id=reward_id, student_id=student_id).first()
            if reward and not reward.reward_name.startswith('[УДАЛЕНО] '):
                reward.reward_name = f"[УДАЛЕНО] {reward.reward_name}"
                db.session.commit()
                updated = True
                print(f"✓ Вознаграждение {reward_id} помечено как удаленное через префикс")
        
        return jsonify({
            'success': True,
            'message': 'Вознаграждение удалено'
        })
    except Exception as e:
        db.session.rollback()
        print(f"Ошибка при удалении вознаграждения {reward_id}: {e}")
        return jsonify({'success': False, 'message': f'Ошибка при удалении: {str(e)}'}), 500


@app.route('/api/students/<int:student_id>/cards/<int:card_id>/delete', methods=['POST'])
@login_required
def delete_student_card(student_id, card_id):
    """Удалить карточку (пометить как удаленную)"""
    if current_user.role not in ['admin', 'teacher']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        ensure_deleted_columns()
        card = StudentCard.query.filter_by(id=card_id, student_id=student_id).first()
        if not card:
            return jsonify({'success': False, 'message': 'Карточка не найдена'}), 404
        
        # Пометить как удаленную (мягкое удаление)
        # Используем прямой SQL-запрос для надежности
        inspector = db.inspect(db.engine)
        columns = {col['name'] for col in inspector.get_columns('student_cards')}
        
        if 'deleted_at' in columns and 'is_deleted' in columns:
            db.session.execute(
                db.text("UPDATE student_cards SET is_deleted = 1, deleted_at = :deleted_at WHERE id = :id"),
                {'deleted_at': get_local_datetime(), 'id': card_id}
            )
        elif 'is_deleted' in columns:
            db.session.execute(
                db.text("UPDATE student_cards SET is_deleted = 1 WHERE id = :id"),
                {'id': card_id}
            )
        else:
            # Альтернативный способ - префикс в reason
            card.reason = f"[УДАЛЕНО] {card.reason}"
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Карточка удалена'
        })
    except Exception as e:
        db.session.rollback()
        # Если колонки не существуют, попробуем альтернативный способ
        try:
            card = StudentCard.query.filter_by(id=card_id, student_id=student_id).first()
            if card:
                # Используем reason для пометки
                card.reason = f"[УДАЛЕНО] {card.reason}"
                db.session.commit()
                return jsonify({
                    'success': True,
                    'message': 'Карточка удалена'
                })
        except:
            pass
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== РЕЙТИНГ УЧЕНИКОВ =====

@app.route('/rating')
@login_required
def rating_page():
    """Страница рейтинга учеников"""
    return render_template('rating.html')


@app.route('/api/rating/<int:group_id>', methods=['GET'])
@login_required
def get_group_rating(group_id):
    """Получить рейтинг учеников группы за текущий месяц"""
    try:
        from datetime import date
        current_date = date.today()
        
        # Получить настройки для количества мест в пьедестале
        settings = get_club_settings_instance()
        podium_count = getattr(settings, 'podium_display_count', 20)
        
        # Подсчитать баллы для всех учеников группы за текущий месяц
        students_query = Student.query.filter_by(group_id=group_id, status='active')
        
        rating_data = []
        for student in students_query.all():
            total_points = get_student_points_sum(student.id, current_date.month, current_date.year)
            
            if total_points > 0:  # Показываем только тех, у кого есть баллы
                rating_data.append({
                    'student_id': student.id,
                    'full_name': student.full_name,
                    'photo_path': student.photo_path,
                    'points': total_points
                })
        
        # Сортировать по убыванию баллов и взять топ N
        rating_data.sort(key=lambda x: x['points'], reverse=True)
        rating_data = rating_data[:podium_count]
        
        return jsonify({
            'rating': rating_data,
            'month': current_date.month,
            'year': current_date.year
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rating/all-groups', methods=['GET'])
@login_required
def get_all_groups_rating():
    """Получить рейтинг всех групп за текущий месяц"""
    try:
        from datetime import date
        current_date = date.today()
        
        # Получить настройки для количества мест в пьедестале
        settings = get_club_settings_instance()
        podium_count = getattr(settings, 'podium_display_count', 20)
        
        # Получить все группы
        groups = Group.query.all()
        
        result = []
        for group in groups:
            # Подсчитать баллы для всех учеников группы за текущий месяц
            students_query = Student.query.filter_by(group_id=group.id, status='active')
            
            rating_data = []
            for student in students_query.all():
                total_points = get_student_points_sum(student.id, current_date.month, current_date.year)
                
                if total_points > 0:  # Показываем только тех, у кого есть баллы
                    rating_data.append({
                        'student_id': student.id,
                        'full_name': student.full_name,
                        'photo_path': student.photo_path,
                        'points': total_points
                    })
            
            # Сортировать по убыванию баллов и взять топ N
            rating_data.sort(key=lambda x: x['points'], reverse=True)
            rating_data = rating_data[:podium_count]
            
            result.append({
                'group_id': group.id,
                'group_name': group.name,
                'rating': rating_data
            })
        
        return jsonify({
            'groups': result,
            'month': current_date.month,
            'year': current_date.year
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rating/winners-history', methods=['GET'])
@login_required
def get_winners_history():
    """Получить историю победителей (1 место) по месяцам для всех групп"""
    try:
        year = request.args.get('year', type=int)
        from datetime import date
        if not year:
            year = date.today().year
        
        # Получить все группы
        groups = Group.query.all()
        
        result = {}
        
        for group in groups:
            group_winners = []
            
            # Для каждого месяца года
            for month in range(1, 13):
                # Подсчитать баллы для всех учеников группы за этот месяц
                students_query = Student.query.filter_by(group_id=group.id, status='active')
                
                monthly_rating = []
                for student in students_query.all():
                    total_points = get_student_points_sum(student.id, month, year)
                    
                    if total_points > 0:
                        monthly_rating.append({
                            'student_id': student.id,
                            'full_name': student.full_name,
                            'photo_path': student.photo_path,
                            'points': total_points
                        })
                
                # Найти топ-3 учеников
                if monthly_rating:
                    monthly_rating.sort(key=lambda x: x['points'], reverse=True)
                    top_three = monthly_rating[:3]  # Берем топ-3
                    
                    group_winners.append({
                        'month': month,
                        'students': top_three
                    })
                else:
                    # Нет данных за этот месяц
                    group_winners.append({
                        'month': month,
                        'students': [],
                        'is_empty': True
                    })
            
            result[group.id] = {
                'group_id': group.id,
                'group_name': group.name,
                'winners': group_winners
            }
        
        return jsonify({
            'year': year,
            'groups': list(result.values())
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===== ЛОКАЦИИ =====

@app.route('/api/locations/cities', methods=['GET'])
def get_cities_list():
    """Получить список городов"""
    return jsonify(get_cities())


@app.route('/api/locations/districts/<city>', methods=['GET'])
def get_districts_list(city):
    """Получить список районов для города"""
    return jsonify(get_districts(city))


# ===== РАСПОЗНАВАНИЕ ЛИЦ =====

@app.route('/camera')
@login_required
def camera_page():
    """Страница с камерой для распознавания"""
    return render_template('camera.html')



@app.route('/users')
@login_required
def users_page():
    """Страница управления пользователями"""
    # Проверка прав доступа
    if not current_user.has_permission('users', 'view'):
        return redirect(url_for('dashboard'))
    return render_template('users.html')


# ===== API ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ =====

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Получить список всех пользователей"""
    if not current_user.has_permission('users', 'view'):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    users = User.query.all()
    users_list = []
    for user in users:
        role_name = user.role_obj.name if user.role_obj else user.role
        users_list.append({
            'id': user.id,
            'username': user.username,
            'full_name': user.full_name,
            'role': user.role,
            'role_id': user.role_id,
            'role_name': role_name,
            'is_active': user.is_active,
            'created_at': user.created_at.isoformat() if user.created_at else None
        })
    
    return jsonify(users_list)


@app.route('/api/users', methods=['POST'])
@login_required
def create_user():
    """Создать нового пользователя"""
    if not current_user.has_permission('users', 'edit'):
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        full_name = data.get('full_name', '').strip()
        role_id = data.get('role_id')
        is_active = data.get('is_active', True)
        
        if not username:
            return jsonify({'success': False, 'message': 'Введите имя пользователя'}), 400
        
        if not password or len(password) < 4:
            return jsonify({'success': False, 'message': 'Пароль должен быть не менее 4 символов'}), 400
        
        # Проверка уникальности имени пользователя
        if User.query.filter_by(username=username).first():
            return jsonify({'success': False, 'message': 'Пользователь с таким именем уже существует'}), 400
        
        # Создание пользователя
        user = User(
            username=username,
            password_hash=bcrypt.generate_password_hash(password).decode('utf-8'),
            full_name=full_name,
            role_id=role_id,
            role='custom' if role_id else 'admin',  # Для обратной совместимости
            is_active=is_active
        )
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Пользователь успешно создан',
            'user': {
                'id': user.id,
                'username': user.username,
                'full_name': user.full_name,
                'role_id': user.role_id
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    """Обновить пользователя"""
    if not current_user.has_permission('users', 'edit'):
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
        
        data = request.json
        username = data.get('username')
        password = data.get('password')
        full_name = data.get('full_name')
        role_id = data.get('role_id')
        is_active = data.get('is_active')
        
        if username and username != user.username:
            if User.query.filter_by(username=username).first():
                return jsonify({'success': False, 'message': 'Пользователь с таким именем уже существует'}), 400
            user.username = username
        
        if password:
            if len(password) < 4:
                return jsonify({'success': False, 'message': 'Пароль должен быть не менее 4 символов'}), 400
            user.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        
        if full_name is not None:
            user.full_name = full_name
        
        if role_id is not None:
            user.role_id = role_id
            if role_id:
                user.role = 'custom'
        
        if is_active is not None:
            user.is_active = is_active
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Пользователь успешно обновлен'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """Удалить пользователя"""
    if not current_user.has_permission('users', 'edit'):
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
        
        # Нельзя удалить самого себя
        if user.id == current_user.id:
            return jsonify({'success': False, 'message': 'Нельзя удалить самого себя'}), 400
        
        # Нельзя удалить последнего администратора
        if user.role == 'admin':
            admin_count = User.query.filter_by(role='admin').count()
            if admin_count <= 1:
                return jsonify({'success': False, 'message': 'Нельзя удалить последнего администратора'}), 400
        
        db.session.delete(user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Пользователь успешно удален'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== API ДЛЯ УПРАВЛЕНИЯ РОЛЯМИ =====

@app.route('/api/roles', methods=['GET'])
@login_required
def get_roles():
    """Получить список всех ролей с правами доступа"""
    if not current_user.has_permission('users', 'view'):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    roles = Role.query.all()
    roles_list = []
    for role in roles:
        permissions_dict = {}
        for perm in role.permissions:
            permissions_dict[perm.section] = {
                'can_view': perm.can_view,
                'can_edit': perm.can_edit
            }
        
        roles_list.append({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'permissions': permissions_dict,
            'users_count': len(role.users)
        })
    
    return jsonify(roles_list)


@app.route('/api/roles', methods=['POST'])
@login_required
def create_role():
    """Создать новую роль"""
    if not current_user.has_permission('users', 'edit'):
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        data = request.json
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        permissions = data.get('permissions', {})
        
        if not name:
            return jsonify({'success': False, 'message': 'Введите название роли'}), 400
        
        # Проверка уникальности
        if Role.query.filter_by(name=name).first():
            return jsonify({'success': False, 'message': 'Роль с таким названием уже существует'}), 400
        
        # Создание роли
        role = Role(name=name, description=description)
        db.session.add(role)
        db.session.flush()  # Получить ID роли
        
        # Добавление прав доступа
        sections = ['dashboard', 'students', 'groups', 'tariffs', 'finances', 'attendance', 'camera', 'rewards', 'rating', 'users', 'cash']
        for section in sections:
            perm_data = permissions.get(section, {})
            permission = RolePermission(
                role_id=role.id,
                section=section,
                can_view=perm_data.get('can_view', False),
                can_edit=perm_data.get('can_edit', False)
            )
            db.session.add(permission)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Роль успешно создана',
            'role': {
                'id': role.id,
                'name': role.name
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/roles/<int:role_id>', methods=['PUT'])
@login_required
def update_role(role_id):
    """Обновить роль и её права доступа"""
    if not current_user.has_permission('users', 'edit'):
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        role = db.session.get(Role, role_id)
        if not role:
            return jsonify({'success': False, 'message': 'Роль не найдена'}), 404
        
        data = request.json
        name = data.get('name')
        description = data.get('description')
        permissions = data.get('permissions')
        
        if name and name != role.name:
            if Role.query.filter_by(name=name).first():
                return jsonify({'success': False, 'message': 'Роль с таким названием уже существует'}), 400
            role.name = name
        
        if description is not None:
            role.description = description
        
        # Обновление прав доступа
        if permissions:
            sections = ['dashboard', 'students', 'groups', 'tariffs', 'finances', 'attendance', 'camera', 'rewards', 'rating', 'users', 'cash']
            for section in sections:
                perm_data = permissions.get(section, {})
                permission = RolePermission.query.filter_by(role_id=role.id, section=section).first()
                
                if permission:
                    permission.can_view = perm_data.get('can_view', False)
                    permission.can_edit = perm_data.get('can_edit', False)
                else:
                    permission = RolePermission(
                        role_id=role.id,
                        section=section,
                        can_view=perm_data.get('can_view', False),
                        can_edit=perm_data.get('can_edit', False)
                    )
                    db.session.add(permission)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Роль успешно обновлена'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/roles/<int:role_id>', methods=['DELETE'])
@login_required
def delete_role(role_id):
    """Удалить роль"""
    if not current_user.has_permission('users', 'edit'):
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        role = db.session.get(Role, role_id)
        if not role:
            return jsonify({'success': False, 'message': 'Роль не найдена'}), 404
        
        # Проверка, используется ли роль
        if len(role.users) > 0:
            return jsonify({'success': False, 'message': 'Роль используется пользователями. Сначала измените роли пользователей'}), 400
        
        db.session.delete(role)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Роль успешно удалена'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/cash')
@login_required
def cash_page():
    """Страница управления кассой - редирект на finances с вкладкой cash"""
    ensure_cash_transfers_table()
    return redirect(url_for('finances_page') + '#cash')


@app.route('/api/cash/balance', methods=['GET'])
@login_required
def get_cash_balance():
    """Получить остаток кассы (приход - расход - переданные средства)"""
    ensure_cash_transfers_table()
    from datetime import date
    from sqlalchemy import func
    
    # Общий приход
    total_income = db.session.query(func.sum(Payment.amount_paid)).scalar() or 0
    
    # Общий расход
    total_expenses = db.session.query(func.sum(Expense.amount)).scalar() or 0
    
    # Общая сумма переданных средств
    total_transferred = db.session.query(func.sum(CashTransfer.amount)).scalar() or 0
    
    # Остаток
    balance = total_income - total_expenses - total_transferred
    
    return jsonify({
        'balance': balance,
        'total_income': total_income,
        'total_expenses': total_expenses,
        'total_transferred': total_transferred
    })


@app.route('/api/cash/transfers', methods=['GET'])
@login_required
def get_cash_transfers():
    """Получить список передач денег управляющему"""
    try:
        ensure_cash_transfers_table()
        from datetime import datetime
        
        # Получить параметры фильтрации
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        recipient = request.args.get('recipient')
        
        query = CashTransfer.query
        
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(CashTransfer.transfer_date >= date_from_obj)
            except:
                pass
        
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d')
                query = query.filter(CashTransfer.transfer_date <= date_to_obj)
            except:
                pass
        
        if recipient:
            query = query.filter(CashTransfer.recipient.ilike(f'%{recipient}%'))
        
        transfers = query.order_by(CashTransfer.transfer_date.desc()).all()
        
        transfers_list = []
        for t in transfers:
            creator_name = t.creator.username if t.creator else 'Неизвестно'
            transfers_list.append({
                'id': t.id,
                'amount': t.amount,
                'recipient': getattr(t, 'recipient', 'Не указано'),
                'transfer_date': t.transfer_date.isoformat() if isinstance(t.transfer_date, datetime) else t.transfer_date,
                'notes': t.notes,
                'created_by': t.created_by,
                'creator_name': creator_name,
                'created_at': t.created_at.isoformat() if t.created_at else None
            })
        
        return jsonify(transfers_list)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/cash/transfers', methods=['POST'])
@login_required
def create_cash_transfer():
    """Создать передачу денег управляющему"""
    ensure_cash_transfers_table()
    from datetime import datetime
    
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        recipient = data.get('recipient', '').strip()
        transfer_date_str = data.get('transfer_date')
        notes = data.get('notes', '').strip()
        
        if amount <= 0:
            return jsonify({'success': False, 'message': 'Сумма должна быть больше нуля'}), 400
        
        if not recipient:
            return jsonify({'success': False, 'message': 'Укажите имя управляющего'}), 400
        
        # Парсинг даты
        if transfer_date_str:
            try:
                transfer_date = datetime.fromisoformat(transfer_date_str.replace('Z', '+00:00'))
            except:
                transfer_date = datetime.now()
        else:
            transfer_date = datetime.now()
        
        # Создать запись
        transfer = CashTransfer(
            amount=amount,
            recipient=recipient,
            transfer_date=transfer_date,
            notes=notes,
            created_by=current_user.id
        )
        
        db.session.add(transfer)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Передача денег успешно создана',
            'transfer': {
                'id': transfer.id,
                'amount': transfer.amount,
                'recipient': transfer.recipient,
                'transfer_date': transfer.transfer_date.isoformat(),
                'notes': transfer.notes
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/cash/transfers/<int:transfer_id>', methods=['PUT'])
@login_required
def update_cash_transfer(transfer_id):
    """Обновить передачу денег"""
    from datetime import datetime
    
    try:
        transfer = db.session.get(CashTransfer, transfer_id)
        if not transfer:
            return jsonify({'success': False, 'message': 'Передача не найдена'}), 404
        
        data = request.json
        amount = data.get('amount')
        recipient = data.get('recipient')
        transfer_date_str = data.get('transfer_date')
        notes = data.get('notes')
        
        if amount is not None:
            amount = float(amount)
            if amount <= 0:
                return jsonify({'success': False, 'message': 'Сумма должна быть больше нуля'}), 400
            transfer.amount = amount
        
        if recipient is not None:
            recipient = recipient.strip()
            if not recipient:
                return jsonify({'success': False, 'message': 'Укажите имя управляющего'}), 400
            transfer.recipient = recipient
        
        if transfer_date_str:
            try:
                transfer.transfer_date = datetime.fromisoformat(transfer_date_str.replace('Z', '+00:00'))
            except:
                pass
        
        if notes is not None:
            transfer.notes = notes.strip()
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Передача денег успешно обновлена'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/cash/transfers/<int:transfer_id>', methods=['DELETE'])
@login_required
def delete_cash_transfer(transfer_id):
    """Удалить передачу денег"""
    try:
        transfer = db.session.get(CashTransfer, transfer_id)
        if not transfer:
            return jsonify({'success': False, 'message': 'Передача не найдена'}), 404
        
        db.session.delete(transfer)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Передача денег успешно удалена'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    """Распознать лицо из кадра камеры"""
    try:
        # Получить изображение (base64 или файл)
        if 'image' in request.files:
            image_file = request.files['image']
            temp_path = os.path.join(app.config['UPLOAD_FOLDER'], 'temp_recognize.jpg')
            image_file.save(temp_path)
            
            student_id = face_service.recognize_face_from_image(temp_path)
            os.remove(temp_path)
            
            if student_id:
                student = db.session.get(Student, student_id)
                return jsonify({
                    'success': True,
                    'student_id': student.id,
                    'student_name': student.full_name,
                    'balance': calculate_student_balance(student),
                    'photo': student.photo_path
                })
            else:
                return jsonify({'success': False, 'message': 'Лицо не распознано'})
        
        return jsonify({'success': False, 'message': 'Нет изображения'}), 400
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recognize_multiple', methods=['POST'])
def recognize_multiple_faces():
    """Распознать несколько лиц из кадра камеры"""
    try:
        if 'image' in request.files:
            image_file = request.files['image']
            temp_path = os.path.join(app.config['UPLOAD_FOLDER'], 'temp_recognize.jpg')
            image_file.save(temp_path)
            
            recognized = face_service.recognize_multiple_faces_from_image(temp_path)
            os.remove(temp_path)
            
            if len(recognized) > 0:
                students_data = []
                for item in recognized:
                    student = db.session.get(Student, item['student_id'])
                    if student:
                        students_data.append({
                            'student_id': student.id,
                            'student_name': student.full_name,
                            'balance': calculate_student_balance(student),
                            'photo': student.photo_path
                        })
                
                return jsonify({
                    'success': True,
                    'count': len(students_data),
                    'students': students_data
                })
            else:
                return jsonify({'success': False, 'message': 'Лица не распознаны'})
        
        return jsonify({'success': False, 'message': 'Нет изображения'}), 400
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/students/<int:student_id>/delete-photo', methods=['POST'])
@login_required
def delete_student_photo(student_id):
    """Удалить фотографию ученика"""
    try:
        student = Student.query.get_or_404(student_id)
        if student.photo_path and os.path.exists(student.photo_path):
            try:
                os.remove(student.photo_path)
            except Exception as e:
                print(f"Ошибка при удалении файла: {e}")
        
        student.photo_path = None
        student.face_encoding = None
        db.session.commit()
        
        # Обновить кэш лиц
        reload_face_encodings()
        
        return jsonify({'success': True, 'message': 'Фотография удалена'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/recognize_from_cam', methods=['POST'])
@login_required
def recognize_from_cam():
    """Распознать лицо напрямую из потока камеры (берем готовые данные из фонового потока)"""
    try:
        # Получаем результаты из сервиса
        faces, _ = face_service.get_latest_results()
        
        results = []
        for face in faces:
            # Если лицо распознано и есть ID
            if face.get('is_recognized') and face.get('student_id'):
                student_id = face['student_id']
                
                # Загружаем инфо о студенте
                student = db.session.get(Student, student_id)
                if student:
                    results.append({
                        'student_id': student.id,
                        'student_name': student.full_name,
                        'balance': calculate_student_balance(student),
                        'photo': student.photo_path
                    })
        
        return jsonify({
            'success': True,
            'count': len(results),
            'students': results
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Ошибка recognize_from_cam: {e}\n{error_trace}")
        return jsonify({'success': False, 'message': str(e)}), 500


def reload_face_encodings():
    """Перезагрузить все face encodings в память"""
    students = Student.query.filter_by(status='active').all()
    face_service.load_students(students)


# ===== ИНИЦИАЛИЗАЦИЯ =====

def init_db():
    """Создать таблицы и первого админа"""
    with app.app_context():
        db.create_all()
        
        # Выполнить миграции ОДИН РАЗ при запуске
        print("🛠️ Проверка и обновление структуры БД...")
        ensure_users_table_columns()
        ensure_roles_tables()
        ensure_club_settings_columns()
        ensure_students_columns()
        ensure_cash_transfers_table()
        ensure_payment_type_column()
        
        # Проверить, есть ли админ
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(
                username='admin',
                password_hash=bcrypt.generate_password_hash('admin123').decode('utf-8'),
                role='admin'
            )
            db.session.add(admin)
            db.session.commit()
            print("Создан администратор: admin / admin123")
        
        # Убедиться, что у всех учеников есть код Telegram
        students_without_code = Student.query.filter(
            (Student.telegram_link_code.is_(None)) | (Student.telegram_link_code == '')
        ).all()
        if students_without_code:
            for student in students_without_code:
                ensure_student_has_telegram_code(student)
            db.session.commit()
            print(f"✓ Сгенерированы коды Telegram для {len(students_without_code)} учеников")
        
        # ОДИН РАЗ загружаем encodings
        print("👤 Загрузка базы лиц...")
        reload_face_encodings()


# ===== ПОМЕСЯЧНЫЕ ОПЛАТЫ =====

@app.route('/api/students/<int:student_id>/monthly-payments', methods=['GET'])
@login_required
def get_monthly_payments(student_id):
    """Получить помесячные оплаты ученика"""
    try:
        # Получить студента и его тариф
        student = db.session.get(Student, student_id)
        if not student:
            return jsonify({'error': 'Студент не найден'}), 404
        
        # Явно загружаем тариф, если он есть
        tariff_price = 0
        tariff_name = None
        if student.tariff_id:
            tariff = db.session.get(Tariff, student.tariff_id)
            if tariff:
                tariff_name = tariff.name
                tariff_price = float(tariff.price) if tariff.price else 0
        elif student.tariff:
            # Если тариф загружен через relationship
            tariff_name = student.tariff.name if student.tariff.name else None
            tariff_price = float(student.tariff.price) if student.tariff.price else 0
        
        # Получить все платежи ученика с метаданными месяца
        payments = Payment.query.filter_by(student_id=student_id).order_by(Payment.payment_date.desc()).all()
        
        # Группировать по месяцам используя payment_month и payment_year
        payments_by_month = {}
        for payment in payments:
            # Использовать payment_month/payment_year если есть, иначе брать из payment_date
            if payment.payment_month and payment.payment_year:
                month_key = f"{payment.payment_year}-{str(payment.payment_month).zfill(2)}"
            elif payment.payment_date:
                month_key = payment.payment_date.strftime('%Y-%m')
            else:
                continue
                
            if month_key not in payments_by_month:
                payments_by_month[month_key] = {
                    'payments': [],
                    'total_paid': 0,
                    'tariff_price': tariff_price,
                    'remainder': tariff_price
                }
            
            payments_by_month[month_key]['payments'].append({
                'id': payment.id,
                'date': payment.payment_date.isoformat() if payment.payment_date else None,
                'amount': float(payment.amount_paid),
                'payment_type': payment.payment_type or 'cash',
                'notes': payment.notes or '',
                'tariff_name': payment.tariff_name or ''
            })
            payments_by_month[month_key]['total_paid'] += float(payment.amount_paid)
            payments_by_month[month_key]['remainder'] = max(0, tariff_price - total_paid)
        
        return jsonify({
            'payments_by_month': payments_by_month,
            'tariff_price': tariff_price,
            'tariff_name': tariff_name
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/students/add-monthly-payment', methods=['POST'])
@login_required
def add_monthly_payment():
    """Добавить помесячную оплату"""
    try:
        data = request.json
        student_id = data.get('student_id')
        year = data.get('year')
        month = data.get('month')
        payment_date = data.get('payment_date')
        amount = float(data.get('amount', 0))
        payment_type = data.get('payment_type', 'cash')  # Тип оплаты: cash, card, click, payme, uzum
        notes = data.get('notes', '')
        
        student = db.session.get(Student, student_id)
        if not student:
            return jsonify({'success': False, 'message': 'Ученик не найден'})

        # Блокировка оплат за будущие месяцы, если включено в настройках клуба
        settings = get_club_settings_instance()
        if getattr(settings, 'block_future_payments', False):
            today = get_local_date()
            if year > today.year or (year == today.year and month > today.month):
                return jsonify({'success': False, 'message': 'Оплата за будущие месяцы запрещена настройками клуба'}), 400

        # Проверка тарифа и текущих оплат за месяц
        tariff_price = None
        if student.tariff_id:
            tariff = db.session.get(Tariff, student.tariff_id)
            tariff_price = float(tariff.price) if tariff and tariff.price is not None else None

        if tariff_price is not None:
            existing_paid = db.session.query(db.func.sum(Payment.amount_paid)).filter(
                Payment.student_id == student_id,
                Payment.payment_year == year,
                Payment.payment_month == month
            ).scalar() or 0
            if existing_paid + amount > tariff_price:
                remainder = max(0, tariff_price - existing_paid)
                return jsonify({
                    'success': False,
                    'message': f'Оплата превышает стоимость тарифа. Осталось не более {remainder:.0f} сум'
                }), 400
        
        # Создать запись оплаты с привязкой к выбранному месяцу через notes и метаданные
        # payment_date используется только как дата фактической транзакции
        month_label = f"{month}/{year}"
        payment = Payment(
            student_id=student_id,
            tariff_id=student.tariff_id if student.tariff_id else None,
            amount_paid=amount,
            amount_due=0,
            payment_date=datetime.fromisoformat(payment_date),
            payment_type=payment_type,
            notes=f"{notes} (Оплата за {month_label})" if notes else f"Оплата за {month_label}",
            lessons_added=0,
            # Сохранить месяц в отдельном поле для корректной группировки
            payment_month=month,
            payment_year=year
        )
        
        db.session.add(payment)
        db.session.commit()
        
        # Вычислить долг за этот месяц
        tariff_price = tariff_price or 0
        existing_paid = existing_paid or 0
        total_paid_after = existing_paid + amount
        debt = max(0, tariff_price - total_paid_after) if tariff_price > 0 else 0
        
        # Отправить уведомление в Telegram
        try:
            send_payment_notification(
                student_id=student_id,
                payment_date=payment.payment_date,
                month=month_label,
                payment_type=payment_type,
                amount_paid=amount,
                debt=debt if debt > 0 else None
            )
        except Exception as e:
            print(f"Ошибка отправки уведомления об оплате: {e}")
            # Не прерываем выполнение, если уведомление не отправилось
        
        return jsonify({
            'success': True,
            'message': 'Оплата добавлена',
            'payment_id': payment.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payments/<int:payment_id>', methods=['PUT'])
@login_required
def update_payment(payment_id):
    """Редактирование существующей оплаты (сумма, дата, комментарий)"""
    # Разрешим роли: admin, financier, payment_admin
    if getattr(current_user, 'role', None) not in ['admin', 'financier', 'payment_admin']:
        return jsonify({'success': False, 'message': 'Нет доступа'}), 403

    try:
        data = request.get_json() or {}
        payment = db.session.get(Payment, payment_id)
        if not payment:
            return jsonify({'success': False, 'message': 'Оплата не найдена'}), 404

        # Валидация суммы
        if 'amount_paid' in data:
            new_amount = float(data.get('amount_paid'))
            if new_amount <= 0:
                return jsonify({'success': False, 'message': 'Сумма должна быть положительной'}), 400
            # Проверяем лимит по тарифу в рамках того же месяца
            tariff_price = None
            if payment.tariff_id:
                tariff_obj = db.session.get(Tariff, payment.tariff_id)
                tariff_price = float(tariff_obj.price) if tariff_obj and tariff_obj.price is not None else None
            if tariff_price is not None:
                existing_paid = db.session.query(db.func.sum(Payment.amount_paid)).filter(
                    Payment.student_id == payment.student_id,
                    Payment.payment_year == payment.payment_year,
                    Payment.payment_month == payment.payment_month,
                    Payment.id != payment.id
                ).scalar() or 0
                if existing_paid + new_amount > tariff_price:
                    remainder = max(0, tariff_price - existing_paid)
                    return jsonify({'success': False, 'message': f'Сумма превышает стоимость тарифа. Доступно не более {remainder:.0f} сум'}), 400
            payment.amount_paid = new_amount

        if 'payment_date' in data and data.get('payment_date'):
            try:
                payment_date_str = data.get('payment_date')
                # Если дата в формате YYYY-MM-DD, добавить время
                if len(payment_date_str) == 10:
                    payment_date_str += 'T00:00:00'
                payment.payment_date = datetime.fromisoformat(payment_date_str.replace('Z', '+00:00'))
            except ValueError as e:
                return jsonify({'success': False, 'message': f'Неверный формат даты: {str(e)}'}), 400

        if 'payment_type' in data:
            payment.payment_type = data.get('payment_type')

        if 'notes' in data:
            payment.notes = data.get('notes')

        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payments/<int:payment_id>/delete', methods=['DELETE'])
@login_required
def delete_payment(payment_id):
    """Удалить оплату"""
    if getattr(current_user, 'role', None) not in ['admin', 'financier', 'payment_admin']:
        return jsonify({'success': False, 'message': 'Нет доступа'}), 403

    try:
        payment = db.session.get(Payment, payment_id)
        if not payment:
            return jsonify({'success': False, 'message': 'Оплата не найдена'}), 404

        student = payment.student
        db.session.delete(payment)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Оплата удалена',
            'new_balance': calculate_student_balance(student) if student else None
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/payments/<int:payment_id>/refund', methods=['POST'])
@login_required
def refund_payment(payment_id):
    """Возврат оплаты - создание обратной записи"""
    if getattr(current_user, 'role', None) not in ['admin', 'financier', 'payment_admin']:
        return jsonify({'success': False, 'message': 'Нет доступа'}), 403

    try:
        original_payment = db.session.get(Payment, payment_id)
        if not original_payment:
            return jsonify({'success': False, 'message': 'Оплата не найдена'}), 404

        # Создать обратную запись с отрицательной суммой
        refund_payment = Payment(
            student_id=original_payment.student_id,
            tariff_id=original_payment.tariff_id,
            amount_paid=-original_payment.amount_paid,  # Отрицательная сумма
            amount_due=0,
            lessons_added=-original_payment.lessons_added if original_payment.lessons_added else 0,  # Отрицательные уроки
            is_full_payment=False,
            payment_date=get_local_datetime(),
            tariff_name=original_payment.tariff_name,
            notes=f"Возврат оплаты #{original_payment.id}" + (f" ({original_payment.notes})" if original_payment.notes else ""),
            created_by=current_user.id,
            payment_month=original_payment.payment_month,
            payment_year=original_payment.payment_year,
            payment_type=original_payment.payment_type
        )
        
        db.session.add(refund_payment)
        db.session.commit()

        student = original_payment.student
        return jsonify({
            'success': True,
            'message': 'Возврат оплаты выполнен',
            'new_balance': calculate_student_balance(student) if student else None,
            'refund_id': refund_payment.id
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ===== TELEGRAM API =====

@app.route('/api/telegram/register-by-phone', methods=['POST'])
def telegram_register_by_phone():
    """Регистрация Telegram по номеру телефона (контакту)"""
    data = request.get_json()
    chat_id = data.get('chat_id')
    raw_phone = data.get('phone')  # Номер от Telegram (может быть с + или без)
    
    if not chat_id or not raw_phone:
        return jsonify({'success': False, 'message': 'Нет данных'}), 400
        
    # Нормализация телефона для поиска: убираем всё кроме цифр
    phone_digits = ''.join(filter(str.isdigit, raw_phone))
    
    # --- ПРОВЕРКА НА РУКОВОДСТВО ---
    settings = get_club_settings_instance()
    
    is_director = phones_match_simple(getattr(settings, 'director_phone', ''), phone_digits)
    is_founder = phones_match_simple(getattr(settings, 'founder_phone', ''), phone_digits)
    is_cashier = phones_match_simple(getattr(settings, 'cashier_phone', ''), phone_digits)
    
    if is_director or is_founder or is_cashier:
        if is_director:
            settings.director_chat_id = str(chat_id)
        if is_founder:
            settings.founder_chat_id = str(chat_id)
        if is_cashier:
            settings.cashier_chat_id = str(chat_id)
            
        db.session.commit()
        
        roles = []
        if is_director: roles.append("Директор")
        if is_founder: roles.append("Учредитель")
        if is_cashier: roles.append("Кассир")
        
        return jsonify({
            'success': True,
            'message': f'Вы успешно авторизованы как: {", ".join(roles)}',
            'is_staff': True,
            'roles': roles
        })

    # --- ПОИСК УЧЕНИКА ---
    # Пытаемся найти ученика
    candidates = Student.query.filter(or_(Student.phone.isnot(None), Student.parent_phone.isnot(None))).all()
    matched_student = None
    
    for student in candidates:
        # Используем существующую умную проверку телефонов
        if phones_match(student.phone, list_to_phone(phone_digits)) or \
           phones_match(student.parent_phone, list_to_phone(phone_digits)) or \
           phones_match(student.phone, raw_phone) or \
           phones_match(student.parent_phone, raw_phone):
            matched_student = student
            break
            
    # Дополнительная попытка: если в базе номера без +, а пришел с + (или наоборот)
    if not matched_student:
         # Ищем по последним 9 цифрам (универсально)
         short_phone = phone_digits[-9:] if len(phone_digits) >= 9 else phone_digits
         for student in candidates:
             s_ph = ''.join(filter(str.isdigit, student.phone or ''))
             p_ph = ''.join(filter(str.isdigit, student.parent_phone or ''))
             if s_ph.endswith(short_phone) or p_ph.endswith(short_phone):
                 matched_student = student
                 break

    if matched_student:
        # Сохраняем chat_id
        matched_student.telegram_chat_id = str(chat_id)
        ensure_student_has_telegram_code(matched_student)
        db.session.commit()
        
        group_name = matched_student.group.name if matched_student.group else 'Без группы'
        
        return jsonify({
            'success': True,
            'message': f'Ты успешно привязан!',
            'student': {
                'id': matched_student.id,
                'full_name': matched_student.full_name,
                'group_name': group_name,
                'code': matched_student.telegram_link_code
            }
        })
    else:
        return jsonify({
            'success': False, 
            'message': 'Номер телефона не найден в базе учеников. Обратись к администратору.'
        })

def phones_match_simple(stored_phone, input_digits):
    """Простое сравнение телефонов по последним 9 цифрам"""
    if not stored_phone: return False
    stored_digits = ''.join(filter(str.isdigit, stored_phone))
    if len(stored_digits) < 9 or len(input_digits) < 9:
        return False # Слишком короткие номера
    return stored_digits[-9:] == input_digits[-9:]

def list_to_phone(digits):
    return digits # Заглушка, используем просто строку цифр для матчинга

@app.route('/api/telegram/register', methods=['POST'])
def telegram_register():
    """
    API для регистрации ученика в Telegram боте
    Используется ботом для привязки ученика по коду
    """
    try:
        data = request.get_json()
        chat_id = data.get('chat_id')
        code = data.get('code')
        
        if not chat_id:
            return jsonify({'success': False, 'message': 'Chat ID не указан'}), 400
        
        if not code:
            return jsonify({'success': False, 'message': 'Код не указан'}), 400
        
        success, message, student = register_student_by_code(chat_id, code)
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'student': {
                    'id': student.id,
                    'full_name': student.full_name,
                    'group_name': student.group.name if student.group else None
                }
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/club-settings/public', methods=['GET'])
def get_club_settings_public():
    """
    Публичный endpoint для получения токена бота
    Используется только ботом для получения токена
    """
    settings = get_club_settings_instance()
    return jsonify({
        'telegram_bot_token': settings.telegram_bot_token or '',
        'director_phone': getattr(settings, 'director_phone', '') or '',
        'founder_phone': getattr(settings, 'founder_phone', '') or '',
        'cashier_phone': getattr(settings, 'cashier_phone', '') or ''
    })


@app.route('/api/telegram/send-payment-reminders', methods=['POST'])
@login_required
def send_payment_reminders_api():
    """
    Ручная отправка напоминаний об оплате (для тестирования или ручного запуска)
    """
    if current_user.role not in ['admin']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        result = send_monthly_payment_reminders()
        return jsonify(result)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Ошибка при отправке напоминаний об оплате: {error_trace}")
        return jsonify({'success': False, 'message': f'Ошибка: {str(e)}'}), 500


@app.route('/api/groups/<int:group_id>/send-notification', methods=['POST'])
@login_required
def send_group_notification_api(group_id):
    """
    Отправить уведомления всем ученикам группы
    """
    if current_user.role not in ['admin', 'teacher']:
        return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
    
    try:
        data = request.get_json() or {}
        additional_text = data.get('additional_text', '')
        
        result = send_group_notification(group_id, additional_text)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Ошибка при отправке уведомлений: {error_trace}")
        return jsonify({'success': False, 'message': f'Ошибка: {str(e)}'}), 500

@app.route('/api/system_stats', methods=['GET'])
def get_system_stats():
    """Получить параметры загрузки системы (Task Manager style)"""
    stats = {
        'cpu': psutil.cpu_percent(interval=None),
        'ram': psutil.virtual_memory().percent,
        'gpu': 0,
        'vram': 0,
        'gpu_temp': 0,
        'gpu_name': 'N/A'
    }
    
    if NVML_ENABLED:
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            name = pynvml.nvmlDeviceGetName(handle)
            
            stats['gpu'] = util.gpu
            stats['vram'] = int((mem.used / mem.total) * 100)
            stats['gpu_temp'] = temp
            stats['gpu_name'] = name.decode('utf-8') if isinstance(name, bytes) else name
        except Exception as e:
            print(f"NVML Error: {e}")
            
    return jsonify(stats)


@app.route('/api/camera/settings', methods=['GET', 'POST'])
def handle_camera_settings():
    """Управление настройками качества камеры"""
    global CAMERA_OVERRIDE_SOURCE
    camera = get_camera()
    if not camera:
        return jsonify({'success': False, 'message': 'Камера не доступна'}), 400
        
    if request.method == 'GET':
        return jsonify({
            'success': True, 
            'settings': {
                **camera.output_settings,
                'source': 'webcam' if CAMERA_OVERRIDE_SOURCE == 0 else 'ezviz'
            }
        })
        
    # POST
    data = request.json
    resolution = data.get('resolution')
    quality = data.get('quality')
    source = data.get('source') # 'webcam' или 'ezviz'

    if source == 'webcam':
        CAMERA_OVERRIDE_SOURCE = 0
    elif source == 'ezviz':
        CAMERA_OVERRIDE_SOURCE = None # Вернуться к настройкам БД
    
    if resolution in ['720p', '1080p', '2k']:
        camera.output_settings['resolution'] = resolution
        
    if quality:
        try:
            q = int(quality)
            if 1 <= q <= 100:
                camera.output_settings['quality'] = q
        except ValueError:
            pass
            
    return jsonify({
        'success': True, 
        'settings': camera.output_settings
    })


# Планировщик для автоматической отправки напоминаний об оплате
def send_daily_summary():
    """Ежедневный отчет руководству (21:00)"""
    with app.app_context():
        try:
            today = date.today()
            today_str = today.strftime('%d.%m.%Y')
            
            # 1. Посещаемость
            # Нужно найти все группы, у которых были занятия сегодня
            # Это сложная логика, пока просто возьмем всех студентов, у которых status='active'
            total_students = Student.query.filter_by(status='active').count()
            
            # Для точной посещаемости нужно смотреть таблицу Attendance (если она есть)
            # Предположим, у нас есть посещаемость. Если нет, покажем общие цифры.
            # (Здесь упрощенная логика, так как модели Attendance я не видел, но она подразумевается)
            
            # 2. Финансы (Оплаты)
            payments_today = Payment.query.filter(func.date(Payment.created_at) == today).all()
            total_income = sum(p.amount_paid for p in payments_today)
            income_count = len(payments_today)
            
            # 3. Расходы
            expenses_today = Expense.query.filter(func.date(Expense.created_at) == today).all()
            total_expenses = sum(e.amount for e in expenses_today)
            expense_count = len(expenses_today)
            
            # 4. Баланс
            balance = total_income - total_expenses
            
            msg = (
                f"📊 <b>Ежедневная сводка ({today_str})</b>\n\n"
                f"👥 <b>Ученики:</b>\n"
                f"   • Активных: {total_students}\n\n"
                f"💰 <b>Финансы:</b>\n"
                f"   • Приход: {format_currency(total_income)} сум ({income_count} платежей)\n"
                f"   • Расход: {format_currency(total_expenses)} сум ({expense_count} записей)\n"
                f"   • Сальдо: {format_currency(balance)} сум\n\n"
                f"<i>Подробности смотрите в CRM.</i>"
            )
            
            send_management_notification(msg, roles=['director', 'founder'])
            print(f"Ежедневная сводка отправлена {today_str}")
            
        except Exception as e:
            print(f"Ошибка в send_daily_summary: {e}")

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

def setup_scheduler():
    """Настройка планировщика для автоматической отправки напоминаний"""
    scheduler = BackgroundScheduler()
    
    # Запускать каждый день в 9:00 утра, но функция сама проверит, что это начало месяца (1-3 число)
    scheduler.add_job(
        func=send_monthly_payment_reminders_job,
        trigger=CronTrigger(hour=9, minute=0),
        id='send_payment_reminders',
        name='Отправка напоминаний об оплате',
        replace_existing=True
    )
    
    # Ежедневный отчет для руководства в 21:00
    scheduler.add_job(
        func=send_daily_summary,
        trigger=CronTrigger(hour=21, minute=0),
        id='send_daily_summary',
        name='Ежедневная сводка руководству',
        replace_existing=True
    )
    
    scheduler.start()
    print("✅ Планировщик запущен: автоматическая отправка напоминаний об оплате в начале месяца")
    return scheduler

def send_monthly_payment_reminders_job():
    """Задача для планировщика - отправка напоминаний об оплате"""
    with app.app_context():
        try:
            result = send_monthly_payment_reminders()
            print(f"📧 Напоминания об оплате: {result.get('message', 'Выполнено')}")
        except Exception as e:
            print(f"❌ Ошибка при отправке напоминаний об оплате: {e}")



# --- АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ БД ---
# Выполняется при импорте модуля (работает и для Gunicorn на Railway, и локально)
with app.app_context():
    try:
        print("🔄 Проверка и создание таблиц БД...")
        db.create_all()
        # Теперь функции определены, можно вызывать
        ensure_users_table_columns()
        ensure_roles_tables()
        ensure_club_settings_columns()
        ensure_students_columns()
        ensure_expense_columns()
        ensure_cash_transfers_table()
        
        # Создание администратора
        print("👤 Проверка пользователя admin...")
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            print("🛠 Создание пользователя admin...")
            # Ищем роль
            admin_role = Role.query.filter_by(name='Администратор').first()
            role_id = admin_role.id if admin_role else None
            
            hashed_pw = bcrypt.generate_password_hash('admin').decode('utf-8')
            new_admin = User(
                username='admin', 
                password_hash=hashed_pw, 
                role='admin',
                role_id=role_id,
                full_name='Super Admin'
            )
            db.session.add(new_admin)
            db.session.commit()
            print("✅ Пользователь admin успешно создан (пароль: admin)")
        else:
            print("✅ Пользователь admin уже существует")

        print("✅ База данных успешно инициализирована")
    except Exception as e:
        print(f"❌ Ошибка инициализации БД: {e}")
        import traceback
        traceback.print_exc()
# ---------------------------------------------
    # Восстановление дефолтных ассетов (если Volume пустой)
    try:
        backup_root = 'defaults'
        if os.path.exists(backup_root):
            print(f"📦 Поиск ассетов в: {backup_root}")
            files_in_backup = os.listdir(backup_root)
            print(f"📄 Найдены файлы в бэкапе: {files_in_backup}")

            upload_dir = app.config['UPLOAD_FOLDER']
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir)
            
            restored_count = 0
            for filename in files_in_backup:
                src = os.path.join(backup_root, filename)
                
                # Игнорируем вложенные папки, берем только файлы
                if os.path.isdir(src):
                    continue
                    
                dst = os.path.join(upload_dir, filename)
                
                # Принудительно копируем (перезаписываем), чтобы исправить возможные битые файлы
                try:
                    shutil.copy2(src, dst)
                    restored_count += 1
                except Exception as copy_err:
                    print(f"⚠️ Не удалось скопировать {filename}: {copy_err}")
            
            if restored_count > 0:
                print(f"✅ Восстановлено {restored_count} файлов ассетов из {backup_root}")
            else:
                print("✅ Все ассеты уже на месте")
        else:
            print("⚠️ Папка defaults не найдена (возможно, ошибка сборки Docker)")
            
    except Exception as e:
        print(f"⚠️ Ошибка восстановления ассетов: {e}")
        import traceback
        traceback.print_exc()

# ---------------------------------------------

if __name__ == '__main__':
    # init_db() # Удалено, инициализация выполняется выше
    
    # Запустить планировщик
    scheduler = setup_scheduler()
    
    # Для Railway используется gunicorn, но для локальной разработки используем встроенный сервер
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    
    try:
        app.run(debug=debug, host='0.0.0.0', port=port, use_reloader=False)  # use_reloader=False для планировщика
    except KeyboardInterrupt:
        scheduler.shutdown()


