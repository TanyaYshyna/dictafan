"""
Функции для работы с диктантами в PostgreSQL
"""
import json
from datetime import datetime
from helpers.db import get_db_connection

from helpers.language_data import load_language_data


def create_dictation(title, language_code, level=None, owner_id=None, is_public=True, 
                    speakers=None, audio_user_shared=None, title_translations=None, author_materials_url=None):
    """
    Создаёт новый диктант в БД
    
    Args:
        title: Название диктанта (основное, на языке оригинала)
        language_code: Код языка (en, ru, uk и т.д.)
        level: Уровень сложности (A1, A2 и т.д.)
        owner_id: ID владельца (если None - публичный)
        is_public: Публичный ли диктант
        speakers: Словарь спикеров {"1": "Таня", "2": "Ваня"} или None
        audio_user_shared: URL общего аудио файла (если есть)
        title_translations: Словарь переводов заголовка {"en": "Title", "ru": "Заголовок", "uk": "Заголовок"} или None
        author_materials_url: URL на материалы автора (если есть)
    
    Returns:
        dict: Данные созданного диктанта с полем 'id'
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Проверяем, существует ли колонка author_materials_url
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='dictations' AND column_name='author_materials_url'
            """)
            has_author_materials_url = cur.fetchone() is not None
            
            # Преобразуем speakers и title_translations в JSON строки
            speakers_json = json.dumps(speakers) if speakers else None
            title_translations_json = json.dumps(title_translations) if title_translations else None
            
            if has_author_materials_url:
                cur.execute("""
                    INSERT INTO dictations 
                    (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json, author_materials_url)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, author_materials_url, created_at, updated_at
                """, (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json, author_materials_url))
            else:
                cur.execute("""
                    INSERT INTO dictations 
                    (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, created_at, updated_at
                """, (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json))
            
            row = cur.fetchone()
            conn.commit()
            
            # Преобразуем результат в словарь
            if has_author_materials_url:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'updated_at': row[11].isoformat() if row[11] else None,
                }
            else:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': None,
                    'created_at': row[9].isoformat() if row[9] else None,
                    'updated_at': row[10].isoformat() if row[10] else None,
                }
            
            return dictation
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to create dictation: {e}")
    finally:
        conn.close()


