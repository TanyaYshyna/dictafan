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
)
from helpers.db_telegram import list_teacher_chat_ids_for_student_success, get_student_and_dictation_info
from helpers.telegram import is_telegram_enabled, send_telegram_message
from helpers.db_dictations import get_sentence_by_key

statistics_bp = Blueprint('statistics', __name__, url_prefix='/api/statistics')


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
        
        # Сохраняем активность в БД (агрегируется по дням)
        activity = add_activity(user_id, dictation_id, type_activity, number, activity_date)
        
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
        )

        # Telegram уведомление учителю (MVP): только если есть активное задание и включены уведомления
        try:
            if is_telegram_enabled():
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
                        text = text + f"\n🥇 Медали: {completion_count_value}"
                    if error_words_lines:
                        text = text + "\n\n" + "<b>Слова с ошибками</b>\n" + "\n".join(error_words_lines)
                    for cid in teacher_chat_ids:
                        try:
                            send_telegram_message(cid, text)
                        except Exception:
                            pass
        except Exception:
            pass

        # Telegram self-report студенту (если включено): при любом success
        try:
            if is_telegram_enabled():
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
                        f"<b>{_safe(dictation_title)}</b> (уровень {_safe(dictation_level)}) 🥇\n"
                        f"Дата: {date_line}\n"
                        f"Длительность: {_fmt_duration(time_ms)}\n"
                        + (f"🥇 Медали: {completion_count_value}\n" if completion_count_value is not None else "")
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

