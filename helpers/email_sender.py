import os
from typing import Optional

import requests


BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    """Отправка письма через Brevo REST API (Transactional email).

    Настройки читаются только из переменных окружения:
    - BREVO_API_KEY
    - BREVO_SENDER_EMAIL
    - BREVO_SENDER_NAME

    Успешной считается отправка только после получения HTTP-ответа 2xx.
    Ошибки Brevo API, сетевые ошибки и тайм-ауты преобразуются в RuntimeError.
    """
    api_key = (os.getenv('BREVO_API_KEY') or '').strip()
    sender_email = (os.getenv('BREVO_SENDER_EMAIL') or '').strip()
    sender_name = (os.getenv('BREVO_SENDER_NAME') or 'Dictafan').strip()

    if not api_key:
        raise RuntimeError('Brevo is not configured: BREVO_API_KEY')
    if not sender_email:
        raise RuntimeError('Brevo is not configured: BREVO_SENDER_EMAIL')

    payload = {
        'sender': {'email': sender_email, 'name': sender_name},
        'to': [{'email': (to_email or '').strip().lower()}],
        'subject': subject,
        'textContent': text_body,
    }
    if html_body:
        payload['htmlContent'] = html_body

    try:
        res = requests.post(
            BREVO_API_URL,
            headers={
                'api-key': api_key,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            json=payload,
            timeout=20,
        )
    except requests.exceptions.Timeout as exc:
        raise RuntimeError('Brevo send failed: request timed out') from exc
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f'Brevo send failed: network error: {exc}') from exc

    if not 200 <= res.status_code < 300:
        raise RuntimeError(
            f'Brevo send failed: HTTP {res.status_code}: {res.text[:500]}'
        )
