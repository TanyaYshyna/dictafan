"""
Юнит-тесты этапа 3 миграции B2 → R2.

Проверяется:
  1. B2-обратная совместимость api_b2_get_upload_url (пустой JSON `{}`).
  2. R2: выдача presigned PUT URL для конкретного ключа (provider/method/headers).
  3. R2: проверка прав доступа (владелец / чужой диктант / админ).
  4. R2: отклонение произвольных каталогов и недопустимых расширений.
  5. R2: ограниченный срок действия presigned URL (env R2_PRESIGNED_PUT_EXPIRATION).
  6. B2: ошибки get_upload_url -> 502.
  7. R2: ошибка presign -> 502.
  8. Health: реальная проверка доступности бакета (check_availability).
  9. R2Storage.get_presigned_put_url: подпись Content-Type и HttpMethod=PUT.

Тесты НЕ обращаются к реальным бакетам.
"""

import os
import sys
import types
import unittest
from unittest import mock

_CURRENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CURRENT not in sys.path:
    sys.path.insert(0, _CURRENT)


def _install_boto_stubs():
    if "boto3" in sys.modules or "botocore" in sys.modules:
        return

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
from helpers import storage as storage_facade  # noqa: E402


class _FlaskAppMixin:
    """Собирает Flask-приложение с blueprint editor_bp."""

    def _build_app(self):
        from flask import Flask
        from routes.dictation_editor import editor_bp

        app = Flask(__name__)
        app.register_blueprint(editor_bp)
        return app

    def _post_upload_url(self, app, payload, storage):
        import flask_jwt_extended.view_decorators as jwd
        import helpers.storage as facade

        with mock.patch.object(facade, "get_storage", return_value=storage), \
                mock.patch.object(jwd, "verify_jwt_in_request", return_value=None):
            client = app.test_client()
            resp = client.post("/api/b2/get_upload_url", json=payload)
            return resp, resp.get_json()


class TestB2UploadUrlBackwardCompat(_FlaskAppMixin, unittest.TestCase):
    """B2: прежний контракт (пустой `{}`) должен остаться неизменным."""

    def tearDown(self):
        storage_facade._storage = None

    def test_b2_empty_body_returns_legacy_contract(self):
        fake_bucket = mock.MagicMock()
        fake_bucket.get_upload_url.return_value = {
            "uploadUrl": "https://upload.example",
            "authorizationToken": "token",
        }
        storage = mock.MagicMock()
        storage.provider = "b2"
        storage.enabled = True
        storage.bucket = fake_bucket
        storage.bucket_name = "my-b2-bucket"

        app = self._build_app()
        resp, data = self._post_upload_url(app, {}, storage)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["provider"], "b2")
        self.assertEqual(data["method"], "POST")
        self.assertEqual(data["uploadUrl"], "https://upload.example")
        self.assertEqual(data["uploadAuthToken"], "token")
        self.assertEqual(data.get("bucket"), "my-b2-bucket")

    def test_b2_partial_body_still_returns_legacy_contract(self):
        # Старый клиент мог слать лишние поля (filename без dictation_id) —
        # для B2 это не должно ломать выдачу универсального URL.
        fake_bucket = mock.MagicMock()
        fake_bucket.get_upload_url.return_value = {
            "uploadUrl": "https://upload.example",
            "authorizationToken": "token",
        }
        storage = mock.MagicMock()
        storage.provider = "b2"
        storage.enabled = True
        storage.bucket = fake_bucket
        storage.bucket_name = "my-b2-bucket"

        app = self._build_app()
        resp, data = self._post_upload_url(app, {"filename": "a.mp3"}, storage)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["provider"], "b2")

    def test_b2_get_upload_url_error_returns_502(self):
        fake_bucket = mock.MagicMock()
        fake_bucket.get_upload_url.side_effect = RuntimeError("boom")
        storage = mock.MagicMock()
        storage.provider = "b2"
        storage.enabled = True
        storage.bucket = fake_bucket

        app = self._build_app()
        resp, data = self._post_upload_url(app, {}, storage)

        self.assertEqual(resp.status_code, 502)
        self.assertEqual(data["success"], False)


