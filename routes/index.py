import datetime
import io
import json
import os
import shutil
import hashlib
import tempfile
import zipfile
from flask import Blueprint, jsonify, render_template, request, current_app, send_file, send_from_directory, redirect
from flask_jwt_extended import jwt_required, get_jwt_identity
import logging

logger = logging.getLogger(__name__)
from helpers.language_data import load_language_data, get_language_name
from helpers.db_users import get_user_by_email

index_bp = Blueprint('index', __name__)

DATA_DIR = os.path.join("static", "data") 


def get_app_cache_revision() -> str:
    try:
        # Prefer environment-provided build/release identifiers (best for deploys).
        for k in (
            'APP_CACHE_REVISION',
            'RAILWAY_GIT_COMMIT_SHA',
            'RAILWAY_GIT_COMMIT',
            'GIT_COMMIT',
            'SOURCE_VERSION',
            'RENDER_GIT_COMMIT',
            'VERCEL_GIT_COMMIT_SHA',
        ):
            v = os.getenv(k)
            if v:
                return str(v)
    except Exception:
        pass

    try:
        # Automatic fallback: compute revision from mtimes of key static assets.
        # This changes naturally on deploy when files are updated.
        base_dir = current_app.root_path
        candidates = [
            'sw.js',
            # os.path.join('static', 'js', 'script_dictation.js'),
            os.path.join('static', 'js', 'user_manager.js'),
            # os.path.join('static', 'css', 'style_dictation.css'),
        ]
        parts = []
        for rel in candidates:
            try:
                p = os.path.join(base_dir, rel)
                st = os.stat(p)
                parts.append(f"{rel}:{int(st.st_mtime)}:{st.st_size}")
            except Exception:
                continue

        if parts:
            raw = '|'.join(parts).encode('utf-8')
            return hashlib.sha1(raw).hexdigest()[:12]
    except Exception:
        pass

    try:
        from helpers.db import get_db_cursor

        conn, cur = get_db_cursor()
        try:
            cur.execute(
                "SELECT value FROM app_settings WHERE key = %s",
                ('app_cache_revision',)
            )
            row = cur.fetchone()
            if row and row.get('value'):
                return str(row.get('value'))
        finally:
            try:
                cur.close()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
    except Exception:
        pass

    return '1'


def _get_static_data_base_dir() -> str:
    override = os.getenv("STATIC_DATA_FOLDER")
    if override:
        return override
    static_base = current_app.static_folder or os.path.join(current_app.root_path, "static")
    return os.path.join(static_base, "data")


# Вспомогательная функция для получения читабельного названия языка
def get_language_title(lang_code: str) -> str:
    return get_language_name(lang_code)


# Обеспечивает наличие родительского и дочернего узла для пары языков
def ensure_language_pair_nodes(categories_data: dict, language_original: str, language_translation: str):
    if not categories_data:
        categories_data = {}

    categories_data.setdefault("children", [])

    created_parent = False
    created_pair = False

    parent_node = None
    for child in categories_data["children"]:
        data = child.get("data", {})
        if data.get("language_original") == language_original and not data.get("language_translation"):
            parent_node = child
            break

    if not parent_node:
        parent_node = {
            "expanded": False,
            "folder": True,
            "key": language_original,
            "title": get_language_title(language_original),
            "data": {
                "language_original": language_original,
                "language_translation": ""
            },
            "children": []
        }
        categories_data["children"].append(parent_node)
        created_parent = True
    else:
        parent_node.setdefault("children", [])

    if language_translation:
        pair_node = None
        for child in parent_node["children"]:
            data = child.get("data", {})
            if data.get("language_original") == language_original and data.get("language_translation") == language_translation:
                pair_node = child
                break

        if not pair_node:
            pair_node = {
                "expanded": False,
                "folder": True,
                "key": f"{language_original}{language_translation}",
                "title": f"{language_original}=>{language_translation}",
                "data": {
                    "language_original": language_original,
                    "language_translation": language_translation,
                    "dictations": []
                },
                "children": []
            }
            parent_node["children"].append(pair_node)
            created_pair = True
        else:
            pair_node.setdefault("data", {})
            pair_node["data"].setdefault("dictations", [])
            pair_node.setdefault("children", [])

    return created_parent, created_pair


