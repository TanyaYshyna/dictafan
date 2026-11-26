"""
Юнит-тесты этапа 2 миграции B2 → R2.

Тесты НЕ обращаются к реальным бакетам: boto3/botocore подменяются заглушками
в sys.modules (локально boto3 не установлен), b2sdk используется только для
B2Storage (он установлен). Проверяется:

  1. Классификация ошибок R2: auth/network не считаются «файл отсутствует».
  2. Частичные ошибки delete_objects (часть ключей не удалена).
  3. Сохранение Content-Type при upload_file.
  4. B2Storage._is_not_found_error.
  5. Фасад get_storage(): дефолт b2 и ошибка при невалидном STORAGE_PROVIDER.
  6. Маршруты с замоканным get_storage() для обоих провайдеров.

Запуск:
    python3 -m unittest discover -s tests -p "test_*.py" -v
"""

import os
import sys
import tempfile
import types
import unittest
from unittest import mock

# ---------------------------------------------------------------------------
# Заглушки boto3/botocore: локально эти пакеты не установлены, но
# helpers/r2_storage.py импортирует их на верхнем уровне.
# ---------------------------------------------------------------------------
_CURRENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CURRENT not in sys.path:
    sys.path.insert(0, _CURRENT)


def _install_boto_stubs():
    """Подменяет boto3/botocore лёгкими модулями-заглушками, если их нет."""
    if "boto3" in sys.modules or "botocore" in sys.modules:
        return

    # botocore.exceptions — типы исключений, которые импортирует r2_storage.
    botocore_exceptions = types.ModuleType("botocore.exceptions")

    class BotoCoreError(Exception):
        pass

    class ClientError(Exception):
        def __init__(self, response, operation_name):
            super().__init__(f"An error occurred ({operation_name})")
            self.response = response
            self.operation_name = operation_name

    class ConnectionClosedError(BotoCoreError):
        pass

    class ConnectTimeoutError(BotoCoreError):
        pass

    class EndpointConnectionError(BotoCoreError):
        pass

    class NoCredentialsError(BotoCoreError):
        pass

    class ReadTimeoutError(BotoCoreError):
        pass

    botocore_exceptions.BotoCoreError = BotoCoreError
    botocore_exceptions.ClientError = ClientError
    botocore_exceptions.ConnectionClosedError = ConnectionClosedError
    botocore_exceptions.ConnectTimeoutError = ConnectTimeoutError
    botocore_exceptions.EndpointConnectionError = EndpointConnectionError
    botocore_exceptions.NoCredentialsError = NoCredentialsError
    botocore_exceptions.ReadTimeoutError = ReadTimeoutError

    botocore = types.ModuleType("botocore")
    botocore.exceptions = botocore_exceptions

    botocore_config = types.ModuleType("botocore.config")

    class Config:
        def __init__(self, *args, **kwargs):
            self.kwargs = kwargs

    botocore_config.Config = Config
    botocore.config = botocore_config

    boto3 = types.ModuleType("boto3")

    def boto3_client(service, **kwargs):
        raise AssertionError("boto3.client должен быть замокан в тестах")

    boto3.client = boto3_client

    sys.modules["botocore.exceptions"] = botocore_exceptions
    sys.modules["botocore"] = botocore
    sys.modules["botocore.config"] = botocore_config
    sys.modules["boto3"] = boto3


_install_boto_stubs()

from helpers.r2_storage import R2Storage  # noqa: E402
from helpers.b2_storage import B2Storage  # noqa: E402
from helpers import storage as storage_facade  # noqa: E402


def _make_client_error(status=None, code=None, message=None):
    """Создаёт botocore ClientError с нужным status/code."""
    ClientError = sys.modules["botocore.exceptions"].ClientError
    response = {}
    if code is not None:
        response["Error"] = {"Code": code, "Message": message or code}
    if status is not None:
        response["ResponseMetadata"] = {"HTTPStatusCode": status}
    return ClientError(response, "SomeOperation")


def _make_r2(enabled=True, client=None):
    """Создаёт R2Storage с нужными env-переменными.

    boto3.client замокан, чтобы не создавать реального клиента.
    """
    if enabled:
        env = {
            "R2_ACCESS_KEY_ID": "key",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_BUCKET_NAME": "bucket",
            "R2_ENDPOINT_URL": "https://example.r2.cloudflarestorage.com",
        }
    else:
        env = {}
    with mock.patch.dict(os.environ, env, clear=False):
        import boto3

        with mock.patch.object(boto3, "client", return_value=mock.MagicMock()):
            storage = R2Storage()
    # Подменяем client/bucket после __init__ на явный мок.
    storage.client = client
    storage.bucket = client
    return storage


