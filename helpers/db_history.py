"""
Функции для работы с историей активности пользователей в PostgreSQL
"""
import json
from datetime import datetime
from psycopg2 import sql
from helpers.db import get_db_connection


def add_activity(user_id, dictation_id, type_activity, number=1, date_override=None, dictation_language_code=None):
    """
    Добавляет или обновляет запись активности в history_activity (агрегация по дням)
    
    Args:
        user_id: ID пользователя (integer)
        dictation_id: ID диктанта (integer или строка dict_<id>)
        type_activity: Тип активности - 'perfect', 'corrected' или 'audio'
        number: Количество (опционально, по умолчанию 1)
    
    Returns:
        dict: Данные созданной/обновленной записи с полем 'id'
    
    Note:
        Если запись за сегодняшний день уже существует - обновляет счетчик.
        Если нет - создает новую запись.
        Поле created_at заполняется автоматически при создании.
        Поле updated_at обновляется автоматически при изменении.
    """
    if type_activity not in ['perfect', 'corrected', 'audio']:
        raise ValueError(f"Неверный тип активности: {type_activity}. Допустимые: perfect, corrected, audio")
    
    # dictation_id должен быть integer (колонка в БД int). Разрешаем:
    # - int
    # - строку вида 'dict_<id>'
    # - строку с числом
    if isinstance(dictation_id, str):
        if dictation_id.startswith('dict_'):
            try:
                dictation_id = int(dictation_id.replace('dict_', ''))
            except ValueError:
                raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
        else:
            try:
                dictation_id = int(dictation_id)
            except ValueError:
                raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    # Получаем дату (по умолчанию текущая)
    if date_override is None:
        target_date = datetime.now().date()
    else:
        if isinstance(date_override, str):
            raw = date_override.strip()
            # ожидаем YYYY-MM-DD, но иногда клиент присылает YYYYMMDD
            if raw.isdigit() and len(raw) == 8:
                year = int(raw[:4])
                month = int(raw[4:6])
                day = int(raw[6:8])
                target_date = datetime(year, month, day).date()
            else:
                target_date = datetime.fromisoformat(raw).date()
        elif isinstance(date_override, int):
            raw = str(date_override)
            if raw.isdigit() and len(raw) == 8:
                year = int(raw[:4])
                month = int(raw[4:6])
                day = int(raw[6:8])
                target_date = datetime(year, month, day).date()
            else:
                target_date = datetime.now().date()
        else:
            target_date = date_override
    
    # Временные логи для отладки
    print(f'📊 [HISTORY_ACTIVITY] Сохранение активности:')
    print(f'   user_id: {user_id}')
    print(f'   dictation_id: {dictation_id}')
    print(f'   type_activity: {type_activity}')
    print(f'   number: {number}')
    print(f'   date: {target_date}')
    print(f'   dictation_language_code: {dictation_language_code}')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Определяем, какое поле обновлять (безопасно, так как значение контролируется)
            if type_activity == 'perfect':
                update_field = 'perfect_count'
            elif type_activity == 'corrected':
                update_field = 'corrected_count'
            else:  # audio
                update_field = 'audio_count'

            query = sql.SQL("""
                INSERT INTO history_activity 
                (user_id, dictation_id, date, dictation_language_code, {field}, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, dictation_id, date) 
                DO UPDATE SET 
                    {field} = history_activity.{field} + %s,
                    dictation_language_code = COALESCE(history_activity.dictation_language_code, EXCLUDED.dictation_language_code),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id, user_id, dictation_id, date, dictation_language_code, perfect_count, corrected_count, audio_count, created_at, updated_at
            """).format(field=sql.Identifier(update_field))

            cur.execute(query, (user_id, dictation_id, target_date, dictation_language_code, number, number))

            row = cur.fetchone()
            conn.commit()

            activity = {
                'id': row[0],
                'user_id': row[1],
                'dictation_id': row[2],
                'date': row[3].isoformat() if row[3] else None,
                'dictation_language_code': row[4],
                'perfect_count': row[5],
                'corrected_count': row[6],
                'audio_count': row[7],
                'created_at': row[8].isoformat() if row[8] else None,
                'updated_at': row[9].isoformat() if row[9] else None,
            }

            print(f'✅ [HISTORY_ACTIVITY] Активность сохранена: id={activity["id"]}, date={activity["date"]}, {update_field}={activity[update_field]}')
            return activity
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to add activity: {e}")
    finally:
        conn.close()


