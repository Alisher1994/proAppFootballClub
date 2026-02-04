FROM python:3.11-slim

# Минимальные зависимости (без dlib/OpenCV сборки) для Railway CPU
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Явное копирование ассетов в defaults (пробивает кеш Docker)
COPY frontend/static/uploads/ /app/defaults/

RUN mkdir -p database frontend/static/uploads

ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py

EXPOSE 5000

# Делаем скрипт запуска исполняемым
RUN chmod +x start.sh

CMD ["./start.sh"]
# Force rebuild trigger 2
