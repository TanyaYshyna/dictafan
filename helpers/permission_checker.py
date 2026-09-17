"""
Сервис проверки прав и Flask-декоратор @require_permission.

Использование:
    from helpers.permission_checker import require_permission

    @editor_bp.route('/api/dictation/create', methods=['POST'])
    @require_permission('create_dictation')
    def create_dictation():
        ...
"""

from functools import wraps
from datetime import date
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from .db_license import check_permission
from .db import get_db_cursor


def _resolve_user_id(identity) -> int:
    """
    Превращает identity из JWT в числовой user_id.

    identity может быть:
      - числом/числовой строкой — это уже user_id;
      - словарём — берём user_id / id;
      - строкой (email) — ищем пользователя в users по email.
    """
    if isinstance(identity, dict):
        value = identity.get("user_id") or identity.get("id")
        if value is not None:
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

    if isinstance(identity, (int, float)):
        return int(identity)

    if isinstance(identity, str):
        text = identity.strip()
        # Если это чисто числовая строка — это уже user_id.
        if text.isdigit():
            return int(text)

        # Иначе считаем, что это email — ищем пользователя в БД.
        conn, cur = get_db_cursor()
        try:
            cur.execute(
                "SELECT id FROM users WHERE email = %s LIMIT 1",
                (text,),
            )
            row = cur.fetchone()
            if row:
                return int(row["id"] if isinstance(row, dict) else row[0])
        finally:
            cur.close()
            conn.close()

    return None


def require_permission(permission_code: str):
    """
    Flask-декоратор для проверки прав доступа.

    Должен использоваться ПОСЛЕ @jwt_required().

    Пример:
        @editor_bp.route('/api/dictation/create', methods=['POST'])
        @jwt_required()
        @require_permission('create_dictation')
        def create_dictation():
            ...

    При отсутствии прав возвращает 403.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            identity = get_jwt_identity()
            if not identity:
                return jsonify({"success": False, "error": "Unauthorized"}), 401

            user_id = _resolve_user_id(identity)
            if user_id is None:
                return jsonify({"success": False, "error": "Unauthorized"}), 401

            has_perm = check_permission(user_id, permission_code)
            if not has_perm:
                return jsonify({
                    "success": False,
                    "error": f"Forbidden: missing permission '{permission_code}'",
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
