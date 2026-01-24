from flask import Blueprint, abort, current_app, render_template, url_for, jsonify, request
from helpers.language_data import load_language_data
from helpers.user_helpers import get_current_user, login_required, get_safe_email
from helpers.db_dictations import get_dictation_by_id, get_dictation_sentences
from routes.index import get_cover_url_for_id

dictation_bp = Blueprint('dictation', __name__)

@dictation_bp.route('/dictation')
def dictation():
    return render_template('dictation.html', language_data=load_language_data())


# ==============================================================
# Форма тернеровки деиктантов (все предложения на одной странице)
@dictation_bp.route('/dictation/<dictation_id>/<lang_orig>/<lang_tr>')
def show_dictation(dictation_id, lang_orig, lang_tr):
    """
    Отображает страницу диктанта, загружая данные из базы данных PostgreSQL.
    """
    try:
        # Извлекаем числовой ID из формата dict_<id>
        if not dictation_id.startswith('dict_') or dictation_id.startswith('dict_temp_'):
            current_app.logger.error(f"Неверный формат ID диктанта: {dictation_id}")
            abort(500, description=f"Неверный формат ID диктанта: {dictation_id}")
        
        # Извлекаем числовой ID
        db_id = int(dictation_id.replace('dict_', ''))
        
        # Получаем метаданные диктанта из БД
        dictation_data = get_dictation_by_id(db_id)
        
        if not dictation_data:
            current_app.logger.error(f"Диктант с ID {dictation_id} (db_id={db_id}) не найден в БД")
            abort(500, description=f"Диктант не найден в базе данных")
        
        # Извлекаем данные диктанта
        title = dictation_data.get('title', 'Без названия')
        level = dictation_data.get('level', 'A1')
        speakers = dictation_data.get('speakers', {})
        # ИСПРАВЛЕНО: is_dialog определяется явно - если speakers пустой или None, то не диалог
        # Если speakers содержит значения, проверяем что это не дефолтные "Спикер 1", "Спикер 2"
        is_dialog = False
        if speakers and isinstance(speakers, dict) and len(speakers) > 0:
            # Проверяем, есть ли хотя бы одно непустое значение
            # Если все значения - это дефолтные "Спикер X", то не считаем диалогом
            has_real_speaker = False
            for speaker_id, speaker_name in speakers.items():
                name = str(speaker_name).strip() if speaker_name else ''
                if name:
                    # Проверяем, что это не дефолтное значение типа "Спикер 1", "Спикер1", "Спикер 2" и т.д.
                    name_lower = name.lower().replace(' ', '')
                    if not (name_lower.startswith('спикер') and len(name_lower.replace('спикер', '').strip()) <= 2):
                        has_real_speaker = True
                        break
            is_dialog = has_real_speaker
            current_app.logger.info(f"[show_dictation] speakers={speakers}, is_dialog={is_dialog}")
        
        # Получаем переводы заголовка
        title_translations = dictation_data.get('title_translations', {})
        dictation_lang = dictation_data.get('language_code', '')
        
        # Выбираем заголовок:
        # 1. Если есть перевод для языка оригинала - используем его
        # 2. Если язык оригинала совпадает с языком диктанта - используем основной заголовок
        # 3. Иначе используем основной заголовок (он уже установлен выше)
        if lang_orig in title_translations:
            title = title_translations[lang_orig]
        elif dictation_lang == lang_orig:
            # Язык оригинала совпадает с языком диктанта - используем основной заголовок
            title = dictation_data.get('title', 'Без названия')
        
        # Получаем предложения для языка оригинала из БД
        original_sentences = get_dictation_sentences(db_id, lang_orig)
        
        # Получаем предложения для языка перевода из БД
        translation_sentences = get_dictation_sentences(db_id, lang_tr)
        
        # Создаем словарь переводов по ключу предложения
        translation_dict = {s['sentence_key']: s for s in translation_sentences}
        
        # Формируем массив предложений в формате, ожидаемом шаблоном
        sentences = []
        for orig_sentence in original_sentences:
            sentence_key = orig_sentence['sentence_key']
            translated = translation_dict.get(sentence_key, {})
            
            # Получаем все типы аудио для оригинала
            audio_o_file = orig_sentence.get('audio', '')
            audio_a_file = orig_sentence.get('audio_avto', '')
            audio_f_file = orig_sentence.get('audio_user', '')
            audio_m_file = orig_sentence.get('audio_mic', '')
            # Для перевода используем поле audio из данных перевода (язык lang_tr)
            audio_tr_file = translated.get('audio', '')
            
            # Логирование для отладки (только для первого предложения)
            if sentence_key == '001' or (not audio_tr_file and translated):
                current_app.logger.debug(f"🔍 [dictation] Предложение {sentence_key}: "
                    f"translated keys={list(translated.keys()) if translated else 'empty'}, "
                    f"audio={translated.get('audio', 'NONE')}, "
                    f"audio_avto={translated.get('audio_avto', 'NONE')}, "
                    f"audio_tr_file={audio_tr_file}, "
                    f"lang_tr={lang_tr}")
            
            # Формируем URL для аудио файлов
            sentence = {
                "key": sentence_key,
                "text": orig_sentence.get("text", ""),
                "translation": translated.get("text", ""),
                "audio": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_o_file}") if audio_o_file else "",
                "audio_a": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_a_file}") if audio_a_file else "",
                "audio_f": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_f_file}") if audio_f_file else "",
                "audio_m": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_m_file}") if audio_m_file else "",
                "audio_tr": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_tr}/{audio_tr_file}") if audio_tr_file else "",
                "completed_correctly": False,
                "speaker": orig_sentence.get("speaker"),
                "explanation": translated.get("explanation", "")
            }
            
            sentences.append(sentence)
        
        # Получаем текущего пользователя
        current_user = get_current_user()
        
        # Получаем URL обложки
        cover_url = get_cover_url_for_id(dictation_id, lang_orig)
        
        # Используем ID диктанта как номер диктанта (можно заменить на отдельное поле, если будет)
        dikt_numer = dictation_id
        
        # Логирование для отладки
        current_app.logger.debug(f"🔍 [dictation] Рендеринг шаблона: lang_orig={lang_orig}, lang_tr={lang_tr}")
        
        # Получаем author_materials_url из данных диктанта
        author_materials_url = dictation_data.get('author_materials_url')
        
        # Рендерим страницу БЕЗ предложений в JSON (загружаются через API)
        return render_template(
            "dictation.html",
            dictation_id=dictation_id,
            title_orig=title,
            level=level,
            language_original=lang_orig,
            language_translation=lang_tr,
            sentences=None,  # Предложения больше не передаются через шаблон
            current_user=current_user,
            is_dialog=is_dialog,
            speakers=speakers,
            cover_url=cover_url,
            dikt_numer=dikt_numer,
            author_materials_url=author_materials_url,
            language_data=load_language_data()
        )
        
    except Exception as e:
        current_app.logger.error(f"Ошибка при загрузке диктанта {dictation_id}: {e}", exc_info=True)
        abort(500, description=f"Ошибка загрузки диктанта: {str(e)}")


