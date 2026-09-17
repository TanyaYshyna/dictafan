"""
Работа с таблицами лицензий, ролей и разрешений.

Этап 2 + вспомогательные функции для Этапов 3 и 4.
"""

import os
from typing import Optional, List, Dict
from datetime import date, datetime, timedelta

from .db import get_db_connection, get_db_cursor


# ============================================================
# Сид-данные (Этап 2)
# ============================================================

ROLES_SEED = [
    ("guest",    "Guest"),
    ("student",  "Student"),
    ("teacher",  "Teacher"),
    ("admin",    "Admin"),
]

PERMISSIONS_SEED = [
    ("available_characters_per_day",        "Количество символов в день"),
    ("audio_recordings_available_per_day",  "Количество аудиозаписей в день"),
    ("number_of_new_sentences_per_day",     "Количество новых предложений в день"),
    ("open_admin_report",                   "Открытие админ-отчёта"),
    ("create_exercise",                     "Создание упражнений"),
    ("delete_exercise",                     "Удаление упражнений"),
    ("view_statistics",                     "Просмотр статистики"),
    ("manage_students",                     "Управление студентами"),
    ("create_dictation",                    "Создание диктанта"),
    ("edit_dictation",                      "Редактирование диктанта"),
    ("access_desktop",                      "Доступ к десктопу"),
    ("manage_licenses",                     "Управление лицензиями"),
    ("access_admin_panel",                  "Доступ к админ-панели"),
]

ROLE_PERMISSIONS_SEED = [
    # Guest
    ("guest", "available_characters_per_day",       1000),
    ("guest", "audio_recordings_available_per_day", 20),
    ("guest", "access_desktop",                     None),

    # Student
    ("student", "available_characters_per_day",       -1),
    ("student", "audio_recordings_available_per_day", -1),
    ("student", "access_desktop",                     None),
    ("student", "create_dictation",                   None),
    ("student", "edit_dictation",                     None),

    # Teacher
    ("teacher", "available_characters_per_day",        -1),
    ("teacher", "audio_recordings_available_per_day",  -1),
    ("teacher", "number_of_new_sentences_per_day",     50),
    ("teacher", "access_desktop",                      None),
    ("teacher", "create_exercise",                     None),
    ("teacher", "delete_exercise",                     None),
    ("teacher", "view_statistics",                     None),
    ("teacher", "manage_students",                     None),
    ("teacher", "create_dictation",                    None),
    ("teacher", "edit_dictation",                      None),

    # Admin
    ("admin", "available_characters_per_day",        -1),
    ("admin", "audio_recordings_available_per_day",  -1),
    ("admin", "number_of_new_sentences_per_day",     -1),
    ("admin", "open_admin_report",                   None),
    ("admin", "create_exercise",                     None),
    ("admin", "delete_exercise",                     None),
    ("admin", "view_statistics",                     None),
    ("admin", "manage_students",                     None),
    ("admin", "create_dictation",                    None),
    ("admin", "edit_dictation",                      None),
    ("admin", "access_desktop",                      None),
    ("admin", "manage_licenses",                     None),
    ("admin", "access_admin_panel",                  None),
]


def seed_roles_and_permissions():
    """
    Предзаполняет справочники ролей, разрешений и связей между ними.
    Безопасно для многократного вызова — использует ON CONFLICT DO NOTHING.
    """
    conn, cur = get_db_cursor()
    try:
        # Роли
        for code, name in ROLES_SEED:
            cur.execute(
                """
                INSERT INTO roles (code, name)
                VALUES (%s, %s)
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                """,
                (code, name),
            )

        # Разрешения
        for code, name in PERMISSIONS_SEED:
            cur.execute(
                """
                INSERT INTO permissions (code, name)
                VALUES (%s, %s)
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                """,
                (code, name),
            )

        # Связи роль-разрешение
        for role_code, perm_code, number in ROLE_PERMISSIONS_SEED:
            cur.execute(
                """
                INSERT INTO role_permissions (role_id, permission_id, number)
                VALUES (
                    (SELECT id FROM roles WHERE code = %s),
                    (SELECT id FROM permissions WHERE code = %s),
                    %s
                )
                ON CONFLICT (role_id, permission_id)
                DO UPDATE SET number = EXCLUDED.number
                """,
                (role_code, perm_code, number),
            )

        conn.commit()
        print("[seed_roles_and_permissions] Сид-данные успешно записаны.")
    except Exception as e:
        conn.rollback()
        print(f"[seed_roles_and_permissions] Ошибка: {e}")
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Вспомогательные запросы для проверки прав (Этап 4)
# ============================================================

def get_role_by_code(code: str) -> Optional[dict]:
    """Возвращает роль по коду (guest, student, teacher, admin)."""
    conn, cur = get_db_cursor()
    try:
        cur.execute("SELECT id, code, name FROM roles WHERE code = %s", (code,))
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        cur.close()
        conn.close()


