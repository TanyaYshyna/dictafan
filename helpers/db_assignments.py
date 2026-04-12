from __future__ import annotations

from datetime import date, datetime
import logging
import time
from typing import Any, Optional

from .db import get_db_cursor


logger = logging.getLogger(__name__)


MAX_ASSIGNMENT_RANGE_DAYS = 7


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


def _check_overlap_day(
    cur,
    *,
    group_id: int,
    dictation_id: int,
    day_date: date,
    selected_sentence_positions: Any = None,
    ignore_assignment_ids: Optional[list[int]] = None,
) -> None:
    params: list[Any] = [group_id, dictation_id, day_date, selected_sentence_positions]
    ignore_sql = ""
    if ignore_assignment_ids:
        ignore_sql = " AND a.id <> ALL(%s)"
        params.append(ignore_assignment_ids)

    cur.execute(
        f"""
        SELECT 1
        FROM assignments_by_date abd
        JOIN assignments a ON a.id = abd.assignment_id
        WHERE a.group_id = %s
          AND a.dictation_id = %s
          AND abd.day_date = %s
          AND a.selected_sentence_positions IS NOT DISTINCT FROM %s
          {ignore_sql}
        LIMIT 1
        """,
        params,
    )
    if cur.fetchone():
        raise ValueError("Assignment date overlaps with existing assignment")


def _validate_max_range(start_d: date, end_d: date) -> None:
    if not start_d or not end_d:
        return
    if (end_d - start_d).days > (MAX_ASSIGNMENT_RANGE_DAYS - 1):
        raise ValueError("Assignment date range must be <= 7 days")


