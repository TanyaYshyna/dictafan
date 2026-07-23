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
) -> int:
    """Upsert в history_by_day и возвращает id записи.

    После upsert обновляет number_successes — нарастающий итог successes
    для данного (user_id, dictation_id, positions) на дату date_fact.
    """
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
        ON CONFLICT (user_id, teacher_id, dictation_id, positions, date_plan, date_fact, date_start)
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
            date_start = COALESCE(history_by_day.date_start, EXCLUDED.date_start),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
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
    row = cur.fetchone()
    hbd_id = int(row[0]) if row else 0

    # Обновляем number_successes — нарастающий итог successes
    # для данного (user_id, dictation_id, positions) на дату date_fact
    if successes_delta != 0:
        _recalc_number_successes(cur, int(user_id), int(dictation_id), positions_arr, date_fact)

    return hbd_id


def _recalc_number_successes(cur, user_id: int, dictation_id: int, positions_arr: list, up_to_date) -> None:
    """Пересчитать number_successes для (user_id, dictation_id, positions) на дату up_to_date.

    number_successes = глобальный порядковый номер успешного выполнения
    для данного диктанта (без разбивки по дням).
    """
    cur.execute(
        """
        WITH cumulative AS (
            SELECT
                id,
                SUM(successes) OVER (
                    PARTITION BY user_id, dictation_id, positions
                    ORDER BY date_fact ASC, created_at ASC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS running_total
            FROM history_by_day
            WHERE user_id = %s
              AND dictation_id = %s
              AND positions = %s
              AND date_fact <= %s
            ORDER BY date_fact ASC, created_at ASC
        )
        UPDATE history_by_day hbd
        SET
            number_successes = c.running_total,
            updated_at = CURRENT_TIMESTAMP
        FROM cumulative c
        WHERE hbd.id = c.id
          AND c.running_total != COALESCE(hbd.number_successes, 0)
        """,
        (user_id, dictation_id, positions_arr, up_to_date),
    )


def _update_history_current_successes_only(cur, user_id: int, dictation_id: int, positions_arr: list) -> None:
    """Обновить только number_successes в history_current, не трогая поля рекорда.

    Вызывается из add_success до того, как check_and_save_dictation_record
    установит актуальный рекорд.
    """
    cur.execute(
        """
        INSERT INTO history_current (user_id, dictation_id, positions, number_successes, created_at, updated_at)
        SELECT
            %s AS user_id,
            %s AS dictation_id,
            %s AS positions,
            COALESCE(SUM(successes), 0) AS number_successes,
            CURRENT_TIMESTAMP AS created_at,
            CURRENT_TIMESTAMP AS updated_at
        FROM history_by_day
        WHERE user_id = %s
          AND dictation_id = %s
          AND positions = %s
        ON CONFLICT (user_id, dictation_id, positions)
        DO UPDATE SET
            number_successes = (
                SELECT COALESCE(SUM(successes), 0)
                FROM history_by_day
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
            ),
            updated_at = CURRENT_TIMESTAMP
        """,
        (user_id, dictation_id, positions_arr,
         user_id, dictation_id, positions_arr,
         user_id, dictation_id, positions_arr),
    )


def _upsert_history_current(
    cur,
    user_id: int,
    dictation_id: int,
    positions_arr: list,
    *,
    mistake_count: int = 0,
    lead_time: int = 0,
) -> None:
    """Обновить или создать запись в history_current для (user_id, dictation_id, positions).

    Обновляет:
      - number_successes = полная сумма successes из history_by_day для этого упражнения
      - mistake_count, lead_time — данные рекорда
    """
    cur.execute(
        """
        INSERT INTO history_current (user_id, dictation_id, positions, number_successes,
                                     mistake_count, lead_time,
                                     created_at, updated_at)
        SELECT
            %s AS user_id,
            %s AS dictation_id,
            %s AS positions,
            COALESCE(SUM(successes), 0) AS number_successes,
            %s AS mistake_count,
            %s AS lead_time,
            CURRENT_TIMESTAMP AS created_at,
            CURRENT_TIMESTAMP AS updated_at
        FROM history_by_day
        WHERE user_id = %s
          AND dictation_id = %s
          AND positions = %s
        ON CONFLICT (user_id, dictation_id, positions)
        DO UPDATE SET
            number_successes = (
                SELECT COALESCE(SUM(successes), 0)
                FROM history_by_day
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
            ),
            mistake_count = EXCLUDED.mistake_count,
            lead_time = EXCLUDED.lead_time,
            updated_at = CURRENT_TIMESTAMP
        """,
        (user_id, dictation_id, positions_arr,
         int(mistake_count or 0), int(lead_time or 0),
         user_id, dictation_id, positions_arr,
         user_id, dictation_id, positions_arr),
    )


