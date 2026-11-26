"""
Класс R2Storage для работы с Cloudflare R2 через S3-совместимый API (boto3).

Интерфейс намеренно повторяет helpers.b2_storage.B2Storage, чтобы фасад
(helpers.storage) мог подменять один провайдер другим без изменения
вызывающего кода:

    - enabled               : bool
    - bucket_name           : str
    - bucket / client       : объект клиента (для обратной совместимости)
    - upload_file           : (local_path, remote_path) -> url | None
    - download_file         : (remote_path, local_path) -> bool
    - file_exists           : (remote_path, raise_on_error=False) -> bool
    - get_download_url      : (remote_path, valid_duration_seconds=3600) -> str | None
    - get_presigned_put_url : (remote_path, expiration=3600) -> str | None
    - list_files            : (path_prefix="") -> list[str]
    - delete_file           : (remote_path) -> bool
    - delete_prefix         : (path_prefix="") -> int
    - check_availability    : () -> bool

Отличия от B2, которые важно понимать:

1. R2 бакет НЕ делается публичным, поэтому «публичного» download URL нет.
   upload_file() возвращает presigned GET URL (аналог временной ссылки B2),
   а get_download_url() — presigned GET URL. Оба требуют действующих ключей.

2. Прямая загрузка из браузера в B2 выполняется через bucket.get_upload_url()
   + заголовки X-Bz-*. Для R2 вместо этого используется presigned PUT URL
   (метод get_presigned_put_url). Адаптация эндпоинтов и JS — следующий этап.

3. boto3 клиент создаётся с region_name="auto" (требование Cloudflare R2),
   path-style адресацией и S3v4-подписью. Повторные попытки при временных
   сетевых ошибках обеспечиваются конфигурацией botocore
   (retries: max_attempts=3, mode="standard").
"""

import logging
import mimetypes
import os

import boto3
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ConnectionClosedError,
    ConnectTimeoutError,
    EndpointConnectionError,
    NoCredentialsError,
    ReadTimeoutError,
)

logger = logging.getLogger(__name__)


def _client_error_code(exc):
    """Извлекает код ошибки S3 из ClientError, не печатая сам объект ошибки."""
    try:
        return ((exc.response or {}).get("Error") or {}).get("Code")
    except Exception:
        return None


def _client_error_status(exc):
    """Извлекает HTTP-статус из ClientError."""
    try:
        return ((exc.response or {}).get("ResponseMetadata") or {}).get(
            "HTTPStatusCode"
        )
    except Exception:
        return None


