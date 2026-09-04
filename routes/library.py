import logging
import os
import shutil
from flask import Blueprint, render_template, jsonify, request, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from PIL import Image

from helpers.db import get_db_cursor
from helpers.db_users import get_user_by_email
from helpers.db_books import (
    get_public_books,
    get_book_dictations,
    get_book_sections,
    add_book_to_user_shelf,
    add_dictation_to_desk,
    get_user_library_books,
    create_book,
    update_book,
    get_book_by_id,
    delete_book,
    reserve_book_id,
    remove_book_from_user_shelf,
    get_or_create_workbook,
    get_orphan_dictations,
    add_dictation_to_book,
    remove_dictation_from_book,
    add_dictation_to_group_desks,
)
from helpers.db_dictations import get_dictation_sentences
from routes.index import get_cover_url_for_id


logger = logging.getLogger(__name__)

library_bp = Blueprint("library", __name__, url_prefix="/library")


def enrich_dictation_data(dictation):
    """
    Обогащает данные диктанта: добавляет cover_url, sentences_count, language_original, language_translation
    """
    db_id = dictation['id']
    dictation_id_str = f"dict_{db_id}"
    
    # Получаем предложения
    sentences = get_dictation_sentences(db_id)
    
    # Определяем языки
    languages = set()
    for sentence in sentences:
        languages.add(sentence['language_code'])
    languages_list = sorted(list(languages))
    
    language_original = dictation.get('language_code', languages_list[0] if languages_list else 'en')
    language_translation = languages_list[1] if len(languages_list) > 1 else (languages_list[0] if languages_list else '')

    translation_languages = []
    try:
        orig = str(language_original or '').strip().lower()
        translation_languages = sorted([str(l).strip().lower() for l in languages_list if l and str(l).strip().lower() and str(l).strip().lower() != orig])
    except Exception:
        translation_languages = []
    
    # Считаем количество предложений
    sentences_count = len([s for s in sentences if s['language_code'] == language_original])
    
    # Получаем обложку
    cover_url = get_cover_url_for_id(dictation_id_str, language_original)
    
    # Обогащаем словарь (сохраняем оба формата ID)
    dictation['dictation_id'] = dictation_id_str  # dict_X для URL
    dictation['db_id'] = db_id  # Числовой ID из БД
    dictation['language_original'] = language_original
    dictation['language_translation'] = language_translation
    dictation['translation_languages'] = translation_languages
    dictation['cover_url'] = cover_url
    dictation['sentences_count'] = sentences_count
    
    return dictation


