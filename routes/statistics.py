"""
Blueprint для API статистики активности пользователей
Доступен из любого места приложения
"""
import json
import os
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from helpers.user_helpers import get_user_folder
from helpers.db_users import get_user_by_email, update_user
from helpers.db_history import (
    add_activity, add_success, get_success_count, get_success_counts_for_dictations,
    get_activity_totals_by_period,
    get_success_count_for_subset,
    get_activity_lead_time_by_day_range,
    get_activity_lead_time_year_bounds,
    get_history_current,
    check_and_save_dictation_record,
    get_dictation_record,
    get_all_dictation_records,
    recalc_history_current_for_user,
    recalc_number_successes_all,
    recalc_history_current_all,
    repair_full_dictation_successes_all,
)
from helpers.db_telegram import (
    filter_manual_teacher_chat_ids,
    list_teacher_chat_ids_for_student_success,
    list_teacher_recipients_for_student_manual_report,
    get_student_and_dictation_info,
)
from helpers.telegram import is_telegram_enabled, send_telegram_message
from helpers.db_dictations import get_sentence_by_key, list_dictation_exercises
from helpers.db import get_db_connection
from helpers.db_books import get_user_library_books, get_book_sections, get_book_dictations
from helpers.db_groups import list_my_groups, list_group_students_for_teacher
from helpers.language_data import get_language_name
from routes.index import get_cover_url_for_id

try:
    from helpers.db_dictations import get_dictation_by_id
except Exception:
    get_dictation_by_id = None

statistics_bp = Blueprint('statistics', __name__, url_prefix='/api/statistics')


@statistics_bp.route('/money/spend', methods=['POST'])
@jwt_required()
def api_statistics_money_spend():
    """Spend user's money by creating a negative ledger entry (kt). Balance is calculated from user_money_ledger on the fly."""
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    data = request.get_json(silent=True) or {}
    try:
        cost = int(data.get('cost') or 0)
    except Exception:
        cost = 0
    if cost <= 0:
        return jsonify({'success': False, 'error': 'invalid_cost'}), 400

    reason = (data.get('reason') or '').strip() or 'spend'
    try:
        dictation_id = data.get('dictation_id')
        dictation_id = int(dictation_id) if dictation_id is not None and str(dictation_id).strip() != '' else None
    except Exception:
        dictation_id = None

    try:
        positions = data.get('positions')
        if not isinstance(positions, list):
            positions = []
        pos_norm = []
        for p in positions:
            try:
                v = int(p)
                if v > 0:
                    pos_norm.append(v)
            except Exception:
                continue
        pos_norm = sorted(list(set(pos_norm)))
    except Exception:
        pos_norm = []

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Считаем баланс из user_money_ledger на лету
        cur.execute(
            """
            SELECT
                COALESCE(SUM(dt), 0) - COALESCE(SUM(kt), 0) AS balance
            FROM user_money_ledger
            WHERE user_id = %s
            """,
            (int(user['id']),),
        )
        row = cur.fetchone()
        current_balance = int(row[0] or 0) if row else 0
        if current_balance < cost:
            conn.rollback()
            return jsonify({'success': False, 'error': 'not_enough_money', 'money_balance': current_balance}), 400

        today_iso = datetime.now().strftime('%Y-%m-%d')
        cur.execute(
            """
            INSERT INTO user_money_ledger (user_id, kt, reason, dictation_id, positions, date_start, date_fact)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (int(user['id']), cost, reason, dictation_id, pos_norm, today_iso, today_iso),
        )
        conn.commit()

        # Пересчитываем баланс после списания
        cur.execute(
            """
            SELECT COALESCE(SUM(dt), 0) - COALESCE(SUM(kt), 0) AS balance
            FROM user_money_ledger
            WHERE user_id = %s
            """,
            (int(user['id']),),
        )
        row = cur.fetchone()
        new_balance = int(row[0] or 0) if row else 0

        return jsonify({'success': True, 'money_balance': new_balance})
    except Exception as e:
        try:
            if conn:
                conn.rollback()
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass



@statistics_bp.route('/money/earn', methods=['POST'])
@jwt_required()
def api_statistics_money_earn():
    """Earn user's money by creating a positive ledger entry (dt). Balance is calculated from user_money_ledger on the fly."""
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    data = request.get_json(silent=True) or {}
    try:
        amount = int(data.get('amount') or 0)
    except Exception:
        amount = 0
    if amount <= 0:
        return jsonify({'success': False, 'error': 'invalid_amount'}), 400

    reason = (data.get('reason') or '').strip() or 'earn'
    try:
        dictation_id = data.get('dictation_id')
        dictation_id = int(dictation_id) if dictation_id is not None and str(dictation_id).strip() != '' else None
    except Exception:
        dictation_id = None

    try:
        positions = data.get('positions')
        if not isinstance(positions, list):
            positions = []
        pos_norm = []
        for p in positions:
            try:
                v = int(p)
                if v > 0:
                    pos_norm.append(v)
            except Exception:
                continue
        pos_norm = sorted(list(set(pos_norm)))
    except Exception:
        pos_norm = []

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        today_iso = datetime.now().strftime('%Y-%m-%d')
        cur.execute(
            """
            INSERT INTO user_money_ledger (user_id, dt, reason, dictation_id, positions, date_start, date_fact)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (int(user['id']), amount, reason, dictation_id, pos_norm, today_iso, today_iso),
        )
        conn.commit()

        # Считаем баланс из user_money_ledger на лету
        cur.execute(
            """
            SELECT COALESCE(SUM(dt), 0) - COALESCE(SUM(kt), 0) AS balance
            FROM user_money_ledger
            WHERE user_id = %s
            """,
            (int(user['id']),),
        )
        row = cur.fetchone()
        new_balance = int(row[0] or 0) if row else 0

        return jsonify({'success': True, 'money_balance': new_balance})
    except Exception as e:
        try:
            if conn:
                conn.rollback()
        except Exception:
            pass
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass


@statistics_bp.route('/telegram/send_self', methods=['POST'])
@jwt_required()
def api_statistics_telegram_send_self():
    """Send an arbitrary report text to current user's Telegram chat.

    Used by web UI reports (activity/plan-fact) to send summary only to self.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    if not is_telegram_enabled():
        return jsonify({'success': False, 'error': 'Telegram disabled'}), 400

    chat_id = user.get('telegram_chat_id')
    if not chat_id:
        return jsonify({'success': False, 'error': 'telegram_not_linked'}), 400

    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'success': False, 'error': 'empty_text'}), 400

    # Telegram sendMessage hard limit is 4096 chars.
    if len(text) > 4000:
        text = text[:4000]

    try:
        send_telegram_message(int(chat_id), text)
    except Exception as e:
        return jsonify({'success': False, 'error': 'send_failed'}), 500

    return jsonify({'success': True})


def _can_teacher_view_student_activity(teacher_user_id: int, student_user_id: int) -> bool:
    """Teacher может смотреть активность ученика если ученик активен в группе учителя и дал доступ."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1
                    FROM group_students gs
                    JOIN groups g ON g.id = gs.group_id
                    WHERE g.teacher_id = %s
                      AND gs.student_user_id = %s
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                      AND COALESCE(gs.notify_teacher_on_success, TRUE) = TRUE
                    LIMIT 1
                    """,
                    (int(teacher_user_id), int(student_user_id)),
                )
                return bool(cur.fetchone())
        finally:
            conn.close()
    except Exception:
        return False


def _group_activity_rows(rows, group_by: str):
    grouped = {}

    for r in rows or []:
        date_iso = str(r.get('date') or '')
        if not date_iso:
            continue
        try:
            d = datetime.fromisoformat(date_iso).date()
        except Exception:
            continue

        if group_by == 'months':
            key = f"{d.year}{d.month:02d}"
        elif group_by == 'weeks':
            # ISO week
            iso_year, iso_week, _ = d.isocalendar()
            key = f"{iso_year}W{iso_week:02d}"
        else:
            key = f"{d.year}{d.month:02d}{d.day:02d}"

        if key not in grouped:
            grouped[key] = {
                'date': key,
                'perfect': 0,
                'corrected': 0,
                'audio': 0,
            }
        grouped[key]['perfect'] += int(r.get('perfect') or 0)
        grouped[key]['corrected'] += int(r.get('corrected') or 0)
        grouped[key]['audio'] += int(r.get('audio') or 0)

    return sorted(grouped.values(), key=lambda x: str(x.get('date') or ''))


def _today_iso_local() -> str:
    try:
        return datetime.now().date().isoformat()
    except Exception:
        return datetime.utcnow().date().isoformat()


def _safe_html(v: str) -> str:
    v = str(v or '')
    return (
        v.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )


def _fmt_duration(ms: int) -> str:
    try:
        ms = int(ms or 0)
    except Exception:
        ms = 0
    sec = max(0, ms // 1000)
    m = sec // 60
    s = sec % 60
    if m <= 0:
        return f"{s}с"
    return f"{m}м {s:02d}с"


def _build_teacher_report_text(*, student_username: str, dictation_title: str, dictation_level: str, date_iso: str,
                              completion_count_value, error_words, report_header_mode: str = 'success') -> str:
    medals_inline = ''
    if completion_count_value is not None:
        medals_inline = f"  🥇 {completion_count_value}"

    mode = str(report_header_mode or 'success').strip().lower()
    if mode == 'interim':
        first_line = f"📊 {_safe_html(student_username)}, промежуточные результаты"
    else:
        first_line = f"✅ {_safe_html(student_username)}, успешно выполненный диктант"

    text = (
        f"{first_line}\n"
        f"{_safe_html(dictation_title)} (уровень {_safe_html(dictation_level)}){medals_inline}\n"
        f"{date_iso}"
    )
    return text


def _fmt_user_local_dt(ts_ms, tz_offset_min) -> str:
    try:
        ts_ms = int(ts_ms or 0)
    except Exception:
        ts_ms = 0
    try:
        tz_offset_min = int(tz_offset_min or 0)
    except Exception:
        tz_offset_min = 0

    if ts_ms <= 0:
        return ''

    try:
        dt_utc = datetime.utcfromtimestamp(ts_ms / 1000.0)
        dt_local = dt_utc + timedelta(minutes=tz_offset_min)
        return dt_local.strftime('%Y-%m-%d %H:%M')
    except Exception:
        return ''


def _build_teacher_report_text_full(*, student_username: str, dictation_title: str, dictation_level: str,
                                   completed_at_ms, completed_at_tz_offset_min, time_ms,
                                   completion_count_value, perfect_count, corrected_count, audio_count,
                                   attempts_total, error_count, sentences_data, dictation_int, dictation_lang,
                                   settings_json, error_words, report_header_mode: str = 'success',
                                   total_chars=None, money_earned=None,
                                   date_start_iso=None,
                                   selected_sentence_positions=None) -> str:
    """
    Собирает текст отчёта для отправки в Telegram.
    Формат:

    ✅ Успешно закончен (или 📊 Промежуточный результат) [дата начала - ]дата и время окончания
    Имя Юзера
    1.2 Irregular verbs (phrases) (уровень A1)  🥇 4
    (id: 33)
    Схема аудио: oto

    Длительность: 66:11
    $: 273
    🪲: 65 / 2918 (2.2%)

    ⭐ - 50
    ½⭐ - 28
    о - 13
    🎤 - 50
    """
    def _int_or_0(x):
        try:
            return int(x or 0)
        except Exception:
            return 0

    # Дата и время завершения
    success_date_iso = datetime.now().date().isoformat()
    when_local = _fmt_user_local_dt(completed_at_ms, completed_at_tz_offset_min)
    date_end_str = when_local or success_date_iso

    # Дата начала (если отличается от даты окончания)
    date_start_str = ''
    if date_start_iso:
        try:
            ds = str(date_start_iso).strip()
            if ds and ds[:10] != date_end_str[:10]:
                date_start_str = ds[:10] + ' - '
        except Exception:
            date_start_str = ''

    # Заголовок
    mode = str(report_header_mode or 'success').strip().lower()
    if mode == 'interim':
        header_label = "📊 Промежуточный результат"
    else:
        header_label = "✅ Успешно закончен"

    lines = [f"{header_label} {date_start_str}{date_end_str}"]

    # Имя пользователя
    lines.append(_safe_html(student_username))

    # Название диктанта + уровень + медаль
    medals_inline = ''
    if completion_count_value is not None:
        medals_inline = f"  🥇 {completion_count_value}"
    title_line = f"{_safe_html(dictation_title)} (уровень {_safe_html(dictation_level)}){medals_inline}"
    lines.append(title_line)

    # id диктанта
    lines.append(f"(id: {_int_or_0(dictation_int)})")

    # Выбранные позиции предложений (если не весь диктант)
    positions_label = ''
    if selected_sentence_positions is not None:
        try:
            if isinstance(selected_sentence_positions, str):
                positions_label = selected_sentence_positions.strip()
            elif isinstance(selected_sentence_positions, (list, tuple)):
                uniq = sorted(set(int(x) for x in selected_sentence_positions if x is not None))
                if uniq:
                    ranges = []
                    start = uniq[0]
                    prev = uniq[0]
                    for i in range(1, len(uniq)):
                        cur = uniq[i]
                        if cur == prev + 1:
                            prev = cur
                            continue
                        ranges.append(str(start) if start == prev else f"{start}-{prev}")
                        start = cur
                        prev = cur
                    ranges.append(str(start) if start == prev else f"{start}-{prev}")
                    positions_label = '(' + ', '.join(ranges) + ')'
        except Exception:
            positions_label = ''
    if positions_label:
        lines.append(positions_label)

    # Схема аудио
    audio_scheme_line = ''
    try:
        sj = settings_json
        if isinstance(sj, str) and sj.strip():
            sj_obj = json.loads(sj)
        elif isinstance(sj, dict):
            sj_obj = sj
        else:
            sj_obj = None
        if isinstance(sj_obj, dict):
            audio_cfg = sj_obj.get('audio') if isinstance(sj_obj.get('audio'), dict) else {}
            start = str(audio_cfg.get('start') or '').strip()
            if start:
                audio_scheme_line = f"Схема аудио: {start}"
    except Exception:
        audio_scheme_line = ''

    if audio_scheme_line:
        lines.append(audio_scheme_line)

    # Пустая строка
    lines.append('')

    # Длительность
    lines.append(f"Длительность: {_fmt_duration(time_ms)}")

    # Деньги (заработанные за диктант)
    me = _int_or_0(money_earned) if money_earned is not None else 0
    lines.append(f"$: {me}")

    # Ошибки / всего символов + точность в %
    err_count = _int_or_0(error_count)
    ch_count = _int_or_0(total_chars) if total_chars is not None else 0
    if ch_count > 0:
        accuracy_pct = round((1 - err_count / ch_count) * 100, 1) if ch_count > 0 else 0
        lines.append(f"🪲: {err_count} / {ch_count} ({accuracy_pct}%)")
    else:
        lines.append(f"🪲: {err_count}")

    # Пустая строка перед звёздами
    lines.append('')

    # ⭐ - perfect
    lines.append(f"⭐ - {_int_or_0(perfect_count)}")
    # ½⭐ - corrected
    lines.append(f"½⭐ - {_int_or_0(corrected_count)}")
    # о - текстовая активность (text_activity_count из sentences_data)
    text_activity_total = 0
    if isinstance(sentences_data, list):
        for sd in sentences_data:
            text_activity_total += _int_or_0(sd.get('text_activity_count'))
    lines.append(f"о - {text_activity_total}")
    # 🎤 - аудио (number_of_audio)
    lines.append(f"🎤 - {_int_or_0(audio_count)}")

    return '\n'.join(lines)


@statistics_bp.route('/teacher_report/recipients', methods=['POST'])
@jwt_required()
def teacher_report_recipients():
    """Return eligible teacher recipients for manual report and whether auto-report would fire today."""
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    if not is_telegram_enabled():
        return jsonify({'success': True, 'auto_would_send': False, 'teachers': []})

    data = request.get_json(silent=True) or {}
    dictation_id_raw = data.get('dictation_id')
    try:
        dictation_int = int(str(dictation_id_raw).replace('dict_', ''))
    except Exception:
        return jsonify({'success': False, 'error': 'Некорректный dictation_id'}), 400

    dictation_lang = None
    try:
        if callable(get_dictation_by_id):
            info = get_dictation_by_id(dictation_int) or {}
            dictation_lang = (info.get('language_code') or '').strip().lower()
    except Exception:
        dictation_lang = None

    if not dictation_lang:
        return jsonify({'success': True, 'auto_would_send': False, 'teachers': []})

    today_iso = _today_iso_local()
    auto_chat_ids = []
    try:
        auto_chat_ids = list_teacher_chat_ids_for_student_success(
            student_user_id=int(user.get('id')),
            dictation_id=int(dictation_int),
            success_date_iso=today_iso,
        )
    except Exception:
        auto_chat_ids = []

    teachers = []
    try:
        rec = list_teacher_recipients_for_student_manual_report(
            int(user.get('id')),
            dictation_language_code=dictation_lang,
        )
        for r in rec:
            try:
                teachers.append(
                    {
                        'teacher_user_id': int(r.get('teacher_user_id')),
                        'teacher_username': r.get('teacher_username') or '',
                    }
                )
            except Exception:
                continue
    except Exception:
        teachers = []

    return jsonify({'success': True, 'auto_would_send': bool(auto_chat_ids), 'teachers': teachers})


@statistics_bp.route('/teacher_report/send', methods=['POST'])
@jwt_required()
def teacher_report_send():
    """Send Telegram report after dictation completion to selected recipients (self + teachers).

    Поведение:
    - Если teacher_user_ids передан и не пустой — фильтруем по переданным ID.
    - Если teacher_user_ids пустой — автоматически определяем всех учителей
      (как в test_send для промежуточного отчёта).
    - Отправляем себе, если send_to_self=True и telegram_self_reports_enabled=True.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    if not is_telegram_enabled():
        return jsonify({'success': False, 'error': 'Telegram disabled'}), 400

    data = request.get_json(silent=True) or {}
    dictation_id_raw = data.get('dictation_id')
    teacher_user_ids = data.get('teacher_user_ids') or []
    send_to_self = bool(data.get('send_to_self'))

    report_header_mode = None
    try:
        report_header_mode = str(data.get('report_header_mode') or '').strip().lower() or None
    except Exception:
        report_header_mode = None

    try:
        dictation_int = int(str(dictation_id_raw).replace('dict_', ''))
    except Exception:
        return jsonify({'success': False, 'error': 'Некорректный dictation_id'}), 400

    dictation_lang = None
    try:
        if callable(get_dictation_by_id):
            info = get_dictation_by_id(dictation_int) or {}
            dictation_lang = (info.get('language_code') or '').strip().lower()
    except Exception:
        dictation_lang = None

    if not dictation_lang:
        return jsonify({'success': False, 'error': 'Не удалось определить язык диктанта'}), 400

    try:
        print(
            f"📨 [TELEGRAM][SEND] student_user_id={user.get('id')} dictation_id={dictation_int} "
            f"dictation_lang={dictation_lang!r} teacher_user_ids={teacher_user_ids} send_to_self={send_to_self}"
        )
    except Exception:
        pass

    # Определяем chat_ids учителей:
    # Если teacher_user_ids передан и не пустой — фильтруем по переданным ID.
    # Если teacher_user_ids пустой — автоматически определяем всех учителей.
    chat_ids = []
    try:
        teacher_ids_norm = [x for x in teacher_user_ids if x is not None]
        if teacher_ids_norm:
            # Фильтруем по переданным ID (старое поведение)
            chat_ids = filter_manual_teacher_chat_ids(
                int(user.get('id')),
                teacher_ids_norm,
                dictation_language_code=dictation_lang,
            )
        else:
            # Автоматически определяем всех учителей (как в test_send)
            teachers = list_teacher_recipients_for_student_manual_report(
                int(user.get('id')),
                dictation_language_code=dictation_lang,
            )
            for teacher in teachers:
                try:
                    cid = teacher.get('telegram_chat_id')
                    if cid is not None:
                        chat_ids.append(int(cid))
                except Exception:
                    continue
    except Exception:
        chat_ids = []

    try:
        print(f"📨 [TELEGRAM][SEND] filtered_teacher_chat_ids={chat_ids}")
    except Exception:
        pass

    # self chat — отправляем себе только если включены self_reports
    self_chat_id = None
    try:
        self_reports_enabled = bool(user.get('telegram_self_reports_enabled'))
        if send_to_self and self_reports_enabled and user.get('telegram_chat_id'):
            self_chat_id = int(user.get('telegram_chat_id'))
    except Exception:
        self_chat_id = None

    # Логируем полный список получателей
    try:
        recipient_log = []
        if self_chat_id is not None:
            recipient_log.append(f"self(chat_id={self_chat_id})")
        for cid in chat_ids:
            recipient_log.append(f"teacher(chat_id={cid})")
        print(f"📨 [TELEGRAM][SEND] recipients_list=[{', '.join(recipient_log)}]")
    except Exception:
        pass

    if not chat_ids and self_chat_id is None:
        try:
            print("📨 [TELEGRAM][SEND] no recipients -> skip")
        except Exception:
            pass
        return jsonify({'success': True, 'sent': 0, 'recipients': 0})

    try:
        completion_count_after = data.get('completion_count_after')
        completion_count_value = int(completion_count_after) if completion_count_after is not None else None
    except Exception:
        completion_count_value = None
    if completion_count_value is None:
        try:
            # Используем history_current (быстрая таблица-кэш) с учётом selected_sentence_positions
            selected_sentence_positions = data.get('selected_sentence_positions')
            completion_count_value = get_history_current(
                int(user.get('id')), int(dictation_int), selected_sentence_positions
            )
        except Exception:
            completion_count_value = None

    try:
        info = get_student_and_dictation_info(int(user.get('id')), int(dictation_int))
        student_username = info.get('student_username') or 'Ученик'
        dictation_title = info.get('dictation_title') or f'Диктант {dictation_int}'
        dictation_level = info.get('dictation_level') or '—'
    except Exception:
        student_username = user.get('username') or 'Ученик'
        dictation_title = f'Диктант {dictation_int}'
        dictation_level = '—'

    want_full = bool(data.get('sentences_data')) or data.get('time_ms') is not None
    if want_full:
        mistake_count = data.get('mistake_count')
        if mistake_count is None:
            mistake_count = data.get('error_count')
        text = _build_teacher_report_text_full(
            student_username=student_username,
            dictation_title=dictation_title,
            dictation_level=dictation_level,
            completed_at_ms=data.get('completed_at_ms'),
            completed_at_tz_offset_min=data.get('completed_at_tz_offset_min'),
            time_ms=data.get('time_ms') or 0,
            completion_count_value=completion_count_value,
            perfect_count=data.get('perfect_count') or 0,
            corrected_count=data.get('corrected_count') or 0,
            audio_count=data.get('audio_count') or 0,
            attempts_total=data.get('attempts_total') or 0,
            error_count=mistake_count or 0,
            sentences_data=data.get('sentences_data') or [],
            dictation_int=int(dictation_int),
            dictation_lang=str(dictation_lang),
            settings_json=data.get('settings_json'),
            error_words=data.get('error_words'),
            report_header_mode=report_header_mode or 'success',
            total_chars=data.get('total_chars'),
            money_earned=data.get('money_earned'),
            date_start_iso=data.get('date_start_iso'),
            selected_sentence_positions=data.get('selected_sentence_positions'),
        )
    else:
        today_iso = _today_iso_local()
        text = _build_teacher_report_text(
            student_username=student_username,
            dictation_title=dictation_title,
            dictation_level=dictation_level,
            date_iso=today_iso,
            completion_count_value=completion_count_value,
            error_words=data.get('error_words'),
            report_header_mode=report_header_mode or 'success',
        )

    sent = 0
    for cid in chat_ids:
        try:
            send_telegram_message(int(cid), text)
            sent += 1
        except Exception:
            continue

    if self_chat_id is not None:
        try:
            send_telegram_message(int(self_chat_id), text)
            sent += 1
        except Exception as e:
            try:
                print(f"📨 [TELEGRAM][SEND] self send failed chat_id={self_chat_id}: {e}")
            except Exception:
                pass
            pass

    return jsonify({'success': True, 'sent': sent, 'recipients': len(chat_ids) + (1 if self_chat_id is not None else 0)})


@statistics_bp.route('/teacher_report/recipients_auto', methods=['POST'])
@jwt_required()
def teacher_report_recipients_auto():
    """Return recipients for auto Telegram report after dictation completion.

    Includes:
    - self (student) if user has telegram enabled
    - teachers that are eligible for notifications from this student (group_students.notify_teacher_on_success)
      and match dictation language.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    if not is_telegram_enabled():
        return jsonify({'success': True, 'recipients': []})

    data = request.get_json(silent=True) or {}
    dictation_id_raw = data.get('dictation_id')
    try:
        dictation_int = int(str(dictation_id_raw).replace('dict_', ''))
    except Exception:
        return jsonify({'success': False, 'error': 'Некорректный dictation_id'}), 400

    dictation_lang = None
    try:
        if callable(get_dictation_by_id):
            info = get_dictation_by_id(dictation_int) or {}
            dictation_lang = (info.get('language_code') or '').strip().lower()
    except Exception:
        dictation_lang = None

    recipients = []

    try:
        print(
            f"📨 [TELEGRAM][RECIPIENTS_AUTO] student_user_id={user.get('id')} "
            f"dictation_id={dictation_int} dictation_lang={dictation_lang!r}"
        )
    except Exception:
        pass

    # self
    try:
        if user.get('telegram_chat_id'):
            recipients.append({'type': 'self', 'label': 'Я'})
    except Exception:
        pass

    # teachers
    try:
        if dictation_lang:
            teachers = list_teacher_recipients_for_student_manual_report(
                int(user.get('id')),
                dictation_language_code=dictation_lang,
            )

            try:
                print(
                    f"📨 [TELEGRAM][RECIPIENTS_AUTO] eligible_teachers={len(teachers) if teachers else 0}"
                )
            except Exception:
                pass

            for t in teachers:
                try:
                    recipients.append(
                        {
                            'type': 'teacher',
                            'teacher_user_id': int(t.get('teacher_user_id')),
                            'teacher_username': t.get('teacher_username') or '',
                            'label': (t.get('teacher_username') or '').strip() or f"Учитель #{int(t.get('teacher_user_id'))}",
                        }
                    )
                except Exception:
                    continue
    except Exception:
        pass

    try:
        print(f"📨 [TELEGRAM][RECIPIENTS_AUTO] recipients_total={len(recipients)}")
    except Exception:
        pass

    return jsonify({'success': True, 'recipients': recipients})


@statistics_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    """Получить историю активности пользователя"""
    try:
        current_email = get_jwt_identity()
        user_folder = get_user_folder(current_email)
        history_folder = os.path.join(user_folder, 'history')
        
        if not os.path.exists(history_folder):
            os.makedirs(history_folder, exist_ok=True)
            return jsonify({'history': []})
        
        # Читаем все файлы истории
        history_files = [f for f in os.listdir(history_folder) if f.startswith('h_') and f.endswith('.json')]
        history = []
        
        for filename in history_files:
            file_path = os.path.join(history_folder, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Извлекаем месяц из имени файла (h_202511.json -> 202511)
                    month = filename.replace('h_', '').replace('.json', '')
                    history.append({
                        'month': month,
                        'data': data
                    })
            except Exception as e:
                print(f'Ошибка чтения файла {filename}: {e}')
                continue
        
        return jsonify({'history': history})
        
    except Exception as e:
        print(f'Ошибка получения истории: {e}')
        return jsonify({'error': 'Ошибка получения истории'}), 500


@statistics_bp.route('/history/save', methods=['POST'])
@jwt_required()
def save_history():
    """
    Сохранить статистику активности
    
    ВАЖНО: Сохранение в JSON файл h_YYYYMM.json отключено.
    Все данные теперь сохраняются в таблицу history_by_day в БД.
    Этот endpoint оставлен для обратной совместимости, но не выполняет сохранение в файл.
    """
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        print(f'📊 [SAVE_HISTORY] Запрос сохранения истории (отключено - используется БД)')
        print(f'📊 [SAVE_HISTORY] Полученные данные: {data}')
        
        # Сохранение в JSON файл отключено - все данные сохраняются в БД через /api/statistics/activity
        # Обновляем только streak пользователя
        update_user_streak(current_email)
        
        return jsonify({'success': True, 'message': 'Сохранение в JSON отключено, используется БД'})
    except Exception as e:
        import traceback
        print(f'❌ [SAVE_HISTORY] Ошибка сохранения истории: {e}')
        print(f'❌ [SAVE_HISTORY] Трассировка: {traceback.format_exc()}')
        return jsonify({'error': 'Ошибка сохранения истории'}), 500


@statistics_bp.route('/history/report', methods=['POST'])
@jwt_required()
def get_history_report():
    """Получить данные для отчета за период"""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        start_date = data.get('start_date')  # YYYYMMDD
        end_date = data.get('end_date')  # YYYYMMDD
        
        if not start_date or not end_date:
            return jsonify({'error': 'Не указаны даты периода'}), 400
        
        user_folder = get_user_folder(current_email)
        history_folder = os.path.join(user_folder, 'history')
        
        if not os.path.exists(history_folder):
            return jsonify({'statistics': []})
        
        # Определяем месяцы для поиска
        start_year = int(start_date[:4])
        start_month = int(start_date[4:6])
        end_year = int(end_date[:4])
        end_month = int(end_date[4:6])
        
        result_statistics = []
        
        # Читаем файлы за нужные месяцы
        for year in range(start_year, end_year + 1):
            month_start = start_month if year == start_year else 1
            month_end = end_month if year == end_year else 12
            
            for month in range(month_start, month_end + 1):
                month_str = f'{year}{month:02d}'
                filename = f'h_{month_str}.json'
                file_path = os.path.join(history_folder, filename)
                
                if os.path.exists(file_path):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            month_data = json.load(f)
                            statistics = month_data.get('statistics', [])
                            
                            # Фильтруем по датам
                            for stat in statistics:
                                stat_date = stat.get('date', 0)
                                if start_date <= stat_date <= end_date:
                                    result_statistics.append(stat)
                    except Exception as e:
                        print(f'Ошибка чтения файла {filename}: {e}')
                        continue
        
        # Сортируем по дате
        result_statistics.sort(key=lambda x: x.get('date', 0))
        
        return jsonify({'statistics': result_statistics})
        
    except Exception as e:
        print(f'Ошибка получения отчета: {e}')
        return jsonify({'error': 'Ошибка получения отчета'}), 500


def update_user_streak(email):
    """Обновляет streak пользователя на основе истории активности"""
    try:
        # Получаем пользователя из БД
        user = get_user_by_email(email)
        if not user:
            return
        
        user_folder = get_user_folder(email)
        history_folder = os.path.join(user_folder, 'history')
        
        if not os.path.exists(history_folder):
            return
        
        # Получаем все даты с активностью
        active_dates = set()
        history_files = [f for f in os.listdir(history_folder) if f.startswith('h_') and f.endswith('.json')]
        
        for filename in history_files:
            file_path = os.path.join(history_folder, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    month_data = json.load(f)
                    statistics = month_data.get('statistics', [])
                    for stat in statistics:
                        date_key = stat.get('date', 0)
                        if date_key > 0:
                            active_dates.add(date_key)
            except Exception as e:
                print(f'Ошибка чтения файла {filename} для streak: {e}')
                continue
        
        if not active_dates:
            # Обновляем streak в БД
            update_user(email, {'streak_days': 0})
            return
        
        # Сортируем даты
        sorted_dates = sorted(active_dates, reverse=True)
        
        # Подсчитываем streak (последовательные дни с активностью)
        streak = 0
        today = datetime.now().date()
        current_date = today
        
        # Проверяем, есть ли активность сегодня
        today_key = int(today.strftime('%Y%m%d'))
        if today_key not in active_dates:
            # Если сегодня нет активности, начинаем с вчера
            current_date = today - timedelta(days=1)
        
        # Подсчитываем последовательные дни
        while True:
            date_key = int(current_date.strftime('%Y%m%d'))
            if date_key in active_dates:
                streak += 1
                current_date = current_date - timedelta(days=1)
            else:
                break
        
        # Обновляем streak пользователя в БД
        update_user(email, {'streak_days': streak})
        
    except Exception as e:
        print(f'Ошибка обновления streak: {e}')





# ==============================================================
# API для работы с историей активности (новая система на БД)
# ==============================================================

@statistics_bp.route('/activity', methods=['POST'])
@jwt_required()
def save_activity():
    """Сохранить активность пользователя в history_by_day.

    Поддерживает:
    - legacy: {type_activity, number, lead_time_ms}
    - bulk: {perfect_count, corrected_count, audio_count, money_count, mistake_count, monenumber_of_characters, lead_time_ms}
    """
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        # Временные логи для отладки
        print(f'📥 [SAVE_ACTIVITY] Получен запрос на сохранение активности')
        print(f'   email: {current_email}')
        print(f'   данные: {data}')
        
        dictation_id = data.get('dictation_id')  # может быть dict_<id> или integer
        type_activity = data.get('type_activity')  # 'perfect', 'corrected' или 'audio' (legacy)
        number = data.get('number', 1)  # legacy
        lead_time_ms = data.get('lead_time_ms')
        activity_date = data.get('date')  # опционально: YYYY-MM-DD
        dictation_language_code = data.get('dictation_language_code')
        selected_sentence_positions = data.get('selected_sentence_positions')
        date_start = data.get('date_start')  # опционально: YYYY-MM-DD HH:MM:SS (идентификатор сессии)

        perfect_count = data.get('perfect_count')
        corrected_count = data.get('corrected_count')
        audio_count = data.get('audio_count')
        activity_count = data.get('activity_count')
        money_count = data.get('money_count')
        mistake_count = data.get('mistake_count')
        monenumber_of_characters = data.get('monenumber_of_characters')
        
        if not dictation_id:
            print(f'❌ [SAVE_ACTIVITY] Ошибка: не указан dictation_id')
            return jsonify({'error': 'Не указан dictation_id'}), 400

        is_bulk = (
            (perfect_count is not None)
            or (corrected_count is not None)
            or (audio_count is not None)
            or (activity_count is not None)
            or (money_count is not None)
            or (mistake_count is not None)
            or (monenumber_of_characters is not None)
        )

        if not is_bulk:
            if not type_activity:
                print(f'❌ [SAVE_ACTIVITY] Ошибка: не указан type_activity')
                return jsonify({'error': 'Не указан type_activity'}), 400
            if type_activity not in ['perfect', 'corrected', 'audio']:
                print(f'❌ [SAVE_ACTIVITY] Ошибка: неверный type_activity: {type_activity}')
                return jsonify({'error': f'Неверный type_activity: {type_activity}. Допустимые: perfect, corrected, audio'}), 400
        
        # Получаем user_id из БД по email
        user = get_user_by_email(current_email)
        if not user:
            print(f'❌ [SAVE_ACTIVITY] Пользователь не найден: {current_email}')
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = user['id']
        print(f'✅ [SAVE_ACTIVITY] Найден user_id: {user_id} для email: {current_email}')
        
        # Сохраняем активность в БД (агрегируется по дням; для "План‑Факт" ключ включает selected_sentence_positions)
        if is_bulk:
            from helpers.db_history import add_activity_bulk
            activity = add_activity_bulk(
                user_id,
                dictation_id,
                perfect_count=perfect_count or 0,
                corrected_count=corrected_count or 0,
                audio_count=audio_count or 0,
                activity_count=activity_count or 0,
                money_count=money_count or 0,
                mistake_count=mistake_count or 0,
                monenumber_of_characters=monenumber_of_characters or 0,
                lead_time_ms=lead_time_ms or 0,
                date_override=activity_date,
                dictation_language_code=dictation_language_code,
                selected_sentence_positions=selected_sentence_positions,
                date_start=date_start,
            )
        else:
            activity = add_activity(
                user_id,
                dictation_id,
                type_activity,
                number,
                activity_date,
                dictation_language_code,
                selected_sentence_positions,
                lead_time_ms,
            )
        
        print(f'✅ [SAVE_ACTIVITY] Активность успешно сохранена в БД')
        
        return jsonify({
            'success': True,
            'activity': activity
        })
        
    except ValueError as e:
        print(f'❌ [SAVE_ACTIVITY] ValueError: {e}')
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'❌ [SAVE_ACTIVITY] Ошибка сохранения активности: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка сохранения активности'}), 500


@statistics_bp.route('/activity/report', methods=['POST'])
@jwt_required()
def api_activity_report():
    """Вернуть активность из history_by_day за период (для отчёта "Статистика занятий")."""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        data = request.get_json() or {}
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        group_by = str(data.get('group_by') or 'days').lower()
        requested_user_id = data.get('user_id')
        language_code = data.get('language_code')

        if not start_date or not end_date:
            return jsonify({"success": False, "error": "Missing start_date/end_date"}), 400

        if group_by not in ('days', 'weeks', 'months'):
            group_by = 'days'

        current_user_id = int(user.get('id'))
        target_user_id = current_user_id
        if requested_user_id is not None:
            try:
                target_user_id = int(requested_user_id)
            except Exception:
                return jsonify({"success": False, "error": "Invalid user_id"}), 400

        if target_user_id != current_user_id:
            if not _can_teacher_view_student_activity(
                teacher_user_id=current_user_id,
                student_user_id=target_user_id,
            ):
                return jsonify({"success": False, "error": "Forbidden"}), 403

        rows = get_activity_totals_by_period(target_user_id, start_date, end_date, language_code=language_code)
        grouped = _group_activity_rows(rows, group_by)
        return jsonify({"success": True, "stats": grouped})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/activity/tracker', methods=['POST'])
@jwt_required()
def api_activity_tracker():
    """Годовой трекер активности: lead_time (ms) по датам + доступный диапазон лет."""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        data = request.get_json(silent=True) or {}
        requested_user_id = data.get('user_id')
        language_code = data.get('language_code')
        year_raw = data.get('year')

        current_user_id = int(user.get('id'))
        target_user_id = current_user_id
        if requested_user_id is not None and str(requested_user_id).strip() != "":
            try:
                target_user_id = int(requested_user_id)
            except Exception:
                return jsonify({"success": False, "error": "Invalid user_id"}), 400

        if target_user_id != current_user_id:
            if not _can_teacher_view_student_activity(
                teacher_user_id=current_user_id,
                student_user_id=target_user_id,
            ):
                return jsonify({"success": False, "error": "Forbidden"}), 403

        language_code_norm = None
        try:
            lc = str(language_code or '').strip().lower()
            if lc and lc not in ('all', '*'):
                language_code_norm = lc
        except Exception:
            language_code_norm = None

        min_year, max_year = get_activity_lead_time_year_bounds(target_user_id, language_code=language_code_norm)
        if min_year is None or max_year is None:
            # данных нет
            now_year = datetime.now().year
            return jsonify({
                "success": True,
                "min_year": None,
                "max_year": None,
                "year": int(year_raw) if year_raw is not None and str(year_raw).strip().isdigit() else now_year,
                "days": [],
            })

        try:
            year = int(year_raw) if year_raw is not None else int(max_year)
        except Exception:
            year = int(max_year)
        if year < int(min_year):
            year = int(min_year)
        if year > int(max_year):
            year = int(max_year)

        start_date = datetime(year, 1, 1).date()
        end_date = datetime(year, 12, 31).date()
        days = get_activity_lead_time_by_day_range(target_user_id, start_date, end_date, language_code=language_code_norm)
        return jsonify({
            "success": True,
            "min_year": int(min_year),
            "max_year": int(max_year),
            "year": int(year),
            "days": days,
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/planfact', methods=['POST'])
@jwt_required()
def api_planfact_report():
    """Отчет План‑Факт: план из assignments + факт из history_by_day."""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        data = request.get_json(silent=True) or {}
        start_date_raw = data.get('start_date')
        end_date_raw = data.get('end_date')
        requested_user_id = data.get('user_id')
        language_code = data.get('language_code')

        if not start_date_raw or not end_date_raw:
            return jsonify({"success": False, "error": "Missing start_date/end_date"}), 400

        try:
            start_date = datetime.fromisoformat(str(start_date_raw)).date()
            end_date = datetime.fromisoformat(str(end_date_raw)).date()
        except Exception:
            return jsonify({"success": False, "error": "Invalid start_date/end_date"}), 400

        if start_date > end_date:
            end_date = start_date

        language_code_norm = None
        try:
            lc = str(language_code or '').strip().lower()
            if lc and lc != 'all':
                language_code_norm = lc
        except Exception:
            language_code_norm = None

        def _positions_to_key(raw_pos):
            try:
                if raw_pos is None:
                    return ''
                arr_src = raw_pos
                if isinstance(arr_src, str):
                    try:
                        arr_src = json.loads(arr_src)
                    except Exception:
                        arr_src = []
                arr = list(arr_src or [])
                if not arr:
                    return ''
                return json.dumps(sorted([int(x) for x in arr]), ensure_ascii=False, separators=(',', ':'))
            except Exception:
                return ''

        current_user_id = int(user.get('id'))
        target_user_id = current_user_id
        if requested_user_id is not None and str(requested_user_id).strip() != "":
            try:
                target_user_id = int(requested_user_id)
            except Exception:
                target_user_id = current_user_id

        # Разрешенные пользователи: self + активные ученики, давшие доступ.
        allowed_ids = {current_user_id}
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT u.id AS user_id
                    FROM group_students gs
                    JOIN users u ON u.id = gs.student_user_id
                    JOIN groups g ON g.id = gs.group_id
                    WHERE g.teacher_id = %s
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                      AND COALESCE(gs.notify_teacher_on_success, TRUE) = TRUE
                    """,
                    (current_user_id,),
                )
                for r in (cur.fetchall() or []):
                    try:
                        uid = int(r.get('user_id') if isinstance(r, dict) else r[0])
                        allowed_ids.add(uid)
                    except Exception:
                        continue

                if target_user_id not in allowed_ids:
                    return jsonify({"success": False, "error": "Forbidden"}), 403

                # 1) План: assignments_by_date в диапазоне.
                cur.execute(
                    """
                    SELECT
                        abd.day_date,
                        abd.required_completions,
                        a.id AS assignment_id,
                        a.group_id,
                        a.dictation_id,
                        a.created_by_teacher_user_id,
                        a.selected_sentence_positions,
                        g.title AS group_title,
                        d.title AS dictation_title,
                        d.language_code AS dictation_language_code,
                        d.level AS dictation_level,
                        d.sentences_count AS dictation_sentences_count,
                        u.username AS teacher_username
                    FROM assignments_by_date abd
                    JOIN assignments a ON a.id = abd.assignment_id
                    JOIN groups g ON g.id = a.group_id
                    JOIN dictations d ON d.id = a.dictation_id
                    JOIN group_students gs ON gs.group_id = a.group_id
                    LEFT JOIN users u ON u.id = a.created_by_teacher_user_id
                    WHERE gs.student_user_id = %s
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                      AND g.archived_at IS NULL
                      AND abd.day_date >= %s
                      AND abd.day_date <= %s
                      AND (%s IS NULL OR LOWER(COALESCE(d.language_code, '')) = %s)
                    ORDER BY abd.day_date ASC, a.id ASC
                    """,
                    (target_user_id, start_date, end_date, language_code_norm, language_code_norm),
                )
                plan_rows = cur.fetchall() or []

                # 2) Факт (successes): количество завершений по дню/диктанту/позициям из history_by_day.
                successes = {}
                cur.execute(
                    """
                    SELECT
                        hbd.dictation_id,
                        hbd.date_fact AS d,
                        hbd.positions,
                        COALESCE(SUM(hbd.successes), 0)::int AS cnt
                    FROM history_by_day hbd
                    LEFT JOIN dictations d ON d.id = hbd.dictation_id
                    WHERE hbd.user_id = %s
                      AND hbd.date_fact >= %s
                      AND hbd.date_fact <= %s
                      AND (%s IS NULL OR LOWER(COALESCE(d.language_code, '')) = %s)
                    GROUP BY hbd.dictation_id, hbd.date_fact, hbd.positions
                    """,
                    (target_user_id, start_date, end_date, language_code_norm, language_code_norm),
                )
                for rr in (cur.fetchall() or []):
                    try:
                        did = int(rr.get('dictation_id') if isinstance(rr, dict) else rr[0])
                        day = rr.get('d') if isinstance(rr, dict) else rr[1]
                        raw_pos = rr.get('positions') if isinstance(rr, dict) else rr[2]
                        cnt = int(rr.get('cnt') if isinstance(rr, dict) else rr[3])

                        pos_key = _positions_to_key(raw_pos)
                        k = (did, day.isoformat() if hasattr(day, 'isoformat') else str(day), pos_key)
                        successes[k] = cnt
                    except Exception:
                        continue

                # 3) Факт (activity): счетчики по дню/диктанту/позициям из history_by_day.
                activities = {}
                cur.execute(
                    """
                    SELECT
                        hbd.date_fact AS date,
                        hbd.dictation_id,
                        hbd.positions,
                        COALESCE(SUM(hbd.perfect_count), 0) AS perfect,
                        COALESCE(SUM(hbd.corrected_count), 0) AS corrected,
                        COALESCE(SUM(hbd.audio_count), 0) AS audio
                    FROM history_by_day hbd
                    LEFT JOIN dictations d ON d.id = hbd.dictation_id
                    WHERE hbd.user_id = %s
                      AND hbd.date_fact >= %s
                      AND hbd.date_fact <= %s
                      AND (%s IS NULL OR LOWER(COALESCE(d.language_code, '')) = %s)
                    GROUP BY hbd.date_fact, hbd.dictation_id, hbd.positions
                    ORDER BY hbd.date_fact ASC, hbd.dictation_id ASC
                    """,
                    (target_user_id, start_date, end_date, language_code_norm, language_code_norm),
                )
                for ar in (cur.fetchall() or []):
                    try:
                        if isinstance(ar, dict):
                            day = ar.get('date')
                            did = int(ar.get('dictation_id') or 0)
                            raw_pos = ar.get('positions')
                            pos_key = _positions_to_key(raw_pos)
                            activities[(did, day.isoformat() if hasattr(day, 'isoformat') else str(day), pos_key)] = {
                                'perfect': int(ar.get('perfect') or 0),
                                'corrected': int(ar.get('corrected') or 0),
                                'audio': int(ar.get('audio') or 0),
                            }
                        else:
                            day = ar[0]
                            did = int(ar[1] or 0)
                            raw_pos = ar[2]
                            pos_key = _positions_to_key(raw_pos)
                            activities[(did, day.isoformat() if hasattr(day, 'isoformat') else str(day), pos_key)] = {
                                'perfect': int(ar[3] or 0),
                                'corrected': int(ar[4] or 0),
                                'audio': int(ar[5] or 0),
                            }
                    except Exception:
                        continue

        finally:
            conn.close()

        # Собираем по дням
        days = {}
        for r in plan_rows:
            try:
                if isinstance(r, dict):
                    day = r.get('day_date')
                    day_iso = day.isoformat() if hasattr(day, 'isoformat') else str(day)
                    did = int(r.get('dictation_id') or 0)
                    raw_pos = r.get('selected_sentence_positions')
                    pos_key = _positions_to_key(raw_pos)
                    req = int(r.get('required_completions') or 1)
                    done = int(successes.get((did, day_iso, pos_key), 0) or 0)
                    act = activities.get((did, day_iso, pos_key)) or {'perfect': 0, 'corrected': 0, 'audio': 0}
                    item = {
                        'assignment_id': int(r.get('assignment_id') or 0),
                        'group_id': int(r.get('group_id') or 0),
                        'group_title': str(r.get('group_title') or ''),
                        'dictation_id': did,
                        'dictation_title': str(r.get('dictation_title') or ''),
                        'dictation_language_code': str(r.get('dictation_language_code') or ''),
                        'dictation_level': r.get('dictation_level'),
                        'dictation_sentences_count': int(r.get('dictation_sentences_count') or 0),
                        'selected_sentence_positions': list(raw_pos or []) if raw_pos is not None else None,
                        'required_completions': req,
                        'done': done,
                        'completed': bool(done >= req and req > 0),
                        'activity': {
                            'perfect': int(act.get('perfect') or 0),
                            'corrected': int(act.get('corrected') or 0),
                            'audio': int(act.get('audio') or 0),
                        },
                        'teacher_username': str(r.get('teacher_username') or ''),
                    }
                else:
                    # tuple row
                    day = r[0]
                    day_iso = day.isoformat() if hasattr(day, 'isoformat') else str(day)
                    did = int(r[4] or 0)
                    raw_pos = r[6]
                    pos_key = _positions_to_key(raw_pos)
                    req = int(r[1] or 1)
                    done = int(successes.get((did, day_iso, pos_key), 0) or 0)
                    act = activities.get((did, day_iso, pos_key)) or {'perfect': 0, 'corrected': 0, 'audio': 0}
                    item = {
                        'assignment_id': int(r[2] or 0),
                        'group_id': int(r[3] or 0),
                        'group_title': str(r[7] or ''),
                        'dictation_id': did,
                        'dictation_title': str(r[8] or ''),
                        'dictation_language_code': str(r[9] or ''),
                        'dictation_level': r[10],
                        'dictation_sentences_count': int(r[11] or 0),
                        'selected_sentence_positions': list(raw_pos or []) if raw_pos is not None else None,
                        'required_completions': req,
                        'done': done,
                        'completed': bool(done >= req and req > 0),
                        'activity': {
                            'perfect': int(act.get('perfect') or 0),
                            'corrected': int(act.get('corrected') or 0),
                            'audio': int(act.get('audio') or 0),
                        },
                        'teacher_username': str(r[12] or ''),
                    }

                if day_iso not in days:
                    days[day_iso] = {'date': day_iso, 'items': []}
                days[day_iso]['items'].append(item)
            except Exception:
                continue

        # Добавляем "прочую активность" (есть activity, но нет подходящего задания)
        assignments_keys = set()
        for day_iso, payload in days.items():
            for it in payload.get('items') or []:
                try:
                    raw_pos = it.get('selected_sentence_positions')
                    pos_key = _positions_to_key(raw_pos)
                    assignments_keys.add((int(it.get('dictation_id') or 0), day_iso, pos_key))
                except Exception:
                    continue

        extras_by_day = {}
        for (did, day_iso, pos_key), act in activities.items():
            if (did, day_iso, pos_key) in assignments_keys:
                continue
            if day_iso not in extras_by_day:
                extras_by_day[day_iso] = []
            extras_by_day[day_iso].append(
                {
                    'dictation_id': int(did),
                    'selected_sentence_positions_key': str(pos_key or ''),
                    'activity': {
                        'perfect': int(act.get('perfect') or 0),
                        'corrected': int(act.get('corrected') or 0),
                        'audio': int(act.get('audio') or 0),
                    },
                }
            )

        # Обогащаем метаданными диктантов (title/level/cover) и для плана, и для extra.
        try:
            all_dict_ids = set()
            for payload in (days or {}).values():
                for it in payload.get('items') or []:
                    try:
                        all_dict_ids.add(int(it.get('dictation_id') or 0))
                    except Exception:
                        pass
            for payload in (extras_by_day or {}).values():
                for it in payload or []:
                    try:
                        all_dict_ids.add(int(it.get('dictation_id') or 0))
                    except Exception:
                        pass
            all_dict_ids.discard(0)

            dict_meta = {}
            if all_dict_ids:
                conn2 = get_db_connection()
                try:
                    with conn2.cursor() as cur2:
                        cur2.execute(
                            """
                            SELECT id, title, language_code, level
                            FROM dictations
                            WHERE id = ANY(%s)
                            """,
                            (list(all_dict_ids),),
                        )
                        for rr in (cur2.fetchall() or []):
                            try:
                                if isinstance(rr, dict):
                                    did = int(rr.get('id') or 0)
                                    dict_meta[did] = {
                                        'title': rr.get('title'),
                                        'language_code': rr.get('language_code'),
                                        'level': rr.get('level'),
                                    }
                                else:
                                    did = int(rr[0] or 0)
                                    dict_meta[did] = {
                                        'title': rr[1],
                                        'language_code': rr[2],
                                        'level': rr[3],
                                    }
                            except Exception:
                                continue
                finally:
                    conn2.close()

            cover_fn = None
            try:
                from routes.index import get_cover_url_for_id as cover_fn
            except Exception:
                cover_fn = None

            for payload in (days or {}).values():
                for it in payload.get('items') or []:
                    try:
                        did = int(it.get('dictation_id') or 0)
                        meta = dict_meta.get(did) or {}
                        if not it.get('dictation_title'):
                            it['dictation_title'] = str(meta.get('title') or '')
                        if not it.get('dictation_level'):
                            it['dictation_level'] = meta.get('level')
                        if cover_fn:
                            lang = it.get('dictation_language_code') or meta.get('language_code')
                            it['dictation_cover_url'] = cover_fn(f"dict_{did}", lang)
                        else:
                            it['dictation_cover_url'] = f"/static/data/covers/cover_{(it.get('dictation_language_code') or meta.get('language_code') or 'en')}.webp"
                    except Exception:
                        continue

            for payload in (extras_by_day or {}).values():
                for it in payload or []:
                    try:
                        did = int(it.get('dictation_id') or 0)
                        meta = dict_meta.get(did) or {}
                        it['dictation_title'] = str(meta.get('title') or '')
                        it['dictation_level'] = meta.get('level')
                        it['dictation_language_code'] = str(meta.get('language_code') or '')
                        if cover_fn:
                            it['dictation_cover_url'] = cover_fn(f"dict_{did}", meta.get('language_code'))
                        else:
                            it['dictation_cover_url'] = f"/static/data/covers/cover_{(meta.get('language_code') or 'en')}.webp"
                    except Exception:
                        continue
        except Exception:
            pass

        out_days = []
        for day_iso in sorted(set(list(days.keys()) + list(extras_by_day.keys())), reverse=True):
            payload = days.get(day_iso) or {'date': day_iso, 'items': []}
            payload['extra_activity'] = extras_by_day.get(day_iso) or []
            # completed first
            payload['items'] = sorted(payload.get('items') or [], key=lambda x: (0 if x.get('completed') else 1, int(x.get('assignment_id') or 0)))
            out_days.append(payload)

        return jsonify({
            'success': True,
            'user_id': int(target_user_id),
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'days': out_days,
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/rating', methods=['POST'])
@jwt_required()
def api_rating_report():
    """Рейтинг активности: агрегируем данные из history_by_day за период по всем пользователям."""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        data = request.get_json(silent=True) or {}
        period_key = str(data.get('period') or 'today').strip().lower()
        start_date_raw = data.get('start_date')
        end_date_raw = data.get('end_date')
        language_code = data.get('language_code')

        start_date = None
        end_date = None
        try:
            if start_date_raw and end_date_raw:
                start_date = datetime.fromisoformat(str(start_date_raw)).date()
                end_date = datetime.fromisoformat(str(end_date_raw)).date()
        except Exception:
            start_date = None
            end_date = None
        current_user_id = int(user.get('id'))

        if start_date and end_date:
            # Корректируем диапазон, если пользователь перепутал даты.
            if start_date > end_date:
                end_date = start_date
            if end_date < start_date:
                start_date = end_date
            period_days = (end_date - start_date).days + 1
            if period_days <= 0:
                period_days = 1
                end_date = start_date
            if period_days > 365:
                start_date = end_date - timedelta(days=364)
                period_days = 365
        else:
            if period_key in ('today', '1', 'day', '1d'):
                period_days = 1
            elif period_key in ('3', '3days', '3d'):
                period_days = 3
            elif period_key in ('7', '7days', '7d'):
                period_days = 7
            elif period_key in ('30', '30days', '30d'):
                period_days = 30
            else:
                try:
                    period_days = int(data.get('period_days') or 1)
                except Exception:
                    period_days = 1

            if period_days <= 0:
                period_days = 1
            if period_days > 365:
                period_days = 365

            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=int(period_days) - 1)

        out = []
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                lang = None
                try:
                    if language_code and str(language_code).strip().lower() not in ('all', '*'):
                        lang = str(language_code).strip().lower()
                except Exception:
                    lang = None

                if lang:
                    cur.execute(
                        """
                        SELECT
                            h.user_id,
                            u.username,
                            COALESCE(SUM(h.perfect_count), 0) AS perfect,
                            COALESCE(SUM(h.corrected_count), 0) AS corrected,
                            COALESCE(SUM(h.audio_count), 0) AS audio,
                            COALESCE(SUM(h.lead_time), 0) AS lead_time,
                            COALESCE(SUM(h.money_dt_count), 0) AS money_dt_count,
                            COALESCE(SUM(h.monenumber_of_characters), 0) AS monenumber_of_characters
                        FROM history_by_day h
                        JOIN users u ON u.id = h.user_id
                        WHERE h.date_fact >= %s
                          AND h.date_fact <= %s
                          AND h.dictation_language_code = %s
                        GROUP BY h.user_id, u.username
                        """,
                        (start_date, end_date, lang),
                    )
                else:
                    cur.execute(
                        """
                        SELECT
                            h.user_id,
                            u.username,
                            COALESCE(SUM(h.perfect_count), 0) AS perfect,
                            COALESCE(SUM(h.corrected_count), 0) AS corrected,
                            COALESCE(SUM(h.audio_count), 0) AS audio,
                            COALESCE(SUM(h.lead_time), 0) AS lead_time,
                            COALESCE(SUM(h.money_dt_count), 0) AS money_dt_count,
                            COALESCE(SUM(h.monenumber_of_characters), 0) AS monenumber_of_characters
                        FROM history_by_day h
                        JOIN users u ON u.id = h.user_id
                        WHERE h.date_fact >= %s
                          AND h.date_fact <= %s
                        GROUP BY h.user_id, u.username
                        """,
                        (start_date, end_date),
                    )

                rows = cur.fetchall() or []
                for r in rows:
                    if isinstance(r, dict):
                        uid = int(r.get('user_id') or 0)
                        out.append(
                            {
                                'user_id': uid,
                                'username': str(r.get('username') or f"User #{uid}"),
                                'perfect': int(r.get('perfect') or 0),
                                'corrected': int(r.get('corrected') or 0),
                                'audio': int(r.get('audio') or 0),
                                'lead_time': int(r.get('lead_time') or 0),
                                'money_dt_count': int(r.get('money_dt_count') or 0),
                                'monenumber_of_characters': int(r.get('monenumber_of_characters') or 0),
                            }
                        )
                    else:
                        uid = int(r[0] or 0)
                        out.append(
                            {
                                'user_id': uid,
                                'username': str(r[1] or f"User #{uid}"),
                                'perfect': int(r[2] or 0),
                                'corrected': int(r[3] or 0),
                                'audio': int(r[4] or 0),
                                'lead_time': int(r[5] or 0),
                                'money_dt_count': int(r[6] or 0),
                                'monenumber_of_characters': int(r[7] or 0),
                            }
                        )
        finally:
            conn.close()

        total_users = len(out)

        # Сортировка на сервере — по умолчанию по perfect, audio, corrected (как было)
        # Фронтенд может пересортировать по своим правилам
        out.sort(
            key=lambda x: (
                -int(x.get('perfect') or 0),
                -int(x.get('audio') or 0),
                int(x.get('corrected') or 0),
                int(x.get('user_id') or 0),
            )
        )

        return jsonify(
            {
                'success': True,
                'period_days': int(period_days),
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'total_users': int(total_users),
                'rating': out,
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/activity/users', methods=['GET'])
@jwt_required()
def api_activity_users():
    """Список пользователей для отчётов: иерархический (self + группы со студентами).

    Возвращает плоский список (для обратной совместимости):
      - Сам пользователь (type: "self")
      - Студенты из групп (type: "student")
    """
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        current_user_id = int(user.get('id'))
        out = [{"id": current_user_id, "label": str(user.get('username') or 'Я'), "type": "self"}]

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT u.id AS user_id, u.username
                    FROM group_students gs
                    JOIN users u ON u.id = gs.student_user_id
                    JOIN groups g ON g.id = gs.group_id
                    WHERE g.teacher_id = %s
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                    ORDER BY u.id ASC
                    """,
                    (current_user_id,),
                )
                rows = cur.fetchall() or []
                for r in rows:
                    uid = int(r.get('user_id') if isinstance(r, dict) else r[0])
                    uname = (r.get('username') if isinstance(r, dict) else r[1])
                    if uid == current_user_id:
                        continue
                    out.append({"id": uid, "label": str(uname or f"User #{uid}"), "type": "student"})
        finally:
            conn.close()

        return jsonify({"success": True, "users": out})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/report-users', methods=['GET'])
@jwt_required()
def api_report_users():
    """Список пользователей для отчётов: иерархический (self + группы со студентами).

    Возвращает иерархическую структуру:
      - Сам пользователь (type: "self")
      - Группы, где пользователь teacher, со студентами (type: "group" с children)
      - Если в группе 1 студент — он показывается на верхнем уровне без группы
      - Персональные группы исключаются (в них только сам пользователь)
    """
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        current_user_id = int(user.get('id'))
        current_username = str(user.get('username') or 'Я')

        out = []
        # Сначала сам пользователь
        out.append({
            "id": current_user_id,
            "label": current_username,
            "type": "self",
            "group_id": None,
            "group_title": None
        })

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Проверяем наличие колонок is_personal / personal_owner_user_id
                cur.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name='groups'
                      AND column_name = ANY(%s)
                    """,
                    (['is_personal', 'personal_owner_user_id'],),
                )
                existing_cols = {r.get('column_name') if isinstance(r, dict) else r[0]
                                for r in (cur.fetchall() or [])}
                has_personal_cols = ('is_personal' in existing_cols and
                                     'personal_owner_user_id' in existing_cols)

                # Динамически строим запрос групп
                extra_select = ""
                exclude_personal = ""
                if has_personal_cols:
                    extra_select = ", g.is_personal, g.personal_owner_user_id"
                    exclude_personal = "AND NOT (g.is_personal = TRUE AND g.personal_owner_user_id = %s)"

                cur.execute(
                    f"""
                    SELECT g.id, g.title
                           {extra_select}
                    FROM groups g
                    WHERE g.teacher_id = %s
                      AND g.archived_at IS NULL
                      {exclude_personal}
                    ORDER BY g.id DESC
                    """,
                    (current_user_id, current_user_id) if has_personal_cols else (current_user_id,),
                )
                group_rows = cur.fetchall() or []

                for gr in group_rows:
                    gid = int(gr.get('id') if isinstance(gr, dict) else gr[0])
                    gtitle = str(gr.get('title') if isinstance(gr, dict) else gr[1] or f'Group #{gid}')

                    # Получаем активных студентов группы (исключая самого учителя)
                    cur.execute(
                        """
                        SELECT u.id AS user_id, u.username
                        FROM group_students gs
                        JOIN users u ON u.id = gs.student_user_id
                        WHERE gs.group_id = %s
                          AND gs.status = 'active'
                          AND gs.removed_at IS NULL
                          AND gs.student_user_id != %s
                        ORDER BY u.id ASC
                        """,
                        (gid, current_user_id),
                    )
                    student_rows = cur.fetchall() or []

                    active_students = []
                    for sr in student_rows:
                        sid = int(sr.get('user_id') if isinstance(sr, dict) else sr[0])
                        sname = str(sr.get('username') if isinstance(sr, dict) else sr[1] or f'User #{sid}')
                        active_students.append({
                            "id": sid,
                            "username": sname
                        })

                    if not active_students:
                        continue

                    # Если в группе 1 студент — показываем его на верхнем уровне
                    if len(active_students) == 1:
                        s = active_students[0]
                        out.append({
                            "id": s["id"],
                            "label": s["username"],
                            "type": "student",
                            "group_id": gid,
                            "group_title": gtitle
                        })
                    else:
                        # Группа с несколькими студентами — показываем группу с детьми
                        children = []
                        for s in active_students:
                            children.append({
                                "id": s["id"],
                                "label": s["username"],
                                "type": "student",
                                "group_id": gid,
                                "group_title": gtitle
                            })
                        out.append({
                            "id": f"group_{gid}",
                            "label": gtitle,
                            "type": "group",
                            "group_id": gid,
                            "group_title": gtitle,
                            "children": children
                        })
        finally:
            conn.close()

        return jsonify({"success": True, "users": out})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/dictation-report/groups', methods=['GET'])
@jwt_required()
def api_dictation_report_groups():
    """Список групп для отчёта по диктантам.

    Каждый элемент группы содержит своих пользователей. Первой всегда идёт
    персональная группа самого пользователя (тип 'self'), чтобы отчёт можно
    было смотреть и по себе, и по ученикам.
    """
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        current_user_id = int(user.get('id'))
        current_username = str(user.get('username') or 'Я')

        groups = [{
            "id": None,
            "title": current_username,
            "type": "self",
            "users": [{"id": current_user_id, "username": current_username}]
        }]

        try:
            my_groups = list_my_groups(current_user_id)
        except Exception:
            my_groups = []

        for g in my_groups or []:
            gid = int(g.get('id') or 0)
            if not gid:
                continue
            try:
                students = list_group_students_for_teacher(gid, current_user_id)
            except Exception:
                students = []

            users = []
            for s in students or []:
                sid = int(s.get('id') or 0)
                if sid == current_user_id:
                    continue
                users.append({
                    "id": sid,
                    "username": str(s.get('username') or f'User #{sid}')
                })

            if not users:
                continue

            groups.append({
                "id": gid,
                "title": str(g.get('title') or f'Group #{gid}'),
                "type": "group",
                "users": users
            })

        return jsonify({"success": True, "groups": groups, "self_id": current_user_id})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/dictation-report/languages', methods=['GET'])
@jwt_required()
def api_dictation_report_languages():
    """Языки, по которым у выбранного пользователя есть история диктантов."""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        current_user_id = int(user.get('id'))
        try:
            target_user_id = int(request.args.get('user_id') or current_user_id)
        except Exception:
            target_user_id = current_user_id

        # Учитель может смотреть языки только тех учеников, к которым есть доступ.
        if target_user_id != current_user_id:
            if not _can_teacher_view_student_activity(current_user_id, target_user_id):
                return jsonify({"success": False, "error": "Forbidden"}), 403

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT
                        COALESCE(NULLIF(hbd.dictation_language_code, ''), d.language_code) AS language_code
                    FROM history_by_day hbd
                    LEFT JOIN dictations d ON d.id = hbd.dictation_id
                    WHERE hbd.user_id = %s
                      AND COALESCE(NULLIF(hbd.dictation_language_code, ''), d.language_code) IS NOT NULL
                      AND COALESCE(NULLIF(hbd.dictation_language_code, ''), d.language_code) <> ''
                    ORDER BY 1 ASC
                    """,
                    (target_user_id,),
                )
                rows = cur.fetchall() or []
        finally:
            conn.close()

        languages = []
        for r in rows:
            code = (r.get('language_code') if isinstance(r, dict) else r[0])
            if not code:
                continue
            code = str(code).strip().lower()
            languages.append({
                "code": code,
                "label": get_language_name(code, 'language_ru') or code.upper()
            })

        return jsonify({"success": True, "languages": languages})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/success', methods=['POST'])
@jwt_required()
def save_success():
    """Сохранить успешное завершение диктанта в history_by_day"""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        # Логи для отлова дублирования/удвоения
        print(f'📥 [SAVE_SUCCESS] Получен запрос на сохранение успеха')
        print(f'   email: {current_email}')
        print(f'   данные: {data}')
        # Проверка на удвоение: если perfect_count > audio_count — возможно дублирование
        pc = int(data.get('perfect_count', 0) or 0)
        ac = int(data.get('audio_count', 0) or 0)
        if pc > ac:
            print(f'⚠️ [SAVE_SUCCESS] ВНИМАНИЕ: perfect_count ({pc}) > audio_count ({ac}) — возможное удвоение!')
        
        dictation_id = data.get('dictation_id')  # может быть dict_<id> или integer
        perfect_count = data.get('perfect_count', 0)
        corrected_count = data.get('corrected_count', 0)
        audio_count = data.get('audio_count', 0)
        attempts_total = data.get('attempts_total', 0)
        mistake_count = data.get('mistake_count')
        if mistake_count is None:
            mistake_count = data.get('error_count', 0)
        monenumber_of_characters = data.get('monenumber_of_characters', 0)
        time_ms = data.get('time_ms', 0)
        money_earned = data.get('money_earned', 0)
        try:
            money_earned = int(money_earned) if money_earned else 0
        except Exception:
            money_earned = 0
        date_start = data.get('date_start')
        plan_date = data.get('plan_date')
        source_group_id = data.get('source_group_id')
        sentences_data = data.get('sentences_data')
        error_words = data.get('error_words')
        completed_at_ms = data.get('completed_at_ms')
        completed_at_tz_offset_min = data.get('completed_at_tz_offset_min')
        # completion_count может быть 0 — это означает "не завершение диктанта, просто активность".
        # Используем явную проверку на None, чтобы 0 не превращался в None через "or".
        raw_cc = data.get('completion_count')
        if raw_cc is None:
            raw_cc = data.get('completion_count_after')
        completion_count = int(raw_cc) if raw_cc is not None else None
        selected_sentence_positions_raw = data.get('selected_sentence_positions')
        # Нормализуем positions для INTEGER[]
        try:
            if not isinstance(selected_sentence_positions_raw, list):
                selected_sentence_positions = []
            else:
                pos_norm = []
                for p in selected_sentence_positions_raw:
                    try:
                        v = int(p)
                        if v > 0:
                            pos_norm.append(v)
                    except Exception:
                        continue
                selected_sentence_positions = sorted(list(set(pos_norm)))
        except Exception:
            selected_sentence_positions = []
        dictation_language_code = data.get('dictation_language_code')

        started_at = None
        try:
            started_at_iso = data.get('started_at') or data.get('started_at_iso')
            started_at_ms = data.get('started_at_ms')
            started_at_tz_offset_min = data.get('started_at_tz_offset_min')
            if started_at_iso:
                started_at = datetime.fromisoformat(str(started_at_iso))
            elif started_at_ms is not None:
                ms = int(started_at_ms)
                tz_min = int(started_at_tz_offset_min) if started_at_tz_offset_min is not None else int(completed_at_tz_offset_min) if completed_at_tz_offset_min is not None else None
                if tz_min is None:
                    started_at = datetime.utcfromtimestamp(ms / 1000.0)
                else:
                    started_at = datetime.utcfromtimestamp((ms - (tz_min * 60 * 1000)) / 1000.0)
        except Exception:
            started_at = None
        
        if not dictation_id:
            print(f'❌ [SAVE_SUCCESS] Ошибка: не указан dictation_id')
            return jsonify({'error': 'Не указан dictation_id'}), 400
        
        # Получаем user_id из БД по email
        user = get_user_by_email(current_email)
        if not user:
            print(f'❌ [SAVE_SUCCESS] Пользователь не найден: {current_email}')
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = user['id']
        print(f'✅ [SAVE_SUCCESS] Найден user_id: {user_id} для email: {current_email}')
        
        # Сохраняем успех в БД (каждое завершение - отдельная запись)
        try:
            source_group_id = int(source_group_id) if source_group_id is not None else None
        except Exception:
            source_group_id = None

        success = add_success(
            user_id,
            dictation_id,
            perfect_count,
            corrected_count,
            audio_count,
            time_ms,
            attempts_total,
            mistake_count,
            monenumber_of_characters=monenumber_of_characters,
            source_group_id=source_group_id,
            selected_sentence_positions=selected_sentence_positions,
            dictation_language_code=dictation_language_code,
            started_at=started_at,
            date_start=date_start,
            plan_date=plan_date,
            completion_count=completion_count,
            money_earned=money_earned,
        )

        print(f'✅ [SAVE_SUCCESS] Успех успешно сохранен в БД')

        # Проверяем, является ли результат рекордом
        try:
            record_result = check_and_save_dictation_record(
                user_id=user_id,
                dictation_id=dictation_id,
                positions=selected_sentence_positions,
                perfect_count=perfect_count,
                corrected_count=corrected_count,
                audio_count=audio_count,
                activity_count=attempts_total,
                lead_time=time_ms,
                mistake_count=mistake_count,
                monenumber_of_characters=monenumber_of_characters,
                money_dt_count=money_earned,
            )
            print(f'🏆 [SAVE_SUCCESS] Проверка рекорда: is_record={record_result.get("is_record")}, is_first={record_result.get("is_first")}')
        except Exception as e:
            print(f'❌ [SAVE_SUCCESS] Ошибка проверки рекорда: {e}')
            import traceback
            traceback.print_exc()
            record_result = {'is_record': False, 'record': None, 'is_first': False}

        return jsonify({
            'success': True,
            'success_data': success,
            'record': record_result,
        })
        
    except ValueError as e:
        print(f'❌ [SAVE_SUCCESS] ValueError: {e}')
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'❌ [SAVE_SUCCESS] Ошибка сохранения успеха: {e}')
        import traceback
        print(f'❌ [SAVE_SUCCESS] Полная трассировка:')
        traceback.print_exc()
        return jsonify({'error': f'Ошибка сохранения успеха: {str(e)}'}), 500