def get_assignment_for_teacher(assignment_id: int, teacher_user_id: int) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT a.id, a.group_id, a.dictation_id, a.created_by_teacher_user_id,
                   a.selected_sentence_positions,
                   a.created_at, a.updated_at,
                   g.title AS group_title,
                   d.title AS dictation_title,
                   d.language_code AS dictation_language_code,
                   d.level AS dictation_level,
                   d.sentences_count AS dictation_sentences_count
            FROM assignments a
            JOIN groups g ON g.id = a.group_id
            JOIN dictations d ON d.id = a.dictation_id
            WHERE a.id = %s
              AND EXISTS (
                SELECT 1
                FROM group_teachers gt
                WHERE gt.group_id = a.group_id
                  AND gt.teacher_user_id = %s
              )
            """,
            (assignment_id, teacher_user_id),
        )
        r = cur.fetchone() or None
        if not r:
            raise PermissionError("Forbidden")

        a = _row_to_assignment(r)
        a["group_title"] = r.get("group_title")
        a["dictation_title"] = r.get("dictation_title")
        a["dictation_language_code"] = r.get("dictation_language_code")
        a["dictation_level"] = r.get("dictation_level")
        a["dictation_sentences_count"] = int(r.get("dictation_sentences_count") or 0)
        try:
            from routes.index import get_cover_url_for_id

            lang = a.get("dictation_language_code")
            a["dictation_cover_url"] = get_cover_url_for_id(f"dict_{a.get('dictation_id')}", lang)
        except Exception:
            a["dictation_cover_url"] = f"/static/data/covers/cover_{(a.get('dictation_language_code') or 'en')}.webp"

        cur.execute(
            """
            SELECT id, day_date, required_completions
            FROM assignments_by_date
            WHERE assignment_id = %s
            ORDER BY day_date ASC, id ASC
            """,
            (int(assignment_id),),
        )
        a["days"] = [
            {
                "id": int(rr.get("id")),
                "date": rr.get("day_date").isoformat() if rr.get("day_date") else None,
                "required_completions": int(rr.get("required_completions") or 1),
            }
            for rr in (cur.fetchall() or [])
        ]
        return a
    finally:
        cur.close()
        conn.close()


def update_assignment_for_teacher(
    assignment_id: int,
    teacher_user_id: int,
    *,
    group_id: int,
    days: list[dict],
    selected_sentence_positions: Any = None,
) -> dict:
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

    uniq_dates = sorted({d for d, _ in prepared})
    if len(uniq_dates) > MAX_ASSIGNMENT_RANGE_DAYS:
        raise ValueError("Assignment days count must be <= 7")
    if uniq_dates:
        _validate_max_range(uniq_dates[0], uniq_dates[-1])

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT a.id, a.group_id, a.dictation_id
            FROM assignments a
            WHERE a.id = %s
            """,
            (assignment_id,),
        )
        row = cur.fetchone() or None
        if not row:
            raise ValueError("Assignment not found")

        old_group_id = int(row.get("group_id"))
        dictation_id = int(row.get("dictation_id"))

        _ensure_teacher_of_group(cur, old_group_id, teacher_user_id)
        _ensure_teacher_of_group(cur, int(group_id), teacher_user_id)

        positions = selected_sentence_positions
        if isinstance(positions, list):
            prepared_pos = []
            for x in positions:
                if x is None:
                    continue
                try:
                    prepared_pos.append(int(x))
                except Exception:
                    continue
            prepared_pos = sorted({p for p in prepared_pos})
            positions = prepared_pos if prepared_pos else None
        else:
            positions = None

        for day_d, _ in prepared:
            _check_overlap_day(
                cur,
                group_id=int(group_id),
                dictation_id=dictation_id,
                day_date=day_d,
                selected_sentence_positions=positions,
                ignore_assignment_ids=[int(assignment_id)],
            )

        cur.execute(
            """
            UPDATE assignments a
            SET group_id = %s,
                selected_sentence_positions = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE a.id = %s
            RETURNING id, group_id, dictation_id, created_by_teacher_user_id, selected_sentence_positions, created_at, updated_at
            """,
            (int(group_id), positions, int(assignment_id)),
        )
        updated = cur.fetchone() or None
        if not updated:
            raise ValueError("Assignment not found")

        cur.execute(
            """
            DELETE FROM assignments_by_date
            WHERE assignment_id = %s
            """,
            (int(assignment_id),),
        )

        for day_d, req in prepared:
            cur.execute(
                """
                INSERT INTO assignments_by_date (assignment_id, day_date, required_completions, created_at, updated_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
                """,
                (int(assignment_id), day_d, int(req)),
            )
            cur.fetchone()

        conn.commit()
        result = _row_to_assignment(updated)
        result["days"] = [
            {"date": d.isoformat(), "required_completions": int(req)}
            for d, req in sorted(prepared, key=lambda x: x[0])
        ]
        return result
    finally:
        cur.close()
        conn.close()


def delete_assignments(ids: list[int], teacher_user_id: int) -> int:
    if not ids:
        return 0

    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            DELETE FROM assignments a
            WHERE a.id = ANY(%s)
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
        deleted = cur.rowcount
        conn.commit()
        return int(deleted or 0)
    finally:
        cur.close()
        conn.close()


