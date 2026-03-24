from __future__ import annotations

import secrets
from typing import Any, Optional

from .db import get_db_cursor


def create_group(owner_user_id: int, title: str, description: str | None = None) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            INSERT INTO groups (title, description)
            VALUES (%s, %s)
            RETURNING id, title, description, created_at, updated_at, archived_at
            """,
            (title, description),
        )
        group_row = cur.fetchone() or {}

        cur.execute(
            """
            INSERT INTO group_teachers (group_id, teacher_user_id, role)
            VALUES (%s, %s, 'owner')
            ON CONFLICT DO NOTHING
            """,
            (group_row["id"], owner_user_id),
        )

        conn.commit()

        return {
            "id": group_row.get("id"),
            "title": group_row.get("title"),
            "description": group_row.get("description"),
            "created_at": group_row.get("created_at").isoformat() if group_row.get("created_at") else None,
            "updated_at": group_row.get("updated_at").isoformat() if group_row.get("updated_at") else None,
            "archived_at": group_row.get("archived_at").isoformat() if group_row.get("archived_at") else None,
        }
    finally:
        cur.close()
        conn.close()


def list_pending_email_invites_for_teacher(group_id: int, teacher_user_id: int) -> list[dict]:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT 1
            FROM group_teachers
            WHERE group_id = %s AND teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        if not cur.fetchone():
            raise PermissionError("Not a group teacher")

        cur.execute(
            """
            SELECT
                gi.id,
                gi.target_email,
                gi.created_at
            FROM group_invites gi
            WHERE gi.group_id = %s
              AND gi.mode = 'email'
              AND gi.revoked_at IS NULL
              AND gi.accepted_at IS NULL
              AND gi.declined_at IS NULL
              AND (gi.expires_at IS NULL OR gi.expires_at > NOW())
              AND (gi.max_uses IS NULL OR gi.uses_count < gi.max_uses)
              AND gi.target_email IS NOT NULL
            ORDER BY gi.created_at DESC, gi.id DESC
            """,
            (group_id,),
        )
        rows = cur.fetchall() or []
        result: list[dict] = []
        for r in rows:
            result.append(
                {
                    "id": f"email_invite:{r.get('id')}",
                    "invite_id": r.get("id"),
                    "username": r.get("target_email"),
                    "email": r.get("target_email"),
                    "status": "pending",
                    "kind": "email_invite",
                    "created_at": r.get("created_at").isoformat() if r.get("created_at") else None,
                }
            )
        return result
    finally:
        cur.close()
        conn.close()


def create_group_email_invite(group_id: int, teacher_user_id: int, *, target_email: str) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT 1
            FROM group_teachers
            WHERE group_id = %s AND teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        if not cur.fetchone():
            raise PermissionError("Not a group teacher")

        email = (target_email or "").strip().lower()
        if not email:
            raise ValueError("target_email is required")

        token = secrets.token_urlsafe(24)

        cur.execute(
            """
            INSERT INTO group_invites (
                group_id,
                created_by_teacher_user_id,
                token,
                mode,
                expires_at,
                max_uses,
                target_email
            )
            VALUES (%s, %s, %s, 'email', NULL, 1, %s)
            RETURNING id, group_id, token, mode, expires_at, max_uses, uses_count, target_email, created_at, revoked_at
            """,
            (group_id, teacher_user_id, token, email),
        )
        row = cur.fetchone() or {}
        conn.commit()

        return {
            "id": row.get("id"),
            "group_id": row.get("group_id"),
            "token": row.get("token"),
            "mode": row.get("mode"),
            "expires_at": row.get("expires_at").isoformat() if row.get("expires_at") else None,
            "max_uses": row.get("max_uses"),
            "uses_count": int(row.get("uses_count") or 0),
            "target_email": row.get("target_email"),
            "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
            "revoked_at": row.get("revoked_at").isoformat() if row.get("revoked_at") else None,
        }
    finally:
        cur.close()
        conn.close()


def list_pending_email_invites_for_student(student_email: str) -> list[dict]:
    conn, cur = get_db_cursor()
    try:
        email = (student_email or "").strip().lower()
        if not email:
            return []

        cur.execute(
            """
            SELECT
                gi.id,
                gi.group_id,
                gi.target_email,
                gi.created_at,
                g.title AS group_title,
                u.username AS teacher_username
            FROM group_invites gi
            JOIN groups g ON g.id = gi.group_id
            JOIN users u ON u.id = gi.created_by_teacher_user_id
            WHERE gi.mode = 'email'
              AND gi.revoked_at IS NULL
              AND gi.accepted_at IS NULL
              AND gi.declined_at IS NULL
              AND (gi.expires_at IS NULL OR gi.expires_at > NOW())
              AND (gi.max_uses IS NULL OR gi.uses_count < gi.max_uses)
              AND LOWER(gi.target_email) = %s
            ORDER BY gi.created_at DESC, gi.id DESC
            """,
            (email,),
        )
        rows = cur.fetchall() or []
        result: list[dict] = []
        for r in rows:
            result.append(
                {
                    "id": r.get("id"),
                    "group_id": int(r.get("group_id")) if r.get("group_id") is not None else None,
                    "target_email": r.get("target_email"),
                    "created_at": r.get("created_at").isoformat() if r.get("created_at") else None,
                    "group_title": r.get("group_title"),
                    "teacher_username": r.get("teacher_username"),
                }
            )
        return result
    finally:
        cur.close()
        conn.close()


def accept_email_invite(invite_id: int, student_user_id: int, student_email: str) -> dict:
    conn, cur = get_db_cursor()
    try:
        email = (student_email or "").strip().lower()
        cur.execute(
            """
            SELECT
                gi.id,
                gi.group_id,
                gi.target_email,
                gi.expires_at,
                gi.max_uses,
                gi.uses_count,
                gi.revoked_at,
                gi.accepted_at,
                gi.declined_at
            FROM group_invites gi
            WHERE gi.id = %s AND gi.mode = 'email'
            """,
            (invite_id,),
        )
        inv = cur.fetchone() or None
        if not inv:
            raise ValueError("Invite not found")

        if inv.get("revoked_at"):
            raise ValueError("Invite revoked")
        if inv.get("accepted_at"):
            raise ValueError("Invite already accepted")
        if inv.get("declined_at"):
            raise ValueError("Invite already declined")

        target_email = (inv.get("target_email") or "").strip().lower()
        if not target_email or not email or target_email != email:
            raise ValueError("Invite is not for this email")

        expires_at = inv.get("expires_at")
        if expires_at is not None:
            cur.execute("SELECT NOW() > %s AS expired", (expires_at,))
            expired = (cur.fetchone() or {}).get("expired")
            if expired:
                raise ValueError("Invite expired")

        max_uses = inv.get("max_uses")
        uses_count = int(inv.get("uses_count") or 0)
        if max_uses is not None and uses_count >= int(max_uses):
            raise ValueError("Invite limit reached")

        group_id = inv.get("group_id")
        if not group_id:
            raise ValueError("Invite group missing")

        cur.execute(
            """
            INSERT INTO group_students (group_id, student_user_id, status)
            VALUES (%s, %s, 'active')
            ON CONFLICT (group_id, student_user_id)
            DO UPDATE SET status = 'active', removed_at = NULL, joined_at = CURRENT_TIMESTAMP
            """,
            (group_id, student_user_id),
        )

        cur.execute(
            """
            UPDATE group_invites
            SET
                uses_count = uses_count + 1,
                accepted_at = CURRENT_TIMESTAMP,
                declined_at = NULL,
                accepted_by_student_user_id = %s
            WHERE id = %s
            """,
            (student_user_id, inv.get("id")),
        )

        conn.commit()
        return {"group_id": int(group_id)}
    finally:
        cur.close()
        conn.close()


def decline_email_invite(invite_id: int, student_user_id: int, student_email: str) -> None:
    conn, cur = get_db_cursor()
    try:
        email = (student_email or "").strip().lower()
        cur.execute(
            """
            SELECT id, target_email, revoked_at, accepted_at, declined_at
            FROM group_invites
            WHERE id = %s AND mode = 'email'
            """,
            (invite_id,),
        )
        inv = cur.fetchone() or None
        if not inv:
            raise ValueError("Invite not found")

        if inv.get("revoked_at"):
            raise ValueError("Invite revoked")
        if inv.get("accepted_at"):
            raise ValueError("Invite already accepted")
        if inv.get("declined_at"):
            raise ValueError("Invite already declined")

        target_email = (inv.get("target_email") or "").strip().lower()
        if not target_email or not email or target_email != email:
            raise ValueError("Invite is not for this email")

        cur.execute(
            """
            UPDATE group_invites
            SET
                declined_at = CURRENT_TIMESTAMP,
                accepted_by_student_user_id = %s
            WHERE id = %s
            """,
            (student_user_id, inv.get("id")),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def list_my_groups(user_id: int) -> list[dict]:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT
                g.id,
                g.title,
                g.description,
                g.created_at,
                g.updated_at,
                g.archived_at,
                gt.role AS teacher_role,
                (
                    SELECT COUNT(*)::int
                    FROM group_students gs
                    WHERE gs.group_id = g.id
                      AND gs.status = 'active'
                      AND gs.removed_at IS NULL
                ) AS students_count
            FROM groups g
            JOIN group_teachers gt ON gt.group_id = g.id
            WHERE gt.teacher_user_id = %s
            ORDER BY g.archived_at NULLS FIRST, g.id DESC
            """,
            (user_id,),
        )
        rows = cur.fetchall() or []
        result = []
        for r in rows:
            result.append(
                {
                    "id": r.get("id"),
                    "title": r.get("title"),
                    "description": r.get("description"),
                    "created_at": r.get("created_at").isoformat() if r.get("created_at") else None,
                    "updated_at": r.get("updated_at").isoformat() if r.get("updated_at") else None,
                    "archived_at": r.get("archived_at").isoformat() if r.get("archived_at") else None,
                    "teacher_role": r.get("teacher_role"),
                    "students_count": int(r.get("students_count") or 0),
                }
            )
        return result
    finally:
        cur.close()
        conn.close()


