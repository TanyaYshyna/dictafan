import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from helpers.db_users import get_user_by_email
from helpers.db_assignments import (
    archive_assignments,
    create_assignment_days,
    create_assignment_period,
    list_group_assignments_for_teacher,
    list_my_assignments_for_student,
)


logger = logging.getLogger(__name__)

assignments_bp = Blueprint("assignments", __name__, url_prefix="/api/assignments")


@assignments_bp.route("/teacher/group/<int:group_id>", methods=["GET"])
@jwt_required()
def api_teacher_group_assignments(group_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    include_archived = request.args.get("include_archived") in ("1", "true", "True")

    try:
        items = list_group_assignments_for_teacher(group_id, user["id"], include_archived=include_archived)
        return jsonify({"success": True, "assignments": items})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except Exception as exc:
        logger.error("Ошибка получения заданий группы %s: %s", group_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/teacher/create", methods=["POST"])
@jwt_required()
def api_teacher_create_assignment():
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json(silent=True) or {}

    group_id = data.get("group_id")
    dictation_id = data.get("dictation_id")
    mode = (data.get("mode") or data.get("type") or "").strip().lower()

    try:
        group_id_int = int(group_id)
        dictation_id_int = int(dictation_id)
    except Exception:
        return jsonify({"success": False, "error": "group_id and dictation_id must be int"}), 400

    try:
        if mode in ("period", "на период", "range"):
            item = create_assignment_period(
                group_id_int,
                dictation_id_int,
                user["id"],
                start_date=data.get("start_date"),
                end_date=data.get("end_date"),
                required_completions=data.get("required_completions"),
            )
            return jsonify({"success": True, "assignment": item})

        if mode in ("days", "по дням", "day"):
            items = create_assignment_days(
                group_id_int,
                dictation_id_int,
                user["id"],
                days=data.get("days") or data.get("plan") or [],
            )
            return jsonify({"success": True, "assignments": items})

        return jsonify({"success": False, "error": "mode must be period or days"}), 400

    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка создания задания: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/teacher/archive", methods=["POST"])
@jwt_required()
def api_teacher_archive_assignments():
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or data.get("assignment_ids") or []
    if not isinstance(ids, list):
        return jsonify({"success": False, "error": "ids must be list"}), 400

    try:
        ids_int = [int(x) for x in ids]
    except Exception:
        return jsonify({"success": False, "error": "ids must be int list"}), 400

    try:
        updated = archive_assignments(ids_int, user["id"])
        return jsonify({"success": True, "archived": updated})
    except Exception as exc:
        logger.error("Ошибка архивирования заданий: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/student/my", methods=["GET"])
@jwt_required()
def api_student_my_assignments():
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    for_date = request.args.get("date") or request.args.get("for_date")
    if not for_date:
        return jsonify({"success": False, "error": "date is required"}), 400

    try:
        items = list_my_assignments_for_student(user["id"], for_date=for_date)
        return jsonify({"success": True, "assignments": items})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка получения заданий ученика: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500