def get_assignment_students_progress_for_teacher(assignment_id: int, teacher_user_id: int) -> dict:
    conn, cur = get_db_cursor()
    try:
        cur.execute(
            """
            SELECT a.id, a.group_id, a.dictation_id,
                   g.title AS group_title,
                   d.title AS dictation_title,
                   d.language_code AS dictation_language_code,
                   d.level AS dictation_level
            FROM assignments a
            JOIN groups g ON g.id = a.group_id
            JOIN dictations d ON d.id = a.dictation_id
            WHERE a.id = %s
              AND EXISTS (
                SELECT 1
                FROM group_teachers gt
                WHERE gt.group_id = a.group_id
                  AND gt.teacher_user_id = %s
              )
            """,
            (assignment_id, teacher_user_id),
        )
        arow = cur.fetchone()
        if not arow:
            raise PermissionError("Forbidden")

        dictation_id = int(arow.get("dictation_id"))
        group_id = int(arow.get("group_id"))

        cur.execute(
            """
            SELECT day_date, required_completions
            FROM assignments_by_date
            WHERE assignment_id = %s
            ORDER BY day_date ASC, id ASC
            """,
            (int(assignment_id),),
        )
        day_rows = cur.fetchall() or []
        if not day_rows:
            raise ValueError("Assignment has no days")

        days = []
        for rr in day_rows:
            dd = rr.get("day_date")
            if not isinstance(dd, date):
                continue
            try:
                req_d = int(rr.get("required_completions") or 1)
            except Exception:
                req_d = 1
            days.append({"date": dd.isoformat(), "required_completions": req_d})

        # Compute progress for the latest day in the plan.
        end_d = day_rows[-1].get("day_date")
        req = int(day_rows[-1].get("required_completions") or 1)
        start_d = day_rows[0].get("day_date")
        progress_day = end_d

        cur.execute(
            """
            SELECT u.id AS student_user_id, u.username
            FROM group_students gs
            JOIN users u ON u.id = gs.student_user_id
            WHERE gs.group_id = %s
              AND gs.status = 'active'
              AND gs.removed_at IS NULL
            ORDER BY LOWER(u.username) ASC, u.id ASC
            """,
            (group_id,),
        )
        students = cur.fetchall() or []

        result_students: list[dict] = []
        completed = 0
        for s in students:
            sid = int(s.get("student_user_id"))
            cur.execute(
                """
                SELECT COUNT(*)::int AS cnt
                FROM history_successes hs
                WHERE hs.user_id = %s
                  AND hs.dictation_id = %s
                  AND hs.created_at::date = %s
                """,
                (sid, dictation_id, progress_day),
            )

            done = int((cur.fetchone() or {}).get("cnt") or 0)
            is_done = done >= req
            if is_done:
                completed += 1

            result_students.append(
                {
                    "id": sid,
                    "username": s.get("username") or "",
                    "avatar_small_url": f"/user/api/avatar?user_id={sid}&size=small",
                    "done": done,
                    "required": req,
                    "is_done": is_done,
                }
            )

        total = len(result_students)
        percent = int(round((completed / total) * 100)) if total else 0

        return {
            "assignment": {
                "id": int(arow.get("id")),
                "group_id": group_id,
                "dictation_id": dictation_id,
                "days": days,
                "group_title": arow.get("group_title"),
                "dictation_title": arow.get("dictation_title"),
                "dictation_language_code": arow.get("dictation_language_code"),
                "dictation_level": arow.get("dictation_level"),
            },
            "summary": {
                "students_total": total,
                "students_completed": completed,
                "percent_completed": percent,
            },
            "students": result_students,
        }
    finally:
        cur.close()
        conn.close()


