import os
import smtplib
from email.message import EmailMessage
from typing import Optional


def send_email_smtp(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    host = (os.getenv('SMTP_HOST') or '').strip()
    port_str = (os.getenv('SMTP_PORT') or '').strip() or '587'
    user = (os.getenv('SMTP_USER') or '').strip()
    password = os.getenv('SMTP_PASS')
    from_email = (os.getenv('SMTP_FROM') or user or '').strip()
    use_tls = (os.getenv('SMTP_USE_TLS') or '1').strip().lower() in ('1', 'true', 'yes', 'on')
    use_ssl = (os.getenv('SMTP_USE_SSL') or '0').strip().lower() in ('1', 'true', 'yes', 'on')

    if not host or not from_email:
        raise RuntimeError('SMTP is not configured: SMTP_HOST/SMTP_FROM')
    if not password:
        raise RuntimeError('SMTP is not configured: SMTP_PASS')

    try:
        port = int(port_str)
    except Exception:
        port = 587

    msg = EmailMessage()
    msg['From'] = from_email
    msg['To'] = (to_email or '').strip().lower()
    msg['Subject'] = subject

    if html_body:
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype='html')
    else:
        msg.set_content(text_body)

    if use_ssl:
        server = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        server = smtplib.SMTP(host, port, timeout=20)

    try:
        server.ehlo()
        if use_tls and not use_ssl:
            server.starttls()
            server.ehlo()
        if user:
            server.login(user, password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass
