import logging
from flask import Blueprint, render_template, jsonify, request
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


@desk_bp.route("/api/items/version", methods=["GET"])
@jwt_required()
def api_desk_items_version():
    """Lightweight desk version check for multi-device sync.

    Returns a stable version string derived from:
    - number of desk items
    - most recent created_at timestamp
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
                COUNT(*)::int AS items_count,
                MAX(created_at) AS last_created_at
            FROM desk_items
            WHERE user_id = %s
            """,
            (user["id"],),
        )
        row = cur.fetchone() or {}
        items_count = int(row.get("items_count") or 0)
        last_created_at = row.get("last_created_at")
        last_iso = last_created_at.isoformat() if last_created_at else ""
        version = f"{items_count}:{last_iso}"
        return jsonify(
            {
                "success": True,
                "version": version,
                "items_count": items_count,
                "last_created_at": last_iso,
            }
        )
    except Exception as exc:
        logger.error("Ошибка получения версии стола пользователя: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


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
                d.owner_id,
                d.level,
                COALESCE(d.tr_en, FALSE) as tr_en,
                COALESCE(d.tr_uk, FALSE) as tr_uk,
                COALESCE(d.tr_sv, FALSE) as tr_sv,
                COALESCE(d.tr_be, FALSE) as tr_be,
                COALESCE(d.tr_ru, FALSE) as tr_ru,
                COALESCE(d.tr_de, FALSE) as tr_de,
                COALESCE(d.tr_fr, FALSE) as tr_fr,
                COALESCE(d.tr_es, FALSE) as tr_es,
                COALESCE(d.tr_it, FALSE) as tr_it,
                COALESCE(d.tr_tr, FALSE) as tr_tr,
                COALESCE(d.tr_ar, FALSE) as tr_ar,
                COALESCE(d.tr_pl, FALSE) as tr_pl,
                COALESCE(d.sentences_count, 0) as sentences_count,
                COALESCE(d.audio_order, '') as audio_order,
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
                    "translation_languages": sorted(
                        [
                            lang
                            for lang in [
                                "en",
                                "uk",
                                "sv",
                                "be",
                                "ru",
                                "de",
                                "fr",
                                "es",
                                "it",
                                "tr",
                                "ar",
                                "pl",
                            ]
                            if row.get(f"tr_{lang}")
                        ]
                    ),
                    "owner_id": row.get("owner_id"),
                    "level": row["level"],
                    "sentences_count": row["sentences_count"] or 0,
                    "audio_order": row.get("audio_order") or '',
                    "cover_url": cover_url,
                    "tr_en": bool(row.get("tr_en")),
                    "tr_uk": bool(row.get("tr_uk")),
                    "tr_sv": bool(row.get("tr_sv")),
                    "tr_be": bool(row.get("tr_be")),
                    "tr_ru": bool(row.get("tr_ru")),
                    "tr_de": bool(row.get("tr_de")),
                    "tr_fr": bool(row.get("tr_fr")),
                    "tr_es": bool(row.get("tr_es")),
                    "tr_it": bool(row.get("tr_it")),
                    "tr_tr": bool(row.get("tr_tr")),
                    "tr_ar": bool(row.get("tr_ar")),
                    "tr_pl": bool(row.get("tr_pl")),
                }
            )

        return jsonify({"success": True, "items": items})
    except Exception as exc:
        logger.error("Ошибка получения стола пользователя: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        cur.close()
        conn.close()


@desk_bp.route("/api/items", methods=["POST"])
@jwt_required()
def api_add_desk_item():
    """
    Добавляет диктант на рабочий стол пользователя.
    Ожидает JSON: { "dictation_id": <int> }
    """
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    dictation_id = data.get("dictation_id")
    if not dictation_id:
        return jsonify({"success": False, "error": "Missing dictation_id"}), 400

    try:
        dictation_id = int(dictation_id)
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "dictation_id must be an integer"}), 400

    conn, cur = get_db_cursor()
    try:
        # Проверяем, не добавлен ли уже этот диктант на стол
        cur.execute(
            "SELECT id FROM desk_items WHERE dictation_id = %s AND user_id = %s",
            (dictation_id, user["id"]),
        )
        existing = cur.fetchone()
        if existing:
            return jsonify({"success": True, "message": "Already on desk", "id": existing["id"]})

        cur.execute(
            "INSERT INTO desk_items (dictation_id, user_id) VALUES (%s, %s) RETURNING id",
            (dictation_id, user["id"]),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        return jsonify({"success": True, "message": "Added to desk", "id": new_id})
    except Exception as exc:
        logger.error("Ошибка добавления диктанта на стол: %s", exc)
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


