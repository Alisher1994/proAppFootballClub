import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
# import mediapipe as mp  # Удаляем проблемный медиапайп
import threading
import queue
import time
import os
import json
import onnxruntime
import traceback
from datetime import datetime

class FaceAnalysisSystem:
    def __init__(self, gpu_id=0):
        """
        Инициализация системы распознавания лиц нового поколения.
        Использует InsightFace (ArcFace) + MediaPipe/InsightFace Detection.
        Оптимизировано для NVIDIA RTX 3050 (CUDA).
        """
        print("🚀 Инициализация FaceAnalysisSystem (InsightFace + CUDA)...")
        
        # Настройка провайдеров ONNX Runtime
        self.gpu_active = False
        try:
            # Сначала пробуем TensorRT (самый быстрый), затем CUDA
            available = onnxruntime.get_available_providers()
            print(f"🔍 Доступные провайдеры в системе: {available}")
            
            # Для InsightFace лучше передавать просто список строк, 
            # так как он сам создает сессии для разных подмоделей (детекция, гендер, возраст, эмбеддинг)
            desired_providers = []
            if 'TensorrtExecutionProvider' in available:
                desired_providers.append('TensorrtExecutionProvider')
            if 'CUDAExecutionProvider' in available:
                desired_providers.append('CUDAExecutionProvider')
            desired_providers.append('CPUExecutionProvider')
            
            self.providers = desired_providers
            
            # Переходим на 'buffalo_s' (Small) - она в 5-10 раз быстрее при почти той же точности
            # Это решит проблему низкого FPS даже на слабых системах
            self.app = FaceAnalysis(name='buffalo_s', providers=self.providers, root='./models')
            
            # ctx_id=gpu_id (0) указывает на использование GPU
            self.app.prepare(ctx_id=gpu_id, det_size=(320, 320))
            
            # Проверяем, удалось ли реально задействовать GPU (хотя бы в одной модели)
            self.gpu_active = True if 'CUDAExecutionProvider' in available or 'TensorrtExecutionProvider' in available else False
            print(f"💎 Система инициализирована! GPU Активен: {self.gpu_active}")
        except Exception as e:
            print(f"⚠️ Ошибка инициализации GPU: {e}")
            import traceback
            traceback.print_exc()
            print("🐢 Переход на CPU режим...")
            self.providers = ['CPUExecutionProvider']
            self.app = FaceAnalysis(name='buffalo_l', providers=self.providers)
            self.app.prepare(ctx_id=-1, det_size=(320, 320))
            self.gpu_active = False
        
        # Вывод информации о провайдерах для пользователя
        print(f"📊 Доступные провайдеры ONNX: {self.providers}")
        
        # База данных известных лиц
        self.known_embeddings = []
        self.known_student_ids = []
        self.known_names = {} # id -> name
        
        # Очередь для обработки кадров (drop-oldest policy)
        self.frame_queue = queue.Queue(maxsize=2)
        self.result_lock = threading.Lock()
        self.detected_faces = [] # Последние результаты детекции/распознавания
        
        self.is_running = False
        self.inference_thread = None
        
        # Статистика
        self.fps = 0
        self.frame_count = 0
        self.start_time = time.time()
        
    def load_students(self, students):
        """
        Загрузка базы студентов и их эмбеддингов.
        ВАЖНО: Если эмбеддинги старые (dlib, 128-d), их нужно пересчитать.
        InsightFace использует 512-d векторы.
        """
        self.known_embeddings = []
        self.known_student_ids = []
        
        count = 0
        for student in students:
            self.known_names[student.id] = student.full_name
            
            # Проверяем, есть ли уже эмбеддинг InsightFace в БД
            # (Предполагаем, что поле face_encoding может хранить JSON с разной длиной)
            try:
                raw_encoding = student.get_face_encoding()
                if raw_encoding is not None:
                    arr = np.array(raw_encoding, dtype=np.float32)
                    if arr.shape[0] == 512: # Это ArcFace эмбеддинг
                        self.known_embeddings.append(arr)
                        self.known_student_ids.append(student.id)
                        count += 1
            except Exception as e:
                print(f"⚠️ Ошибка загрузки эмбеддинга студента {student.id}: {e}")
        
        if self.known_embeddings:
            self.known_embeddings = np.array(self.known_embeddings)
            
        print(f"✅ База лиц обновлена: {count} студентов с ArcFace эмбеддингами.")

    def start(self):
        """Запуск потока инференса"""
        if self.is_running:
            return
        self.is_running = True
        self.inference_thread = threading.Thread(target=self._inference_loop, daemon=True)
        self.inference_thread.start()
        print("⚙️ Поток инференса FaceAnalysisSystem запущен.")

    def stop(self):
        """Остановка системы"""
        self.is_running = False
        if self.inference_thread:
            self.inference_thread.join()
        print("🛑 FaceAnalysisSystem остановлена.")

    def process_frame(self, frame):
        """Добавление кадра в очередь на обработку (неблокирующее)"""
        try:
            # Очищаем очередь, если она полна (drop-oldest)
            if self.frame_queue.full():
                try: self.frame_queue.get_nowait()
                except queue.Empty: pass
            self.frame_queue.put_nowait(frame)
        except Exception:
            pass

    def _inference_loop(self):
        """Основной цикл инференса (Thread B)"""
        last_recognition_time = time.time()
        recognition_interval = 0.02 # Распознавание каждые 20мс для максимальной плавности на GPU
        
        while self.is_running:
            try:
                frame = self.frame_queue.get(timeout=1)
            except queue.Empty:
                continue

            # 1. Подготовка кадра для инференса (Downscale)
            # Для модели 320x320 оптимально подавать 480p - это быстрее и сохраняет точность
            h, w = frame.shape[:2]
            target_w = 480
            scale = target_w / w
            target_h = int(h * scale)
            
            small_frame = cv2.resize(frame, (target_w, target_h))
            
            # 2. Детекция лиц (InsightFace или MediaPipe)
            # В данном примере используем InsightFace app.get() который делает и детекцию и recognition
            # Но для скорости мы можем управлять детекцией отдельно.
            
            current_time = time.time()
            do_recognition = (current_time - last_recognition_time) > recognition_interval
            
            if do_recognition:
                # Анализируем уменьшенный кадр для скорости
                start_inf = time.time()
                faces = self.app.get(small_frame)
                end_inf = time.time()
                
                # Логируем медленный инференс
                lat = end_inf - start_inf
                if lat > 0.5:
                    print(f"⚠️ Медленный ИИ: {lat:.3f}s. Проверьте GPU!")
                
                results = []
                for face in faces:
                    # Извлекаем данные
                    bbox = face.bbox.astype(int) # [x1, y1, x2, y2]
                    
                    # Масштабируем bbox обратно к оригинальному размеру
                    if scale != 1.0:
                        bbox = (bbox / scale).astype(int)
                    
                    embedding = face.embedding
                    
                    # Сравнение с базой
                    student_id = None
                    name = "Неизвестный"
                    dist = 100.0
                    
                    if len(self.known_embeddings) > 0:
                        # Косинусное сходство (dot product of normalized vectors)
                        # InsightFace уже нормализует эмбеддинги
                        scores = np.dot(self.known_embeddings, embedding)
                        best_idx = np.argmax(scores)
                        # Порог 0.5 для лучшего распознавания на расстоянии
                        if scores[best_idx] > 0.50: 
                            student_id = self.known_student_ids[best_idx]
                            name = self.known_names.get(student_id, "Студент")
                            dist = scores[best_idx]
                    
                    results.append({
                        'bbox': bbox,
                        'name': name,
                        'student_id': student_id,
                        'score': float(dist),
                        'is_recognized': student_id is not None
                    })
                
                with self.result_lock:
                    self.detected_faces = results
                
                last_recognition_time = current_time
            
            # Обновление FPS
            self.frame_count += 1
            elapsed = time.time() - self.start_time
            if elapsed > 1.0:
                self.fps = self.frame_count / elapsed
                self.frame_count = 0
                self.start_time = time.time()

    def get_latest_results(self):
        """Получить последние результаты обработки"""
        with self.result_lock:
            return self.detected_faces.copy(), self.fps

    def extract_embedding(self, image_path):
        """Извлечь эмбеддинг из файла (для регистрации новых студентов)"""
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        faces = self.app.get(img)
        if len(faces) > 0:
            # Возвращаем эмбеддинг самого большого лица
            faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1]), reverse=True)
            return faces[0].embedding
        return None

    def recognize_face_from_image(self, image_path):
        """Распознать одно лицо из изображения (совместимость с API)"""
        embedding = self.extract_embedding(image_path)
        if embedding is None or len(self.known_embeddings) == 0:
            return None
            
        scores = np.dot(self.known_embeddings, embedding)
        best_idx = np.argmax(scores)
        if scores[best_idx] > 0.55: # Единый порог 0.55
            return int(self.known_student_ids[best_idx])
        return None

    def recognize_multiple_faces_from_image(self, image_path):
        """Распознать несколько лиц из изображения (совместимость с API)"""
        img = cv2.imread(image_path)
        if img is None:
            return []
            
        faces = self.app.get(img)
        results = []
        for face in faces:
            embedding = face.embedding
            if len(self.known_embeddings) > 0:
                scores = np.dot(self.known_embeddings, embedding)
                best_idx = np.argmax(scores)
                if scores[best_idx] > 0.55: # Единый порог 0.55
                    results.append({
                        'student_id': int(self.known_student_ids[best_idx]),
                        'score': float(scores[best_idx])
                    })
        return results

    def save_student_photo(self, photo_file, student_id):
        """Сохранить фото (совместимость со старым API)"""
        upload_dir = "frontend/static/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        safe_filename = photo_file.filename.replace(' ', '_').replace('%', '')
        filename = f"student_{student_id}_{safe_filename}"
        filepath = os.path.join(upload_dir, filename)
        photo_file.save(filepath)
        return filepath.replace('\\', '/')