def update_dictation_exercise(dictation_id: int, exercise_id: int, positions: list[int] | None = None, title: str | None = None) -> dict:
    if not dictation_id or not exercise_id:
        raise ValueError("dictation_id and exercise_id are required")

    prepared: list[int] = []
    try:
        for x in list(positions or []):
            if x is None:
                continue
            prepared.append(int(x))
    except Exception:
        prepared = []
    prepared = sorted({int(x) for x in prepared})

    title_norm = None
    try:
        title_norm = str(title).strip() if title is not None else None
    except Exception:
        title_norm = None
    if title_norm == "":
        title_norm = None

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dictation_exercises
                SET positions = %s,
                    title = %s,
                    updated_at = NOW()
                WHERE id = %s AND dictation_id = %s
                RETURNING id, dictation_id, positions, title, created_at, updated_at
                """,
                (prepared, title_norm, int(exercise_id), int(dictation_id)),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Exercise not found")
            conn.commit()
            return {
                "id": int(row[0] or 0),
                "dictation_id": int(row[1] or 0),
                "positions": list(row[2] or []),
                "title": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
                "updated_at": row[5].isoformat() if row[5] else None,
            }
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        if isinstance(e, ValueError):
            raise
        raise Exception(f"Failed to update dictation exercise: {e}")
    finally:
        conn.close()


def reconcile_dictation_exercises(dictation_id: int, exercises_payload: list[dict] | None) -> dict:
    """Apply client's desired exercises set.

    Rules:
    - Full exercise (positions=[]) must exist and must not be deleted.
    - Items with id are updated.
    - Items without id are created.
    - Existing exercises absent from payload are deleted (except Full).
    """
    if not dictation_id:
        raise ValueError("dictation_id is required")

    payload_items = [x for x in list(exercises_payload or []) if isinstance(x, dict)]

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Ensure Full exists
            cur.execute(
                """
                INSERT INTO dictation_exercises (dictation_id, positions)
                VALUES (%s, %s)
                ON CONFLICT (dictation_id, positions) DO NOTHING
                """,
                (int(dictation_id), []),
            )

            cur.execute(
                """
                SELECT id, positions
                FROM dictation_exercises
                WHERE dictation_id = %s
                """,
                (int(dictation_id),),
            )
            existing_rows = cur.fetchall() or []
            existing_by_id: dict[int, list[int]] = {}
            for r in existing_rows:
                try:
                    ex_id = int(r[0])
                    positions = list(r[1] or [])
                    existing_by_id[ex_id] = positions
                except Exception:
                    continue

            keep_ids: set[int] = set()
            created_ids: list[int] = []
            updated_ids: list[int] = []

            for item in payload_items:
                ex_id_raw = item.get('id')
                positions = item.get('positions')
                title = item.get('title')

                prepared: list[int] = []
                try:
                    for x in list(positions or []):
                        if x is None:
                            continue
                        prepared.append(int(x))
                except Exception:
                    prepared = []
                prepared = sorted({int(x) for x in prepared})

                title_norm = None
                try:
                    title_norm = str(title).strip() if title is not None else None
                except Exception:
                    title_norm = None
                if title_norm == "":
                    title_norm = None

                ex_id_int: int | None = None
                try:
                    if ex_id_raw is not None and str(ex_id_raw).strip() != "":
                        ex_id_int = int(ex_id_raw)
                except Exception:
                    ex_id_int = None

                # Negative/zero ids are client-side temporary ids; treat them as new items
                if ex_id_int is not None and ex_id_int > 0:
                    ex_id = int(ex_id_int)
                    keep_ids.add(ex_id)
                    cur.execute(
                        """
                        UPDATE dictation_exercises
                        SET positions = %s,
                            title = %s,
                            updated_at = NOW()
                        WHERE id = %s AND dictation_id = %s
                        """,
                        (prepared, title_norm, int(ex_id), int(dictation_id)),
                    )
                    if cur.rowcount:
                        updated_ids.append(int(ex_id))
                else:
                    # do not create another Full
                    if len(prepared) == 0:
                        continue
                    cur.execute(
                        """
                        INSERT INTO dictation_exercises (dictation_id, positions, title)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (dictation_id, positions) DO NOTHING
                        RETURNING id
                        """,
                        (int(dictation_id), prepared, title_norm),
                    )
                    row = cur.fetchone()
                    created_id: int | None = None
                    if row and row[0]:
                        created_id = int(row[0])
                        created_ids.append(created_id)
                    else:
                        # Conflict: exercise already exists for these positions, fetch its id so we don't delete it.
                        cur.execute(
                            """
                            SELECT id
                            FROM dictation_exercises
                            WHERE dictation_id = %s AND positions = %s
                            LIMIT 1
                            """,
                            (int(dictation_id), prepared),
                        )
                        r2 = cur.fetchone()
                        if r2 and r2[0]:
                            try:
                                created_id = int(r2[0])
                            except Exception:
                                created_id = None
                    if created_id is not None and created_id > 0:
                        keep_ids.add(int(created_id))

            # delete removed (excluding Full)
            keep_ids_list = sorted(list(keep_ids))
            if keep_ids_list:
                cur.execute(
                    """
                    DELETE FROM dictation_exercises
                    WHERE dictation_id = %s
                      AND positions <> %s
                      AND id NOT IN %s
                    """,
                    (int(dictation_id), [], tuple(keep_ids_list)),
                )
            else:
                cur.execute(
                    """
                    DELETE FROM dictation_exercises
                    WHERE dictation_id = %s
                      AND positions <> %s
                    """,
                    (int(dictation_id), []),
                )
            deleted_count = int(cur.rowcount or 0)

        conn.commit()
        return {
            "created_ids": created_ids,
            "updated_ids": updated_ids,
            "deleted_count": deleted_count,
        }
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def list_dictation_exercises(dictation_id: int) -> list[dict]:
    if not dictation_id:
        return []

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, dictation_id, positions, title, created_at, updated_at
                FROM dictation_exercises
                WHERE dictation_id = %s
                ORDER BY id ASC
                """,
                (int(dictation_id),),
            )
            rows = cur.fetchall() or []

            if not rows:
                cur.execute(
                    """
                    INSERT INTO dictation_exercises (dictation_id, positions)
                    VALUES (%s, %s)
                    ON CONFLICT (dictation_id, positions) DO NOTHING
                    RETURNING id, dictation_id, positions, title, created_at, updated_at
                    """,
                    (int(dictation_id), []),
                )
                row = cur.fetchone()
                if row:
                    conn.commit()
                    rows = [row]
                else:
                    conn.commit()
                    cur.execute(
                        """
                        SELECT id, dictation_id, positions, title, created_at, updated_at
                        FROM dictation_exercises
                        WHERE dictation_id = %s
                        ORDER BY id ASC
                        """,
                        (int(dictation_id),),
                    )
                    rows = cur.fetchall() or []

        out: list[dict] = []
        for r in rows:
            if isinstance(r, dict):
                out.append(
                    {
                        "id": int(r.get("id") or 0),
                        "dictation_id": int(r.get("dictation_id") or 0),
                        "positions": list(r.get("positions") or []),
                        "title": r.get("title"),
                        "created_at": r.get("created_at").isoformat() if r.get("created_at") else None,
                        "updated_at": r.get("updated_at").isoformat() if r.get("updated_at") else None,
                    }
                )
            else:
                out.append(
                    {
                        "id": int(r[0] or 0),
                        "dictation_id": int(r[1] or 0),
                        "positions": list(r[2] or []),
                        "title": r[3],
                        "created_at": r[4].isoformat() if r[4] else None,
                        "updated_at": r[5].isoformat() if r[5] else None,
                    }
                )
        return out
    finally:
        conn.close()


