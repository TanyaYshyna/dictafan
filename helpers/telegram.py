import os
import requests


def is_telegram_enabled() -> bool:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    return bool(token)


def send_telegram_message(chat_id: int, text: str) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    resp = requests.post(
        url,
        json={
            "chat_id": int(chat_id),
            "text": str(text),
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Telegram sendMessage failed: {resp.status_code} {resp.text}")
