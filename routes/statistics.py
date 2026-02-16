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
    save_unclosed_dictation, get_unclosed_dictation, delete_unclosed_dictation, get_unclosed_dictation_stats
)

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
# API для работы с черновиками диктантов (resume state)
# ==============================================================

@statistics_bp.route('/dictation_state/<dictation_id>', methods=['GET'])
@jwt_required()
def get_dictation_state(dictation_id):
    """Получить состояние черновика диктанта из БД"""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = user['id']
        
        # Получаем данные из БД
        unclosed = get_unclosed_dictation(user_id, dictation_id)
        if not unclosed:
            return jsonify({'state': None})
        
        # Преобразуем в формат, ожидаемый фронтендом
        settings = json.loads(unclosed['settings_json']) if unclosed['settings_json'] else {}
        
        # Формируем per_sentence в формате, ожидаемом фронтендом
        per_sentence = {}
        for sentence in unclosed.get('sentences', []):
            selection_state = sentence.get('selection_state', 'unchecked')
            
            per_sentence[sentence['sentence_key']] = {
                'number_of_perfect': sentence['perfect_count'],
                'number_of_corrected': sentence['corrected_count'],
                'number_of_audio': sentence['audio_count'],
                'attempts_total': sentence.get('attempts_total', 0),
                'error_count': sentence.get('error_count', 0),
                'selection_state': selection_state
            }
        
        audio_settings = settings.get('audio', {})
        state = {
            'dictation_id': dictation_id,
            'time_ms': unclosed['time_ms'],
            'playSequenceStart': audio_settings.get('start', 'oto'),
            'playSequenceTypo': audio_settings.get('typo', 'o'),
            'playSequenceSuccess': audio_settings.get('success', 'ot'),
            'audio_repeats': audio_settings.get('repeats', 3),
            'is_mixed': settings.get('sentence_order') == 'mixed',
            'per_sentence': per_sentence,
            'date_saved': int(unclosed['updated_at'].replace('-', '').replace(' ', '').replace(':', '')[:8]) if unclosed['updated_at'] else 0,
            # Возвращаем settings_json для использования на фронтенде
            'settings_json': unclosed.get('settings_json')
        }
        
        return jsonify({'state': state})
        
    except Exception as e:
        print(f'Ошибка получения состояния диктанта: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка получения состояния'}), 500


@statistics_bp.route('/dictation_state/save', methods=['POST'])
@jwt_required()
def save_dictation_state():
    """Сохранить состояние черновика диктанта в БД"""
    try:
        current_email = get_jwt_identity()
        data = request.get_json()
        
        dictation_id = data.get('dictation_id')
        state = data.get('state')
        
        if not dictation_id or not state:
            return jsonify({'error': 'Не указаны dictation_id или state'}), 400
        
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = user['id']
        
        # Используем settings_json из state, если он есть, иначе формируем
        if 'settings_json' in state and state['settings_json']:
            try:
                # Проверяем, что это валидный JSON
                settings_json = state['settings_json']
                json.loads(settings_json)  # Проверка валидности
            except (json.JSONDecodeError, TypeError):
                # Если невалидный JSON, формируем заново
                settings = {
                    'audio': {
                        'start': state.get('playSequenceStart', 'oto'),
                        'typo': state.get('playSequenceTypo', 'o'),
                        'success': state.get('playSequenceSuccess', 'ot'),
                        'repeats': state.get('audio_repeats', 3),
                        'without_entering_text': False,
                        'show_text': False
                    },
                    'sentence_order': 'mixed' if state.get('is_mixed') else 'direct'
                }
                settings_json = json.dumps(settings)
        else:
            # Формируем settings_json из отдельных полей
            settings = {
                'audio': {
                    'start': state.get('playSequenceStart', 'oto'),
                    'typo': state.get('playSequenceTypo', 'o'),
                    'success': state.get('playSequenceSuccess', 'ot'),
                    'repeats': state.get('audio_repeats', 3),
                    'without_entering_text': False,
                    'show_text': False
                },
                'sentence_order': 'mixed' if state.get('is_mixed') else 'direct'
            }
            settings_json = json.dumps(settings)
        
        # Формируем данные по предложениям
        sentences_data = []
        per_sentence = state.get('per_sentence', {})
        for sentence_key, sentence_data in per_sentence.items():
            selection_state = sentence_data.get('selection_state', 'unchecked')
            
            # Валидация значения
            if selection_state not in ('unchecked', 'checked', 'completed'):
                selection_state = 'unchecked'
            
            sentences_data.append({
                'sentence_key': sentence_key,
                # ИСПРАВЛЕНО: Убрано суммирование с circle_number_of_* так как логика "circle" удалена
                # Теперь number_of_perfect и number_of_corrected уже содержат итоговые значения
                'perfect_count': sentence_data.get('number_of_perfect', 0),
                'corrected_count': sentence_data.get('number_of_corrected', 0),
                'audio_count': sentence_data.get('number_of_audio', 0),
                'attempts_total': sentence_data.get('attempts_total', 0),
                'error_count': sentence_data.get('error_count', 0),
                'selection_state': selection_state
            })
        
        time_ms = state.get('time_ms', 0)
        
        # Сохраняем в БД
        save_unclosed_dictation(user_id, dictation_id, time_ms, settings_json, sentences_data)
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f'Ошибка сохранения состояния диктанта: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка сохранения состояния'}), 500


