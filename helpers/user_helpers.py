# helpers/user_helpers.py
import jwt 
import json
import os
from flask import request, current_app
from functools import wraps
from datetime import datetime

from helpers.db_users import get_user_by_email


# Пути к данным пользователей
USERS_BASE_DIR = os.path.join('static', 'data', 'users')

def email_to_folder(email):
    """Конвертирует email в имя папки"""
    return email.replace('@', '_at_').replace('.', '_dot_')

def get_user_folder(email: str) -> str:
    """
    Получает путь к папке пользователя в новом мире БД.

    Логика:
      - находим пользователя по email в БД;
      - если не найден — считаем, что пользователя нет (JSON-хвосты не поддерживаем);
      - имя папки: `user_<id>`.
    """
    user = get_user_by_email(email)
    if not user or "id" not in user:
        raise ValueError(f"User with email {email} not found when resolving folder")

    folder_name = f"user_{user['id']}"
    user_path = os.path.join(USERS_BASE_DIR, folder_name)
    return user_path

def get_safe_email_from_token():
    """Получает safe_email через API endpoint"""
    try:
        user_data = get_current_user()
        if user_data and user_data.get('email'):
            return user_data['email'].replace('@', '_at_').replace('.', '_dot_')
        return 'anonymous'
    except Exception as e:
        print(f'❌ Ошибка при получении safe_email: {e}')
        return 'anonymous'


def load_user_info(email):
    """
    ⚠️ УСТАРЕВШАЯ ФУНКЦИЯ - НЕ ИСПОЛЬЗУЕТСЯ!
    Все данные пользователя теперь хранятся только в БД.
    Используйте get_user_by_email из helpers.db_users.
    """
    print(f"⚠️ Предупреждение: load_user_info({email}) устарела - используйте get_user_by_email")
    return None


def save_user_info(email, user_data):
    """
    ⚠️ УСТАРЕВШАЯ ФУНКЦИЯ - НЕ ИСПОЛЬЗУЕТСЯ!
    Все данные пользователя теперь сохраняются только в БД.
    Используйте update_user из helpers.db_users.
    """
    print(f"⚠️ Предупреждение: save_user_info({email}) устарела - используйте update_user")
    return False
    


def get_current_user():
    """Получает текущего пользователя через API endpoint"""
    try:
        token = request.headers.get('Authorization')
        if token and token.startswith('Bearer '):
            token = token[7:]
        else:
            return None

        # Делаем запрос к API
        with current_app.test_client() as client:
            response = client.get('/user/api/me', 
                                headers={'Authorization': f'Bearer {token}'})
            
            if response.status_code == 200:
                return response.get_json()
            else:
                print(f'❌ API вернул ошибку: {response.status_code}')
                return None
                
    except Exception as e:
        print(f'❌ Ошибка при получении пользователя через API: {e}')
        return None
    

def login_required(f):
    """
    Декоратор для проверки аутентификации
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return {'error': 'Требуется аутентификация'}, 401
        return f(*args, **kwargs)
    return decorated_function

def get_safe_email():
    """
    Получение безопасного email для создания папок
    """
    user = get_current_user()
    if user and user.get('safe_email'):
        return user['safe_email']
    return 'anonymous'    