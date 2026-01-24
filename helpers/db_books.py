"""
Функции для работы с книгами и полками пользователей (таблицы books, book_categories,
book_category_links, book_dictations, user_books, desk_items).
"""

from typing import List, Optional, Dict, Any, Tuple

from .db import get_db_cursor


def get_public_books(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Возвращает список публичных книг с краткой информацией:
    - основные поля книги
    - автор (username)
    - список категорий (названия)
    - количество диктантов в книге
    """
    conn, cur = get_db_cursor()
    try:
        query = """
            SELECT
                b.id,
                b.title,
                b.cover_url,
                b.author_text,
                b.short_description,
                b.original_language,
                b.visibility,
                b.theme,
                b.created_at,
                b.updated_at,
                b.creator_user_id,
                u.username AS creator_username,
                COALESCE(
                    ARRAY_AGG(DISTINCT c.title) FILTER (WHERE c.id IS NOT NULL),
                    '{}'::varchar[]
                ) AS categories,
                COUNT(DISTINCT bd.id) AS dictations_count
            FROM books b
            LEFT JOIN users u ON u.id = b.creator_user_id
            LEFT JOIN book_category_links l ON l.book_id = b.id
            LEFT JOIN book_categories c ON c.id = l.category_id
            LEFT JOIN book_dictations bd ON bd.book_id = b.id
            WHERE b.visibility = 'public'
            GROUP BY
                b.id,
                b.title,
                b.cover_url,
                b.author_text,
                b.short_description,
                b.original_language,
                b.visibility,
                b.theme,
                b.created_at,
                b.updated_at,
                b.creator_user_id,
                u.username
            ORDER BY b.created_at DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(query, (limit, offset))
        rows = cur.fetchall()

        result: List[Dict[str, Any]] = []
        for row in rows:
            result.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "cover_url": row["cover_url"],
                    "author_text": row["author_text"],
                    "short_description": row["short_description"],
                    "original_language": row["original_language"],
                    "visibility": row["visibility"],
                    "theme": row["theme"],
                    "created_at": row["created_at"].isoformat()
                    if row["created_at"]
                    else None,
                    "updated_at": row["updated_at"].isoformat()
                    if row["updated_at"]
                    else None,
                    "creator_user_id": row["creator_user_id"],
                    "creator_username": row["creator_username"],
                    "categories": list(row["categories"] or []),
                    "dictations_count": int(row["dictations_count"] or 0),
                }
            )

        return result
    finally:
        cur.close()
        conn.close()


def get_book_dictations(book_id: int) -> List[Dict[str, Any]]:
    """
    Возвращает список диктантов, входящих в книгу, с базовой информацией.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, существует ли колонка author_materials_url
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='dictations' AND column_name='author_materials_url'
        """)
        has_author_materials_url = cur.fetchone() is not None
        
        if has_author_materials_url:
            query = """
                SELECT
                    d.id,
                    d.title,
                    d.language_code,
                    d.level,
                    d.is_public,
                    d.author_materials_url,
                    bd.order_index
                FROM book_dictations bd
                JOIN dictations d ON d.id = bd.dictation_id
                WHERE bd.book_id = %s
                ORDER BY COALESCE(bd.order_index, 0), d.id
            """
        else:
            query = """
                SELECT
                    d.id,
                    d.title,
                    d.language_code,
                    d.level,
                    d.is_public,
                    bd.order_index
                FROM book_dictations bd
                JOIN dictations d ON d.id = bd.dictation_id
                WHERE bd.book_id = %s
                ORDER BY COALESCE(bd.order_index, 0), d.id
            """
        
        cur.execute(query, (book_id,))
        rows = cur.fetchall()

        result: List[Dict[str, Any]] = []
        for row in rows:
            dictation_dict = {
                "id": row["id"],
                "title": row["title"],
                "language_code": row["language_code"],
                "level": row["level"],
                "is_public": row["is_public"],
                "order_index": row["order_index"],
            }
            if has_author_materials_url:
                dictation_dict["author_materials_url"] = row.get("author_materials_url")
            result.append(dictation_dict)
        return result
    finally:
        cur.close()
        conn.close()