def get_activity_totals_by_period(user_id, start_date, end_date, language_code=None):
    """Вернуть агрегированную активность пользователя по дням за период.

    Args:
        user_id: int
        start_date: datetime.date или str YYYY-MM-DD
        end_date: datetime.date или str YYYY-MM-DD

    Returns:
        list[dict]: [{date: 'YYYY-MM-DD', perfect: int, corrected: int, audio: int}, ...]
    """
    conn = get_db_connection()
    try:
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date).date()
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date).date()

        with conn.cursor() as cur:
            if language_code and str(language_code).strip().lower() not in ('all', '*'):
                cur.execute(
                    """
                    SELECT
                        date,
                        COALESCE(SUM(perfect_count), 0) AS perfect,
                        COALESCE(SUM(corrected_count), 0) AS corrected,
                        COALESCE(SUM(audio_count), 0) AS audio
                    FROM history_activity
                    WHERE user_id = %s
                      AND date >= %s
                      AND date <= %s
                      AND dictation_language_code = %s
                    GROUP BY date
                    ORDER BY date ASC
                    """,
                    (int(user_id), start_date, end_date, str(language_code).strip().lower()),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        date,
                        COALESCE(SUM(perfect_count), 0) AS perfect,
                        COALESCE(SUM(corrected_count), 0) AS corrected,
                        COALESCE(SUM(audio_count), 0) AS audio
                    FROM history_activity
                    WHERE user_id = %s
                      AND date >= %s
                      AND date <= %s
                    GROUP BY date
                    ORDER BY date ASC
                    """,
                    (int(user_id), start_date, end_date),
                )
            rows = cur.fetchall() or []

        out = []
        for r in rows:
            # psycopg2 может вернуть tuple или dict (RealDictCursor). Поддержим оба.
            if isinstance(r, dict):
                d = r.get("date")
                date_iso = d.isoformat() if hasattr(d, "isoformat") else str(d)
                out.append(
                    {
                        "date": date_iso,
                        "perfect": int(r.get("perfect") or 0),
                        "corrected": int(r.get("corrected") or 0),
                        "audio": int(r.get("audio") or 0),
                    }
                )
            else:
                d = r[0]
                date_iso = d.isoformat() if hasattr(d, "isoformat") else str(d)
                out.append(
                    {
                        "date": date_iso,
                        "perfect": int(r[1] or 0),
                        "corrected": int(r[2] or 0),
                        "audio": int(r[3] or 0),
                    }
                )
        return out
    except Exception as e:
        raise Exception(f"Failed to get activity totals by period: {e}")
    finally:
        conn.close()


def add_success(user_id, dictation_id, perfect_count, corrected_count, audio_count, time_ms, attempts_total=0, error_count=0, source_group_id=None, selected_sentence_positions=None, dictation_language_code=None):
    """
    Добавляет запись успешного завершения диктанта в history_successes
    
    Args:
        user_id: ID пользователя (integer)
        dictation_id: ID диктанта (integer или строка dict_<id>)
        perfect_count: Количество perfect активностей
        corrected_count: Количество corrected активностей
        audio_count: Количество audio активностей
        time_ms: Время выполнения в миллисекундах
    
    Returns:
        dict: Данные созданной записи с полем 'id'
    
    Note:
        Каждое завершение диктанта создает отдельную запись (не обновляет существующую).
        Поле created_at заполняется автоматически PostgreSQL (DEFAULT CURRENT_TIMESTAMP).
    """
    # Если dictation_id в формате dict_<id>, извлекаем числовой ID
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    # Временные логи для отладки
    print(f'📊 [HISTORY_SUCCESSES] Сохранение успеха:')
    print(f'   user_id: {user_id}')
    print(f'   dictation_id: {dictation_id}')
    print(f'   perfect_count: {perfect_count}')
    print(f'   corrected_count: {corrected_count}')
    print(f'   audio_count: {audio_count}')
    print(f'   attempts_total: {attempts_total}')
    print(f'   error_count: {error_count}')
    print(f'   time_ms: {time_ms}')
    print(f'   source_group_id: {source_group_id}')
    print(f'   selected_sentence_positions: {selected_sentence_positions}')
    print(f'   dictation_language_code: {dictation_language_code}')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO history_successes 
                (user_id, dictation_id, dictation_language_code, perfect_count, corrected_count, audio_count, attempts_total, error_count, time_ms, source_group_id, selected_sentence_positions, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id, user_id, dictation_id, dictation_language_code, perfect_count, corrected_count, audio_count, attempts_total, error_count, time_ms, source_group_id, selected_sentence_positions, created_at, updated_at
            """, (user_id, dictation_id, dictation_language_code, perfect_count, corrected_count, audio_count, attempts_total, error_count, time_ms, source_group_id, selected_sentence_positions))

            row = cur.fetchone()
            conn.commit()

            success = {
                'id': row[0],
                'user_id': row[1],
                'dictation_id': row[2],
                'dictation_language_code': row[3],
                'perfect_count': row[4],
                'corrected_count': row[5],
                'audio_count': row[6],
                'attempts_total': row[7],
                'error_count': row[8],
                'time_ms': row[9],
                'source_group_id': row[10],
                'selected_sentence_positions': list(row[11] or []) if row[11] is not None else None,
                'created_at': row[12].isoformat() if row[12] else None,
                'updated_at': row[13].isoformat() if row[13] else None,
            }
            
            print(f'✅ [HISTORY_SUCCESSES] Успех сохранен: id={success["id"]}, created_at={success["created_at"]}')
            
            return success
    except Exception as e:
        conn.rollback()
        import traceback
        print(f'❌ [HISTORY_SUCCESSES] Детали ошибки:')
        traceback.print_exc()
        raise Exception(f"Failed to add success: {e}")
    finally:
        conn.close()


