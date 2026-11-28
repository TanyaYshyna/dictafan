"""
Единый модуль чтения/записи медиа-изображений в объектном хранилище (B2/R2).

Здесь централизована ВСЯ работа с тремя видами изображений:

  - обложки диктантов:  dictations_covers/<numeric_id>.webp  (плоский ключ, не папка);
  - обложки книг:       books_covers/<book_id>.webp           (плоский ключ, не папка);
  - аватары:            avatars/user_<id>/avatar.webp + avatar_min.webp.

Правила (см. docs/b2_storage_principles.md):

1. Единственный источник истины для файла — объектное хранилище (R2/B2).
2. Локальный диск Railway используется ТОЛЬКО как read-through кеш при отдаче
   файла, а НЕ как место постоянного хранения. Никаких «дефолтных путей
   сохранения на Railway» здесь нет.
3. Чтение везде идёт по одному алгоритму «сначала кеш, потом хранилище»
   (см. get_or_fetch_local), запись — по одному алгоритму (см. upload_image).

Этот модуль заменяет три разрозненные реализации чтения/записи, которые раньше
жили в routes/index.py (обложки диктантов), routes/library.py (обложки книг) и
routes/user_routes.py (аватары).
"""

import logging
import os

from helpers.storage import get_storage

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Пути
# ----------------------------------------------------------------------

def _static_data_dir() -> str:
    """Абсолютный путь к папке static/data (read-through кеш).

    В проде данные могут жить вне репозитория — уважаем STATIC_DATA_FOLDER.
    """
    override = os.getenv("STATIC_DATA_FOLDER")
    if override:
        return override

    from flask import current_app

    static_base = current_app.static_folder or os.path.join(current_app.root_path, "static")
    return os.path.join(static_base, "data")


def dictation_cover_remote_path(numeric_id) -> str:
    """Ключ обложки диктанта в объектном хранилище (плоский, не папка)."""
    return f"dictations_covers/{numeric_id}.webp"


def dictation_cover_local_path(numeric_id) -> str:
    """Путь к обложке диктанта в локальном read-through кеше."""
    return os.path.join(_static_data_dir(), "dictations_covers", f"{numeric_id}.webp")


def book_cover_remote_path(book_id) -> str:
    """Ключ обложки книги в объектном хранилище (плоский, не папка)."""
    return f"books_covers/{book_id}.webp"


def book_cover_local_path(book_id) -> str:
    """Путь к обложке книги в локальном read-through кеше."""
    return os.path.join(_static_data_dir(), "books_covers", f"{book_id}.webp")


def avatar_remote_path(user_id, size: str = "large") -> str:
    """Ключ аватара в объектном хранилище.

    size: 'large' -> avatar.webp, иначе -> avatar_min.webp.
    """
    filename = "avatar.webp" if size == "large" else "avatar_min.webp"
    return f"avatars/user_{user_id}/{filename}"


def avatar_local_path(user_id, size: str = "large") -> str:
    """Путь к аватару в локальном read-through кеше."""
    filename = "avatar.webp" if size == "large" else "avatar_min.webp"
    return os.path.join(_static_data_dir(), "users", f"user_{user_id}", filename)


# ----------------------------------------------------------------------
# Запись
# ----------------------------------------------------------------------

def upload_image(local_path, remote_path, invalidate_local_path=None, list_prefix=None) -> bool:
    """Загружает файл изображения в объектное хранилище.

    Единственная точка записи изображений в хранилище:
      1) загрузка через активного провайдера (B2/R2);
      2) пост-верификация file_exists() (head_object) — чтобы «лог успеха»
         от upload_file() не врал, если объект на самом деле не записался;
      3) опциональный list_files() для диагностики содержимого префикса;
      4) инвалидация локального read-through кеша (если он есть) — чтобы
         первый GET после перезаписи скачал свежий файл из хранилища.

    Returns:
        True, если файл загружен (проверка существования после загрузки при
        этом только логируется и не влияет на результат), иначе False.
    """
    storage = get_storage()
    if not storage.enabled:
        logger.warning(
            "⚠️ Хранилище выключено — изображение НЕ сохранено (источник истины = R2): %s",
            remote_path,
        )
        return False

    url = storage.upload_file(local_path, remote_path)
    if not url:
        logger.warning("Не удалось загрузить изображение в хранилище: %s", remote_path)
        return False

    logger.info("✅ Изображение загружено в хранилище: %s", remote_path)

    try:
        exists = bool(storage.file_exists(remote_path))
        logger.info(
            "🔎 Проверка после загрузки: exists=%s remote_path=%s",
            exists, remote_path,
        )
    except Exception as e:
        logger.warning("⚠️ Не удалось проверить изображение после загрузки: %s", e)

    if list_prefix:
        try:
            listing = storage.list_files(list_prefix)
            logger.info(
                "🔎 Содержимое %s (%s ключей): %s",
                list_prefix, len(listing or []), listing,
            )
        except Exception as e:
            logger.warning("⚠️ Не удалось получить список %s: %s", list_prefix, e)

    if invalidate_local_path and os.path.exists(invalidate_local_path):
        try:
            os.remove(invalidate_local_path)
            logger.info("🧹 Инвалидирован локальный кеш: %s", invalidate_local_path)
        except Exception as e:
            logger.warning("⚠️ Не удалось инвалидировать локальный кеш: %s", e)

    return True


