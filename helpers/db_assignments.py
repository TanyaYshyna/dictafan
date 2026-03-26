from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from .db import get_db_cursor


def _parse_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        # ожидаем YYYY-MM-DD
        return datetime.fromisoformat(value).date()
    raise ValueError("Invalid date")


def _ensure_teacher_of_group(cur, group_id: int, teacher_user_id: int) -> None:
    cur.execute(
        """
        SELECT 1
        FROM group_teachers gt
        JOIN groups g ON g.id = gt.group_id
        WHERE gt.group_id = %s
          AND gt.teacher_user_id = %s
          AND g.archived_at IS NULL
        """,
        (group_id, teacher_user_id),
    )
    if not cur.fetchone():
        raise PermissionError("Not a group teacher")


def _check_overlap(cur, *, group_id: int, dictation_id: int, start_date: date, end_date: date, ignore_ids: Optional[list[int]] = None) -> None:
    params: list[Any] = [group_id, dictation_id, start_date, end_date]
    ignore_sql = ""
    if ignore_ids:
        ignore_sql = " AND a.id <> ALL(%s)"
        params.append(ignore_ids)

    cur.execute(
        f"""
        SELECT 1
        FROM assignments a
        WHERE a.group_id = %s
          AND a.dictation_id = %s
          AND a.archived_at IS NULL
          AND NOT (a.end_date < %s OR a.start_date > %s)
          {ignore_sql}
        LIMIT 1
        """,
        params,
    )
    if cur.fetchone():
        raise ValueError("Assignment date range overlaps with existing assignment")


def create_assignment_period(
    group_id: int,
    dictation_id: int,
    teacher_user_id: int,
    *,
    start_date: Any,
    end_date: Any,
    required_completions: Any,
) -> dict:
    start_d = _parse_date(start_date)
    end_d = _parse_date(end_date)
    if not start_d or not end_d:
        raise ValueError("start_date and end_date are required")
    if end_d < start_d:
        raise ValueError("end_date must be >= start_date")

    try:
        req = int(required_completions)
    except Exception:
        raise ValueError("required_completions must be int")
    if req <= 0:
        raise ValueError("required_completions must be > 0")

    conn, cur = get_db_cursor()
    try:
        _ensure_teacher_of_group(cur, group_id, teacher_user_id)
        _check_overlap(cur, group_id=group_id, dictation_id=dictation_id, start_date=start_d, end_date=end_d)

        cur.execute(
            """
            INSERT INTO assignments (
                group_id,
                dictation_id,
                created_by_teacher_user_id,
                start_date,
                end_date,
                required_completions,
                created_at,
                updated_at,
                archived_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
            RETURNING id, group_id, dictation_id, created_by_teacher_user_id, start_date, end_date, required_completions, created_at, updated_at, archived_at
            """,
            (group_id, dictation_id, teacher_user_id, start_d, end_d, req),
        )
        row = cur.fetchone() or {}
        conn.commit()
        return _row_to_assignment(row)
    finally:
        cur.close()
        conn.close()


def create_assignment_days(
    group_id: int,
    dictation_id: int,
    teacher_user_id: int,
    *,
    days: list[dict],
) -> list[dict]:
    if not isinstance(days, list) or not days:
        raise ValueError("days is required")

    prepared: list[tuple[date, int]] = []
    for d in days:
        day_d = _parse_date((d or {}).get("date") or (d or {}).get("day_date"))
        if not day_d:
            raise ValueError("day date is required")
        try:
            req = int((d or {}).get("required_completions") or 1)
        except Exception:
            raise ValueError("required_completions must be int")
        if req <= 0:
            raise ValueError("required_completions must be > 0")
        prepared.append((day_d, req))

    conn, cur = get_db_cursor()
    try:
        _ensure_teacher_of_group(cur, group_id, teacher_user_id)

        # проверим пересечения по каждой дате
        for day_d, _ in prepared:
            _check_overlap(cur, group_id=group_id, dictation_id=dictation_id, start_date=day_d, end_date=day_d)

        rows: list[dict] = []
        for day_d, req in prepared:
            cur.execute(
                """
                INSERT INTO assignments (
                    group_id,
                    dictation_id,
                    created_by_teacher_user_id,
                    start_date,
                    end_date,
                    required_completions,
                    created_at,
                    updated_at,
                    archived_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                RETURNING id, group_id, dictation_id, created_by_teacher_user_id, start_date, end_date, required_completions, created_at, updated_at, archived_at
                """,
                (group_id, dictation_id, teacher_user_id, day_d, day_d, req),
            )
            row = cur.fetchone() or {}
            rows.append(_row_to_assignment(row))

        conn.commit()
        return rows
    finally:
        cur.close()
        conn.close()