def create_dictation_exercise(dictation_id: int, positions: list[int] | None = None, title: str | None = None) -> dict:
    if not dictation_id:
        raise ValueError("dictation_id is required")

    prepared: list[int] = []
    try:
        for x in list(positions or []):
            if x is None:
                continue
            prepared.append(int(x))
    except Exception:
        prepared = []
    prepared = sorted({int(x) for x in prepared})

    title_norm = None
    try:
        title_norm = str(title).strip() if title is not None else None
    except Exception:
        title_norm = None
    if title_norm == "":
        title_norm = None

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM dictation_exercises
                WHERE dictation_id = %s
                  AND positions = %s
                """,
                (int(dictation_id), prepared),
            )
            existing = cur.fetchone()
            if existing:
                raise ValueError("Exercise already exists")

            cur.execute(
                """
                INSERT INTO dictation_exercises (dictation_id, positions, title)
                VALUES (%s, %s, %s)
                RETURNING id, dictation_id, positions, title, created_at, updated_at
                """,
                (int(dictation_id), prepared, title_norm),
            )
            row = cur.fetchone()
            conn.commit()

        return {
            "id": int(row[0] or 0),
            "dictation_id": int(row[1] or 0),
            "positions": list(row[2] or []),
            "title": row[3],
            "created_at": row[4].isoformat() if row[4] else None,
            "updated_at": row[5].isoformat() if row[5] else None,
        }
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        if isinstance(e, ValueError):
            raise
        raise Exception(f"Failed to create dictation exercise: {e}")
    finally:
        conn.close()


def delete_dictation_exercise(dictation_id: int, exercise_id: int) -> bool:
    if not dictation_id or not exercise_id:
        return False

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM dictation_exercises
                WHERE id = %s AND dictation_id = %s
                """,
                (int(exercise_id), int(dictation_id)),
            )
            deleted = cur.rowcount > 0
            conn.commit()
            return bool(deleted)
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def refresh_dictation_translation_flags(dictation_id: int) -> None:
    """Recompute dictations.tr_* flags for a dictation.

    Safe behavior:
    - If tr_* columns are not present (migration not applied) -> no-op.
    - Only updates columns that exist in DB.

    Rules:
    - language_code in dictations is the ORIGINAL language.
    - tr_<lang> flags represent presence of TRANSLATION content (sentences) on that lang.
      Original language is never considered a translation.
    """
    if not dictation_id:
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Read original language.
            cur.execute("SELECT language_code FROM dictations WHERE id = %s", (int(dictation_id),))
            row = cur.fetchone()
            original_lang = (str(row[0]).strip().lower() if row and row[0] else '')

            # Supported languages from languages.json.
            lang_data = load_language_data() or {}
            languages = sorted([str(k).lower() for k in lang_data.keys() if isinstance(k, str)])

            flags = {}
            for lang in languages:
                if not lang:
                    continue
                if original_lang and lang == original_lang:
                    continue

                cur.execute(
                    "SELECT EXISTS (SELECT 1 FROM dictation_sentences s WHERE s.dictation_id = %s AND s.language_code = %s)",
                    (int(dictation_id), lang),
                )
                ex = cur.fetchone()
                flags[lang] = bool(ex and ex[0])

        set_dictation_translation_flags(int(dictation_id), flags)
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return
    finally:
        conn.close()


