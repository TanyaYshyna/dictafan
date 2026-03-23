from flask import Flask, jsonify, send_from_directory
from dotenv import load_dotenv
import os
import sys
import logging
import hashlib

# Уменьшаем уровень логирования werkzeug (убираем лишние HTTP запросы)
log = logging.getLogger('werkzeug')
log.setLevel(logging.WARNING)

# Загружаем переменные окружения из .env файла (для локальной разработки)
# На Railway переменные устанавливаются через веб-интерфейс
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Важно: НЕ переопределяем весь static_folder, иначе сломаются локальные js/css.
# Для шаринга данных используем отдельную переменную STATIC_DATA_FOLDER.
app = Flask(
    __name__,
    static_folder=None,
)


def get_app_cache_revision() -> str:
    try:
        for k in (
            'APP_CACHE_REVISION',
            'RAILWAY_GIT_COMMIT_SHA',
            'RAILWAY_GIT_COMMIT',
            'GIT_COMMIT',
            'SOURCE_VERSION',
            'RENDER_GIT_COMMIT',
            'VERCEL_GIT_COMMIT_SHA',
        ):
            v = os.getenv(k)
            if v:
                return str(v)
    except Exception:
        pass

    try:
        base_dir = os.path.dirname(__file__)
        candidates = [
            'sw.js',
            os.path.join('static', 'js', 'script_dictation.js'),
            os.path.join('static', 'js', 'script_dictation_editor.js'),
            os.path.join('static', 'js', 'audio_manager.js'),
            os.path.join('static', 'js', 'sw_register.js'),
            os.path.join('static', 'css', 'style_dictation.css'),
        ]
        parts = []
        for rel in candidates:
            try:
                p = os.path.join(base_dir, rel)
                st = os.stat(p)
                parts.append(f"{rel}:{int(st.st_mtime)}:{st.st_size}")
            except Exception:
                continue
        if parts:
            raw = '|'.join(parts).encode('utf-8')
            return hashlib.sha1(raw).hexdigest()[:12]
    except Exception:
        pass

    return '1'


@app.context_processor
def inject_app_cache_revision():
    try:
        return {'app_cache_revision': get_app_cache_revision()}
    except Exception:
        return {'app_cache_revision': '1'}

# Нужен валидный app.static_folder для логики бэкенда, где используются пути
# через current_app.static_folder (поиск обложек, экспорт/импорт и т.д.).
_local_static_dir = os.path.join(os.path.dirname(__file__), 'static')
app.static_folder = _local_static_dir

# Логируем при запуске
print("=" * 50, file=sys.stderr)
print("Flask app starting...", file=sys.stderr)
print(f"PORT: {os.getenv('PORT', 'not set')}", file=sys.stderr)
print(f"STATIC_FOLDER: {os.getenv('STATIC_FOLDER', 'not set')}", file=sys.stderr)
print(f"STATIC_DATA_FOLDER: {os.getenv('STATIC_DATA_FOLDER', 'not set')}", file=sys.stderr)
print(f"app.static_folder: {app.static_folder}", file=sys.stderr)
print("=" * 50, file=sys.stderr)


@app.route('/static/data/<path:filename>')
def serve_static_data(filename):
    """Раздаём /static/data/*.

    По умолчанию это <worktree>/static/data.
    Если задан STATIC_DATA_FOLDER, то используем внешнюю папку (например из dictafan).
    """
    override = os.getenv('STATIC_DATA_FOLDER')
    local_data_dir = os.path.join(_local_static_dir, 'data')

    # 1) prefer shared/static data dir (if configured)
    if override:
        override_path = os.path.join(override, filename)
        if os.path.exists(override_path):
            return send_from_directory(override, filename)

    # 2) fallback to local worktree static/data (for assets that are not shared)
    local_path = os.path.join(local_data_dir, filename)
    if os.path.exists(local_path):
        return send_from_directory(local_data_dir, filename)

    # 3) default behavior (will raise 404)
    base_dir = override if override else local_data_dir
    return send_from_directory(base_dir, filename)