def upload_dictation_cover(numeric_id, local_src_path) -> bool:
    """Загружает обложку диктанта из локального файла в хранилище.

    local_src_path — путь к временному файлу (например, temp/<id>/cover.webp).
    Никакие локальные копии на диске Railway НЕ создаются.
    """
    return upload_image(
        local_src_path,
        dictation_cover_remote_path(numeric_id),
        invalidate_local_path=dictation_cover_local_path(numeric_id),
        list_prefix="dictations_covers/",
    )


def save_book_cover(book_id, creator_user_id, cover_file):
    """Обрабатывает и сохраняет обложку книги (200x200 webp) в хранилище.

    Returns:
        Канонический URL обложки книги или None в случае ошибки.
    """
    from PIL import Image

    if not cover_file or not getattr(cover_file, "content_type", "").startswith("image/"):
        logger.warning(
            "Файл обложки не является изображением: %s",
            getattr(cover_file, "content_type", None),
        )
        return None

    storage = get_storage()
    if not storage.enabled:
        logger.error("Storage is disabled; refusing to save book cover (Option A)")
        return None

    try:
        image = Image.open(cover_file.stream)

        # Конвертируем в RGB, если нужно (для webp).
        if image.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            background.paste(image, mask=image.split()[-1] if image.mode in ("RGBA", "LA") else None)
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        # Гарантируем размер 200x200 (на случай, если cropper не сработал).
        if image.size != (200, 200):
            image = image.resize((200, 200), Image.Resampling.LANCZOS)

        import tempfile

        tmp = tempfile.NamedTemporaryFile(prefix=f"book_{book_id}_", suffix=".webp", delete=False)
        tmp_path = tmp.name
        tmp.close()

        try:
            image.save(tmp_path, "WEBP", quality=90)
            ok = upload_image(
                tmp_path,
                book_cover_remote_path(book_id),
                invalidate_local_path=book_cover_local_path(book_id),
            )
            if ok:
                return (
                    f"/library/api/book-cover?book_id={book_id}"
                    f"&user_id={creator_user_id}&filename=cover.webp"
                )
            return None
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    except Exception as exc:
        logger.error("Ошибка сохранения обложки книги %s: %s", book_id, exc)
        return None


def save_avatar(user_id, image_file):
    """Обрабатывает и сохраняет аватар пользователя.

    Создаёт две версии (large 100x100 и small 40x40), кладёт их в локальный
    read-through кеш и загружает в объектное хранилище.

    Returns:
        (large_local_path, small_local_path) — пути в локальном кеше.
        При ошибке поднимает исключение (обрабатывается вызывающим роутом).
    """
    from PIL import Image

    if not getattr(image_file, "content_type", "").startswith("image/"):
        raise ValueError("File must be an image")

    image = Image.open(image_file.stream)

    large = image.copy()
    large.thumbnail((100, 100), Image.Resampling.LANCZOS)

    small = image.copy()
    small.thumbnail((40, 40), Image.Resampling.LANCZOS)

    large_path = avatar_local_path(user_id, "large")
    small_path = avatar_local_path(user_id, "small")

    os.makedirs(os.path.dirname(large_path), exist_ok=True)
    large.save(large_path, "WEBP", quality=85)
    small.save(small_path, "WEBP", quality=85)

    # Объектное хранилище — источник истины. Локальный кеш создан выше только
    # для немедленной отдачи; он в любой момент может быть пересоздан из хранилища.
    upload_image(large_path, avatar_remote_path(user_id, "large"))
    upload_image(small_path, avatar_remote_path(user_id, "small"))

    return large_path, small_path


# ----------------------------------------------------------------------
# Чтение
# ----------------------------------------------------------------------

def get_or_fetch_local(remote_path, local_path, tmp_prefix="media_"):
    """Единый read-through: «сначала кеш, потом хранилище».

    1) Если локальный кеш уже есть — возвращает его путь (без сети).
    2) Иначе один раз скачивает из хранилища в tmp и атомарно перемещает
       в локальный кеш.
    3) Если хранилище выключено или объекта в нём нет — возвращает None,
       и вызывающий код сам решает, какой fallback показать (404, дефолтная
       обложка, дефолтный аватар).

    Returns:
        Абсолютный путь к файлу в локальном кеше либо None.
    """
    if os.path.exists(local_path):
        return local_path

    storage = get_storage()
    if not storage.enabled:
        return None

    cache_dir = os.path.dirname(local_path)
    try:
        os.makedirs(cache_dir, exist_ok=True)
    except OSError:
        pass

    import shutil
    import tempfile

    tmp = tempfile.NamedTemporaryFile(prefix=tmp_prefix, suffix=".webp", delete=False)
    tmp_path = tmp.name
    tmp.close()

    ok = False
    try:
        ok = storage.download_file(remote_path, tmp_path)
    except Exception:
        ok = False

    if not ok:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return None

    try:
        shutil.move(tmp_path, local_path)
        return local_path
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return None