# Получаем путь к директории, где находится index.py
current_dir = os.path.dirname(os.path.abspath(__file__))
# Строим путь к categories.json относительно расположения index.py
categories_path = os.path.join(current_dir, '..', 'static', 'data', 'categories.json')
categories_path = os.path.normpath(categories_path)  # Нормализуем путь


def load_categories():
    try:
        with open(categories_path, 'r', encoding='utf-8') as f:
            categories_data = json.load(f)
            print(f"✅ Категории загружены: {len(categories_data.get('children', []))} языковых групп")
            return categories_data
    except Exception as e:
        print(f"❌ Ошибка загрузки categories.json: {e}")
        return {"children": []}


def save_categories(categories_data):
    with open(categories_path, 'w', encoding='utf-8') as f:
        json.dump(categories_data, f, ensure_ascii=False, indent=2)


def iter_nodes(node):
    yield node
    for child in node.get("children", []) or []:
        yield from iter_nodes(child)


def find_node_and_parent(node, key, parent=None):
    if node.get("key") == key:
        return node, parent
    for child in node.get("children", []) or []:
        found, parent_found = find_node_and_parent(child, key, node)
        if found:
            return found, parent_found
    return None, None


def find_path_to_key(node, key, path=None):
    path = [] if path is None else path
    path.append(node)
    if node.get("key") == key:
        return path
    for child in node.get("children", []) or []:
        result = find_path_to_key(child, key, path.copy())
        if result:
            return result
    return None


def resolve_language_context(categories_data, key):
    path = find_path_to_key(categories_data, key)
    if not path:
        return None, None

    for node in reversed(path):
        data = node.get("data") or {}
        lang_original = data.get("language_original")
        lang_translation = data.get("language_translation")
        if lang_original and lang_translation:
            return lang_original, lang_translation
    return None, None


def find_dictation_languages(categories_data, dictation_id):
    """
    Находит языковую пару (оригинальный / перевод) для указанного dictation_id
    """
    if not dictation_id:
        return None, None

    for node in iter_nodes(categories_data):
        data = node.get("data") or {}
        dictations = data.get("dictations")
        if isinstance(dictations, list) and dictation_id in dictations:
            lang_original = data.get("language_original")
            lang_translation = data.get("language_translation")
            return lang_original, lang_translation

    return None, None


def generate_category_key(parent_key, existing_keys):
    base = f"{parent_key}_"
    counter = 0
    while True:
        candidate = f"{base}{counter:05d}"
        if candidate not in existing_keys:
            return candidate
        counter += 1


def collect_existing_keys(categories_data):
    return {node.get("key") for node in iter_nodes(categories_data)}


def count_dictations(node):
    total = 0
    data = node.get("data") or {}
    dictations = data.get("dictations")
    if isinstance(dictations, list):
        total += len(dictations)
    for child in node.get("children", []) or []:
        total += count_dictations(child)
    return total


def remove_dictation_from_node(node, dictation_id):
    data = node.get("data") or {}
    dictations = data.get("dictations")
    if isinstance(dictations, list) and dictation_id in dictations:
        data["dictations"] = [d for d in dictations if d != dictation_id]
        node["data"] = data
        return True
    return False


def remove_dictation_from_categories(categories_data, dictation_id):
    removed = 0

    def _walk(node):
        nonlocal removed
        if remove_dictation_from_node(node, dictation_id):
            removed += 1
        for child in node.get("children", []) or []:
            _walk(child)

    _walk(categories_data)
    return removed


def add_dictation_to_category(node, dictation_id):
    node.setdefault("data", {})
    dictations = node["data"].setdefault("dictations", [])
    if dictation_id not in dictations:
        dictations.append(dictation_id)


def find_categories_for_dictation(node, dictation_id, result=None):
    result = [] if result is None else result
    data = node.get("data") or {}
    dictations = data.get("dictations")
    if isinstance(dictations, list) and dictation_id in dictations:
        result.append(node)
    for child in node.get("children", []) or []:
        find_categories_for_dictation(child, dictation_id, result)
    return result