def get_user_role_for_date(user_id: int, target_date: date) -> Optional[dict]:
    """
    Возвращает роль пользователя на указанную дату из user_access_calendar.
    Если записи нет — возвращает None.
    """
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT r.id, r.code, r.name
            FROM user_access_calendar uac
            JOIN roles r ON r.id = uac.role_id
            WHERE uac.user_id = %s AND uac.date = %s
            """,
            (user_id, target_date),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        cur.close()
        conn.close()


def check_permission(user_id: int, permission_code: str) -> bool:
    """
    Проверяет, есть ли у пользователя указанное разрешение на сегодня.
    
    Алгоритм:
    1. user_access_calendar → role_id (на сегодня)
    2. role_permissions → наличие записи для permission_code
    
    Возвращает True/False.
    """
    conn, cur = get_db_cursor()
    try:
        today = date.today()
        cur.execute(
            """
            SELECT 1
            FROM user_access_calendar uac
            JOIN role_permissions rp ON rp.role_id = uac.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE uac.user_id = %s
              AND uac.date = %s
              AND p.code = %s
            LIMIT 1
            """,
            (user_id, today, permission_code),
        )
        return cur.fetchone() is not None
    finally:
        cur.close()
        conn.close()


def get_permission_limit(user_id: int, permission_code: str) -> Optional[int]:
    """
    Возвращает числовой лимит разрешения для пользователя на сегодня.
    
    -1  → безлимитно
    None → не задано (или разрешение — bool-флаг)
    N   → конкретный лимит
    
    Если у пользователя нет такого разрешения — возвращает None.
    """
    conn, cur = get_db_cursor()
    try:
        today = date.today()
        cur.execute(
            """
            SELECT rp.number
            FROM user_access_calendar uac
            JOIN role_permissions rp ON rp.role_id = uac.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE uac.user_id = %s
              AND uac.date = %s
              AND p.code = %s
            LIMIT 1
            """,
            (user_id, today, permission_code),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return row.get("number") if isinstance(row, dict) else row[0]
    finally:
        cur.close()
        conn.close()


def get_user_permissions_for_today(user_id: int) -> List[Dict]:
    """
    Возвращает все разрешения пользователя на сегодня с их лимитами.
    
    Список словарей: [{code, name, number}, ...]
    """
    conn, cur = get_db_cursor()
    try:
        today = date.today()
        cur.execute(
            """
            SELECT p.code, p.name, rp.number
            FROM user_access_calendar uac
            JOIN role_permissions rp ON rp.role_id = uac.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE uac.user_id = %s AND uac.date = %s
            ORDER BY p.code
            """,
            (user_id, today),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows] if rows else []
    finally:
        cur.close()
        conn.close()


def get_user_access_for_range(user_id: int, from_date: date, to_date: date) -> List[Dict]:
    """
    Возвращает записи календаря доступа пользователя за период.
    """
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT uac.date, r.code AS role_code, r.name AS role_name,
                   uac.source_document_type, uac.source_document_id
            FROM user_access_calendar uac
            JOIN roles r ON r.id = uac.role_id
            WHERE uac.user_id = %s AND uac.date >= %s AND uac.date <= %s
            ORDER BY uac.date
            """,
            (user_id, from_date, to_date),
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows] if rows else []
    finally:
        cur.close()
        conn.close()


def get_user_current_role(user_id: int) -> Optional[dict]:
    """
    Возвращает текущую роль пользователя из user_access_calendar на сегодня.
    """
    return get_user_role_for_date(user_id, date.today())


def update_user_role_by_id(user_id: int, role_code: str) -> bool:
    """
    Напрямую устанавливает роль пользователя в users.role_id и синхронизирует
    календарь доступа (user_access_calendar), чтобы проверка прав через
    check_permission() видела новую роль.

    Назначение действует как «ручное» переопределение на 10 лет вперёд —
    аналогично постоянной manual-лицензии. Если позже пользователю выдадут
    лицензию, LicenseManager.rebuild_calendar_for_user перестроит календарь.

    Возвращает True в случае успеха, иначе False.
    """
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            "UPDATE users SET role_id = (SELECT id FROM roles WHERE code = %s) WHERE id = %s",
            (role_code, user_id),
        )

        # Синхронизируем календарь: check_permission смотрит в user_access_calendar,
        # поэтому недостаточно обновить только users.role_id.
        cur.execute(
            """
            INSERT INTO user_access_calendar
                (user_id, date, role_id, source_document_type, source_document_id)
            SELECT
                %s,
                d::date,
                (SELECT id FROM roles WHERE code = %s),
                'manual',
                NULL
            FROM generate_series(
                CURRENT_DATE,
                CURRENT_DATE + INTERVAL '10 years',
                '1 day'::interval
            ) AS d
            ON CONFLICT (user_id, date)
            DO UPDATE SET
                role_id = EXCLUDED.role_id,
                source_document_type = EXCLUDED.source_document_type,
                source_document_id = EXCLUDED.source_document_id
            """,
            (user_id, role_code),
        )

        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        cur.close()
        conn.close()


def bootstrap_admin_from_env():
    """
    Способ «сказать себе, что я администратор» без доступа к админ-панели.

    Если в окружении задан ADMIN_EMAIL, при старте приложения этому
    пользователю выдаётся вечная лицензия StudentTeacher30 (роль admin).
    Достаточно добавить в .env строку:
        ADMIN_EMAIL=your@email.com
    и перезапустить приложение.
    """
    admin_email = (os.getenv('ADMIN_EMAIL') or '').strip().lower()
    if not admin_email:
        return

    conn, cur = get_db_cursor()
    try:
        cur.execute("SELECT id FROM users WHERE email = %s LIMIT 1", (admin_email,))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not row:
        print(f"[bootstrap_admin] Пользователь {admin_email} не найден — пропускаем.")
        return

    user_id = int(row["id"] if isinstance(row, dict) else row[0])

    from .license_manager import license_manager
    license_manager.register_license(
        user_id=user_id,
        license_type="StudentTeacher30",
        days=0,
        document_type="manual",
        document_id=None,
        date_begin=date.today(),
        comment="Bootstrap: ADMIN_EMAIL — права администратора",
    )
    print(f"[bootstrap_admin] Пользователь {admin_email} (id={user_id}) назначен администратором.")
