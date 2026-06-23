import logging

from flask import Blueprint, render_template


logger = logging.getLogger(__name__)

desktop_bp = Blueprint("desktop", __name__)


@desktop_bp.route("/desktop")
def desktop_page():
    return render_template("desktop.html")