class TestR2ErrorClassification(unittest.TestCase):
    """auth/network ошибки НЕ должны считаться «файл отсутствует»."""

    def test_404_and_no_such_key_are_not_found(self):
        storage = _make_r2(enabled=False)
        self.assertTrue(storage._is_not_found_error(_make_client_error(status=404)))
        self.assertTrue(storage._is_not_found_error(_make_client_error(code="NoSuchKey")))

    def test_auth_errors_are_not_not_found(self):
        storage = _make_r2(enabled=False)
        self.assertFalse(storage._is_not_found_error(_make_client_error(status=403)))
        self.assertFalse(storage._is_not_found_error(_make_client_error(status=401)))

    def test_auth_classifier_detects_status_and_codes(self):
        storage = _make_r2(enabled=False)
        self.assertTrue(storage._is_auth_error(_make_client_error(status=403)))
        self.assertTrue(storage._is_auth_error(_make_client_error(status=401)))
        self.assertTrue(storage._is_auth_error(_make_client_error(code="AccessDenied")))
        self.assertTrue(storage._is_auth_error(_make_client_error(code="InvalidAccessKeyId")))
        NoCredentialsError = sys.modules["botocore.exceptions"].NoCredentialsError
        self.assertTrue(storage._is_auth_error(NoCredentialsError()))

    def test_network_classifier_detects_timeouts_and_5xx(self):
        storage = _make_r2(enabled=False)
        self.assertTrue(storage._is_network_error(_make_client_error(status=500)))
        self.assertTrue(storage._is_network_error(_make_client_error(status=503)))
        self.assertTrue(storage._is_network_error(_make_client_error(status=429)))
        ConnectTimeoutError = sys.modules["botocore.exceptions"].ConnectTimeoutError
        self.assertTrue(storage._is_network_error(ConnectTimeoutError()))
        self.assertFalse(storage._is_network_error(_make_client_error(status=404)))

    def test_file_exists_raises_on_auth_when_requested(self):
        client = mock.MagicMock()
        client.head_object.side_effect = _make_client_error(status=403, code="AccessDenied")
        storage = _make_r2(client=client)
        # raise_on_error=True → auth-ошибка пробрасывается, а не превращается в False.
        with self.assertRaises(Exception):
            storage.file_exists("some/key", raise_on_error=True)
        # По умолчанию (без raise_on_error) возвращаем False.
        self.assertFalse(storage.file_exists("some/key"))


class TestR2DeletePrefixPartialErrors(unittest.TestCase):
    """Проверка частичных ошибок delete_objects."""

    def test_partial_errors_are_counted_not_assumed_deleted(self):
        keys = ["a/1", "a/2", "a/3", "a/4"]
        client = mock.MagicMock()
        # list_files использует пагинатор.
        paginator = mock.MagicMock()
        paginator.paginate.return_value = [
            {"Contents": [{"Key": k} for k in keys]}
        ]
        client.get_paginator.return_value = paginator
        # delete_objects сообщает: 1 ключ из 4 не удалился.
        client.delete_objects.return_value = {
            "Errors": [{"Key": "a/2", "Code": "AccessDenied"}]
        }
        storage = _make_r2(client=client)

        deleted = storage.delete_prefix("a/")
        # 4 ключа минус 1 с ошибкой = 3.
        self.assertEqual(deleted, 3)

    def test_full_success_counts_all(self):
        client = mock.MagicMock()
        paginator = mock.MagicMock()
        paginator.paginate.return_value = [
            {"Contents": [{"Key": "b/1"}, {"Key": "b/2"}]}
        ]
        client.get_paginator.return_value = paginator
        client.delete_objects.return_value = {"Errors": []}
        storage = _make_r2(client=client)

        self.assertEqual(storage.delete_prefix("b/"), 2)

    def test_batch_client_error_is_swallowed(self):
        client = mock.MagicMock()
        paginator = mock.MagicMock()
        paginator.paginate.return_value = [
            {"Contents": [{"Key": "c/1"}]}
        ]
        client.get_paginator.return_value = paginator
        ClientError = sys.modules["botocore.exceptions"].ClientError
        client.delete_objects.side_effect = ClientError(
            {"Error": {"Code": "InternalError"}}, "DeleteObjects"
        )
        storage = _make_r2(client=client)

        # Ошибка не пробрасывается, просто ничего не удалено.
        self.assertEqual(storage.delete_prefix("c/"), 0)


class TestR2UploadContentType(unittest.TestCase):
    """Content-Type должен сохраняться для аудио/изображений/JSON."""

    def test_upload_sets_content_type(self):
        client = mock.MagicMock()
        client.generate_presigned_url.return_value = "https://presigned/url"
        storage = _make_r2(client=client)
        fd, tmp = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        with open(tmp, "wb") as f:
            f.write(b"audio-bytes")
        try:
            storage.upload_file(tmp, "dictations/dict_1/en/audio.mp3")
            kwargs = client.upload_file.call_args.kwargs
            self.assertEqual(kwargs["ExtraArgs"].get("ContentType"), "audio/mpeg")
        finally:
            os.unlink(tmp)

    def test_upload_json_content_type(self):
        client = mock.MagicMock()
        client.generate_presigned_url.return_value = "https://presigned/url"
        storage = _make_r2(client=client)
        fd, tmp = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        with open(tmp, "wb") as f:
            f.write(b"{}")
        try:
            storage.upload_file(tmp, "mult/mults.json")
            kwargs = client.upload_file.call_args.kwargs
            self.assertEqual(kwargs["ExtraArgs"].get("ContentType"), "application/json")
        finally:
            os.unlink(tmp)


