# 1. Используем официальный, стабильный образ Python 3.11
FROM python:3.11

# 2. Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# 3. Устанавливаем системные зависимости для librosa, numpy, Pillow
# (Исправленный список пакетов!)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    libblas-dev \       
    liblapack-dev \      
    libjpeg-dev \
    zlib1g-dev \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 4. Копируем файл зависимостей
COPY requirements.txt .

# 5. Устанавливаем Python-зависимости
RUN pip install --no-cache-dir -r requirements.txt

# 6. Копируем остальной код (включая app.py)
COPY . .

# 7. Указываем команду запуска для контейнера (самая стабильная из последних версий)
# CMD python -m gunicorn --workers 2 --bind 0.0.0.0:8000 app:app
# CMD gunicorn --workers 2 --bind 0.0.0.0:${PORT:-8000} app:app
# CMD python -m gunicorn --workers 2 --threads 2 --bind 0.0.0.0:${PORT:-8000} app:app
# CMD python -m gunicorn --workers 2 --threads 2 --bind 0.0.0.0:${PORT:-8080} --log-level debug app:app
# CMD gunicorn --workers 2 --threads 2 --worker-class gthread --bind 0.0.0.0:${PORT:-8080} app:app
# CMD gunicorn --workers 4 --bind 0.0.0.0:${PORT:-8000} app:app

# 7. Указываем команду запуска для контейнера, используя Waitress
# CMD waitress-serve --host=0.0.0.0 --port=${PORT:-8000} app:app

# CMD ["gunicorn", "--workers", "2", "--threads", "2", "--bind", "0.0.0.0:${PORT:-8000}", "app:app"]
# CMD python -m gunicorn --workers 2 --threads 2 --bind 0.0.0.0:${PORT:-8000} app:app

# 7. Указываем команду запуска для контейнера
# Railway автоматически устанавливает переменную PORT
# Используем простую команду для максимальной стабильности
# Добавляем --preload для более быстрого старта и --keep-alive для стабильности
CMD gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --timeout 120 --keep-alive 5 --access-logfile - --error-logfile - --log-level info --preload app:app