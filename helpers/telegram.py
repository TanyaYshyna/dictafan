import os
import socket

import requests
import urllib3
import urllib3.util.connection


def is_telegram_enabled() -> bool:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    return bool(token)


def _allowed_gai_family_ipv4() -> socket.AddressFamily:
    """Force IPv4-only resolution for outbound Telegram connections.

    На некоторых хостингах (в т.ч. Railway) маршрут IPv6 до внешнего мира
    отсутствует, поэтому urllib3, пытаясь подключиться по IPv6, падает с
    `[Errno 101] Network is unreachable`. Мы принудительно ограничиваем
    выбор адреса только IPv4.
    """
    return socket.AF_INET


def _build_session() -> requests.Session:
    adapter = requests.adapters.HTTPAdapter(
        max_retries=urllib3.util.retry.Retry(
            total=3,
            connect=3,
            read=2,
            status_forcelist=(500, 502, 503, 504),
            backoff_factor=0.5,
            allowed_methods=frozenset({"POST"}),
        )
    )
    session = requests.Session()
    session.mount("https://", adapter)
    return session


_session = None


def _get_session() -> requests.Session:
    """Возвращает общую сессию с IPv4-only адаптером и retry."""
    global _session
    if _session is None:
        # Монтируем адаптер до первого использования, а IPv4-форс включаем
        # через monkeypatch urllib3 только если это ещё не сделано.
        urllib3.util.connection.allowed_gai_family = _allowed_gai_family_ipv4
        _session = _build_session()
    return _session


def send_telegram_message(chat_id: int, text: str) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    resp = _get_session().post(
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
    resp = _get_session().post(
        url,
        data={"chat_id": int(chat_id)},
        files=files,
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Telegram sendVoice failed: {resp.status_code} {resp.text}")
