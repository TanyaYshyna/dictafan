"""
Фасад выбора провайдера объектного хранилища (Backblaze B2 ↔ Cloudflare R2).

Единственная точка выбора провайдера — переменная окружения STORAGE_PROVIDER:

    - "b2" (значение по умолчанию) — Backblaze B2 (helpers.b2_storage);
    - "r2"                        — Cloudflare R2 (helpers.r2_storage).

Правила:

1. Если STORAGE_PROVIDER не задан или пуст — используется B2. Это гарантирует,
   что существующие Railway-переменные окружения продолжают работать без
   каких-либо изменений.
2. Невалидное значение STORAGE_PROVIDER приводит к явной ошибке
   StorageProviderError, а НЕ к тихому fallback на B2: неверная конфигурация
   должна быть видна сразу.
3. Импорты провайдеров ленивые: boto3 (нужен только для R2) не импортируется
   и не требуется в B2-инсталляциях.

Использование:

    from helpers.storage import get_storage
    storage = get_storage()
    storage.file_exists("dictations/dict_1/en/audio.mp3")

Примечание по совместимости: на этом этапе routes/скрипты всё ещё используют
`from helpers.b2_storage import b2_storage` напрямую. Переход на универсальный
`get_storage()` выполняется на следующем этапе; фасад уже готов и протестирован
независимо.
"""

import logging
import os

logger = logging.getLogger(__name__)

_VALID_PROVIDERS = ("b2", "r2")
_DEFAULT_PROVIDER = "b2"


class StorageProviderError(RuntimeError):
    """Неверно задан STORAGE_PROVIDER или провайдер не может быть выбран."""


def _provider_name() -> str:
    """Возвращает нормализованное имя провайдера или бросает StorageProviderError."""
    raw = os.getenv("STORAGE_PROVIDER")
    if raw is None or str(raw).strip() == "":
        return _DEFAULT_PROVIDER

    provider = str(raw).strip().lower()
    if provider not in _VALID_PROVIDERS:
        raise StorageProviderError(
            "Invalid STORAGE_PROVIDER=%r; expected one of %s"
            % (raw, list(_VALID_PROVIDERS))
        )
    return provider


def _resolve():
    """Создаёт и возвращает экземпляр активного провайдера (ленивый импорт)."""
    provider = _provider_name()

    if provider == "r2":
        # Ленивый импорт: boto3 требуется только при STORAGE_PROVIDER=r2.
        from helpers.r2_storage import R2Storage

        instance = R2Storage()
        logger.info("Storage provider selected: r2")
        return instance

    # По умолчанию — Backblaze B2 (существующий синглтон, без изменений).
    from helpers.b2_storage import b2_storage

    logger.info("Storage provider selected: b2")
    return b2_storage


# Ленивый синглтон: резолвится при первом обращении к get_storage().
_storage = None


def get_storage():
    """Возвращает активный провайдер хранилища (мемоизированный синглтон)."""
    global _storage
    if _storage is None:
        _storage = _resolve()
    return _storage


# Псевдоним для удобства `from helpers.storage import storage`.
# ВАЖНО: сам объект резолвится лениво при первом доступе через get_storage();
# обращение к атрибуту storage напрямую до первого вызова get_storage()
# вернёт None — используйте get_storage().
storage = None
