#!/usr/bin/env python3
"""Скрипт для выполнения миграции таблиц групп (учитель–группа–ученик)"""
import sys
from pathlib import Path

# Добавляем корневую папку проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Загружаем переменные окружения из .env файла
from dotenv import load_dotenv

env_path = project_root / ".env"
if env_path.exists():
    load_dotenv(env_path)
    print(f"📄 Загружен .env файл: {env_path}")
else:
    print(f"⚠️  .env файл не найден: {env_path}")
    print("   Убедись, что DATABASE_URL установлен в переменных окружения")

from helpers.db import get_db_connection


def run_migration():
    """Выполняет SQL миграцию для создания таблиц групп"""

    sql_file = project_root / "migrations" / "add_groups_tables.sql"

    if not sql_file.exists():
        print(f"❌ Файл миграции не найден: {sql_file}")
        return False

    with open(sql_file, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        print("🔌 Подключение к базе данных...")
        conn = get_db_connection()
        cursor = conn.cursor()

        print("📝 Выполнение миграции...")
        cursor.execute(sql)
        conn.commit()

        print("✅ Миграция успешно выполнена!")
        print("   Созданы таблицы:")
        print("   - groups")
        print("   - group_teachers")
        print("   - group_students")
        print("   - group_invites")

        cursor.close()
        conn.close()

        return True

    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        import traceback

        traceback.print_exc()
        if "conn" in locals():
            conn.rollback()
            conn.close()
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Миграция: создание таблиц групп")
    print("=" * 60)
    print()

    success = run_migration()

    if success:
        print()
        print("✅ Готово! Таблицы групп созданы.")
    else:
        print()
        print("❌ Миграция не выполнена. Проверь ошибки выше.")
        sys.exit(1)
