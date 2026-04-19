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
)
from helpers.db_telegram import (
    filter_manual_teacher_chat_ids,
    list_teacher_chat_ids_for_student_success,
    list_teacher_recipients_for_student_manual_report,
    get_student_and_dictation_info,
)
from helpers.telegram import is_telegram_enabled, send_telegram_message
from helpers.db_dictations import get_sentence_by_key
from helpers.db import get_db_connection

try:
    from helpers.db_dictations import get_dictation_by_id
except Exception:
    get_dictation_by_id = None

statistics_bp = Blueprint('statistics', __name__, url_prefix='/api/statistics')


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
                    JOIN group_teachers gt ON gt.group_id = gs.group_id
                    WHERE gt.teacher_user_id = %s
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
    error_words_lines = []
    try:
        ew = error_words if isinstance(error_words, dict) else {}
        items = []
        for k, v in ew.items():
            try:
                w = str(k or '').strip()
                c = int(v or 0)
            except Exception:
                continue
            if not w or c <= 0:
                continue
            items.append((w, c))
        items.sort(key=lambda x: (-x[1], x[0]))
        items = items[:15]
        for w, c in items:
            error_words_lines.append(f"{_safe_html(w)} - {c}")
    except Exception:
        error_words_lines = []

    medals_inline = ''
    if completion_count_value is not None:
        medals_inline = f"  🥇 {completion_count_value}"

    mode = str(report_header_mode or 'success').strip().lower()
    if mode == 'interim':
        first_line = f"📊 <b>{_safe_html(student_username)}</b>, промежуточные результаты"
    else:
        first_line = f"✅ <b>{_safe_html(student_username)}</b> выполнил(а) диктант"

    text = (
        f"{first_line}\n"
        f"<b>{_safe_html(dictation_title)}</b> (уровень {_safe_html(dictation_level)}){medals_inline}\n"
        f"Дата: {date_iso}"
    )
    if error_words_lines:
        text = text + "\n\n" + "<b>Слова с ошибками</b>\n" + "\n".join(error_words_lines)
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
                                   settings_json, error_words, report_header_mode: str = 'success') -> str:
    # Date line
    success_date_iso = datetime.now().date().isoformat()
    when_local = _fmt_user_local_dt(completed_at_ms, completed_at_tz_offset_min)
    date_line = when_local or success_date_iso

    # Totals
    def _int_or_0(x):
        try:
            return int(x or 0)
        except Exception:
            return 0

    totals_compact = f"{_int_or_0(perfect_count)}-{_int_or_0(corrected_count)}-{_int_or_0(audio_count)}-{_int_or_0(attempts_total)}-{_int_or_0(error_count)}"

    # Audio scheme
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
            typo = str(audio_cfg.get('typo') or '').strip()
            success_scheme = str(audio_cfg.get('success') or '').strip()
            if start or typo or success_scheme:
                audio_scheme_line = f"Схема аудио: {start} - {typo} - {success_scheme}\n"
    except Exception:
        audio_scheme_line = ''

    # Per-sentence lines
    lines = []
    rows = []
    if isinstance(sentences_data, list):
        for r in sentences_data:
            if not isinstance(r, dict):
                continue
            skey = r.get('sentence_key')
            if not skey:
                continue
            try:
                sentence = get_sentence_by_key(dictation_int, dictation_lang, str(skey))
            except Exception:
                sentence = None
            text_sentence = ''
            position = None
            if isinstance(sentence, dict):
                text_sentence = sentence.get('text') or ''
                position = sentence.get('position')

            rows.append(
                {
                    'sentence_key': str(skey),
                    'position': position,
                    'perfect_count': _int_or_0(r.get('perfect_count')),
                    'corrected_count': _int_or_0(r.get('corrected_count')),
                    'audio_count': _int_or_0(r.get('audio_count')),
                    'attempts_total': _int_or_0(r.get('attempts_total')),
                    'error_count': _int_or_0(r.get('error_count')),
                    'text': text_sentence,
                }
            )

    try:
        def _row_sort_key(x: dict):
            p = x.get('position')
            try:
                if p is not None:
                    return (0, int(p))
            except Exception:
                pass
            return (1, str(x.get('sentence_key') or ''))

        rows.sort(key=_row_sort_key)
    except Exception:
        pass

    rows = rows[:35]
    for i, rr in enumerate(rows, start=1):
        stars = f"{rr.get('perfect_count')}-{rr.get('corrected_count')}-{rr.get('audio_count')}"
        compact = f"{stars}-{rr.get('attempts_total')}-{rr.get('error_count')}"
        sent_text = _safe_html(rr.get('text'))
        if sent_text and len(sent_text) > 120:
            sent_text = sent_text[:117] + '...'
        lines.append(f"{i}) {compact}   {sent_text}")

    # Error words (reuse short builder logic)
    short_part = _build_teacher_report_text(
        student_username=student_username,
        dictation_title=dictation_title,
        dictation_level=dictation_level,
        date_iso=success_date_iso,
        completion_count_value=completion_count_value,
        error_words=error_words,
        report_header_mode=report_header_mode,
    )

    medals_inline = ''
    if completion_count_value is not None:
        medals_inline = f"  🥇 {completion_count_value}"

    mode = str(report_header_mode or 'success').strip().lower()
    if mode == 'interim':
        first_line = f"📊 <b>{_safe_html(student_username)}</b>, промежуточные результаты"
    else:
        first_line = f"✅ <b>{_safe_html(student_username)}</b>, вы успешно выполнили диктант"

    header = (
        f"{first_line}\n"
        f"<b>{_safe_html(dictation_title)}</b> (уровень {_safe_html(dictation_level)}){medals_inline}\n"
        f"Дата: {date_line}\n"
        f"Длительность: {_fmt_duration(time_ms)}\n"
        + (audio_scheme_line or '')
        + "\n"
        f"⭐ - ½⭐ - 🎤 - попыток - ошибок\n"
        f"Итоги: {totals_compact}"
    )

    # Extract error-words block from short_part (everything after first double newline)
    extra = ''
    try:
        if '\n\n' in short_part:
            extra = short_part.split('\n\n', 1)[1]
            extra = '\n\n' + extra
    except Exception:
        extra = ''

    body_lines = "\n" + "\n".join(lines) if lines else ''

    return header + (extra or '') + ("\n\n" + body_lines if body_lines else '')


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
    """Send a manual teacher report in Telegram when completion is outside today's plan."""
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

    if not is_telegram_enabled():
        return jsonify({'success': False, 'error': 'Telegram disabled'}), 400

    data = request.get_json(silent=True) or {}
    dictation_id_raw = data.get('dictation_id')
    teacher_user_ids = data.get('teacher_user_ids') or []

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

    today_iso = _today_iso_local()
    try:
        auto_chat_ids = list_teacher_chat_ids_for_student_success(
            student_user_id=int(user.get('id')),
            dictation_id=int(dictation_int),
            success_date_iso=today_iso,
        )
    except Exception:
        auto_chat_ids = []

    if auto_chat_ids:
        return jsonify({'success': False, 'error': 'auto_report_available'}), 409

    chat_ids = []
    try:
        chat_ids = filter_manual_teacher_chat_ids(
            int(user.get('id')),
            teacher_user_ids,
            dictation_language_code=dictation_lang,
        )
    except Exception:
        chat_ids = []

    if not chat_ids:
        return jsonify({'success': False, 'error': 'no_recipients'}), 400

    try:
        completion_count_after = data.get('completion_count_after')
        completion_count_value = int(completion_count_after) if completion_count_after is not None else None
    except Exception:
        completion_count_value = None
    if completion_count_value is None:
        try:
            completion_count_value = int(get_success_count(int(user.get('id')), int(dictation_int)) or 0)
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

    # Prefer full report when enough data is provided
    want_full = bool(data.get('sentences_data')) or data.get('time_ms') is not None
    if want_full:
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
            error_count=data.get('error_count') or 0,
            sentences_data=data.get('sentences_data') or [],
            dictation_int=int(dictation_int),
            dictation_lang=str(dictation_lang),
            settings_json=data.get('settings_json'),
            error_words=data.get('error_words'),
            report_header_mode=report_header_mode or 'success',
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

    return jsonify({'success': True, 'sent': sent, 'recipients': len(chat_ids)})


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

    # self
    try:
        if user.get('telegram_chat_id') and bool(user.get('telegram_enabled')):
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

    return jsonify({'success': True, 'recipients': recipients})


