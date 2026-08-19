"""
Роуты для конфигурации мультфильмов победы.

- GET  /api/mult/config  — вернуть массив параметров мультфильмов (публичный,
  используется в диктанте и в окне предпросмотра).
- POST /api/mult/config  — сохранить массив параметров в mults.json
  (только для администраторов).
"""

import json
import os
import tempfile
from datetime import date

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from helpers.db import get_db_cursor

mult_bp = Blueprint("mult", __name__, url_prefix="")

MAX_INDEX = 100

DEFAULT_CONFIG = {
    "version": 1,
    "mults": [],
}


def _get_mult_config_path() -> str:
    """Путь к mults.json с учётом STATIC_DATA_FOLDER (как в serve_static_data)."""
    override = os.getenv("STATIC_DATA_FOLDER")
    if override:
        base = override
    else:
        base = os.path.join(current_app.root_path, "static", "data")
    return os.path.join(base, "mult", "mults.json")


def _read_config() -> dict:
    path = _get_mult_config_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return dict(DEFAULT_CONFIG)

    if isinstance(data, list):
        return {"version": 1, "mults": data}
    if isinstance(data, dict) and isinstance(data.get("mults"), list):
        return {"version": data.get("version") or 1, "mults": data["mults"]}
    return dict(DEFAULT_CONFIG)


def _write_config(config: dict) -> None:
    path = _get_mult_config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)

    payload = {
        "version": int(config.get("version") or 1),
        "mults": config.get("mults") or [],
    }

    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise


def _normalize_entry(entry: dict) -> dict:
    """Приводит запись мультфильма к безопасному виду."""
    number = int(entry.get("number") or 0)
    if number < 1 or number > MAX_INDEX:
        raise ValueError(f"Номер мультфильма должен быть от 1 до {MAX_INDEX}")

    png = str(entry.get("png") or "").strip()
    if not png:
        png = f"{number:03d}.png"

    frames_w = int(entry.get("frames_w") or 1)
    frames_h = int(entry.get("frames_h") or 1)
    if frames_w < 1 or frames_w > 100:
        frames_w = 1
    if frames_h < 1 or frames_h > 100:
        frames_h = 1

    try:
        speed = float(entry.get("speed") if entry.get("speed") is not None else 12)
    except (TypeError, ValueError):
        speed = 12.0
    if speed <= 0:
        speed = 12.0

    audio = entry.get("audio")
    if audio is not None:
        audio = str(audio).strip() or None

    return {
        "number": number,
        "png": png,
        "frames_w": frames_w,
        "frames_h": frames_h,
        "speed": speed,
        "audio": audio,
    }


def _is_admin(email: str) -> bool:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT r.code
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE u.email = %s
            """,
            (email,),
        )
        row = cur.fetchone()
        return bool(row and row["code"] == "admin")
    finally:
        cur.close()
        conn.close()


@mult_bp.route("/api/mult/config", methods=["GET"])
def get_mult_config():
    """Вернуть конфигурацию мультфильмов (публично)."""
    try:
        return jsonify({"success": True, "config": _read_config()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@mult_bp.route("/api/mult/config", methods=["POST"])
@jwt_required()
def save_mult_config():
    """Сохранить конфигурацию мультфильмов (только админ)."""
    identity = get_jwt_identity()
    if not identity:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        if not _is_admin(identity):
            return jsonify({"success": False, "error": "Forbidden: только для администратора"}), 403
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

    data = request.get_json(silent=True) or {}
    raw_mults = data.get("mults")
    if not isinstance(raw_mults, list):
        return jsonify({"success": False, "error": "Ожидается поле mults (массив)"}), 400

    try:
        entries = [_normalize_entry(e) for e in raw_mults]
        entries.sort(key=lambda x: x["number"])
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "error": str(e)}), 400

    try:
        _write_config({"version": 1, "mults": entries})
    except Exception as e:
        return jsonify({"success": False, "error": f"Не удалось записать файл: {e}"}), 500

    return jsonify({
        "success": True,
        "message": "Параметры мультфильмов сохранены",
        "config": {"version": 1, "mults": entries},
    })