def _build_desk_item_payload(dictation_id: int, desk_item_id: int, planned_date) -> dict:
    """
    Собирает объект «карточка рабочего стола» для диктанта БЕЗ обращения к B2.

    Обложка задаётся каноническим URL /api/dictations_covers/<id>.webp — без проверки
    существования файла в B2 (это платные запросы). Если файла нет, фронт сам подставит
    fallback через onerror. Если файл есть — он уже закэширован браузером/SW, т.к.
    показывался в книге.
    """
    conn, cur = get_db_cursor()
    try:
        # Динамически определяем наличие необязательных колонок, чтобы не падать,
        # если какая-то миграция не применена.
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'dictations'
              AND column_name IN ('sentences_count', 'audio_order')
            """
        )
        existing_cols = {row["column_name"] for row in (cur.fetchall() or [])}

        sentences_count_sql = (
            "COALESCE(d.sentences_count, 0)"
            if "sentences_count" in existing_cols
            else "0"
        )
        audio_order_sql = (
            "COALESCE(d.audio_order, '')"
            if "audio_order" in existing_cols
            else "''"
        )

        query = f"""
            SELECT
                d.id,
                d.title,
                d.language_code,
                d.level,
                d.owner_id,
                {sentences_count_sql} AS sentences_count,
                {audio_order_sql} AS audio_order,
                (SELECT DISTINCT language_code
                 FROM dictation_sentences
                 WHERE dictation_id = d.id AND language_code != d.language_code
                 LIMIT 1) AS language_translation
            FROM dictations d
            WHERE d.id = %s
        """
        cur.execute(query, (dictation_id,))
        row = cur.fetchone()
        if not row:
            return {}

        language_original = row["language_code"] or "en"
        language_translation = row["language_translation"] or language_original

        translation_languages = []
        try:
            cur.execute(
                "SELECT DISTINCT language_code FROM dictation_sentences WHERE dictation_id = %s",
                (dictation_id,),
            )
            translation_languages = sorted(
                [
                    str(r["language_code"] or "").strip().lower()
                    for r in (cur.fetchall() or [])
                    if r["language_code"]
                    and str(r["language_code"]).strip().lower() != str(language_original).strip().lower()
                ]
            )
        except Exception:
            translation_languages = []

        return {
            "id": desk_item_id,
            "dictation_id": dictation_id,
            "created_at": None,
            "planned_date": planned_date,
            "title": row["title"],
            "language_code": language_original,
            "language_translation": language_translation,
            "translation_languages": translation_languages,
            "owner_id": row["owner_id"],
            "level": row["level"],
            "sentences_count": row["sentences_count"] or 0,
            "audio_order": row["audio_order"] or "",
            "cover_url": f"/api/dictations_covers/{dictation_id}.webp",
        }
    finally:
        cur.close()
        conn.close()


# Страница публичной библиотеки удалена - теперь используется только приватная библиотека
# @library_bp.route("/public")
# def public_library_page():
#     books = get_public_books(limit=200)
#     return render_template("public_library.html", books=books)


@library_bp.route("/api/public-books", methods=["GET"])
@jwt_required()
def api_public_books():
    """
    API для получения списка публичных книг (на будущее для AJAX/фильтров).
    """
    try:
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
    except ValueError:
        limit = 100
        offset = 0

    books = get_public_books(limit=limit, offset=offset)
    return jsonify({"success": True, "books": books})


@library_bp.route("/api/book/<int:book_id>/dictations", methods=["GET"])
@jwt_required()
def api_book_dictations(book_id: int):
    """
    Возвращает список диктантов, входящих в книгу.
    """
    try:
        dictations = get_book_dictations(book_id)
        # Обогащаем данные каждого диктанта
        enriched_dictations = [enrich_dictation_data(d) for d in dictations]
        return jsonify({"success": True, "dictations": enriched_dictations})
    except Exception as exc:
        logger.error("Ошибка получения диктантов книги %s: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book-cover")
def api_get_book_cover():
    """
    Получение обложки книги.

    Принцип «сначала кеш, потом хранилище»:
    1) Если обложка уже лежит в локальном кеше (static/data/books_covers/) — отдаём её,
       БЕЗ обращения к B2.
    2) Иначе один раз скачиваем из B2 в локальный кеш и отдаём.
    3) Если в B2 нет — дефолтная обложка.

    Отдаём Cache-Control: public, max-age — чтобы SW (staleWhileRevalidateImage) и браузер
    могли кешировать обложку, а не качать её снова при каждом открытии книги.
    """
    from helpers.b2_storage import b2_storage

    try:
        from flask import after_this_request

        @after_this_request
        def _cache_headers(response):
            try:
                response.headers["Cache-Control"] = "public, max-age=86400"
            except Exception:
                pass
            return response

        book_id = request.args.get("book_id")
        user_id = request.args.get("user_id")
        filename = request.args.get("filename", "cover.webp")

        if not book_id:
            return jsonify({"error": "book_id parameter required"}), 400

        data_base = os.getenv("STATIC_DATA_FOLDER") or os.path.join(current_app.root_path, "static", "data")
        covers_cache_dir = os.path.join(data_base, "books_covers")
        local_path = os.path.join(covers_cache_dir, f"{book_id}.webp")

        # 1) Локальный кеш — без сети и B2.
        if os.path.exists(local_path):
            return send_from_directory(covers_cache_dir, f"{book_id}.webp")

        if not b2_storage.enabled:
            # fallback: дефолтная обложка
            default_path = os.path.join(data_base, "covers", "cover_en.webp")
            if os.path.exists(default_path):
                return send_from_directory(os.path.dirname(default_path), os.path.basename(default_path))
            return jsonify({"error": "Cover not found"}), 404

        remote_path_new = f"books_covers/{book_id}.webp"

        try:
            os.makedirs(covers_cache_dir, exist_ok=True)
        except OSError:
            pass

        import tempfile
        from flask import after_this_request

        tmp = tempfile.NamedTemporaryFile(prefix="book_cover_", suffix=".webp", delete=False)
        tmp_path = tmp.name
        tmp.close()

        ok = False
        try:
            ok = b2_storage.download_file(remote_path_new, tmp_path)
        except Exception:
            ok = False

        if not ok:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            # fallback: дефолтная обложка
            default_path = os.path.join(data_base, "covers", "cover_en.webp")
            if os.path.exists(default_path):
                return send_from_directory(os.path.dirname(default_path), os.path.basename(default_path))
            return jsonify({"error": "Cover not found"}), 404

        # Атомарно перемещаем скачанный файл в локальный кеш.
        try:
            import shutil
            shutil.move(tmp_path, local_path)
            served_path = local_path
        except Exception:
            served_path = tmp_path

        @after_this_request
        def _cleanup_tmp(response):
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except OSError:
                pass
            return response

        return send_from_directory(os.path.dirname(served_path), os.path.basename(served_path))
    except Exception as exc:
        logger.error("❌ Ошибка получения обложки книги: %s", exc, exc_info=True)
        return jsonify({"error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>/sections", methods=["GET"])
@jwt_required()
def api_book_sections(book_id: int):
    """
    Возвращает список разделов (подчиненных книг), входящих в книгу.
    """
    try:
        sections = get_book_sections(book_id)
        return jsonify({"success": True, "sections": sections})
    except Exception as exc:
        logger.error("Ошибка получения разделов книги %s: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>/sections-tree", methods=["GET"])
@jwt_required()
def api_book_sections_tree(book_id: int):
    """Возвращает плоский список всех разделов книги (дерево) для UI перемещения диктанта."""
    try:
        from helpers.db_books import get_book_sections_tree
        sections = get_book_sections_tree(book_id)
        return jsonify({"success": True, "sections": sections})
    except Exception as exc:
        logger.error("Ошибка получения дерева разделов книги %s: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>/add-to-my", methods=["POST"])
@jwt_required()
def api_add_book_to_my_library(book_id: int):
    """
    Добавляет публичную книгу на приватную полку пользователя.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        # По умолчанию считаем, что книга чужая (is_owner_copy=False, is_derived=False)
        added = add_book_to_user_shelf(
            user_id=user["id"],
            book_id=book_id,
            is_owner_copy=False,
            is_derived=False,
        )
        return jsonify({"success": True, "added": added})
    except Exception as exc:
        logger.error("Ошибка добавления книги %s на полку: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/dictation/<int:dictation_id>/add-to-desk", methods=["POST"])
