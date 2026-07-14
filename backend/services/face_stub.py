import os
import time

from PIL import Image, ImageOps


class DummyFaceService:
    """Лёгкая заглушка для выключенного распознавания лиц.

    Оставляем публичный интерфейс, чтобы остальной код не падал,
    но не тянем тяжелые зависимости (dlib/insightface/onnxruntime).
    """

    def __init__(self):
        self.gpu_active = False
        self.providers = ['CPUExecutionProvider']

    # Совместимость с ожидаемыми методами
    def start(self):
        return None

    def stop(self):
        return None

    def process_frame(self, frame):  # noqa: ARG002
        return None

    def get_latest_results(self):
        return [], 0.0

    def load_students(self, students=None):  # noqa: ARG002
        return None

    def extract_embedding(self, image_path):  # noqa: ARG002
        return None

    def recognize_face_from_image(self, image_path):  # noqa: ARG002
        return None

    def recognize_multiple_faces_from_image(self, image_path):  # noqa: ARG002
        return []

    def save_student_photo(self, photo_file, student_id):
        """Save a web-sized original; lists use a separate 192px thumbnail."""
        upload_dir = "frontend/static/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"student_{student_id}_{int(time.time())}.jpg"
        filepath = os.path.join(upload_dir, filename)
        image = Image.open(photo_file.stream)
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        image.save(filepath, 'JPEG', quality=87, optimize=True, progressive=True)
        return filepath.replace('\\', '/')
