"""
Менеджер лицензий.

Единственная точка входа для изменения user_access_calendar.

Железное правило:
    Ни один модуль системы не имеет права напрямую записывать данные
    в user_access_calendar. Любое изменение доступа пользователя
    выполняется только через этот модуль.
"""

from typing import Optional, List
from datetime import date, datetime, timedelta

from .db import get_db_connection, get_db_cursor

# ============================================================
# Приоритеты лицензий (чем выше число — тем сильнее)
# ============================================================
LICENSE_PRIORITY = {
    "Free":              0,
    "Student30":         10,
    "Teacher30":         20,
    "StudentTeacher30":  30,
}

# Маппинг лицензия → роль
LICENSE_TO_ROLE = {
    "Free":              "guest",
    "Student30":         "student",
    "Teacher30":         "teacher",
    "StudentTeacher30":  "admin",    # самая сильная — даёт admin
}


class LicenseManager:
    """
    Менеджер лицензий.

    Использование:
        lm = LicenseManager()
        lm.register_license(user_id=1, license_type="Teacher30", days=30,
                            document_type="purchase", document_id="order_123")
    """

    # ------------------------------------------------------------------
    # Публичные методы
    # ------------------------------------------------------------------

    def register_license(
        self,
        user_id: int,
        license_type: str,
        days: int,
        document_type: str,
        document_id: Optional[str] = None,
        date_begin: Optional[date] = None,
        comment: Optional[str] = None,
    ):
        """
        Регистрирует новую лицензию.

        1. Создаёт запись в license_operations.
        2. Перестраивает user_access_calendar для затронутого периода.

        Args:
            user_id: ID пользователя
            license_type: Тип лицензии (Free, Teacher30, Student30, StudentTeacher30)
            days: Количество дней (0 = навсегда)
            document_type: Тип документа (purchase, gift, promocode, manual, signup)
            document_id: Внешний идентификатор документа
            date_begin: Дата начала (по умолчанию — сегодня)
            comment: Комментарий
        """
        if date_begin is None:
            date_begin = date.today()

        priority = LICENSE_PRIORITY.get(license_type, 0)

        conn, cur = get_db_cursor()
        try:
            # 1. Запись в историю
            cur.execute(
                """
                INSERT INTO license_operations
                    (user_id, document_type, document_id, license_type,
                     date_begin, days, priority, comment)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, document_type, document_id, license_type,
                 date_begin, days, priority, comment),
            )
            op_id = cur.fetchone()["id"]
            conn.commit()
        finally:
            cur.close()
            conn.close()

        # 2. Перестроить календарь
        self.rebuild_calendar_for_user(user_id)

        # 3. Синхронизировать users.role_id с сегодняшней ролью из календаря
        self._sync_user_role_id(user_id)

    def assign_free_license(self, user_id: int):
        """
        Выдаёт бесплатную лицензию (вечную) при регистрации.
        """
        self.register_license(
            user_id=user_id,
            license_type="Free",
            days=0,
            document_type="signup",
            document_id=None,
            date_begin=date.today(),
            comment="Бесплатная лицензия при регистрации",
        )

    # ------------------------------------------------------------------
    # Перестроение календаря
    # ------------------------------------------------------------------

    def rebuild_calendar_for_user(self, user_id: int):
        """
        Полностью перестраивает user_access_calendar для пользователя.

        Алгоритм:
        1. Собрать все активные license_operations пользователя.
        2. Для каждого дня от минимальной date_begin до максимальной
           (date_begin + days) определить победившую лицензию.
        3. Правила разрешения коллизий:
           - Выше приоритет → побеждает.
           - Одинаковый приоритет → побеждает более поздняя запись.
           - days=0 означает вечную лицензию (до 2099-12-31).
        4. Записать результаты в user_access_calendar.
        """
        conn, cur = get_db_cursor()
        try:
            # 1. Получить все операции пользователя
            cur.execute(
                """
                SELECT id, license_type, date_begin, days, priority, document_type, document_id
                FROM license_operations
                WHERE user_id = %s
                ORDER BY priority DESC, created_at DESC
                """,
                (user_id,),
            )
            operations = [dict(r) for r in cur.fetchall()]
            if not operations:
                return

            # 2. Определить диапазон дат
            today = date.today()
            far_future = date(2099, 12, 31)

            # Начинаем либо с минимальной date_begin, либо с today
            min_date = today
            max_date = today
            for op in operations:
                op_begin = op["date_begin"]
                if isinstance(op_begin, datetime):
                    op_begin = op_begin.date()
                if op_begin < min_date:
                    min_date = op_begin

                op_end = self._calc_end_date(op_begin, op["days"], far_future)
                if op_end > max_date:
                    max_date = op_end

            # 3. Для каждого дня определить победившую лицензию
            calendar_entries = []
            current = min_date
            while current <= max_date:
                winner = self._resolve_day(operations, current)
                if winner is not None:
                    role_code = LICENSE_TO_ROLE.get(winner["license_type"], "guest")
                    calendar_entries.append({
                        "user_id": user_id,
                        "date": current,
                        "license_type": winner["license_type"],
                        "role_code": role_code,
                        "source_document_type": winner["document_type"],
                        "source_document_id": str(winner["id"]),
                    })
                current += timedelta(days=1)

            # 4. Записать в базу (удалить старые записи, вставить новые)
            if calendar_entries:
                # Удаляем записи в затронутом диапазоне
                cur.execute(
                    """
                    DELETE FROM user_access_calendar
                    WHERE user_id = %s AND date >= %s AND date <= %s
                    """,
                    (user_id, min_date, max_date),
                )

                for entry in calendar_entries:
                    cur.execute(
                        """
                        INSERT INTO user_access_calendar
                            (user_id, date, role_id,
                             source_document_type, source_document_id)
                        VALUES (
                            %s, %s,
                            (SELECT id FROM roles WHERE code = %s),
                            %s, %s
                        )
                        ON CONFLICT (user_id, date)
                        DO UPDATE SET
                            role_id = EXCLUDED.role_id,
                            source_document_type = EXCLUDED.source_document_type,
                            source_document_id = EXCLUDED.source_document_id
                        """,
                        (
                            entry["user_id"],
                            entry["date"],
                            entry["role_code"],
                            entry["source_document_type"],
                            entry["source_document_id"],
                        ),
                    )

            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"[LicenseManager] Ошибка при перестроении календаря: {e}")
            raise
        finally:
            cur.close()
            conn.close()

    # ------------------------------------------------------------------
    # Внутренние методы
    # ------------------------------------------------------------------

    @staticmethod
    def _sync_user_role_id(user_id: int):
        """
        Синхронизирует users.role_id с сегодняшней ролью из user_access_calendar.
        
        Вызывается после каждого изменения календаря, чтобы фронтенд
        всегда видел актуальный role_id в /api/me.
        """
        conn, cur = get_db_cursor()
        try:
            today = date.today()
            cur.execute(
                """
                UPDATE users
                SET role_id = (
                    SELECT role_id
                    FROM user_access_calendar
                    WHERE user_id = %s AND date = %s
                )
                WHERE id = %s
                """,
                (user_id, today, user_id),
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"[LicenseManager] Ошибка синхронизации role_id: {e}")
        finally:
            cur.close()
            conn.close()

    @staticmethod
    def _calc_end_date(begin: date, days: int, far_future: date) -> date:
        """Вычисляет дату окончания лицензии."""
        if days == 0:
            return far_future
        return begin + timedelta(days=days)

    @staticmethod
    def _resolve_day(operations: List[dict], target_date: date) -> Optional[dict]:
        """
        Определяет, какая лицензия действует в указанный день.

        Перебирает операции в порядке убывания приоритета и created_at.
        Первая операция, покрывающая этот день — победитель.
        """
        for op in operations:
            op_begin = op["date_begin"]
            if isinstance(op_begin, datetime):
                op_begin = op_begin.date()

            if op_begin > target_date:
                continue

            op_end = LicenseManager._calc_end_date(
                op_begin,
                op["days"],
                date(2099, 12, 31),
            )
            if op_end >= target_date:
                return op

        return None


# Удобный синглтон для импорта
license_manager = LicenseManager()
