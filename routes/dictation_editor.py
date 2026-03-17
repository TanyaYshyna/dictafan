import json
from flask import request, jsonify
import os
import re
import shutil
import pathlib

from flask import Blueprint, Flask,jsonify, logging, render_template, request, send_file, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from googletrans import Translator
from gtts import gTTS
from flask import current_app
import shortuuid
from datetime import datetime
import logging
import requests
import time
import librosa
import soundfile as sf
import numpy
import base64
import tempfile
from PIL import Image

# from helpers.user_helpers import get_safe_email
from helpers.language_data import load_language_data
from helpers.user_helpers import get_safe_email_from_token, get_current_user 
from routes.index import get_cover_url_for_id
from helpers.b2_storage import b2_storage
from helpers.db_dictations import create_dictation, update_dictation, get_dictation_by_id
from helpers.db_users import get_user_by_email


# Настройка логгера
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log', encoding='utf-8'),
        logging.StreamHandler()  # Вывод в консоль
    ]
)
logger = logging.getLogger(__name__)

editor_bp = Blueprint('dictation_editor', __name__)

# ==============================================================
# транслятор
translator = Translator()

@editor_bp.route('/translate', methods=['POST'])
def translate_text():
    data = request.json
    text = data['text']
    lang_original = data.get('language_original', 'en')  # По умолчанию автоопределение
    lang_translation = data.get('language_translation', 'ru')
    try:
        translation = translator.translate(text, src=lang_original, dest=lang_translation).text
        return jsonify({"translation": translation})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@editor_bp.route('/generate_audio', methods=['POST'])
def generate_audio():
    data = request.json
    logging.info("Начало генерации аудио")

    try:
        dictation_id = data.get('dictation_id')
        user_id = data.get('user_id')  # ID пользователя для пути temp/<user_id>/
        safe_email = data.get('safe_email')  # получаем из запроса
        if not safe_email:
            logging.error("Отсутствует safe_email")
            return jsonify({"success": False, "error": "Отсутствует safe_email"}), 400
        if not dictation_id:
            return jsonify({"success": False, "error": "Отсутствует ID диктанта"}), 400

        text = data.get('text')
        tipe_audio  = data.get('tipe_audio') or 'avto'
        filename_audio  = data.get('filename_audio') or data.get('filename')
        lang = data.get('language')

        try:
            from werkzeug.utils import secure_filename
            raw_name = (filename_audio or '').strip()
            if raw_name:
                raw_name = os.path.basename(raw_name)
                filename_audio = secure_filename(raw_name)
        except Exception:
            pass

        if not filename_audio:
            return jsonify({"success": False, "error": "Отсутствует имя файла аудио"}), 400
        if not lang:
            return jsonify({"success": False, "error": "Отсутствует язык"}), 400

        # IMPORTANT: generation must never publish to B2.
        # We always generate into a temporary file and return audio bytes to the client.
        tmp = tempfile.NamedTemporaryFile(prefix='dictafan_tts_', suffix='.mp3', delete=False)
        filepath = tmp.name
        tmp.close()
        
        # Генерируем аудио с обработкой ошибок
        try:
            tts = gTTS(text=text, lang=lang)
            tts.save(filepath)
            logging.info(f"Аудиофайл успешно сгенерирован: {filepath}")

            with open(filepath, 'rb') as f:
                audio_b64 = base64.b64encode(f.read()).decode('ascii')

            try:
                os.remove(filepath)
            except OSError:
                pass

            return jsonify({
                "success": True,
                "filename": filename_audio,
                "mime": "audio/mpeg",
                "audio_b64": audio_b64,
            })
        except Exception as e:
            logging.error(f"Ошибка генерации аудио: {e}")
            return jsonify({
                "success": False,
                "error": f"Ошибка генерации аудио: {e}"
            }), 500

    except Exception as e:
        logging.error(f"Неожиданная ошибка в generate_audio: {e}")
        return jsonify({
            "success": False,
            "error": f"Внутренняя ошибка сервера: {e}"
        }), 500


@editor_bp.route('/api/b2/get_upload_url', methods=['POST'])
@jwt_required()
def api_b2_get_upload_url():
    try:
        if not b2_storage.enabled or not b2_storage.bucket:
            return jsonify({'success': False, 'error': 'B2 storage is disabled'}), 503

        # NOTE: we intentionally do not accept a path here.
        # The client will use this upload url/token to upload specific files.
        # Server-side validation must happen at save-time / download-time.
        try:
            if hasattr(b2_storage.bucket, 'get_upload_url'):
                upload_resp = b2_storage.bucket.get_upload_url()
            else:
                # Compatibility with older b2sdk versions
                bucket_id = getattr(b2_storage.bucket, 'id_', None) or getattr(b2_storage.bucket, 'bucket_id', None)
                if not bucket_id:
                    raise AttributeError("Bucket has no get_upload_url and no bucket id attribute")
                upload_resp = b2_storage.api.session.get_upload_url(bucket_id)
        except Exception as e:
            try:
                from b2sdk.v2.exception import B2Error
                if isinstance(e, B2Error):
                    logger.error("B2 get_upload_url failed: %s", e, exc_info=True)
                    return jsonify({'success': False, 'error': f'B2 error: {e}'}), 502
            except Exception:
                pass
            logger.error("get_upload_url unexpected error: %s", e, exc_info=True)
            return jsonify({'success': False, 'error': f'get_upload_url failed: {type(e).__name__}: {e}'}), 502

        upload_url = None
        auth_token = None
        try:
            if isinstance(upload_resp, (tuple, list)) and len(upload_resp) >= 2:
                upload_url, auth_token = upload_resp[0], upload_resp[1]
            elif isinstance(upload_resp, dict):
                upload_url = upload_resp.get('uploadUrl') or upload_resp.get('upload_url')
                auth_token = upload_resp.get('authorizationToken') or upload_resp.get('authorization_token')
            else:
                upload_url = getattr(upload_resp, 'upload_url', None) or getattr(upload_resp, 'uploadUrl', None)
                auth_token = getattr(upload_resp, 'authorization_token', None) or getattr(upload_resp, 'authorizationToken', None)
        except Exception as e:
            logger.error("Failed to parse b2 get_upload_url response: %s", e, exc_info=True)
            return jsonify({'success': False, 'error': 'Failed to parse B2 upload url'}), 502

        if not upload_url or not auth_token:
            return jsonify({'success': False, 'error': 'Failed to get B2 upload url'}), 502

        return jsonify({
            'success': True,
            'uploadUrl': upload_url,
            'uploadAuthToken': auth_token,
        })
    except Exception as e:
        logger.error(f"api_b2_get_upload_url error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': f'Internal error: {e}'}), 500


@editor_bp.route('/api/b2/cleanup_dictation_audio', methods=['POST'])
@jwt_required()
def api_b2_cleanup_dictation_audio():
    """Удаляет из B2 файлы аудио диктанта, которых нет в keep_remote_paths.

    Expected remote paths:
      dictations/<dictation_id>/<lang>/<filename>
    where dictation_id is in format dict_<id>.
    """
    try:
        if not b2_storage.enabled or not b2_storage.bucket:
            return jsonify({'success': False, 'error': 'B2 storage is disabled'}), 503

        data = request.get_json(silent=True) or {}
        dictation_id = str(data.get('dictation_id') or '').strip()
        keep_remote_paths = data.get('keep_remote_paths')

        if not dictation_id or not dictation_id.startswith('dict_'):
            return jsonify({'success': False, 'error': 'dictation_id is required'}), 400
        if not isinstance(keep_remote_paths, list):
            return jsonify({'success': False, 'error': 'keep_remote_paths must be a list'}), 400

        # Ownership check: only owner may cleanup.
        try:
            db_id = int(dictation_id.replace('dict_', ''))
        except Exception:
            return jsonify({'success': False, 'error': 'Invalid dictation_id'}), 400

        current_email = get_jwt_identity()
        user_db = get_user_by_email(current_email) if current_email else None
        if not user_db:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        dictation = get_dictation_by_id(db_id)
        if not dictation:
            return jsonify({'success': False, 'error': 'Dictation not found'}), 404

        owner_id = dictation.get('owner_id')
        if not owner_id or int(owner_id) != int(user_db.get('id')):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403

        prefix = f"dictations/{dictation_id}/"

        # Sanitize keep list to prevent deleting outside of prefix.
        keep_set = set()
        for p in keep_remote_paths:
            try:
                s = str(p or '').strip()
                if not s:
                    continue
                if not s.startswith(prefix):
                    continue
                keep_set.add(s)
            except Exception:
                continue

        # Guardrail: never allow "delete everything" via cleanup.
        if len(keep_set) == 0:
            try:
                logger.warning(
                    "[b2_cleanup_dictation_audio] refused: empty keep_set (dictation_id=%s, keep_remote_paths=%s)",
                    dictation_id,
                    len(keep_remote_paths) if isinstance(keep_remote_paths, list) else None,
                )
            except Exception:
                pass
            return jsonify({'success': False, 'error': 'Refusing to cleanup: keep list is empty'}), 400

        existing = b2_storage.list_files(prefix)
        deleted = 0
        skipped = 0
        for name in existing:
            try:
                if name in keep_set:
                    skipped += 1
                    continue
                if b2_storage.delete_file(name):
                    deleted += 1
            except Exception:
                continue

        try:
            logger.info(
                "[b2_cleanup_dictation_audio] done dictation_id=%s existing=%s keep=%s deleted=%s skipped=%s",
                dictation_id,
                len(existing),
                len(keep_set),
                deleted,
                skipped,
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'prefix': prefix,
            'existing': len(existing),
            'keep': len(keep_set),
            'deleted': deleted,
            'skipped': skipped,
        })
    except Exception as e:
        logger.error('api_b2_cleanup_dictation_audio error: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': f'Internal error: {e}'}), 500

# ==============================================================
# Удалено: generate_dictation_id() - теперь ID создаётся в БД через API

# ==============================================================
# Форма загрузки диктантов
# @generator_bp.route('/dictation_generator')
# def dictation_generator():
#     return render_template('dictation_editor.html')


