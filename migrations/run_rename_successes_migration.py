#!/usr/bin/env python3
"""
Скрипт для выполнения миграции переименования колонок в history_successes
"""
import os
import sys
from pathlib import Path

# Добавляем корневую директорию проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Загружаем переменные окружения из .env файла
from dotenv import load_dotenv
env_path = project_root / '.env'
if env_path.exists():
    load_dotenv(env_path)
    print(f"📄 Загружен .env файл: {env_path}")
else:
    print(f"⚠️  .env файл не найден: {env_path}")
    print("   Убедись, что DATABASE_URL установлен в переменных окружения")

from helpers.db import get_db_connection

def run_migration():
    """Выполняет SQL миграцию"""
    migration_file = project_root / 'migrations' / 'rename_history_successes_columns.sql'
    
    if not migration_file.exists():
        print(f"❌ Файл миграции не найден: {migration_file}")
        return False
    
    print(f"📄 Читаем файл миграции: {migration_file}")
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql = f.read()
    
    print("🔄 Выполняем миграцию...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("✅ Миграция успешно выполнена!")
        return True
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка при выполнении миграции: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()

if __name__ == '__main__':
    print("=" * 60)
    print("Миграция: Переименование колонок в history_successes")
    print("=" * 60)
    print()
    
    success = run_migration()
    
    if success:
        print()
        print("✅ Миграция завершена успешно!")
        sys.exit(0)
    else:
        print()
        print("❌ Миграция завершилась с ошибкой!")
        sys.exit(1)

