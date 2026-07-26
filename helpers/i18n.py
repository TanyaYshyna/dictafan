import json
import os
from functools import lru_cache
from typing import Any, Dict, Optional

from flask import request

from helpers.user_helpers import get_current_user


SUPPORTED_UI_LANGS = ("en", "uk", "ru", "ar", "tr")
DEFAULT_UI_LANG = "en"


def _get_i18n_dir() -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(base_dir, "..", "static", "i18n"))


@lru_cache(maxsize=16)
def _load_dict(lang: str) -> Dict[str, Any]:
    lang_norm = (lang or "").strip().lower() or DEFAULT_UI_LANG
    path = os.path.join(_get_i18n_dir(), f"{lang_norm}.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def get_ui_lang() -> str:
    try:
        cookie_lang = (request.cookies.get("ui_lang") or "").strip().lower()
        if cookie_lang in SUPPORTED_UI_LANGS:
            return cookie_lang
    except Exception:
        pass

    try:
        user = get_current_user()
        native = (user or {}).get("native_language")
        native_norm = str(native or "").strip().lower()
        if native_norm in SUPPORTED_UI_LANGS:
            return native_norm
    except Exception:
        pass

    return DEFAULT_UI_LANG


def get_ui_dir(lang: Optional[str] = None) -> str:
    lang_norm = (lang or get_ui_lang() or "").strip().lower()
    return "rtl" if lang_norm == "ar" else "ltr"


def t(key: str, params: Optional[Dict[str, Any]] = None, lang: Optional[str] = None) -> str:
    lang_norm = (lang or get_ui_lang() or "").strip().lower() or DEFAULT_UI_LANG
    params = params or {}

    def _lookup(d: Dict[str, Any], k: str) -> Optional[Any]:
        cur: Any = d
        for part in (k or "").split("."):
            if not isinstance(cur, dict):
                return None
            if part not in cur:
                return None
            cur = cur.get(part)
        return cur

    text = _lookup(_load_dict(lang_norm), key)
    if text is None and lang_norm != DEFAULT_UI_LANG:
        text = _lookup(_load_dict(DEFAULT_UI_LANG), key)

    if not isinstance(text, str):
        text = key

    try:
        return text.format(**params)
    except Exception:
        return text