def get_history_current(user_id: int, dictation_id: int, positions=None) -> int:
    """Получить number_successes из history_current для упражнения.

    Если записи нет — возвращает 0.
    """
    positions_arr = _normalize_selected_sentence_positions(positions)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT number_successes
                FROM history_current
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
                """,
                (user_id, dictation_id, positions_arr),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except Exception as e:
        print(f'❌ [HISTORY_CURRENT] Ошибка получения: {e}')
        return 0
    finally:
        conn.close()


def get_history_current_bulk(user_id: int, dictation_ids: list[int]) -> dict:
    """Получить number_successes для нескольких диктантов (full, positions=[]).

    Returns:
        dict: {dictation_id: number_successes, ...}
    """
    if not dictation_ids:
        return {}
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dictation_id, number_successes
                FROM history_current
                WHERE user_id = %s
                  AND dictation_id = ANY(%s)
                  AND positions = %s
                """,
                (user_id, dictation_ids, []),
            )
            rows = cur.fetchall()
            result = {int(did): int(ns) for did, ns in rows}
            # Добавляем 0 для тех, чего нет
            for did in dictation_ids:
                if did not in result:
                    result[did] = 0
            return result
    except Exception as e:
        print(f'❌ [HISTORY_CURRENT] Ошибка получения bulk: {e}')
        return {did: 0 for did in dictation_ids}
    finally:
        conn.close()