def create_assignment_days(
    group_id: int,
    dictation_id: int,
    teacher_user_id: int,
    *,
    days: list[dict],
    selected_sentence_positions: Any = None,
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

    uniq_dates = sorted({d for d, _ in prepared})
    if len(uniq_dates) > MAX_ASSIGNMENT_RANGE_DAYS:
        raise ValueError("Assignment days count must be <= 7")
    if uniq_dates:
        _validate_max_range(uniq_dates[0], uniq_dates[-1])

    conn, cur = get_db_cursor()
    try:
        _ensure_teacher_of_group(cur, group_id, teacher_user_id)

        positions = selected_sentence_positions
        if isinstance(positions, list):
            prepared_pos = []
            for x in positions:
                if x is None:
                    continue
                try:
                    prepared_pos.append(int(x))
                except Exception:
                    continue
            prepared_pos = sorted({p for p in prepared_pos})
            positions = prepared_pos if prepared_pos else None
        else:
            positions = None

        # проверим пересечения по каждой дате
        for day_d, _ in prepared:
            _check_overlap_day(
                cur,
                group_id=group_id,
                dictation_id=dictation_id,
                day_date=day_d,
                selected_sentence_positions=positions,
            )

        cur.execute(
            """
            INSERT INTO assignments (
                group_id,
                dictation_id,
                created_by_teacher_user_id,
                selected_sentence_positions,
                created_at,
                updated_at
            )
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, group_id, dictation_id, created_by_teacher_user_id, selected_sentence_positions, created_at, updated_at
            """,
            (group_id, dictation_id, teacher_user_id, positions),
        )
        row = cur.fetchone() or {}
        assignment_id = int(row.get("id"))

        for day_d, req in prepared:
            cur.execute(
                """
                INSERT INTO assignments_by_date (assignment_id, day_date, required_completions, created_at, updated_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
                """,
                (assignment_id, day_d, int(req)),
            )
            cur.fetchone()

        created = _row_to_assignment(row)
        created["days"] = [
            {"date": d.isoformat(), "required_completions": int(req)}
            for d, req in sorted(prepared, key=lambda x: x[0])
        ]

        conn.commit()
        return [created]
    finally:
        cur.close()
        conn.close()


def list_group_assignments_for_teacher(group_id: int, teacher_user_id: int, *, include_archived: bool = False) -> list[dict]:
    conn, cur = get_db_cursor()
    try:
        _ensure_teacher_of_group(cur, group_id, teacher_user_id)
        cur.execute(
            f"""
            SELECT a.id, a.group_id, a.dictation_id, a.created_by_teacher_user_id,
                   a.selected_sentence_positions,
                   a.created_at, a.updated_at,
                   g.title AS group_title,
                   d.title AS dictation_title,
                   d.language_code AS dictation_language_code,
                   d.level AS dictation_level,
                   d.sentences_count AS dictation_sentences_count,
                   ARRAY_AGG(abd.day_date ORDER BY abd.day_date ASC) AS day_dates,
                   ARRAY_AGG(abd.required_completions ORDER BY abd.day_date ASC) AS day_required
            FROM assignments a
            LEFT JOIN assignments_by_date abd ON abd.assignment_id = a.id
            JOIN groups g ON g.id = a.group_id
            JOIN dictations d ON d.id = a.dictation_id
            WHERE a.group_id = %s
            GROUP BY a.id, g.title, d.title, d.language_code, d.level, d.sentences_count
            ORDER BY MAX(abd.day_date) DESC NULLS LAST, a.id DESC
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
            a["dictation_sentences_count"] = int(r.get("dictation_sentences_count") or 0)

            day_dates = r.get("day_dates") or []
            day_required = r.get("day_required") or []
            days: list[dict] = []
            for i, dd in enumerate(day_dates):
                try:
                    if not isinstance(dd, date):
                        continue
                    req = 1
                    if i < len(day_required):
                        try:
                            req = int(day_required[i] or 1)
                        except Exception:
                            req = 1
                    days.append({"date": dd.isoformat(), "required_completions": req})
                except Exception:
                    continue
            a["days"] = days

            try:
                from routes.index import get_cover_url_for_id

                lang = a.get("dictation_language_code")
                a["dictation_cover_url"] = get_cover_url_for_id(f"dict_{a.get('dictation_id')}", lang)
            except Exception:
                a["dictation_cover_url"] = f"/static/data/covers/cover_{(a.get('dictation_language_code') or 'en')}.webp"
            result.append(a)
        return result
    finally:
        cur.close()
        conn.close()


def list_my_assignments_for_student(student_user_id: int, *, for_date: Any) -> list[dict]:
    t0 = time.perf_counter()
    target_date = _parse_date(for_date)
    if not target_date:
        raise ValueError("date is required")

    conn, cur = get_db_cursor()
    try:
        t_sql0 = time.perf_counter()
        cur.execute(
            """
            SELECT a.id, a.group_id, a.dictation_id, a.created_by_teacher_user_id,
                   a.selected_sentence_positions,
                   a.created_at, a.updated_at,
                   abd.required_completions,
                   g.title AS group_title,
                   d.title AS dictation_title,
                   d.language_code AS dictation_language_code,
                   d.level AS dictation_level,
                   d.sentences_count AS dictation_sentences_count
            FROM assignments a
            JOIN assignments_by_date abd ON abd.assignment_id = a.id
            JOIN groups g ON g.id = a.group_id
            JOIN dictations d ON d.id = a.dictation_id
            WHERE abd.day_date = %s
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
            ORDER BY abd.day_date ASC, a.id ASC
            """,
            (target_date, student_user_id),
        )
        rows = cur.fetchall() or []
        t_sql1 = time.perf_counter()

        # Compute completion counts ("done") efficiently.
        # Avoid N+1 queries: we fetch all relevant successes in a single aggregate query.
        dictation_ids: list[int] = []
        min_start: Optional[date] = None
        max_end: Optional[date] = None
        for r in rows:
            try:
                did = r.get("dictation_id")
                if did is not None:
                    dictation_ids.append(int(did))
            except Exception:
                pass
            # For day-based plan, the relevant range is just the target day.
            if target_date:
                min_start = target_date if (min_start is None or target_date < min_start) else min_start
                max_end = target_date if (max_end is None or target_date > max_end) else max_end

        counts_by_dict_day: dict[int, dict[date, int]] = {}
        if dictation_ids and min_start and max_end:
            t_cnt0 = time.perf_counter()
            cur.execute(
                """
                SELECT hs.dictation_id, hs.created_at::date AS d, COUNT(*)::int AS cnt
                FROM history_successes hs
                WHERE hs.user_id = %s
                  AND hs.dictation_id = ANY(%s)
                  AND hs.created_at::date >= %s
                  AND hs.created_at::date <= %s
                GROUP BY hs.dictation_id, hs.created_at::date
                """,
                (student_user_id, list(set(dictation_ids)), min_start, max_end),
            )
            for rr in cur.fetchall() or []:
                try:
                    did = int(rr.get("dictation_id"))
                    day = rr.get("d")
                    cnt = int(rr.get("cnt") or 0)
                    if did not in counts_by_dict_day:
                        counts_by_dict_day[did] = {}
                    if isinstance(day, date):
                        counts_by_dict_day[did][day] = cnt
                except Exception:
                    continue
            t_cnt1 = time.perf_counter()
            try:
                logger.info(
                    "[student_plan] history_successes aggregate: dictations=%s, days=%s, %.1fms",
                    len(set(dictation_ids)),
                    (max_end - min_start).days + 1 if (min_start and max_end) else 0,
                    (t_cnt1 - t_cnt0) * 1000.0,
                )
            except Exception:
                pass

        result: list[dict] = []
        t_cover0 = time.perf_counter()
        for r in rows:
            a = _row_to_assignment(r)

            a["group_title"] = r.get("group_title")
            a["dictation_title"] = r.get("dictation_title")
            a["dictation_language_code"] = r.get("dictation_language_code")
            a["dictation_level"] = r.get("dictation_level")

            try:
                from routes.index import get_cover_url_for_id

                lang = a.get("dictation_language_code")
                a["dictation_cover_url"] = get_cover_url_for_id(f"dict_{a.get('dictation_id')}", lang)
            except Exception:
                a["dictation_cover_url"] = f"/static/data/covers/cover_{(a.get('dictation_language_code') or 'en')}.webp"

            start_d = target_date
            end_d = target_date
            did = a.get("dictation_id")
            did_int = int(did) if did is not None else None
            if did_int is not None and did_int in counts_by_dict_day and target_date:
                a["done"] = int(counts_by_dict_day.get(did_int, {}).get(target_date, 0) or 0)
            else:
                a["done"] = 0
            try:
                a["required_completions"] = int(r.get("required_completions") or a.get("required_completions") or 1)
            except Exception:
                a["required_completions"] = 1
            a["mode"] = "days"
            a["overdue"] = False
            result.append(a)

        t_cover1 = time.perf_counter()
        try:
            logger.info(
                "[student_plan] assignments rows=%s sql=%.1fms cover+calc=%.1fms total=%.1fms",
                len(rows),
                (t_sql1 - t_sql0) * 1000.0,
                (t_cover1 - t_cover0) * 1000.0,
                (time.perf_counter() - t0) * 1000.0,
            )
        except Exception:
            pass

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
        "start_date": None,
        "end_date": None,
        "required_completions": None,
        "selected_sentence_positions": list(row.get("selected_sentence_positions") or []) if row.get("selected_sentence_positions") is not None else None,
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
        "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
        "archived_at": None,
    }
