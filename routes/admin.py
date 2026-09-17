"""
Blueprint для отдельной страницы администратора.

Страница /admin — пульт управления админскими задачами.
Доступ контролируется разрешением 'access_admin_panel'.
"""

from flask import Blueprint, render_template

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


@admin_bp.route('/')
def admin_page():
    """
    Отдельная страница администратора.

    Рендерится всегда, но на клиенте (admin.js) проверяется
    наличие права 'access_admin_panel' у текущего пользователя.
    """
    return render_template("admin.html")