@index_bp.route("/api/categories/ensure-language-pair", methods=["POST"])
def ensure_language_pair():
    payload = request.get_json(silent=True) or {}
    language_original = (payload.get("language_original") or "").strip().lower()
    language_translation = (payload.get("language_translation") or "").strip().lower()

    if not language_original:
        return jsonify({"success": False, "error": "language_original is required"}), 400

    if not language_translation:
        return jsonify({"success": False, "error": "language_translation is required"}), 400

    try:
        with open(categories_path, 'r', encoding='utf-8') as f:
            categories_data = json.load(f)
    except Exception as e:
        print(f"❌ Ошибка загрузки categories.json: {e}")
        return jsonify({"success": False, "error": "Failed to load categories.json"}), 500

    created_parent, created_pair = ensure_language_pair_nodes(
        categories_data,
        language_original,
        language_translation
    )

    if created_parent or created_pair:
        try:
            with open(categories_path, 'w', encoding='utf-8') as f:
                json.dump(categories_data, f, ensure_ascii=False, indent=2)
            print(f"✅ Добавлена языковая пара {language_original} => {language_translation} в categories.json")
        except Exception as e:
            print(f"❌ Ошибка сохранения categories.json: {e}")
            return jsonify({"success": False, "error": "Failed to save categories.json"}), 500

    return jsonify({
        "success": True,
        "created_parent": created_parent,
        "created_pair": created_pair
    })


@index_bp.route("/api/categories/tree", methods=["GET"])
def get_categories_tree():
    categories_data = load_categories()
    return jsonify(categories_data)


@index_bp.route("/api/categories/add", methods=["POST"])
def add_category():
    payload = request.get_json(silent=True) or {}
    parent_key = (payload.get("parent_key") or "").strip()
    title = (payload.get("title") or "").strip() or "Новая категория"

    if not parent_key:
        return jsonify({"success": False, "error": "parent_key is required"}), 400

    categories_data = load_categories()
    parent_node, _ = find_node_and_parent(categories_data, parent_key)

    if not parent_node:
        return jsonify({"success": False, "error": "Parent node not found"}), 404

    lang_original, lang_translation = resolve_language_context(categories_data, parent_key)

    if not lang_original or not lang_translation:
        return jsonify({
            "success": False,
            "error": "Новые категории можно создавать только внутри языковой пары"
        }), 400

    existing_keys = collect_existing_keys(categories_data)
    new_key = generate_category_key(parent_key, existing_keys)

    new_node = {
        "expanded": False,
        "folder": True,
        "key": new_key,
        "title": title,
        "data": {
            "language_original": lang_original,
            "language_translation": lang_translation,
            "dictations": []
        },
        "children": []
    }

    parent_node.setdefault("children", []).append(new_node)
    save_categories(categories_data)

    return jsonify({
        "success": True,
        "node": new_node
    })


@index_bp.route("/api/categories/<string:key>", methods=["PATCH"])
def rename_category(key):
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()

    if not title:
        return jsonify({"success": False, "error": "title is required"}), 400

    categories_data = load_categories()
    node, _ = find_node_and_parent(categories_data, key)

    if not node:
        return jsonify({"success": False, "error": "Category not found"}), 404

    node["title"] = title
    save_categories(categories_data)

    return jsonify({"success": True, "node": node})


@index_bp.route("/api/categories/<string:key>", methods=["DELETE"])
def delete_category(key):
    categories_data = load_categories()
    node, parent = find_node_and_parent(categories_data, key)

    if not node or not parent:
        return jsonify({"success": False, "error": "Категория не найдена или является корневой"}), 400

    if count_dictations(node) > 0:
        return jsonify({
            "success": False,
            "error": "Нельзя удалить категорию, содержащую диктанты"
        }), 400

    children = parent.get("children", [])
    parent["children"] = [child for child in children if child.get("key") != key]
    save_categories(categories_data)

    return jsonify({"success": True})


@index_bp.route("/api/dictations/move", methods=["POST"])
def move_dictation_between_categories():
    payload = request.get_json(silent=True) or {}
    dictation_id = (payload.get("dictation_id") or "").strip()
    source_key = (payload.get("source_category_key") or "").strip()
    target_key = (payload.get("target_category_key") or "").strip()

    if not dictation_id or not source_key or not target_key:
        return jsonify({"success": False, "error": "Missing required parameters"}), 400

    categories_data = load_categories()
    source_node, _ = find_node_and_parent(categories_data, source_key)
    target_node, _ = find_node_and_parent(categories_data, target_key)

    if not source_node or not target_node:
        return jsonify({"success": False, "error": "Категория источника или назначения не найдена"}), 404

    if not remove_dictation_from_node(source_node, dictation_id):
        return jsonify({"success": False, "error": "Dictation not found in source category"}), 404

    add_dictation_to_category(target_node, dictation_id)
    save_categories(categories_data)

    return jsonify({"success": True})