@editor_bp.route('/dictation_editor/<dictation_id>/<language_original>/<language_translation>')
def dictation_editor(dictation_id, language_original, language_translation):
    base_path = os.path.join('static', 'data', 'dictations', dictation_id)

    # Загружаем данные ТОЛЬКО из БД (никаких JSON файлов!)
    info = {}
    original_data = {"language": language_original, "title": "", "sentences": []}
    translation_data = {"language": language_translation, "title": "", "sentences": []}
    translations_data = {}
    
    translation_flags = {}
    if dictation_id.startswith('dict_') and not dictation_id.startswith('dict_temp_'):
        try:
            # Извлекаем ID из формата dict_<id>
            db_id = int(dictation_id.replace('dict_', ''))
            dictation = get_dictation_by_id(db_id)
            if dictation:
                # Получаем переводы заголовка из БД
                title_translations = dictation.get('title_translations', {})
                
                info = {
                    "title": dictation.get('title', ''),
                    "level": dictation.get('level', 'A1'),
                    "is_dialog": False,  # Пока не храним в БД
                    "speakers": dictation.get('speakers', {}),
                    "title_translations": title_translations,
                    "author_materials_url": dictation.get('author_materials_url')
                }
                logger.info(f"✅ Загружен диктант из БД: id={db_id}, title={info.get('title')}, title_translations={title_translations}")

                try:
                    from helpers.db_dictations import get_dictation_translation_flags
                    translation_flags = get_dictation_translation_flags(db_id) or {}
                except Exception:
                    translation_flags = {}
                
                # Загружаем предложения из БД
                from helpers.db_dictations import get_dictation_sentences
                all_sentences = get_dictation_sentences(db_id)
                
                # Группируем предложения по языкам
                sentences_by_lang = {}
                for sentence in all_sentences:
                    lang = sentence['language_code']
                    if lang not in sentences_by_lang:
                        sentences_by_lang[lang] = []
                    sentences_by_lang[lang].append({
                        "key": sentence['sentence_key'],
                        "position": sentence.get('position'),
                        "text": sentence['text'],
                        "explanation": sentence.get('explanation'),
                        "speaker": sentence.get('speaker'),
                        "audio": sentence.get('audio'),
                        "audio_avto": sentence.get('audio_avto'),
                        "audio_mic": sentence.get('audio_mic'),
                        "audio_user": sentence.get('audio_user'),
                        "start": sentence.get('start'),
                        "end": sentence.get('end'),
                        "chain": sentence.get('chain', False),
                        "checked": sentence.get('checked', False)
                    })
                
                # Формируем original_data и translation_data
                if language_original in sentences_by_lang:
                    original_data = {
                        "language": language_original,
                        "title": info.get("title", ""),  # Используем title из БД (оригинальный заголовок)
                        "sentences": sentences_by_lang[language_original]
                    }

                # All translations (SSOT for frontend)
                try:
                    for lang, items in (sentences_by_lang or {}).items():
                        if not lang:
                            continue
                        if lang == language_original:
                            continue
                        translations_data[lang] = {
                            "language": lang,
                            "title": title_translations.get(lang, ""),
                            "sentences": items
                        }
                except Exception:
                    translations_data = {}

                # translation_data: backward-compatible single bucket for the requested translation language
                if language_translation in sentences_by_lang:
                    # Используем перевод заголовка из title_translations для языка перевода
                    translation_title = title_translations.get(language_translation, "")
                    translation_data = {
                        "language": language_translation,
                        "title": translation_title,  # Перевод названия из БД
                        "sentences": sentences_by_lang[language_translation]
                    }
            else:
                logger.warning(f"⚠️ Диктант с id={db_id} не найден в БД")
        except (ValueError, Exception) as e:
            logger.error(f"❌ Ошибка загрузки диктанта из БД: {e}")
            import traceback
            logger.error(traceback.format_exc())

    # Загружаем распознанные слова из audio_words.json (если есть)
    audio_words_path = os.path.join(base_path, 'audio_words.json')
    audio_words = []
    if os.path.exists(audio_words_path):
        with open(audio_words_path, 'r', encoding='utf-8') as f:
            audio_words = json.load(f)

    # Получаем текущего пользователя
    from helpers.user_helpers import get_current_user
    current_user = get_current_user()

    # Prefer opening with user's native language as active translation, if that translation exists.
    try:
        user_native = (current_user or {}).get('native_language')
        user_native = str(user_native).strip().lower() if user_native else ''
        if user_native and user_native in translations_data:
            language_translation = user_native
            translation_data = translations_data.get(user_native, translation_data)
    except Exception:
        pass

    # Получаем safe_email из JWT токена
    safe_email = get_safe_email_from_token()
    
    # Для редактирования категория будет загружена из sessionStorage в JavaScript
    # Передаем пустую информацию о категории - она будет заполнена из sessionStorage
    category_info = {
        "key": "",
        "title": "",
        "path": ""
    }

    cover_url = get_cover_url_for_id(dictation_id, language_original)
 
    return render_template(
        'dictation_editor.html',
        dictation_id=dictation_id,
        original_language=language_original,
        translation_language=language_translation,
        title=info.get("title", ""),
        title_translations=info.get("title_translations", {}),
        translation_flags=translation_flags,
        level=info.get("level", "A1"),
        is_dialog=info.get("is_dialog", False),
        speakers=info.get("speakers", {}),
        original_data=original_data,
        translation_data=translation_data,
        translations_data=translations_data,
        audio_file=None,
        audio_words=audio_words,
        current_user=current_user,
        safe_email=safe_email,
            # edit_mode удален - определяется по dictation_id
        category_info=category_info,
        cover_url=cover_url,
        language_data=load_language_data()
    )



@editor_bp.route('/dictation_editor/new')
def dictation_editor_new():
    """Страница создания нового диктанта"""
    try:
        # Получаем пользователя
        current_user = get_current_user()
        safe_email = get_safe_email_from_token()

        language_data = load_language_data()
        available_languages = set(language_data.keys())

        # Языки по умолчанию: берем из профиля пользователя.
        # original = изучаемый язык, translation = родной язык.
        language_original = (current_user or {}).get('current_learning') or 'en'
        language_translation = (current_user or {}).get('native_language') or 'ru'

        language_original = str(language_original).lower()
        language_translation = str(language_translation).lower()

        if language_original not in available_languages:
            language_original = 'en' if 'en' in available_languages else next(iter(available_languages), 'en')

        if language_translation not in available_languages:
            language_translation = 'ru' if 'ru' in available_languages else next(iter(available_languages), 'ru')

        cover_url = get_cover_url_for_id(None, language_original)
        
        return render_template(
            'dictation_editor.html',
            dictation_id='new',
            original_language=language_original,
            translation_language=language_translation,
            title='',
            level="A1",
            is_dialog=False,
            speakers={},
            translation_flags={},
            original_data={
                "language": language_original,
                "title": "",
                "speakers": {},
                "sentences": []
            },
            translation_data={
                "language": language_translation,
                "title": "",
                "speakers": {},
                "sentences": []
            },
            audio_file=None,
            audio_words=[],
            current_user=current_user,
            safe_email=safe_email,
            # edit_mode удален - определяется по dictation_id
            category_info={
                "key": "",
                "title": "",
                "path": ""
            },
            cover_url=cover_url,
            language_data=language_data
        )
        
    except Exception as e:
        logger.error(f"Ошибка при открытии страницы создания диктанта: {e}")
        return f"Ошибка: {e}", 500


@editor_bp.route('/api/dictation/create', methods=['POST'])
@jwt_required()
def api_create_dictation():
    """Создаёт новый диктант в БД"""
    try:
        data = request.get_json()
        current_email = get_jwt_identity()
        
        # Получаем пользователя для owner_id
        user_db = get_user_by_email(current_email)
        if not user_db:
            return jsonify({'error': 'User not found'}), 404
        
        owner_id = user_db['id']
        
        # Параметры диктанта
        title = data.get('title', 'Untitled')
        language_code = data.get('language_code', 'en')
        level = data.get('level', 'A1')
        is_public = data.get('is_public', True)
        speakers = data.get('speakers', {})
        
        # Создаём диктант в БД
        dictation = create_dictation(
            title=title,
            language_code=language_code,
            level=level,
            owner_id=owner_id,
            is_public=is_public,
            speakers=speakers if speakers else None
        )
        
        # Возвращаем данные диктанта с ID из БД
        return jsonify({
            'success': True,
            'dictation': {
                'id': dictation['id'],
                'db_id': dictation['id'],  # ID из БД
                'title': dictation['title'],
                'language_code': dictation['language_code'],
                'level': dictation['level'],
                'owner_id': dictation['owner_id'],
                'is_public': dictation['is_public'],
                'speakers': dictation['speakers'],
            }
        })
    except Exception as e:
        logger.error(f"Ошибка создания диктанта: {e}")
        return jsonify({'error': str(e)}), 500


@editor_bp.route('/download/<path:filename>')
def download(filename):
    return send_file(filename, as_attachment=True)








