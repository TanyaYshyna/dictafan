import json
import logging
from flask import Blueprint, render_template, request, jsonify
from helpers.user_helpers import get_safe_email_from_token, get_current_user
from helpers.language_data import load_language_data
from helpers.db_dictations import get_dictation_by_id, get_dictation_sentences, get_dictation_translation_flags
from routes.index import get_cover_url_for_id

logger = logging.getLogger(__name__)

editor_v2_bp = Blueprint('dictation_editor_v2', __name__)


@editor_v2_bp.route('/editor_v2/<dictation_id>/<language_original>/<language_translation>')
def dictation_editor_v2(dictation_id, language_original, language_translation):
    """Новая версия редактора диктантов"""
    try:
        current_user = get_current_user()
        safe_email = get_safe_email_from_token()
        language_data = load_language_data()

        info = {}
        original_data = {"language": language_original, "title": "", "sentences": []}
        translation_data = {"language": language_translation, "title": "", "sentences": []}
        translations_data = {}
        translation_flags = {}
        real_original = ''

        if dictation_id.startswith('dict_') and not dictation_id.startswith('dict_temp_'):
            try:
                db_id = int(dictation_id.replace('dict_', ''))
                dictation = get_dictation_by_id(db_id)
                if dictation:
                    real_original = str(dictation.get('language_code') or '').strip().lower()

                    # Редирект если язык не совпадает
                    req_orig = str(language_original or '').strip().lower()
                    if real_original and req_orig and real_original != req_orig:
                        from flask import redirect
                        return redirect(
                            f"/editor_v2/{dictation_id}/{real_original}/{str(language_translation or '').strip().lower() or real_original}"
                        )

                    title_translations = dictation.get('title_translations', {})

                    info = {
                        "title": dictation.get('title', ''),
                        "level": dictation.get('level', 'A1'),
                        "is_dialog": False,
                        "speakers": dictation.get('speakers', {}),
                        "title_translations": title_translations,
                        "author_materials_url": dictation.get('author_materials_url')
                    }

                    translation_flags = get_dictation_translation_flags(db_id) or {}

                    all_sentences = get_dictation_sentences(db_id)
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

                    if language_original in sentences_by_lang:
                        original_data = {
                            "language": language_original,
                            "title": info.get("title", ""),
                            "sentences": sentences_by_lang[language_original]
                        }

                    for lang, items in (sentences_by_lang or {}).items():
                        if not lang or lang == language_original:
                            continue
                        translations_data[lang] = {
                            "language": lang,
                            "title": title_translations.get(lang, ''),
                            "sentences": items
                        }

                    if language_translation in sentences_by_lang:
                        translation_data = {
                            "language": language_translation,
                            "title": title_translations.get(language_translation, ''),
                            "sentences": sentences_by_lang[language_translation]
                        }

            except Exception as e:
                logger.error(f"Ошибка загрузки диктанта {dictation_id}: {e}")

        cover_url = get_cover_url_for_id(dictation_id, language_original)

        return render_template(
            'dictation_editor_v2.html',
            dictation_id=dictation_id,
            original_language=language_original,
            translation_language=language_translation,
            lang_notice='',
            title=info.get('title', ''),
            title_translations=info.get('title_translations', {}),
            level=info.get('level', 'A1'),
            is_dialog=info.get('is_dialog', False),
            speakers=info.get('speakers', {}),
            translation_flags=translation_flags,
            original_data=original_data,
            translation_data=translation_data,
            translations_data=translations_data,
            audio_file=None,
            audio_words=[],
            author_materials_url=info.get('author_materials_url'),
            current_user=current_user,
            safe_email=safe_email,
            category_info={
                "key": "",
                "title": "",
                "path": ""
            },
            cover_url=cover_url,
            language_data=language_data
        )

    except Exception as e:
        logger.error(f"Ошибка в editor_v2: {e}")
        return f"Ошибка: {e}", 500