@index_bp.route("/api/dictations/<string:dictation_id>", methods=["DELETE"])
@jwt_required()
def delete_dictation(dictation_id):
    dictation_id = dictation_id.strip()
    if not dictation_id:
        return jsonify({"success": False, "error": "dictation_id is required"}), 400

    from helpers.db_dictations import get_dictation_by_id, delete_dictation as delete_dictation_from_db
    from helpers.db import get_db_cursor
    from helpers.b2_storage import b2_storage

    data_base = _get_static_data_base_dir()
    dictation_path = os.path.join(data_base, "dictations", dictation_id)
    temp_path = os.path.join(data_base, "temp", dictation_id)

    # 1. Удаляем из categories.json
    categories_data = load_categories()
    removed_refs = remove_dictation_from_categories(categories_data, dictation_id)
    save_categories(categories_data)

    # 2. Удаляем из БД (dictation_id может быть в формате "dict_41" или просто "41")
    removed_from_db = False
    removed_desk_refs = False
    removed_book_refs = False
    try:
        # Пробуем извлечь числовой ID: убираем префикс dict_ если есть
        db_id_str = dictation_id.replace('dict_', '')
        db_id = int(db_id_str)

        # Ownership check
        try:
            current_email = get_jwt_identity()
            user = get_user_by_email(current_email) if current_email else None
            if not user:
                return jsonify({"success": False, "error": "User not found"}), 404

            d = get_dictation_by_id(db_id)
            if not d:
                return jsonify({"success": False, "error": "Dictation not found"}), 404

            owner_id = d.get('owner_id')
            if not owner_id or int(owner_id) != int(user.get('id')):
                return jsonify({"success": False, "error": "Forbidden"}), 403
        except Exception as e:
            logger.warning("delete_dictation ownership check failed: %s", e)
            return jsonify({"success": False, "error": "Forbidden"}), 403

        # Remove references so the dictation cannot re-appear on any user's desk / in any book.
        try:
            conn, cur = get_db_cursor()
            try:
                # Remove user progress/history from history_by_day
                try:
                    cur.execute("DELETE FROM history_by_day WHERE dictation_id = %s", (db_id,))
                except Exception:
                    pass

                # Remove sentences explicitly in case DB is missing ON DELETE CASCADE.
                try:
                    cur.execute("DELETE FROM dictation_sentences WHERE dictation_id = %s", (db_id,))
                except Exception:
                    pass

                cur.execute("DELETE FROM desk_items WHERE dictation_id = %s", (db_id,))
                removed_desk_refs = cur.rowcount > 0
                cur.execute("DELETE FROM book_dictations WHERE dictation_id = %s", (db_id,))
                removed_book_refs = cur.rowcount > 0
                conn.commit()
            finally:
                cur.close()
                conn.close()
        except Exception as e:
            logger.warning("Не удалось удалить ссылки из desk_items/book_dictations: %s", e)

        removed_from_db = delete_dictation_from_db(db_id)
    except (ValueError, Exception) as e:
        logger.warning(f"Не удалось удалить из БД: {e}")

    # 3. Удаляем файлы из B2 (если B2 включен)
    removed_from_b2 = False
    if b2_storage.enabled:
        try:
            # Удаляем все файлы диктанта в B2 по prefix (B2 не умеет папки, удаляем по одному)
            try:
                deleted_media = b2_storage.delete_prefix(f"dictations/{dictation_id}/")
                if deleted_media and deleted_media > 0:
                    removed_from_b2 = True
            except Exception:
                pass

            # Удаляем каноническую обложку
            try:
                numeric_id = dictation_id.replace('dict_', '')
                cover_path = f"dictations_covers/{numeric_id}.webp"
                if b2_storage.file_exists(cover_path):
                    if b2_storage.delete_file(cover_path):
                        removed_from_b2 = True
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Не удалось удалить из B2: {e}")

    # 4. Удаляем локальные файлы
    removed_files = False
    if os.path.exists(dictation_path):
        shutil.rmtree(dictation_path)
        removed_files = True

    if os.path.exists(temp_path):
        shutil.rmtree(temp_path)

    return jsonify({
        "success": True,
        "removed_references": removed_refs,
        "removed_desk_references": removed_desk_refs,
        "removed_book_references": removed_book_refs,
        "removed_from_db": removed_from_db,
        "removed_from_b2": removed_from_b2,
        "removed_files": removed_files
    })