class TestB2NotFoundError(unittest.TestCase):
    """B2Storage._is_not_found_error."""

    def _make_b2_error(self, status=None, code=None, msg=None):
        err = Exception(msg or "error")
        if status is not None:
            err.status = status
        if code is not None:
            err.code = code
        return err

    def test_not_found_by_status_and_code(self):
        storage = B2Storage()
        self.assertTrue(storage._is_not_found_error(self._make_b2_error(status=404)))
        self.assertTrue(storage._is_not_found_error(self._make_b2_error(code="file_not_present")))
        self.assertFalse(storage._is_not_found_error(self._make_b2_error(status=401)))


class TestStorageFacade(unittest.TestCase):
    """Фасад: дефолт b2, ошибка при невалидном провайдере."""

    def tearDown(self):
        storage_facade._storage = None

    def test_default_provider_is_b2(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("STORAGE_PROVIDER", None)
            storage = storage_facade.get_storage()
            self.assertEqual(getattr(storage, "provider", None), "b2")

    def test_invalid_provider_raises(self):
        with mock.patch.dict(os.environ, {"STORAGE_PROVIDER": "s3"}, clear=False):
            storage_facade._storage = None
            with self.assertRaises(storage_facade.StorageProviderError):
                storage_facade.get_storage()


class TestRouteHealthProviderAware(unittest.TestCase):
    """Health-эндпоинт отдаёт корректное имя провайдера для B2 и R2."""

    def _build_app(self, storage):
        from flask import Flask
        from routes.dictation_editor import editor_bp

        app = Flask(__name__)
        app.register_blueprint(editor_bp)
        return app

    def test_health_b2_message(self):
        fake = mock.MagicMock()
        fake.provider = "b2"
        fake.enabled = True
        fake.bucket = object()
        fake.bucket_name = "my-b2-bucket"
        fake._ensure_initialized.return_value = True
        fake.check_availability.return_value = True

        import helpers.storage as facade

        app = self._build_app(fake)
        with mock.patch.object(facade, "get_storage", return_value=fake):
            client = app.test_client()
            resp = client.get("/api/b2/health")
            data = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["message"], "B2 Storage работает")

    def test_health_r2_message(self):
        fake = mock.MagicMock()
        fake.provider = "r2"
        fake.enabled = True
        fake.bucket = object()
        fake.bucket_name = "my-r2-bucket"
        fake._ensure_initialized.return_value = True
        fake.check_availability.return_value = True

        import helpers.storage as facade

        app = self._build_app(fake)
        with mock.patch.object(facade, "get_storage", return_value=fake):
            client = app.test_client()
            resp = client.get("/api/b2/health")
            data = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["message"], "R2 Storage работает")


class TestRouteB2UploadUrlUnchanged(unittest.TestCase):
    """Прямая браузерная загрузка в B2 должна остаться неизменной."""

    def tearDown(self):
        import helpers.storage as facade
        facade._storage = None

    def test_get_upload_url_uses_b2_storage(self):
        from routes.dictation_editor import editor_bp
        from flask import Flask
        import helpers.storage as facade

        app = Flask(__name__)
        app.register_blueprint(editor_bp)

        fake_bucket = mock.MagicMock()
        fake_bucket.get_upload_url.return_value = {
            "uploadUrl": "https://upload.example",
            "authorizationToken": "token",
        }
        fake_storage = mock.MagicMock()
        fake_storage.provider = "b2"
        fake_storage.enabled = True
        fake_storage.bucket = fake_bucket
        fake_storage.bucket_name = "my-b2-bucket"
        # api_b2_get_upload_url теперь использует фасад get_storage().
        # Эндпоинт под @jwt_required() — отключаем проверку токена.
        import flask_jwt_extended.view_decorators as jwd

        with mock.patch.object(facade, "get_storage", return_value=fake_storage), \
                mock.patch.object(jwd, "verify_jwt_in_request", return_value=None):
            client = app.test_client()
            resp = client.post("/api/b2/get_upload_url", json={})
            data = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertIn("uploadUrl", data)
        self.assertEqual(data.get("provider"), "b2")
        self.assertEqual(data.get("method"), "POST")
        self.assertEqual(data.get("uploadAuthToken"), "token")


if __name__ == "__main__":
    unittest.main(verbosity=2)
