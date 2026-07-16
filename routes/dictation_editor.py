import json
from flask import request, jsonify, redirect
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
# Резервирование ID для нового диктанта
# ==============================================================
@editor_bp.route('/api/dictation/reserve_id', methods=['GET'])
@jwt_required()
def reserve_dictation_id():
    """Резервирует ID для нового диктанта.
    
    Создаёт запись в БД с временным статусом и возвращает
    зарезервированный ID вида dict_<number>.
    Это нужно, чтобы при открытии модального окна редактора
    у нового диктанта уже был реальный ID (не dict_temp_*).
    """
    try:
        from helpers.db import get_db_connection
        import psycopg2
        
        current_email = get_jwt_identity()
        user_db = get_user_by_email(current_email)
        if not user_db or not user_db.get('id'):
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        user_id = user_db['id']
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Создаём запись в БД с минимальными данными
                # Используем функцию nextval для получения следующего ID из sequence
                cur.execute("""
                    INSERT INTO dictations (title, language_code, owner_id, is_public, level)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                """, ('Новый диктант', 'en', user_id, False, 'A1'))
                new_id = cur.fetchone()[0]
                conn.commit()
                
                dictation_id = f"dict_{new_id}"
                logger.info(f"✅ Зарезервирован ID диктанта: {dictation_id} для пользователя {user_id}")
                
                return jsonify({
                    'success': True,
                    'dictation_id': dictation_id,
                    'id': new_id,
                })
        except psycopg2.Error as e:
            conn.rollback()
            logger.error(f"❌ Ошибка резервирования ID диктанта: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
        finally:
            conn.close()
    except Exception as e:
        import traceback
        logger.error(f"❌ Ошибка резервирования ID диктанта: {e}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ==============================================================
# API: список упражнений диктанта
# ==============================================================
@editor_bp.route('/api/dictation/<int:dictation_id>/exercises', methods=['GET'])
@jwt_required()
def api_get_dictation_exercises(dictation_id: int):
    """Возвращает список упражнений для диктанта."""
    logger.info(f"📋 [exercises] Запрос упражнений для dictation_id={dictation_id}")
    try:
        from helpers.db_dictations import list_dictation_exercises
        exercises = list_dictation_exercises(dictation_id)
        logger.info(f"📋 [exercises] Упражнения для dictation_id={dictation_id}: count={len(exercises)}, data={exercises}")
        return jsonify({'success': True, 'exercises': exercises})
    except Exception as e:
        logger.error(f"📋 [exercises] Ошибка получения упражнений для диктанта {dictation_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


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


# ==============================================================
# B2 Storage health check (ручная проверка)
# ==============================================================
@editor_bp.route('/api/b2/health', methods=['GET'])
def api_b2_health():
    """Проверяет, работает ли B2 Storage. Не делает платных запросов к B2 API."""
    try:
        from helpers.b2_storage import b2_storage
        if not b2_storage.enabled:
            return jsonify({'success': True, 'status': 'disabled', 'message': 'B2 Storage отключён'})
        
        # Проверяем, инициализирован ли bucket (без платного запроса к API)
        if b2_storage.bucket is not None:
            return jsonify({'success': True, 'status': 'ok', 'message': 'B2 Storage работает'})
        
        # Пытаемся переинициализировать
        ok = b2_storage._ensure_initialized()
        if ok and b2_storage.bucket is not None:
            return jsonify({'success': True, 'status': 'ok', 'message': 'B2 Storage работает (переинициализирован)'})
        
        return jsonify({'success': True, 'status': 'error', 'message': 'B2 Storage не инициализирован. Проверь ключи в переменных окружения.'})
    except Exception as e:
        logger.error(f"B2 health check error: {e}", exc_info=True)
        return jsonify({'success': False, 'status': 'error', 'message': f'Ошибка: {e}'}), 500


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


@editor_bp.route('/api/b2/get_download_url', methods=['POST'])
@jwt_required()
def api_b2_get_download_url():
    try:
        if not b2_storage.enabled or not b2_storage.bucket:
            return jsonify({'success': False, 'error': 'B2 storage is disabled'}), 503

        data = request.get_json(silent=True) or {}
        dictation_id_raw = str(data.get('dictation_id') or '').strip()
        lang = str(data.get('lang') or '').strip().lower()
        filename = str(data.get('filename') or '').strip()

        if not dictation_id_raw:
            return jsonify({'success': False, 'error': 'Missing dictation_id'}), 400
        if dictation_id_raw.isdigit():
            dictation_id = f"dict_{dictation_id_raw}"
        else:
            dictation_id = dictation_id_raw
        if not dictation_id.startswith('dict_'):
            return jsonify({'success': False, 'error': 'Invalid dictation_id'}), 400
        if not lang:
            return jsonify({'success': False, 'error': 'Missing lang'}), 400
        if not filename:
            return jsonify({'success': False, 'error': 'Missing filename'}), 400

        remote_path = f"dictations/{dictation_id}/{lang}/{filename}"

        url = b2_storage.get_download_url(remote_path)
        if not url:
            logger.error('[b2_get_download_url] failed remote_path=%s', remote_path)
            return jsonify({'success': False, 'error': 'Failed to get download URL'}), 502

        try:
            logger.info('[b2_get_download_url] ok dictation_id=%s lang=%s filename=%s remote_path=%s', dictation_id, lang, filename, remote_path)
        except Exception:
            pass

        return jsonify({'success': True, 'url': url})
    except Exception as e:
        logger.error('api_b2_get_download_url error: %s', e, exc_info=True)
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
        if keep_remote_paths is not None and not isinstance(keep_remote_paths, list):
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

        def _expected_keep_set_from_db(_db_id: int, _dictation_id: str):
            out = set()
            try:
                from helpers.db_dictations import get_dictation_sentences
                rows = get_dictation_sentences(int(_db_id))
            except Exception:
                rows = []

            def _add(lang_code: str, filename: str):
                try:
                    l = str(lang_code or '').strip().lower()
                    f = str(filename or '').strip()
                    if not l or not f:
                        return
                    base = f.split('?', 1)[0].rsplit('/', 1)[-1].strip()
                    if not base:
                        return
                    out.add(f"dictations/{_dictation_id}/{l}/{base}")
                except Exception:
                    return

            for r in (rows or []):
                try:
                    lang = (r.get('language_code') if isinstance(r, dict) else None) or ''
                    for fld in ('audio', 'audio_mic', 'audio_file'):
                        val = r.get(fld) if isinstance(r, dict) else None
                        if val:
                            _add(lang, val)
                except Exception:
                    continue
            return out

        expected_keep_set = _expected_keep_set_from_db(db_id, dictation_id)

        # Sanitize keep list to prevent deleting outside of prefix.
        keep_set = set(expected_keep_set)
        for p in (keep_remote_paths or []):
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
            'keep_from_db': len(expected_keep_set),
            'keep_from_client': len(keep_remote_paths or []),
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
        
        # Determine original language from payload (SSOT for dictations.language_code)
        try:
            payload_original_lang = str(data.get('language_original') or data.get('language_code') or '').strip().lower()
        except Exception:
            payload_original_lang = ''
        if not payload_original_lang:
            payload_original_lang = 'en'

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
                    language_code=payload_original_lang,
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
            
            # Обновляем диктант с полными данными (title, level, speakers, title_translations, author_materials_url, audio_order)
            update_dictation(
                dictation_id=db_id,
                title=data.get("title", "Новый диктант"),
                language_code=payload_original_lang,
                level=data.get("level", "A1"),
                speakers=data.get("speakers", {}),
                title_translations=data.get("title_translations", {}),
                author_materials_url=data.get("author_materials_url"),
                audio_user_shared=data.get("audio_user_shared"),
                audio_order=data.get("audio_order")
            )
        elif db_id:
            # Обновляем существующий диктант в БД
            update_dictation(
                dictation_id=db_id,
                title=data.get("title"),
                language_code=payload_original_lang,
                level=data.get("level"),
                speakers=data.get("speakers", {}),
                title_translations=data.get("title_translations", {}),
                author_materials_url=data.get("author_materials_url"),
                audio_user_shared=data.get("audio_user_shared"),
                audio_order=data.get("audio_order")
            )
        else:
            return jsonify({"success": False, "error": "Missing db_id - dictation not created in DB"}), 400

        exercises_saved = True
        exercises_error = None
        exercises_after_save = None
        # Reconcile dictation exercises only during explicit dictation save.
        # Client sends the desired exercises set (excluding Full if it wants; server ensures Full exists).
        try:
            exercises_payload = data.get('exercises')
            if exercises_payload is not None:
                from helpers.db_dictations import reconcile_dictation_exercises
                reconcile_res = reconcile_dictation_exercises(int(db_id), exercises_payload)
                try:
                    from helpers.db_dictations import list_dictation_exercises
                    exercises_after_save = list_dictation_exercises(int(db_id))
                except Exception:
                    exercises_after_save = None
                try:
                    logger.info(
                        "✅ Упражнения сохранены для dictation_id=%s: %s",
                        db_id,
                        reconcile_res,
                    )
                except Exception:
                    pass
        except Exception as e:
            exercises_saved = False
            try:
                exercises_error = str(e)
            except Exception:
                exercises_error = 'Failed to save exercises'
            logger.warning(f"⚠️ Не удалось сохранить упражнения диктанта {db_id}: {exercises_error}")
        
        # Умное сохранение предложений: обновляем только изменённые, добавляем новые, удаляем только отсутствующие
        from helpers.db_dictations import get_sentence_by_key, update_sentence
        
        # sentences_data — плоский массив объектов { language_code, key, text, explanation, audio, audio_mic, audio_file, start, end, chain, checked, position }
        sentences_data = data.get('sentences', [])
        if not isinstance(sentences_data, list):
            sentences_data = []
        logger.info(f"📝 Сохранение предложений для диктанта {dictation_id} (db_id={db_id}), всего предложений: {len(sentences_data)}")

        # Считаем количество предложений для языка оригинала (для обновления sentences_count)
        computed_sentences_count = 0
        for s in sentences_data:
            if s.get('language_code') == payload_original_lang:
                computed_sentences_count += 1

        added_count = 0
        updated_count = 0
        deleted_count = 0
        
        # Собираем все ключи предложений из новых данных
        new_sentence_keys = set()
        for sentence in sentences_data:
            lang = sentence.get('language_code', '')
            sentence_key = sentence.get('key', '')
            if lang and sentence_key:
                new_sentence_keys.add((lang, sentence_key))
        
        # Получаем все существующие предложения
        old_sentences = get_dictation_sentences(db_id)
        logger.info(f"🧾 В БД сейчас предложений для dictation_id={db_id}: {len(old_sentences)}")
        old_sentences_map = {}
        for old_sentence in old_sentences:
            key = (old_sentence['language_code'], old_sentence['sentence_key'])
            old_sentences_map[key] = old_sentence
        
        # Обрабатываем каждое предложение из новых данных
        for sentence in sentences_data:
            lang = sentence.get('language_code', '')
            sentence_key = sentence.get('key', '')
            if not lang or not sentence_key:
                continue
            
            key = (lang, sentence_key)
            old_sentence = old_sentences_map.get(key)
            
            if old_sentence:
                # Предложение существует - проверяем изменилось ли что-то
                # Сравниваем числа с небольшой погрешностью (для float)
                def float_eq(a, b):
                    # Пустые строки считаем как None (нет значения)
                    if a == '' or a is None:
                        a = None
                    if b == '' or b is None:
                        b = None
                    if a is None and b is None:
                        return True
                    if a is None or b is None:
                        return False
                    return abs(float(a) - float(b)) < 0.01
                
                # Normalize audio to filename-only before comparing / saving.
                audio_in = _normalize_audio_filename(sentence.get('audio'))
                audio_mic_in = _normalize_audio_filename(sentence.get('audio_mic'))
                audio_file_in = _normalize_audio_filename(sentence.get('audio_file'))

                has_changes = (
                    old_sentence['text'] != sentence.get('text', '') or
                    old_sentence['explanation'] != sentence.get('explanation', '') or
                    (old_sentence.get('audio') or '') != audio_in or
                    (old_sentence.get('audio_mic') or '') != audio_mic_in or
                    (old_sentence.get('audio_file') or '') != audio_file_in or
                    not float_eq(old_sentence['start'], sentence.get('start')) or
                    not float_eq(old_sentence['end'], sentence.get('end')) or
                    old_sentence['chain'] != sentence.get('chain', False) or
                    old_sentence['checked'] != sentence.get('checked', False) or
                    (old_sentence.get('position') != sentence.get('position'))
                )
                
                if has_changes:
                    audio_final = audio_in
                    audio_mic_final = audio_mic_in
                    audio_file_final = audio_file_in
                    # Конвертируем пустые строки в None для numeric-полей start/end
                    start_val = sentence.get('start')
                    end_val = sentence.get('end')
                    if start_val == '' or start_val is None:
                        start_val = None
                    if end_val == '' or end_val is None:
                        end_val = None
                    # Обновляем только изменённые поля
                    update_sentence(
                        sentence_id=old_sentence['id'],
                        text=sentence.get('text', ''),
                        explanation=sentence.get('explanation'),
                        audio=audio_final,
                        audio_mic=audio_mic_final,
                        audio_file=audio_file_final,
                        start=start_val,
                        end=end_val,
                        chain=sentence.get('chain', False),
                        checked=sentence.get('checked', False),
                        position=sentence.get('position')
                    )
                    updated_count += 1
            else:
                audio_final = _normalize_audio_filename(sentence.get('audio'))
                audio_mic_final = _normalize_audio_filename(sentence.get('audio_mic'))
                audio_file_final = _normalize_audio_filename(sentence.get('audio_file'))
                # Конвертируем пустые строки в None для numeric-полей start/end
                start_val = sentence.get('start')
                end_val = sentence.get('end')
                if start_val == '' or start_val is None:
                    start_val = None
                if end_val == '' or end_val is None:
                    end_val = None
                # Новое предложение - добавляем
                add_sentence(
                    dictation_id=db_id,
                    language_code=lang,
                    sentence_key=sentence_key,
                    text=sentence.get('text', ''),
                    explanation=sentence.get('explanation'),
                    audio=audio_final,
                    audio_mic=audio_mic_final,
                    audio_file=audio_file_final,
                    start=start_val,
                    end=end_val,
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
            "✅ Итог сохранения предложений для dictation_id=%s (db_id=%s): new_keys=%s old=%s added=%s updated=%s deleted=%s",
            dictation_id,
            db_id,
            len(new_sentence_keys),
            len(old_sentences),
            added_count,
            updated_count,
            deleted_count,
        )

        try:
            update_dictation(dictation_id=int(db_id), sentences_count=int(computed_sentences_count))
        except Exception:
            pass

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

            # audio_user_shared приходит на верхнем уровне data
            shared_name = data.get('audio_user_shared')
            shared_base = _basename_from_value(shared_name) if isinstance(shared_name, str) else None
            if shared_base:
                keep_audio_names.add(shared_base)
                # Добавляем для всех языков, т.к. общее аудио не привязано к конкретному языку
                for s in sentences_data:
                    lang_code = s.get('language_code', '')
                    if lang_code:
                        keep_audio_relpaths.add(f"{lang_code}/{shared_base}")

            for s in sentences_data:
                if not s or not isinstance(s, dict):
                    continue
                lang_code = s.get('language_code', '')
                if not lang_code:
                    continue
                for fld in ('audio', 'audio_mic', 'audio_file'):
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
        
        # Если в данных есть cover_b64 — сохраняем обложку во временную папку
        # (пришла из редактора через CoverManager как base64 data URL)
        cover_b64 = data.get('cover_b64')
        if cover_b64 and isinstance(cover_b64, str) and cover_b64.startswith('data:'):
            try:
                # Создаём временную папку, если её ещё нет
                if temp_path:
                    os.makedirs(temp_path, exist_ok=True)
                else:
                    # Если temp_path не определён, создаём запасной
                    temp_path = os.path.join('static', 'data', 'temp', str(user_id or '0'), temp_dictation_id)
                    os.makedirs(temp_path, exist_ok=True)
                
                # Декодируем base64 (формат: data:image/webp;base64,<data>)
                import base64
                header, _, b64_data = cover_b64.partition(',')
                if b64_data:
                    cover_bytes = base64.b64decode(b64_data)
                    cover_path = os.path.join(temp_path, 'cover.webp')
                    with open(cover_path, 'wb') as f:
                        f.write(cover_bytes)
                    logger.info(f"✅ Обложка сохранена из cover_b64: {cover_path}")
            except Exception as e:
                logger.warning(f"⚠️ Не удалось сохранить cover_b64: {e}")
        
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
            return jsonify({
                "success": True,
                "message": "Dictation saved to DB and added to category",
                "dictation_id": dictation_id,
                "id": db_id,
                "db_id": db_id,
                "exercises_saved": exercises_saved,
                "exercises_error": exercises_error,
                "exercises_after_save": exercises_after_save,
            })
        elif target_book_id:
            return jsonify({
                "success": True,
                "message": "Dictation saved to DB and added to book",
                "dictation_id": dictation_id,
                "id": db_id,
                "db_id": db_id,
                "exercises_saved": exercises_saved,
                "exercises_error": exercises_error,
                "exercises_after_save": exercises_after_save,
            })
        else:
            logger.warning("⚠️ Диктант сохранен в БД, но не добавлен ни в категорию, ни в книгу")
            return jsonify({
                "success": True,
                "message": "Dictation saved to DB",
                "dictation_id": dictation_id,
                "id": db_id,
                "db_id": db_id,
                "exercises_saved": exercises_saved,
                "exercises_error": exercises_error,
                "exercises_after_save": exercises_after_save,
            })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"❌ Ошибка в save_dictation_final: {e}\n{error_trace}")
        return jsonify({"success": False, "error": str(e), "msg": str(e)}), 500

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

        # --- SMART SPLIT: транскрибация через Whisper ---
        is_smart = data.get('smart', False)
        if is_smart:
            logger.info("🧠 Smart split: транскрибируем аудио через Whisper...")
            try:
                from faster_whisper import WhisperModel
                language_hint = data.get('language') or None
                model = getattr(current_app, '_whisper_model_tiny', None)
                if model is None:
                    model = WhisperModel('tiny', device='cpu', compute_type='int8')
                    setattr(current_app, '_whisper_model_tiny', model)

                whisper_segments, info = model.transcribe(
                    physical_path,
                    language=language_hint,
                    vad_filter=True,
                )

                # Собираем сегменты Whisper с текстом и временными метками
                wsegments = []
                for s in whisper_segments:
                    try:
                        t = (s.text or '').strip()
                        if t:
                            wsegments.append({
                                'start': float(getattr(s, 'start', 0.0) or 0.0),
                                'end': float(getattr(s, 'end', 0.0) or 0.0),
                                'text': t.lower(),
                            })
                    except Exception:
                        continue

                logger.info(f"🧠 Whisper распознал {len(wsegments)} сегментов")

                # Маппим предложения на сегменты Whisper по тексту
                # Нормализуем текст предложений для сравнения
                def _normalize_for_match(t):
                    import re
                    t = t.lower().strip()
                    t = re.sub(r'[^\w\s]', '', t)
                    t = re.sub(r'\s+', ' ', t).strip()
                    return t

                # Для каждого предложения ищем наилучший сегмент
                import difflib
                for sentence in sentences:
                    key = sentence.get('key')
                    sent_text = _normalize_for_match(sentence.get('text', ''))
                    if not key or not sent_text:
                        continue

                    best_score = 0.0
                    best_seg = None
                    for ws in wsegments:
                        ws_text = _normalize_for_match(ws['text'])
                        score = difflib.SequenceMatcher(None, sent_text, ws_text).ratio()
                        if score > best_score:
                            best_score = score
                            best_seg = ws

                    if best_seg and best_score > 0.3:
                        sentence['start_time'] = best_seg['start']
                        sentence['end_time'] = best_seg['end']
                        logger.info(f"🧠 Маппинг: key={key} score={best_score:.2f} start={best_seg['start']:.2f} end={best_seg['end']:.2f}")
                    else:
                        logger.warning(f"🧠 Не найден сегмент для key={key} text='{sent_text}' best_score={best_score:.2f}")

            except ImportError:
                logger.error("🧠 faster-whisper не установлен. Smart split недоступен.")
                return jsonify({'success': False, 'error': 'faster-whisper не установлен на сервере'}), 500
            except Exception as e:
                logger.error(f"🧠 Ошибка Whisper: {e}", exc_info=True)
                return jsonify({'success': False, 'error': f'Ошибка транскрибации: {str(e)}'}), 500

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