def recalc_history_current_for_user(user_id: int) -> None:
    """Пересчитать все записи history_current для пользователя из history_by_day.

    Поля рекорда (mistake_count, lead_time) не заполняются при пересчёте —
    они будут установлены при следующем прохождении диктанта
    через check_and_save_dictation_record().
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Удаляем старые записи для пользователя
            cur.execute(
                "DELETE FROM history_current WHERE user_id = %s",
                (user_id,),
            )
            # Вставляем заново из агрегации history_by_day
            cur.execute(
                """
                INSERT INTO history_current (user_id, dictation_id, positions, number_successes,
                                             mistake_count, lead_time,
                                             created_at, updated_at)
                SELECT
                    hbd.user_id,
                    hbd.dictation_id,
                    hbd.positions,
                    SUM(hbd.successes) AS number_successes,
                    0 AS mistake_count,
                    0 AS lead_time,
                    MIN(hbd.created_at) AS created_at,
                    MAX(hbd.updated_at) AS updated_at
                FROM history_by_day hbd
                WHERE hbd.user_id = %s
                GROUP BY hbd.user_id, hbd.dictation_id, hbd.positions
                """,
                (user_id,),
            )
            conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'❌ [HISTORY_CURRENT] Ошибка пересчёта для пользователя {user_id}: {e}')
        raise
    finally:
        conn.close()


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
    date_start=None,
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

    # date_plan = дата начала сессии (из date_start, без времени), если date_start передан
    # date_fact = сегодня (фактический день выполнения)
    if date_start is not None:
        if isinstance(date_start, str):
            try:
                date_start_clean = date_start.strip()
                # Извлекаем только дату из строки вида "YYYY-MM-DD HH:MM:SS"
                date_plan = datetime.fromisoformat(date_start_clean[:10]).date()
            except Exception:
                date_plan = target_date
        else:
            date_plan = target_date
    else:
        date_plan = target_date

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
                date_plan=date_plan,
                date_fact=target_date,
                date_start=date_start,
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


def add_success(user_id, dictation_id, perfect_count, corrected_count, audio_count, time_ms, attempts_total=0, mistake_count=0, monenumber_of_characters=0, source_group_id=None, selected_sentence_positions=None, dictation_language_code=None, started_at=None, date_start=None, completion_count=None, money_earned=None):
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

            # date_start: если передан — используем его (TIMESTAMP с временем), иначе date_fact
            if date_start is not None:
                try:
                    if isinstance(date_start, str):
                        ds = date_start.strip()
                        # PostgreSQL сам сконвертирует строку в TIMESTAMP
                        date_start_parsed = ds
                        # date_plan = дата начала сессии (из date_start, без времени)
                        date_plan = datetime.fromisoformat(ds[:10]).date()
                    else:
                        date_start_parsed = date_start
                        date_plan = date_fact
                except Exception:
                    date_start_parsed = date_fact
                    date_plan = date_fact
            else:
                date_start_parsed = date_fact
                date_plan = date_fact

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
                # perfect/corrected/audio/money передаются вместе с success.
                # На клиенте _flushOutbox находит пару activity+success для
                # одного диктанта, склеивает их в один запрос и отправляет
                # на сервер. Success payload уже содержит итоговые totals
                # из сессии (showCompletionModal), поэтому суммировать их
                # с activity НЕ нужно — это приведёт к удвоению.
                perfect_delta=int(perfect_count or 0),
                corrected_delta=int(corrected_count or 0),
                audio_delta=int(audio_count or 0),
                mistake_delta=int(mistake_count or 0),
                monenumber_of_characters_delta=int(monenumber_of_characters or 0),
                lead_time_delta=int(time_ms or 0),
                successes_delta=int(completion_count or 1),
                activity_count_delta=0,
                money_dt_delta=int(money_earned or 0),
            )

            # Обновляем history_current — актуальное количество побед для этого упражнения
            # (без полей рекорда — они будут установлены в check_and_save_dictation_record)
            _update_history_current_successes_only(
                cur,
                user_id=int(user_id),
                dictation_id=int(dictation_id),
                positions_arr=positions_for_hbd,
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
    Получает количество успешных завершений диктанта для пользователя из history_current
    
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
                SELECT number_successes
                FROM history_current
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
    """Count successful completions for an exact assignment subset from history_current.

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
                SELECT number_successes
                FROM history_current
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
    Получает количество успешных завершений для нескольких диктантов из history_current
    
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
            # Берём из history_current (быстрая таблица-кэш)
            # Для full dictation (positions = '{}')
            cur.execute("""
                SELECT dictation_id, number_successes
                FROM history_current
                WHERE user_id = %s
                  AND dictation_id = ANY(%s)
                  AND positions = %s
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


def get_successes_sum_from_history_by_day(user_id: int, dictation_id: int, selected_sentence_positions=None) -> int:
    """Return total sum of successes from history_by_day for a user/dictation/positions."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if selected_sentence_positions is not None and selected_sentence_positions != '':
                try:
                    if isinstance(selected_sentence_positions, str):
                        positions_arr = json.loads(selected_sentence_positions)
                    else:
                        positions_arr = list(selected_sentence_positions)
                except Exception:
                    positions_arr = []
                cur.execute(
                    """
                    SELECT COALESCE(SUM(successes), 0)::int
                    FROM history_by_day
                    WHERE user_id = %s
                      AND dictation_id = %s
                      AND positions = %s
                    """,
                    (user_id, dictation_id, positions_arr),
                )
            else:
                cur.execute(
                    """
                    SELECT COALESCE(SUM(successes), 0)::int
                    FROM history_by_day
                    WHERE user_id = %s
                      AND dictation_id = %s
                      AND positions = %s
                    """,
                    (user_id, dictation_id, []),
                )
            row = cur.fetchone()
            return int(row[0] if row else 0)
    except Exception as e:
        raise Exception(f"Failed to get successes sum from history_by_day: {e}")
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


def check_and_save_dictation_record(
    user_id: int,
    dictation_id: int,
    positions,
    perfect_count: int,
    corrected_count: int,
    audio_count: int,
    activity_count: int,
    lead_time: int,
    mistake_count: int,
    monenumber_of_characters: int,
    money_dt_count: int,
) -> dict:
    """
    Проверяет, является ли текущий результат рекордом для пользователя по диктанту.
    Если да — сохраняет/обновляет запись в history_current.

    Критерий рекорда:
      1) Минимальное количество ошибок (mistake_count)
      2) Если ошибок столько же (или 0) — минимальное время (lead_time)

    Рекорд читается и сохраняется в history_current (поля mistake_count, lead_time).

    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта
        positions: список позиций предложений (int[])
        perfect_count: число perfect
        corrected_count: число corrected
        audio_count: число audio
        activity_count: число активностей
        lead_time: время в миллисекундах
        mistake_count: количество ошибок
        monenumber_of_characters: количество символов
        money_dt_count: заработано монет

    Returns:
        dict с полями:
          - is_record: bool — является ли результат новым рекордом
          - record: dict | None — данные рекорда (текущего после сохранения)
          - is_first: bool — первый ли это рекорд вообще
    """
    positions_arr = _normalize_selected_sentence_positions(positions)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Получаем текущий рекорд из history_current
            cur.execute(
                """
                SELECT
                    mistake_count,
                    lead_time
                FROM history_current
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
                """,
                (int(user_id), int(dictation_id), positions_arr),
            )
            hc_row = cur.fetchone()

            is_first = hc_row is None  # нет записи в history_current — первое выполнение
            is_record = False

            if is_first:
                # Первое выполнение — текущий результат становится рекордом
                is_record = True
            else:
                existing_mistakes = int(hc_row[0] or 0)
                existing_lead_time = int(hc_row[1] or 0)

                if mistake_count < existing_mistakes:
                    is_record = True
                elif mistake_count == existing_mistakes and lead_time < existing_lead_time:
                    is_record = True
                # иначе — не рекорд

            if is_record:
                # Обновляем history_current с новым рекордом
                _upsert_history_current(
                    cur,
                    user_id=int(user_id),
                    dictation_id=int(dictation_id),
                    positions_arr=positions_arr,
                    mistake_count=int(mistake_count or 0),
                    lead_time=int(lead_time or 0),
                )

                conn.commit()

                return {
                    'is_record': True,
                    'record': {
                        'mistake_count': int(mistake_count or 0),
                        'lead_time': int(lead_time or 0),
                    },
                    'is_first': is_first,
                }
            else:
                # Не рекорд — возвращаем существующий рекорд из history_current
                record_data = {
                    'mistake_count': int(hc_row[0] or 0),
                    'lead_time': int(hc_row[1] or 0),
                }

                return {
                    'is_record': False,
                    'record': record_data,
                    'is_first': False,
                }

    except Exception as e:
        conn.rollback()
        import traceback
        print(f'❌ [DICTATION_RECORDS] Ошибка проверки/сохранения рекорда: {e}')
        traceback.print_exc()
        return {
            'is_record': False,
            'record': None,
            'is_first': False,
            'error': str(e),
        }
    finally:
        conn.close()


def get_dictation_record(user_id: int, dictation_id: int, positions=None) -> dict | None:
    """Получить текущий рекорд пользователя по диктанту.

    Читает mistake_count и lead_time напрямую из history_current.

    Args:
        user_id: ID пользователя
        dictation_id: ID диктанта
        positions: список позиций предложений (опционально, по умолчанию [] — весь диктант)

    Returns:
        dict с данными рекорда или None, если рекорда нет
    """
    positions_arr = _normalize_selected_sentence_positions(positions)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    mistake_count,
                    lead_time
                FROM history_current
                WHERE user_id = %s
                  AND dictation_id = %s
                  AND positions = %s
                """,
                (int(user_id), int(dictation_id), positions_arr),
            )
            row = cur.fetchone()

            if not row:
                return None

            return {
                'dictation_id': dictation_id,
                'positions': positions_arr,
                'mistake_count': int(row[0] or 0),
                'lead_time': int(row[1] or 0),
            }
    except Exception as e:
        print(f'❌ [HISTORY_CURRENT] Ошибка получения рекорда: {e}')
        return None
    finally:
        conn.close()


def get_all_dictation_records(user_id: int) -> list[dict]:
    """Получить все рекорды пользователя по всем диктантам.

    Читает mistake_count и lead_time напрямую из history_current.
    Возвращает только те упражнения, где есть рекорд.

    Args:
        user_id: ID пользователя

    Returns:
        list[dict] — список рекордов, каждый с полями:
          dictation_id, positions, lead_time, mistake_count
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    dictation_id, positions,
                    mistake_count, lead_time
                FROM history_current
                WHERE user_id = %s
                  AND (mistake_count IS NOT NULL OR lead_time IS NOT NULL)
                ORDER BY dictation_id, positions
                """,
                (int(user_id),),
            )
            rows = cur.fetchall()
            result = []
            for row in rows:
                result.append({
                    'dictation_id': int(row[0]),
                    'positions': list(row[1]) if row[1] else [],
                    'mistake_count': int(row[2] or 0),
                    'lead_time': int(row[3] or 0),
                })
            return result
    except Exception as e:
        print(f'❌ [HISTORY_CURRENT] Ошибка получения всех рекордов: {e}')
        return []
    finally:
        conn.close()