def get_group_for_teacher(group_id: int, teacher_user_id: int) -> Optional[dict]:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT g.id, g.title, g.description, g.created_at, g.updated_at, g.archived_at, gt.role AS teacher_role
            FROM groups g
            JOIN group_teachers gt ON gt.group_id = g.id
            WHERE g.id = %s AND gt.teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row.get("id"),
            "title": row.get("title"),
            "description": row.get("description"),
            "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
            "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
            "archived_at": row.get("archived_at").isoformat() if row.get("archived_at") else None,
            "teacher_role": row.get("teacher_role"),
        }
    finally:
        cur.close()
        conn.close()


def update_group(group_id: int, teacher_user_id: int, updates: dict[str, Any]) -> Optional[dict]:
    allowed = {"title", "description", "archived_at"}
    fields = []
    values: list[Any] = []

    for k in ("title", "description", "archived_at"):
        if k in updates and k in allowed:
            fields.append(f"{k} = %s")
            values.append(updates[k])

    if not fields:
        return get_group_for_teacher(group_id, teacher_user_id)

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            UPDATE groups
            SET {fields}, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
              AND EXISTS (
                SELECT 1 FROM group_teachers gt
                WHERE gt.group_id = groups.id AND gt.teacher_user_id = %s
              )
            RETURNING id, title, description, created_at, updated_at, archived_at
            """.format(fields=", ".join(fields)),
            (*values, group_id, teacher_user_id),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            return None
        return {
            "id": row.get("id"),
            "title": row.get("title"),
            "description": row.get("description"),
            "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
            "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
            "archived_at": row.get("archived_at").isoformat() if row.get("archived_at") else None,
        }
    finally:
        cur.close()
        conn.close()


def create_group_invite(group_id: int, teacher_user_id: int, *, max_uses: int | None = None, expires_at: Any | None = None) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT 1
            FROM group_teachers
            WHERE group_id = %s AND teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        if not cur.fetchone():
            raise PermissionError("Not a group teacher")

        token = secrets.token_urlsafe(24)

        cur.execute(
            """
            INSERT INTO group_invites (
                group_id,
                created_by_teacher_user_id,
                token,
                mode,
                expires_at,
                max_uses
            )
            VALUES (%s, %s, %s, 'link', %s, %s)
            RETURNING id, group_id, token, mode, expires_at, max_uses, uses_count, created_at, revoked_at
            """,
            (group_id, teacher_user_id, token, expires_at, max_uses),
        )
        row = cur.fetchone() or {}
        conn.commit()

        return {
            "id": row.get("id"),
            "group_id": row.get("group_id"),
            "token": row.get("token"),
            "mode": row.get("mode"),
            "expires_at": row.get("expires_at").isoformat() if row.get("expires_at") else None,
            "max_uses": row.get("max_uses"),
            "uses_count": int(row.get("uses_count") or 0),
            "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
            "revoked_at": row.get("revoked_at").isoformat() if row.get("revoked_at") else None,
        }
    finally:
        cur.close()
        conn.close()


def get_latest_active_group_invite(group_id: int, teacher_user_id: int) -> Optional[dict]:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT 1
            FROM group_teachers
            WHERE group_id = %s AND teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        if not cur.fetchone():
            raise PermissionError("Not a group teacher")

        cur.execute(
            """
            SELECT
                gi.id,
                gi.group_id,
                gi.token,
                gi.mode,
                gi.expires_at,
                gi.max_uses,
                gi.uses_count,
                gi.created_at,
                gi.revoked_at
            FROM group_invites gi
            WHERE gi.group_id = %s
              AND gi.revoked_at IS NULL
              AND (gi.expires_at IS NULL OR gi.expires_at > NOW())
              AND (gi.max_uses IS NULL OR gi.uses_count < gi.max_uses)
            ORDER BY gi.created_at DESC, gi.id DESC
            LIMIT 1
            """,
            (group_id,),
        )
        row = cur.fetchone()
        if not row:
            return None

        return {
            "id": row.get("id"),
            "group_id": row.get("group_id"),
            "token": row.get("token"),
            "mode": row.get("mode"),
            "expires_at": row.get("expires_at").isoformat() if row.get("expires_at") else None,
            "max_uses": row.get("max_uses"),
            "uses_count": int(row.get("uses_count") or 0),
            "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
            "revoked_at": row.get("revoked_at").isoformat() if row.get("revoked_at") else None,
        }
    finally:
        cur.close()
        conn.close()


def accept_group_invite_by_token(token: str, student_user_id: int) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT id, group_id, expires_at, max_uses, uses_count, revoked_at
            FROM group_invites
            WHERE token = %s
            """,
            (token,),
        )
        inv = cur.fetchone() or None
        if not inv:
            raise ValueError("Invite not found")

        if inv.get("revoked_at"):
            raise ValueError("Invite revoked")

        expires_at = inv.get("expires_at")
        if expires_at is not None:
            cur.execute("SELECT NOW() > %s AS expired", (expires_at,))
            expired = (cur.fetchone() or {}).get("expired")
            if expired:
                raise ValueError("Invite expired")

        max_uses = inv.get("max_uses")
        uses_count = int(inv.get("uses_count") or 0)
        if max_uses is not None and uses_count >= int(max_uses):
            raise ValueError("Invite limit reached")

        group_id = inv.get("group_id")
        if not group_id:
            raise ValueError("Invite group missing")

        cur.execute(
            """
            INSERT INTO group_students (group_id, student_user_id, status)
            VALUES (%s, %s, 'active')
            ON CONFLICT (group_id, student_user_id)
            DO UPDATE SET status = 'active', removed_at = NULL, joined_at = CURRENT_TIMESTAMP
            """,
            (group_id, student_user_id),
        )

        cur.execute(
            """
            UPDATE group_invites
            SET uses_count = uses_count + 1
            WHERE id = %s
            """,
            (inv.get("id"),),
        )

        conn.commit()
        return {"group_id": int(group_id)}
    finally:
        cur.close()
        conn.close()