@statistics_bp.route('/teacher_report/send_auto', methods=['POST'])
@jwt_required()
def teacher_report_send_auto():
    """Send auto Telegram report after dictation completion to selected recipients."""
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

    # teachers: filter for this student + language + teacher telegram
    chat_ids = []
    try:
        chat_ids = filter_manual_teacher_chat_ids(
            int(user.get('id')),
            teacher_user_ids,
            dictation_language_code=dictation_lang,
        )
    except Exception:
        chat_ids = []

    # self chat
    self_chat_id = None
    try:
        if send_to_self and user.get('telegram_chat_id') and bool(user.get('telegram_enabled')):
            self_chat_id = int(user.get('telegram_chat_id'))
    except Exception:
        self_chat_id = None

    if not chat_ids and self_chat_id is None:
        return jsonify({'success': True, 'sent': 0, 'recipients': 0})

    try:
        completion_count_after = data.get('completion_count_after')
        completion_count_value = int(completion_count_after) if completion_count_after is not None else None
    except Exception:
        completion_count_value = None
    if completion_count_value is None:
        try:
            completion_count_value = int(get_success_count(int(user.get('id')), int(dictation_int)) or 0)
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
            error_count=data.get('error_count') or 0,
            sentences_data=data.get('sentences_data') or [],
            dictation_int=int(dictation_int),
            dictation_lang=str(dictation_lang),
            settings_json=data.get('settings_json'),
            error_words=data.get('error_words'),
            report_header_mode=report_header_mode or 'success',
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
        except Exception:
            pass

    return jsonify({'success': True, 'sent': sent, 'recipients': len(chat_ids) + (1 if self_chat_id is not None else 0)})


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
    Все данные теперь сохраняются в таблицу history_activity в БД.
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
    """Сохранить активность пользователя (perfect/corrected/audio) в БД"""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        # Временные логи для отладки
        print(f'📥 [SAVE_ACTIVITY] Получен запрос на сохранение активности')
        print(f'   email: {current_email}')
        print(f'   данные: {data}')
        
        dictation_id = data.get('dictation_id')  # может быть dict_<id> или integer
        type_activity = data.get('type_activity')  # 'perfect', 'corrected' или 'audio'
        number = data.get('number', 1)  # опционально, по умолчанию 1
        activity_date = data.get('date')  # опционально: YYYY-MM-DD
        dictation_language_code = data.get('dictation_language_code')
        selected_sentence_positions = data.get('selected_sentence_positions')
        
        if not dictation_id or not type_activity:
            print(f'❌ [SAVE_ACTIVITY] Ошибка: не указаны dictation_id или type_activity')
            return jsonify({'error': 'Не указаны dictation_id или type_activity'}), 400
        
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
        activity = add_activity(
            user_id,
            dictation_id,
            type_activity,
            number,
            activity_date,
            dictation_language_code,
            selected_sentence_positions,
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
    """Вернуть активность из history_activity за период (для отчёта "Статистика занятий")."""
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


@statistics_bp.route('/planfact', methods=['POST'])
@jwt_required()
def api_planfact_report():
    """Отчет План‑Факт: план из assignments + факт из history_successes и history_activity."""
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
                arr = list(raw_pos or [])
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
                    JOIN group_teachers gt ON gt.group_id = gs.group_id
                    JOIN users u ON u.id = gs.student_user_id
                    WHERE gt.teacher_user_id = %s
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

                # 2) Факт (successes): количество завершений по дню/диктанту/позициям.
                successes = {}
                cur.execute(
                    """
                    SELECT
                        hs.dictation_id,
                        hs.created_at::date AS d,
                        hs.selected_sentence_positions,
                        COUNT(*)::int AS cnt
                    FROM history_successes hs
                    LEFT JOIN dictations d ON d.id = hs.dictation_id
                    WHERE hs.user_id = %s
                      AND hs.created_at::date >= %s
                      AND hs.created_at::date <= %s
                      AND (%s IS NULL OR LOWER(COALESCE(d.language_code, '')) = %s)
                    GROUP BY hs.dictation_id, hs.created_at::date, hs.selected_sentence_positions
                    """,
                    (target_user_id, start_date, end_date, language_code_norm, language_code_norm),
                )
                for rr in (cur.fetchall() or []):
                    try:
                        did = int(rr.get('dictation_id') if isinstance(rr, dict) else rr[0])
                        day = rr.get('d') if isinstance(rr, dict) else rr[1]
                        raw_pos = rr.get('selected_sentence_positions') if isinstance(rr, dict) else rr[2]
                        cnt = int(rr.get('cnt') if isinstance(rr, dict) else rr[3])

                        pos_key = _positions_to_key(raw_pos)
                        k = (did, day.isoformat() if hasattr(day, 'isoformat') else str(day), pos_key)
                        successes[k] = cnt
                    except Exception:
                        continue

                # 3) Факт (activity): счетчики по дню/диктанту/позициям.
                activities = {}
                cur.execute(
                    """
                    SELECT
                        ha.date,
                        ha.dictation_id,
                        ha.selected_sentence_positions,
                        COALESCE(SUM(perfect_count), 0) AS perfect,
                        COALESCE(SUM(corrected_count), 0) AS corrected,
                        COALESCE(SUM(audio_count), 0) AS audio
                    FROM history_activity ha
                    LEFT JOIN dictations d ON d.id = ha.dictation_id
                    WHERE ha.user_id = %s
                      AND ha.date >= %s
                      AND ha.date <= %s
                      AND (%s IS NULL OR LOWER(COALESCE(d.language_code, '')) = %s)
                    GROUP BY ha.date, ha.dictation_id, ha.selected_sentence_positions
                    ORDER BY ha.date ASC, ha.dictation_id ASC
                    """,
                    (target_user_id, start_date, end_date, language_code_norm, language_code_norm),
                )
                for ar in (cur.fetchall() or []):
                    try:
                        if isinstance(ar, dict):
                            day = ar.get('date')
                            did = int(ar.get('dictation_id') or 0)
                            raw_pos = ar.get('selected_sentence_positions')
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
    """Рейтинг активности: агрегируем perfect/corrected/audio за период по self + ученики."""
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

        candidates = {current_user_id: str(user.get('username') or 'Я')}
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT u.id AS user_id, u.username
                    FROM group_students gs
                    JOIN group_teachers gt ON gt.group_id = gs.group_id
                    JOIN users u ON u.id = gs.student_user_id
                    WHERE gt.teacher_user_id = %s
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                      AND COALESCE(gs.notify_teacher_on_success, TRUE) = TRUE
                    ORDER BY u.id ASC
                    """,
                    (current_user_id,),
                )
                rows = cur.fetchall() or []
                for r in rows:
                    uid = int(r.get('user_id') if isinstance(r, dict) else r[0])
                    if uid == current_user_id:
                        continue
                    uname = (r.get('username') if isinstance(r, dict) else r[1])
                    candidates[uid] = str(uname or f"User #{uid}")

                user_ids = list(candidates.keys())
                aggregates = {}
                if user_ids:
                    if language_code and str(language_code).strip().lower() not in ('all', '*'):
                        cur.execute(
                            """
                            SELECT
                                user_id,
                                COALESCE(SUM(perfect_count), 0) AS perfect,
                                COALESCE(SUM(corrected_count), 0) AS corrected,
                                COALESCE(SUM(audio_count), 0) AS audio
                            FROM history_activity ha
                            LEFT JOIN dictations d ON d.id = ha.dictation_id
                            WHERE ha.user_id = ANY(%s)
                              AND ha.date >= %s
                              AND ha.date <= %s
                              AND COALESCE(ha.dictation_language_code, d.language_code) = %s
                            GROUP BY user_id
                            """,
                            (user_ids, start_date, end_date, str(language_code).strip().lower()),
                        )
                    else:
                        cur.execute(
                            """
                            SELECT
                                user_id,
                                COALESCE(SUM(perfect_count), 0) AS perfect,
                                COALESCE(SUM(corrected_count), 0) AS corrected,
                                COALESCE(SUM(audio_count), 0) AS audio
                            FROM history_activity
                            WHERE user_id = ANY(%s)
                              AND date >= %s
                              AND date <= %s
                            GROUP BY user_id
                            """,
                            (user_ids, start_date, end_date),
                        )
                    arows = cur.fetchall() or []
                    for ar in arows:
                        if isinstance(ar, dict):
                            uid = int(ar.get('user_id') or 0)
                            aggregates[uid] = {
                                'perfect': int(ar.get('perfect') or 0),
                                'corrected': int(ar.get('corrected') or 0),
                                'audio': int(ar.get('audio') or 0),
                            }
                        else:
                            uid = int(ar[0] or 0)
                            aggregates[uid] = {
                                'perfect': int(ar[1] or 0),
                                'corrected': int(ar[2] or 0),
                                'audio': int(ar[3] or 0),
                            }
        finally:
            conn.close()

        out = []
        for uid, uname in candidates.items():
            agg = aggregates.get(uid) or {}
            out.append(
                {
                    'user_id': int(uid),
                    'username': str(uname or f"User #{uid}"),
                    'perfect': int(agg.get('perfect') or 0),
                    'corrected': int(agg.get('corrected') or 0),
                    'audio': int(agg.get('audio') or 0),
                }
            )

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
                'rating': out,
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@statistics_bp.route('/activity/users', methods=['GET'])
@jwt_required()
def api_activity_users():
    """Список пользователей, по которым можно смотреть активность: self + ученики, давшие доступ."""
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
                    JOIN group_teachers gt ON gt.group_id = gs.group_id
                    JOIN users u ON u.id = gs.student_user_id
                    WHERE gt.teacher_user_id = %s
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                      AND COALESCE(gs.notify_teacher_on_success, TRUE) = TRUE
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


@statistics_bp.route('/success', methods=['POST'])
@jwt_required()
def save_success():
    """Сохранить успешное завершение диктанта в history_successes"""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        # Временные логи для отладки
        print(f'📥 [SAVE_SUCCESS] Получен запрос на сохранение успеха')
        print(f'   email: {current_email}')
        print(f'   данные: {data}')
        
        dictation_id = data.get('dictation_id')  # может быть dict_<id> или integer
        perfect_count = data.get('perfect_count', 0)
        corrected_count = data.get('corrected_count', 0)
        audio_count = data.get('audio_count', 0)
        attempts_total = data.get('attempts_total', 0)
        error_count = data.get('error_count', 0)
        time_ms = data.get('time_ms', 0)
        source_group_id = data.get('source_group_id')
        sentences_data = data.get('sentences_data')
        error_words = data.get('error_words')
        completed_at_ms = data.get('completed_at_ms')
        completed_at_tz_offset_min = data.get('completed_at_tz_offset_min')
        completion_count_after = data.get('completion_count_after')
        selected_sentence_positions = data.get('selected_sentence_positions')
        dictation_language_code = data.get('dictation_language_code')
        
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
            error_count,
            source_group_id=source_group_id,
            selected_sentence_positions=selected_sentence_positions,
            dictation_language_code=dictation_language_code,
        )

        # Telegram уведомления отправляются отдельной процедурой /teacher_report/send_auto
        try:
            if False and is_telegram_enabled():
                dictation_int = None
                if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
                    dictation_int = int(dictation_id.replace('dict_', ''))
                else:
                    dictation_int = int(dictation_id)

                success_date_iso = datetime.now().date().isoformat()
                teacher_chat_ids = list_teacher_chat_ids_for_student_success(
                    student_user_id=user_id,
                    dictation_id=dictation_int,
                    success_date_iso=success_date_iso,
                )

                if teacher_chat_ids:
                    info = get_student_and_dictation_info(user_id, dictation_int)
                    student_username = info.get('student_username') or 'Ученик'
                    dictation_title = info.get('dictation_title') or f'Диктант {dictation_int}'
                    dictation_level = info.get('dictation_level') or '—'

                    try:
                        completion_count_value = int(completion_count_after) if completion_count_after is not None else None
                    except Exception:
                        completion_count_value = None
                    if completion_count_value is None:
                        try:
                            completion_count_value = int(get_success_count(user_id, dictation_int) or 0)
                        except Exception:
                            completion_count_value = None

                    error_words_lines = []
                    try:
                        ew = error_words if isinstance(error_words, dict) else {}
                        items = []
                        for k, v in ew.items():
                            try:
                                w = str(k or '').strip()
                                c = int(v or 0)
                            except Exception:
                                continue
                            if not w or c <= 0:
                                continue
                            items.append((w, c))
                        items.sort(key=lambda x: (-x[1], x[0]))
                        items = items[:15]
                        for w, c in items:
                            error_words_lines.append(f"{_safe(w)} - {c}")
                    except Exception:
                        error_words_lines = []

                    text = (
                        f"✅ <b>{student_username}</b> выполнил(а) задание\n"
                        f"<b>{dictation_title}</b> (уровень {dictation_level})\n"
                        f"Дата: {success_date_iso}"
                    )
                    if completion_count_value is not None:
                        text = text + f"\n🥇 {completion_count_value}"
                    if error_words_lines:
                        text = text + "\n\n" + "<b>Слова с ошибками</b>\n" + "\n".join(error_words_lines)
                    for cid in teacher_chat_ids:
                        try:
                            send_telegram_message(cid, text)
                        except Exception:
                            pass
        except Exception:
            pass

        # Telegram self-report студенту отправляется отдельной процедурой /teacher_report/send_auto
        try:
            if False and is_telegram_enabled():
                if user.get('telegram_chat_id') and bool(user.get('telegram_enabled')) and bool(user.get('telegram_self_reports_enabled')):
                    dictation_int = None
                    if isinstance(dictation_id, str) and dictation_id.startswith('dict_'):
                        dictation_int = int(dictation_id.replace('dict_', ''))
                    else:
                        dictation_int = int(dictation_id)

                    success_date_iso = datetime.now().date().isoformat()
                    info = get_student_and_dictation_info(user_id, dictation_int)
                    student_username = info.get('student_username') or 'Вы'
                    dictation_title = info.get('dictation_title') or f'Диктант {dictation_int}'
                    dictation_level = info.get('dictation_level') or '—'

                    try:
                        from helpers.db_dictations import get_dictation_info

                        dictation_info = get_dictation_info(dictation_int) or {}
                        dictation_lang = dictation_info.get('language_code') or 'en'
                    except Exception:
                        dictation_lang = 'en'

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

                    def _safe(v: str) -> str:
                        v = str(v or '')
                        return (
                            v.replace('&', '&amp;')
                            .replace('<', '&lt;')
                            .replace('>', '&gt;')
                        )

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
                            # tz_offset_min: minutes east of UTC (e.g. +180)
                            dt_utc = datetime.utcfromtimestamp(ts_ms / 1000.0)
                            dt_local = dt_utc + timedelta(minutes=tz_offset_min)
                            return dt_local.strftime('%Y-%m-%d %H:%M')
                        except Exception:
                            return ''

                    # Build per-sentence table from payload + DB texts
                    rows = []
                    if isinstance(sentences_data, list):
                        for r in sentences_data:
                            if not isinstance(r, dict):
                                continue
                            skey = r.get('sentence_key')
                            if not skey:
                                continue
                            try:
                                sentence = get_sentence_by_key(dictation_int, dictation_lang, str(skey))
                            except Exception:
                                sentence = None
                            text_sentence = ''
                            position = None
                            if isinstance(sentence, dict):
                                text_sentence = sentence.get('text') or ''
                                position = sentence.get('position')

                            rows.append(
                                {
                                    'sentence_key': str(skey),
                                    'position': position,
                                    'perfect_count': int(r.get('perfect_count') or 0),
                                    'corrected_count': int(r.get('corrected_count') or 0),
                                    'audio_count': int(r.get('audio_count') or 0),
                                    'attempts_total': int(r.get('attempts_total') or 0),
                                    'error_count': int(r.get('error_count') or 0),
                                    'text': text_sentence,
                                }
                            )

                    # Sort by dictation position (fallback to sentence_key) and keep message bounded
                    try:
                        def _row_sort_key(x: dict):
                            p = x.get('position')
                            try:
                                if p is not None:
                                    return (0, int(p))
                            except Exception:
                                pass
                            return (1, str(x.get('sentence_key') or ''))

                        rows.sort(key=_row_sort_key)
                    except Exception:
                        pass
                    max_rows = 35
                    rows = rows[:max_rows]

                    lines = []
                    if rows:
                        # lines.append('№) ⭐ - ½⭐ - 🎤 - попыток - ошибок  текст')
                        for i, rr in enumerate(rows, start=1):
                            stars = f"{rr.get('perfect_count')}-{rr.get('corrected_count')}-{rr.get('audio_count')}"
                            att = rr.get('attempts_total')
                            err = rr.get('error_count')
                            compact = f"{stars}-{att}-{err}"
                            sent_text = _safe(rr.get('text'))
                            if sent_text and len(sent_text) > 120:
                                sent_text = sent_text[:117] + '...'
                            lines.append(f"{i}) {compact}   {sent_text}")

                    when_local = _fmt_user_local_dt(completed_at_ms, completed_at_tz_offset_min)
                    date_line = success_date_iso
                    if when_local:
                        date_line = when_local

                    totals_compact = (
                        f"{int(perfect_count or 0)}-{int(corrected_count or 0)}-{int(audio_count or 0)}-"
                        f"{int(attempts_total or 0)}-{int(error_count or 0)}"
                    )

                    try:
                        completion_count_value = int(completion_count_after) if completion_count_after is not None else None
                    except Exception:
                        completion_count_value = None
                    if completion_count_value is None:
                        try:
                            completion_count_value = int(get_success_count(user_id, dictation_int) or 0)
                        except Exception:
                            completion_count_value = None

                    audio_scheme_line = ''
                    try:
                        sj = data.get('settings_json')
                        if isinstance(sj, str) and sj.strip():
                            sj_obj = json.loads(sj)
                        elif isinstance(sj, dict):
                            sj_obj = sj
                        else:
                            sj_obj = None
                        if isinstance(sj_obj, dict):
                            audio_cfg = sj_obj.get('audio') if isinstance(sj_obj.get('audio'), dict) else {}
                            start = str(audio_cfg.get('start') or '').strip()
                            typo = str(audio_cfg.get('typo') or '').strip()
                            success_scheme = str(audio_cfg.get('success') or '').strip()
                            if start or typo or success_scheme:
                                audio_scheme_line = f"Схема аудио: {start} - {typo} - {success_scheme}\n"
                    except Exception:
                        audio_scheme_line = ''

                    error_words_lines = []
                    try:
                        ew = error_words if isinstance(error_words, dict) else {}
                        items = []
                        for k, v in ew.items():
                            try:
                                w = str(k or '').strip()
                                c = int(v or 0)
                            except Exception:
                                continue
                            if not w or c <= 0:
                                continue
                            items.append((w, c))
                        items.sort(key=lambda x: (-x[1], x[0]))
                        items = items[:30]
                        for w, c in items:
                            error_words_lines.append(f"{_safe(w)} - {c}")
                    except Exception:
                        error_words_lines = []

                    text = (
                        f"✅ <b>{_safe(student_username)}</b>, вы успешно выполнили диктант\n"
                        f"<b>{_safe(dictation_title)}</b> (уровень {_safe(dictation_level)}) 🥇"
                        + (f"{completion_count_value}" if completion_count_value is not None else "")
                        + "\n"
                        f"Дата: {date_line}\n"
                        f"Длительность: {_fmt_duration(time_ms)}\n"
                        + (audio_scheme_line or "")
                        + "\n"
                        f"⭐ - ½⭐ - 🎤 - попыток - ошибок\n"
                        f"Итоги: {totals_compact}"
                    )
                    if error_words_lines:
                        text = text + "\n\n" + "<b>Слова с ошибками</b>\n" + "\n".join(error_words_lines)
                    if lines:
                        text = text + "\n\n" + "\n".join(lines)

                    send_telegram_message(int(user.get('telegram_chat_id')), text)
        except Exception:
            pass
        
        print(f'✅ [SAVE_SUCCESS] Успех успешно сохранен в БД')
        
        return jsonify({
            'success': True,
            'success_data': success
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

