"""
Роуты для конфигурации и ассетов мультфильмов победы.

Стратегия хранения (B2-first):
- Конфиг (JSON) и файлы (PNG спрайт-листы, аудио) живут в Backblaze B2
  под префиксом `mult/`:
      mult/mults.json
      mult/001.png
      mult/audio/<name>.<ext>
- Локальная папка static/data/mult используется как кеш и как fallback,
  если B2 выключен (B2_ENABLED=false) или недоступен.
- При первом чтении, если в B2 ещё нет конфига, но локально он есть —
  происходит автоматическая миграция локальных файлов в B2.

Эндпоинты:
- GET  /api/mult/config        — вернуть массив параметров мультфильмов (публичный).
- POST /api/mult/config        — сохранить массив параметров (только админ).
- GET  /api/mult/asset/<path>  — отдать PNG/аудио (локальный кеш-first, B2 как источник и fallback).
- POST /api/mult/asset/upload  — загрузить PNG/аудио в B2 (только админ).
"""

import json
import os
import tempfile

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import get_jwt_identity, jwt_required

from helpers.db import get_db_cursor

mult_bp = Blueprint("mult", __name__, url_prefix="")

MAX_INDEX = 100

B2_PREFIX = "mult"

DEFAULT_CONFIG = {
    "version": 1,
    "mults": [],
}

ALLOWED_IMAGE_EXTENSIONS = {".png", ".webp", ".jpg", ".jpeg", ".gif"}
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".ogg", ".wav", ".m4a", ".aac", ".webm"}


def _get_b2():
    from helpers.b2_storage import b2_storage

    return b2_storage


def _get_local_base_dir() -> str:
    """Локальная папка mult (кеш/fallback) с учётом STATIC_DATA_FOLDER."""
    override = os.getenv("STATIC_DATA_FOLDER")
    if override:
        base = override
    else:
        base = os.path.join(current_app.root_path, "static", "data")
    return os.path.join(base, "mult")


def _get_mult_config_path() -> str:
    return os.path.join(_get_local_base_dir(), "mults.json")


def _read_config_local() -> dict:
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


