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

            # identity может быть строкой (email) или словарём
            if isinstance(identity, dict):
                user_id = identity.get("user_id") or identity.get("id")
            else:
                user_id = identity

            if user_id is None:
                return jsonify({"success": False, "error": "Unauthorized"}), 401

            has_perm = check_permission(int(user_id), permission_code)
            if not has_perm:
                return jsonify({
                    "success": False,
                    "error": f"Forbidden: missing permission '{permission_code}'",
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