def get_activities_by_date(user_id, dictation_id, date):
    """
    Получает агрегированную активность пользователя по диктанту за указанную дату
    
    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта
        date: Дата в формате YYYYMMDD (integer) или datetime.date
    
    Returns:
        dict или None: Агрегированная активность за день (одна запись) или None если нет данных
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if isinstance(date, int):
                # Преобразуем YYYYMMDD в дату
                date_str = str(date)
                year = int(date_str[:4])
                month = int(date_str[4:6])
                day = int(date_str[6:8])
                target_date = datetime(year, month, day).date()
            else:
                target_date = date
            
            cur.execute("""
                SELECT id, user_id, dictation_id, date, perfect_count, corrected_count, audio_count, created_at, updated_at
                FROM history_activity
                WHERE user_id = %s 
                  AND dictation_id = %s
                  AND date = %s
            """, (user_id, dictation_id, target_date))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            activity = {
                'id': row[0],
                'user_id': row[1],
                'dictation_id': row[2],
                'date': row[3].isoformat() if row[3] else None,
                'perfect_count': row[4],
                'corrected_count': row[5],
                'audio_count': row[6],
                'created_at': row[7].isoformat() if row[7] else None,
                'updated_at': row[8].isoformat() if row[8] else None,
            }
            
            return activity
    except Exception as e:
        raise Exception(f"Failed to get activities: {e}")
    finally:
        conn.close()


def get_success_count(user_id, dictation_id):
    """
    Получает количество успешных завершений диктанта для пользователя
    
    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта (integer или строка dict_<id>)
    
    Returns:
        int: Количество завершений диктанта
    """
    # Если dictation_id в формате dict_<id>, извлекаем числовой ID
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) 
                FROM history_successes
                WHERE user_id = %s AND dictation_id = %s
            """, (user_id, dictation_id))
            
            row = cur.fetchone()
            return row[0] if row else 0
    except Exception as e:
        raise Exception(f"Failed to get success count: {e}")
    finally:
        conn.close()