@jwt_required()
def api_add_dictation_to_desk(dictation_id: int):
    """
    Добавляет диктант на «Стол с диктантами» текущего пользователя.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    payload = request.get_json(silent=True) or {}
    planned_date = payload.get("planned_date")  # может быть None

    try:
        desk_item_id = add_dictation_to_desk(
            user_id=user["id"],
            dictation_id=dictation_id,
            planned_date=planned_date,
        )
        item = None
        if desk_item_id:
            try:
                item = _build_desk_item_payload(dictation_id, desk_item_id, planned_date)
            except Exception as exc:
                logger.warning(
                    "Не удалось собрать карточку стола для диктанта %s: %s",
                    dictation_id,
                    exc,
                    exc_info=True,
                )
        return jsonify({"success": True, "added": desk_item_id is not None, "item": item})
    except Exception as exc:
        logger.error("Ошибка добавления диктанта %s на стол: %s", dictation_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/dictation/<int:dictation_id>/add-to-desk-group", methods=["POST"])
@jwt_required()
def api_add_dictation_to_group_desks(dictation_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    payload = request.get_json(silent=True) or {}
    group_id = payload.get("group_id")
    planned_date = payload.get("planned_date")
    try:
        gid = int(group_id)
    except Exception:
        gid = 0

    if gid <= 0:
        return jsonify({"success": False, "error": "Invalid group_id"}), 400

    try:
        res = add_dictation_to_group_desks(
            teacher_user_id=int(user["id"]),
            group_id=int(gid),
            dictation_id=int(dictation_id),
            planned_date=planned_date,
        )
        return jsonify(res)
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except Exception as exc:
        logger.error("Ошибка добавления диктанта %s на стол группы %s: %s", dictation_id, gid, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/reserve_id", methods=["GET"])
@jwt_required()
def api_reserve_book_id():
    """
    Резервирует id новой книги в БД в момент начала редактирования.
    Возвращает {success, id, book_id}.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        book = reserve_book_id(user["id"])
        return jsonify({
            "success": True,
            "id": book["id"],
            "book_id": book["id"],
        })
    except Exception as exc:
        logger.error("Ошибка резервирования id книги: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book", methods=["POST"])
