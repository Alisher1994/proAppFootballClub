import base64
import os
import threading


class AccessFaceVerifier:
    """Lazy InsightFace verifier for terminal snapshots.

    The model is loaded only when the first access event needs verification, so
    normal web startup and bridge responses stay fast.
    """

    def __init__(self, project_root):
        self.project_root = project_root
        self.model = None
        self.model_error = None
        self.lock = threading.Lock()
        self.confirm_threshold = float(os.environ.get('FACE_VERIFY_CONFIRM_THRESHOLD', '0.45'))
        self.mismatch_threshold = float(os.environ.get('FACE_VERIFY_MISMATCH_THRESHOLD', '0.30'))

    def _load_model(self):
        if self.model is not None or self.model_error:
            return self.model
        with self.lock:
            if self.model is not None or self.model_error:
                return self.model
            try:
                from insightface.app import FaceAnalysis

                models_root = os.path.join(self.project_root, 'models')
                self.model = FaceAnalysis(
                    name='buffalo_s',
                    root=models_root,
                    providers=['CPUExecutionProvider'],
                )
                self.model.prepare(ctx_id=-1, det_size=(640, 640))
            except Exception as exc:
                self.model_error = f'{type(exc).__name__}: {exc}'[:500]
                print(f'Face verification is unavailable: {self.model_error}')
        return self.model

    @staticmethod
    def _decode_data_url(data_url):
        if not data_url or not str(data_url).startswith('data:image/'):
            return None
        try:
            import cv2
            import numpy as np

            encoded = str(data_url).split(',', 1)[1]
            raw = base64.b64decode(encoded, validate=False)
            if not raw or len(raw) > 700_000:
                return None
            return cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            return None

    @staticmethod
    def _read_image(path):
        try:
            import cv2
            import numpy as np

            if not path or not os.path.isfile(path):
                return None
            # cv2.imread on Windows cannot reliably open paths containing
            # Cyrillic characters; reading bytes first avoids that limitation.
            return cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            return None

    @staticmethod
    def _embedding(face):
        import numpy as np

        embedding = getattr(face, 'normed_embedding', None)
        if embedding is None:
            embedding = getattr(face, 'embedding', None)
        if embedding is None:
            return None
        embedding = np.asarray(embedding, dtype=np.float32)
        norm = float(np.linalg.norm(embedding))
        return embedding / norm if norm > 0 else None

    @staticmethod
    def _largest_face(faces):
        if not faces:
            return None
        return max(
            faces,
            key=lambda face: max(0, float(face.bbox[2] - face.bbox[0]))
            * max(0, float(face.bbox[3] - face.bbox[1])),
        )

    def verify(self, access_photo_data_url, reference_photo_path):
        access_image = self._decode_data_url(access_photo_data_url)
        if access_image is None:
            return {'status': 'unavailable', 'reason': 'Фото прохода отсутствует или повреждено'}

        reference_image = self._read_image(reference_photo_path)
        if reference_image is None:
            return {'status': 'unavailable', 'reason': 'Эталонное фото ученика недоступно'}

        model = self._load_model()
        if model is None:
            return {'status': 'unavailable', 'reason': 'Модуль проверки лица временно недоступен'}

        with self.lock:
            reference_faces = model.get(reference_image)
            access_faces = model.get(access_image)

        reference_face = self._largest_face(reference_faces)
        reference_embedding = self._embedding(reference_face) if reference_face is not None else None
        if reference_embedding is None:
            return {'status': 'unavailable', 'reason': 'На фото ученика лицо не найдено'}
        if not access_faces:
            return {'status': 'unavailable', 'reason': 'На фото прохода лицо не найдено'}

        # The closest/largest face is treated as the person passing through.
        # Matching any background face could incorrectly confirm tailgating.
        access_embedding = self._embedding(self._largest_face(access_faces))
        if access_embedding is None:
            return {'status': 'unavailable', 'reason': 'Не удалось извлечь лицо из фото прохода'}

        score = max(-1.0, min(1.0, float(reference_embedding @ access_embedding)))
        if score >= self.confirm_threshold:
            status = 'confirmed'
            reason = 'Лицо подтверждено'
        elif score < self.mismatch_threshold:
            status = 'mismatch'
            reason = 'Вероятно, прошёл другой человек'
        else:
            status = 'suspicious'
            reason = 'Требуется ручная проверка'
        return {'status': status, 'similarity': score, 'reason': reason}
