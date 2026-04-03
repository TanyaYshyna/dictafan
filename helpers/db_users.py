"""
Работа с пользователями в базе данных (таблица users и user_learning_languages)
"""

from typing import Optional, List
import json
import secrets
from datetime import datetime, timedelta, timezone

from werkzeug.security import generate_password_hash, check_password_hash

from .db import get_db_connection, get_db_cursor


def create_user(
    email: str,
    username: str,
    password: str,
    native_language: str,
    current_learning: str,
    learning_languages: List[str],
    role: str = "user",
):
    """
    Создаёт пользователя и связанные языки обучения.

    Возвращает словарь с данными пользователя (без пароля).
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, что пользователя с таким email ещё нет
        cur.execute(
            "SELECT id FROM users WHERE email = %s",
            (email,),
        )
        if cur.fetchone():
            raise ValueError("User with this email already exists")

        password_hash = generate_password_hash(password)

        # Проверяем наличие колонки settings_json (новый формат настроек)
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='users' AND column_name='settings_json'
            """
        )
        has_settings_json = cur.fetchone() is not None

        default_settings_json = json.dumps(
            {
                "audio": {
                    "start": "oto",
                    "typo": "o",
                    "success": "ot",
                    "repeats": 3,
                    "required_passed_star_half": 3,
                    "without_entering_text": False,
                    "show_text": False,
                    "speech_recognition_mode": "route",
                },
            },
            ensure_ascii=False,
        )

        # Вставляем пользователя
        if has_settings_json:
            cur.execute(
                """
                INSERT INTO users (
                    username, email, password_hash,
                    native_language, current_learning,
                    streak_days, role,
                    settings_json
                )
                VALUES (%s, %s, %s, %s, %s, 0, %s, %s)
                RETURNING id, username, email, native_language, current_learning, streak_days, role,
                          created_at, updated_at, settings_json
                """,
                (
                    username,
                    email,
                    password_hash,
                    native_language,
                    current_learning,
                    role,
                    default_settings_json,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO users (
                    username, email, password_hash,
                    native_language, current_learning,
                    streak_days, role
                )
                VALUES (%s, %s, %s, %s, %s, 0, %s)
                RETURNING id, username, email, native_language, current_learning, streak_days, role,
                          created_at, updated_at
                """,
                (
                    username,
                    email,
                    password_hash,
                    native_language,
                    current_learning,
                    role,
                ),
            )
        user_row = cur.fetchone()

        # Очищаем и заполняем user_learning_languages
        cur.execute(
            "DELETE FROM user_learning_languages WHERE user_id = %s",
            (user_row["id"],),
        )
        for lang_code in learning_languages:
            cur.execute(
                """
                INSERT INTO user_learning_languages (user_id, language_code)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
                """,
                (user_row["id"], lang_code.lower()),
            )

        conn.commit()

        result = {
            "id": user_row["id"],
            "username": user_row["username"],
            "email": user_row["email"],
            "native_language": user_row["native_language"],
            "current_learning": user_row["current_learning"],
            "streak_days": user_row["streak_days"],
            "role": user_row["role"],
            "created_at": user_row["created_at"].isoformat() if user_row["created_at"] else None,
            "updated_at": user_row["updated_at"].isoformat() if user_row["updated_at"] else None,
        }
        if has_settings_json and "settings_json" in user_row:
            result["settings_json"] = user_row.get("settings_json")
        return result
    finally:
        cur.close()
        conn.close()


def _ensure_users_password_reset_columns(cur) -> None:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='users'
          AND column_name IN ('password_reset_token', 'password_reset_expires_at', 'password_reset_last_request_at')
        """
    )
    rows = cur.fetchall() or []
    cols = {r.get('column_name') if isinstance(r, dict) else r[0] for r in rows}
    if 'password_reset_token' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN password_reset_token TEXT")
    if 'password_reset_expires_at' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN password_reset_expires_at TIMESTAMP")
    if 'password_reset_last_request_at' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN password_reset_last_request_at TIMESTAMP")


def create_password_reset_token(email: str, ttl_minutes: int = 30, cooldown_seconds: int = 120) -> Optional[str]:
    email_norm = (email or '').strip().lower()
    if not email_norm:
        return None

    conn, cur = get_db_cursor()
    try:
        _ensure_users_password_reset_columns(cur)
        cur.execute(
            """
            SELECT id,
                   password_reset_last_request_at
            FROM users
            WHERE email = %s
            """,
            (email_norm,),
        )
        row = cur.fetchone() or None
        if not row:
            conn.commit()
            return None

        last_req = row.get('password_reset_last_request_at')
        if last_req is not None:
            cur.execute("SELECT EXTRACT(EPOCH FROM (NOW() - %s)) AS diff", (last_req,))
            diff = (cur.fetchone() or {}).get('diff')
            try:
                diff_f = float(diff) if diff is not None else None
            except Exception:
                diff_f = None
            if diff_f is not None and diff_f < float(cooldown_seconds):
                conn.commit()
                return None

        token = secrets.token_urlsafe(24)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=int(ttl_minutes))

        cur.execute(
            """
            UPDATE users
            SET password_reset_token = %s,
                password_reset_expires_at = %s,
                password_reset_last_request_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
            WHERE email = %s
            """,
            (token, expires_at, email_norm),
        )
        conn.commit()
        return token
    finally:
        cur.close()
        conn.close()


