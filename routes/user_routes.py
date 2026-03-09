# routes/user_routes.py
from PIL import Image
import io
import base64
import os
import json
import shutil
from datetime import datetime
import uuid
from flask import Blueprint, request, jsonify, render_template, send_file, redirect, make_response
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
    set_access_cookies,
)
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from urllib.parse import urlencode
import secrets
import requests
from flask import render_template_string

# Импортируем из helpers
from helpers.language_data import load_language_data
from helpers.user_helpers import get_user_folder, email_to_folder
from helpers.db_users import (
    create_user,
    get_user_by_email,
    verify_user_password,
    update_user,
)
from helpers.b2_storage import b2_storage

user_bp = Blueprint('user', __name__, url_prefix='/user')


def _google_oauth_serializer() -> URLSafeTimedSerializer:
    secret = os.getenv('JWT_SECRET_KEY', 'fallback-secret-key-change-me')
    return URLSafeTimedSerializer(secret_key=secret, salt='google-oauth-state')


def _build_external_url(path: str) -> str:
    base = (request.url_root or '').rstrip('/')
    if not path.startswith('/'):
        path = '/' + path
    return base + path


def _get_google_redirect_uri() -> str:
    explicit = os.getenv('GOOGLE_OAUTH_REDIRECT_URI')
    if explicit:
        return explicit
    return _build_external_url('/user/auth/google/callback')


def _get_google_client() -> tuple[str, str]:
    client_id = os.getenv('GOOGLE_OAUTH_CLIENT_ID', '').strip()
    client_secret = os.getenv('GOOGLE_OAUTH_CLIENT_SECRET', '').strip()
    return client_id, client_secret

# ==================== ФУНКЦИИ ДЛЯ ГЕНЕРАЦИИ ID ====================

def generate_user_id():
    """Генерирует уникальный ID для пользователя"""
    return f"user_{uuid.uuid4().hex}"

def generate_simple_user_id():
    """Альтернативная простая генерация ID на основе времени"""
    return f"user_{datetime.now().strftime('%Y%m%d%H%M%S')}_{os.urandom(4).hex()}"

# ==================== НОВЫЕ API ЭНДПОЙНТЫ (JWT) ====================