@app.route('/static/<path:filename>', endpoint='static')
def serve_static_assets(filename):
    """Раздаём /static/*.

    - js/css и прочее берём из <worktree>/static
    - /static/data/* отдаём через serve_static_data (с поддержкой STATIC_DATA_FOLDER)

    Нужен endpoint='static', чтобы работало url_for('static', filename=...).
    """
    if filename.startswith('data/'):
        data_filename = filename[len('data/') :]
        return serve_static_data(data_filename)
    return send_from_directory(_local_static_dir, filename)


@app.route('/sw.js')
def serve_service_worker():
    return send_from_directory(os.path.dirname(__file__), 'sw.js', mimetype='application/javascript')

@app.route('/health')
def health_check():
    """Health check endpoint для Railway"""
    port = os.getenv("PORT", "unknown")
    print(f"Health check called, port: {port}", file=sys.stderr)
    return jsonify({
        "status": "ok", 
        "port": port,
        "service": "dictafan"
    }), 200


# ================================
from flask_jwt_extended import JWTManager
import datetime

# Настройки JWT
app.config['JWT_SECRET_KEY'] = os.getenv("JWT_SECRET_KEY", "fallback-secret-key-change-me")
# app.config['JWT_SECRET_KEY'] = "fallback-secret-key-678910-change-me"
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(days=7)  # Токен живет 7 дней
app.config["JWT_TOKEN_LOCATION"] = ["headers", "cookies"]
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
app.config["JWT_ACCESS_COOKIE_NAME"] = "access_token_cookie"
jwt = JWTManager(app)

# Обработчики ошибок JWT для более понятных сообщений
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"success": False, "error": "Token expired", "msg": "Token expired"}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"success": False, "error": f"Invalid token: {str(error)}", "msg": f"Invalid token: {str(error)}"}), 422

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"success": False, "error": "Authorization required", "msg": "Authorization required"}), 401 

app.config['AUDIO_BASE_DIR'] = 'static/data/temp'

# Регистрируем blueprint'ы
from routes.index import index_bp
from routes.dictation_editor import editor_bp
from routes.dictation import dictation_bp
from routes.user_routes import user_bp
from routes.statistics import statistics_bp
from routes.library import library_bp
from routes.desk import desk_bp
from routes.groups import groups_bp

app.register_blueprint(index_bp)
app.register_blueprint(editor_bp)
app.register_blueprint(dictation_bp)
app.register_blueprint(user_bp)
app.register_blueprint(statistics_bp)
app.register_blueprint(library_bp)
app.register_blueprint(desk_bp)
app.register_blueprint(groups_bp)


@app.route('/favicon.ico')
def favicon():
    icons_dir = os.path.join(app.root_path, 'static', 'icons')
    # Отдаём существующий логотип как фавикон, чтобы избежать 404
    return send_from_directory(icons_dir, 'logo.svg', mimetype='image/svg+xml')

@app.route('/data/<path:filename>')
def serve_data(filename):
    return send_from_directory('data', filename)

@app.route('/data/dictations/<path:filename>')
def serve_dictation_audio(filename):
    return send_from_directory('data/dictations', filename)
    

if __name__ == '__main__':    
    # Создаем необходимые директории для локальной разработки
    users_dir = os.path.join('static', 'data', 'users')
    os.makedirs(users_dir, exist_ok=True)
    
    # Создаем другие необходимые директории
    temp_dir = os.path.join('static', 'data', 'temp')
    os.makedirs(temp_dir, exist_ok=True)
    
    dictations_dir = os.path.join('static', 'data', 'dictations')
    os.makedirs(dictations_dir, exist_ok=True)
    
    # Проверяем, запускается ли через Gunicorn (на Railway)
    # Если переменная PORT установлена (Railway) - не запускаем Flask сервер
    if not os.getenv("PORT"):
        # Локальная разработка - запускаем Flask
        port = int(os.getenv("FLASK_PORT", 5000))
        debug = os.getenv("FLASK_ENV") == "development"
        print(f"🚀 Запуск Flask на http://localhost:{port}")
        print(f"📝 Debug mode: {debug}")
        app.run(debug=debug, port=port, host='0.0.0.0')
