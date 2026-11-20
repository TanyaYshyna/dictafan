import logging

from flask import Blueprint, jsonify, request

from helpers.db_telegram import link_telegram_chat_by_code
from helpers.telegram import send_telegram_message

logger = logging.getLogger(__name__)

telegram_bp = Blueprint("telegram", __name__, url_prefix="/api/telegram")


def _reply(chat_id: int, text: str) -> None:
    """Отправляет сообщение пользователю в Telegram, молча глотая ошибки."""
    try:
        send_telegram_message(int(chat_id), text)
    except Exception as exc:
        logger.error("Telegram reply failed: %s", exc)


@telegram_bp.route("/webhook", methods=["POST"])
def telegram_webhook():
    """Telegram webhook endpoint.

    Expected flow:
    - User sends /start <code>
    - We store chat_id into users.telegram_chat_id and enable telegram.
    - We answer the user with a short confirmation message.

    Note: Telegram will not include user email, so we bind via one-time code.
    """
    data = request.get_json(silent=True) or {}

    try:
        msg = (data.get("message") or data.get("edited_message") or {})
        text = (msg.get("text") or "").strip()
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")

        if not chat_id or not text:
            return jsonify({"success": True})

        if not text.startswith("/start"):
            return jsonify({"success": True})

        parts = text.split(maxsplit=1)
        code = parts[1].strip() if len(parts) > 1 else ""
        if not code:
            _reply(
                int(chat_id),
                "Привіт! 👋 Щоб прив'язати акаунт, надішли команду виду /start <код>.\n\n"
                "Код можна отримати на сайті в профілі: натисни «Отримати код» "
                "або просто натисни «Відкрити бота».",
            )
            return jsonify({"success": True, "linked": False})

        user_id = link_telegram_chat_by_code(code, int(chat_id))
        if not user_id:
            _reply(
                int(chat_id),
                "Не вдалося прив'язати акаунт: код не знайдено або вже використано. 🤔\n\n"
                "Повернись на сайт, натисни «Отримати код» і надішли новий код.",
            )
            return jsonify({"success": True, "linked": False})

        _reply(int(chat_id), "Готово! ✅ Telegram прив'язано до твого акаунту.")

        return jsonify({"success": True, "linked": True, "user_id": user_id})
    except Exception as exc:
        logger.error("Telegram webhook error: %s", exc)
        return jsonify({"success": True})
