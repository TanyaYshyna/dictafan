"""
Функции для работы с историей активности пользователей в PostgreSQL
"""
import json
from datetime import datetime, timedelta
from psycopg2 import sql
from helpers.db import get_db_connection


def _normalize_selected_sentence_positions(selected_sentence_positions):
    try:
        if selected_sentence_positions is None:
            return []
        if isinstance(selected_sentence_positions, str):
            raw = selected_sentence_positions.strip()
            if not raw or raw == '[]':
                return []
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [int(x) for x in parsed]
                return []
            except Exception:
                return []
        return [int(x) for x in list(selected_sentence_positions or [])]
    except Exception:
        return []


def _ensure_dictation_exercise(cur, dictation_id: int, positions_arr: list[int]) -> int:
    """Возвращает id упражнения (dictation_exercises), создавая его при необходимости.

    positions_arr=[] означает Full (весь диктант).
    """
    cur.execute(
        """
        INSERT INTO dictation_exercises (dictation_id, positions)
        VALUES (%s, %s)
        ON CONFLICT (dictation_id, positions)
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
        """,
        (int(dictation_id), positions_arr),
    )
    row = cur.fetchone()
    return int(row[0])


def _resolve_teacher_id(cur, user_id: int, source_group_id) -> int:
    if not source_group_id:
        return int(user_id)
    cur.execute(
        """
        SELECT teacher_id
        FROM groups
        WHERE id = %s
        """,
        (int(source_group_id),),
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return int(user_id)
    return int(row[0])


def _upsert_history_by_day(
    cur,
    *,
    user_id: int,
    teacher_id: int,
    dictation_language_code,
    dictation_id: int,
    positions=None,
    date_plan,
    date_fact,
    date_start=None,
    perfect_delta: int = 0,
    corrected_delta: int = 0,
    audio_delta: int = 0,
    mistake_delta: int = 0,
    monenumber_of_characters_delta: int = 0,
    lead_time_delta: int = 0,
    successes_delta: int = 0,
    activity_count_delta: int = 0,
    money_dt_delta: int = 0,
) -> None:
    positions_arr = _normalize_selected_sentence_positions(positions)
    # Если date_start не передан, используем date_fact
    if date_start is None:
        date_start = date_fact
    cur.execute(
        """
        INSERT INTO history_by_day (
            user_id,
            teacher_id,
            dictation_language_code,
            dictation_id,
            positions,
            date_plan,
            date_fact,
            date_start,
            perfect_count,
            corrected_count,
            audio_count,
            monenumber_of_characters,
            mistake_count,
            lead_time,
            successes,
            activity_count,
            money_dt_count,
            created_at,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, teacher_id, dictation_id, positions, date_plan, date_fact)
        DO UPDATE SET
            perfect_count = COALESCE(history_by_day.perfect_count, 0) + EXCLUDED.perfect_count,
            corrected_count = COALESCE(history_by_day.corrected_count, 0) + EXCLUDED.corrected_count,
            audio_count = COALESCE(history_by_day.audio_count, 0) + EXCLUDED.audio_count,
            monenumber_of_characters = COALESCE(history_by_day.monenumber_of_characters, 0) + EXCLUDED.monenumber_of_characters,
            mistake_count = COALESCE(history_by_day.mistake_count, 0) + EXCLUDED.mistake_count,
            lead_time = COALESCE(history_by_day.lead_time, 0) + EXCLUDED.lead_time,
            successes = COALESCE(history_by_day.successes, 0) + EXCLUDED.successes,
            activity_count = COALESCE(history_by_day.activity_count, 0) + EXCLUDED.activity_count,
            money_dt_count = COALESCE(history_by_day.money_dt_count, 0) + EXCLUDED.money_dt_count,
            dictation_language_code = COALESCE(history_by_day.dictation_language_code, EXCLUDED.dictation_language_code),
            date_start = LEAST(COALESCE(history_by_day.date_start, EXCLUDED.date_start), EXCLUDED.date_start),
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            int(user_id),
            int(teacher_id),
            dictation_language_code,
            int(dictation_id),
            positions_arr,
            date_plan,
            date_fact,
            date_start,
            int(perfect_delta or 0),
            int(corrected_delta or 0),
            int(audio_delta or 0),
            int(monenumber_of_characters_delta or 0),
            int(mistake_delta or 0),
            int(lead_time_delta or 0),
            int(successes_delta or 0),
            int(activity_count_delta or 0),
            int(money_dt_delta or 0),
        ),
    )


def add_activity(user_id, dictation_id, type_activity, number=1, date_override=None, dictation_language_code=None, selected_sentence_positions=None, lead_time_ms=None):
    """
    Добавляет или обновляет запись активности в history_by_day (агрегация по дням)
    
    Args:
        user_id: ID пользователя (integer)
        dictation_id: ID диктанта (integer или строка dict_<id>)
        type_activity: Тип активности - 'perfect', 'corrected' или 'audio'
        number: Количество (опционально, по умолчанию 1)
    
    Returns:
        dict: Данные созданной/обновленной записи с полем 'id'
    
    Note:
        Данные сохраняются в history_by_day через _upsert_history_by_day.
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
    print(f'📊 [HISTORY_BY_DAY] Сохранение активности:')
    print(f'   user_id: {user_id}')
    print(f'   dictation_id: {dictation_id}')
    print(f'   type_activity: {type_activity}')
    print(f'   number: {number}')
    print(f'   date: {target_date}')
    print(f'   dictation_language_code: {dictation_language_code}')
    print(f'   selected_sentence_positions: {selected_sentence_positions}')
    print(f'   lead_time_ms: {lead_time_ms}')

    # Нормализуем selected_sentence_positions к int[] для БД.
    # Пустой массив означает: все предложения.
    selected_sentence_positions_arr = _normalize_selected_sentence_positions(selected_sentence_positions)

    try:
        lead_time_ms_int = int(lead_time_ms or 0)
    except Exception:
        lead_time_ms_int = 0
    if lead_time_ms_int < 0:
        lead_time_ms_int = 0

    if type_activity == 'perfect':
        perfect_delta = int(number or 0)
        corrected_delta = 0
        audio_delta = 0
    elif type_activity == 'corrected':
        perfect_delta = 0
        corrected_delta = int(number or 0)
        audio_delta = 0
    else:
        perfect_delta = 0
        corrected_delta = 0
        audio_delta = int(number or 0)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            _upsert_history_by_day(
                cur,
                user_id=int(user_id),
                teacher_id=int(user_id),
                dictation_language_code=dictation_language_code,
                dictation_id=int(dictation_id),
                positions=selected_sentence_positions_arr,
                date_plan=target_date,
                date_fact=target_date,
                perfect_delta=perfect_delta,
                corrected_delta=corrected_delta,
                audio_delta=audio_delta,
                lead_time_delta=int(lead_time_ms_int or 0),
                successes_delta=0,
            )

            conn.commit()

            activity = {
                'id': 0,
                'user_id': int(user_id),
                'dictation_id': int(dictation_id),
                'date': target_date.isoformat(),
                'selected_sentence_positions': selected_sentence_positions_arr,
                'dictation_language_code': dictation_language_code,
                'perfect_count': perfect_delta,
                'corrected_count': corrected_delta,
                'audio_count': audio_delta,
                'lead_time': lead_time_ms_int,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
            }

            print(f'✅ [HISTORY_BY_DAY] Активность сохранена: user_id={activity["user_id"]}, date={activity["date"]}, {type_activity}={number}')
            return activity
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to add activity: {e}")
    finally:
        conn.close()


def get_activity_lead_time_by_day_range(user_id: int, start_date, end_date, language_code=None):
    """Return summed lead_time (ms) and counters by day from history_by_day for a given period.

    Returns:
        list[dict]: [{date, lead_time, money_dt, mistakes, chars}, ...]
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
                        date_fact AS date,
                        COALESCE(SUM(lead_time), 0) AS lead_time,
                        COALESCE(SUM(money_dt_count), 0) AS money_dt,
                        COALESCE(SUM(mistake_count), 0) AS mistakes,
                        COALESCE(SUM(monenumber_of_characters), 0) AS chars
                    FROM history_by_day
                    WHERE user_id = %s
                      AND date_fact >= %s
                      AND date_fact <= %s
                      AND dictation_language_code = %s
                    GROUP BY date_fact
                    ORDER BY date_fact ASC
                    """,
                    (int(user_id), start_date, end_date, str(language_code).strip().lower()),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        date_fact AS date,
                        COALESCE(SUM(lead_time), 0) AS lead_time,
                        COALESCE(SUM(money_dt_count), 0) AS money_dt,
                        COALESCE(SUM(mistake_count), 0) AS mistakes,
                        COALESCE(SUM(monenumber_of_characters), 0) AS chars
                    FROM history_by_day
                    WHERE user_id = %s
                      AND date_fact >= %s
                      AND date_fact <= %s
                    GROUP BY date_fact
                    ORDER BY date_fact ASC
                    """,
                    (int(user_id), start_date, end_date),
                )
            rows = cur.fetchall() or []

        out = []
        for r in rows:
            if isinstance(r, dict):
                d = r.get('date')
                date_iso = d.isoformat() if hasattr(d, 'isoformat') else str(d)
                out.append({
                    'date': date_iso,
                    'lead_time': int(r.get('lead_time') or 0),
                    'money_dt': int(r.get('money_dt') or 0),
                    'mistakes': int(r.get('mistakes') or 0),
                    'chars': int(r.get('chars') or 0),
                })
            else:
                d = r[0]
                date_iso = d.isoformat() if hasattr(d, 'isoformat') else str(d)
                out.append({
                    'date': date_iso,
                    'lead_time': int(r[1] or 0),
                    'money_dt': int(r[2] or 0) if len(r) > 2 else 0,
                    'mistakes': int(r[3] or 0) if len(r) > 3 else 0,
                    'chars': int(r[4] or 0) if len(r) > 4 else 0,
                })
        return out
    finally:
        conn.close()


def get_activity_lead_time_year_bounds(user_id: int, language_code=None):
    """Return (min_year, max_year) where user has any activity rows (lead_time or counts) in history_by_day."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if language_code and str(language_code).strip().lower() not in ('all', '*'):
                cur.execute(
                    """
                    SELECT
                        MIN(EXTRACT(YEAR FROM date_fact))::int AS min_year,
                        MAX(EXTRACT(YEAR FROM date_fact))::int AS max_year
                    FROM history_by_day
                    WHERE user_id = %s
                      AND dictation_language_code = %s
                    """,
                    (int(user_id), str(language_code).strip().lower()),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        MIN(EXTRACT(YEAR FROM date_fact))::int AS min_year,
                        MAX(EXTRACT(YEAR FROM date_fact))::int AS max_year
                    FROM history_by_day
                    WHERE user_id = %s
                    """,
                    (int(user_id),),
                )
            row = cur.fetchone()
            if isinstance(row, dict):
                return (row.get('min_year'), row.get('max_year'))
            if not row:
                return (None, None)
            return (row[0], row[1])
    finally:
        conn.close()


def add_activity_bulk(
    user_id,
    dictation_id,
    perfect_count=0,
    corrected_count=0,
    audio_count=0,
    activity_count=0,
    money_count=0,
    mistake_count=0,
    monenumber_of_characters=0,
    lead_time_ms=0,
    date_override=None,
    dictation_language_code=None,
    selected_sentence_positions=None,
):
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

    if date_override is None:
        target_date = datetime.now().date()
    else:
        if isinstance(date_override, str):
            raw = date_override.strip()
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

    try:
        perfect_count_int = int(perfect_count or 0)
    except Exception:
        perfect_count_int = 0
    try:
        corrected_count_int = int(corrected_count or 0)
    except Exception:
        corrected_count_int = 0
    try:
        audio_count_int = int(audio_count or 0)
    except Exception:
        audio_count_int = 0
    try:
        lead_time_ms_int = int(lead_time_ms or 0)
    except Exception:
        lead_time_ms_int = 0

    try:
        activity_count_int = int(activity_count or 0)
    except Exception:
        activity_count_int = 0
    try:
        money_count_int = int(money_count or 0)
    except Exception:
        money_count_int = 0
    try:
        mistake_count_int = int(mistake_count or 0)
    except Exception:
        mistake_count_int = 0
    try:
        monenumber_of_characters_int = int(monenumber_of_characters or 0)
    except Exception:
        monenumber_of_characters_int = 0

    if perfect_count_int < 0:
        perfect_count_int = 0
    if corrected_count_int < 0:
        corrected_count_int = 0
    if audio_count_int < 0:
        audio_count_int = 0
    if activity_count_int < 0:
        activity_count_int = 0
    if lead_time_ms_int < 0:
        lead_time_ms_int = 0
    if money_count_int < 0:
        money_count_int = 0
    if mistake_count_int < 0:
        mistake_count_int = 0
    if monenumber_of_characters_int < 0:
        monenumber_of_characters_int = 0

    selected_sentence_positions_arr = _normalize_selected_sentence_positions(selected_sentence_positions)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Начисление денег: каждая активность приносит money_count монет
            if money_count_int > 0:
                try:
                    cur.execute(
                        """
                        INSERT INTO user_money_ledger
                        (user_id, dt, kt, reason, created_at, date_start, date_fact)
                        VALUES (%s, %s, 0, %s, CURRENT_TIMESTAMP, %s, %s)
                        """,
                        (int(user_id), money_count_int, f"dictation_activity:{dictation_id}", target_date, target_date),
                    )
                except Exception:
                    pass

            _upsert_history_by_day(
                cur,
                user_id=int(user_id),
                teacher_id=int(user_id),
                dictation_language_code=dictation_language_code,
                dictation_id=int(dictation_id),
                positions=selected_sentence_positions_arr,
                date_plan=target_date,
                date_fact=target_date,
                perfect_delta=int(perfect_count_int or 0),
                corrected_delta=int(corrected_count_int or 0),
                audio_delta=int(audio_count_int or 0),
                mistake_delta=int(mistake_count_int or 0),
                monenumber_of_characters_delta=int(monenumber_of_characters_int or 0),
                lead_time_delta=int(lead_time_ms_int or 0),
                successes_delta=0,
                activity_count_delta=int(activity_count_int or 0),
                money_dt_delta=int(money_count_int or 0),
            )

            conn.commit()

            return {
                'id': 0,
                'user_id': int(user_id),
                'dictation_id': int(dictation_id),
                'date': target_date.isoformat(),
                'selected_sentence_positions': selected_sentence_positions_arr,
                'dictation_language_code': dictation_language_code,
                'perfect_count': perfect_count_int,
                'corrected_count': corrected_count_int,
                'audio_count': audio_count_int,
                'lead_time': lead_time_ms_int,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
            }
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to add bulk activity: {e}")
    finally:
        conn.close()


def get_activity_total_for_date(user_id, date_value, language_code=None):
    """Return total activity points for a specific date.

    Total = perfect + corrected + audio.
    Uses history_by_day table.
    """
    conn = get_db_connection()
    try:
        if isinstance(date_value, str):
            date_value = datetime.fromisoformat(date_value).date()
        with conn.cursor() as cur:
            if language_code and str(language_code).strip().lower() not in ('all', '*'):
                cur.execute(
                    """
                    SELECT
                        COALESCE(SUM(perfect_count + corrected_count + audio_count), 0) AS total
                    FROM history_by_day
                    WHERE user_id = %s
                      AND date_fact = %s
                      AND dictation_language_code = %s
                    """,
                    (int(user_id), date_value, str(language_code).strip().lower()),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        COALESCE(SUM(perfect_count + corrected_count + audio_count), 0) AS total
                    FROM history_by_day
                    WHERE user_id = %s
                      AND date_fact = %s
                    """,
                    (int(user_id), date_value),
                )
            row = cur.fetchone()
            if isinstance(row, dict):
                return int(row.get('total') or 0)
            return int(row[0] if row and row[0] is not None else 0)
    finally:
        conn.close()


def calculate_streak_days(user_id, today=None):
    """Calculate consecutive active days based on history_by_day.

    A day counts as active if the user earned any money (money_dt_count > 0).
    """
    if today is None:
        today = datetime.now().date()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Pull recent active dates (descending). Limit protects from scanning huge history.
            cur.execute(
                """
                SELECT date_fact AS date
                FROM history_by_day
                WHERE user_id = %s
                GROUP BY date_fact
                HAVING COALESCE(SUM(money_dt_count), 0) > 0
                ORDER BY date_fact DESC
                LIMIT 400
                """,
                (int(user_id),),
            )
            rows = cur.fetchall() or []

        active = set()
        for r in rows:
            d = r.get('date') if isinstance(r, dict) else (r[0] if r else None)
            if d is not None:
                active.add(d)

        if not active:
            return 0

        # If today not active, start from yesterday.
        current = today if today in active else (today - timedelta(days=1))
        streak = 0
        while current in active:
            streak += 1
            current = current - timedelta(days=1)
        return streak
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
                        date_fact AS date,
                        COALESCE(SUM(perfect_count), 0) AS perfect,
                        COALESCE(SUM(corrected_count), 0) AS corrected,
                        COALESCE(SUM(audio_count), 0) AS audio
                    FROM history_by_day
                    WHERE user_id = %s
                      AND date_fact >= %s
                      AND date_fact <= %s
                      AND dictation_language_code = %s
                    GROUP BY date_fact
                    ORDER BY date_fact ASC
                    """,
                    (int(user_id), start_date, end_date, str(language_code).strip().lower()),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        date_fact AS date,
                        COALESCE(SUM(perfect_count), 0) AS perfect,
                        COALESCE(SUM(corrected_count), 0) AS corrected,
                        COALESCE(SUM(audio_count), 0) AS audio
                    FROM history_by_day
                    WHERE user_id = %s
                      AND date_fact >= %s
                      AND date_fact <= %s
                    GROUP BY date_fact
                    ORDER BY date_fact ASC
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


def add_success(user_id, dictation_id, perfect_count, corrected_count, audio_count, time_ms, attempts_total=0, mistake_count=0, monenumber_of_characters=0, source_group_id=None, selected_sentence_positions=None, dictation_language_code=None, started_at=None, date_start=None, completion_count=None):
    """
    Добавляет запись успешного завершения диктанта в history_by_day
    
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
        Данные сохраняются в history_by_day через _upsert_history_by_day.
    """
    # Если dictation_id в формате dict_<id>, извлекаем числовой ID
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")
    
    # Временные логи для отладки
    print(f'📊 [HISTORY_BY_DAY] Сохранение успеха:')
    print(f'   user_id: {user_id}')
    print(f'   dictation_id: {dictation_id}')
    print(f'   perfect_count: {perfect_count}')
    print(f'   corrected_count: {corrected_count}')
    print(f'   audio_count: {audio_count}')
    print(f'   attempts_total: {attempts_total}')
    print(f'   mistake_count: {mistake_count}')
    print(f'   monenumber_of_characters: {monenumber_of_characters}')
    print(f'   time_ms: {time_ms}')
    print(f'   source_group_id: {source_group_id}')
    print(f'   selected_sentence_positions: {selected_sentence_positions}')
    print(f'   dictation_language_code: {dictation_language_code}')
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            teacher_id = _resolve_teacher_id(cur, int(user_id), source_group_id)
            date_fact = datetime.now().date()
            date_plan = date_fact

            # date_start: если передан — используем его, иначе date_fact
            if date_start is not None:
                try:
                    if isinstance(date_start, str):
                        date_start_parsed = datetime.strptime(date_start, '%Y-%m-%d').date()
                    else:
                        date_start_parsed = date_start
                except Exception:
                    date_start_parsed = date_fact
            else:
                date_start_parsed = date_fact

            # Нормализуем selected_sentence_positions для history_by_day
            positions_for_hbd = _normalize_selected_sentence_positions(selected_sentence_positions)

            _upsert_history_by_day(
                cur,
                user_id=int(user_id),
                teacher_id=int(teacher_id),
                dictation_language_code=dictation_language_code,
                dictation_id=int(dictation_id),
                positions=positions_for_hbd,
                date_plan=date_plan,
                date_fact=date_fact,
                date_start=date_start_parsed,
                # perfect/corrected/audio уже обновлены в add_activity_bulk — не дублируем
                perfect_delta=0,
                corrected_delta=0,
                audio_delta=0,
                mistake_delta=int(mistake_count or 0),
                monenumber_of_characters_delta=int(monenumber_of_characters or 0),
                lead_time_delta=int(time_ms or 0),
                successes_delta=int(completion_count or 1),
                activity_count_delta=0,
                money_dt_delta=0,
            )

            conn.commit()

            success = {
                'id': 0,
                'user_id': int(user_id),
                'dictation_id': int(dictation_id),
                'dictation_language_code': dictation_language_code,
                'perfect_count': int(perfect_count or 0),
                'corrected_count': int(corrected_count or 0),
                'audio_count': int(audio_count or 0),
                'attempts_total': int(attempts_total or 0),
                'mistake_count': int(mistake_count or 0),
                'time_ms': int(time_ms or 0),
                'source_group_id': source_group_id,
                'selected_sentence_positions': positions_for_hbd,
                'started_at': started_at.isoformat() if started_at else None,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
            }
            
            print(f'✅ [HISTORY_BY_DAY] Успех сохранен: user_id={success["user_id"]}, dictation_id={success["dictation_id"]}')
            
            return success
    except Exception as e:
        conn.rollback()
        import traceback
        print(f'❌ [HISTORY_BY_DAY] Детали ошибки:')
        traceback.print_exc()
        raise Exception(f"Failed to add success: {e}")
    finally:
        conn.close()


def get_activities_by_date(user_id, dictation_id, date):
    """
    Получает агрегированную активность пользователя по диктанту за указанную дату из history_by_day
    
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
                SELECT id, user_id, dictation_id, date_fact, perfect_count, corrected_count, audio_count, created_at, updated_at
                FROM history_by_day
                WHERE user_id = %s 
                  AND dictation_id = %s
                  AND date_fact = %s
                LIMIT 1
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
    Получает количество успешных завершений диктанта для пользователя из history_by_day
    
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
                SELECT COALESCE(SUM(successes), 0)
                FROM history_by_day
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
            """, (user_id, dictation_id, []))
            
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as e:
        raise Exception(f"Failed to get success count: {e}")
    finally:
        conn.close()


def get_success_count_for_subset(user_id, dictation_id, selected_sentence_positions):
    """Count successful completions for an exact assignment subset from history_by_day.

    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта (integer или строка dict_<id>)
        selected_sentence_positions: list[int] | None

    Returns:
        int
    """
    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
        try:
            dictation_id = int(dictation_id.replace('dict_', ''))
        except ValueError:
            raise ValueError(f"Неверный формат dictation_id: {dictation_id}")

    positions_arr = _normalize_selected_sentence_positions(selected_sentence_positions)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(SUM(successes), 0)
                FROM history_by_day
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
                """,
                (user_id, dictation_id, positions_arr),
            )

            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as e:
        raise Exception(f"Failed to get subset success count: {e}")
    finally:
        conn.close()


def get_success_counts_for_dictations(user_id, dictation_ids):
    """
    Получает количество успешных завершений для нескольких диктантов из history_by_day
    
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
            # Считаем successes для full dictation (positions = '{}')
            cur.execute("""
                SELECT dictation_id, COALESCE(SUM(successes), 0) as count
                FROM history_by_day
                WHERE user_id = %s
                  AND dictation_id = ANY(%s)
                  AND positions = %s
                GROUP BY dictation_id
            """, (user_id, numeric_ids, []))
            
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


def get_history_by_day_totals_for_date(user_id: int, target_date) -> dict:
    """Return aggregated lead_time and money_dt_count for a specific date from history_by_day."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(lead_time), 0)::bigint AS lead_time,
                    COALESCE(SUM(money_dt_count), 0)::int AS money
                FROM history_by_day
                WHERE user_id = %s
                  AND date_fact = %s
                """,
                (user_id, target_date),
            )
            row = cur.fetchone()
            if row:
                return {
                    'lead_time': int(row.get('lead_time') if isinstance(row, dict) else row[0]),
                    'money': int(row.get('money') if isinstance(row, dict) else row[1]),
                }
            return {'lead_time': 0, 'money': 0}
    except Exception as e:
        raise Exception(f"Failed to get history_by_day totals for date: {e}")
    finally:
        conn.close()


def get_history_by_day_totals(user_id: int) -> dict:
    """Return aggregated total lead_time and money_dt_count from history_by_day."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(lead_time), 0)::bigint AS total_lead_time,
                    COALESCE(SUM(money_dt_count), 0)::int AS total_money
                FROM history_by_day
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row:
                return {
                    'total_lead_time': int(row.get('total_lead_time') if isinstance(row, dict) else row[0]),
                    'total_money': int(row.get('total_money') if isinstance(row, dict) else row[1]),
                }
            return {'total_lead_time': 0, 'total_money': 0}
    except Exception as e:
        raise Exception(f"Failed to get history_by_day totals: {e}")
    finally:
        conn.close()