def get_dictation_translation_flags(dictation_id: int) -> dict:
    """Return existing dictations.tr_* flags as {lang: bool}.

    Safe behavior:
    - If tr_* columns are not present -> returns {}.
    - Only returns columns that exist.
    """
    if not dictation_id:
        return {}

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'dictations'
                  AND column_name LIKE 'tr\\_%'
                """
            )
            cols = [r[0] for r in (cur.fetchall() or []) if r and r[0]]
            if not cols:
                return {}

            cur.execute(f"SELECT {', '.join(cols)} FROM dictations WHERE id = %s", (int(dictation_id),))
            row = cur.fetchone()
            if not row:
                return {}

            out = {}
            for i, col in enumerate(cols):
                try:
                    lang = str(col).replace('tr_', '').strip().lower()
                except Exception:
                    lang = ''
                if not lang:
                    continue
                out[lang] = bool(row[i])
            return out
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return {}
    finally:
        conn.close()


def set_dictation_translation_flags(dictation_id: int, flags: dict) -> None:
    """Update dictations.tr_* flags. Only updates columns that exist in DB."""
    if not dictation_id:
        return

    flags = flags or {}
    if not isinstance(flags, dict):
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'dictations'
                  AND column_name LIKE 'tr\\_%'
                """
            )
            cols = [r[0] for r in (cur.fetchall() or []) if r and r[0]]
            if not cols:
                return

            updates = []
            values = []
            for col in cols:
                try:
                    lang = str(col).replace('tr_', '').strip().lower()
                except Exception:
                    lang = ''
                if not lang:
                    continue
                v = bool(flags.get(lang, False))
                updates.append(f"{col} = %s")
                values.append(v)

            if not updates:
                return

            values.append(int(dictation_id))
            query = f"UPDATE dictations SET {', '.join(updates)} WHERE id = %s"
            cur.execute(query, values)
            conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return
    finally:
        conn.close()


def update_dictation(dictation_id, title=None, language_code=None, level=None, 
                    is_public=None, speakers=None, audio_user_shared=None, title_translations=None, author_materials_url=None, sentences_count=None):
    """
    Обновляет диктант в БД
    
    Args:
        dictation_id: ID диктанта
        title: Новое название (если None - не обновляется)
        language_code: Новый код языка (если None - не обновляется)
        level: Новый уровень (если None - не обновляется)
        is_public: Новый статус публичности (если None - не обновляется)
        speakers: Новый словарь спикеров (если None - не обновляется)
        audio_user_shared: Новый URL общего аудио (если None - не обновляется)
        sentences_count: Денормализованное количество предложений на языке оригинала (если None - не обновляется)
        title_translations: Новый словарь переводов заголовка (если None - не обновляется)
        author_materials_url: URL на материалы автора (если None - не обновляется)
    
    Returns:
        dict: Обновлённые данные диктанта
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Проверяем, существует ли колонка author_materials_url
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='dictations' AND column_name='author_materials_url'
            """)
            has_author_materials_url = cur.fetchone() is not None
            
            # Формируем список обновляемых полей
            updates = []
            values = []
            
            if title is not None:
                updates.append("title = %s")
                values.append(title)
            
            if language_code is not None:
                updates.append("language_code = %s")
                values.append(language_code)
            
            if level is not None:
                updates.append("level = %s")
                values.append(level)
            
            if is_public is not None:
                updates.append("is_public = %s")
                values.append(is_public)

            if sentences_count is not None:
                updates.append("sentences_count = %s")
                values.append(int(sentences_count) if sentences_count is not None else 0)
            
            if speakers is not None:
                updates.append("speakers_json = %s")
                values.append(json.dumps(speakers) if speakers else None)
            
            if audio_user_shared is not None:
                updates.append("audio_user_shared = %s")
                values.append(audio_user_shared)
            
            if title_translations is not None:
                updates.append("title_translations_json = %s")
                values.append(json.dumps(title_translations) if title_translations else None)
            
            # author_materials_url всегда обновляется, если передано (даже None для очистки)
            if has_author_materials_url:
                updates.append("author_materials_url = %s")
                values.append(author_materials_url)
            
            # Всегда обновляем updated_at
            updates.append("updated_at = CURRENT_TIMESTAMP")
            
            if not updates:
                # Ничего не обновляем, просто возвращаем текущие данные
                return get_dictation_by_id(dictation_id)
            
            values.append(dictation_id)
            
            if has_author_materials_url:
                query = f"""
                    UPDATE dictations 
                    SET {', '.join(updates)}
                    WHERE id = %s
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, author_materials_url, created_at, updated_at
                """
            else:
                query = f"""
                    UPDATE dictations 
                    SET {', '.join(updates)}
                    WHERE id = %s
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, created_at, updated_at
                """
            
            cur.execute(query, values)
            row = cur.fetchone()
            conn.commit()
            
            if not row:
                raise Exception(f"Dictation with id {dictation_id} not found")
            
            if has_author_materials_url:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'updated_at': row[11].isoformat() if row[11] else None,
                }
            else:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': None,
                    'created_at': row[9].isoformat() if row[9] else None,
                    'updated_at': row[10].isoformat() if row[10] else None,
                }
            
            return dictation
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to update dictation: {e}")
    finally:
        conn.close()