def get_success_counts_for_dictations(user_id, dictation_ids):
    """
    Получает количество успешных завершений для нескольких диктантов
    
    Args:
        user_id: ID пользователя
        dictation_ids: Список ID диктантов (могут быть строки dict_<id> или integers)
    
    Returns:
        dict: Словарь {dictation_id: count, ...}
    """
    if not dictation_ids:
        return {}
    
    # Преобразуем все ID в числовые
    numeric_ids = []
    id_mapping = {}  # Маппинг числового ID -> оригинальный ID
    
    for dictation_id in dictation_ids:
        original_id = dictation_id
        if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
            try:
                numeric_id = int(dictation_id.replace('dict_', ''))
                numeric_ids.append(numeric_id)
                id_mapping[numeric_id] = original_id
            except ValueError:
                continue
        else:
            numeric_id = int(dictation_id) if dictation_id else None
            if numeric_id:
                numeric_ids.append(numeric_id)
                id_mapping[numeric_id] = original_id
    
    if not numeric_ids:
        return {}
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Используем ANY для поиска по списку ID
            cur.execute("""
                SELECT dictation_id, COUNT(*) as count
                FROM history_successes
                WHERE user_id = %s AND dictation_id = ANY(%s)
                GROUP BY dictation_id
            """, (user_id, numeric_ids))
            
            rows = cur.fetchall()
            
            # Создаем словарь с оригинальными ID
            result = {}
            for row in rows:
                numeric_id = row[0]
                count = row[1]
                original_id = id_mapping.get(numeric_id, str(numeric_id))
                result[original_id] = count
            
            # Добавляем 0 для диктантов, которых нет в результатах
            for original_id in dictation_ids:
                if original_id not in result:
                    result[original_id] = 0
            
            return result
    except Exception as e:
        raise Exception(f"Failed to get success counts: {e}")
    finally:
        conn.close()


def save_unclosed_dictation(user_id, dictation_id, time_ms, settings_json, sentences_data):
    """
    Сохраняет или обновляет данные незавершенного диктанта
    
    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта (integer или строка dict_<id>)
        time_ms: Время потраченное на выполнение в миллисекундах
        settings_json: JSON строка с настройками диктанта
        sentences_data: Список словарей с данными по предложениям:
            [{'sentence_key': '000', 'perfect_count': 1, 'corrected_count': 0, 'audio_count': 0, 'checked': True}, ...]
    
    Returns:
        dict: Данные сохраненной записи
    """
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # UPSERT для основной записи
            try:
                cur.execute("""
                    INSERT INTO history_unclosed_dictations 
                    (user_id, dictation_id, time_ms, settings_json, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, dictation_id) 
                    DO UPDATE SET 
                        time_ms = %s,
                        settings_json = %s,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id, user_id, dictation_id, time_ms, settings_json, created_at, updated_at
                """, (user_id, dictation_id, time_ms, settings_json, time_ms, settings_json))
            except Exception:
                cur.execute("""
                    INSERT INTO history_unclosed_dictations 
                    (user_id, dictation_id, time_ms, audio_settings_json, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, dictation_id) 
                    DO UPDATE SET 
                        time_ms = %s,
                        audio_settings_json = %s,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id, user_id, dictation_id, time_ms, audio_settings_json, created_at, updated_at
                """, (user_id, dictation_id, time_ms, settings_json, time_ms, settings_json))
            
            row = cur.fetchone()
            unclosed_id = row[0]
            
            # Удаляем старые записи предложений для этого диктанта
            cur.execute("""
                DELETE FROM history_unclosed_dictations_sentences
                WHERE user_id = %s AND dictation_id = %s
            """, (user_id, dictation_id))
            
            # Вставляем новые записи предложений
            if sentences_data:
                for sentence in sentences_data:
                    # Получаем selection_state
                    selection_state = sentence.get('selection_state', 'unchecked')
                    
                    # Валидация значения
                    if selection_state not in ('unchecked', 'checked', 'completed'):
                        selection_state = 'unchecked'
                    
                    cur.execute("""
                        INSERT INTO history_unclosed_dictations_sentences
                        (user_id, dictation_id, sentence_key, perfect_count, corrected_count, audio_count, attempts_total, error_count, selection_state, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """, (
                        user_id, dictation_id, 
                        sentence.get('sentence_key'),
                        sentence.get('perfect_count', 0),
                        sentence.get('corrected_count', 0),
                        sentence.get('audio_count', 0),
                        sentence.get('attempts_total', 0),
                        sentence.get('error_count', 0),
                        selection_state
                    ))
            
            conn.commit()
            
            return {
                'id': row[0],
                'user_id': row[1],
                'dictation_id': row[2],
                'time_ms': row[3],
                'settings_json': row[4],
                'created_at': row[5].isoformat() if row[5] else None,
                'updated_at': row[6].isoformat() if row[6] else None,
            }
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to save unclosed dictation: {e}")
    finally:
        conn.close()