class R2Storage:
    """Класс для работы с Cloudflare R2 (S3-совместимый API)."""

    @staticmethod
    def _parse_bool(value) -> bool:
        if value is None:
            return False
        return str(value).strip().lower() in {"true", "1", "yes", "y", "on"}

    def __init__(self):
        self.provider = "r2"

        self.access_key_id = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET_NAME")
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL")
        self.region_name = "auto"

        self.client = None
        # Псевдоним для обратной совместимости с проверками вида
        # `storage.bucket is not None` (в B2 это объект bucket).
        self.bucket = None

        # R2 включается фактом наличия всех обязательных переменных окружения.
        self.enabled = bool(
            self.access_key_id
            and self.secret_access_key
            and self.bucket_name
            and self.endpoint_url
        )

        if self.enabled:
            self._initialize()
        else:
            logger.warning(
                "R2 Storage is not configured: access_key_id=%s secret_access_key=%s "
                "bucket_name=%s endpoint_url=%s",
                bool(self.access_key_id),
                bool(self.secret_access_key),
                bool(self.bucket_name),
                bool(self.endpoint_url),
            )

    # ------------------------------------------------------------------
    # Инициализация / проверка доступности
    # ------------------------------------------------------------------
    def _initialize(self):
        """Создаёт boto3 S3-клиент. Локальная операция, сеть не трогает."""
        try:
            self.client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                region_name=self.region_name,
                config=Config(
                    signature_version="s3v4",
                    # Ограниченное число повторных попыток при временных
                    # сетевых ошибках / 5xx / 429 (стандартный режим botocore).
                    retries={"max_attempts": 3, "mode": "standard"},
                    s3={"addressing_style": "path"},
                ),
            )
            self.bucket = self.client
            logger.info(
                "R2 Storage initialized: bucket=%s endpoint=%s",
                self.bucket_name,
                self.endpoint_url,
            )
        except (BotoCoreError, ClientError, NoCredentialsError) as e:
            # Не выводим сообщение ошибки целиком — в нём теоретически могут
            # оказаться детали запроса. Фиксируем только тип и код.
            code = _client_error_code(e) if isinstance(e, ClientError) else None
            logger.error(
                "Failed to initialize R2 Storage: type=%s code=%s",
                type(e).__name__,
                code,
            )
            self.client = None
            self.bucket = None

    def _ensure_initialized(self) -> bool:
        """Ленивая (пере)инициализация R2 по аналогии с B2Storage."""
        try:
            if not self.enabled:
                return False
            if self.client is not None:
                return True
            if not (
                self.access_key_id
                and self.secret_access_key
                and self.bucket_name
                and self.endpoint_url
            ):
                return False
            self._initialize()
            return self.client is not None
        except Exception:
            return False

    def check_availability(self) -> bool:
        """Проверяет доступность бакета (head_bucket). Возвращает True/False.

        Не выполняет записи/удаления. При ошибке авторизации или сети
        возвращает False и логирует тип ошибки (без секретов).
        """
        if not self._ensure_initialized() or not self.client:
            return False
        try:
            self.client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError as e:
            logger.error(
                "R2 check_availability failed: code=%s status=%s",
                _client_error_code(e),
                _client_error_status(e),
            )
            return False
        except BotoCoreError as e:
            logger.error(
                "R2 check_availability failed: type=%s", type(e).__name__
            )
            return False

    # ------------------------------------------------------------------
    # Классификация ошибок (общая для всех операций)
    # ------------------------------------------------------------------
    def _is_not_found_error(self, exc) -> bool:
        if isinstance(exc, ClientError):
            status = _client_error_status(exc)
            if status == 404:
                return True
            code = str(_client_error_code(exc) or "").strip().lower()
            if code in {
                "no_such_key",
                "nosuchkey",
                "not_found",
                "notfound",
                "404",
            }:
                return True
            msg = str(exc).lower()
            if "no such key" in msg or "not found" in msg or "nosuchkey" in msg:
                return True
        return False

    def _is_auth_error(self, exc) -> bool:
        if isinstance(exc, (NoCredentialsError,)):
            return True
        if isinstance(exc, ClientError):
            status = _client_error_status(exc)
            if status in (401, 403):
                return True
            code = str(_client_error_code(exc) or "").strip().lower()
            if code in {
                "invalidaccesskeyid",
                "signaturedoesnotmatch",
                "accessdenied",
                "invalidsecurity",
                "authorizationheadermalformed",
                "invalidclienttokenid",
                "expiredtoken",
                "tokenrefresherror",
                "requesttime",
                "missingauthenticationtoken",
                "invalidtoken",
            }:
                return True
        return False

    def _is_network_error(self, exc) -> bool:
        if isinstance(
            exc,
            (
                EndpointConnectionError,
                ConnectTimeoutError,
                ReadTimeoutError,
                ConnectionClosedError,
            ),
        ):
            return True
        if isinstance(exc, ClientError):
            status = _client_error_status(exc)
            if status is not None and status >= 500:
                return True
            if status == 429:
                return True
            return False
        # urllib3/requests-подобные исключения не являются ClientError/BotoCoreError,
        # но всё равно считаются сетевыми.
        name = type(exc).__name__.lower()
        return any(
            marker in name
            for marker in ("connection", "timeout", "socket", "resolve", "remote")
        )

    # ------------------------------------------------------------------
    # Основные операции с объектами
    # ------------------------------------------------------------------
    def upload_file(self, local_path, remote_path):
        """Загружает локальный файл в R2.

        Returns:
            Presigned GET URL (аналог временной ссылки B2) или None при ошибке.
            Бакет при этом остаётся приватным — ссылка подписана.
        """
        if not self._ensure_initialized() or not self.client:
            if self.enabled and not self.client:
                logger.error(
                    "R2 Storage is enabled but client is not initialized; "
                    "cannot upload %s",
                    remote_path,
                )
            return None

        try:
            extra_args = {}
            # Явно сохраняем Content-Type при загрузке аудио/изображений/JSON:
            # boto3 не всегда угадывает тип, а при раздаче через presigned GET
            # браузер должен получить корректный заголовок.
            guessed = mimetypes.guess_type(str(remote_path))[0]
            if guessed:
                extra_args["ContentType"] = guessed
            self.client.upload_file(
                str(local_path),
                self.bucket_name,
                str(remote_path),
                ExtraArgs=extra_args or None,
            )
            logger.info("File uploaded to R2: %s", remote_path)
            return self.get_download_url(remote_path)
        except ClientError as e:
            logger.error(
                "R2 upload_file failed for %s: code=%s status=%s",
                remote_path,
                _client_error_code(e),
                _client_error_status(e),
            )
            return None
        except BotoCoreError as e:
            logger.error(
                "R2 upload_file failed for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return None

    def download_file(self, remote_path, local_path):
        """Скачивает объект из R2 в локальный файл.

        Returns:
            True если файл скачан и непустой, иначе False.
        """
        if not self._ensure_initialized() or not self.client:
            return False

        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            self.client.download_file(
                self.bucket_name, str(remote_path), str(local_path)
            )
            if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                return True
            return False
        except ClientError as e:
            logger.error(
                "R2 download_file failed for %s: code=%s status=%s",
                remote_path,
                _client_error_code(e),
                _client_error_status(e),
            )
            return False
        except BotoCoreError as e:
            logger.error(
                "R2 download_file failed for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return False
        except Exception as e:
            logger.error(
                "R2 download_file unexpected error for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return False

    def file_exists(self, remote_path, raise_on_error: bool = False):
        """Проверяет существование объекта (head_object).

        Returns:
            True если объект существует, иначе False.
            При raise_on_error=True пробрасывает не-«not found» ошибки.
        """
        if not self._ensure_initialized() or not self.client:
            return False

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=str(remote_path))
            return True
        except ClientError as e:
            if self._is_not_found_error(e):
                return False
            logger.error(
                "R2 file_exists error for %s: code=%s status=%s",
                remote_path,
                _client_error_code(e),
                _client_error_status(e),
            )
            if raise_on_error:
                raise
            return False
        except BotoCoreError as e:
            logger.error(
                "R2 file_exists error for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            if raise_on_error:
                raise
            return False

    def get_download_url(self, remote_path, valid_duration_seconds=3600):
        """Возвращает presigned GET URL на объект (временная ссылка).

        Не проверяет существование объекта: presign — локальная операция.
        """
        if not self._ensure_initialized() or not self.client:
            return None

        try:
            expires = int(valid_duration_seconds) if valid_duration_seconds else 3600
            if expires <= 0:
                expires = 3600
            return self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": str(remote_path)},
                ExpiresIn=expires,
            )
        except (ClientError, BotoCoreError) as e:
            logger.error(
                "R2 get_download_url failed for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return None

    def get_presigned_put_url(self, remote_path, expiration=3600, content_type=None):
        """Генерирует presigned PUT URL для загрузки объекта по конкретному ключу.

        Предназначен для прямой загрузки из браузера (аналог
        bucket.get_upload_url() в B2). Возвращает URL или None.

        content_type — если задан, включается в подпись (Params). Клиент
        обязан отправить PUT с ровно тем же Content-Type, иначе R2 отвергнет
        запрос по сигнатуре (SignatureDoesNotMatch).
        """
        if not self._ensure_initialized() or not self.client:
            return None

        try:
            expires = int(expiration) if expiration else 3600
            if expires <= 0:
                expires = 3600
            params = {"Bucket": self.bucket_name, "Key": str(remote_path)}
            if content_type:
                params["ContentType"] = str(content_type)
            return self.client.generate_presigned_url(
                "put_object",
                Params=params,
                ExpiresIn=expires,
                HttpMethod="PUT",
            )
        except (ClientError, BotoCoreError) as e:
            logger.error(
                "R2 get_presigned_put_url failed for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return None

    def list_files(self, path_prefix: str = ""):
        """Возвращает список ключей объектов, начинающихся с prefix (пагинация)."""
        if not self._ensure_initialized() or not self.client:
            return []
        prefix = str(path_prefix or "")
        out = []
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                for obj in page.get("Contents") or []:
                    key = obj.get("Key")
                    if key:
                        out.append(str(key))
        except ClientError as e:
            logger.error(
                "R2 list_files failed for %s: code=%s status=%s",
                prefix,
                _client_error_code(e),
                _client_error_status(e),
            )
            return []
        except BotoCoreError as e:
            logger.error(
                "R2 list_files failed for %s: type=%s",
                prefix,
                type(e).__name__,
            )
            return []
        return out

    def delete_file(self, remote_path):
        """Удаляет один объект. Возвращает True/False.

        Семантика сохранена близко к B2: если объекта нет — возвращаем False.
        """
        if not self._ensure_initialized() or not self.client:
            return False

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=str(remote_path))
        except ClientError as e:
            if self._is_not_found_error(e):
                return False
            logger.error(
                "R2 delete_file head failed for %s: code=%s status=%s",
                remote_path,
                _client_error_code(e),
                _client_error_status(e),
            )
            return False
        except BotoCoreError as e:
            logger.error(
                "R2 delete_file head failed for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return False

        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=str(remote_path))
            logger.info("File deleted from R2: %s", remote_path)
            return True
        except ClientError as e:
            logger.error(
                "R2 delete_file failed for %s: code=%s status=%s",
                remote_path,
                _client_error_code(e),
                _client_error_status(e),
            )
            return False
        except BotoCoreError as e:
            logger.error(
                "R2 delete_file failed for %s: type=%s",
                remote_path,
                type(e).__name__,
            )
            return False

    def delete_prefix(self, path_prefix: str = ""):
        """Удаляет все объекты с данным префиксом. Возвращает число удалённых.

        R2 без включённого versioning хранит только одну версию объекта,
        поэтому пакетного delete_objects достаточно (в отличие от B2,
        где приходилось удалять каждую file version).
        """
        if not self._ensure_initialized() or not self.client:
            return 0

        prefix = str(path_prefix or "")
        keys = self.list_files(prefix)
        if not keys:
            return 0

        deleted = 0
        batch_size = 1000
        for i in range(0, len(keys), batch_size):
            batch = keys[i : i + batch_size]
            try:
                resp = self.client.delete_objects(
                    Bucket=self.bucket_name,
                    Delete={
                        "Objects": [{"Key": k} for k in batch],
                        "Quiet": True,
                    },
                )
                errors = (resp or {}).get("Errors") or []
                deleted += len(batch) - len(errors)
            except ClientError as e:
                logger.error(
                    "R2 delete_prefix batch failed for %s: code=%s status=%s",
                    prefix,
                    _client_error_code(e),
                    _client_error_status(e),
                )
                continue
            except BotoCoreError as e:
                logger.error(
                    "R2 delete_prefix batch failed for %s: type=%s",
                    prefix,
                    type(e).__name__,
                )
                continue

        return deleted
