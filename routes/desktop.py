import logging

from flask import Blueprint, render_template
from flask_jwt_extended import jwt_required


logger = logging.getLogger(__name__)

desktop_bp = Blueprint("desktop", __name__)


@desktop_bp.route("/desktop")
@jwt_required()
def desktop_page():
    return render_template("desktop.html")