def reset_password_by_token(token: str, new_password: str) -> bool:
    t = (token or '').strip()
    if not t:
        return False
    if not new_password or len(str(new_password)) < 6:
        return False

    conn, cur = get_db_cursor()
    try:
        _ensure_users_password_reset_columns(cur)
        cur.execute(
            """
            SELECT id, password_reset_expires_at
            FROM users
            WHERE password_reset_token = %s
            LIMIT 1
            """,
            (t,),
        )
        row = cur.fetchone() or None
        if not row:
            conn.commit()
            return False

        expires_at = row.get('password_reset_expires_at')
        if expires_at is None:
            conn.commit()
            return False

        cur.execute("SELECT NOW() > %s AS expired", (expires_at,))
        expired = (cur.fetchone() or {}).get('expired')
        if expired:
            conn.commit()
            return False

        password_hash = generate_password_hash(str(new_password))
        cur.execute(
            """
            UPDATE users
            SET password_hash = %s,
                password_reset_token = NULL,
                password_reset_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (password_hash, int(row.get('id'))),
        )
        conn.commit()
        return True
    finally:
        cur.close()
        conn.close()


def get_user_by_email(email: str) -> Optional[dict]:
    """
    Возвращает пользователя по email или None.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем наличие колонок settings_json и audio_settings_json (для обратной совместимости)
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name IN (
                'settings_json',
                'audio_settings_json',
                'assignment_history_retention_days',
                'telegram_chat_id',
                'telegram_enabled',
                'telegram_link_code',
                'telegram_self_reports_enabled'
            )
        """)
        # RealDictCursor возвращает словари, поэтому используем 'column_name' как ключ
        rows = cur.fetchall()
        columns = {row['column_name'] if isinstance(row, dict) else row[0] for row in rows}
        has_settings_json = 'settings_json' in columns
        has_audio_settings_json = 'audio_settings_json' in columns
        has_assignment_history_retention_days = 'assignment_history_retention_days' in columns
        has_telegram_chat_id = 'telegram_chat_id' in columns
        has_telegram_enabled = 'telegram_enabled' in columns
        has_telegram_link_code = 'telegram_link_code' in columns
        has_telegram_self_reports_enabled = 'telegram_self_reports_enabled' in columns
        
        # Формируем список полей для SELECT
        select_fields = [
            "u.id", "u.username", "u.email", "u.password_hash",
            "u.native_language", "u.current_learning", "u.streak_days",
            "u.role", "u.created_at", "u.updated_at"
        ]
        if has_settings_json:
            select_fields.append("u.settings_json")
        if has_audio_settings_json:
            select_fields.append("u.audio_settings_json")
        if has_assignment_history_retention_days:
            select_fields.append("u.assignment_history_retention_days")
        if has_telegram_chat_id:
            select_fields.append("u.telegram_chat_id")
        if has_telegram_enabled:
            select_fields.append("u.telegram_enabled")
        if has_telegram_link_code:
            select_fields.append("u.telegram_link_code")
        if has_telegram_self_reports_enabled:
            select_fields.append("u.telegram_self_reports_enabled")
        
        cur.execute(
            f"""
            SELECT {', '.join(select_fields)}
            FROM users u
            WHERE u.email = %s
            """,
            (email,),
        )
        row = cur.fetchone()
        if not row:
            return None

        # Загружаем языки обучения
        cur.execute(
            """
            SELECT language_code
            FROM user_learning_languages
            WHERE user_id = %s
            ORDER BY language_code
            """,
            (row["id"],),
        )
        learning_languages = [r["language_code"] for r in cur.fetchall()]

        result = {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "password_hash": row["password_hash"],
            "native_language": row["native_language"],
            "current_learning": row["current_learning"],
            "learning_languages": learning_languages,
            "streak_days": row["streak_days"],
            "role": row["role"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        
        # Добавляем settings_json (приоритет) или audio_settings_json (для обратной совместимости)
        if has_settings_json and "settings_json" in row:
            result["settings_json"] = row.get("settings_json")
        elif has_audio_settings_json and "audio_settings_json" in row:
            result["audio_settings_json"] = row.get("audio_settings_json")

        if has_assignment_history_retention_days and "assignment_history_retention_days" in row:
            result["assignment_history_retention_days"] = row.get("assignment_history_retention_days")

        if has_telegram_chat_id and "telegram_chat_id" in row:
            result["telegram_chat_id"] = row.get("telegram_chat_id")
        if has_telegram_enabled and "telegram_enabled" in row:
            result["telegram_enabled"] = bool(row.get("telegram_enabled"))
        if has_telegram_link_code and "telegram_link_code" in row:
            result["telegram_link_code"] = row.get("telegram_link_code")
        if has_telegram_self_reports_enabled and "telegram_self_reports_enabled" in row:
            result["telegram_self_reports_enabled"] = bool(row.get("telegram_self_reports_enabled"))
        
        return result
    finally:
        cur.close()
        conn.close()


def verify_user_password(email: str, password: str) -> Optional[dict]:
    """
    Проверяет пароль пользователя.

    Возвращает dict с данными пользователя (без password_hash), если пароль верный,
    иначе None.
    """
    user = get_user_by_email(email)
    if not user or not user.get("password_hash"):
        return None

    if not check_user_password_hash(password, user["password_hash"]):
        return None

    # Не возвращаем hash наружу
    user_copy = dict(user)
    user_copy.pop("password_hash", None)
    return user_copy


def check_user_password_hash(plain_password: str, password_hash: str) -> bool:
    """Обёртка над check_password_hash (удобно вызывать из разных мест)."""
    return check_password_hash(password_hash, plain_password)


def update_user(email: str, updates: dict) -> Optional[dict]:
    """
    Обновляет данные пользователя в БД.
    
    Args:
        email: Email пользователя
        updates: Словарь с полями для обновления:
            - username
            - password (будет захеширован)
            - native_language
            - current_learning
            - learning_languages (список языков)
            - settings_json (приоритет) или audio_settings_json (для обратной совместимости)
    
    Returns:
        Обновленный словарь с данными пользователя или None, если пользователь не найден
    """
    from werkzeug.security import generate_password_hash
    
    conn, cur = get_db_cursor()
    try:
        # Проверяем существование пользователя
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        user_row = cur.fetchone()
        if not user_row:
            return None
        
        user_id = user_row["id"]
        
        # Формируем список полей для обновления
        update_fields = []
        update_values = []
        
        if 'username' in updates:
            update_fields.append("username = %s")
            update_values.append(updates['username'])
        
        if 'password' in updates and updates['password']:
            password_hash = generate_password_hash(updates['password'])
            update_fields.append("password_hash = %s")
            update_values.append(password_hash)
        
        if 'native_language' in updates:
            update_fields.append("native_language = %s")
            update_values.append(updates['native_language'])
        
        if 'current_learning' in updates:
            update_fields.append("current_learning = %s")
            update_values.append(updates['current_learning'])
        
        if 'streak_days' in updates:
            update_fields.append("streak_days = %s")
            update_values.append(updates['streak_days'])
        
        # Проверяем наличие колонок settings_json, audio_settings_json, assignment_history_retention_days и telegram_self_reports_enabled
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name IN (
                'settings_json',
                'audio_settings_json',
                'assignment_history_retention_days',
                'telegram_self_reports_enabled'
            )
        """)
        # RealDictCursor возвращает словари, поэтому используем 'column_name' как ключ
        rows = cur.fetchall()
        columns = {row['column_name'] if isinstance(row, dict) else row[0] for row in rows}
        has_settings_json = 'settings_json' in columns
        has_audio_settings_json = 'audio_settings_json' in columns
        has_assignment_history_retention_days = 'assignment_history_retention_days' in columns
        has_telegram_self_reports_enabled = 'telegram_self_reports_enabled' in columns

        if 'assignment_history_retention_days' in updates:
            if has_assignment_history_retention_days:
                v = updates.get('assignment_history_retention_days')
                try:
                    v_int = int(v)
                except Exception:
                    v_int = 7
                if v_int not in (0, 7, 30):
                    v_int = 7
                update_fields.append("assignment_history_retention_days = %s")
                update_values.append(v_int)
            else:
                raise RuntimeError(
                    "DB schema mismatch: column users.assignment_history_retention_days is missing. "
                    "Apply migrations/add_assignment_history_retention_days_to_users.sql"
                )
        
        # Обновляем settings_json (приоритет) или audio_settings_json (для обратной совместимости)
        if 'settings_json' in updates:
            if has_settings_json:
                update_fields.append("settings_json = %s")
                update_values.append(updates['settings_json'])
            else:
                raise RuntimeError(
                    "DB schema mismatch: column users.settings_json is missing. "
                    "Apply migrations/add_settings_json_to_users.sql (or add the column) to persist profile settings."
                )
        elif 'audio_settings_json' in updates and has_audio_settings_json:
            update_fields.append("audio_settings_json = %s")
            update_values.append(updates['audio_settings_json'])
        elif 'audio_settings_json' in updates and not has_audio_settings_json:
            raise RuntimeError(
                "DB schema mismatch: column users.audio_settings_json is missing. "
                "Apply migrations/add_audio_settings_json_to_users.sql (or add the column) to persist profile settings."
            )

        if 'telegram_self_reports_enabled' in updates:
            if has_telegram_self_reports_enabled:
                update_fields.append("telegram_self_reports_enabled = %s")
                update_values.append(bool(updates['telegram_self_reports_enabled']))
            else:
                raise RuntimeError(
                    "DB schema mismatch: column users.telegram_self_reports_enabled is missing. "
                    "Apply migrations/add_personal_groups_and_self_telegram_reports.sql"
                )
        
        # Обновляем updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        # Выполняем UPDATE если есть что обновлять
        if update_fields:
            update_values.append(email)  # для WHERE условия
            update_query = f"UPDATE users SET {', '.join(update_fields)} WHERE email = %s"
            cur.execute(update_query, update_values)
        
        # Обновляем языки обучения если указаны
        if 'learning_languages' in updates:
            # Удаляем старые языки
            cur.execute("DELETE FROM user_learning_languages WHERE user_id = %s", (user_id,))
            # Добавляем новые
            for lang_code in updates['learning_languages']:
                cur.execute(
                    """
                    INSERT INTO user_learning_languages (user_id, language_code)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (user_id, lang_code.lower()),
                )
        
        conn.commit()
        
        # Возвращаем обновленные данные пользователя
        return get_user_by_email(email)
        
    finally:
        cur.close()
        conn.close()

