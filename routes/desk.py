import logging
from flask import Blueprint, render_template, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from helpers.db_users import get_user_by_email
from helpers.db import get_db_cursor
from routes.index import get_cover_url_for_id


logger = logging.getLogger(__name__)

desk_bp = Blueprint("desk", __name__, url_prefix="/desk")


# Страница стола удалена - теперь используется приватная библиотека с рабочим столом
# @desk_bp.route("/")
# @jwt_required()
# def desk_page():
#     return render_template("desk.html")


@desk_bp.route("/api/items", methods=["GET"])
@jwt_required()
def api_desk_items():
    """
    Возвращает список диктантов, которые находятся на столе у текущего пользователя.
    Группировка по дате добавления будет обрабатываться на фронтенде по полю created_at.
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT
                di.id,
                di.dictation_id,
                di.created_at,
                di.planned_date,
                d.title,
                d.language_code,
                d.level,
                (SELECT COUNT(*) FROM dictation_sentences WHERE dictation_id = d.id AND language_code = d.language_code) as sentences_count,
                (SELECT DISTINCT language_code 
                 FROM dictation_sentences 
                 WHERE dictation_id = d.id AND language_code != d.language_code 
                 LIMIT 1) as language_translation
            FROM desk_items di
            JOIN dictations d ON d.id = di.dictation_id
            WHERE di.user_id = %s
            ORDER BY di.created_at DESC
            """,
            (user["id"],),
        )
        rows = cur.fetchall()

        items = []
        for row in rows:
            dictation_id_str = f"dict_{row['dictation_id']}"
            try:
                cover_url = get_cover_url_for_id(dictation_id_str, row["language_code"])
                logger.debug("Обложка для диктанта %s (язык %s): %s", dictation_id_str, row["language_code"], cover_url)
            except Exception as e:
                logger.warning("Ошибка получения обложки для диктанта %s: %s", dictation_id_str, e, exc_info=True)
                cover_url = f"/static/data/covers/cover_{row['language_code'] or 'en'}.webp"
            
            items.append(
                {
                    "id": row["id"],
                    "dictation_id": row["dictation_id"],
                    "created_at": row["created_at"].isoformat()
                    if row["created_at"]
                    else None,
                    "planned_date": row["planned_date"].isoformat()
                    if row["planned_date"]
                    else None,
                    "title": row["title"],
                    "language_code": row["language_code"],
                    "language_translation": row["language_translation"] or row["language_code"],
                    "level": row["level"],
                    "sentences_count": row["sentences_count"] or 0,
                    "cover_url": cover_url,
                }
            )

        return jsonify({"success": True, "items": items})
    except Exception as exc:
        logger.error("Ошибка получения стола пользователя: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


@desk_bp.route("/api/item/<int:item_id>", methods=["DELETE"])
@jwt_required()
def api_remove_desk_item(item_id: int):
    """
    Убирает диктант со стола (строка удаляется из desk_items).
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            "DELETE FROM desk_items WHERE id = %s AND user_id = %s",
            (item_id, user["id"]),
        )
        conn.commit()
        removed = cur.rowcount > 0
        return jsonify({"success": True, "removed": removed})
    except Exception as exc:
        logger.error("Ошибка удаления диктанта со стола: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