@statistics_bp.route('/dictation-record', methods=['POST'])
@jwt_required()
def api_get_dictation_record():
    """Получить текущий рекорд пользователя по диктанту для отображения в лейбле."""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        selected_sentence_positions = data.get('selected_sentence_positions')

        if not dictation_id:
            return jsonify({'error': 'Не указан dictation_id'}), 400

        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        user_id = user['id']

        record = get_dictation_record(
            user_id=user_id,
            dictation_id=dictation_id,
            positions=selected_sentence_positions,
        )

        return jsonify({'record': record})

    except Exception as e:
        print(f'❌ [GET_DICTATION_RECORD] Ошибка: {e}')
        return jsonify({'error': str(e)}), 500


@statistics_bp.route('/dictation-record/save', methods=['POST'])
@jwt_required()
def api_save_dictation_record():
    """Сохранить рекорд из outbox (вызывается при отправке очереди).

    Всегда возвращает актуальный рекорд с сервера для синхронизации кеша.
    Если наш результат стал рекордом — сохраняет его и возвращает.
    Если нет — возвращает существующий лучший рекорд с сервера.
    """
    try:
        current_email = get_jwt_identity()
        data = request.get_json()

        dictation_id = data.get('dictation_id')
        positions = data.get('positions')
        lead_time = data.get('lead_time', 0)
        mistake_count = data.get('mistake_count', 0)

        if not dictation_id:
            return jsonify({'error': 'Не указан dictation_id'}), 400

        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        user_id = user['id']

        # Пытаемся сохранить рекорд (сервер сам решит, лучше ли он существующего)
        result = check_and_save_dictation_record(
            user_id=user_id,
            dictation_id=dictation_id,
            positions=positions,
            perfect_count=0,
            corrected_count=0,
            audio_count=0,
            activity_count=0,
            lead_time=lead_time,
            mistake_count=mistake_count,
            monenumber_of_characters=0,
            money_dt_count=0,
        )

        # Всегда возвращаем актуальный record с сервера для синхронизации кеша
        # Если result.record есть — это либо наш новый рекорд, либо существующий лучший
        server_record = result.get('record')

        return jsonify({
            'success': True,
            'is_record': result.get('is_record', False),
            'is_first': result.get('is_first', False),
            'record': server_record,
        })

    except Exception as e:
        print(f'❌ [SAVE_DICTATION_RECORD] Ошибка: {e}')
        return jsonify({'error': str(e)}), 500


