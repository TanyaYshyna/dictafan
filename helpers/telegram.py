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


def send_telegram_voice(chat_id: int, audio_bytes: bytes, filename: str = "audio.ogg") -> None:
    """Отправляет голосовое сообщение (voice) в Telegram-чат.

    Telegram принимает OGG-файл, закодированный в OPUS. Входные данные
    (обычно WebM/OGG из MediaRecorder) перед отправкой конвертируются
    через ffmpeg в OGG/OPUS. Если ffmpeg недоступен или конвертация
    не удалась, пробуем отправить файл как есть.
    """
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")

    payload = audio_bytes
    try:
        import subprocess
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            proc = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", "pipe:0",
                    "-c:a", "libopus",
                    "-f", "ogg",
                    tmp_path,
                ],
                input=audio_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            if proc.returncode == 0 and os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
                with open(tmp_path, "rb") as f:
                    payload = f.read()
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
    except Exception:
        pass

    url = f"https://api.telegram.org/bot{token}/sendVoice"
    files = {"voice": (filename, payload, "audio/ogg")}
    resp = requests.post(
        url,
        data={"chat_id": int(chat_id)},
        files=files,
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Telegram sendVoice failed: {resp.status_code} {resp.text}")
