from flask import Blueprint, abort, after_this_request, current_app, jsonify, render_template, send_from_directory, url_for, request, redirect
import os
import re
import tempfile
from werkzeug.utils import secure_filename
from helpers.language_data import load_language_data
from helpers.user_helpers import get_current_user, login_required, get_safe_email
from helpers.db_dictations import get_dictation_by_id, get_dictation_sentences
from routes.index import get_cover_url_for_id

dictation_bp = Blueprint('dictation', __name__)


def _infer_lang_from_audio_filename(filename, fallback=''):
    try:
        name = secure_filename(filename or '')
        if not name:
            return (fallback or '').strip().lower()
        base = name.rsplit('/', 1)[-1]
        base = base.rsplit('.', 1)[0]
        parts = [p.strip().lower() for p in base.split('_') if p.strip()]
        if len(parts) >= 2:
            cand = parts[1]
            if re.match(r'^[a-z]{2,5}$', cand):
                return cand
        for p in parts:
            if re.match(r'^[a-z]{2,5}$', p):
                return p
    except Exception:
        pass
    return (fallback or '').strip().lower()


def _send_dictation_audio_from_b2(dictation_id, lang, filename):
    """Получение аудио диктанта из B2.

    Ожидаемый путь в B2:
      dictations/<dictation_id>/<lang>/<filename>
    где dictation_id в формате dict_<id>.
    """
    from helpers.b2_storage import b2_storage

    if not b2_storage.enabled:
        return jsonify({'error': 'B2 storage is disabled'}), 503

    if not dictation_id or not dictation_id.startswith('dict_') or dictation_id.startswith('dict_temp_'):
        return jsonify({'error': f'Invalid dictation_id: {dictation_id}'}), 400

    safe_lang = (lang or '').strip().lower()
    if not safe_lang:
        return jsonify({'error': 'Missing language'}), 400

    safe_name = secure_filename(filename or '')
    if not safe_name:
        return jsonify({'error': 'Missing filename'}), 400

    try:
        current_app.logger.info(
            "[dictation_audio] request dictation_id=%s lang=%s filename=%s",
            dictation_id,
            safe_lang,
            safe_name,
        )
    except Exception:
        pass

    remote_path = f"dictations/{dictation_id}/{safe_lang}/{safe_name}"
    try:
        exists = b2_storage.file_exists(remote_path, raise_on_error=True)
    except Exception:
        return jsonify({'error': 'B2 storage unavailable'}), 503

    if not exists:
        inferred_lang = _infer_lang_from_audio_filename(safe_name, fallback=safe_lang)
        if inferred_lang and inferred_lang != safe_lang:
            remote_path2 = f"dictations/{dictation_id}/{inferred_lang}/{safe_name}"
            try:
                exists2 = b2_storage.file_exists(remote_path2, raise_on_error=True)
            except Exception:
                return jsonify({'error': 'B2 storage unavailable'}), 503
            if exists2:
                remote_path = remote_path2
                exists = True

    try:
        current_app.logger.info(
            "[dictation_audio] resolve dictation_id=%s requested_lang=%s remote_path=%s exists=%s",
            dictation_id,
            safe_lang,
            remote_path,
            bool(exists),
        )
    except Exception:
        pass

    if not exists:
        try:
            current_app.logger.warning(
                "[dictation_audio] NOT FOUND dictation_id=%s lang=%s filename=%s remote_path=%s",
                dictation_id,
                safe_lang,
                safe_name,
                remote_path,
            )
        except Exception:
            pass
        return jsonify({'error': 'Audio file not found'}), 404

    tmp = tempfile.NamedTemporaryFile(prefix='dict_audio_', suffix=f"_{safe_name}", delete=False)
    tmp_path = tmp.name
    tmp.close()

    ok = b2_storage.download_file(remote_path, tmp_path)
    if not ok:
        try:
            current_app.logger.warning(
                "[dictation_audio] download failed dictation_id=%s remote_path=%s tmp_path=%s",
                dictation_id,
                remote_path,
                tmp_path,
            )
        except Exception:
            pass
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return jsonify({'error': 'Failed to download audio from B2'}), 502

    @after_this_request
    def _cleanup_tmp(response):
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return response

    return send_from_directory(os.path.dirname(tmp_path), os.path.basename(tmp_path))