@jwt_required()
def api_create_book():
    """
    Создание новой книги в приватной библиотеке текущего пользователя.
    Поддерживает загрузку обложки через FormData.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    # Проверяем, это FormData или JSON
    if request.content_type and "multipart/form-data" in request.content_type:
        # FormData - получаем данные из формы
        title = (request.form.get("title") or "").strip()
        original_language = (request.form.get("original_language") or "").strip() or None
        visibility = (request.form.get("visibility") or "private").strip()
        short_description = (request.form.get("short_description") or "").strip() or None
        author_text = (request.form.get("author_text") or "").strip() or None
        theme = (request.form.get("theme") or "").strip() or None
        parent_id = request.form.get("parent_id")
        order_index = request.form.get("order_index", 0)
        author_materials_url = request.form.get("author_materials_url")
        cover_file = request.files.get("cover")
    else:
        # JSON - получаем данные из JSON
        payload = request.get_json(silent=True) or {}
        title = (payload.get("title") or "").strip()
        original_language = (payload.get("original_language") or "").strip() or None
        visibility = (payload.get("visibility") or "private").strip()
        short_description = (payload.get("short_description") or "").strip() or None
        author_text = (payload.get("author_text") or "").strip() or None
        theme = (payload.get("theme") or "").strip() or None
        parent_id = payload.get("parent_id")
        order_index = payload.get("order_index", 0)
        author_materials_url = payload.get("author_materials_url")
        cover_file = None

    # Преобразуем parent_id и order_index в правильные типы
    if parent_id:
        try:
            parent_id = int(parent_id)
        except (ValueError, TypeError):
            parent_id = None
    
    try:
        order_index = int(order_index)
    except (ValueError, TypeError):
        order_index = 0
    
    author_materials_url_str = None
    if author_materials_url:
        author_materials_url_str = author_materials_url.strip() or None

    if not title:
        return jsonify({"success": False, "error": "Название книги обязательно"}), 400

    try:
        book = create_book(
            creator_user_id=user["id"],
            title=title,
            original_language=original_language,
            visibility=visibility,
            short_description=short_description,
            author_text=author_text,
            theme=theme,
            parent_id=parent_id,
            order_index=order_index,
            author_materials_url=author_materials_url_str,
        )

        # Обрабатываем обложку, если она была загружена
        if cover_file and cover_file.filename:
            from helpers.b2_storage import b2_storage
            if not b2_storage.enabled:
                return jsonify({"success": False, "error": "B2 storage is disabled"}), 503

            _save_book_cover(book["id"], user["id"], cover_file)
        
        return jsonify({"success": True, "book": book})
    except Exception as exc:
        logger.error("Ошибка создания книги: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>", methods=["PATCH"])
@jwt_required()
def api_update_book(book_id: int):
    """
    Обновление базовой информации о книге.
    Разрешено только создателю книги.
    Поддерживает загрузку обложки через FormData.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    # Проверяем, это FormData или JSON
    if request.content_type and "multipart/form-data" in request.content_type:
        # FormData - получаем данные из формы
        update_data = {
            "title": request.form.get("title"),
            "original_language": request.form.get("original_language"),
            "visibility": request.form.get("visibility"),
            "short_description": request.form.get("short_description"),
            "author_text": request.form.get("author_text"),
            "theme": request.form.get("theme"),
            "order_index": request.form.get("order_index"),
            "author_materials_url": request.form.get("author_materials_url"),
        }
        # Убираем пустые значения, но сохраняем author_materials_url даже если пусто (для очистки)
        update_data = {}
        for k, v in {
            "title": request.form.get("title"),
            "author_text": request.form.get("author_text"),
            "original_language": request.form.get("original_language"),
            "visibility": request.form.get("visibility"),
            "short_description": request.form.get("short_description"),
            "theme": request.form.get("theme"),
            "order_index": request.form.get("order_index"),
        }.items():
            if v:
                update_data[k] = v.strip() if isinstance(v, str) else v
        
        # author_materials_url добавляем всегда, если есть в форме (даже если пустое для очистки)
        if "author_materials_url" in request.form:
            update_data["author_materials_url"] = request.form.get("author_materials_url", "").strip() or None
        # order_index преобразуем в int
        if "order_index" in update_data and update_data["order_index"] is not None:
            try:
                update_data["order_index"] = int(update_data["order_index"])
            except (ValueError, TypeError):
                update_data.pop("order_index", None)
        cover_file = request.files.get("cover")
    else:
        # JSON - получаем данные из JSON
        payload = request.get_json(silent=True) or {}
        update_data = {}
        # Обрабатываем каждое поле отдельно
        if "title" in payload:
            update_data["title"] = payload.get("title")
        if "original_language" in payload:
            update_data["original_language"] = payload.get("original_language")
        if "visibility" in payload:
            update_data["visibility"] = payload.get("visibility")
        if "short_description" in payload:
            update_data["short_description"] = payload.get("short_description")
        if "author_text" in payload:
            update_data["author_text"] = payload.get("author_text")
        if "theme" in payload:
            update_data["theme"] = payload.get("theme")
        if "order_index" in payload:
            try:
                update_data["order_index"] = int(payload.get("order_index")) if payload.get("order_index") is not None else None
            except (ValueError, TypeError):
                pass
        if "author_materials_url" in payload:
            update_data["author_materials_url"] = payload.get("author_materials_url")
        
        # Обрабатываем строковые поля
        for key in [
            "title",
            "original_language",
            "visibility",
            "short_description",
            "author_text",
            "theme",
            "author_materials_url",
        ]:
            if key in update_data and isinstance(update_data[key], str):
                update_data[key] = update_data[key].strip() or None

        cover_file = None

    # На уровне БД пока нет явной проверки создателя, поэтому ограничимся простым UPDATE:
    # в будущем можно добавить явную проверку creator_user_id.

    try:
        book = update_book(book_id, **update_data)
        if not book:
            return jsonify({"success": False, "error": "Book not found"}), 404
        
        # Обрабатываем обложку, если она была загружена
        if cover_file and cover_file.filename:
            from helpers.b2_storage import b2_storage
            if not b2_storage.enabled:
                return jsonify({"success": False, "error": "B2 storage is disabled"}), 503

            _save_book_cover(book_id, user["id"], cover_file)
        
        return jsonify({"success": True, "book": book})
    except Exception as exc:
        logger.error("Ошибка обновления книги %s: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/user-books", methods=["GET"])