def get_dictation_by_id(dictation_id):
    """
    Получает диктант по ID
    
    Args:
        dictation_id: ID диктанта
    
    Returns:
        dict: Данные диктанта или None если не найден
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Проверяем, существует ли колонка author_materials_url
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='dictations' AND column_name='author_materials_url'
            """)
            has_author_materials_url = cur.fetchone() is not None
            
            if has_author_materials_url:
                cur.execute("""
                    SELECT id, title, language_code, level, owner_id, is_public, 
                           speakers_json, audio_user_shared, title_translations_json, author_materials_url, created_at, updated_at
                    FROM dictations
                    WHERE id = %s
                """, (dictation_id,))
            else:
                cur.execute("""
                    SELECT id, title, language_code, level, owner_id, is_public, 
                           speakers_json, audio_user_shared, title_translations_json, created_at, updated_at
                    FROM dictations
                    WHERE id = %s
                """, (dictation_id,))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            if has_author_materials_url:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'updated_at': row[11].isoformat() if row[11] else None,
                }
            else:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': None,
                    'created_at': row[9].isoformat() if row[9] else None,
                    'updated_at': row[10].isoformat() if row[10] else None,
                }
            
            return dictation
    except Exception as e:
        raise Exception(f"Failed to get dictation: {e}")
    finally:
        conn.close()


def add_sentence(dictation_id, language_code, sentence_key, text, explanation=None,
                speaker=None, audio=None, audio_avto=None, audio_mic=None, audio_user=None,
                start=None, end=None, chain=False, checked=False, position=None):
    """
    Добавляет предложение к диктанту
    
    Args:
        dictation_id: ID диктанта
        language_code: Код языка предложения
        sentence_key: Ключ предложения (000, 001 и т.д.)
        text: Текст предложения
        explanation: Пояснение/подсказка
        speaker: ID спикера
        audio: Основной аудио файл
        audio_avto: Автоматический аудио файл
        audio_mic: Микрофонный аудио файл
        audio_user: Пользовательский аудио файл
        start: Начало в секундах
        end: Конец в секундах
        chain: Цепочка
        checked: Выбрано по умолчанию
    
    Returns:
        dict: Данные созданного предложения с полем 'id'
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO dictation_sentences 
                (dictation_id, language_code, sentence_key, text, explanation, speaker,
                 audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, dictation_id, language_code, sentence_key, text, explanation,
                          speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position
            """, (dictation_id, language_code, sentence_key, text, explanation, speaker,
                  audio, audio_avto, audio_mic, audio_user, start, end, chain, checked, position))
            
            row = cur.fetchone()
            conn.commit()
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
                'position': row[15],
            }
            
            return sentence
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to add sentence: {e}")
    finally:
        conn.close()


