#!/usr/bin/env python3
"""
Скрипт для выполнения миграции:
- Добавить activity_count, money_dt_count, money_kt_count в history_by_day
- Удалить money_balance из users (баланс считаем из user_money_ledger)
"""
import os
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
env_path = project_root / '.env'
if env_path.exists():
    load_dotenv(env_path)
    print(f"📄 Загружен .env файл: {env_path}")
else:
    print(f"⚠️  .env файл не найден: {env_path}")

from helpers.db import get_db_connection

def run_migration():
    sql_file = project_root / 'migrations' / 'add_history_by_day_activity_money_columns_and_drop_user_balance.sql'

    if not sql_file.exists():
        print(f"❌ Файл миграции не найден: {sql_file}")
        return False

    with open(sql_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    try:
        print("🔌 Подключение к базе данных...")
        conn = get_db_connection()
        cursor = conn.cursor()

        print("📝 Выполнение миграции...")
        cursor.execute(sql)

        conn.commit()

        print("✅ Миграция успешно выполнена!")
        print("   - Добавлены колонки: activity_count, money_dt_count, money_kt_count в history_by_day")
        print("   - Удалена колонка: money_balance из users")

        # Проверяем новые колонки в history_by_day
        cursor.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'history_by_day'
            AND column_name IN ('activity_count', 'money_dt_count', 'money_kt_count')
            ORDER BY column_name
        """)
        columns = cursor.fetchall()
        if columns:
            print("\n📊 Проверка колонок в history_by_day:")
            for col in columns:
                print(f"   ✅ {col[0]} ({col[1]}) nullable={col[2]} default={col[3]}")
        else:
            print("\n⚠️  Колонки не найдены в history_by_day")

        # Проверяем, что money_balance удалён из users
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'users'
            AND column_name = 'money_balance'
        """)
        if cursor.fetchone():
            print("⚠️  Колонка money_balance всё ещё существует в users!")
        else:
            print("✅ Колонка money_balance успешно удалена из users")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"❌ Ошибка выполнения миграции: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