@index_bp.route("/api/dictations/<string:dictation_id>/export", methods=["GET"])
def export_dictation(dictation_id):
    dictation_id = dictation_id.strip()
    if not dictation_id:
        return jsonify({"success": False, "error": "dictation_id is required"}), 400

    data_base = _get_static_data_base_dir()
    dictation_path = os.path.join(data_base, "dictations", dictation_id)

    if not os.path.exists(dictation_path):
        return jsonify({"success": False, "error": "Dictation not found"}), 404

    categories_data = load_categories()
    category_nodes = find_categories_for_dictation(categories_data, dictation_id)

    language_original = None
    language_translation = None
    category_keys = []

    if category_nodes:
        category_keys = [node.get("key") for node in category_nodes if node.get("key")]
        lang_data = category_nodes[0].get("data") or {}
        language_original = lang_data.get("language_original")
        language_translation = lang_data.get("language_translation")

    metadata = {
        "dictation_id": dictation_id,
        "category_keys": category_keys,
        "language_original": language_original,
        "language_translation": language_translation,
        "exported_at": datetime.datetime.utcnow().isoformat() + "Z",
        "version": 1
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for root_dir, _, files in os.walk(dictation_path):
            for filename in files:
                file_path = os.path.join(root_dir, filename)
                arcname = os.path.relpath(file_path, dictation_path)
                archive.write(file_path, arcname)
        archive.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))

    buffer.seek(0)
    download_name = f"{dictation_id}.zip"
    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=download_name
    )