# ==============================================================
# API endpoint для загрузки предложений диктанта
@dictation_bp.route('/api/dictation/<dictation_id>/<lang_orig>/<lang_tr>/sentences', methods=['GET'])
def api_get_dictation_sentences(dictation_id, lang_orig, lang_tr):
    """
    API endpoint для загрузки предложений диктанта из БД.
    Заменяет загрузку из JSON в HTML.
    """
    try:
        # Извлекаем числовой ID из формата dict_<id>
        if not dictation_id.startswith('dict_') or dictation_id.startswith('dict_temp_'):
            return jsonify({'error': f'Неверный формат ID диктанта: {dictation_id}'}), 400
        
        # Извлекаем числовой ID
        db_id = int(dictation_id.replace('dict_', ''))
        
        # Получаем предложения для языка оригинала из БД
        original_sentences = get_dictation_sentences(db_id, lang_orig)
        
        # Получаем предложения для языка перевода из БД
        translation_sentences = get_dictation_sentences(db_id, lang_tr)
        
        # Создаем словарь переводов по ключу предложения
        translation_dict = {s['sentence_key']: s for s in translation_sentences}
        
        # Формируем массив предложений в формате, ожидаемом фронтендом
        sentences = []
        for orig_sentence in original_sentences:
            sentence_key = orig_sentence['sentence_key']
            translated = translation_dict.get(sentence_key, {})
            
            # Получаем все типы аудио для оригинала
            audio_o_file = orig_sentence.get('audio', '')
            audio_a_file = orig_sentence.get('audio_avto', '')
            audio_f_file = orig_sentence.get('audio_user', '')
            audio_m_file = orig_sentence.get('audio_mic', '')
            # Для перевода используем поле audio из данных перевода (язык lang_tr)
            audio_tr_file = translated.get('audio', '')
            
            # Формируем URL для аудио файлов
            sentence = {
                "key": sentence_key,
                "text": orig_sentence.get("text", ""),
                "translation": translated.get("text", ""),
                "audio": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_o_file}") if audio_o_file else "",
                "audio_a": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_a_file}") if audio_a_file else "",
                "audio_f": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_f_file}") if audio_f_file else "",
                "audio_m": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_orig}/{audio_m_file}") if audio_m_file else "",
                "audio_tr": url_for('static', filename=f"data/dictations/{dictation_id}/{lang_tr}/{audio_tr_file}") if audio_tr_file else "",
                "completed_correctly": False,
                "speaker": orig_sentence.get("speaker"),
                "explanation": translated.get("explanation", "")
            }
            
            sentences.append(sentence)
        
        return jsonify({
            'success': True,
            'sentences': sentences
        })
        
    except Exception as e:
        current_app.logger.error(f"Ошибка при загрузке предложений диктанта {dictation_id}: {e}", exc_info=True)
        return jsonify({'error': f'Ошибка загрузки предложений: {str(e)}'}), 500