def add_book_to_user_shelf(
    user_id: int,
    book_id: int,
    is_owner_copy: bool = False,
    is_derived: bool = False,
    editor_note: Optional[str] = None,
) -> bool:
    """
    Добавляет книгу на полку пользователя (user_books).
    Если книга уже есть на полке, ничего не делает.
    """
    conn, cur = get_db_cursor()
    try:
        query = """
            INSERT INTO user_books (user_id, book_id, is_owner_copy, is_derived, editor_note)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id, book_id) DO NOTHING
        """
        cur.execute(
            query,
            (user_id, book_id, is_owner_copy, is_derived, editor_note),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()


def delete_book(book_id: int) -> bool:
    """
    Удаляет книгу/раздел из базы данных.
    ВНИМАНИЕ: Это каскадное удаление - удаляются все связанные записи.
    """
    conn, cur = get_db_cursor()
    try:
        # Сначала удаляем все связи с диктантами
        cur.execute("DELETE FROM book_dictations WHERE book_id = %s", (book_id,))
        
        # Удаляем все дочерние разделы (рекурсивно)
        # Получаем все дочерние разделы
        cur.execute("SELECT id FROM books WHERE parent_id = %s", (book_id,))
        child_sections = cur.fetchall()
        for child in child_sections:
            delete_book(child["id"])  # Рекурсивное удаление
        
        # Удаляем связи с категориями
        cur.execute("DELETE FROM book_category_links WHERE book_id = %s", (book_id,))
        
        # Удаляем связи с полками пользователей
        cur.execute("DELETE FROM user_books WHERE book_id = %s", (book_id,))
        
        # Удаляем саму книгу
        cur.execute("DELETE FROM books WHERE id = %s", (book_id,))
        
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()


def add_dictation_to_desk(
    user_id: int,
    dictation_id: int,
    planned_date: Optional[str] = None,
) -> bool:
    """
    Добавляет диктант на «Стол» пользователя (desk_items).
    planned_date может быть строкой в формате YYYY-MM-DD или None.
    """
    conn, cur = get_db_cursor()
    try:
        query = """
            INSERT INTO desk_items (user_id, dictation_id, planned_date)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, dictation_id) DO NOTHING
        """
        cur.execute(query, (user_id, dictation_id, planned_date))
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()


def delete_book(book_id: int) -> bool:
    """
    Удаляет книгу/раздел из базы данных.
    ВНИМАНИЕ: Это каскадное удаление - удаляются все связанные записи.
    """
    conn, cur = get_db_cursor()
    try:
        # Сначала удаляем все связи с диктантами
        cur.execute("DELETE FROM book_dictations WHERE book_id = %s", (book_id,))
        
        # Удаляем все дочерние разделы (рекурсивно)
        # Получаем все дочерние разделы
        cur.execute("SELECT id FROM books WHERE parent_id = %s", (book_id,))
        child_sections = cur.fetchall()
        for child in child_sections:
            delete_book(child["id"])  # Рекурсивное удаление
        
        # Удаляем связи с категориями
        cur.execute("DELETE FROM book_category_links WHERE book_id = %s", (book_id,))
        
        # Удаляем связи с полками пользователей
        cur.execute("DELETE FROM user_books WHERE book_id = %s", (book_id,))
        
        # Удаляем саму книгу
        cur.execute("DELETE FROM books WHERE id = %s", (book_id,))
        
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()


def get_user_library_books(user_id: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Возвращает две коллекции книг пользователя:
    - first: книги, где он создатель (свои книги)
    - second: книги, добавленные на полку других авторов.
    """
    conn, cur = get_db_cursor()
    try:
        # Свои книги: creator_user_id = user_id (только книги верхнего уровня, не разделы)
        cur.execute(
            """
            SELECT
                b.id,
                b.title,
                b.cover_url,
                b.author_text,
                b.creator_user_id,
                b.short_description,
                b.original_language,
                b.visibility,
                b.theme,
                b.parent_id,
                b.order_index,
                b.created_at,
                b.updated_at,
                u.username AS creator_username,
                COALESCE(
                    ARRAY_AGG(DISTINCT c.title) FILTER (WHERE c.id IS NOT NULL),
                    '{}'::varchar[]
                ) AS categories,
                COUNT(DISTINCT bd.id) AS dictations_count
            FROM books b
            LEFT JOIN users u ON u.id = b.creator_user_id
            LEFT JOIN book_category_links l ON l.book_id = b.id
            LEFT JOIN book_categories c ON c.id = l.category_id
            LEFT JOIN book_dictations bd ON bd.book_id = b.id
            WHERE b.creator_user_id = %s AND b.parent_id IS NULL
            GROUP BY
                b.id,
                b.title,
                b.cover_url,
                b.author_text,
                b.creator_user_id,
                b.short_description,
                b.original_language,
                b.visibility,
                b.theme,
                b.parent_id,
                b.order_index,
                b.created_at,
                b.updated_at,
                u.username
            ORDER BY COALESCE(b.order_index, 0), b.created_at DESC
            """,
            (user_id,),
        )
        own_rows = cur.fetchall()

        def _rows_to_books(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            books: List[Dict[str, Any]] = []
            for row in rows:
                # Правильно обрабатываем PostgreSQL массив
                categories_raw = row.get("categories")
                if categories_raw is None:
                    categories = []
                elif isinstance(categories_raw, list):
                    categories = categories_raw
                elif hasattr(categories_raw, '__iter__') and not isinstance(categories_raw, str):
                    categories = list(categories_raw)
                else:
                    categories = []
                
                books.append(
                    {
                        "id": row["id"],
                        "title": row["title"],
                        "cover_url": row["cover_url"],
                        "author_text": row["author_text"],
                        "creator_user_id": row["creator_user_id"],
                        "short_description": row["short_description"],
                        "original_language": row["original_language"],
                        "visibility": row["visibility"],
                        "theme": row["theme"],
                        "parent_id": row.get("parent_id"),
                        "order_index": row.get("order_index", 0),
                        "created_at": row["created_at"].isoformat()
                        if row["created_at"]
                        else None,
                        "updated_at": row["updated_at"].isoformat()
                        if row["updated_at"]
                        else None,
                        "creator_username": row["creator_username"],
                        "categories": categories,
                        "dictations_count": int(row["dictations_count"] or 0),
                    }
                )
            return books

        own_books = _rows_to_books(own_rows)

        # Книги других авторов на полке пользователя (через user_books, только верхнего уровня)
        cur.execute(
            """
            SELECT
                b.id,
                b.title,
                b.cover_url,
                b.author_text,
                b.creator_user_id,
                b.short_description,
                b.original_language,
                b.visibility,
                b.theme,
                b.parent_id,
                b.order_index,
                b.created_at,
                b.updated_at,
                u_creator.username AS creator_username,
                ub.is_owner_copy,
                ub.is_derived,
                ub.editor_note,
                COALESCE(
                    ARRAY_AGG(DISTINCT c.title) FILTER (WHERE c.id IS NOT NULL),
                    '{}'::varchar[]
                ) AS categories,
                COUNT(DISTINCT bd.id) AS dictations_count
            FROM user_books ub
            JOIN books b ON b.id = ub.book_id
            LEFT JOIN users u_creator ON u_creator.id = b.creator_user_id
            LEFT JOIN book_category_links l ON l.book_id = b.id
            LEFT JOIN book_categories c ON c.id = l.category_id
            LEFT JOIN book_dictations bd ON bd.book_id = b.id
            WHERE ub.user_id = %s AND b.parent_id IS NULL
            GROUP BY
                b.id,
                b.title,
                b.cover_url,
                b.author_text,
                b.creator_user_id,
                b.short_description,
                b.original_language,
                b.visibility,
                b.theme,
                b.parent_id,
                b.order_index,
                b.created_at,
                b.updated_at,
                u_creator.username,
                ub.is_owner_copy,
                ub.is_derived,
                ub.editor_note,
                ub.created_at
            ORDER BY COALESCE(b.order_index, 0), ub.created_at DESC
            """,
            (user_id,),
        )
        shelf_rows = cur.fetchall()

        shelf_books: List[Dict[str, Any]] = []
        for row in shelf_rows:
            # Правильно обрабатываем PostgreSQL массив
            categories_raw = row.get("categories")
            if categories_raw is None:
                categories = []
            elif isinstance(categories_raw, list):
                categories = categories_raw
            elif hasattr(categories_raw, '__iter__') and not isinstance(categories_raw, str):
                categories = list(categories_raw)
            else:
                categories = []
            
            shelf_books.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "cover_url": row["cover_url"],
                    "author_text": row["author_text"],
                    "creator_user_id": row["creator_user_id"],
                    "short_description": row["short_description"],
                    "original_language": row["original_language"],
                    "visibility": row["visibility"],
                    "theme": row["theme"],
                    "parent_id": row.get("parent_id"),
                    "order_index": row.get("order_index", 0),
                    "created_at": row["created_at"].isoformat()
                    if row["created_at"]
                    else None,
                    "updated_at": row["updated_at"].isoformat()
                    if row["updated_at"]
                    else None,
                    "creator_username": row["creator_username"],
                    "categories": categories,
                    "dictations_count": int(row["dictations_count"] or 0),
                    "is_owner_copy": row["is_owner_copy"],
                    "is_derived": row["is_derived"],
                    "editor_note": row["editor_note"],
                }
            )

        return own_books, shelf_books
    finally:
        cur.close()
        conn.close()


def get_book_by_id(book_id: int) -> Optional[Dict[str, Any]]:
    """
    Возвращает информацию о книге по ID, включая username создателя.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, существует ли колонка section_number
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='books' AND column_name='section_number'
        """)
        has_section_number = cur.fetchone() is not None
        
        # Проверяем, существует ли колонка author_materials_url
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='books' AND column_name='author_materials_url'
        """)
        has_author_materials_url = cur.fetchone() is not None
        
        if has_section_number and has_author_materials_url:
            query = """
                SELECT
                    b.id,
                    b.title,
                    b.cover_url,
                    b.author_text,
                    b.creator_user_id,
                    b.original_language,
                    b.visibility,
                    b.short_description,
                    b.theme,
                    b.parent_id,
                    b.order_index,
                    b.section_number,
                    b.author_materials_url,
                    b.created_at,
                    b.updated_at,
                    u.username AS creator_username
                FROM books b
                LEFT JOIN users u ON u.id = b.creator_user_id
                WHERE b.id = %s
            """
        elif has_section_number:
            query = """
                SELECT
                    b.id,
                    b.title,
                    b.cover_url,
                    b.author_text,
                    b.creator_user_id,
                    b.original_language,
                    b.visibility,
                    b.short_description,
                    b.theme,
                    b.parent_id,
                    b.order_index,
                    b.section_number,
                    NULL as author_materials_url,
                    b.created_at,
                    b.updated_at,
                    u.username AS creator_username
                FROM books b
                LEFT JOIN users u ON u.id = b.creator_user_id
                WHERE b.id = %s
            """
        elif has_author_materials_url:
            query = """
                SELECT
                    b.id,
                    b.title,
                    b.cover_url,
                    b.author_text,
                    b.creator_user_id,
                    b.original_language,
                    b.visibility,
                    b.short_description,
                    b.theme,
                    b.parent_id,
                    b.order_index,
                    NULL as section_number,
                    b.author_materials_url,
                    b.created_at,
                    b.updated_at,
                    u.username AS creator_username
                FROM books b
                LEFT JOIN users u ON u.id = b.creator_user_id
                WHERE b.id = %s
            """
        else:
            query = """
                SELECT
                    b.id,
                    b.title,
                    b.cover_url,
                    b.author_text,
                    b.creator_user_id,
                    b.original_language,
                    b.visibility,
                    b.short_description,
                    b.theme,
                    b.parent_id,
                    b.order_index,
                    NULL as section_number,
                    NULL as author_materials_url,
                    b.created_at,
                    b.updated_at,
                    u.username AS creator_username
                FROM books b
                LEFT JOIN users u ON u.id = b.creator_user_id
                WHERE b.id = %s
            """
        
        cur.execute(query, (book_id,))
        row = cur.fetchone()
        if not row:
            return None

        # Логируем данные из БД для отладки
        import logging
        logger = logging.getLogger(__name__)
        logger.info("📖 get_book_by_id: book_id=%s, creator_user_id=%s, creator_username=%s", 
                   book_id, row.get("creator_user_id"), row.get("creator_username"))

        return {
            "id": row["id"],
            "title": row["title"],
            "cover_url": row["cover_url"],
            "author_text": row["author_text"],
            "creator_user_id": row["creator_user_id"],
            "creator_username": row["creator_username"] if row["creator_username"] else None,
            "original_language": row["original_language"],
            "visibility": row["visibility"],
            "short_description": row["short_description"],
            "theme": row["theme"],
            "parent_id": row["parent_id"],
            "order_index": row["order_index"],
            "section_number": row.get("section_number"),
            "author_materials_url": row.get("author_materials_url"),
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
    finally:
        cur.close()
        conn.close()


def get_book_sections(parent_id: int) -> List[Dict[str, Any]]:
    """
    Возвращает список дочерних разделов (sections) книги/раздела,
    отсортированных по section_number, затем по order_index.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, существует ли колонка section_number
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='books' AND column_name='section_number'
        """)
        has_section_number = cur.fetchone() is not None
        
        if has_section_number:
            query = """
                SELECT
                    id,
                    title,
                    parent_id,
                    order_index,
                    section_number,
                    created_at,
                    updated_at
                FROM books
                WHERE parent_id = %s
                ORDER BY 
                    COALESCE(section_number, 999999) ASC,
                    COALESCE(order_index, 0) ASC,
                    id ASC
            """
        else:
            query = """
                SELECT
                    id,
                    title,
                    parent_id,
                    order_index,
                    NULL as section_number,
                    created_at,
                    updated_at
                FROM books
                WHERE parent_id = %s
                ORDER BY 
                    COALESCE(order_index, 0) ASC,
                    id ASC
            """
        
        cur.execute(query, (parent_id,))
        rows = cur.fetchall()
        
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "parent_id": row["parent_id"],
                "order_index": row["order_index"],
                "section_number": row["section_number"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
            for row in rows
        ]
    finally:
        cur.close()
        conn.close()


def create_book(
    *,
    creator_user_id: int,
    title: str,
    original_language: Optional[str] = None,
    visibility: str = "private",
    short_description: Optional[str] = None,
    author_text: Optional[str] = None,
    theme: Optional[str] = None,
    parent_id: Optional[int] = None,
    order_index: int = 0,
    section_number: Optional[int] = None,
    author_materials_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Создаёт новую книгу или раздел.
    Если parent_id указан, то это раздел внутри книги/раздела.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, существует ли колонка author_materials_url
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='books' AND column_name='author_materials_url'
        """)
        has_author_materials_url = cur.fetchone() is not None
        
        if has_author_materials_url:
            cur.execute(
                """
                INSERT INTO books (
                    title,
                    cover_url,
                    author_text,
                    creator_user_id,
                    original_language,
                    visibility,
                    short_description,
                    theme,
                    parent_id,
                    order_index,
                    section_number,
                    author_materials_url
                )
                VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, title, cover_url, author_text, creator_user_id,
                          original_language, visibility, short_description, theme,
                          parent_id, order_index, section_number, author_materials_url, created_at, updated_at
                """,
                (
                    title,
                    author_text,
                    creator_user_id,
                    original_language,
                    visibility,
                    short_description,
                    theme,
                    parent_id,
                    order_index,
                    section_number,
                    author_materials_url,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO books (
                    title,
                    cover_url,
                    author_text,
                    creator_user_id,
                    original_language,
                    visibility,
                    short_description,
                    theme,
                    parent_id,
                    order_index,
                    section_number
                )
                VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, title, cover_url, author_text, creator_user_id,
                          original_language, visibility, short_description, theme,
                          parent_id, order_index, section_number, created_at, updated_at
                """,
                (
                    title,
                    author_text,
                    creator_user_id,
                    original_language,
                    visibility,
                    short_description,
                    theme,
                    parent_id,
                    order_index,
                    section_number,
                ),
            )
        row = cur.fetchone()
        conn.commit()

        return {
            "id": row["id"],
            "title": row["title"],
            "cover_url": row["cover_url"],
            "author_text": row["author_text"],
            "creator_user_id": row["creator_user_id"],
            "original_language": row["original_language"],
            "visibility": row["visibility"],
            "short_description": row["short_description"],
            "theme": row["theme"],
            "parent_id": row["parent_id"],
            "order_index": row["order_index"],
            "section_number": row["section_number"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
    finally:
        cur.close()
        conn.close()


def update_book(
    book_id: int,
    *,
    title: Optional[str] = None,
    original_language: Optional[str] = None,
    visibility: Optional[str] = None,
    short_description: Optional[str] = None,
    author_text: Optional[str] = None,
    theme: Optional[str] = None,
    cover_url: Optional[str] = None,
    order_index: Optional[int] = None,
    section_number: Optional[int] = None,
    author_materials_url: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Обновляет базовые поля книги/раздела, включая order_index, section_number и author_materials_url для сортировки.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, существует ли колонка author_materials_url
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='books' AND column_name='author_materials_url'
        """)
        has_author_materials_url = cur.fetchone() is not None
        
        updates = []
        values: List[Any] = []

        if title is not None:
            updates.append("title = %s")
            values.append(title)
        if original_language is not None:
            updates.append("original_language = %s")
            values.append(original_language)
        if visibility is not None:
            updates.append("visibility = %s")
            values.append(visibility)
        if short_description is not None:
            updates.append("short_description = %s")
            values.append(short_description)
        if author_text is not None:
            updates.append("author_text = %s")
            values.append(author_text)
        if theme is not None:
            updates.append("theme = %s")
            values.append(theme)
        if cover_url is not None:
            updates.append("cover_url = %s")
            values.append(cover_url)
        if order_index is not None:
            updates.append("order_index = %s")
            values.append(order_index)
        # section_number может быть числом или None
        # Обновляем, если значение не None
        if section_number is not None:
            updates.append("section_number = %s")
            values.append(section_number)
        # Если section_number явно передан как None (для очистки), нужно его обновить
        # Но в текущей сигнатуре функции мы не можем различить "не передан" и "передан None"
        # Поэтому изменим логику в routes/library.py, чтобы передавать section_number всегда, если он в payload
        if has_author_materials_url and author_materials_url is not None:
            updates.append("author_materials_url = %s")
            values.append(author_materials_url)

        if not updates:
            return None

        updates.append("updated_at = CURRENT_TIMESTAMP")
        values.append(book_id)

        query = f"""
            UPDATE books
            SET {', '.join(updates)}
            WHERE id = %s
            RETURNING id, title, cover_url, author_text, creator_user_id,
                      original_language, visibility, short_description, theme,
                      parent_id, order_index, created_at, updated_at
        """
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()

        if not row:
            return None

        return {
            "id": row["id"],
            "title": row["title"],
            "cover_url": row["cover_url"],
            "author_text": row["author_text"],
            "creator_user_id": row["creator_user_id"],
            "original_language": row["original_language"],
            "visibility": row["visibility"],
            "short_description": row["short_description"],
            "theme": row["theme"],
            "parent_id": row["parent_id"],
            "order_index": row["order_index"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
    finally:
        cur.close()
        conn.close()


def get_or_create_workbook(user_id: int) -> Dict[str, Any]:
    """
    Получает или создаёт книгу "Рабочая тетрадь" для бесхозных диктантов пользователя.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, есть ли уже такая книга
        cur.execute(
            """
            SELECT id, title, cover_url, author_text, creator_user_id,
                   original_language, visibility, short_description, theme,
                   parent_id, order_index, created_at, updated_at
            FROM books
            WHERE creator_user_id = %s AND title = 'Рабочая тетрадь'
            LIMIT 1
            """,
            (user_id,),
        )
        row = cur.fetchone()
        
        if row:
            return {
                "id": row["id"],
                "title": row["title"],
                "cover_url": row["cover_url"],
                "author_text": row["author_text"],
                "creator_user_id": row["creator_user_id"],
                "original_language": row["original_language"],
                "visibility": row["visibility"],
                "short_description": row["short_description"],
                "theme": row["theme"],
                "parent_id": row["parent_id"],
                "order_index": row["order_index"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
        
        # Создаём новую книгу "Рабочая тетрадь"
        return create_book(
            creator_user_id=user_id,
            title="Рабочая тетрадь",
            short_description="Диктанты без книги",
            visibility="private",
            order_index=-1,  # Показывать первой
        )
    finally:
        cur.close()
        conn.close()


def get_orphan_dictations(user_id: int) -> List[Dict[str, Any]]:
    """
    Возвращает список диктантов пользователя, которые не входят ни в одну книгу.
    """
    conn, cur = get_db_cursor()
    try:
        # Проверяем, существует ли колонка author_materials_url
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='dictations' AND column_name='author_materials_url'
        """)
        has_author_materials_url = cur.fetchone() is not None
        
        if has_author_materials_url:
            query = """
                SELECT
                    d.id,
                    d.title,
                    d.language_code,
                    d.level,
                    d.is_public,
                    d.author_materials_url,
                    d.created_at
                FROM dictations d
                WHERE d.owner_id = %s
                AND d.id NOT IN (
                    SELECT DISTINCT dictation_id
                    FROM book_dictations
                )
                ORDER BY d.created_at DESC
            """
        else:
            query = """
                SELECT
                    d.id,
                    d.title,
                    d.language_code,
                    d.level,
                    d.is_public,
                    d.created_at
                FROM dictations d
                WHERE d.owner_id = %s
                AND d.id NOT IN (
                    SELECT DISTINCT dictation_id
                    FROM book_dictations
                )
                ORDER BY d.created_at DESC
            """
        
        cur.execute(query, (user_id,))
        rows = cur.fetchall()
        
        result = []
        for row in rows:
            dictation_dict = {
                "id": row["id"],
                "title": row["title"],
                "language_code": row["language_code"],
                "level": row["level"],
                "is_public": row["is_public"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            if has_author_materials_url:
                dictation_dict["author_materials_url"] = row.get("author_materials_url")
            result.append(dictation_dict)
        
        return result
    finally:
        cur.close()
        conn.close()


def add_dictation_to_book(dictation_id: int, book_id: int, order_index: int = 0) -> bool:
    """
    Добавляет диктант в книгу.
    """
    conn, cur = get_db_cursor()
    try:
        # Сначала проверяем, не существует ли уже такая связь
        cur.execute(
            """
            SELECT id FROM book_dictations
            WHERE book_id = %s AND dictation_id = %s
            """,
            (book_id, dictation_id),
        )
        existing = cur.fetchone()
        
        if existing:
            # Связь уже существует, просто обновим order_index
            cur.execute(
                """
                UPDATE book_dictations
                SET order_index = %s
                WHERE book_id = %s AND dictation_id = %s
                """,
                (order_index, book_id, dictation_id),
            )
        else:
            # Добавляем новую связь
            cur.execute(
                """
                INSERT INTO book_dictations (book_id, dictation_id, order_index)
                VALUES (%s, %s, %s)
                """,
                (book_id, dictation_id, order_index),
            )
        
        conn.commit()
        return True
    except Exception as exc:
        conn.rollback()
        raise exc
    finally:
        cur.close()
        conn.close()


def remove_book_from_user_shelf(user_id: int, book_id: int) -> bool:
    """
    Удаляет книгу с полки пользователя (user_books).
    """
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            "DELETE FROM user_books WHERE user_id = %s AND book_id = %s",
            (user_id, book_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()


def delete_book(book_id: int) -> bool:
    """
    Удаляет книгу/раздел из базы данных.
    ВНИМАНИЕ: Это каскадное удаление - удаляются все связанные записи.
    """
    conn, cur = get_db_cursor()
    try:
        # Сначала удаляем все связи с диктантами
        cur.execute("DELETE FROM book_dictations WHERE book_id = %s", (book_id,))
        
        # Удаляем все дочерние разделы (рекурсивно)
        # Получаем все дочерние разделы
        cur.execute("SELECT id FROM books WHERE parent_id = %s", (book_id,))
        child_sections = cur.fetchall()
        for child in child_sections:
            delete_book(child["id"])  # Рекурсивное удаление
        
        # Удаляем связи с категориями
        cur.execute("DELETE FROM book_category_links WHERE book_id = %s", (book_id,))
        
        # Удаляем связи с полками пользователей
        cur.execute("DELETE FROM user_books WHERE book_id = %s", (book_id,))
        
        # Удаляем саму книгу
        cur.execute("DELETE FROM books WHERE id = %s", (book_id,))
        
        conn.commit()
        return cur.rowcount > 0
    finally:
        cur.close()
        conn.close()