@jwt_required()
def api_get_user_books():
    """
    Возвращает все книги пользователя (свои + чужие на полке).
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        own_books, shelf_books = get_user_library_books(user["id"])

        # Safety fallback: workbook is expected to exist for every user.
        # If missing (old DB / manual modifications), create it.
        if not any(bool(b.get("is_workbook")) for b in (own_books or [])):
            workbook = get_or_create_workbook(user["id"])
            try:
                workbook["is_workbook"] = True
            except Exception:
                pass
            own_books = [workbook] + (own_books or [])

        return jsonify({
            "success": True,
            "own_books": own_books,
            "shelf_books": shelf_books
        })
    except Exception as exc:
        logger.error("Ошибка получения книг пользователя: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/orphan-dictations", methods=["GET"])
@jwt_required()
def api_get_orphan_dictations():
    """
    Возвращает список бесхозных диктантов пользователя.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        orphan_dictations = get_orphan_dictations(user["id"])
        # Обогащаем данные каждого диктанта
        enriched_dictations = [enrich_dictation_data(d) for d in orphan_dictations]
        return jsonify({"success": True, "dictations": enriched_dictations})
    except Exception as exc:
        logger.error("Ошибка получения бесхозных диктантов: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/dictation/<int:dictation_id>/book", methods=["GET"])
