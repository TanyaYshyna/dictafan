import os
import base64
from typing import Optional

import requests


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    api_key = (os.getenv('MAILJET_API_KEY') or '').strip()
    secret_key = (os.getenv('MAILJET_SECRET_KEY') or '').strip()
    from_email = (os.getenv('MAILJET_FROM_EMAIL') or '').strip()
    from_name = (os.getenv('MAILJET_FROM_NAME') or 'Dictafan').strip()

    if not api_key or not secret_key:
        raise RuntimeError('Mailjet is not configured: MAILJET_API_KEY/MAILJET_SECRET_KEY')
    if not from_email:
        raise RuntimeError('Mailjet is not configured: MAILJET_FROM_EMAIL')

    url = 'https://api.mailjet.com/v3.1/send'
    auth_raw = f"{api_key}:{secret_key}".encode('utf-8')
    auth_b64 = base64.b64encode(auth_raw).decode('ascii')

    payload = {
        'Messages': [
            {
                'From': {'Email': from_email, 'Name': from_name},
                'To': [{'Email': (to_email or '').strip().lower()}],
                'Subject': subject,
                'TextPart': text_body,
            }
        ]
    }
    if html_body:
        payload['Messages'][0]['HTMLPart'] = html_body

    res = requests.post(
        url,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Basic {auth_b64}',
        },
        json=payload,
        timeout=20,
    )
    if res.status_code >= 400:
        raise RuntimeError(f"Mailjet send failed: HTTP {res.status_code}: {res.text[:500]}")