@statistics_bp.route('/dictation-records/all', methods=['GET'])
@jwt_required()
def api_get_all_dictation_records():
    """Получить все рекорды пользователя (для синхронизации кеша при загрузке страницы)."""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        user_id = user['id']
        records = get_all_dictation_records(user_id)

        return jsonify({'success': True, 'records': records})

    except Exception as e:
        print(f'❌ [GET_ALL_DICTATION_RECORDS] Ошибка: {e}')
        return jsonify({'error': str(e)}), 500


@statistics_bp.route('/success/count', methods=['POST'])
@jwt_required()
def get_success_counts():
    """Получить количество успешных завершений для списка диктантов"""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        dictation_ids = data.get('dictation_ids', [])
        
        if not dictation_ids or not isinstance(dictation_ids, list):
            return jsonify({'error': 'Не указан список dictation_ids'}), 400
        
        # Получаем user_id из БД по email
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = user['id']
        
        # Получаем количество завершений для всех диктантов
        counts = get_success_counts_for_dictations(user_id, dictation_ids)
        
        return jsonify({
            'success': True,
            'counts': counts
        })
        
    except Exception as e:
        print(f'❌ [GET_SUCCESS_COUNTS] Ошибка получения количества завершений: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка получения количества завершений'}), 500


@statistics_bp.route('/success/count_subset', methods=['POST'])
@jwt_required()
def get_success_count_subset():
    """Return completion count for an exercise (dictation + sentence positions).

    Counts from history_current (быстрая таблица-кэш) для этого dictation_id и positions.
    Used for medal display in dictation header.

    NOTE: Данные берутся из history_current (кэш history_by_day.successes).
    """
    try:
        current_email = get_jwt_identity()
        data = request.get_json() or {}

        dictation_id = data.get('dictation_id')
        selected_sentence_positions = data.get('selected_sentence_positions')

        if not dictation_id:
            return jsonify({'error': 'Не указан dictation_id'}), 400

        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        user_id = int(user['id'])

        # Берём из history_current (быстрая таблица-кэш)
        total = get_history_current(user_id, dictation_id, selected_sentence_positions)

        return jsonify({'success': True, 'count': total})
    except Exception as e:
        print(f'❌ [GET_SUCCESS_COUNT_SUBSET] Ошибка: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка получения количества завершений для поднабора'}), 500


