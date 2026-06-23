import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from helpers.db_users import get_user_by_email
from helpers.db_assignments import list_plan_tasks_for_teacher, reconcile_plan_tasks_for_teacher


logger = logging.getLogger(__name__)

plan_tasks_bp = Blueprint('plan_tasks', __name__, url_prefix='/api/plan_tasks')


@plan_tasks_bp.route('/teacher/group/<int:group_id>/dictation/<int:dictation_id>', methods=['GET'])
@jwt_required()
def api_teacher_list_plan_tasks(group_id: int, dictation_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    try:
        items = list_plan_tasks_for_teacher(int(group_id), int(dictation_id), int(user['id']))
        return jsonify({'success': True, 'tasks': items})
    except PermissionError:
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    except Exception as exc:
        logger.error('Ошибка получения plan_tasks: %s', exc)
        return jsonify({'success': False, 'error': str(exc)}), 500


@plan_tasks_bp.route('/teacher/group/<int:group_id>/dictation/<int:dictation_id>/reconcile', methods=['POST'])
@jwt_required()
def api_teacher_reconcile_plan_tasks(group_id: int, dictation_id: int):
    current_email = get_jwt_identity()
    user = get_user_by_email(current_email)
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    tasks_payload = data.get('tasks')

    try:
        res = reconcile_plan_tasks_for_teacher(int(group_id), int(dictation_id), int(user['id']), tasks_payload)
        items = list_plan_tasks_for_teacher(int(group_id), int(dictation_id), int(user['id']))
        return jsonify({'success': True, 'result': res, 'tasks': items})
    except PermissionError:
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        logger.error('Ошибка reconcile plan_tasks: %s', exc)
        return jsonify({'success': False, 'error': str(exc)}), 500
