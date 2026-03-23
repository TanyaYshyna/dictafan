import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from helpers.db_users import get_user_by_email
from helpers.db_groups import (
    accept_group_invite_by_token,
    create_group,
    create_group_invite,
    get_group_for_teacher,
    list_group_students_for_teacher,
    list_my_groups,
    soft_remove_group_student,
    update_group,
)


logger = logging.getLogger(__name__)

groups_bp = Blueprint("groups", __name__, url_prefix="/groups")


@groups_bp.route("/api/my", methods=["GET"])
@jwt_required()
def api_my_groups():
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        groups = list_my_groups(user["id"])
        return jsonify({"success": True, "groups": groups})
    except Exception as exc:
        logger.error("Ошибка получения групп: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/group", methods=["POST"])
@jwt_required()
def api_create_group():
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = data.get("description")

    if not title:
        return jsonify({"success": False, "error": "title is required"}), 400

    try:
        group = create_group(user["id"], title=title, description=description)
        return jsonify({"success": True, "group": group})
    except Exception as exc:
        logger.error("Ошибка создания группы: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/group/<int:group_id>", methods=["GET"])
@jwt_required()
def api_group_details(group_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        group = get_group_for_teacher(group_id, user["id"])
        if not group:
            return jsonify({"success": False, "error": "Group not found"}), 404
        return jsonify({"success": True, "group": group})
    except Exception as exc:
        logger.error("Ошибка получения группы %s: %s", group_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/group/<int:group_id>", methods=["PUT"])
@jwt_required()
def api_update_group(group_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    updates = request.get_json(silent=True) or {}

    try:
        group = update_group(group_id, user["id"], updates)
        if not group:
            return jsonify({"success": False, "error": "Group not found"}), 404
        return jsonify({"success": True, "group": group})
    except Exception as exc:
        logger.error("Ошибка обновления группы %s: %s", group_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/group/<int:group_id>/invite", methods=["POST"])
@jwt_required()
def api_create_group_invite(group_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    max_uses = data.get("max_uses")

    try:
        max_uses_int = int(max_uses) if max_uses is not None else None
    except Exception:
        return jsonify({"success": False, "error": "max_uses must be int"}), 400

    try:
        invite = create_group_invite(group_id, user["id"], max_uses=max_uses_int)
        return jsonify({"success": True, "invite": invite, "join_path": f"/join-group/{invite['token']}"})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except Exception as exc:
        logger.error("Ошибка создания инвайта для группы %s: %s", group_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/join/<string:token>", methods=["POST"])
@jwt_required()
def api_join_group(token: str):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        res = accept_group_invite_by_token(token, user["id"])
        return jsonify({"success": True, "group_id": res.get("group_id")})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка вступления по инвайту: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/group/<int:group_id>/students", methods=["GET"])
@jwt_required()
def api_group_students(group_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        students = list_group_students_for_teacher(group_id, user["id"])
        return jsonify({"success": True, "students": students})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except Exception as exc:
        logger.error("Ошибка получения учеников группы %s: %s", group_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@groups_bp.route("/api/group/<int:group_id>/students/<int:student_user_id>/remove", methods=["POST"])
@jwt_required()
def api_remove_group_student(group_id: int, student_user_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        soft_remove_group_student(group_id, user["id"], student_user_id)
        return jsonify({"success": True})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except Exception as exc:
        logger.error("Ошибка удаления ученика %s из группы %s: %s", student_user_id, group_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500
