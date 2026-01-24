"""
Работа с пользователями в базе данных (таблица users и user_learning_languages)
"""

from typing import Optional, List

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

        # Вставляем пользователя
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

        return {
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
            WHERE table_name='users' AND column_name IN ('settings_json', 'audio_settings_json')
        """)
        # RealDictCursor возвращает словари, поэтому используем 'column_name' как ключ
        rows = cur.fetchall()
        columns = {row['column_name'] if isinstance(row, dict) else row[0] for row in rows}
        has_settings_json = 'settings_json' in columns
        has_audio_settings_json = 'audio_settings_json' in columns
        
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
        
        # Проверяем наличие колонок settings_json и audio_settings_json
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name IN ('settings_json', 'audio_settings_json')
        """)
        # RealDictCursor возвращает словари, поэтому используем 'column_name' как ключ
        rows = cur.fetchall()
        columns = {row['column_name'] if isinstance(row, dict) else row[0] for row in rows}
        has_settings_json = 'settings_json' in columns
        has_audio_settings_json = 'audio_settings_json' in columns
        
        # Обновляем settings_json (приоритет) или audio_settings_json (для обратной совместимости)
        if 'settings_json' in updates:
            if has_settings_json:
                update_fields.append("settings_json = %s")
                update_values.append(updates['settings_json'])
            else:
                print(f"⚠️ Колонка 'settings_json' не найдена в таблице users. Пропускаем обновление.")
        elif 'audio_settings_json' in updates and has_audio_settings_json:
            update_fields.append("audio_settings_json = %s")
            update_values.append(updates['audio_settings_json'])
        
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