@statistics_bp.route('/success/recalc', methods=['POST'])
@jwt_required()
def recalc_history_current():
    """Пересчитать history_current из history_by_day для текущего пользователя.
    
    Удаляет все записи history_current пользователя и пересоздаёт их
    агрегацией из history_by_day + dictation_records.
    """
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = int(user['id'])
        recalc_history_current_for_user(user_id)
        
        return jsonify({
            'success': True,
            'message': 'history_current пересчитан'
        })
    except Exception as e:
        print(f'❌ [RECALC_HISTORY_CURRENT] Ошибка: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка пересчёта history_current'}), 500


def _is_admin_user(user_id: int) -> bool:
    """Проверить, является ли пользователь администратором (по users.role_id → roles.code)."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.code
                FROM users u
                JOIN roles r ON r.id = u.role_id
                WHERE u.id = %s
                """,
                (int(user_id),),
            )
            row = cur.fetchone()
            code = row[0] if row else None
            return bool(code == 'admin')
    except Exception:
        return False
    finally:
        conn.close()


@statistics_bp.route('/success/recalc_all', methods=['POST'])
@jwt_required()
def recalc_history_current_all_users():
    """Глобальный пересчёт количества проходов по всем диктантам (только для админа).

    1) Восстанавливает successes=1 для полных проходов (positions='{}') с successes=0
       по эвристике (полный диктант реально выполнен).
    2) Пересчитывает number_successes во всех записях history_by_day как сквозной
       порядковый номер завершённых проходов (successes > 0) без пропусков —
       эти номера используются как колонки в отчёте по диктантам за период.
    3) Пересоздаёт history_current из SUM(successes) по всем пользователям —
       это количество проходов (медаль 🥇) для каждого упражнения.
    """
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        if not _is_admin_user(int(user['id'])):
            return jsonify({'success': False, 'error': 'Forbidden: только для администратора'}), 403

        repaired_successes = repair_full_dictation_successes_all()
        updated_number_successes = recalc_number_successes_all()
        inserted_current = recalc_history_current_all()

        return jsonify({
            'success': True,
            'repaired_successes': repaired_successes,
            'updated_number_successes': updated_number_successes,
            'inserted_history_current': inserted_current,
            'message': 'Количество проходов пересчитано по всем диктантам'
        })
    except Exception as e:
        print(f'❌ [RECALC_HISTORY_CURRENT_ALL] Ошибка: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Ошибка глобального пересчёта количества проходов'}), 500