class TestR2PresignedPut(_FlaskAppMixin, unittest.TestCase):
    """R2: выдача presigned PUT URL для конкретного ключа."""

    def tearDown(self):
        storage_facade._storage = None

    def _make_r2_storage(self, presign_return):
        storage = mock.MagicMock()
        storage.provider = "r2"
        storage.enabled = True
        storage.bucket = object()
        storage.bucket_name = "test-bucket"
        storage.get_presigned_put_url = mock.MagicMock(return_value=presign_return)
        return storage

    def _patch_user_and_dictation(self, owner_id=7, user_id=7, role_code="student"):
        import contextlib
        import routes.dictation_editor as de
        import helpers.db_license as db_license

        user = {"id": user_id, "email": "u@example.com"}
        dictation = {"owner_id": owner_id}
        role = {"code": role_code}
        stack = contextlib.ExitStack()
        stack.enter_context(mock.patch.object(de, "get_jwt_identity", return_value="u@example.com"))
        stack.enter_context(mock.patch.object(de, "get_user_by_email", return_value=user))
        stack.enter_context(mock.patch.object(de, "get_dictation_by_id", return_value=dictation))
        stack.enter_context(mock.patch.object(db_license, "get_user_current_role", return_value=role))
        return stack

    def test_r2_returns_presigned_put_contract(self):
        storage = self._make_r2_storage("https://presigned.example/put")
        app = self._build_app()

        with self._patch_user_and_dictation():
            resp, data = self._post_upload_url(
                app,
                {"dictation_id": "dict_7", "lang": "en", "filename": "audio.mp3"},
                storage,
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["success"], True)
        self.assertEqual(data["provider"], "r2")
        self.assertEqual(data["method"], "PUT")
        self.assertEqual(data["uploadUrl"], "https://presigned.example/put")
        self.assertIsNone(data["uploadAuthToken"])
        self.assertEqual(data["remotePath"], "dictations/dict_7/en/audio.mp3")
        self.assertIn("expiresIn", data)
        self.assertIn("Content-Type", data.get("headers", {}))
        self.assertEqual(data.get("bucket"), "test-bucket")

        # presign вызван с конкретным ключом, сроком и Content-Type.
        args, kwargs = storage.get_presigned_put_url.call_args
        self.assertEqual(args[0], "dictations/dict_7/en/audio.mp3")
        self.assertIn("expiration", kwargs)
        self.assertEqual(kwargs["content_type"], "audio/mpeg")

    def test_r2_presign_content_type_passed(self):
        storage = self._make_r2_storage("https://presigned.example/put")
        app = self._build_app()

        with self._patch_user_and_dictation():
            resp, data = self._post_upload_url(
                app,
                {"dictation_id": "dict_7", "lang": "en", "filename": "audio.wav"},
                storage,
            )

        self.assertEqual(resp.status_code, 200)
        _, kwargs = storage.get_presigned_put_url.call_args
        self.assertEqual(kwargs["content_type"], "audio/x-wav")

    def test_r2_requires_key_fields(self):
        storage = self._make_r2_storage("https://presigned.example/put")
        app = self._build_app()

        resp, _ = self._post_upload_url(app, {"lang": "en", "filename": "a.mp3"}, storage)
        self.assertEqual(resp.status_code, 400)

        resp, _ = self._post_upload_url(app, {"dictation_id": "dict_7", "filename": "a.mp3"}, storage)
        self.assertEqual(resp.status_code, 400)

    def test_r2_rejects_arbitrary_directory(self):
        storage = self._make_r2_storage("https://presigned.example/put")
        app = self._build_app()

        with self._patch_user_and_dictation():
            resp, data = self._post_upload_url(
                app,
                {"dictation_id": "dict_7", "lang": "../../etc", "filename": "x.mp3"},
                storage,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(storage.get_presigned_put_url.called)

    def test_r2_rejects_unsupported_extension(self):
        storage = self._make_r2_storage("https://presigned.example/put")
        app = self._build_app()

        with self._patch_user_and_dictation():
            resp, data = self._post_upload_url(
                app,
                {"dictation_id": "dict_7", "lang": "en", "filename": "evil.exe"},
                storage,
            )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(storage.get_presigned_put_url.called)

    def test_r2_presign_failure_returns_502(self):
        storage = self._make_r2_storage(None)
        app = self._build_app()

        with self._patch_user_and_dictation():
            resp, data = self._post_upload_url(
                app,
                {"dictation_id": "dict_7", "lang": "en", "filename": "a.mp3"},
                storage,
            )
        self.assertEqual(resp.status_code, 502)

    def test_r2_expiration_env_clamped(self):
        storage = self._make_r2_storage("https://presigned.example/put")
        app = self._build_app()

        with mock.patch.dict(os.environ, {"R2_PRESIGNED_PUT_EXPIRATION": "99999999"}, clear=False), \
                self._patch_user_and_dictation():
            resp, data = self._post_upload_url(
                app,
                {"dictation_id": "dict_7", "lang": "en", "filename": "a.mp3"},
                storage,
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["expiresIn"], 3600)


class TestR2AccessRights(_FlaskAppMixin, unittest.TestCase):
    """R2: права доступа — владелец разрешён, чужой диктант запрещён, админ разрешён."""

    def tearDown(self):
        storage_facade._storage = None

    def _storage(self):
        storage = mock.MagicMock()
        storage.provider = "r2"
        storage.enabled = True
        storage.bucket = object()
        storage.bucket_name = "test-bucket"
        storage.get_presigned_put_url = mock.MagicMock(return_value="https://presigned.example/put")
        return storage

    def _patch(self, owner_id, user_id, role_code):
        import contextlib
        import routes.dictation_editor as de
        import helpers.db_license as db_license
        stack = contextlib.ExitStack()
        stack.enter_context(mock.patch.object(de, "get_jwt_identity", return_value="u@example.com"))
        stack.enter_context(mock.patch.object(de, "get_user_by_email", return_value={"id": user_id, "email": "u@example.com"}))
        stack.enter_context(mock.patch.object(de, "get_dictation_by_id", return_value={"owner_id": owner_id}))
        stack.enter_context(mock.patch.object(db_license, "get_user_current_role", return_value={"code": role_code}))
        return stack

    def test_owner_allowed(self):
        with self._patch(owner_id=7, user_id=7, role_code="student"):
            resp, data = self._post_upload_url(
                self._build_app(),
                {"dictation_id": "dict_7", "lang": "en", "filename": "a.mp3"},
                self._storage(),
            )
        self.assertEqual(resp.status_code, 200)

    def test_other_user_forbidden(self):
        with self._patch(owner_id=7, user_id=9, role_code="student"):
            resp, data = self._post_upload_url(
                self._build_app(),
                {"dictation_id": "dict_7", "lang": "en", "filename": "a.mp3"},
                self._storage(),
            )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(data["error"], "Forbidden")

    def test_admin_allowed_for_other_dictation(self):
        with self._patch(owner_id=7, user_id=9, role_code="admin"):
            resp, data = self._post_upload_url(
                self._build_app(),
                {"dictation_id": "dict_7", "lang": "en", "filename": "a.mp3"},
                self._storage(),
            )
        self.assertEqual(resp.status_code, 200)


class TestHealthCheckRealAvailability(unittest.TestCase):
    """Health-эндпоинт: реальная проверка доступности бакета."""

    def tearDown(self):
        storage_facade._storage = None

    def _build_app(self):
        from flask import Flask
        from routes.dictation_editor import editor_bp
        app = Flask(__name__)
        app.register_blueprint(editor_bp)
        return app

    def test_health_ok_when_available(self):
        fake = mock.MagicMock()
        fake.provider = "r2"
        fake.enabled = True
        fake.bucket = object()
        fake.bucket_name = "test-bucket"
        fake._ensure_initialized.return_value = True
        fake.check_availability.return_value = True

        import helpers.storage as facade
        app = self._build_app()
        with mock.patch.object(facade, "get_storage", return_value=fake):
            resp = app.test_client().get("/api/b2/health")
            data = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["provider"], "r2")
        self.assertEqual(data["bucket"], "test-bucket")

    def test_health_error_when_unavailable(self):
        fake = mock.MagicMock()
        fake.provider = "b2"
        fake.enabled = True
        fake.bucket = object()
        fake.bucket_name = "test-bucket"
        fake._ensure_initialized.return_value = True
        fake.check_availability.return_value = False

        import helpers.storage as facade
        app = self._build_app()
        with mock.patch.object(facade, "get_storage", return_value=fake):
            resp = app.test_client().get("/api/b2/health")
            data = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["status"], "error")
        self.assertIn("недоступен", data["message"])