def list_group_assignments_for_teacher(group_id: int, teacher_user_id: int, *, include_archived: bool = False) -> list[dict]:
    conn, cur = get_db_cursor()
    try:
        _ensure_teacher_of_group(cur, group_id, teacher_user_id)

        archived_filter = "" if include_archived else "AND a.archived_at IS NULL"
        cur.execute(
            f"""
            SELECT a.id, a.group_id, a.dictation_id, a.created_by_teacher_user_id,
                   a.start_date, a.end_date, a.required_completions,
                   a.created_at, a.updated_at, a.archived_at,
                   g.title AS group_title,
                   d.title AS dictation_title,
                   d.language_code AS dictation_language_code,
                   d.level AS dictation_level
            FROM assignments a
            JOIN groups g ON g.id = a.group_id
            JOIN dictations d ON d.id = a.dictation_id
            WHERE a.group_id = %s
              {archived_filter}
            ORDER BY a.start_date DESC, a.id DESC
            """,
            (group_id,),
        )
        rows = cur.fetchall() or []

        result: list[dict] = []
        for r in rows:
            a = _row_to_assignment(r)
            a["group_title"] = r.get("group_title")
            a["dictation_title"] = r.get("dictation_title")
            a["dictation_language_code"] = r.get("dictation_language_code")
            a["dictation_level"] = r.get("dictation_level")
            result.append(a)
        return result
    finally:
        cur.close()
        conn.close()


def archive_assignments(ids: list[int], teacher_user_id: int) -> int:
    if not ids:
        return 0

    conn, cur = get_db_cursor()
    try:
        # только те assignments, которые принадлежат группам, где учитель teacher_user_id
        cur.execute(
            """
            UPDATE assignments a
            SET archived_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE a.id = ANY(%s)
              AND a.archived_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM group_teachers gt
                JOIN groups g ON g.id = gt.group_id
                WHERE gt.group_id = a.group_id
                  AND gt.teacher_user_id = %s
                  AND g.archived_at IS NULL
              )
            """,
            (ids, teacher_user_id),
        )
        updated = cur.rowcount
        conn.commit()
        return int(updated or 0)
    finally:
        cur.close()
        conn.close()


def list_my_assignments_for_student(student_user_id: int, *, for_date: Any) -> list[dict]:
    target_date = _parse_date(for_date)
    if not target_date:
        raise ValueError("date is required")

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT a.id, a.group_id, a.dictation_id, a.created_by_teacher_user_id,
                   a.start_date, a.end_date, a.required_completions,
                   a.created_at, a.updated_at, a.archived_at,
                   g.title AS group_title,
                   d.title AS dictation_title,
                   d.language_code AS dictation_language_code,
                   d.level AS dictation_level
            FROM assignments a
            JOIN groups g ON g.id = a.group_id
            JOIN dictations d ON d.id = a.dictation_id
            WHERE a.archived_at IS NULL
              AND a.start_date <= %s
              AND a.end_date >= %s
              AND EXISTS (
                SELECT 1
                FROM group_students gs
                WHERE gs.group_id = a.group_id
                  AND gs.student_user_id = %s
                  AND gs.status = 'active'
                  AND gs.removed_at IS NULL
                  AND g.archived_at IS NULL
              )
              AND g.archived_at IS NULL
            ORDER BY a.start_date ASC, a.id ASC
            """,
            (target_date, target_date, student_user_id),
        )
        rows = cur.fetchall() or []

        result: list[dict] = []
        for r in rows:
            a = _row_to_assignment(r)

            a["group_title"] = r.get("group_title")
            a["dictation_title"] = r.get("dictation_title")
            a["dictation_language_code"] = r.get("dictation_language_code")
            a["dictation_level"] = r.get("dictation_level")

            start_d = _parse_date(a.get("start_date"))
            end_d = _parse_date(a.get("end_date"))
            is_day = (start_d == end_d) if (start_d and end_d) else False
            if is_day:
                # выполнений за конкретную дату
                cur.execute(
                    """
                    SELECT COUNT(*)::int AS cnt
                    FROM history_successes hs
                    WHERE hs.user_id = %s
                      AND hs.dictation_id = %s
                      AND hs.created_at::date = %s
                    """,
                    (student_user_id, a.get("dictation_id"), target_date),
                )
            else:
                # выполнений в период
                cur.execute(
                    """
                    SELECT COUNT(*)::int AS cnt
                    FROM history_successes hs
                    WHERE hs.user_id = %s
                      AND hs.dictation_id = %s
                      AND hs.created_at::date >= %s
                      AND hs.created_at::date <= %s
                    """,
                    (student_user_id, a.get("dictation_id"), start_d, end_d),
                )

            cnt = (cur.fetchone() or {}).get("cnt") or 0
            a["done"] = int(cnt)
            a["mode"] = "days" if is_day else "period"
            a["overdue"] = bool(end_d and (target_date > end_d))
            result.append(a)

        return result
    finally:
        cur.close()
        conn.close()


def _row_to_assignment(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "group_id": int(row.get("group_id")) if row.get("group_id") is not None else None,
        "dictation_id": int(row.get("dictation_id")) if row.get("dictation_id") is not None else None,
        "created_by_teacher_user_id": int(row.get("created_by_teacher_user_id")) if row.get("created_by_teacher_user_id") is not None else None,
        "start_date": row.get("start_date").isoformat() if row.get("start_date") else None,
        "end_date": row.get("end_date").isoformat() if row.get("end_date") else None,
        "required_completions": int(row.get("required_completions")) if row.get("required_completions") is not None else None,
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
        "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
        "archived_at": row.get("archived_at").isoformat() if row.get("archived_at") else None,
    }