@editor_bp.route('/split_audio_into_parts', methods=['POST'])
def split_audio_into_parts():
    """Разделение аудио файла на равные части для создания предложений"""
    try:
        data = request.get_json()
        logger.info(f"Получены данные для разделения аудио: {data}")
        
        dictation_id = data.get('dictation_id')
        language = data.get('language', 'en')
        filename = data.get('filename')
        num_parts = data.get('num_parts', 10)  # Количество частей по умолчанию

        if not dictation_id:
            logger.error("Missing dictation_id")
            return jsonify({'error': 'Missing dictation_id'}), 400
            
        if not filename:
            logger.error("Missing filename")
            return jsonify({'error': 'Missing filename'}), 400

        # Путь к исходному файлу
        source_path = os.path.join("static", "data", "temp", dictation_id, language, "mp3_1", filename)
        
        if not os.path.exists(source_path):
            return jsonify({'error': 'Source audio file not found'}), 404

        # Создаем папку для частей
        parts_dir = os.path.join("static", "data", "temp", dictation_id, language, "mp3_1")
        os.makedirs(parts_dir, exist_ok=True)

        # Получаем длительность аудио файла из параметров start/end
        start_time = data.get('start_time', 0)
        end_time = data.get('end_time')
        
        if end_time is None:
            return jsonify({'error': 'End time is required'}), 400
            
        audio_duration = end_time - start_time
        part_duration = audio_duration / num_parts

        # Загружаем исходный аудио файл
        try:
            y, sr = librosa.load(source_path, sr=None)
            logger.info(f"Загружен аудио файл: {len(y)} samples, sample rate: {sr}")
        except Exception as e:
            logger.error(f"Ошибка загрузки аудио файла: {e}")
            return jsonify({'error': f'Cannot load audio file: {str(e)}'}), 400

        created_files = []
        for i in range(num_parts):
            # Учитываем время старта диктанта, которое установил пользователь
            part_start_time = start_time + (i * part_duration)
            part_end_time = start_time + ((i + 1) * part_duration)
            
            # Имя файла в формате 001_en_mp3_1.mp3
            part_filename = f"{i:03d}_{language}_mp3_1.mp3"
            part_path = os.path.join(parts_dir, part_filename)
            
            # Отрезаем нужный кусок аудио (в сэмплах)
            start_sample = int(part_start_time * sr)
            end_sample = int(part_end_time * sr)
            
            # Извлекаем отрезок аудио
            audio_segment = y[start_sample:end_sample]
            
            # Сохраняем отрезок как отдельный файл
            sf.write(part_path, audio_segment, sr)
            
            created_files.append({
                'filename': part_filename,
                'start_time': part_start_time,
                'end_time': part_end_time,
                'url': f"/static/data/temp/{dictation_id}/{language}/mp3_1/{part_filename}"
            })

        logger.info(f"✅ Создано {len(created_files)} частей аудио")
        
        return jsonify({
            "success": True,
            "message": f"Аудио разделено на {num_parts} частей",
            "parts": created_files
        })
        
    except Exception as e:
        logger.error(f"Ошибка при разделении аудио: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


    






# ==============================================================
# ========================= Сохранение ОДНОГО языка/папки =============================


@editor_bp.route('/save_dictation_with_category', methods=['POST'])
def save_dictation_with_category():
    """Сохраняет диктант и добавляет его в категорию одним запросом"""
    try:
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        category = data.get('category', {})
        
        if not dictation_id:
            return jsonify({"success": False, "error": "Missing dictation_id"}), 400
        
        # Сохраняем диктант (если нужно)
        # Здесь можно добавить логику сохранения диктанта
        
        # Добавляем в категорию, если указана
        if category and category.get('key'):
            category_key = category['key']
            
            # Загружаем categories.json
            categories_path = 'static/data/categories.json'
            with open(categories_path, 'r', encoding='utf-8') as f:
                categories = json.load(f)
            
            # Находим категорию по ключу и добавляем ID диктанта
            def find_and_update_category(node, target_key):
                if node.get('key') == target_key:
                    if 'data' not in node:
                        node['data'] = {}
                    if 'dictations' not in node['data']:
                        node['data']['dictations'] = []
                    
                    # Загружаем info.json для получения данных диктанта
                    info_path = os.path.join('static', 'data', 'temp', dictation_id, 'info.json')
                    dictation_entry = {"id": dictation_id}
                    
                    if os.path.exists(info_path):
                        with open(info_path, 'r', encoding='utf-8') as f:
                            info_data = json.load(f)
                        dictation_entry = {
                            "id": dictation_id,
                            "title": info_data.get("title", "Без названия"),
                            "language_original": info_data.get("language_original", "en"),
                            "level": info_data.get("level", "A1"),
                            "is_dialog": info_data.get("is_dialog", False),
                            "speakers": info_data.get("speakers", {}),
                            "created_at": datetime.now().isoformat()
                        }
                    
                    # Проверяем, нет ли уже такого диктанта
                    existing_ids = [d.get('id') for d in node['data']['dictations']]
                    if dictation_id not in existing_ids:
                        node['data']['dictations'].append(dictation_entry)
                    return True
                
                # Рекурсивно ищем в дочерних узлах
                for child in node.get('children', []):
                    if find_and_update_category(child, target_key):
                        return True
                return False
            
            # Ищем и обновляем категорию
            found = False
            for root_child in categories.get('children', []):
                if find_and_update_category(root_child, category_key):
                    found = True
                    break
            
            if found:
                # Сохраняем обновленный categories.json
                with open(categories_path, 'w', encoding='utf-8') as f:
                    json.dump(categories, f, ensure_ascii=False, indent=2)
                logger.info(f"✅ Добавлен диктант {dictation_id} в категорию {category_key}")
            else:
                logger.warning(f"⚠️ Категория {category_key} не найдена")
        
        return jsonify({"success": True})
        
    except Exception as e:
        logger.error(f"Ошибка в save_dictation_with_category: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@editor_bp.route('/clear_temp_folders', methods=['POST'])
def clear_temp_folders():
    """Очищает temp папки для диктанта"""
    try:
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        language_original = data.get('language_original')
        language_translation = data.get('language_translation')
        
        if not dictation_id or not language_original or not language_translation:
            return jsonify({"success": False, "error": "Missing required parameters"}), 400
        
        # Пути к temp папкам
        temp_dictation_path = os.path.join('static', 'data', 'temp', dictation_id)
        
        if os.path.exists(temp_dictation_path):
            shutil.rmtree(temp_dictation_path)
            logger.info(f"✅ Очищена temp папка: {temp_dictation_path}")
        
        return jsonify({"success": True, "message": "Temp folders cleared"})
        
    except Exception as e:
        logger.error(f"Ошибка в clear_temp_folders: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@editor_bp.route('/copy_dictation_to_temp', methods=['POST'])
def copy_dictation_to_temp():
    """Копирует диктант в temp для редактирования"""
    try:
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        language_original = data.get('language_original')
        language_translation = data.get('language_translation')
        
        if not dictation_id or not language_original or not language_translation:
            return jsonify({"success": False, "error": "Missing required parameters"}), 400
        
        # Пути к исходным папкам
        source_dictation_path = os.path.join('static', 'data', 'dictations', dictation_id)
        temp_dictation_path = os.path.join('static', 'data', 'temp', dictation_id)
        
        # Создаем temp папку
        os.makedirs(temp_dictation_path, exist_ok=True)
        
        # НЕ копируем info.json - все данные только в БД!
        
        # Копируем cover.webp
        source_cover_path = os.path.join(source_dictation_path, 'cover.webp')
        temp_cover_path = os.path.join(temp_dictation_path, 'cover.webp')
        
        if os.path.exists(source_cover_path):
            shutil.copy2(source_cover_path, temp_cover_path)
        else:
            logger.warning(f"⚠️ Файл {source_cover_path} не найден")
        
        # Копируем папки языков
        for lang in [language_original, language_translation]:
            # Создаем папку языка в temp
            temp_lang_path = os.path.join(temp_dictation_path, lang)
            os.makedirs(temp_lang_path, exist_ok=True)
            
            # sentences.json НЕ копируем - данные будут в памяти клиента
            
            # Копируем аудио файлы напрямую из папки языка
            source_lang_path = os.path.join(source_dictation_path, lang)
            
            if os.path.exists(source_lang_path):
                for file_name in os.listdir(source_lang_path):
                    if file_name.lower().endswith(('.mp3', '.mp4', '.webm', '.wav', '.ogg')):
                        source_file = os.path.join(source_lang_path, file_name)
                        temp_file = os.path.join(temp_lang_path, file_name)
                        shutil.copy2(source_file, temp_file)
        
        return jsonify({"success": True, "message": "Dictation copied to temp"})
        
    except Exception as e:
        logger.error(f"Ошибка в copy_dictation_to_temp: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500




def copy_audio_files_from_temp(dictation_id, language):
    """Копирует аудиофайлы из temp в dictations"""
    try:
        temp_path = os.path.join('static', 'data', 'temp', dictation_id, language)
        dictation_path = os.path.join('static', 'data', 'dictations', dictation_id, language)
        
        if not os.path.exists(temp_path):
            return
            
        # Создаем папку назначения
        os.makedirs(dictation_path, exist_ok=True)
            
        # Копируем все аудиофайлы из temp (mp3, mp4, webm, ogg, wav)
        for filename in os.listdir(temp_path):
            if filename.lower().endswith(('.mp3', '.mp4', '.webm', '.ogg', '.wav')):
                source = os.path.join(temp_path, filename)
                target = os.path.join(dictation_path, filename)
                shutil.copy2(source, target)
                logger.info(f"Скопирован аудиофайл: {filename}")
                
    except Exception as e:
        logger.error(f"Ошибка копирования аудиофайлов: {e}")




@editor_bp.route('/save_dictation_final', methods=['POST'])
@jwt_required()
def save_dictation_final():
    """Сохраняет диктант в БД и файлы, добавляет в категорию"""
    from helpers.db_dictations import create_dictation, update_dictation, add_sentence, get_dictation_sentences, delete_sentence
    # Для привязки диктанта к книге/разделу в приватной библиотеке
    from helpers.db_books import add_dictation_to_book
    from helpers.db_users import get_user_by_email
    from flask_jwt_extended import get_jwt_identity
    
    try:
        data = request.get_json()
        
        # Логируем полученные данные для отладки
        logger.info(f"📥 Получены данные для сохранения диктанта: id={data.get('id')}, temp_id={data.get('temp_id')}, db_id={data.get('db_id')}, category_key={data.get('category_key')}, user_id={data.get('user_id')}")
        
        temp_id = data.get('temp_id')  # dict_temp_<timestamp> для новых диктантов
        dictation_id = data.get('id')  # dict_<id> или dict_temp_<timestamp>
        db_id = data.get('db_id')  # ID из БД (может быть None для новых)
        category_key = data.get('category_key')
        user_id = data.get('user_id')  # ID пользователя для пути temp/<user_id>/
        # Целевая книга/раздел из приватной библиотеки (может быть None)
        target_book_id = data.get('book_id')
        
        # Если db_id не передан, но dictation_id имеет формат dict_<id>, извлекаем db_id из него
        if not db_id and dictation_id and dictation_id.startswith('dict_') and not dictation_id.startswith('dict_temp_'):
            try:
                # Извлекаем ID из формата dict_<id>
                db_id_str = dictation_id.replace('dict_', '')
                db_id = int(db_id_str)
                logger.info(f"✅ Извлечен db_id из dictation_id: {db_id}")
            except (ValueError, AttributeError):
                logger.warning(f"⚠️ Не удалось извлечь db_id из dictation_id: {dictation_id}")

        # Если book_id не передали, но диктант уже принадлежит книге/разделу,
        # то это редактирование из приватной библиотеки и мы НЕ должны добавлять его в categories.json.
        if not target_book_id and db_id:
            try:
                from helpers.db import get_db_connection
                from psycopg2.extras import RealDictCursor
                conn = get_db_connection()
                try:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(
                            """
                            SELECT book_id
                            FROM book_dictations
                            WHERE dictation_id = %s
                            LIMIT 1
                            """,
                            (int(db_id),),
                        )
                        row = cur.fetchone()
                        if row and row.get('book_id'):
                            target_book_id = row.get('book_id')
                            logger.info(
                                "✅ book_id восстановлен из book_dictations: %s (dictation %s)",
                                target_book_id,
                                db_id,
                            )
                finally:
                    conn.close()
            except Exception as e:
                logger.warning(f"⚠️ Не удалось восстановить book_id из book_dictations: {e}")
        
        # Если user_id не передан, получаем его из БД по email из токена
        if not user_id:
            try:
                current_email = get_jwt_identity()
                user_db = get_user_by_email(current_email)
                if user_db and user_db.get('id'):
                    user_id = user_db['id']
                    logger.info(f"✅ user_id получен из БД по токену: {user_id}")
                else:
                    logger.warning(f"⚠️ Пользователь не найден в БД для email: {current_email}")
            except Exception as e:
                logger.warning(f"⚠️ Не удалось получить user_id из токена: {e}")
        
        if not dictation_id:
            logger.error("❌ Отсутствует dictation_id")
            return jsonify({"success": False, "error": "Missing dictation_id"}), 400

        def _normalize_audio_filename(value):
            """DB invariant: store ONLY filename (basename) in audio fields.

            Incoming value may be:
            - filename: 001_en_avto.mp3
            - API url: /api/dictations/dict_123/en/001_en_avto.mp3
            - blob url: blob:...
            - full external url
            We always reduce to basename when possible; for blob: we return empty (it must not be persisted).
            """
            try:
                if not value or not isinstance(value, str):
                    return ''
                v = value.strip()
                if not v:
                    return ''
                if v.startswith('blob:'):
                    return ''
                # Strip query params and take basename.
                try:
                    v2 = v.split('?', 1)[0]
                    base = v2.rsplit('/', 1)[-1]
                except Exception:
                    base = v
                base = (base or '').strip()
                return base
            except Exception:
                return ''
        
        # category_key может быть пустым если диктант создается из приватной библиотеки (привязан к книге/разделу)
        # Используем дефолтное значение только если нет target_book_id
        if not category_key and not target_book_id:
            logger.warning("⚠️ category_key пустой и нет book_id, используем дефолтное значение")
            # Пытаемся определить категорию по языку
            language_code = data.get("language_original", "en")
            # Для английского языка используем категорию "english"
            if language_code == "en":
                category_key = "english"
            else:
                category_key = "other"  # Дефолтная категория
            logger.info(f"📁 Используем category_key: {category_key}")
        
        # Если это новый диктант (temp_id начинается с dict_temp_) - создаём в БД
        is_new_dictation = dictation_id.startswith('dict_temp_') or (temp_id and temp_id.startswith('dict_temp_'))
        
        if is_new_dictation and not db_id:
            # Создаём диктант в БД
            try:
                current_email = get_jwt_identity()
                logger.info(f"📧 Email пользователя: {current_email}")
                
                user_db = get_user_by_email(current_email)
                if not user_db:
                    logger.error(f"❌ Пользователь не найден: {current_email}")
                    return jsonify({"success": False, "error": "User not found", "msg": "User not found"}), 404
                
                owner_id = user_db['id'] if user_db else None
                logger.info(f"👤 Owner ID: {owner_id}")
                
                # create_dictation возвращает словарь, а не просто ID
                dictation = create_dictation(
                    title=data.get("title", "Новый диктант"),
                    language_code=data.get("language_original", "en"),
                    level=data.get("level", "A1"),
                    owner_id=owner_id,
                    is_public=True,
                    speakers=data.get("speakers", {}),  # Передаём словарь, не JSON строку
                    title_translations=data.get("title_translations", {}),  # Переводы заголовка
                    author_materials_url=data.get("author_materials_url")  # Ссылка на материалы автора
                )
                
                if not dictation or 'id' not in dictation:
                    logger.error(f"❌ Не удалось создать диктант в БД: {dictation}")
                    return jsonify({"success": False, "error": "Failed to create dictation in DB", "msg": "Failed to create dictation in DB"}), 500
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                logger.error(f"❌ Ошибка при создании диктанта в БД: {e}\n{error_trace}")
                return jsonify({"success": False, "error": str(e), "msg": str(e)}), 500
            
            db_id = dictation['id']
            
            # Обновляем dictation_id на реальный
            dictation_id = f"dict_{db_id}"
            logger.info(f"✅ Создан новый диктант в БД: dict_{db_id}")
            
            # Обновляем диктант с полными данными (title, level, speakers, title_translations, author_materials_url)
            update_dictation(
                dictation_id=db_id,
                title=data.get("title", "Новый диктант"),
                level=data.get("level", "A1"),
                speakers=data.get("speakers", {}),
                title_translations=data.get("title_translations", {}),
                author_materials_url=data.get("author_materials_url")
            )
        elif db_id:
            # Обновляем существующий диктант в БД
            update_dictation(
                dictation_id=db_id,
                title=data.get("title"),
                level=data.get("level"),
                speakers=data.get("speakers", {}),
                title_translations=data.get("title_translations", {}),
                author_materials_url=data.get("author_materials_url")
            )
        else:
            return jsonify({"success": False, "error": "Missing db_id - dictation not created in DB"}), 400
        
        # Умное сохранение предложений: обновляем только изменённые, добавляем новые, удаляем только отсутствующие
        from helpers.db_dictations import get_sentence_by_key, update_sentence
        
        sentences_data = data.get('sentences', {})
        logger.info(f"📝 Сохранение предложений для диктанта {dictation_id} (db_id={db_id}), языков: {list(sentences_data.keys())}")
        added_count = 0
        updated_count = 0
        deleted_count = 0
        skipped_lang_count = 0
        
        # Собираем все ключи предложений из новых данных
        new_sentence_keys = set()
        for lang, lang_data in sentences_data.items():
            if not lang_data or 'sentences' not in lang_data:
                logger.warning(f"⚠️ Пустые данные для языка {lang}")
                skipped_lang_count += 1
                continue
            sentences_count = len(lang_data.get('sentences', []))
            logger.info(f"  Язык {lang}: {sentences_count} предложений")
            for sentence in lang_data.get('sentences', []):
                sentence_key = sentence.get('key', '')
                if sentence_key:
                    new_sentence_keys.add((lang, sentence_key))
        
        # Получаем все существующие предложения
        old_sentences = get_dictation_sentences(db_id)
        logger.info(f"🧾 В БД сейчас предложений для dictation_id={db_id}: {len(old_sentences)}")
        old_sentences_map = {}
        for old_sentence in old_sentences:
            key = (old_sentence['language_code'], old_sentence['sentence_key'])
            old_sentences_map[key] = old_sentence
        
        # Обрабатываем каждое предложение из новых данных
        for lang, lang_data in sentences_data.items():
            if not lang_data or 'sentences' not in lang_data:
                continue
            
            for sentence in lang_data.get('sentences', []):
                sentence_key = sentence.get('key', '')
                if not sentence_key:
                    continue
                
                key = (lang, sentence_key)
                old_sentence = old_sentences_map.get(key)
                
                if old_sentence:
                    # Предложение существует - проверяем изменилось ли что-то
                    # Сравниваем числа с небольшой погрешностью (для float)
                    def float_eq(a, b):
                        if a is None and b is None:
                            return True
                        if a is None or b is None:
                            return False
                        return abs(float(a) - float(b)) < 0.01
                    
                    # Normalize audio to filename-only before comparing / saving.
                    audio_in = _normalize_audio_filename(sentence.get('audio'))
                    audio_avto_in = _normalize_audio_filename(sentence.get('audio_avto'))
                    audio_mic_in = _normalize_audio_filename(sentence.get('audio_mic'))
                    audio_user_in = _normalize_audio_filename(sentence.get('audio_user'))

                    has_changes = (
                        old_sentence['text'] != sentence.get('text', '') or
                        old_sentence['explanation'] != sentence.get('explanation') or
                        old_sentence['speaker'] != sentence.get('speaker') or
                        (old_sentence.get('audio') or '') != audio_in or
                        (old_sentence.get('audio_avto') or '') != audio_avto_in or
                        (old_sentence.get('audio_mic') or '') != audio_mic_in or
                        (old_sentence.get('audio_user') or '') != audio_user_in or
                        not float_eq(old_sentence['start'], sentence.get('start')) or
                        not float_eq(old_sentence['end'], sentence.get('end')) or
                        old_sentence['chain'] != sentence.get('chain', False) or
                        old_sentence['checked'] != sentence.get('checked', False) or
                        (old_sentence.get('position') != sentence.get('position'))
                    )
                    
                    if has_changes:
                        audio_final = audio_in
                        audio_avto_final = audio_avto_in
                        audio_mic_final = audio_mic_in
                        audio_user_final = audio_user_in
                        # Обновляем только изменённые поля
                        update_sentence(
                            sentence_id=old_sentence['id'],
                            text=sentence.get('text', ''),
                            explanation=sentence.get('explanation'),
                            speaker=sentence.get('speaker'),
                            audio=audio_final,
                            audio_avto=audio_avto_final,
                            audio_mic=audio_mic_final,
                            audio_user=audio_user_final,
                            start=sentence.get('start'),
                            end=sentence.get('end'),
                            chain=sentence.get('chain', False),
                            checked=sentence.get('checked', False),
                            position=sentence.get('position')
                        )
                        updated_count += 1
                else:
                    audio_final = _normalize_audio_filename(sentence.get('audio'))
                    audio_avto_final = _normalize_audio_filename(sentence.get('audio_avto'))
                    audio_mic_final = _normalize_audio_filename(sentence.get('audio_mic'))
                    audio_user_final = _normalize_audio_filename(sentence.get('audio_user'))
                    # Новое предложение - добавляем
                    add_sentence(
                        dictation_id=db_id,
                        language_code=lang,
                        sentence_key=sentence_key,
                        text=sentence.get('text', ''),
                        explanation=sentence.get('explanation'),
                        speaker=sentence.get('speaker'),
                        audio=audio_final,
                        audio_avto=audio_avto_final,
                        audio_mic=audio_mic_final,
                        audio_user=audio_user_final,
                        start=sentence.get('start'),
                        end=sentence.get('end'),
                        chain=sentence.get('chain', False),
                        checked=sentence.get('checked', False),
                        position=sentence.get('position')
                    )
                    added_count += 1
        
        # Удаляем только те предложения, которых нет в новых данных
        for old_sentence in old_sentences:
            key = (old_sentence['language_code'], old_sentence['sentence_key'])
            if key not in new_sentence_keys:
                delete_sentence(old_sentence['id'])
                deleted_count += 1

        logger.info(
            "✅ Итог сохранения предложений для dictation_id=%s (db_id=%s): new_keys=%s old=%s added=%s updated=%s deleted=%s skipped_lang=%s",
            dictation_id,
            db_id,
            len(new_sentence_keys),
            len(old_sentences),
            added_count,
            updated_count,
            deleted_count,
            skipped_lang_count,
        )

        # Refresh cached translation flags (tr_*) for fast filtering.
        # Safe: if columns are not present yet, helper is a no-op.
        try:
            from helpers.db_dictations import refresh_dictation_translation_flags
            refresh_dictation_translation_flags(int(db_id))
        except Exception:
            pass
        
        # Создаем финальную папку ТОЛЬКО для аудиофайлов и обложки (никаких JSON!)
        final_path = os.path.join('static', 'data', 'dictations', dictation_id)
        os.makedirs(final_path, exist_ok=True)
        
        # НЕ сохраняем sentences.json - все данные только в БД!

        # Копируем аудиофайлы из temp в финальную папку
        # Для новых диктантов используем путь temp/<user_id>/dict_temp_<timestamp>/
        # Для существующих - temp/dict_<id>/
        temp_dictation_id = data.get('temp_id') or dictation_id

        # В финал сохраняем только аудио, которое реально используется в сохранённых предложениях.
        # Это критично для новых диктантов: файлы часто называются как 001_ru_avto.mp3 и т.п.,
        # и они не оканчиваются на _audio.mp3.
        keep_audio_relpaths = set()
        keep_audio_names = set()
        try:
            def _basename_from_value(v: str):
                try:
                    vv = str(v or '').strip()
                    if not vv:
                        return None
                    vv = vv.split('?', 1)[0]
                    return vv.rsplit('/', 1)[-1] or None
                except Exception:
                    return None

            for _lang, _lang_data in (data.get('sentences') or {}).items():
                if not isinstance(_lang, str) or not _lang.strip():
                    continue
                lang_code = _lang.strip()
                if not _lang_data or not isinstance(_lang_data, dict):
                    continue

                shared_name = _lang_data.get('audio_user_shared')
                shared_base = _basename_from_value(shared_name) if isinstance(shared_name, str) else None
                if shared_base:
                    keep_audio_names.add(shared_base)
                    keep_audio_relpaths.add(f"{lang_code}/{shared_base}")

                for s in (_lang_data.get('sentences') or []):
                    if not s or not isinstance(s, dict):
                        continue
                    for fld in ('audio', 'audio_avto', 'audio_mic', 'audio_user'):
                        base = _basename_from_value(s.get(fld)) if isinstance(s.get(fld), str) else None
                        if base:
                            keep_audio_names.add(base)
                            keep_audio_relpaths.add(f"{lang_code}/{base}")
        except Exception:
            keep_audio_relpaths = set()
            keep_audio_names = set()
        
        # Определяем путь к временной папке
        # Пробуем сначала temp/<user_id>/dict_temp_<timestamp>/, потом temp/dict_temp_<timestamp>/
        temp_path = None
        if user_id and temp_dictation_id.startswith('dict_temp_'):
            # Новый диктант - путь temp/<user_id>/dict_temp_<timestamp>/
            temp_path = os.path.join('static', 'data', 'temp', str(user_id), temp_dictation_id)
            logger.info(f"📁 Ищем временные файлы в: {temp_path}")
            if not os.path.exists(temp_path):
                # Fallback: если папка не найдена, пробуем без user_id
                temp_path_fallback = os.path.join('static', 'data', 'temp', temp_dictation_id)
                if os.path.exists(temp_path_fallback):
                    logger.warning(f"⚠️ Папка {temp_path} не найдена, используем fallback: {temp_path_fallback}")
                    temp_path = temp_path_fallback
        else:
            # Существующий диктант - старый формат temp/dict_<id>/
            temp_path = os.path.join('static', 'data', 'temp', temp_dictation_id)
            if temp_dictation_id.startswith('dict_temp_') and not user_id:
                logger.warning(f"⚠️ user_id отсутствует, ищем в temp/{temp_dictation_id}/")
        
        if not temp_path:
            logger.warning(f"⚠️ temp_path не определен для dictation_id={dictation_id}, temp_id={temp_dictation_id}, user_id={user_id}")
        
        if temp_path and os.path.exists(temp_path):
            logger.info(f"📁 Копируем файлы из temp папки: {temp_path}")
            keep_rel_paths_posix = set()
            # Копируем все аудиофайлы из temp
            for root, dirs, files in os.walk(temp_path):
                for file in files:
                    # Поддерживаемые расширения: mp3, mp4, webm, wav, ogg, m4a, aac, flac
                    if file.lower().endswith(('.mp3', '.mp4', '.webm', '.wav', '.ogg', '.m4a', '.aac', '.flac')):
                        src_file = os.path.join(root, file)
                        # Определяем относительный путь от temp папки
                        rel_path = os.path.relpath(src_file, temp_path)
                        rel_path_posix = rel_path.replace(os.sep, '/')

                        # Фильтрация: сохраняем только то аудио, которое реально используется.
                        # Если список пустой (не удалось собрать), то для безопасности копируем всё.
                        if keep_audio_relpaths:
                            if (rel_path_posix not in keep_audio_relpaths) and (file not in keep_audio_names):
                                continue

                        dst_file = os.path.join(final_path, rel_path)
                        try:
                            keep_rel_paths_posix.add(rel_path_posix)
                        except Exception:
                            pass
                        
                        # Создаем папку назначения если нужно
                        os.makedirs(os.path.dirname(dst_file), exist_ok=True)
                        
                        # Копируем файл локально
                        shutil.copy2(src_file, dst_file)
                        logger.info(f"Скопирован аудиофайл: {rel_path}")
                        
                        # Загружаем в B2, если включено (используем правильный формат dict_<id>)
                        if b2_storage.enabled:
                            remote_path = f"dictations/{dictation_id}/{rel_path.replace(os.sep, '/')}"
                            b2_url = b2_storage.upload_file(dst_file, remote_path)
                            if b2_url:
                                logger.info(f"Аудиофайл загружен в B2: {remote_path}")
                            else:
                                logger.warning(f"Не удалось загрузить в B2: {remote_path}")

            try:
                if keep_rel_paths_posix:
                    for _root, _dirs, _files in os.walk(final_path):
                        for _file in _files:
                            if _file.lower().endswith(('.mp3', '.mp4', '.webm', '.wav', '.ogg', '.m4a', '.aac', '.flac')):
                                full = os.path.join(_root, _file)
                                rel = os.path.relpath(full, final_path)
                                rel_posix = rel.replace(os.sep, '/')
                                if rel_posix not in keep_rel_paths_posix:
                                    try:
                                        os.remove(full)
                                    except Exception:
                                        pass
            except Exception:
                pass
            
            # Копируем обложку если есть
            cover_src = os.path.join(temp_path, 'cover.webp')
            if not os.path.exists(cover_src) and temp_dictation_id.startswith('dict_temp_'):
                # Fallback: пробуем найти ковер в альтернативных местах
                fallback_paths = [
                    os.path.join('static', 'data', 'temp', temp_dictation_id, 'cover.webp'),  # temp/dict_temp_<timestamp>/cover.webp
                ]
                if user_id:
                    fallback_paths.insert(0, os.path.join('static', 'data', 'temp', str(user_id), temp_dictation_id, 'cover.webp'))  # temp/<user_id>/dict_temp_<timestamp>/cover.webp
                
                for fallback_path in fallback_paths:
                    if os.path.exists(fallback_path):
                        logger.info(f"📁 Ковер найден в fallback: {fallback_path}")
                        cover_src = fallback_path
                        break
            
            if os.path.exists(cover_src):
                cover_dst = os.path.join(final_path, 'cover.webp')
                # Создаем папку назначения
                os.makedirs(os.path.dirname(cover_dst), exist_ok=True)
                shutil.copy2(cover_src, cover_dst)
                logger.info(f"✅ Ковер скопирован: {cover_src} -> {cover_dst}")
                
                # Загружаем обложку в B2
                if b2_storage.enabled:
                    numeric_id = str(dictation_id).split('_', 1)[1] if str(dictation_id).startswith('dict_') else str(dictation_id)
                    remote_path = f"dictations_covers/{numeric_id}.webp"
                    b2_storage.upload_file(cover_dst, remote_path)
                    logger.info(f"✅ Ковер загружен в B2: {remote_path}")
            else:
                logger.warning(f"⚠️ Ковер не найден в temp папке: {temp_path}/cover.webp")

        # Очищаем временную папку после копирования
        if os.path.exists(temp_path):
            try:
                shutil.rmtree(temp_path)
                logger.info(f"✅ Очищена временная папка: {temp_path}")
            except Exception as e:
                logger.warning(f"⚠️ Не удалось удалить временную папку {temp_path}: {e}")
        
        # Если диктант был создан из приватной библиотеки и передан book_id,
        # привязываем его к книге/разделу через таблицу book_dictations
        if target_book_id and db_id:
            try:
                add_dictation_to_book(dictation_id=db_id, book_id=int(target_book_id))
                logger.info(f"✅ Диктант {db_id} привязан к книге/разделу {target_book_id}")
            except Exception as e:
                logger.error(f"❌ Не удалось привязать диктант {db_id} к книге {target_book_id}: {e}")
        
        # Добавляем диктант в категорию только если нет book_id (новая идеология: диктант принадлежит книге, а не категории)
        result = False
        if category_key and not target_book_id:
            info = {
                "id": dictation_id,
                "language_original": data.get("language_original"),
                "title": data.get("title"),
                "level": data.get("level"),
                "is_dialog": data.get("is_dialog", False),
                "speakers": data.get("speakers", {}),
            }
            result = add_dictation_to_categories(dictation_id, info, category_key, db_id=db_id)
        
        if result:
            return jsonify({"success": True, "message": "Dictation saved to DB and added to category", "dictation_id": dictation_id, "db_id": db_id})
        elif target_book_id:
            return jsonify({"success": True, "message": "Dictation saved to DB and added to book", "dictation_id": dictation_id, "db_id": db_id})
        else:
            logger.warning("⚠️ Диктант сохранен в БД, но не добавлен ни в категорию, ни в книгу")
            return jsonify({"success": True, "message": "Dictation saved to DB", "dictation_id": dictation_id, "db_id": db_id})
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"❌ Ошибка в save_dictation_final: {e}\n{error_trace}")
        return jsonify({"success": False, "error": str(e), "msg": str(e)}), 500

@editor_bp.route('/copy_dictation_to_final', methods=['POST'])
def copy_dictation_to_final():
    """Копирует диктант из temp в dictations"""
    try:
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        category_key = data.get('category_key')
        
        if not dictation_id:
            return jsonify({"success": False, "error": "Missing dictation_id"}), 400
        
        temp_path = os.path.join('static', 'data', 'temp', dictation_id)
        final_path = os.path.join('static', 'data', 'dictations', dictation_id)
        
        if not os.path.exists(temp_path):
            return jsonify({"success": False, "error": "Temp dictation not found"}), 404
        
        # Копируем всю папку
        if os.path.exists(final_path):
            shutil.rmtree(final_path)
        
        shutil.copytree(temp_path, final_path)
        
        # Загружаем info.json для получения данных диктанта
        info_path = os.path.join(final_path, 'info.json')
        if os.path.exists(info_path):
            with open(info_path, 'r', encoding='utf-8') as f:
                info_data = json.load(f)
            
            # Добавляем диктант в categories.json
            add_dictation_to_categories(dictation_id, info_data, category_key)
        
        # Удаляем папку из temp
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
            logger.info(f"Папка {temp_path} удалена из temp")
        
        logger.info(f"Диктант {dictation_id} скопирован из temp в dictations и добавлен в categories.json")
        
        return jsonify({"success": True, "message": "Dictation copied to final location and added to categories"})
        
    except Exception as e:
        logger.error(f"Ошибка в copy_dictation_to_final: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@editor_bp.route('/cleanup_temp_dictation', methods=['POST'])
@jwt_required()
def cleanup_temp_dictation():
    """Очистка temp папки при отмене создания диктанта"""
    try:
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        user_id = data.get('user_id')  # ID пользователя для пути temp/<user_id>/
        safe_email = data.get('safe_email')
        
        if not dictation_id:
            return jsonify({'error': 'Missing dictation_id'}), 400
        
        # Для новых диктантов используем путь temp/<user_id>/dict_temp_<timestamp>/
        # Для существующих - temp/dict_<id>/
        if user_id and dictation_id.startswith('dict_temp_'):
            temp_path = os.path.join('static/data/temp', str(user_id), dictation_id)
        else:
            temp_path = os.path.join('static/data/temp', dictation_id)
        
        # Удаляем temp папку если она существует
        if os.path.exists(temp_path):
            shutil.rmtree(temp_path)
            logger.info(f"✅ Очищена временная папка: {temp_path}")
            return jsonify({'success': True, 'message': 'Temp dictation cleaned up'})
        else:
            logger.info(f"ℹ️ Временная папка не найдена: {temp_path}")
            return jsonify({'success': True, 'message': 'No temp dictation to clean up'})
        
    except Exception as e:
        logger.error(f"❌ Ошибка очистки временной папки: {str(e)}")
        return jsonify({'error': str(e)}), 500

def add_dictation_to_categories(dictation_id, info_data=None, category_key=None, db_id=None):
    """
    Добавляет диктант в categories.json
    
    Args:
        dictation_id: ID диктанта (может быть старый формат dicta_XXX или новый dict_<id>)
        info_data: Данные диктанта из info.json (для обратной совместимости)
        category_key: Ключ категории
        db_id: ID из БД (если указан, используется формат dict_<id>)
    """
    try:
        categories_path = 'static/data/categories.json'
        
        # Загружаем categories.json
        with open(categories_path, 'r', encoding='utf-8') as f:
            categories = json.load(f)
        
        # Формируем ID для categories.json
        # Если передан db_id, используем формат dict_<id>
        if db_id is not None:
            dictation_id_for_category = f"dict_{db_id}"
        else:
            # Старый формат (dicta_XXX) для обратной совместимости
            dictation_id_for_category = dictation_id
        
        target_category = None
        
        # Ищем конкретную категорию по ключу
        def find_category_by_key(node, target_key):
            nonlocal target_category
            if target_category:
                return
                
            if node.get('key') == target_key:
                target_category = node
                return
                
            if 'children' in node:
                for child in node['children']:
                    find_category_by_key(child, target_key)
        
        if category_key:
            find_category_by_key(categories, category_key)
        else:
            logger.warning(f"category_key не передан для диктанта {dictation_id_for_category}")
            return False
        
        if target_category:
            # Добавляем диктант в найденную категорию
            if 'data' not in target_category:
                target_category['data'] = {}
            if 'dictations' not in target_category['data']:
                target_category['data']['dictations'] = []
            
            # Проверяем, нет ли уже такого диктанта
            existing_ids = target_category['data']['dictations']
            
            if dictation_id_for_category not in existing_ids:
                target_category['data']['dictations'].append(dictation_id_for_category)
                
                # Сохраняем обновленный categories.json
                with open(categories_path, 'w', encoding='utf-8') as f:
                    json.dump(categories, f, ensure_ascii=False, indent=2)
                
                logger.info(f"Диктант {dictation_id_for_category} добавлен в категорию {category_key}")
                return True
            else:
                logger.info(f"Диктант {dictation_id_for_category} уже есть в категории {category_key}")
                return True
        else:
            logger.warning(f"Не найдена категория с ключом {category_key}")
            return False
            
    except Exception as e:
        logger.error(f"Ошибка при добавлении диктанта в categories.json: {e}")
        return False


@editor_bp.route('/upload-audio', methods=['POST'])
# @jwt_required()  # Временно отключаем для тестирования
def upload_audio_file():
    """Загрузка аудиофайла для настроек аудио в редакторе"""
    try:
        audio = request.files.get('audioFile')
        language = request.form.get('language', 'en')
        dictation_id = request.form.get('dictation_id')  # Получаем ID диктанта
        sentence_key = request.form.get('sentenceKey')  # Ключ предложения (для режима микрофона)
        audio_mode = request.form.get('audioMode', '').strip().lower()
        
        if not audio:
            return jsonify({'success': False, 'error': 'Аудиофайл не найден'}), 400
        
        # Проверяем что это аудио файл (добавляем поддержку webm)
        if not audio.filename.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.mp4')):
            return jsonify({'success': False, 'error': 'Файл должен быть аудиофайлом'}), 400
        
        # Получаем текущего пользователя
        safe_email = get_safe_email_from_token()
        if not safe_email:
            return jsonify({'success': False, 'error': 'Пользователь не авторизован'}), 401
        
        # Определяем путь к папке диктанта
        if dictation_id and dictation_id != 'new':
            # Для существующего диктанта используем папку temp с тем же ID
            temp_path = os.path.join("static", "data", "temp", dictation_id, language)
        else:
            # Для нового диктанта создаем новую папку
            temp_path = os.path.join("static", "data", "temp", f"dictation_{int(time.time() * 1000)}", language)
        
        os.makedirs(temp_path, exist_ok=True)
        
        # Имя файла:
        # - для общего файла (audioMode=full) используем фиксированное имя
        # - иначе используем оригинальное имя
        if audio_mode == 'full':
            _, ext = os.path.splitext(audio.filename or '')
            ext = (ext or '.mp3').lower()
            filename = f"audio_user_shared{ext}"
        else:
            filename = audio.filename
        
        filepath = os.path.join(temp_path, filename)
        audio.save(filepath)
        
        # Загружаем в B2, если включено
        browser_path = None
        if b2_storage.enabled:
            # Формируем путь в B2: dictations/{dictation_id}/{language}/{filename}
            dictation_folder = os.path.basename(os.path.dirname(temp_path))
            remote_path = f"dictations/{dictation_folder}/{language}/{filename}"
            b2_url = b2_storage.upload_file(filepath, remote_path)
            
            if b2_url:
                # Используем URL из B2
                browser_path = b2_url
                logger.info(f"Аудиофайл загружен в B2: {remote_path}")
            else:
                # Fallback на локальный путь, если загрузка в B2 не удалась
                browser_path = f"/static/data/temp/{dictation_folder}/{language}/{filename}"
                logger.warning(f"Не удалось загрузить в B2, используется локальный путь: {browser_path}")
        else:
            # Локальный путь, если B2 не включен
            dictation_folder = os.path.basename(os.path.dirname(temp_path))
            browser_path = f"/static/data/temp/{dictation_folder}/{language}/{filename}"
        
        logger.info(f"Аудиофайл загружен: {filename} в {filepath}")
        
        return jsonify({
            'success': True,
            'filename': filename,
            'filepath': browser_path,
            'message': 'Файл успешно загружен'
        })
        
    except Exception as e:
        logger.error(f"Ошибка при загрузке аудиофайла: {e}")
        return jsonify({'success': False, 'error': f'Ошибка загрузки: {str(e)}'}), 500


@editor_bp.route('/upload_mic_audio', methods=['POST'])
# @jwt_required()  # Временно отключаем для тестирования
def upload_mic_audio():
    """Загрузка аудио с микрофона для предложения"""
    try:
        audio = request.files.get('audio')
        dictation_id = request.form.get('dictation_id')
        language = request.form.get('language', 'en')
        
        if not audio:
            return jsonify({'success': False, 'error': 'Аудиофайл не найден'}), 400
        
        if not dictation_id:
            return jsonify({'success': False, 'error': 'ID диктанта не указан'}), 400
        
        # Получаем текущего пользователя
        safe_email = get_safe_email_from_token()
        if not safe_email:
            return jsonify({'success': False, 'error': 'Пользователь не авторизован'}), 401
        
        # Определяем путь к папке диктанта в temp
        temp_path = os.path.join("static", "data", "temp", dictation_id, language)
        os.makedirs(temp_path, exist_ok=True)
        
        # Используем оригинальное имя файла
        filename = audio.filename
        
        filepath = os.path.join(temp_path, filename)
        audio.save(filepath)
        
        # Загружаем в B2, если включено
        browser_path = None
        if b2_storage.enabled:
            # Формируем путь в B2: dictations/{dictation_id}/{language}/{filename}
            remote_path = f"dictations/{dictation_id}/{language}/{filename}"
            b2_url = b2_storage.upload_file(filepath, remote_path)
            
            if b2_url:
                # Используем URL из B2
                browser_path = b2_url
                logger.info(f"Аудио с микрофона загружено в B2: {remote_path}")
            else:
                # Fallback на локальный путь, если загрузка в B2 не удалась
                browser_path = f"/static/data/temp/{dictation_id}/{language}/{filename}"
                logger.warning(f"Не удалось загрузить в B2, используется локальный путь: {browser_path}")
        else:
            # Локальный путь, если B2 не включен
            browser_path = f"/static/data/temp/{dictation_id}/{language}/{filename}"
        
        logger.info(f"Аудио с микрофона загружено: {filename} в {filepath}")
        
        return jsonify({
            'success': True,
            'filename': filename,
            'filepath': browser_path,
            'message': 'Запись с микрофона успешно сохранена'
        })
        
    except Exception as e:
        logger.error(f"Ошибка при загрузке аудио с микрофона: {e}")
        return jsonify({'success': False, 'error': f'Ошибка загрузки: {str(e)}'}), 500


@editor_bp.route('/delete-audio', methods=['POST'])
@jwt_required()
def delete_audio_file():
    """Удаление аудиофайла"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        filepath = data.get('filepath')
        
        if not filename or not filepath:
            return jsonify({'success': False, 'error': 'Не указан файл для удаления'}), 400
        
        deleted = False
        
        # Проверяем, это URL из B2 или локальный путь
        if filepath.startswith('http://') or filepath.startswith('https://'):
            # Это URL из B2, нужно удалить из B2
            if b2_storage.enabled:
                # Извлекаем путь из URL (например, из https://.../file/audio/.../file.mp3)
                # Пытаемся найти путь после /file/
                if '/file/' in filepath:
                    remote_path = filepath.split('/file/')[1].split('?')[0]  # Убираем query параметры
                    if b2_storage.delete_file(remote_path):
                        deleted = True
                        logger.info(f"Аудиофайл удален из B2: {remote_path}")
        else:
            # Локальный путь
            physical_path = filepath.replace('/static/', 'static/')
            
            if os.path.exists(physical_path):
                os.remove(physical_path)
                deleted = True
                logger.info(f"Аудиофайл удален локально: {filename}")
                
                # Также удаляем из B2, если файл был загружен туда
                if b2_storage.enabled:
                    # Пытаемся определить remote_path из локального пути
                    # Формат: static/data/temp/{dictation_id}/{language}/{filename}
                    if 'temp/' in physical_path:
                        parts = physical_path.split('temp/')[1].split('/')
                        if len(parts) >= 3:
                            remote_path = f"dictations/{'/'.join(parts)}"
                            b2_storage.delete_file(remote_path)  # Пытаемся удалить, но не критично если не найдено
        
        if deleted:
            return jsonify({'success': True, 'message': 'Файл успешно удален'})
        else:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 404
            
    except Exception as e:
        logger.error(f"Ошибка при удалении аудиофайла: {e}")
        return jsonify({'success': False, 'error': f'Ошибка удаления: {str(e)}'}), 500


@editor_bp.route('/cut-audio', methods=['POST'])
# @jwt_required()
def cut_audio_file():
    """Обрезание аудиофайла"""
    try:
        data = request.get_json()
        logger.info(f"Получены данные для обрезки аудио: {data}")
        
        dictation_id = data.get('dictation_id')
        filename = data.get('filename')
        filepath = data.get('filepath')
        audio_b64 = data.get('audio_b64')
        mime = data.get('mime')
        start_time_raw = data.get('start_time', None)
        if start_time_raw is None:
            start_time_raw = data.get('startTime', 0)
        end_time_raw = data.get('end_time', None)
        if end_time_raw is None:
            end_time_raw = data.get('endTime', 0)

        start_time = float(start_time_raw or 0)
        end_time = float(end_time_raw or 0)
        language = data.get('language', 'en')
        
        if not filename:
            logger.error("Отсутствует filename")
            return jsonify({'success': False, 'error': 'Не указан файл для обрезания'}), 400

        physical_path = None
        cleanup_paths = []

        if audio_b64:
            # Draft-mode: файл существует только в браузере, передан как base64
            try:
                ext = os.path.splitext(filename)[1].lower() or '.mp3'
                tmp_in = tempfile.NamedTemporaryFile(prefix='dictafan_cut_in_', suffix=ext, delete=False)
                physical_path = tmp_in.name
                tmp_in.close()

                with open(physical_path, 'wb') as f:
                    f.write(base64.b64decode(audio_b64))
                cleanup_paths.append(physical_path)
            except Exception as e:
                logger.error(f"Не удалось подготовить input файл из audio_b64: {e}", exc_info=True)
                return jsonify({'success': False, 'error': 'Некорректные данные audio_b64'}), 400
        else:
            if not filepath:
                logger.error("Отсутствуют filepath и audio_b64")
                return jsonify({'success': False, 'error': 'Не указан файл для обрезания'}), 400

            # Server-file mode
            physical_path = filepath.replace('/static/', 'static/')
            logger.info(f"Физический путь к файлу: {physical_path}")
            if not os.path.exists(physical_path):
                logger.error(f"Файл не найден: {physical_path}")
                return jsonify({'success': False, 'error': 'Исходный файл не найден'}), 404
        
        # Обрезание аудио: единый путь через ffmpeg
        logger.info(f"Обрезание аудио: {filename} с {start_time} по {end_time}")

        try:
            import subprocess
            ext = os.path.splitext(filename)[1].lower() or os.path.splitext(physical_path)[1].lower() or '.mp3'
            with tempfile.NamedTemporaryFile(prefix='dictafan_cut_out_', delete=False, suffix=ext) as tmp_out:
                tmp_out_path = tmp_out.name
            cleanup_paths.append(tmp_out_path)

            # Команда ffmpeg: по возможности без перекодирования (-c copy)
            cmd = [
                'ffmpeg', '-y',
                '-i', physical_path,
                '-ss', str(max(0.0, float(start_time))),
                '-to', str(max(0.0, float(end_time))),
                '-c', 'copy',
                tmp_out_path
            ]
            logger.info(f"Запуск ffmpeg: {' '.join(cmd)}")
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if proc.returncode != 0:
                # Фолбек: перекодирование (более надёжно, если контейнер/тайминги не подходят)
                logger.warning(f"ffmpeg copy failed, retry with re-encode: {proc.stderr.decode(errors='ignore')}")
                cmd2 = [
                    'ffmpeg', '-y',
                    '-i', physical_path,
                    '-ss', str(max(0.0, float(start_time))),
                    '-to', str(max(0.0, float(end_time))),
                    '-vn',
                    tmp_out_path
                ]
                logger.info(f"Запуск ffmpeg (re-encode): {' '.join(cmd2)}")
                proc2 = subprocess.run(cmd2, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if proc2.returncode != 0:
                    logger.error(f"ffmpeg re-encode error: {proc2.stderr.decode(errors='ignore')}")
                    return jsonify({'success': False, 'error': 'ffmpeg не смог обрезать файл'}), 500

            if audio_b64:
                with open(tmp_out_path, 'rb') as f:
                    out_b64 = base64.b64encode(f.read()).decode('ascii')
                return jsonify({
                    'success': True,
                    'filename': filename,
                    'mime': mime or 'audio/mpeg',
                    'audio_b64': out_b64,
                    'start_time': start_time,
                    'end_time': end_time,
                    'message': 'Аудиофайл успешно обрезан'
                })

            # Server-file mode: перезаписываем исходный файл
            os.replace(tmp_out_path, physical_path)
            logger.info(f"Аудиофайл успешно обрезан и перезаписан (ffmpeg): {filename}")

        except Exception as e:
            logger.error(f"Ошибка при обрезании аудио (ffmpeg): {e}", exc_info=True)
            return jsonify({'success': False, 'error': f'Ошибка обрезания аудио: {str(e)}'}), 500

        finally:
            for p in cleanup_paths:
                try:
                    if p and os.path.exists(p):
                        os.remove(p)
                except OSError:
                    pass
        
        return jsonify({
            'success': True,
            'filename': filename,
            'filepath': filepath,
            'start_time': start_time,
            'end_time': end_time,
            'message': 'Аудиофайл успешно обрезан'
        })
        
    except Exception as e:
        logger.error(f"Ошибка при обрезании аудиофайла: {e}")
        return jsonify({'success': False, 'error': f'Ошибка обрезания: {str(e)}'}), 500


@editor_bp.route('/split-audio', methods=['POST'])
# @jwt_required()
def split_audio_file():
    """Разрезание аудиофайла на предложения"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        filepath = data.get('filepath')
        audio_b64 = data.get('audio_b64')
        mime = data.get('mime')
        sentences = data.get('sentences', [])
        dictation_id = data.get('dictation_id')
        
        if not filename or not sentences:
            return jsonify({'success': False, 'error': 'Не указаны необходимые параметры'}), 400

        physical_path = None
        cleanup_paths = []

        if audio_b64:
            try:
                ext = os.path.splitext(filename)[1].lower() or '.mp3'
                tmp_in = tempfile.NamedTemporaryFile(prefix='dictafan_split_in_', suffix=ext, delete=False)
                physical_path = tmp_in.name
                tmp_in.close()
                with open(physical_path, 'wb') as f:
                    f.write(base64.b64decode(audio_b64))
                cleanup_paths.append(physical_path)
            except Exception as e:
                logger.error(f"Не удалось подготовить input файл из audio_b64: {e}", exc_info=True)
                return jsonify({'success': False, 'error': 'Некорректные данные audio_b64'}), 400
        else:
            if not filepath:
                return jsonify({'success': False, 'error': 'Не указан источник файла'}), 400

            physical_path = filepath.replace('/static/', 'static/')
            if not os.path.exists(physical_path):
                return jsonify({'success': False, 'error': 'Исходный файл не найден'}), 404
        
        logger.info(f"Разрезание аудио: {filename} на {len(sentences)} предложений")

        created_files = []
        try:
            import subprocess
            for sentence in sentences:
                key = sentence.get('key')
                start_time_raw = sentence.get('start_time', None)
                if start_time_raw is None:
                    start_time_raw = sentence.get('startTime', 0)
                end_time_raw = sentence.get('end_time', None)
                if end_time_raw is None:
                    end_time_raw = sentence.get('endTime', 0)
                start_time = float(start_time_raw or 0)
                end_time = float(end_time_raw or 0)
                language = sentence.get('language', 'en')

                if not key or start_time >= end_time:
                    continue

                segment_filename = f"{key}_{language}_user.mp3"
                with tempfile.NamedTemporaryFile(prefix='dictafan_split_out_', suffix='.mp3', delete=False) as tmp_out:
                    tmp_out_path = tmp_out.name
                cleanup_paths.append(tmp_out_path)

                cmd = [
                    'ffmpeg', '-y',
                    '-i', physical_path,
                    '-ss', str(max(0.0, float(start_time))),
                    '-to', str(max(0.0, float(end_time))),
                    '-c', 'copy',
                    tmp_out_path
                ]
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if proc.returncode != 0:
                    logger.warning(f"ffmpeg copy failed for {segment_filename}, retry with re-encode")
                    cmd2 = [
                        'ffmpeg', '-y',
                        '-i', physical_path,
                        '-ss', str(max(0.0, float(start_time))),
                        '-to', str(max(0.0, float(end_time))),
                        '-vn',
                        tmp_out_path
                    ]
                    proc2 = subprocess.run(cmd2, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    if proc2.returncode != 0:
                        logger.error(f"ffmpeg re-encode error for {segment_filename}: {proc2.stderr.decode(errors='ignore')}")
                        continue

                if audio_b64:
                    with open(tmp_out_path, 'rb') as f:
                        seg_b64 = base64.b64encode(f.read()).decode('ascii')
                    created_files.append({
                        'key': key,
                        'filename': segment_filename,
                        'mime': mime or 'audio/mpeg',
                        'audio_b64': seg_b64,
                        'start_time': start_time,
                        'end_time': end_time
                    })
                else:
                    # Server-file mode: создаём файл рядом с исходником
                    output_dir = os.path.dirname(physical_path)
                    segment_path = os.path.join(output_dir, segment_filename)
                    os.replace(tmp_out_path, segment_path)
                    created_files.append({
                        'key': key,
                        'filename': segment_filename,
                        'start_time': start_time,
                        'end_time': end_time
                    })

                logger.info(f"Создан файл: {segment_filename} ({start_time:.2f}s - {end_time:.2f}s)")

        except Exception as e:
            logger.error(f"Ошибка при разрезании аудио (ffmpeg): {e}", exc_info=True)
            return jsonify({'success': False, 'error': f'Ошибка разрезания аудио: {str(e)}'}), 500

        finally:
            if audio_b64:
                for p in cleanup_paths:
                    try:
                        if p and os.path.exists(p):
                            os.remove(p)
                    except OSError:
                        pass
        
        return jsonify({
            'success': True,
            'message': f'Аудиофайл успешно разрезан на {len(created_files)} предложений',
            'sentences_count': len(created_files),
            'files': created_files  # Возвращаем информацию о созданных файлах
        })
        
    except Exception as e:
        logger.error(f"Ошибка при разрезании аудиофайла: {e}")
        return jsonify({'success': False, 'error': f'Ошибка разрезания: {str(e)}'}), 500

@editor_bp.route('/create-combined-audio', methods=['POST'])
def create_combined_audio():
    """Создание комбинированного аудио файла из последовательности файлов и пауз"""
    try:
        data = request.get_json()
        dictation_id = data.get('dictation_id')
        safe_email = data.get('safe_email')
        file_sequence = data.get('file_sequence', [])
        pattern = data.get('pattern', '')
        
        if not dictation_id:
            return jsonify({'success': False, 'error': 'dictation_id не указан'}), 400
        
        if not file_sequence:
            return jsonify({'success': False, 'error': 'file_sequence пуст'}), 400
        
        # Определяем пути - файл сохраняется в temp папке диктанта
        temp_dir = os.path.join('static', 'data', 'temp', dictation_id)
        os.makedirs(temp_dir, exist_ok=True)
        
        # Используем переданное имя файла или генерируем по паттерну
        custom_filename = data.get('filename')
        if custom_filename:
            # Убеждаемся, что есть расширение
            if not custom_filename.endswith(('.mp3', '.wav', '.ogg', '.m4a', '.webm')):
                custom_filename += '.mp3'
            output_filename = custom_filename
        else:
            # Генерируем имя файла: audio_<комбинация>
            output_filename = f"audio_{pattern}.mp3"
        output_path = os.path.join(temp_dir, output_filename)
        
        # Загружаем и склеиваем аудио
        # Сначала проходим по всем файлам, чтобы определить оптимальный sample_rate
        sample_rates = []
        audio_segments = []
        sample_rate = None
        
        # Первый проход: определяем sample_rate из всех файлов
        for item in file_sequence:
            item_type = item.get('type')
            
            if item_type == 'file':
                filename = item.get('filename')
                language = item.get('language', 'en')
                
                if filename:
                    file_path = os.path.join(temp_dir, language, filename)
                    if os.path.exists(file_path):
                        try:
                            # Загружаем только метаданные для определения sample_rate
                            y_test, sr_test = librosa.load(file_path, sr=None, duration=0.1)
                            sample_rates.append(sr_test)
                            logger.info(f"Файл {filename}: sample_rate={sr_test}, формат={os.path.splitext(filename)[1]}")
                        except Exception as e:
                            logger.warning(f"Не удалось определить sample_rate для {filename}: {e}")
        
        # Выбираем sample_rate (используем самый высокий или дефолтный)
        if sample_rates:
            sample_rate = max(sample_rates)  # Используем самый высокий sample_rate для лучшего качества
        else:
            sample_rate = 22050  # Дефолтная частота дискретизации
        
        logger.info(f"Используемый sample_rate для склейки: {sample_rate} Hz")
        
        # Второй проход: загружаем и обрабатываем все файлы
        for item in file_sequence:
            item_type = item.get('type')
            
            if item_type == 'pause':
                # Создаем тишину
                duration = item.get('duration', 1.0)
                silence = numpy.zeros(int(duration * sample_rate))
                audio_segments.append(silence)
                
            elif item_type == 'pause_file':
                # Пауза длиной в файл
                duration_file = item.get('duration_file')
                language = item.get('language', 'en')
                
                if duration_file:
                    file_path = os.path.join(temp_dir, language, duration_file)
                    if os.path.exists(file_path):
                        try:
                            # Загружаем файл полностью для определения длительности
                            y_ref, sr_ref = librosa.load(file_path, sr=None)
                            # Вычисляем длительность в секундах
                            duration_sec = len(y_ref) / sr_ref
                            # Создаем тишину нужной длительности с target sample_rate
                            silence = numpy.zeros(int(duration_sec * sample_rate))
                            audio_segments.append(silence)
                            logger.info(f"Пауза длиной в файл {duration_file}: {duration_sec:.2f}s")
                        except Exception as e:
                            logger.warning(f"Не удалось загрузить файл для паузы {duration_file}: {e}")
                            # Fallback на 1 секунду
                            silence = numpy.zeros(int(sample_rate))
                            audio_segments.append(silence)
                    else:
                        # Fallback на 1 секунду
                        fallback_duration = item.get('fallback_duration', 1.0)
                        silence = numpy.zeros(int(fallback_duration * sample_rate))
                        audio_segments.append(silence)
                else:
                    # Fallback на 1 секунду
                    fallback_duration = item.get('fallback_duration', 1.0)
                    silence = numpy.zeros(int(fallback_duration * sample_rate))
                    audio_segments.append(silence)
                    
            elif item_type == 'file':
                # Загружаем аудио файл
                filename = item.get('filename')
                language = item.get('language', 'en')
                
                if filename:
                    file_path = os.path.join(temp_dir, language, filename)
                    if os.path.exists(file_path):
                        try:
                            # librosa.load автоматически:
                            # 1. Поддерживает разные форматы (mp3, wav, webm, ogg, m4a, flac и т.д.)
                            # 2. Конвертирует стерео в моно
                            # 3. Нормализует данные в диапазон [-1, 1]
                            y, sr = librosa.load(file_path, sr=None)
                            
                            # Ресемплируем если нужно
                            if sr != sample_rate:
                                y = librosa.resample(y, orig_sr=sr, target_sr=sample_rate)
                                logger.debug(f"Ресемплирование {filename}: {sr} -> {sample_rate} Hz")
                            
                            # Убеждаемся, что данные нормализованы (librosa это делает автоматически, но проверим)
                            max_val = numpy.max(numpy.abs(y))
                            if max_val > 1.0:
                                y = y / max_val
                                logger.warning(f"Нормализация {filename}: max_val={max_val}")
                            
                            audio_segments.append(y)
                            logger.debug(f"Загружен файл {filename}: {len(y)} samples, длительность {len(y)/sample_rate:.2f}s")
                            
                        except Exception as e:
                            logger.error(f"Ошибка загрузки файла {file_path}: {e}", exc_info=True)
                            # Пропускаем файл, если не удалось загрузить
                            continue
                    else:
                        logger.warning(f"Файл не найден: {file_path}")
                        # Пропускаем файл, если не найден
                        continue
        
        if not audio_segments:
            return jsonify({'success': False, 'error': 'Не удалось загрузить ни одного аудио сегмента'}), 400
        
        # Склеиваем все сегменты
        logger.info(f"Склеивание {len(audio_segments)} сегментов...")
        combined_audio = numpy.concatenate(audio_segments)
        
        # Финальная нормализация для предотвращения клиппинга
        max_val = numpy.max(numpy.abs(combined_audio))
        if max_val > 0.95:  # Если есть риск клиппинга, немного уменьшаем громкость
            combined_audio = combined_audio * (0.95 / max_val)
            logger.info(f"Применена финальная нормализация: коэффициент {0.95 / max_val:.3f}")
        
        # Сохраняем результат (soundfile автоматически определяет формат по расширению)
        sf.write(output_path, combined_audio, sample_rate)
        logger.info(f"Файл сохранен: {output_path}, длительность: {len(combined_audio)/sample_rate:.2f}s")
        
        logger.info(f"✅ Создан комбинированный аудио файл: {output_filename}")
        
        return jsonify({
            'success': True,
            'filename': output_filename,
            'filepath': f"/static/data/temp/{dictation_id}/{output_filename}",
            'message': 'Комбинированный аудио файл успешно создан'
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка при создании комбинированного аудио: {e}", exc_info=True)
        return jsonify({'success': False, 'error': f'Ошибка создания файла: {str(e)}'}), 500