def update_sentence(sentence_id, text=None, explanation=None, speaker=None,
                   audio=None, audio_avto=None, audio_mic=None, audio_user=None,
                   start=None, end=None, chain=None, checked=None, position=None):
    """
    Обновляет предложение
    
    Args:
        sentence_id: ID предложения
        Остальные параметры: новые значения (если None - не обновляется)
    
    Returns:
        dict: Обновлённые данные предложения
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            updates = []
            values = []
            
            if text is not None:
                updates.append("text = %s")
                values.append(text)
            
            if explanation is not None:
                updates.append("explanation = %s")
                values.append(explanation)
            
            if speaker is not None:
                updates.append("speaker = %s")
                values.append(speaker)
            
            if audio is not None:
                updates.append("audio = %s")
                values.append(audio)
            
            if audio_avto is not None:
                updates.append("audio_avto = %s")
                values.append(audio_avto)
            
            if audio_mic is not None:
                updates.append("audio_mic = %s")
                values.append(audio_mic)
            
            if audio_user is not None:
                updates.append("audio_user = %s")
                values.append(audio_user)
            
            if start is not None:
                updates.append("start = %s")
                values.append(start)
            
            if end is not None:
                updates.append('"end" = %s')
                values.append(end)
            
            if chain is not None:
                updates.append("chain = %s")
                values.append(chain)
            
            if checked is not None:
                updates.append("checked = %s")
                values.append(checked)

            if position is not None:
                updates.append("position = %s")
                values.append(position)
            
            if not updates:
                # Ничего не обновляем
                return get_sentence_by_id(sentence_id)
            
            values.append(sentence_id)
            
            query = f"""
                UPDATE dictation_sentences 
                SET {', '.join(updates)}
                WHERE id = %s
                RETURNING id, dictation_id, language_code, sentence_key, text, explanation,
                          speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position
            """
            
            cur.execute(query, values)
            row = cur.fetchone()
            conn.commit()
            
            if not row:
                raise Exception(f"Sentence with id {sentence_id} not found")
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
                'position': row[15],
            }
            
            return sentence
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to update sentence: {e}")
    finally:
        conn.close()


def get_sentence_by_id(sentence_id):
    """
    Получает предложение по ID
    
    Args:
        sentence_id: ID предложения
    
    Returns:
        dict: Данные предложения или None если не найдено
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                       speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position
                FROM dictation_sentences
                WHERE id = %s
            """, (sentence_id,))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
                'position': row[15],
            }
            
            return sentence
    except Exception as e:
        raise Exception(f"Failed to get sentence: {e}")
    finally:
        conn.close()


def get_sentence_by_key(dictation_id, language_code, sentence_key):
    """
    Получает предложение по ключу (dictation_id, language_code, sentence_key)
    
    Args:
        dictation_id: ID диктанта
        language_code: Код языка
        sentence_key: Ключ предложения (000, 001 и т.д.)
    
    Returns:
        dict: Данные предложения или None если не найдено
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                       speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position
                FROM dictation_sentences
                WHERE dictation_id = %s AND language_code = %s AND sentence_key = %s
            """, (dictation_id, language_code, sentence_key))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
                'position': row[15],
            }
            
            return sentence
    except Exception as e:
        raise Exception(f"Failed to get sentence by key: {e}")
    finally:
        conn.close()


def get_dictation_sentences(dictation_id, language_code=None):
    """
    Получает все предложения диктанта
    
    Args:
        dictation_id: ID диктанта
        language_code: Код языка (если указан - только предложения этого языка)
    
    Returns:
        list: Список предложений
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if language_code:
                cur.execute("""
                    SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                           speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position
                    FROM dictation_sentences
                    WHERE dictation_id = %s AND language_code = %s
                    ORDER BY position NULLS LAST, sentence_key
                """, (dictation_id, language_code))
            else:
                cur.execute("""
                    SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                           speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked, position
                    FROM dictation_sentences
                    WHERE dictation_id = %s
                    ORDER BY language_code, position NULLS LAST, sentence_key
                """, (dictation_id,))
            
            rows = cur.fetchall()
            
            sentences = []
            for row in rows:
                sentence = {
                    'id': row[0],
                    'dictation_id': row[1],
                    'language_code': row[2],
                    'sentence_key': row[3],
                    'text': row[4],
                    'explanation': row[5],
                    'speaker': row[6],
                    'audio': row[7],
                    'audio_avto': row[8],
                    'audio_mic': row[9],
                    'audio_user': row[10],
                    'start': float(row[11]) if row[11] is not None else None,
                    'end': float(row[12]) if row[12] is not None else None,
                    'chain': row[13],
                    'checked': row[14],
                    'position': row[15],
                }
                sentences.append(sentence)
            
            return sentences
    except Exception as e:
        raise Exception(f"Failed to get sentences: {e}")
    finally:
        conn.close()


def delete_sentence(sentence_id):
    """
    Удаляет предложение
    
    Args:
        sentence_id: ID предложения
    
    Returns:
        bool: True если удалено успешно
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dictation_sentences WHERE id = %s", (sentence_id,))
            conn.commit()
            return cur.rowcount > 0
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to delete sentence: {e}")
    finally:
        conn.close()


def delete_dictation(dictation_id):
    """
    Удаляет диктант и все его предложения (CASCADE)
    
    Args:
        dictation_id: ID диктанта
    
    Returns:
        bool: True если удалено успешно
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dictations WHERE id = %s", (dictation_id,))
            conn.commit()
            return cur.rowcount > 0
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to delete dictation: {e}")
    finally:
        conn.close()