def _read_config_from_b2() -> dict:
    b2 = _get_b2()
    if not b2.enabled:
        return dict(DEFAULT_CONFIG)

    remote = f"{B2_PREFIX}/mults.json"
    tmp_path = None
    try:
        if not b2.file_exists(remote):
            return dict(DEFAULT_CONFIG)
        fd, tmp_path = tempfile.mkstemp(prefix="mult_config_", suffix=".json")
        os.close(fd)
        if not b2.download_file(remote, tmp_path):
            return dict(DEFAULT_CONFIG)
        with open(tmp_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return {"version": 1, "mults": data}
        if isinstance(data, dict) and isinstance(data.get("mults"), list):
            return {"version": data.get("version") or 1, "mults": data["mults"]}
        return dict(DEFAULT_CONFIG)
    except Exception:
        return dict(DEFAULT_CONFIG)
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def _write_config_local(config: dict) -> None:
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


def _write_config_to_b2(config: dict) -> bool:
    b2 = _get_b2()
    if not b2.enabled:
        return False

    fd, tmp_path = tempfile.mkstemp(prefix="mult_config_", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(
                {"version": int(config.get("version") or 1), "mults": config.get("mults") or []},
                f,
                ensure_ascii=False,
                indent=2,
            )
            f.write("\n")
        url = b2.upload_file(tmp_path, f"{B2_PREFIX}/mults.json")
        return url is not None
    except Exception:
        return False
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _migrate_local_to_b2() -> None:
    """При первом обращении заливаем локальные файлы мультиков в B2."""
    b2 = _get_b2()
    if not b2.enabled:
        return

    base = _get_local_base_dir()
    try:
        files = os.listdir(base)
    except Exception:
        return

    for name in files:
        if name == "mults.json":
            continue
        local_path = os.path.join(base, name)
        if not os.path.isfile(local_path):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS and ext not in ALLOWED_AUDIO_EXTENSIONS:
            continue
        remote = f"{B2_PREFIX}/{name}"
        try:
            if not b2.file_exists(remote):
                b2.upload_file(local_path, remote)
        except Exception:
            continue

    # Конфиг — если его ещё нет в B2, но есть локально.
    try:
        if not b2.file_exists(f"{B2_PREFIX}/mults.json"):
            local_config_path = _get_mult_config_path()
            if os.path.exists(local_config_path):
                b2.upload_file(local_config_path, f"{B2_PREFIX}/mults.json")
    except Exception:
        pass


def _read_config() -> dict:
    """B2-first: если B2 включён и там есть конфиг — берём его.
    Иначе используем локальный конфиг (при этом мигрируем локальные файлы в B2).
    """
    b2 = _get_b2()
    if b2.enabled:
        cfg = _read_config_from_b2()
        if cfg.get("mults") or _has_config_in_b2(b2):
            return cfg
        # В B2 конфига нет — пробуем локальный и мигрируем.
        local_cfg = _read_config_local()
        if local_cfg.get("mults"):
            _migrate_local_to_b2()
            _write_config_to_b2(local_cfg)
            return local_cfg
        return cfg

    return _read_config_local()


def _has_config_in_b2(b2) -> bool:
    try:
        return bool(b2.file_exists(f"{B2_PREFIX}/mults.json"))
    except Exception:
        return False


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


def _safe_asset_name(filename: str) -> str:
    """Оставляем только базовое имя файла, без путей."""
    name = os.path.basename(str(filename or "").strip().replace("\\", "/"))
    if not name or name in {".", ".."}:
        raise ValueError("Некорректное имя файла")
    return name


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

    config = {"version": 1, "mults": entries}

    try:
        _write_config_local(config)
    except Exception as e:
        return jsonify({"success": False, "error": f"Не удалось записать файл: {e}"}), 500

    try:
        _write_config_to_b2(config)
    except Exception as e:
        # Локально сохранили — не ломаем запрос из-за временной недоступности B2.
        pass

    return jsonify({
        "success": True,
        "message": "Параметры мультфильмов сохранены",
        "config": config,
    })


@mult_bp.route("/api/mult/asset/<path:filename>", methods=["GET"])
def get_mult_asset(filename):
    """Отдать PNG/аудио мультика: локальный кеш-first, B2 как источник и fallback."""
    try:
        name = _safe_asset_name(filename)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    local_path = os.path.join(_get_local_base_dir(), name)

    # Локальный кеш уже есть — отдаём сразу, без обращения в B2.
    if os.path.exists(local_path):
        return send_from_directory(os.path.dirname(local_path), name)

    # В кеше нет — пробуем скачать из B2 и синхронизировать локальный кеш.
    b2 = _get_b2()
    if b2.enabled:
        remote = f"{B2_PREFIX}/{name}"
        tmp_path = None
        try:
            if b2.file_exists(remote, raise_on_error=True):
                fd, tmp_path = tempfile.mkstemp(prefix="mult_asset_", suffix=os.path.splitext(name)[1])
                os.close(fd)
                if b2.download_file(remote, tmp_path) and os.path.exists(tmp_path):
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    with open(tmp_path, "rb") as src, open(local_path, "wb") as dst:
                        dst.write(src.read())
        except Exception:
            # При временной недоступности B2 продолжаем (ниже вернём 404/локально).
            pass
        finally:
            if tmp_path:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    if os.path.exists(local_path):
        return send_from_directory(os.path.dirname(local_path), name)

    return jsonify({"error": "Ассет не найден"}), 404


@mult_bp.route("/api/mult/asset/upload", methods=["POST"])
@jwt_required()
def upload_mult_asset():
    """Загрузить PNG/аудио мультика в B2 (только админ)."""
    identity = get_jwt_identity()

    try:
        if not _is_admin(identity):
            return jsonify({"success": False, "error": "Forbidden: только для администратора"}), 403
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

    if "file" not in request.files:
        return jsonify({"success": False, "error": "Нет файла (поле file)"}), 400

    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"success": False, "error": "Файл не выбран"}), 400

    try:
        name = _safe_asset_name(f.filename)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS and ext not in ALLOWED_AUDIO_EXTENSIONS:
        return jsonify({"success": False, "error": f"Недопустимое расширение: {ext}"}), 400

    local_path = os.path.join(_get_local_base_dir(), name)
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        f.save(local_path)
    except Exception as e:
        return jsonify({"success": False, "error": f"Не удалось сохранить файл: {e}"}), 500

    uploaded = False
    b2 = _get_b2()
    if b2.enabled:
        try:
            uploaded = b2.upload_file(local_path, f"{B2_PREFIX}/{name}") is not None
        except Exception:
            uploaded = False

    return jsonify({
        "success": True,
        "name": name,
        "uploaded_to_b2": uploaded,
    })