@dictation_bp.route('/api/dictation/<int:dictation_id>', methods=['GET'])
def api_get_dictation(dictation_id):
    """
    API для получения данных диктанта по ID.
    """
    try:
        dictation_data = get_dictation_by_id(dictation_id)
        
        if not dictation_data:
            return jsonify({'success': False, 'error': 'Диктант не найден'}), 404
        
        # Формируем URL обложки
        cover_url = get_cover_url_for_id(f"dict_{dictation_id}")
        
        return jsonify({
            'success': True,
            'dictation': {
                'id': dictation_data.get('id'),
                'title': dictation_data.get('title', 'Без названия'),
                'level': dictation_data.get('level', 'A1'),
                'language_code': dictation_data.get('language_code', 'en'),
                'cover_url': cover_url,
                'author_materials_url': dictation_data.get('author_materials_url')
            }
        })
    except Exception as e:
        current_app.logger.error(f"Ошибка при получении данных диктанта {dictation_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': f'Ошибка получения данных: {str(e)}'}), 500


@dictation_bp.route('/api/dictation/<int:dictation_id>/sentences', methods=['GET'])
def api_get_dictation_sentences_simple(dictation_id):
    """
    API для получения предложений диктанта по ID (только оригинал).
    """
    try:
        # Получаем язык оригинала из данных диктанта
        dictation_data = get_dictation_by_id(dictation_id)
        if not dictation_data:
            return jsonify({'success': False, 'error': 'Диктант не найден'}), 404
        
        lang_orig = dictation_data.get('language_code', 'en')
        
        # Получаем предложения для языка оригинала
        original_sentences = get_dictation_sentences(dictation_id, lang_orig)
        
        # Формируем массив предложений
        sentences = []
        for orig_sentence in original_sentences:
            sentence_key = orig_sentence.get('sentence_key', '')
            audio_file = orig_sentence.get('audio') or orig_sentence.get('audio_avto') or ''
            
            # Формируем URL для аудио
            audio_url = ''
            if audio_file:
                audio_url = url_for('static', filename=f"data/dictations/dict_{dictation_id}/{lang_orig}/{audio_file}")
            
            sentence = {
                'sentence_key': sentence_key,
                'text': orig_sentence.get('text', ''),
                'audio': audio_url,
                'audio_file': audio_file
            }
            sentences.append(sentence)
        
        return jsonify({
            'success': True,
            'sentences': sentences
        })
        
    except Exception as e:
        current_app.logger.error(f"Ошибка при загрузке предложений диктанта {dictation_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': f'Ошибка загрузки предложений: {str(e)}'}), 500


# ==============================================================
# API endpoint для офлайн распознавания речи (заглушка)
@dictation_bp.route('/api/speech-recognition/transcribe', methods=['POST'])
def transcribe_audio():
    """
    Заглушка для локального распознавания речи.
    В будущем здесь будет реализация с использованием локальных библиотек распознавания.
    """
    return jsonify({
        'success': False,
        'error': 'Локальное распознавание речи пока не реализовано',
        'fallback': True
    }), 501