@jwt_required()
def api_get_dictation_book(dictation_id: int):
    """
    Возвращает book_id из book_dictations (прямую привязку: книга ИЛИ раздел).

    Дополнительно возвращает root_book_id (корневую книгу без parent_id) для UI,
    но root_book_id НЕ должен использоваться как место хранения диктанта.
    """
    try:
        from helpers.db import get_db_connection
        from psycopg2.extras import RealDictCursor
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Сначала находим book_id из book_dictations
                logger.info("🔍 Ищу диктант %s в book_dictations", dictation_id)
                cur.execute("""
                    SELECT book_id 
                    FROM book_dictations 
                    WHERE dictation_id = %s 
                    LIMIT 1
                """, (dictation_id,))
                row = cur.fetchone()
                if not row:
                    # Проверяем, может быть диктант вообще не в таблице book_dictations
                    cur.execute("""
                        SELECT COUNT(*) as count 
                        FROM book_dictations 
                        WHERE dictation_id = %s
                    """, (dictation_id,))
                    check_row = cur.fetchone()
                    logger.info("ℹ️ Диктант %s не найден в book_dictations (всего записей: %s)", 
                              dictation_id, check_row["count"] if check_row else 0)
                    
                    # Проверяем, существует ли сам диктант
                    cur.execute("SELECT id FROM dictations WHERE id = %s", (dictation_id,))
                    dict_check = cur.fetchone()
                    logger.info("🔍 Проверка существования диктанта %s: %s", dictation_id, "найден" if dict_check else "не найден")
                    
                    return jsonify({"success": False, "book_id": None})
                
                book_id = row["book_id"]
                logger.info("✅ Найден book_id %s для диктанта %s", book_id, dictation_id)
                
                # Всегда возвращаем прямой book_id (книга или раздел)
                direct_book_id = book_id

                # С root_book_id можем определить корневую книгу одним запросом (без рекурсии)
                cur.execute(
                    """
                    SELECT root_book_id
                    FROM books
                    WHERE id = %s
                    """,
                    (book_id,),
                )
                book_row = cur.fetchone()
                if not book_row:
                    logger.warning("⚠️ Книга/раздел %s не найдена в БД", book_id)
                    return jsonify({"success": False, "book_id": None, "root_book_id": None})

                root_book_id = book_row.get("root_book_id") or direct_book_id
                return jsonify({"success": True, "book_id": direct_book_id, "root_book_id": root_book_id})
        finally:
            conn.close()
    except Exception as exc:
        logger.error("Ошибка получения книги для диктанта %s: %s", dictation_id, exc)
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/dictation/<int:dictation_id>/move-to-book", methods=["POST"])
@jwt_required()
def api_move_dictation_to_book(dictation_id: int):
    """
    Перемещает диктант в указанную книгу/раздел.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    payload = request.get_json(silent=True) or {}
    book_id = payload.get("book_id")
    
    if not book_id:
        return jsonify({"success": False, "error": "book_id is required"}), 400

    try:
        from helpers.db_books import move_dictation_to_book
        move_dictation_to_book(dictation_id, book_id)
        return jsonify({"success": True})
    except Exception as exc:
        logger.error("Ошибка перемещения диктанта %s в книгу %s: %s", dictation_id, book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>/dictation/<int:dictation_id>", methods=["DELETE"])
@jwt_required()
def api_remove_dictation_from_book(book_id: int, dictation_id: int):
    """Убирает диктант из указанной книги/раздела (мусорник в приватной библиотеке).

    НЕ удаляет диктант из БД и НЕ удаляет файлы.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        removed = remove_dictation_from_book(dictation_id, book_id)
        logger.info("🗑️ remove_dictation_from_book: user_id=%s book_id=%s dictation_id=%s removed=%s",
                    user.get("id"), book_id, dictation_id, removed)
        return jsonify({"success": True, "removed": removed})
    except Exception as exc:
        logger.error("Ошибка удаления диктанта %s из книги %s: %s", dictation_id, book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>", methods=["GET"])
@jwt_required()
def api_get_book(book_id: int):
    """
    Возвращает информацию о конкретной книге.
    """
    try:
        from helpers.db_books import get_book_by_id
        book = get_book_by_id(book_id)
        if not book:
            return jsonify({"success": False, "error": "Book not found"}), 404
        
        logger.info("📖 Возвращаю данные книги %s: creator_username=%s, creator_user_id=%s", 
                   book_id, book.get("creator_username"), book.get("creator_user_id"))
        
        return jsonify({"success": True, "book": book})
    except Exception as exc:
        logger.error("Ошибка получения книги %s: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/api/book/<int:book_id>", methods=["DELETE"])
@jwt_required()
def api_delete_book(book_id: int):
    """
    Удаление книги/раздела с полной очисткой:
    разделы, диктанты, аудио диктантов, обложки диктантов и книги
    (из БД + B2 + локальные файлы + categories.json).
    Разрешено только создателю.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    # Проверяем, что книга существует и принадлежит пользователю
    book = get_book_by_id(book_id)
    if not book:
        return jsonify({"success": False, "error": "Book not found"}), 404

    if book["creator_user_id"] != user["id"]:
        return jsonify({"success": False, "error": "You don't have permission to delete this book"}), 403

    from helpers.b2_storage import b2_storage
    from routes.index import (
        _get_static_data_base_dir,
        load_categories,
        save_categories,
        remove_dictation_from_categories,
    )

    try:
        result = delete_book(book_id)
    except Exception as exc:
        logger.error("Ошибка удаления книги %s из БД: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500

    deleted_book_ids = list(result.get("book_ids") or [])
    dictation_ids = list(result.get("dictation_ids") or [])

    data_base = _get_static_data_base_dir()

    # 1. Очистка categories.json от ссылок на удалённые диктанты.
    if dictation_ids:
        try:
            categories_data = load_categories()
            changed = False
            for did in dictation_ids:
                dictation_id_str = f"dict_{did}"
                if remove_dictation_from_categories(categories_data, dictation_id_str):
                    changed = True
                if remove_dictation_from_categories(categories_data, str(did)):
                    changed = True
            if changed:
                save_categories(categories_data)
        except Exception as exc:
            logger.warning("Не удалось почистить categories.json при удалении книги: %s", exc)

    # 2. Очистка B2: обложки книг, аудио диктантов, обложки диктантов.
    for bid in deleted_book_ids:
        try:
            if b2_storage.enabled:
                b2_storage.delete_file(f"books_covers/{bid}.webp")
        except Exception as exc:
            logger.warning("Не удалось удалить обложку книги %s из B2: %s", bid, exc)

    for did in dictation_ids:
        dictation_id_str = f"dict_{did}"
        try:
            if b2_storage.enabled:
                b2_storage.delete_prefix(f"dictations/{dictation_id_str}/")
        except Exception as exc:
            logger.warning("Не удалось удалить аудио диктанта %s из B2: %s", dictation_id_str, exc)
        try:
            if b2_storage.enabled:
                cover_path = f"dictations_covers/{did}.webp"
                if b2_storage.file_exists(cover_path):
                    b2_storage.delete_file(cover_path)
        except Exception as exc:
            logger.warning("Не удалось удалить обложку диктанта %s из B2: %s", did, exc)

    # 3. Очистка локальных файлов диктантов.
    for did in dictation_ids:
        dictation_id_str = f"dict_{did}"
        for sub in ("dictations", "temp"):
            try:
                local_path = os.path.join(data_base, sub, dictation_id_str)
                if os.path.exists(local_path):
                    shutil.rmtree(local_path)
            except Exception as exc:
                logger.warning("Не удалось удалить локальные файлы %s: %s", local_path, exc)

    return jsonify({
        "success": True,
        "deleted_book_ids": deleted_book_ids,
        "deleted_dictation_ids": dictation_ids,
    })


@library_bp.route("/api/user-book/<int:book_id>", methods=["DELETE"])
@jwt_required()
def api_remove_book_from_shelf(book_id: int):
    """
    Удаляет книгу с полки текущего пользователя (для чужих книг).
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        removed = remove_book_from_user_shelf(user["id"], book_id)
        return jsonify({"success": True, "removed": removed})
    except Exception as exc:
        logger.error("Ошибка удаления книги %s с полки: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


def _save_book_cover(book_id: int, creator_user_id: int, cover_file) -> str:
    """
    Сохраняет обложку книги.
    Frontend уже отправляет готовое изображение 200x200 в формате webp.
    Возвращает URL обложки или None в случае ошибки.
    """
    from helpers.b2_storage import b2_storage

    try:
        logger.info(
            "Saving book cover: book_id=%s user_id=%s filename=%s content_type=%s b2_enabled=%s",
            book_id,
            creator_user_id,
            getattr(cover_file, "filename", None),
            getattr(cover_file, "content_type", None),
            bool(getattr(b2_storage, "enabled", False)),
        )
        # Проверяем, что это изображение
        if not cover_file.content_type.startswith("image/"):
            logger.warning("Файл обложки не является изображением: %s", cover_file.content_type)
            return None

        if not b2_storage.enabled:
            logger.error("B2 storage is disabled; refusing to save book cover (Option A)")
            return None

        # Открываем изображение
        image = Image.open(cover_file.stream)
        
        # Конвертируем в RGB если нужно (для webp)
        if image.mode in ('RGBA', 'LA', 'P'):
            # Создаем белый фон для прозрачных изображений
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')

        # Убеждаемся что размер 200x200 (на случай если cropper не сработал)
        if image.size != (200, 200):
            image = image.resize((200, 200), Image.Resampling.LANCZOS)

        import tempfile

        tmp = tempfile.NamedTemporaryFile(prefix=f"book_{book_id}_", suffix=".webp", delete=False)
        tmp_path = tmp.name
        tmp.close()

        try:
            image.save(tmp_path, "WEBP", quality=90)

            remote_path = f"books_covers/{book_id}.webp"
            uploaded = b2_storage.upload_file(tmp_path, remote_path)
            if uploaded:
                cover_url = f"/library/api/book-cover?book_id={book_id}&user_id={creator_user_id}&filename=cover.webp"
                logger.info("Обложка книги загружена в B2: %s", remote_path)
                return cover_url

            logger.error("Failed to upload book cover to B2: %s", remote_path)
            return None
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    except Exception as exc:
        logger.error("Ошибка сохранения обложки книги %s: %s", book_id, exc)
        return None