@dictation_bp.route('/api/dictations/<dictation_id>/<lang>/<path:filename>', methods=['GET'])
def api_get_dictation_audio_v2(dictation_id, lang, filename):
    """Новый endpoint: полностью дублирует структуру хранилища dictations/<dictationId>/<lang>/<filename>."""
    return _send_dictation_audio_from_b2(dictation_id, lang, filename)


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
        
        # Enforce original language from dictation meta (avoid opening with user's current learning language)
        real_orig = str(dictation_data.get('language_code') or '').strip().lower()
        req_orig = (lang_orig or '').strip().lower()
        if real_orig and req_orig and real_orig != req_orig:
            try:
                return redirect(f"/dictation/{dictation_id}/{real_orig}/{(lang_tr or '').strip().lower() or real_orig}")
            except Exception:
                return redirect(f"/dictation/{dictation_id}/{real_orig}/{real_orig}")

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

        # Получаем текущего пользователя (нужно для выбора языка перевода по умолчанию)
        current_user = get_current_user()

        # Выбираем язык перевода:
        # - если родной язык пользователя есть среди переводов диктанта -> используем его
        # - иначе, если запрошенный lang_tr существует -> используем его
        # - иначе -> первый доступный перевод
        # - иначе -> совпадает с оригиналом (перевода нет)
        effective_lang_tr = (lang_tr or '').strip().lower()
        try:
            from helpers.db_dictations import get_dictation_translation_flags
            flags = get_dictation_translation_flags(db_id) or {}
            orig_norm = (lang_orig or '').strip().lower()
            available_translations = sorted([
                str(k).strip().lower()
                for k, v in (flags or {}).items()
                if v and k and str(k).strip().lower() and (not orig_norm or str(k).strip().lower() != orig_norm)
            ])
        except Exception:
            available_translations = []

        if not available_translations:
            try:
                all_sentences_for_langs = get_dictation_sentences(db_id)
                orig_norm = (lang_orig or '').strip().lower()
                langs = set()
                for s in (all_sentences_for_langs or []):
                    try:
                        lc = str(s.get('language_code') or '').strip().lower()
                    except Exception:
                        lc = ''
                    if not lc:
                        continue
                    if orig_norm and lc == orig_norm:
                        continue
                    langs.add(lc)
                available_translations = sorted(list(langs))
            except Exception:
                available_translations = []

        try:
            user_native = (current_user or {}).get('native_language')
            user_native = str(user_native).strip().lower() if user_native else ''
        except Exception:
            user_native = ''

        lang_notice = ''

        if user_native and user_native in available_translations:
            effective_lang_tr = user_native
        elif effective_lang_tr and effective_lang_tr in available_translations:
            pass
        elif available_translations:
            effective_lang_tr = available_translations[0]
        else:
            effective_lang_tr = (lang_orig or '').strip().lower()

        try:
            if user_native and user_native not in available_translations and available_translations:
                if len(available_translations) == 1 and effective_lang_tr == available_translations[0]:
                    lang_notice = f"Перевода на «{user_native}» нет — открыт единственный доступный перевод ({effective_lang_tr})."
                elif effective_lang_tr in available_translations:
                    lang_notice = f"Перевода на «{user_native}» нет — открыт другой доступный перевод ({effective_lang_tr})."
        except Exception:
            lang_notice = ''

        # If URL translation doesn't match effective translation, redirect to canonical URL.
        req_tr = (lang_tr or '').strip().lower()
        if req_tr and effective_lang_tr and req_tr != effective_lang_tr:
            try:
                return redirect(f"/dictation/{dictation_id}/{(lang_orig or '').strip().lower()}/{effective_lang_tr}")
            except Exception:
                pass

        # Получаем предложения для языка перевода из БД
        translation_sentences = get_dictation_sentences(db_id, effective_lang_tr)
        
        # Создаем словарь переводов по ключу предложения
        translation_dict = {s['sentence_key']: s for s in translation_sentences}
        
        # Формируем массив предложений в формате, ожидаемом шаблоном
        sentences = []
        for orig_sentence in original_sentences:
            sentence_key = orig_sentence['sentence_key']
            translated = translation_dict.get(sentence_key, {})
            
            # Получаем все типы аудио для оригинала
            audio_o_file = orig_sentence.get('audio', '')
            audio_f_file = orig_sentence.get('audio_file', '')
            audio_m_file = orig_sentence.get('audio_mic', '')
            # Для перевода используем поле audio из данных перевода (язык lang_tr)
            audio_tr_file = translated.get('audio', '')
            
            # Логирование для отладки (только для первого предложения)
            if sentence_key == '001' or (not audio_tr_file and translated):
                current_app.logger.debug(f"🔍 [dictation] Предложение {sentence_key}: "
                    f"translated keys={list(translated.keys()) if translated else 'empty'}, "
                    f"audio={translated.get('audio', 'NONE')}, "
                    f"audio_tr_file={audio_tr_file}, "
                    f"lang_tr={lang_tr}")
            
            # Формируем URL для аудио файлов
            sentence = {
                "key": sentence_key,
                "position": orig_sentence.get('position'),
                "text": orig_sentence.get("text", ""),
                "translation": translated.get("text", ""),
                "audio": url_for('dictation.api_get_dictation_audio_v2', dictation_id=dictation_id, lang=lang_orig, filename=audio_o_file) if audio_o_file else "",
                "audio_a": url_for('dictation.api_get_dictation_audio_v2', dictation_id=dictation_id, lang=lang_orig, filename=audio_o_file) if audio_o_file else "",
                "audio_f": url_for('dictation.api_get_dictation_audio_v2', dictation_id=dictation_id, lang=lang_orig, filename=audio_f_file) if audio_f_file else "",
                "audio_m": url_for('dictation.api_get_dictation_audio_v2', dictation_id=dictation_id, lang=lang_orig, filename=audio_m_file) if audio_m_file else "",
                "audio_tr": url_for('dictation.api_get_dictation_audio_v2', dictation_id=dictation_id, lang=effective_lang_tr, filename=audio_tr_file) if audio_tr_file else "",
                "completed_correctly": False,
                "speaker": orig_sentence.get("speaker"),
                "explanation": translated.get("explanation", "")
            }
            
            sentences.append(sentence)
        
        # Обновляем язык перевода, который показываем в шаблоне
        lang_tr = effective_lang_tr
        
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
            lang_notice=lang_notice,
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
    Возвращает все предложения всех языков одним плоским массивом,
    где каждый объект содержит language_code.
    """
    try:
        # Извлекаем числовой ID из формата dict_<id>
        if not dictation_id.startswith('dict_') or dictation_id.startswith('dict_temp_'):
            return jsonify({'error': f'Неверный формат ID диктанта: {dictation_id}'}), 400
        
        # Извлекаем числовой ID
        db_id = int(dictation_id.replace('dict_', ''))
        
        # Получаем ВСЕ предложения диктанта (все языки) из БД
        all_sentences = get_dictation_sentences(db_id)
        
        # Формируем массив предложений в формате, ожидаемом фронтендом
        sentences = []
        for s in all_sentences:
            lang_code = s.get('language_code', '')
            audio_file = s.get('audio', '')
            
            sentence = {
                "key": s.get('sentence_key', ''),
                "language_code": lang_code,
                "position": s.get('position'),
                "text": s.get("text", ""),
                "explanation": s.get("explanation", ""),
                "audio": url_for('dictation.api_get_dictation_audio_v2', dictation_id=dictation_id, lang=lang_code, filename=audio_file) if audio_file else "",
                "audio_file": s.get('audio_file', ''),  # имя файла, не URL
                "audio_mic": s.get('audio_mic', ''),     # имя файла, не URL
                "start": str(s.get('start', '')) if s.get('start') is not None else '',
                "end": str(s.get('end', '')) if s.get('end') is not None else '',
                "completed_correctly": False,
            }
            
            sentences.append(sentence)
        
        # Получаем audio_user_shared и audio_order из данных диктанта
        audio_user_shared = None
        audio_order = ''
        try:
            dictation_data = get_dictation_by_id(db_id)
            if dictation_data:
                audio_user_shared = dictation_data.get('audio_user_shared')
                audio_order = dictation_data.get('audio_order', '')
        except Exception:
            pass

        return jsonify({
            'success': True,
            'sentences': sentences,
            'audio_user_shared': audio_user_shared,
            'audio_order': audio_order,
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
            audio_file = orig_sentence.get('audio') or ''
            
            # Формируем URL для аудио
            audio_url = ''
            if audio_file:
                audio_url = url_for('dictation.api_get_dictation_audio_v2', dictation_id=f"dict_{dictation_id}", lang=lang_orig, filename=audio_file)
            
            sentence = {
                'sentence_key': sentence_key,
                'position': orig_sentence.get('position'),
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
# API endpoint для server-side распознавания речи (Whisper)
@dictation_bp.route('/api/speech-recognition/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        audio_file = request.files.get('audio')
        if not audio_file:
            return jsonify({'success': False, 'error': 'missing_audio'}), 400

        lang = (request.form.get('lang') or request.args.get('lang') or '').strip()
        # faster-whisper expects ISO-639-1 like "en". Accept "en-US".
        language = (lang.split('-')[0].lower() if lang else None) or None

        import tempfile
        import os

        suffix = None
        try:
            fn = (audio_file.filename or '').lower()
            if '.' in fn:
                suffix = '.' + fn.split('.')[-1]
        except Exception:
            suffix = None
        if not suffix:
            # default for MediaRecorder is usually webm
            suffix = '.webm'

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            audio_file.save(tmp)

        try:
            from faster_whisper import WhisperModel

            # Cache model on app to avoid re-loading per request.
            model = getattr(current_app, '_whisper_model_tiny', None)
            if model is None:
                # tiny model; CPU; int8 for speed.
                model = WhisperModel('tiny', device='cpu', compute_type='int8')
                setattr(current_app, '_whisper_model_tiny', model)

            segments, info = model.transcribe(
                tmp_path,
                language=language,
                vad_filter=True,
            )

            segs = []
            texts = []
            for s in segments:
                try:
                    t = (s.text or '').strip()
                    if t:
                        texts.append(t)
                    segs.append({
                        'start': float(getattr(s, 'start', 0.0) or 0.0),
                        'end': float(getattr(s, 'end', 0.0) or 0.0),
                        'text': t,
                    })
                except Exception:
                    continue

            text = ' '.join(texts).strip()

            return jsonify({
                'success': True,
                'text': text,
                'language': getattr(info, 'language', None),
                'duration': float(getattr(info, 'duration', 0.0) or 0.0),
                'segments': segs,
            })
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception as e:
        current_app.logger.error(f"speech transcribe error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'transcribe_failed'}), 500

