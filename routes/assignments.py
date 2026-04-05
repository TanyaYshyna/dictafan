import logging
import time

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from helpers.db_users import get_user_by_email
from helpers.db_assignments import (
    create_assignment_days,
    delete_assignments,
    get_assignment_for_teacher,
    get_assignment_students_progress_for_teacher,
    list_group_assignments_for_teacher,
    list_my_assignments_for_student,
    update_assignment_for_teacher,
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

    try:
        items = list_group_assignments_for_teacher(group_id, user["id"], include_archived=False)
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
    selected_sentence_positions = data.get("selected_sentence_positions")

    try:
        group_id_int = int(group_id)
        dictation_id_int = int(dictation_id)
    except Exception:
        return jsonify({"success": False, "error": "group_id and dictation_id must be int"}), 400

    try:
        if mode in ("days", "по дням", "day"):
            items = create_assignment_days(
                group_id_int,
                dictation_id_int,
                user["id"],
                days=data.get("days") or data.get("plan") or [],
                selected_sentence_positions=selected_sentence_positions,
            )
            return jsonify({"success": True, "assignments": items})

        return jsonify({"success": False, "error": "mode must be days"}), 400

    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка создания задания: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/teacher/delete", methods=["POST"])
@jwt_required()
def api_teacher_delete_assignments():
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
        deleted = delete_assignments(ids_int, user["id"])
        return jsonify({"success": True, "deleted": deleted})
    except Exception as exc:
        logger.error("Ошибка удаления заданий: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/teacher/assignment/<int:assignment_id>/students", methods=["GET"])
@jwt_required()
def api_teacher_assignment_students_progress(assignment_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        data = get_assignment_students_progress_for_teacher(assignment_id, user["id"])
        return jsonify({"success": True, **data})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except Exception as exc:
        logger.error("Ошибка получения прогресса по заданию %s: %s", assignment_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/teacher/assignment/<int:assignment_id>", methods=["GET"])
@jwt_required()
def api_teacher_get_assignment(assignment_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    try:
        a = get_assignment_for_teacher(assignment_id, user["id"])
        return jsonify({"success": True, "assignment": a})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка получения задания %s: %s", assignment_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/teacher/assignment/<int:assignment_id>", methods=["PUT"])
@jwt_required()
def api_teacher_update_assignment(assignment_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    group_id = data.get("group_id")
    days = data.get("days") or data.get("plan")
    selected_sentence_positions = data.get("selected_sentence_positions")

    # Backward compatibility: allow updating a single day via {date, required_completions}
    if not isinstance(days, list) or not days:
        day_date = data.get("date") or data.get("day_date") or data.get("start_date")
        required_completions = data.get("required_completions")
        if day_date is not None:
            days = [{"date": day_date, "required_completions": required_completions}]

    try:
        group_id_int = int(group_id)
    except Exception:
        return jsonify({"success": False, "error": "group_id must be int"}), 400

    if not isinstance(days, list) or not days:
        return jsonify({"success": False, "error": "days is required"}), 400

    try:
        a = update_assignment_for_teacher(
            assignment_id,
            user["id"],
            group_id=group_id_int,
            days=days,
            selected_sentence_positions=selected_sentence_positions,
        )
        return jsonify({"success": True, "assignment": a})
    except PermissionError:
        return jsonify({"success": False, "error": "Forbidden"}), 403
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка обновления задания %s: %s", assignment_id, exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@assignments_bp.route("/student/my", methods=["GET"])
@jwt_required()
def api_student_my_assignments():
    t0 = time.perf_counter()
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({"success": False, "error": "User not found"}), 404

    for_date = request.args.get("date") or request.args.get("for_date")
    if not for_date:
        return jsonify({"success": False, "error": "date is required"}), 400

    try:
        t_db0 = time.perf_counter()
        items = list_my_assignments_for_student(user["id"], for_date=for_date)
        t_db1 = time.perf_counter()
        try:
            logger.info(
                "[student_plan] /api/assignments/student/my user=%s date=%s items=%s db=%.1fms total=%.1fms",
                user.get("id"),
                for_date,
                len(items) if isinstance(items, list) else None,
                (t_db1 - t_db0) * 1000.0,
                (time.perf_counter() - t0) * 1000.0,
            )
        except Exception:
            pass
        return jsonify({"success": True, "assignments": items})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error("Ошибка получения заданий ученика: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500