@user_bp.route('/api/register', methods=['POST'])
def api_register():
    """Регистрация через API"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    username = data.get('username')
    native_language = (data.get('native_language') or 'ru').lower()
    learning_language = (data.get('learning_language') or 'en').lower()

    if not username or not email or not password:
        return jsonify({'error': 'Email, имя пользователя и пароль обязательны'}), 400

    # Проверяем, существует ли пользователь в БД
    existing_user = get_user_by_email(email)
    if existing_user:
        return jsonify({'error': 'User already exists'}), 400

    language_data = load_language_data()
    available_languages = set(language_data.keys())

    if native_language not in available_languages:
        native_language = 'ru' if 'ru' in available_languages else next(iter(available_languages), 'ru')

    if learning_language not in available_languages:
        learning_language = 'en' if 'en' in available_languages else native_language

    if native_language == learning_language:
        return jsonify({'error': 'Native and learning languages must be different'}), 400

    learning_languages = data.get('learning_languages')
    if not isinstance(learning_languages, list) or not learning_languages:
        learning_languages = [learning_language]

    learning_languages = [lang.lower() for lang in learning_languages if isinstance(lang, str)]

    if learning_language not in learning_languages:
        learning_languages.append(learning_language)

    # Создаем пользователя в БД
    try:
        user_response = create_user(
            email=email,
            username=username,
            password=password,
            native_language=native_language,
            current_learning=learning_language,
            learning_languages=learning_languages,
        )
    except ValueError:
        return jsonify({'error': 'User already exists'}), 400
    except Exception as exc:
        return jsonify({'error': f'Failed to create user: {exc}'}), 500

    # Создаем токен (identity = email, как и раньше)
    access_token = create_access_token(identity=email)
    
    # Формируем ответ и записываем токен и в куки, и в тело ответа
    response = jsonify({
        'message': 'User created successfully',
        'access_token': access_token,
        'user': user_response
    })
    # Куки нужны для работы @jwt_required() на обычных HTML-страницах (напр. /library/private)
    set_access_cookies(response, access_token)
    return response


@user_bp.route('/auth/google/start', methods=['GET'])
def google_oauth_start():
    client_id, client_secret = _get_google_client()
    if not client_id or not client_secret:
        return jsonify({'error': 'Google OAuth is not configured'}), 500

    next_url = (request.args.get('next') or '/').strip() or '/'
    if next_url.startswith('http://') or next_url.startswith('https://') or next_url.startswith('//'):
        next_url = '/'

    state_payload = {
        'next': next_url,
        'nonce': secrets.token_urlsafe(16),
    }
    state = _google_oauth_serializer().dumps(state_payload)

    redirect_uri = _get_google_redirect_uri()
    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'online',
        'prompt': 'select_account',
        'state': state,
    }

    url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params)
    return redirect(url)


@user_bp.route('/auth/google/callback', methods=['GET'])
def google_oauth_callback():
    err = request.args.get('error')
    if err:
        return jsonify({'error': f'Google OAuth error: {err}'}), 400

    code = request.args.get('code')
    state = request.args.get('state')
    if not code or not state:
        return jsonify({'error': 'Missing code/state'}), 400

    try:
        state_payload = _google_oauth_serializer().loads(state, max_age=10 * 60)
    except SignatureExpired:
        return jsonify({'error': 'OAuth state expired'}), 400
    except BadSignature:
        return jsonify({'error': 'Invalid OAuth state'}), 400

    next_url = (state_payload or {}).get('next') or '/'
    if next_url.startswith('http://') or next_url.startswith('https://') or next_url.startswith('//'):
        next_url = '/'

    client_id, client_secret = _get_google_client()
    if not client_id or not client_secret:
        return jsonify({'error': 'Google OAuth is not configured'}), 500

    redirect_uri = _get_google_redirect_uri()

    token_resp = requests.post(
        'https://oauth2.googleapis.com/token',
        data={
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        },
        timeout=20,
    )

    if token_resp.status_code != 200:
        return jsonify({'error': 'Failed to exchange code', 'details': token_resp.text}), 400

    token_data = token_resp.json() or {}
    access_token_google = token_data.get('access_token')
    if not access_token_google:
        return jsonify({'error': 'Google did not return access_token'}), 400

    userinfo_resp = requests.get(
        'https://openidconnect.googleapis.com/v1/userinfo',
        headers={'Authorization': f'Bearer {access_token_google}'},
        timeout=20,
    )
    if userinfo_resp.status_code != 200:
        return jsonify({'error': 'Failed to fetch user info', 'details': userinfo_resp.text}), 400

    userinfo = userinfo_resp.json() or {}
    email = (userinfo.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Google userinfo did not contain email'}), 400

    existing_user = get_user_by_email(email)
    if existing_user:
        user_response = existing_user
    else:
        username = (userinfo.get('name') or userinfo.get('given_name') or '').strip()
        if not username:
            username = email.split('@')[0]

        language_data = load_language_data()
        available_languages = set(language_data.keys())
        native_language = 'ru' if 'ru' in available_languages else next(iter(available_languages), 'ru')
        learning_language = 'en' if 'en' in available_languages else native_language
        if learning_language == native_language:
            learning_language = next((x for x in ('en', 'ru') if x != native_language and x in available_languages), native_language)
        learning_languages = [learning_language]

        random_password = secrets.token_urlsafe(24)
        user_response = create_user(
            email=email,
            username=username,
            password=random_password,
            native_language=native_language,
            current_learning=learning_language,
            learning_languages=learning_languages,
        )

    app_token = create_access_token(identity=email)

    html = render_template_string(
        """
        <!doctype html>
        <html lang=\"ru\">
        <meta charset=\"utf-8\"/>
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>
        <title>Вход...</title>
        <body>
        <script>
        try {
          localStorage.setItem('jwt_token', {{ token|tojson }});
        } catch (e) {}
        window.location.replace({{ next_url|tojson }});
        </script>
        </body>
        </html>
        """,
        token=app_token,
        next_url=next_url,
    )

    response = make_response(html)
    set_access_cookies(response, app_token)
    return response



@user_bp.route('/api/login', methods=['POST'])
def api_login():
    """Логин через API"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        # Проверяем пользователя и пароль в БД
        user_response = verify_user_password(email, password)
        if not user_response:
            return jsonify({'error': 'Invalid credentials'}), 401

        # Создаем токен
        access_token = create_access_token(identity=email)
        
        # Формируем ответ и записываем токен и в куки, и в тело ответа
        response = jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'user': user_response
        })
        # Куки нужны для работы @jwt_required() на обычных HTML-страницах (напр. /library/private)
        set_access_cookies(response, access_token)
        return response
        
    except Exception as e:
        print(f"❌ Ошибка при логине: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@user_bp.route('/api/me', methods=['GET'])
@jwt_required()
def api_get_current_user():
    """Получить текущего пользователя по токену"""
    current_email = get_jwt_identity()
    user_data = get_user_by_email(current_email)
    
    if not user_data:
        return jsonify({'error': 'User not found'}), 404
        
    # В БД мы пароль не возвращаем, password_hash наружу не отдаём
    user_copy = dict(user_data)
    user_copy.pop('password_hash', None)
    
    # audio_settings_json уже включен в user_data из get_user_by_email
    # и будет возвращен автоматически
    
    # Вычисляем URL аватаров по шаблону (ничего не храним в БД)
    # Всегда используем локальные URL (B2 используется только как бэкап, не для фронтенда)
    user_id = user_data['id']
    avatar_large_url = f'/user/api/avatar?user_id={user_id}&size=large'
    avatar_small_url = f'/user/api/avatar?user_id={user_id}&size=small'
    
    user_copy['avatar'] = {
        'large': avatar_large_url,
        'small': avatar_small_url,
    }
    
    return jsonify(user_copy)

@user_bp.route('/api/logout', methods=['POST'])
@jwt_required()
def api_logout():
    """Выход из системы (на клиенте просто удаляем токен)"""
    response = jsonify({'message': 'Logout successful'})
    response.set_cookie('access_token_cookie', '', expires=0)
    return response

# ==================== СТРАНИЦЫ ====================

@user_bp.route('/profile')
def profile_page():
    """Страница профиля пользователя"""
    return render_template('user_profile_jwt.html', language_data=load_language_data())

@user_bp.route('/logout')
def logout():
    """Выход из системы"""
    from flask import redirect
    response = redirect('/')
    response.set_cookie('access_token_cookie', '', expires=0)
    return response

# ==================== СОХРАНЕНИЕ И ЧТЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ (JWT) ====================


@user_bp.route('/api/profile', methods=['PUT'])
@jwt_required()
def api_update_profile():
    """Обновление профиля пользователя"""
    try:
        current_email = get_jwt_identity()
        
        # Получаем пользователя из БД
        user_db = get_user_by_email(current_email)
        if not user_db:
            return jsonify({'error': 'User not found'}), 404
        
        updates = request.get_json()
        
        # Формируем словарь для обновления
        db_updates = {}
        
        # Обновляем основные поля
        if 'username' in updates:
            db_updates['username'] = updates['username']
        
        if 'password' in updates and updates['password']:
            db_updates['password'] = updates['password']
        
        if 'native_language' in updates:
            db_updates['native_language'] = updates['native_language']
        
        if 'learning_languages' in updates:
            db_updates['learning_languages'] = updates['learning_languages']
        
        if 'current_learning' in updates:
            db_updates['current_learning'] = updates['current_learning']
        
        # Обновляем settings_json (новый способ хранения настроек)
        if 'settings_json' in updates:
            db_updates['settings_json'] = updates['settings_json']
        # Для обратной совместимости также поддерживаем audio_settings_json
        elif 'audio_settings_json' in updates:
            db_updates['audio_settings_json'] = updates['audio_settings_json']
        
        # Обновляем данные в БД
        if db_updates:
            updated_user = update_user(current_email, db_updates)
            if not updated_user:
                return jsonify({'error': 'Failed to update user'}), 500
        else:
            updated_user = user_db
        
        # Формируем ответ (без password_hash)
        user_response = {
            'id': updated_user['id'],
            'username': updated_user['username'],
            'email': updated_user['email'],
            'native_language': updated_user['native_language'],
            'current_learning': updated_user['current_learning'],
            'learning_languages': updated_user.get('learning_languages', []),
            'streak_days': updated_user['streak_days'],
            'role': updated_user['role'],
        }
        
        # Добавляем settings_json (приоритет) или audio_settings_json (для обратной совместимости)
        if 'settings_json' in updated_user:
            user_response['settings_json'] = updated_user['settings_json']
        elif 'audio_settings_json' in updated_user:
            user_response['audio_settings_json'] = updated_user['audio_settings_json']
        
        return jsonify({
            'message': 'Profile updated successfully',
            'user': user_response
        })
        
    except Exception as e:
        print(f"Ошибка обновления профиля: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@user_bp.route('/api/avatar', methods=['POST'])
@jwt_required()
def api_upload_avatar():
    """Загрузка аватара пользователя"""
    try:
        current_email = get_jwt_identity()
        # Ищем пользователя в БД (основное хранилище)
        user_db = get_user_by_email(current_email)
        if not user_db:
            return jsonify({'error': 'User not found'}), 404
        
        if 'avatar' not in request.files:
            return jsonify({'error': 'No avatar file provided'}), 400
        
        avatar_file = request.files['avatar']
        
        if avatar_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Проверяем что это изображение
        if not avatar_file.content_type.startswith('image/'):
            return jsonify({'error': 'File must be an image'}), 400
        
        # Получаем папку пользователя (локальный кэш для аватаров)
        user_folder = get_user_folder(current_email)
        os.makedirs(user_folder, exist_ok=True)
        
        # Открываем изображение
        image = Image.open(avatar_file.stream)
        
        # Размеры для аватаров
        LARGE_SIZE = (100, 100)
        SMALL_SIZE = (40, 40)
        
        # Создаем большую версию (100x100)
        avatar_large = image.copy()
        avatar_large.thumbnail(LARGE_SIZE, Image.Resampling.LANCZOS)
        
        # Создаем маленькую версию (40x40)
        avatar_small = image.copy()
        avatar_small.thumbnail(SMALL_SIZE, Image.Resampling.LANCZOS)
        
        # Сохраняем аватары локально в папку, основанную на user_id (через get_user_folder)
        avatar_large_path = os.path.join(user_folder, 'avatar.webp')
        avatar_small_path = os.path.join(user_folder, 'avatar_min.webp')
        avatar_large.save(avatar_large_path, 'WEBP', quality=85)
        avatar_small.save(avatar_small_path, 'WEBP', quality=85)

        user_id = user_db['id']
        
        # Всегда используем локальные URL для аватаров (B2 может вызывать SSL проблемы)
        # Файлы сохраняются локально, а если B2 включён - дополнительно загружаются туда как бэкап
        avatar_large_url = f'/user/api/avatar?user_id={user_id}&size=large'
        avatar_small_url = f'/user/api/avatar?user_id={user_id}&size=small'
        
        # Если включён B2 — загружаем туда как бэкап (но не используем URL для фронтенда)
        if b2_storage.enabled:
            user_id_folder = f"user_{user_id}"

            remote_large = f'avatars/{user_id_folder}/avatar.webp'
            print(f"📤 Загрузка в B2: {remote_large}")
            b2_large_result = b2_storage.upload_file(str(avatar_large_path), remote_large)
            if b2_large_result:
                print(f"✅ Загружено в B2: {remote_large}")
            else:
                print(f"❌ Ошибка загрузки в B2: {remote_large}")

            remote_small = f'avatars/{user_id_folder}/avatar_min.webp'
            print(f"📤 Загрузка в B2: {remote_small}")
            b2_small_result = b2_storage.upload_file(str(avatar_small_path), remote_small)
            if b2_small_result:
                print(f"✅ Загружено в B2: {remote_small}")
            else:
                print(f"❌ Ошибка загрузки в B2: {remote_small}")
        else:
            print("ℹ️  B2 Storage выключен (B2_ENABLED=false или не настроен)")

        # Возвращаем URL для фронтенда (вычислены по шаблону, ничего не храним в БД)
        return jsonify({
            'message': 'Avatar uploaded successfully',
            'avatar_urls': {
                'large': avatar_large_url,
                'small': avatar_small_url
            }
        })
        
    except Exception as e:
        print(f"Error uploading avatar: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/api/avatar')
def api_get_avatar():
    """Получение аватара пользователя"""
    try:
        email = request.args.get('email')
        user_id = request.args.get('user_id')
        size = request.args.get('size', 'large')
        
        # Получаем user_id либо из параметра, либо из email
        if user_id:
            try:
                user_id = int(user_id)
            except ValueError:
                return jsonify({'error': 'Invalid user_id'}), 400
        elif email:
            user_db = get_user_by_email(email)
            if not user_db:
                return jsonify({'error': 'User not found'}), 404
            user_id = user_db['id']
        else:
            return jsonify({'error': 'Email or user_id parameter required'}), 400

        # Вычисляем путь к аватару по шаблону user_<id>
        # В проде и при работе через git worktree данные могут жить вне репозитория,
        # поэтому учитываем STATIC_DATA_FOLDER.
        data_base = os.getenv('STATIC_DATA_FOLDER')
        if not data_base:
            # current_app.root_path тут надёжнее, чем относительный путь
            from flask import current_app
            data_base = os.path.join(current_app.root_path, 'static', 'data')

        user_folder = os.path.join(data_base, 'users', f'user_{user_id}')
        avatar_filename = 'avatar.webp' if size == 'large' else 'avatar_min.webp'
        avatar_path = os.path.join(user_folder, avatar_filename)
        
        # B2 - основное хранилище! Сначала проверяем B2
        from helpers.b2_storage import b2_storage
        if b2_storage.enabled:
            remote_path = f"avatars/user_{user_id}/{avatar_filename}"
            if b2_storage.file_exists(remote_path):
                b2_storage.download_file(remote_path, avatar_path)
        
        # Проверяем локальный кэш или дефолтный аватар
        if not os.path.exists(avatar_path):
            from flask import current_app
            default_path = os.path.join(current_app.root_path, 'static', 'icons', f'default-avatar-{size}.svg')
            
            if not os.path.exists(default_path):
                # Если файлов по умолчанию нет, возвращаем логотип как запасной вариант
                default_path = os.path.join(current_app.root_path, 'static', 'icons', 'logo.svg')
                if not os.path.exists(default_path):
                    return jsonify({'error': 'Avatar not found'}), 404
            
            avatar_path = default_path
        
        # Определяем MIME type в зависимости от расширения файла
        if avatar_path.endswith('.webp'):
            mimetype = 'image/webp'
        elif avatar_path.endswith('.png'):
            mimetype = 'image/png'
        elif avatar_path.endswith('.svg'):
            mimetype = 'image/svg+xml'
        else:
            mimetype = 'image/jpeg'
        
        # Возвращаем файл аватара
        return send_file(avatar_path, mimetype=mimetype)
        
    except Exception as e:
        print(f"Error getting avatar: {e}")
        return jsonify({'error': str(e)}), 500

# ==================== ИСТОРИЯ АКТИВНОСТИ ПОЛЬЗОВАТЕЛЯ ====================

def get_history_folder(email):
    """Получает путь к папке history пользователя"""
    user_folder = get_user_folder(email)
    history_folder = os.path.join(user_folder, 'history')
    os.makedirs(history_folder, exist_ok=True)
    return history_folder

def get_history_filename(month_identifier):
    """Получает имя файла истории для месяца"""
    # month_identifier в формате 202511 (год и месяц в обратном порядке)
    return f'h_{month_identifier}.json'

@user_bp.route('/api/history/<month_identifier>', methods=['GET'])
@jwt_required()
def api_get_history(month_identifier):
    """Получить историю за определенный месяц"""
    try:
        current_email = get_jwt_identity()
        history_folder = get_history_folder(current_email)
        filename = get_history_filename(month_identifier)
        filepath = os.path.join(history_folder, filename)
        
        if not os.path.exists(filepath):
            # Возвращаем пустую структуру
            return jsonify({
                'id_user': current_email,
                'month': int(month_identifier),
                'statistics': [],
                'statistics_sentenses': []
            })
        
        # Читаем файл с обработкой ошибок JSON
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            print(f'❌ [API_GET_HISTORY] Ошибка парсинга JSON в файле {filepath}: {e}')
            # Пытаемся восстановить структуру - читаем файл как текст и пытаемся исправить
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                # Ищем последнюю валидную закрывающую скобку
                last_valid_brace = content.rfind('}')
                if last_valid_brace > 0:
                    # Пытаемся извлечь валидную часть
                    valid_content = content[:last_valid_brace + 1]
                    data = json.loads(valid_content)
                    print(f'⚠️ [API_GET_HISTORY] Восстановлена структура из поврежденного файла')
                else:
                    raise
            except:
                # Если не удалось восстановить, возвращаем пустую структуру
                print(f'❌ [API_GET_HISTORY] Не удалось восстановить файл, возвращаем пустую структуру')
                data = {
                    'id_user': current_email,
                    'month': int(month_identifier),
                    'statistics': [],
                    'statistics_sentenses': []
                }
        
        # Убеждаемся, что все необходимые поля присутствуют
        if 'statistics' not in data:
            data['statistics'] = []
        if 'statistics_sentenses' not in data:
            data['statistics_sentenses'] = []
        
        return jsonify(data)
        
    except Exception as e:
        print(f"Error loading history: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/api/history/<month_identifier>', methods=['POST', 'PUT'])
@jwt_required()
def api_save_history(month_identifier):
    """Сохранить/обновить историю за определенный месяц"""
    try:
        current_email = get_jwt_identity()
        history_folder = get_history_folder(current_email)
        filename = get_history_filename(month_identifier)
        filepath = os.path.join(history_folder, filename)
        
        incoming_data = request.get_json()
        
        print(f'📊 [API_SAVE_HISTORY] Сохранение истории для месяца: {month_identifier}')
        print(f'📊 [API_SAVE_HISTORY] Входящие данные: statistics={len(incoming_data.get("statistics", []))} записей, statistics_sentenses={len(incoming_data.get("statistics_sentenses", []))} записей')
        
        # Убеждаемся, что директория существует
        os.makedirs(history_folder, exist_ok=True)
        
        # ЧИТАЕМ существующий файл (если есть)
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
                print(f'📊 [API_SAVE_HISTORY] Прочитан существующий файл: statistics={len(existing_data.get("statistics", []))} записей, statistics_sentenses={len(existing_data.get("statistics_sentenses", []))} записей')
            except json.JSONDecodeError as e:
                print(f'❌ [API_SAVE_HISTORY] Ошибка парсинга JSON в файле {filepath}: {e}')
                # Пытаемся восстановить структуру - читаем файл как текст
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    # Ищем последнюю валидную закрывающую скобку
                    last_valid_brace = content.rfind('}')
                    if last_valid_brace > 0:
                        # Пытаемся извлечь валидную часть
                        valid_content = content[:last_valid_brace + 1]
                        existing_data = json.loads(valid_content)
                        print(f'⚠️ [API_SAVE_HISTORY] Восстановлена структура из поврежденного файла')
                    else:
                        raise
                except:
                    # Если не удалось восстановить, создаем новую структуру
                    print(f'❌ [API_SAVE_HISTORY] Не удалось восстановить файл, создаем новую структуру')
                    existing_data = {
                        'id_user': current_email,
                        'month': int(month_identifier),
                        'statistics': [],
                        'statistics_sentenses': []
                    }
            except Exception as e:
                print(f'❌ [API_SAVE_HISTORY] Ошибка чтения файла: {e}')
                existing_data = {
                    'id_user': current_email,
                    'month': int(month_identifier),
                    'statistics': [],
                    'statistics_sentenses': []
                }
        else:
            # Файл не существует, создаем новую структуру
            existing_data = {
                'id_user': current_email,
                'month': int(month_identifier),
                'statistics': [],
                'statistics_sentenses': []
            }
            print(f'📊 [API_SAVE_HISTORY] Файл не существует, создаем новую структуру')
        
        # Убеждаемся, что все необходимые поля присутствуют в существующих данных
        if 'id_user' not in existing_data:
            existing_data['id_user'] = current_email
        if 'month' not in existing_data:
            existing_data['month'] = int(month_identifier)
        if 'statistics' not in existing_data or not isinstance(existing_data['statistics'], list):
            existing_data['statistics'] = []
        if 'statistics_sentenses' not in existing_data or not isinstance(existing_data['statistics_sentenses'], list):
            existing_data['statistics_sentenses'] = []
        
        # ОБЪЕДИНЯЕМ данные: берем существующие данные и добавляем/обновляем из входящих
        # Для statistics_sentenses: добавляем новые записи из входящих данных
        if 'statistics_sentenses' in incoming_data and isinstance(incoming_data['statistics_sentenses'], list):
            # Добавляем новые записи из входящих данных в существующий массив
            for new_entry in incoming_data['statistics_sentenses']:
                # Проверяем, нет ли уже такой записи (по dictation_id и date)
                dictation_id = new_entry.get('dictation_id')
                date = new_entry.get('date')
                if dictation_id and date:
                    # Ищем существующую запись с таким же dictation_id и date
                    found = False
                    for i, existing_entry in enumerate(existing_data['statistics_sentenses']):
                        if existing_entry.get('dictation_id') == dictation_id and existing_entry.get('date') == date:
                            # Обновляем существующую запись
                            existing_data['statistics_sentenses'][i] = new_entry
                            found = True
                            print(f'📊 [API_SAVE_HISTORY] Обновлена существующая запись: dictation_id={dictation_id}, date={date}')
                            break
                    if not found:
                        # Добавляем новую запись
                        existing_data['statistics_sentenses'].append(new_entry)
                        print(f'📊 [API_SAVE_HISTORY] Добавлена новая запись: dictation_id={dictation_id}, date={date}')
                else:
                    # Если нет dictation_id или date, просто добавляем
                    existing_data['statistics_sentenses'].append(new_entry)
        
        # Для statistics: обновляем из входящих данных
        if 'statistics' in incoming_data and isinstance(incoming_data['statistics'], list):
            # Обновляем statistics из входящих данных
            existing_data['statistics'] = incoming_data['statistics']
        
        # ЗАПИСЫВАЕМ обновленные данные обратно в файл
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        
        print(f'✅ [API_SAVE_HISTORY] Файл успешно сохранен: {filepath}')
        print(f'✅ [API_SAVE_HISTORY] Финальная структура: statistics={len(existing_data.get("statistics", []))} записей, statistics_sentenses={len(existing_data.get("statistics_sentenses", []))} записей')
        
        return jsonify({'message': 'History saved successfully', 'data': existing_data})
        
    except Exception as e:
        import traceback
        print(f"❌ [API_SAVE_HISTORY] Error saving history: {e}")
        print(f"❌ [API_SAVE_HISTORY] Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/api/history/all', methods=['GET'])
@jwt_required()
def api_get_all_history():
    """Получить всю историю пользователя"""
    try:
        current_email = get_jwt_identity()
        history_folder = get_history_folder(current_email)
        
        all_history = {}
        
        # Читаем все файлы истории
        if os.path.exists(history_folder):
            for filename in os.listdir(history_folder):
                if filename.startswith('h_') and filename.endswith('.json'):
                    month_identifier = filename.replace('h_', '').replace('.json', '')
                    filepath = os.path.join(history_folder, filename)
                    
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            all_history[month_identifier] = data
                    except Exception as e:
                        print(f"Error reading {filename}: {e}")
        
        return jsonify(all_history)
        
    except Exception as e:
        print(f"Error loading all history: {e}")
        return jsonify({'error': str(e)}), 500