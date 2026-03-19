import logging
import os
from flask import Blueprint, render_template, jsonify, request, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from PIL import Image

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
    remove_book_from_user_shelf,
    get_or_create_workbook,
    get_orphan_dictations,
    add_dictation_to_book,
    remove_dictation_from_book,
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
    """Получение обложки книги (Option A: только B2)."""
    from helpers.b2_storage import b2_storage

    try:
        from flask import after_this_request

        @after_this_request
        def _no_cache_headers(response):
            try:
                response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
            except Exception:
                pass
            return response

        book_id = request.args.get("book_id")
        user_id = request.args.get("user_id")
        filename = request.args.get("filename", "cover.webp")

        if not book_id:
            return jsonify({"error": "book_id parameter required"}), 400

        if not b2_storage.enabled:
            return jsonify({"error": "B2 storage is disabled"}), 503

        remote_path_new = f"books_covers/{book_id}.webp"
        if b2_storage.file_exists(remote_path_new):
            import tempfile
            from flask import after_this_request

            tmp = tempfile.NamedTemporaryFile(prefix="book_cover_", suffix=".webp", delete=False)
            tmp_path = tmp.name
            tmp.close()

            ok = b2_storage.download_file(remote_path_new, tmp_path)
            if not ok:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
                return jsonify({"error": "Failed to download cover from B2"}), 502

            @after_this_request
            def _cleanup_tmp(response):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
                return response

            return send_from_directory(os.path.dirname(tmp_path), os.path.basename(tmp_path))

        # fallback: дефолтная обложка
        data_base = os.getenv("STATIC_DATA_FOLDER") or os.path.join(current_app.root_path, "static", "data")
        default_path = os.path.join(data_base, "covers", "cover_en.webp")
        if os.path.exists(default_path):
            return send_from_directory(os.path.dirname(default_path), os.path.basename(default_path))

        return jsonify({"error": "Cover not found"}), 404
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
        added = add_dictation_to_desk(
            user_id=user["id"],
            dictation_id=dictation_id,
            planned_date=planned_date,
        )
        return jsonify({"success": True, "added": added})
    except Exception as exc:
        logger.error("Ошибка добавления диктанта %s на стол: %s", dictation_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@library_bp.route("/private")
@jwt_required()
def private_library_page():
    """
    Страница приватной библиотеки пользователя:
    - Мои книги (я создатель)
    - Книги других авторов на моей полке
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    own_books, shelf_books = get_user_library_books(user["id"])
    return render_template(
        "private_library.html",
        own_books=own_books,
        shelf_books=shelf_books,
    )


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
        section_number = request.form.get("section_number")
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
        section_number = payload.get("section_number")
        author_materials_url = payload.get("author_materials_url")
        cover_file = None

    # Преобразуем parent_id, order_index и section_number в правильные типы
    if parent_id:
        try:
            parent_id = int(parent_id)
        except (ValueError, TypeError):
            parent_id = None
    
    try:
        order_index = int(order_index)
    except (ValueError, TypeError):
        order_index = 0
    
    section_number_int = None
    if section_number:
        try:
            section_number_int = int(section_number)
        except (ValueError, TypeError):
            section_number_int = None
    
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
            section_number=section_number_int,
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
            "section_number": request.form.get("section_number"),
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
            "section_number": request.form.get("section_number"),
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
        # section_number преобразуем в int
        if "section_number" in update_data and update_data["section_number"] is not None:
            try:
                update_data["section_number"] = int(update_data["section_number"])
            except (ValueError, TypeError):
                update_data.pop("section_number", None)
        cover_file = request.files.get("cover")
    else:
        # JSON - получаем данные из JSON
        payload = request.get_json(silent=True) or {}
        update_data = {}
        # Обрабатываем каждое поле отдельно, чтобы не потерять section_number
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
        if "section_number" in payload:
            # section_number может быть числом, строкой или None
            section_number_val = payload.get("section_number")
            if section_number_val is not None and section_number_val != "":
                try:
                    update_data["section_number"] = int(section_number_val)
                except (ValueError, TypeError):
                    # Если не удалось преобразовать в int, не добавляем в update_data
                    pass
            # Если передано None или пустая строка, не добавляем в update_data
            # (чтобы не обновлять поле, если оно не указано явно)
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
        
        # Проверяем наличие бесхозных диктантов
        orphan_dictations = get_orphan_dictations(user["id"])
        
        # Если есть бесхозные диктанты, создаём/получаем "Рабочую тетрадь"
        if orphan_dictations:
            workbook = get_or_create_workbook(user["id"])
            
            # Ищем рабочую тетрадь в списке своих книг
            workbook_index = next((i for i, book in enumerate(own_books) if book["id"] == workbook["id"]), None)
            
            if workbook_index is not None:
                # Если рабочая тетрадь уже есть в списке, просто обновляем её флаги
                own_books[workbook_index]["is_workbook"] = True
                own_books[workbook_index]["orphan_count"] = len(orphan_dictations)
                # Переносим в начало списка, если она не первая
                if workbook_index > 0:
                    workbook_data = own_books.pop(workbook_index)
                    own_books.insert(0, workbook_data)
            else:
                # Если рабочей тетради нет в списке (что странно), добавляем
                workbook["is_workbook"] = True
                workbook["orphan_count"] = len(orphan_dictations)
                own_books = [workbook] + own_books
        
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
                
                # Проверяем, является ли это корневой книгой (parent_id IS NULL)
                cur.execute("""
                    SELECT id, parent_id, title 
                    FROM books 
                    WHERE id = %s
                """, (book_id,))
                book_row = cur.fetchone()
                
                if not book_row:
                    logger.warning("⚠️ Книга/раздел %s не найдена в БД", book_id)
                    return jsonify({"success": False, "book_id": None, "root_book_id": None})
                
                logger.info("📖 Книга/раздел %s: title='%s', parent_id=%s", 
                          book_id, book_row.get("title"), book_row["parent_id"])
                
                # Всегда возвращаем прямой book_id (книга или раздел)
                direct_book_id = book_id

                # Если это уже корневая книга (parent_id IS NULL), возвращаем и как root
                if book_row["parent_id"] is None:
                    logger.info("✅ Найдена корневая книга %s для диктанта %s", book_id, dictation_id)
                    return jsonify({"success": True, "book_id": direct_book_id, "root_book_id": direct_book_id})
                
                # Иначе ищем корневую книгу, идя вверх по иерархии
                # Используем рекурсивный CTE для поиска корневой книги
                cur.execute("""
                    WITH RECURSIVE book_hierarchy AS (
                        -- Начальный уровень: текущая книга/раздел
                        SELECT id, parent_id, 0 as level
                        FROM books
                        WHERE id = %s
                        
                        UNION ALL
                        
                        -- Рекурсивный уровень: родительская книга
                        SELECT b.id, b.parent_id, bh.level + 1
                        FROM books b
                        INNER JOIN book_hierarchy bh ON b.id = bh.parent_id
                        WHERE bh.parent_id IS NOT NULL
                    )
                    SELECT id 
                    FROM book_hierarchy 
                    WHERE parent_id IS NULL 
                    LIMIT 1
                """, (book_id,))
                
                root_book_row = cur.fetchone()
                if root_book_row:
                    root_book_id = root_book_row["id"]
                    logger.info("✅ Найдена корневая книга %s (через раздел %s) для диктанта %s", 
                              root_book_id, book_id, dictation_id)
                    return jsonify({"success": True, "book_id": direct_book_id, "root_book_id": root_book_id})
                else:
                    logger.warning("⚠️ Не удалось найти корневую книгу для раздела %s (диктант %s)", 
                                 book_id, dictation_id)
                    # Проверяем всю иерархию для отладки
                    cur.execute("""
                        SELECT id, parent_id, title 
                        FROM books 
                        WHERE id = %s OR parent_id = %s
                    """, (book_id, book_id))
                    all_related = cur.fetchall()
                    logger.info("🔍 Всего связанных книг/разделов: %s", len(all_related))
                    for r in all_related:
                        logger.info("  - id=%s, parent_id=%s, title='%s'", r["id"], r["parent_id"], r.get("title"))
                    return jsonify({"success": False, "book_id": None, "root_book_id": None})
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
        add_dictation_to_book(dictation_id, book_id)
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
    Удаление книги/раздела.
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

    try:
        from helpers.db_books import delete_book as db_delete_book
        db_delete_book(book_id)
        return jsonify({"success": True})
    except Exception as exc:
        logger.error("Ошибка удаления книги %s: %s", book_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


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