class TestR2PresignedPutMethod(unittest.TestCase):
    """R2Storage.get_presigned_put_url: подпись Content-Type и HttpMethod=PUT."""

    def test_presign_signs_content_type_and_uses_put(self):
        client = mock.MagicMock()
        client.generate_presigned_url.return_value = "https://signed"
        storage = _make_r2()
        storage.client = client
        storage.bucket = client

        url = storage.get_presigned_put_url("dictations/dict_1/en/a.mp3", expiration=600, content_type="audio/mpeg")

        self.assertEqual(url, "https://signed")
        client.generate_presigned_url.assert_called_once()
        args, kwargs = client.generate_presigned_url.call_args
        self.assertEqual(args[0], "put_object")
        self.assertEqual(kwargs["Params"], {
            "Bucket": "bucket",
            "Key": "dictations/dict_1/en/a.mp3",
            "ContentType": "audio/mpeg",
        })
        self.assertEqual(kwargs["ExpiresIn"], 600)
        self.assertEqual(kwargs["HttpMethod"], "PUT")

    def test_presign_without_content_type(self):
        client = mock.MagicMock()
        client.generate_presigned_url.return_value = "https://signed"
        storage = _make_r2()
        storage.client = client
        storage.bucket = client

        storage.get_presigned_put_url("dictations/dict_1/en/a.mp3")

        args, kwargs = client.generate_presigned_url.call_args
        self.assertNotIn("ContentType", kwargs["Params"])


def _make_r2(enabled=True, client=None):
    """Создаёт R2Storage с нужными env-переменными."""
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
    storage.client = client
    storage.bucket = client
    return storage


if __name__ == "__main__":
    unittest.main(verbosity=2)