def get_group_invite_preview_by_token(token: str) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT
                gi.id,
                gi.group_id,
                gi.expires_at,
                gi.max_uses,
                gi.uses_count,
                gi.revoked_at,
                g.title AS group_title,
                u.username AS teacher_username
            FROM group_invites gi
            JOIN groups g ON g.id = gi.group_id
            JOIN users u ON u.id = gi.created_by_teacher_user_id
            WHERE gi.token = %s
            """,
            (token,),
        )
        row = cur.fetchone() or None
        if not row:
            raise ValueError("Invite not found")

        if row.get("revoked_at"):
            raise ValueError("Invite revoked")

        expires_at = row.get("expires_at")
        if expires_at is not None:
            cur.execute("SELECT NOW() > %s AS expired", (expires_at,))
            expired = (cur.fetchone() or {}).get("expired")
            if expired:
                raise ValueError("Invite expired")

        max_uses = row.get("max_uses")
        uses_count = int(row.get("uses_count") or 0)
        if max_uses is not None and uses_count >= int(max_uses):
            raise ValueError("Invite limit reached")

        group_id = row.get("group_id")
        if not group_id:
            raise ValueError("Invite group missing")

        return {
            "group_id": int(group_id),
            "group_title": row.get("group_title"),
            "teacher_username": row.get("teacher_username"),
        }
    finally:
        cur.close()
        conn.close()


def list_group_students_for_teacher(group_id: int, teacher_user_id: int) -> list[dict]:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT 1
            FROM group_teachers
            WHERE group_id = %s AND teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        if not cur.fetchone():
            raise PermissionError("Not a group teacher")

        cur.execute(
            """
            SELECT
                u.id AS user_id,
                u.username,
                u.email,
                gs.status,
                gs.joined_at,
                gs.removed_at
            FROM group_students gs
            JOIN users u ON u.id = gs.student_user_id
            WHERE gs.group_id = %s
              AND gs.removed_at IS NULL
            ORDER BY u.id ASC
            """,
            (group_id,),
        )
        rows = cur.fetchall() or []
        result: list[dict] = []
        for r in rows:
            result.append(
                {
                    "id": r.get("user_id"),
                    "username": r.get("username"),
                    "email": r.get("email"),
                    "status": r.get("status"),
                    "joined_at": r.get("joined_at").isoformat() if r.get("joined_at") else None,
                    "removed_at": r.get("removed_at").isoformat() if r.get("removed_at") else None,
                }
            )
        return result
    finally:
        cur.close()
        conn.close()


def soft_remove_group_student(group_id: int, teacher_user_id: int, student_user_id: int) -> None:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT 1
            FROM group_teachers
            WHERE group_id = %s AND teacher_user_id = %s
            """,
            (group_id, teacher_user_id),
        )
        if not cur.fetchone():
            raise PermissionError("Not a group teacher")

        cur.execute(
            """
            UPDATE group_students
            SET status = 'removed', removed_at = CURRENT_TIMESTAMP
            WHERE group_id = %s AND student_user_id = %s
              AND removed_at IS NULL
            """,
            (group_id, student_user_id),
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()