@statistics_bp.route('/dictation_state/<dictation_id>', methods=['DELETE'])
@jwt_required()
def delete_dictation_state(dictation_id):
    """Удалить черновик диктанта из БД (после успешного завершения)"""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        user_id = user['id']
        
        # Удаляем из БД
        delete_unclosed_dictation(user_id, dictation_id)
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f'Ошибка удаления состояния диктанта: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка удаления состояния'}), 500


@statistics_bp.route('/dictation_state/list', methods=['GET'])
@jwt_required()
def list_dictation_states():
    """Получить список всех черновиков из БД (для подсветки в индексе)"""
    try:
        current_email = get_jwt_identity()
        user = get_user_by_email(current_email)
        if not user:
            return jsonify({'drafts': []})
        
        user_id = user['id']
        
        # Получаем список незавершенных диктантов из БД
        from helpers.db import get_db_connection
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT dictation_id, updated_at
                    FROM history_unclosed_dictations
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                """, (user_id,))
                
                rows = cur.fetchall()
                drafts = []
                for row in rows:
                    dictation_id = row[0]
                    updated_at = row[1]
                    # Преобразуем в формат dict_<id>
                    dictation_id_str = f'dict_{dictation_id}'
                    # Преобразуем дату в формат YYYYMMDD
                    date_saved = int(updated_at.strftime('%Y%m%d')) if updated_at else 0
                    drafts.append({
                        'dictation_id': dictation_id_str,
                        'date_saved': date_saved
                    })
                
                return jsonify({'drafts': drafts})
        finally:
            conn.close()
        
    except Exception as e:
        print(f'Ошибка получения списка черновиков: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Ошибка получения списка'}), 500


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
        
        # Сохраняем активность в БД (агрегируется по дням автоматически)
        activity = add_activity(user_id, dictation_id, type_activity, number)
        
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
        success = add_success(user_id, dictation_id, perfect_count, corrected_count, audio_count, time_ms, attempts_total, error_count)

        # После успешного завершения диктанта обязательно очищаем незавершенное состояние,
        # иначе на карточке/рабочем столе будут оставаться звезды/микрофоны.
        try:
            delete_unclosed_dictation(user_id, dictation_id)
            print(f'✅ [SAVE_SUCCESS] Незавершенный диктант удален из БД')
        except Exception as e:
            print(f'⚠️ [SAVE_SUCCESS] Ошибка удаления незавершенного диктанта: {e}')
        
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