@statistics_bp.route('/dictation-report/data', methods=['POST'])
@jwt_required()
def api_dictation_report_data():
    """Данные для отчета по диктантам за период.

    Выборка строится только по диктантам из history_by_day за период, без обхода
    всей библиотеки (устранён N+1: метаданные диктантов, книги и упражнения
    загружаются батчами по id).
    """
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404

        current_user_id = int(user.get('id'))
        body = request.get_json(silent=True) or {}

        try:
            target_user_id = int(body.get('user_id') or current_user_id)
        except Exception:
            target_user_id = current_user_id
        start_date = body.get('start_date')
        end_date = body.get('end_date')
        language_code = str(body.get('language_code') or '').strip().lower() or None

        if not start_date or not end_date:
            return jsonify({"success": False, "error": "start_date and end_date required"}), 400

        if target_user_id != current_user_id:
            if not _can_teacher_view_student_activity(current_user_id, target_user_id):
                return jsonify({"success": False, "error": "Forbidden"}), 403

        def _col(r, idx, key):
            if isinstance(r, dict):
                return r.get(key)
            return r[idx]

        def _pos_key(raw):
            if raw is None:
                return '__all__'
            if isinstance(raw, (list, tuple)):
                if not raw:
                    return '__all__'
                return ','.join(str(int(p)) for p in sorted(raw))
            return '__all__'

        def _poskey_sort_key(pk):
            # 'Весь диктант' ('__all__') должен идти ПЕРВЫМ — это строка
            # заголовка диктанта (обложка + название), а не отдельное
            # упражнение «↳ Весь диктант». Подмножества предложений идут после.
            return (0, '') if pk == '__all__' else (1, pk)

        # 1) История за период: каждая строка = одно выполнение (попытка) диктанта.
        lang_filter = ""
        params = [target_user_id, start_date, end_date]
        if language_code:
            lang_filter = " AND COALESCE(NULLIF(hbd.dictation_language_code, ''), d.language_code) = %s"
            params.append(language_code)

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT
                        hbd.dictation_id,
                        COALESCE(hbd.positions, '{{}}'::int[]) AS positions,
                        hbd.date_start,
                        hbd.lead_time,
                        hbd.money_dt_count,
                        hbd.mistake_count,
                        hbd.corrected_count,
                        hbd.successes,
                        hbd.monenumber_of_characters,
                        hbd.number_successes,
                        COALESCE(NULLIF(hbd.dictation_language_code, ''), d.language_code) AS language_code,
                        hbd.date_fact
                    FROM history_by_day hbd
                    LEFT JOIN dictations d ON d.id = hbd.dictation_id
                    WHERE hbd.user_id = %s
                      AND hbd.date_fact >= %s::date
                      AND hbd.date_fact <= %s::date
                      {lang_filter}
                    ORDER BY hbd.dictation_id, hbd.positions, hbd.date_start, hbd.date_fact
                    """,
                    tuple(params),
                )
                history_rows = cur.fetchall() or []
        finally:
            conn.close()

        # Группируем строки истории по сессии: (did, pos_key, date_start).
        # Один старт диктанта может длиться несколько дней — тогда в
        # history_by_day под одним date_start лежит несколько строк (по одной
        # на каждый date_fact). Здесь они агрегируются в одну сессию, чтобы
        # в отчёт попало ВСЁ время, а не только последний день.
        history_repeats = {}   # (did, pos_key) -> [repeat, ...] (завершённые сессии)
        unfinished_by_did = {} # did -> {lead_time, money, mistakes, symbols}
        lang_by_did = {}
        dict_ids = set()
        sessions = {}          # (did, pos_key, session_key) -> agg

        for r in history_rows:
            did = int(_col(r, 0, 'dictation_id') or 0)
            if not did:
                continue
            dict_ids.add(did)
            pos_key = _pos_key(_col(r, 1, 'positions'))

            ds = _col(r, 2, 'date_start')
            date_fact = _col(r, 11, 'date_fact')
            session_key = str(ds) if ds is not None else ''
            if not session_key and date_fact is not None:
                session_key = f"d:{date_fact}"

            lead_time = int(_col(r, 3, 'lead_time') or 0)
            money = int(_col(r, 4, 'money_dt_count') or 0)
            mistakes = int(_col(r, 5, 'mistake_count') or 0)
            corrected = int(_col(r, 6, 'corrected_count') or 0)
            successes = int(_col(r, 7, 'successes') or 0)
            symbols = int(_col(r, 8, 'monenumber_of_characters') or 0)
            attempt = int(_col(r, 9, 'number_successes') or 0)

            row_lang = str(_col(r, 10, 'language_code') or '').strip().lower()
            if row_lang:
                lang_by_did[did] = row_lang

            skey = (did, pos_key, session_key)
            agg = sessions.get(skey)
            if agg is None:
                agg = {
                    "date_start": session_key,
                    "lead_time": 0,
                    "money": 0,
                    "mistakes": 0,
                    "corrected": 0,
                    "successes": 0,
                    "symbols": 0,
                    "attempt": 0,
                }
                sessions[skey] = agg
            agg['lead_time'] += lead_time
            agg['money'] += money
            agg['mistakes'] += mistakes
            agg['corrected'] += corrected
            agg['symbols'] += symbols
            agg['successes'] = max(agg['successes'], successes)
            agg['attempt'] = max(agg['attempt'], attempt)

        # Разделяем сессии: завершённые (есть отметка окончания и номер) уходят
        # в повторы (разносятся по колонкам повторов), незавершённые
        # накапливаются в отдельный агрегат «незаконченные» на диктант.
        for (did, pos_key, _sk), agg in sessions.items():
            if agg['successes'] > 0 and agg['attempt'] > 0:
                history_repeats.setdefault((did, pos_key), []).append({
                    "date_start": agg['date_start'],
                    "lead_time": agg['lead_time'],
                    "money": agg['money'],
                    "mistakes": agg['mistakes'],
                    "corrected": agg['corrected'],
                    "successes": agg['successes'],
                    "symbols": agg['symbols'],
                    "attempt": agg['attempt'],
                })
            else:
                u = unfinished_by_did.setdefault(did, {
                    "lead_time": 0, "money": 0, "mistakes": 0, "symbols": 0,
                })
                u['lead_time'] += agg['lead_time']
                u['money'] += agg['money']
                u['mistakes'] += agg['mistakes']
                u['symbols'] += agg['symbols']

        dict_ids_list = sorted(dict_ids)

        # 2) Метаданные диктантов одним запросом.
        dict_meta = {}
        if dict_ids_list:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, title, language_code, level FROM dictations WHERE id = ANY(%s)",
                        (dict_ids_list,),
                    )
                    for rr in (cur.fetchall() or []):
                        did = int(_col(rr, 0, 'id') or 0)
                        dlang = str(_col(rr, 2, 'language_code') or '').strip().lower()
                        dict_meta[did] = {
                            "title": str(_col(rr, 1, 'title') or 'Без названия'),
                            "language_code": dlang,
                            "level": _col(rr, 3, 'level'),
                        }
                        if dlang:
                            lang_by_did[did] = dlang
            finally:
                conn.close()

        # 3) Связь диктант → книга.
        book_links = {}
        if dict_ids_list:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT book_id, dictation_id FROM book_dictations WHERE dictation_id = ANY(%s) ORDER BY book_id",
                        (dict_ids_list,),
                    )
                    for rr in (cur.fetchall() or []):
                        bid = int(_col(rr, 0, 'book_id') or 0)
                        did = int(_col(rr, 1, 'dictation_id') or 0)
                        if bid and did and did not in book_links:
                            book_links[did] = bid
            finally:
                conn.close()

        # 4) Книги/разделы, к которым привязаны диктанты.
        books_by_id = {}
        book_ids = sorted(set(book_links.values()))
        if book_ids:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, title, parent_id, root_book_id, original_language FROM books WHERE id = ANY(%s)",
                        (book_ids,),
                    )
                    for rr in (cur.fetchall() or []):
                        bid = int(_col(rr, 0, 'id') or 0)
                        books_by_id[bid] = {
                            "id": bid,
                            "title": str(_col(rr, 1, 'title') or 'Без названия'),
                            "parent_id": _col(rr, 2, 'parent_id'),
                            "root_book_id": _col(rr, 3, 'root_book_id'),
                            "original_language": str(_col(rr, 4, 'original_language') or 'en'),
                        }
            finally:
                conn.close()

        # 5) Книги верхнего уровня (нужны для разделов).
        top_books = {}
        root_ids = sorted({
            int(b.get('root_book_id') or b.get('id'))
            for b in books_by_id.values()
            if b.get('root_book_id') or b.get('id')
        })
        if root_ids:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, title, parent_id, root_book_id, original_language FROM books WHERE id = ANY(%s)",
                        (root_ids,),
                    )
                    for rr in (cur.fetchall() or []):
                        bid = int(_col(rr, 0, 'id') or 0)
                        top_books[bid] = {
                            "id": bid,
                            "title": str(_col(rr, 1, 'title') or 'Без названия'),
                            "parent_id": _col(rr, 2, 'parent_id'),
                            "root_book_id": _col(rr, 3, 'root_book_id'),
                            "original_language": str(_col(rr, 4, 'original_language') or 'en'),
                        }
            finally:
                conn.close()

        # 6) Упражнения одним запросом.
        exercises_by_did = {}
        if dict_ids_list:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, dictation_id, positions, title FROM dictation_exercises WHERE dictation_id = ANY(%s) ORDER BY id",
                        (dict_ids_list,),
                    )
                    for rr in (cur.fetchall() or []):
                        did = int(_col(rr, 1, 'dictation_id') or 0)
                        ex = {
                            "id": int(_col(rr, 0, 'id') or 0),
                            "positions": list(_col(rr, 2, 'positions') or []),
                            "title": _col(rr, 3, 'title'),
                        }
                        exercises_by_did.setdefault(did, []).append(ex)
            finally:
                conn.close()

        def _compact_positions(nums):
            nums = sorted({int(n) for n in nums if str(n).lstrip('-').isdigit()})
            if not nums:
                return ''
            ranges = []
            start = prev = nums[0]
            for n in nums[1:]:
                if n == prev + 1:
                    prev = n
                    continue
                ranges.append(str(start) if start == prev else f"{start}-{prev}")
                start = prev = n
            ranges.append(str(start) if start == prev else f"{start}-{prev}")
            return ','.join(ranges)

        def _exercise_title(pos_key, db_ex):
            if db_ex and db_ex.get('title'):
                return str(db_ex['title'])
            if pos_key == '__all__':
                return 'Весь диктант'
            compact = _compact_positions(pos_key.split(','))
            return f"Предложения: ({compact})" if compact else 'Предложения'

        # Построение иерархии: язык → книга → раздел → диктант → упражнения.
        lang_books = {}        # lang -> [book_entry]
        lang_book_index = {}   # (lang, book_id) -> book_entry

        def _ensure_book_entry(lang, top_book):
            key = (lang, top_book['id'])
            if key in lang_book_index:
                return lang_book_index[key]
            entry = {
                "id": top_book['id'],
                "title": top_book['title'],
                "cover_url": (
                    f"/library/api/book-cover?book_id={top_book['id']}&filename=cover.webp"
                    if int(top_book['id'] or 0) > 0 else ''
                ),
                "language": lang,
                "sections": [],
                "dictations": [],
            }
            lang_books.setdefault(lang, []).append(entry)
            lang_book_index[key] = entry
            return entry

        def _ensure_section_entry(book_entry, sec):
            for s in book_entry['sections']:
                if s['id'] == sec['id']:
                    return s
            s_entry = {"id": sec['id'], "title": sec['title'], "dictations": []}
            book_entry['sections'].append(s_entry)
            return s_entry

        for did in dict_ids_list:
            repeats_by_poskey = {
                pk: history_repeats[(d, pk)]
                for (d, pk) in history_repeats
                if d == did
            }
            if not repeats_by_poskey and not unfinished_by_did.get(did):
                continue

            meta = dict_meta.get(did) or {}
            dlang = str(meta.get('language_code') or lang_by_did.get(did) or 'en')
            dtitle = str(meta.get('title') or 'Без названия')
            d_cover = get_cover_url_for_id(f"dict_{did}", dlang)

            # Определяем книгу/раздел.
            book = books_by_id.get(book_links.get(did))
            if book is None:
                top_book = {"id": 0, "title": "Без книги"}
                section = None
            else:
                root_id = int(book.get('root_book_id') or book.get('id') or 0)
                if book.get('parent_id') is None or root_id == int(book.get('id') or 0):
                    top_book = top_books.get(root_id) or book
                    section = None
                else:
                    top_book = top_books.get(root_id) or book
                    section = book

            # Упражнения: объединяем записи из БД и pos_key из истории.
            db_ex_by_poskey = {}
            for ex in exercises_by_did.get(did, []):
                db_ex_by_poskey[_pos_key(ex.get('positions'))] = ex

            exercise_list = []
            for pk in sorted(repeats_by_poskey.keys(), key=_poskey_sort_key):
                repeats = repeats_by_poskey[pk]
                if not repeats:
                    continue
                db_ex = db_ex_by_poskey.get(pk)
                if pk == '__all__':
                    positions = list(db_ex.get('positions') or []) if db_ex else []
                else:
                    positions = [int(x) for x in pk.split(',')]
                exercise_list.append({
                    "id": (db_ex or {}).get('id', 0),
                    "title": _exercise_title(pk, db_ex),
                    "positions": positions,
                    "repeats": repeats,
                })

            if unfinished_by_did.get(did):
                u = unfinished_by_did[did]
                exercise_list.append({
                    "id": 0,
                    "title": "незаконченные",
                    "positions": [],
                    "repeats": [],
                    "is_unfinished": True,
                    "unfinished": {
                        "lead_time": u['lead_time'],
                        "money": u['money'],
                        "mistakes": u['mistakes'],
                        "symbols": u['symbols'],
                    },
                })

            if not exercise_list:
                continue

            dict_entry = {
                "id": did,
                "title": dtitle,
                "cover_url": d_cover,
                "language": dlang,
                "exercises": exercise_list,
            }

            book_entry = _ensure_book_entry(dlang, top_book)
            if section is not None:
                _ensure_section_entry(book_entry, section)['dictations'].append(dict_entry)
            else:
                book_entry['dictations'].append(dict_entry)

        languages_list = [
            {"language": lang, "books": books}
            for lang, books in sorted(lang_books.items())
        ]

        return jsonify({
            "success": True,
            "languages": languages_list
        })
    except Exception as exc:
        import traceback
        import io
        buf = io.StringIO()
        traceback.print_exc(file=buf)
        tb_str = buf.getvalue()
        print(f"[dictation-report/data] UNHANDLED EXCEPTION: {exc}", flush=True)
        print(tb_str, flush=True)
        return jsonify({"success": False, "error": str(exc), "traceback": tb_str}), 500
