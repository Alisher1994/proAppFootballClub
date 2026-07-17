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
        self.index_lock = threading.Lock()
        self.embedding_cache = {}
        self.candidate_index_signature = None
        self.candidate_index_items = []
        self.candidate_index_matrix = None
        self.confirm_threshold = float(os.environ.get('FACE_VERIFY_CONFIRM_THRESHOLD', '0.45'))
        self.mismatch_threshold = float(os.environ.get('FACE_VERIFY_MISMATCH_THRESHOLD', '0.30'))
        self.identity_margin = float(os.environ.get('FACE_IDENTIFY_MARGIN', '0.05'))
        self.candidate_threshold = float(os.environ.get('FACE_IDENTIFY_CANDIDATE_THRESHOLD', '0.35'))

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
                    allowed_modules=['detection', 'recognition'],
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

    def _reference_embedding(self, path):
        if not path or not os.path.isfile(path):
            return None
        try:
            cache_key = (path, os.path.getmtime(path), os.path.getsize(path))
        except OSError:
            return None
        cached = self.embedding_cache.get(cache_key)
        if cached is not None:
            return cached

        image = self._read_image(path)
        if image is None:
            return None
        faces = self.model.get(image)
        face = self._largest_face(faces)
        embedding = self._embedding(face) if face is not None else None
        if embedding is not None:
            # A changed file gets a new key. Keep the cache bounded for long-running servers.
            if len(self.embedding_cache) > 5000:
                self.embedding_cache.clear()
            self.embedding_cache[cache_key] = embedding
        return embedding

    def _candidate_embedding(self, candidate):
        import numpy as np

        stored = candidate.get('embedding')
        if stored is not None:
            try:
                embedding = np.asarray(stored, dtype=np.float32)
                norm = float(np.linalg.norm(embedding))
                if embedding.shape == (512,) and norm > 0:
                    return embedding / norm
            except Exception:
                pass

        embedding = self._reference_embedding(candidate.get('photo_path'))
        if embedding is not None:
            candidate['computed_embedding'] = embedding.tolist()
        return embedding

    @staticmethod
    def _candidate_signature(candidates):
        return tuple(
            (
                candidate.get('id'),
                candidate.get('photo_path'),
                candidate.get('embedding') is not None,
            )
            for candidate in candidates
        )

    def invalidate_candidate_index(self):
        with self.index_lock:
            self.candidate_index_signature = None
            self.candidate_index_items = []
            self.candidate_index_matrix = None

    def prepare_candidate_index(self, candidates):
        """Build a normalized matrix once; warm events only perform one matrix product."""
        import numpy as np

        signature = self._candidate_signature(candidates)
        with self.index_lock:
            if signature == self.candidate_index_signature and self.candidate_index_matrix is not None:
                return self.candidate_index_items, self.candidate_index_matrix

            if self._load_model() is None:
                return [], None

            items = []
            embeddings = []
            # InsightFace sessions are kept behind the same lock during index construction.
            with self.lock:
                for candidate in candidates:
                    embedding = self._candidate_embedding(candidate)
                    if embedding is None:
                        continue
                    items.append({
                        'id': candidate.get('id'),
                        'full_name': candidate.get('full_name'),
                        'employee_no': candidate.get('employee_no'),
                        'group_name': candidate.get('group_name'),
                    })
                    embeddings.append(embedding)

            matrix = np.ascontiguousarray(np.vstack(embeddings), dtype=np.float32) if embeddings else None
            self.candidate_index_signature = signature
            self.candidate_index_items = items
            self.candidate_index_matrix = matrix
            return items, matrix

    def identify_and_verify(self, access_photo_data_url, candidates, claimed_student_id):
        """Find the most likely student and independently verify the terminal claim."""
        access_image = self._decode_data_url(access_photo_data_url)
        if access_image is None:
            return {'status': 'unavailable', 'reason': 'Фото прохода отсутствует или повреждено'}

        model = self._load_model()
        if model is None:
            return {'status': 'unavailable', 'reason': 'Модуль проверки лица временно недоступен'}

        indexed_candidates, candidate_matrix = self.prepare_candidate_index(candidates)
        if candidate_matrix is None or not indexed_candidates:
            return {'status': 'unavailable', 'reason': 'В базе нет доступных эталонных фотографий'}

        with self.lock:
            access_faces = model.get(access_image)
            access_face = self._largest_face(access_faces)
            access_embedding = self._embedding(access_face) if access_face is not None else None
            if access_embedding is None:
                return {'status': 'unavailable', 'reason': 'На фото прохода лицо не найдено'}

        # All candidates are compared by optimized NumPy/BLAS code instead of a Python loop.
        similarities = candidate_matrix @ access_embedding
        best_index = int(similarities.argmax())
        best_score = max(-1.0, min(1.0, float(similarities[best_index])))
        best_candidate = indexed_candidates[best_index]
        claimed_index = next(
            (index for index, item in enumerate(indexed_candidates) if item.get('id') == claimed_student_id),
            None,
        )
        claimed_score = (
            max(-1.0, min(1.0, float(similarities[claimed_index])))
            if claimed_index is not None else None
        )

        best_is_claimed = best_candidate.get('id') == claimed_student_id
        alternative_is_clearer = (
            best_score >= self.confirm_threshold
            and not best_is_claimed
            and (claimed_score is None or best_score - claimed_score >= self.identity_margin)
        )

        if alternative_is_clearer:
            status = 'mismatch'
            reason = 'Сервер определил другого ученика'
        elif claimed_score is None:
            status = 'unavailable'
            reason = 'Эталонное фото выбранного терминалом ученика недоступно'
        elif claimed_score >= self.confirm_threshold:
            status = 'confirmed'
            reason = 'Лицо подтверждено'
        elif claimed_score < self.mismatch_threshold:
            status = 'mismatch'
            reason = 'Терминал определил другого ученика'
        else:
            status = 'suspicious'
            reason = 'Требуется ручная проверка'

        result = {'status': status, 'similarity': claimed_score, 'reason': reason}
        # Do not name a student when even the best database match is weak.
        if status == 'confirmed':
            claimed_candidate = indexed_candidates[claimed_index] if claimed_index is not None else None
            result['identified'] = claimed_candidate
            result['identified_similarity'] = claimed_score
        elif best_score >= self.candidate_threshold:
            result['identified'] = best_candidate
            result['identified_similarity'] = best_score
            result['identified_tentative'] = True
        return result

    def identify(self, access_photo_data_url, candidates):
        """Identify one face for the read-only camera kiosk.

        A name is returned only when the best candidate clears both the absolute
        threshold and the margin over the second candidate.
        """
        access_image = self._decode_data_url(access_photo_data_url)
        if access_image is None:
            return {'status': 'unavailable', 'reason': 'Кадр отсутствует или поврежден'}
        model = self._load_model()
        if model is None:
            return {'status': 'unavailable', 'reason': 'Модуль распознавания временно недоступен'}
        indexed_candidates, candidate_matrix = self.prepare_candidate_index(candidates)
        if candidate_matrix is None or not indexed_candidates:
            return {'status': 'unavailable', 'reason': 'В базе нет эталонных фотографий'}

        with self.lock:
            faces = model.get(access_image)
            face = self._largest_face(faces)
            embedding = self._embedding(face) if face is not None else None
        if embedding is None:
            return {'status': 'unavailable', 'reason': 'Лицо на кадре не найдено'}

        similarities = candidate_matrix @ embedding
        order = similarities.argsort()[::-1]
        best_index = int(order[0])
        best_score = max(-1.0, min(1.0, float(similarities[best_index])))
        second_score = (
            max(-1.0, min(1.0, float(similarities[int(order[1])])))
            if len(order) > 1 else -1.0
        )
        margin = best_score - second_score
        if best_score < self.confirm_threshold:
            return {
                'status': 'unknown',
                'reason': 'Нет надежного совпадения',
                'similarity': best_score,
                'margin': margin,
            }
        if margin < self.identity_margin:
            return {
                'status': 'ambiguous',
                'reason': 'Несколько похожих кандидатов',
                'similarity': best_score,
                'margin': margin,
            }
        return {
            'status': 'confirmed',
            'reason': 'Личность подтверждена',
            'identified': indexed_candidates[best_index],
            'similarity': best_score,
            'margin': margin,
        }
