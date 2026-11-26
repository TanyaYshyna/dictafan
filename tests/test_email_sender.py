"""
Юнит-тесты отправки почты через Brevo REST API.

Тесты НЕ отправляют реальные письма: requests.post подменяется заглушкой.
Проверяется:

  1. Формирование HTTP-запроса к https://api.brevo.com/v3/smtp/email
     (заголовки, payload, отправитель из переменных окружения).
  2. Успешная отправка (HTTP 2xx) завершается без исключений.
  3. Ошибка Brevo API (HTTP >= 400) поднимает RuntimeError.
  4. Сетевые ошибки requests поднимают RuntimeError.
  5. Тайм-аут requests поднимает RuntimeError.
  6. Отсутствие обязательных переменных окружения поднимает RuntimeError.
  7. HTML-часть попадает в htmlContent только при наличии.

Запуск:
    python3 -m unittest tests.test_email_sender -v
"""

import os
import sys
import unittest
from unittest import mock

_CURRENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CURRENT not in sys.path:
    sys.path.insert(0, _CURRENT)

import requests

from helpers.email_sender import BREVO_API_URL, send_email


class _FakeResponse:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


_ENV = {
    "BREVO_API_KEY": "test-api-key",
    "BREVO_SENDER_EMAIL": "noreply@dictafan.com",
    "BREVO_SENDER_NAME": "DictaFan",
}


class TestSendEmailBrevo(unittest.TestCase):
    def setUp(self):
        self.env_patch = mock.patch.dict(os.environ, _ENV, clear=False)
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()

    def test_request_url_headers_and_payload(self):
        with mock.patch("helpers.email_sender.requests.post") as post:
            post.return_value = _FakeResponse(201)

            send_email("User@Example.com", "Subject", "Hello", html_body="<b>Hi</b>")

            self.assertEqual(post.call_count, 1)
            args, kwargs = post.call_args
            self.assertEqual(args[0], BREVO_API_URL)
            self.assertEqual(kwargs["timeout"], 20)
            self.assertEqual(
                kwargs["headers"],
                {
                    "api-key": "test-api-key",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            self.assertEqual(
                kwargs["json"],
                {
                    "sender": {
                        "email": "noreply@dictafan.com",
                        "name": "DictaFan",
                    },
                    "to": [{"email": "user@example.com"}],
                    "subject": "Subject",
                    "textContent": "Hello",
                    "htmlContent": "<b>Hi</b>",
                },
            )

    def test_text_only_omits_html_content(self):
        with mock.patch("helpers.email_sender.requests.post") as post:
            post.return_value = _FakeResponse(200)

            send_email("user@example.com", "Subject", "Plain text")

            payload = post.call_args.kwargs["json"]
            self.assertNotIn("htmlContent", payload)
            self.assertEqual(payload["textContent"], "Plain text")

    def test_success_2xx_does_not_raise(self):
        with mock.patch("helpers.email_sender.requests.post") as post:
            post.return_value = _FakeResponse(202)
            send_email("user@example.com", "Subject", "Body")

    def test_api_error_raises(self):
        with mock.patch("helpers.email_sender.requests.post") as post:
            post.return_value = _FakeResponse(401, "Unauthorized")
            with self.assertRaises(RuntimeError) as ctx:
                send_email("user@example.com", "Subject", "Body")
            self.assertIn("HTTP 401", str(ctx.exception))

    def test_network_error_raises(self):
        with mock.patch("helpers.email_sender.requests.post") as post:
            post.side_effect = requests.exceptions.ConnectionError("boom")
            with self.assertRaises(RuntimeError) as ctx:
                send_email("user@example.com", "Subject", "Body")
            self.assertIn("network error", str(ctx.exception))

    def test_timeout_raises(self):
        with mock.patch("helpers.email_sender.requests.post") as post:
            post.side_effect = requests.exceptions.Timeout("slow")
            with self.assertRaises(RuntimeError) as ctx:
                send_email("user@example.com", "Subject", "Body")
            self.assertIn("timed out", str(ctx.exception))

    def test_missing_api_key_raises(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                send_email("user@example.com", "Subject", "Body")
            self.assertIn("BREVO_API_KEY", str(ctx.exception))

    def test_missing_sender_email_raises(self):
        with mock.patch.dict(os.environ, {"BREVO_API_KEY": "k"}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                send_email("user@example.com", "Subject", "Body")
            self.assertIn("BREVO_SENDER_EMAIL", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