@index_bp.route("/api/dictations/import", methods=["POST"])
def import_dictation():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "Не выбран файл"}), 400

    upload_file = request.files["file"]
    if upload_file.filename == "":
        return jsonify({"success": False, "error": "Не выбран файл"}), 400

    target_category_key = (request.form.get("target_category_key") or "").strip()
    overwrite = (request.form.get("overwrite") or "").lower() == "true"

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                with zipfile.ZipFile(upload_file.stream) as archive:
                    archive.extractall(tmpdir)
            except zipfile.BadZipFile:
                return jsonify({"success": False, "error": "Файл не является ZIP-архивом"}), 400

            metadata_path = os.path.join(tmpdir, "metadata.json")
            metadata = {}
            if os.path.exists(metadata_path):
                with open(metadata_path, "r", encoding="utf-8") as meta_file:
                    metadata = json.load(meta_file)

            dictation_id = (metadata.get("dictation_id") or "").strip()
            if not dictation_id:
                dictation_id = f"dicta_{int(datetime.datetime.utcnow().timestamp() * 1000)}"

            source_category_keys = metadata.get("category_keys") or []
            language_original = metadata.get("language_original")
            language_translation = metadata.get("language_translation")

            if not target_category_key:
                target_category_key = source_category_keys[0] if source_category_keys else ""

            if not target_category_key:
                return jsonify({"success": False, "error": "Не указана целевая категория"}), 400

            data_base = _get_static_data_base_dir()
            dest_path = os.path.join(data_base, "dictations", dictation_id)

            if os.path.exists(dest_path):
                if overwrite:
                    shutil.rmtree(dest_path)
                else:
                    return jsonify({
                        "success": False,
                        "error": "Диктант с таким идентификатором уже существует",
                        "dictation_id": dictation_id
                    }), 409

            os.makedirs(dest_path, exist_ok=True)

            for item_name in os.listdir(tmpdir):
                if item_name == "metadata.json":
                    continue
                src_path = os.path.join(tmpdir, item_name)
                dst_path = os.path.join(dest_path, item_name)
                if os.path.isdir(src_path):
                    shutil.copytree(src_path, dst_path)
                else:
                    shutil.copy2(src_path, dst_path)

            categories_data = load_categories()

            if language_original and language_translation:
                ensure_language_pair_nodes(categories_data, language_original, language_translation)

            target_node, _ = find_node_and_parent(categories_data, target_category_key)
            if not target_node:
                return jsonify({"success": False, "error": "Целевая категория не найдена"}), 404

            add_dictation_to_category(target_node, dictation_id)
            save_categories(categories_data)

            return jsonify({
                "success": True,
                "dictation_id": dictation_id,
                "category_key": target_category_key
            })

    except Exception as exc:
        print(f"❌ Ошибка импорта диктанта: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500
@index_bp.route('/')
def index():
    """Главная страница - показываем desktop
    Не требует авторизации - данные загружаются через API на фронтенде
    """
    return render_template("desktop.html")


@index_bp.route('/reset-password')
def reset_password_page():
    token = (request.args.get('token') or '').strip()
    if not token:
        return redirect('/')
    return redirect('/?reset_token=' + token)


@index_bp.route('/join-group/<string:token>')
def join_group_link(token: str):
    try:
        t = str(token or '').strip()
    except Exception:
        t = ''
    if not t:
        return redirect('/')
    return redirect('/?join_group=' + t)


@index_bp.route('/api/app-cache-revision')
def app_cache_revision():
    return jsonify({
        'success': True,
        'revision': get_app_cache_revision(),
    })



# Функция для загрузки категорий
def load_categories():
    try:
        with open(categories_path, 'r', encoding='utf-8') as f:
            categories_data = json.load(f)
            print(f"✅ Категории загружены: {len(categories_data.get('children', []))} языковых групп")
            return categories_data
    except Exception as e:
        print(f"❌ Ошибка загрузки categories.json: {e}")
        # Возвращаем пустую структуру в случае ошибки
        return {"children": []}


@index_bp.route("/dictations-list")
def dictations_list():
    """Получает список диктантов из БД по ID из categories.json"""
    from helpers.db_dictations import get_dictation_by_id, get_dictation_sentences
    
    result = []
    categories_data = load_categories()
    
    # Собираем все ID диктантов из categories.json
    def collect_dictation_ids(node):
        ids = []
        if 'data' in node and 'dictations' in node['data']:
            ids.extend(node['data']['dictations'])
        if 'children' in node:
            for child in node['children']:
                ids.extend(collect_dictation_ids(child))
        return ids
    
    dictation_ids = collect_dictation_ids(categories_data)
    
    # Обрабатываем каждый ID (формат dict_<id>)
    for dictation_id_str in dictation_ids:
        try:
            if not dictation_id_str.startswith('dict_'):
                continue  # Пропускаем неверный формат
            
            # Извлекаем ID из БД
            db_id = int(dictation_id_str.replace('dict_', ''))
            dictation = get_dictation_by_id(db_id)
            
            if not dictation:
                continue
            
            # Получаем языки из предложений
            sentences = get_dictation_sentences(db_id)
            languages = set()
            for sentence in sentences:
                languages.add(sentence['language_code'])
            
            languages_list = sorted(list(languages))
            language_original = dictation['language_code']
            language_translation = languages_list[1] if len(languages_list) > 1 else (languages_list[0] if languages_list else '')
            
            # Считаем количество предложений для языка оригинала
            sentences_count = len([s for s in sentences if s['language_code'] == language_original])
            
            # Получаем обложку
            cover_url = get_cover_url_for_id(dictation_id_str, language_original)
            
            result.append({
                "id": dictation_id_str,  # dict_<id>
                "db_id": db_id,  # ID из БД
                "title": dictation['title'],
                "language": language_original,
                "language_original": language_original,
                "language_translation": language_translation,
                "translations": language_translation,
                "level": dictation['level'],
                "cover_url": cover_url,
                "sentences_count": sentences_count,
                "author_materials_url": dictation.get('author_materials_url')
            })
            
        except (ValueError, Exception) as e:
            print(f"⚠️ Ошибка при обработке диктанта {dictation_id_str}: {e}")
            continue

    return jsonify(result)  



def get_cover_url_for_id(dictation_id, language=None):
    """
    Получает URL обложки для диктанта.
    Поддерживает новый формат dict_<id> и старый dicta_XXX (для обратной совместимости).
    
    1) Сначала ищем индивидуальную обложку в папке диктанта:
       static/data/dictations/{dictation_id}/cover.(webp|png|jpg|jpeg)
    2) Если нет — смотрим стандартные обложки по языку:
       static/data/covers/cover_<lang>.(webp|png|...)
    3) Если и их нет — пробуем global fallback:
       static/data/covers/cover.webp
    4) Если и этого нет — возвращаем окончательный плейсхолдер:
       /static/images/cover_en.webp
    """
    from helpers.b2_storage import b2_storage

    # нормализуем id (иногда с фронта/из БД прилетает числовой id)
    raw_id = "" if dictation_id is None else str(dictation_id).strip()
    if raw_id and not raw_id.startswith("dict_") and not raw_id.startswith("dicta_"):
        # поддерживаем старый числовой формат: 15 -> dict_15
        if raw_id.isdigit():
            raw_id = f"dict_{raw_id}"

    dictation_id = raw_id

    data_base = _get_static_data_base_dir()
    covers_folder = os.path.join(data_base, "covers")

    # Option A: пользовательские обложки диктантов живут только в B2.
    if b2_storage.enabled and dictation_id and dictation_id.startswith('dict_'):
        numeric_id = dictation_id.split('_', 1)[1]
        remote_path_new = f"dictations_covers/{numeric_id}.webp"
        try:
            if b2_storage.file_exists(remote_path_new, raise_on_error=True):
                return f"/api/dictations_covers/{numeric_id}.webp"
        except Exception:
            logger.error("B2 cover check failed for %s", remote_path_new, exc_info=True)
            # Важно: при временной недоступности B2 не «залипаем» на дефолтной обложке.
            # Возвращаем канонический URL, чтобы фронт:
            # - во время outage показал дефолт через onerror
            # - после восстановления хранилища загрузил реальную обложку без ручной очистки кеша.
            return f"/api/dictations_covers/{numeric_id}.webp"

    # --- 2) языковая обложка в /static/data/covers/ ---
    if language:
        lang = str(language).lower()
        # опционально: маппинг для разных кодов (если у тебя 'ua' вместо 'uk' и т.п.)
        lang_map = {"ua": "uk"}  # пример, расширяй по необходимости
        lang = lang_map.get(lang, lang)

        lang_cover_names = [f"cover_{lang}.webp", f"cover_{lang}.png",
                            f"cover_{lang}.jpg", f"cover_{lang}.jpeg"]
        for name in lang_cover_names:
            p = os.path.join(covers_folder, name)
            if os.path.exists(p):
                return f"/static/data/covers/{name}"

    # --- 3) глобальная заглушка в /static/data/covers/ ---
    fallback_global = os.path.join(covers_folder, "cover.webp")
    if os.path.exists(fallback_global):
        return "/static/data/covers/cover.webp"

    # --- 4) последний-resort плейсхолдер в /static/data/covers/ ---
    return "/static/data/covers/cover_en.webp"


@index_bp.route('/api/dictations_covers/<int:numeric_id>.webp')
def api_get_dictation_cover_webp(numeric_id: int):
    """Получение обложки диктанта по каноническому URL (Option A: только B2)"""
    from helpers.b2_storage import b2_storage

    try:
        if not b2_storage.enabled:
            return jsonify({'error': 'B2 storage is disabled'}), 503

        if not numeric_id or numeric_id <= 0:
            return jsonify({'error': 'numeric_id parameter required'}), 400

        remote_path_new = f"dictations_covers/{numeric_id}.webp"
        try:
            exists = b2_storage.file_exists(remote_path_new, raise_on_error=True)
        except Exception:
            return jsonify({'error': 'B2 storage unavailable'}), 503

        if exists:
            import tempfile
            from flask import after_this_request

            tmp = tempfile.NamedTemporaryFile(prefix="dict_cover_", suffix=".webp", delete=False)
            tmp_path = tmp.name
            tmp.close()

            ok = b2_storage.download_file(remote_path_new, tmp_path)
            if not ok:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
                return jsonify({'error': 'Failed to download cover from B2'}), 502

            @after_this_request
            def _cleanup_tmp(response):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
                return response

            return send_from_directory(os.path.dirname(tmp_path), os.path.basename(tmp_path))

        return jsonify({'error': 'Cover not found'}), 404
    except Exception as e:
        logger.error("api_get_dictation_cover_webp error: %s", e, exc_info=True)
        return jsonify({'error': 'Internal error'}), 500