import secrets
from typing import Optional

from helpers.db import get_db_cursor


def generate_and_store_telegram_link_code(user_id: int) -> str:
    code = secrets.token_urlsafe(16)

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            UPDATE users
            SET telegram_link_code = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (code, user_id),
        )
        conn.commit()
        return code
    finally:
        cur.close()
        conn.close()


def link_telegram_chat_by_code(code: str, chat_id: int) -> Optional[int]:
    """Returns user_id if linked, else None."""
    code = (code or "").strip()
    if not code:
        return None

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT id
            FROM users
            WHERE telegram_link_code = %s
            LIMIT 1
            """,
            (code,),
        )
        row = cur.fetchone() or None
        if not row:
            return None

        user_id = int(row.get("id"))
        cur.execute(
            """
            UPDATE users
            SET telegram_chat_id = %s,
                telegram_enabled = TRUE,
                telegram_link_code = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (int(chat_id), user_id),
        )
        conn.commit()
        return user_id
    finally:
        cur.close()
        conn.close()


def set_user_telegram_enabled(user_id: int, enabled: bool) -> None:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            UPDATE users
            SET telegram_enabled = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (bool(enabled), int(user_id)),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def list_teacher_chat_ids_for_student_success(student_user_id: int, dictation_id: int, *, success_date_iso: str) -> list[int]:
    """Return teacher chat_ids to notify for a student's success of dictation_id on date.

    Only for:
    - active student in group_students
    - group_students.notify_teacher_on_success = TRUE
    - group has active teacher (group_teachers)
    - teacher has telegram_chat_id and telegram_enabled
    - there exists an active assignment in that group for this dictation and date range
    """
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT DISTINCT u.telegram_chat_id
            FROM group_students gs
            JOIN group_teachers gt ON gt.group_id = gs.group_id
            JOIN users u ON u.id = gt.teacher_user_id
            JOIN assignments a ON a.group_id = gs.group_id
            WHERE gs.student_user_id = %s
              AND gs.status = 'active'
              AND gs.removed_at IS NULL
              AND COALESCE(gs.notify_teacher_on_success, TRUE) = TRUE
              AND a.dictation_id = %s
              AND a.archived_at IS NULL
              AND (%s::date >= a.start_date AND %s::date <= a.end_date)
              AND u.telegram_chat_id IS NOT NULL
              AND u.telegram_enabled = TRUE
            """,
            (int(student_user_id), int(dictation_id), success_date_iso, success_date_iso),
        )
        rows = cur.fetchall() or []
        chat_ids: list[int] = []
        for r in rows:
            try:
                cid = r.get("telegram_chat_id")
                if cid is not None:
                    chat_ids.append(int(cid))
            except Exception:
                continue
        return chat_ids
    finally:
        cur.close()
        conn.close()


def get_student_and_dictation_info(student_user_id: int, dictation_id: int) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT u.username AS student_username,
                   d.title AS dictation_title,
                   d.level AS dictation_level
            FROM users u
            JOIN dictations d ON d.id = %s
            WHERE u.id = %s
            """,
            (int(dictation_id), int(student_user_id)),
        )
        row = cur.fetchone() or {}
        return {
            "student_username": row.get("student_username") or "",
            "dictation_title": row.get("dictation_title") or f"Диктант {dictation_id}",
            "dictation_level": row.get("dictation_level") or "—",
        }
    finally:
        cur.close()
        conn.close()