def get_unclosed_dictation(user_id, dictation_id):
    """
    Получает данные незавершенного диктанта
    
    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта (integer или строка dict_<id>)
    
    Returns:
        dict или None: Данные незавершенного диктанта с полем 'sentences' или None
    """
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Получаем основную запись
            try:
                cur.execute("""
                    SELECT id, user_id, dictation_id, time_ms, settings_json, created_at, updated_at
                    FROM history_unclosed_dictations
                    WHERE user_id = %s AND dictation_id = %s
                """, (user_id, dictation_id))
            except Exception:
                cur.execute("""
                    SELECT id, user_id, dictation_id, time_ms, audio_settings_json, created_at, updated_at
                    FROM history_unclosed_dictations
                    WHERE user_id = %s AND dictation_id = %s
                """, (user_id, dictation_id))
            
            row = cur.fetchone()
            if not row:
                return None
            
            # Получаем данные по предложениям
            cur.execute("""
                SELECT sentence_key, perfect_count, corrected_count, audio_count, attempts_total, error_count, selection_state
                FROM history_unclosed_dictations_sentences
                WHERE user_id = %s AND dictation_id = %s
                ORDER BY sentence_key
            """, (user_id, dictation_id))
            
            sentences_rows = cur.fetchall()
            sentences = []
            for s_row in sentences_rows:
                sentences.append({
                    'sentence_key': s_row[0],
                    'perfect_count': s_row[1],
                    'corrected_count': s_row[2],
                    'audio_count': s_row[3],
                    'attempts_total': s_row[4],
                    'error_count': s_row[5],
                    'selection_state': s_row[6] or 'unchecked'
                })
            
            return {
                'id': row[0],
                'user_id': row[1],
                'dictation_id': row[2],
                'time_ms': row[3],
                'settings_json': row[4],
                'created_at': row[5].isoformat() if row[5] else None,
                'updated_at': row[6].isoformat() if row[6] else None,
                'sentences': sentences
            }
    except Exception as e:
        raise Exception(f"Failed to get unclosed dictation: {e}")
    finally:
        conn.close()


def delete_unclosed_dictation(user_id, dictation_id):
    """
    Удаляет данные незавершенного диктанта (при успешном завершении)
    
    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта (integer или строка dict_<id>)
    
    Returns:
        bool: True если удалено, False если не было записи
    """
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Удаляем предложения (CASCADE должен удалить автоматически, но удаляем явно)
            cur.execute("""
                DELETE FROM history_unclosed_dictations_sentences
                WHERE user_id = %s AND dictation_id = %s
            """, (user_id, dictation_id))
            
            # Удаляем основную запись
            cur.execute("""
                DELETE FROM history_unclosed_dictations
                WHERE user_id = %s AND dictation_id = %s
            """, (user_id, dictation_id))
            
            deleted = cur.rowcount > 0
            conn.commit()
            return deleted
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to delete unclosed dictation: {e}")
    finally:
        conn.close()


def get_unclosed_dictation_stats(user_id, dictation_id):
    """
    Получает агрегированную статистику незавершенного диктанта (для отображения на карточке)
    
    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта (integer или строка dict_<id>)
    
    Returns:
        dict: {'perfect': int, 'corrected': int, 'audio': int} или None если нет незавершенного диктанта
    """
    unclosed = get_unclosed_dictation(user_id, dictation_id)
    if not unclosed:
        return None
    
    perfect = 0
    corrected = 0
    audio = 0
    
    for sentence in unclosed.get('sentences', []):
        perfect += sentence.get('perfect_count', 0)
        corrected += sentence.get('corrected_count', 0)
        audio += sentence.get('audio_count', 0)
    
    return {
        'perfect': perfect,
        'corrected': corrected,
        'audio': audio
    }

