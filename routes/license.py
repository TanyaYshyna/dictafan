"""
Роуты для работы с лицензиями.

/api/license/purchase  — заглушка покупки (Этап 6)
/api/license/status    — статус и права пользователя
/api/admin/license/*   — админ-панель (Этап 7)
"""

from datetime import date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from helpers.db_license import (
    get_user_permissions_for_today,
    get_user_role_for_date,
    get_user_access_for_range,
)
from helpers.license_manager import license_manager
from helpers.db import get_db_connection, get_db_cursor

license_bp = Blueprint('license', __name__, url_prefix='')


# ============================================================
# Пользовательские роуты
# ============================================================

@license_bp.route('/api/license/purchase', methods=['POST'])
@jwt_required()
def purchase_license():
    """
    Заглушка покупки лицензии.

    Принимает:
        license_type: Free | Teacher30 | Student30 | StudentTeacher30

    Без реальной оплаты — сразу создаёт лицензию.
    """
    identity = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    license_type = (data.get('license_type') or '').strip()
    valid_types = ['Free', 'Teacher30', 'Student30', 'StudentTeacher30']

    if license_type not in valid_types:
        return jsonify({
            "success": False,
            "error": f"Недопустимый тип лицензии: {license_type}. "
                     f"Допустимые: {', '.join(valid_types)}"
        }), 400

    # Получаем user_id
    conn, cur = get_db_cursor()
    try:
        cur.execute("SELECT id FROM users WHERE email = %s", (identity,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Пользователь не найден"}), 404
        user_id = int(row["id"])
    finally:
        cur.close()
        conn.close()

    # Определяем количество дней
    days_map = {
        "Free": 0,               # навсегда
        "Teacher30": 30,
        "Student30": 30,
        "StudentTeacher30": 30,
    }
    days = days_map.get(license_type, 30)

    try:
        license_manager.register_license(
            user_id=user_id,
            license_type=license_type,
            days=days,
            document_type="purchase",
            document_id=None,
            date_begin=date.today(),
            comment=f"Покупка лицензии {license_type} (заглушка)",
        )

        # Получаем обновлённый статус
        today = date.today()
        role = get_user_role_for_date(user_id, today)
        permissions = get_user_permissions_for_today(user_id)

        return jsonify({
            "success": True,
            "message": f"Лицензия {license_type} успешно активирована",
            "role": role,
            "permissions": permissions,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@license_bp.route('/api/license/status', methods=['GET'])
@jwt_required()
def license_status():
    """
    Возвращает текущий статус пользователя: роль, разрешения, лимиты.
    """
    identity = get_jwt_identity()

    conn, cur = get_db_cursor()
    try:
        cur.execute("SELECT id FROM users WHERE email = %s", (identity,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Пользователь не найден"}), 404
        user_id = int(row["id"])
    finally:
        cur.close()
        conn.close()

    today = date.today()
    role = get_user_role_for_date(user_id, today)
    permissions = get_user_permissions_for_today(user_id)
    calendar = get_user_access_for_range(user_id, today, date(2099, 12, 31))

    return jsonify({
        "success": True,
        "role": role,
        "permissions": permissions,
        "upcoming_access": calendar[:90],  # следующие 90 дней
    })


# ============================================================
# Админские роуты
# ============================================================

@license_bp.route('/api/admin/license/grant', methods=['POST'])
@jwt_required()
def admin_grant_license():
    """
    Ручная выдача лицензии администратором.
    """
    data = request.get_json(silent=True) or {}

    email = (data.get('email') or '').strip().lower()
    license_type = (data.get('license_type') or '').strip()
    days_str = data.get('days', '30')
    comment = (data.get('comment') or '').strip()

    try:
        days = int(days_str)
    except (ValueError, TypeError):
        days = 30

    valid_types = ['Free', 'Teacher30', 'Student30', 'StudentTeacher30']
    if license_type not in valid_types:
        return jsonify({
            "success": False,
            "error": f"Недопустимый тип лицензии: {license_type}"
        }), 400

    conn, cur = get_db_cursor()
    try:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Пользователь не найден"}), 404
        user_id = int(row["id"])
    finally:
        cur.close()
        conn.close()

    try:
        license_manager.register_license(
            user_id=user_id,
            license_type=license_type,
            days=days,
            document_type="manual",
            document_id=None,
            date_begin=date.today(),
            comment=comment or f"Ручная выдача администратором: {license_type}",
        )

        return jsonify({
            "success": True,
            "message": f"Лицензия {license_type} выдана пользователю {email}",
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@license_bp.route('/api/admin/license/history/<int:user_id>', methods=['GET'])
@jwt_required()
def admin_license_history(user_id: int):
    """
    Возвращает историю операций с лицензиями для пользователя.
    """
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT id, document_type, document_id, license_type,
                   date_begin, days, priority, comment, created_at
            FROM license_operations
            WHERE user_id = %s
            ORDER BY created_at DESC
            """,
            (user_id,),
        )
        rows = cur.fetchall()
        history = []
        for r in rows:
            history.append({
                "id": r["id"],
                "document_type": r["document_type"],
                "document_id": r["document_id"],
                "license_type": r["license_type"],
                "date_begin": r["date_begin"].isoformat() if hasattr(r["date_begin"], 'isoformat') else str(r["date_begin"]),
                "days": r["days"],
                "priority": r["priority"],
                "comment": r["comment"],
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], 'isoformat') else str(r["created_at"]),
            })
        return jsonify({"success": True, "history": history})
    finally:
        cur.close()
        conn.close()


@license_bp.route('/api/admin/license/calendar/<int:user_id>', methods=['GET'])
@jwt_required()
def admin_license_calendar(user_id: int):
    """
    Возвращает календарь доступа пользователя.
    """
    today = date.today()
    to_date = date(2099, 12, 31)

    calendar = get_user_access_for_range(user_id, today, to_date)

    return jsonify({
        "success": True,
        "calendar": calendar[:365],  # максимум год вперёд
    })


@license_bp.route('/api/admin/license/find_user', methods=['GET'])
@jwt_required()
def admin_find_user():
    """
    Поиск пользователя по email для админ-панели.
    """
    email = (request.args.get('email') or '').strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email обязателен"}), 400

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            "SELECT id, email, username FROM users WHERE email ILIKE %s LIMIT 10",
            (f"%{email}%",),
        )
        rows = cur.fetchall()
        users = [dict(r) for r in rows]
        return jsonify({"success": True, "users": users})
    finally:
        cur.close()
        conn.close()
