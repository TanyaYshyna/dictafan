#!/usr/bin/env python3
"""
Скрипт для выполнения миграции таблиц истории диктантов
"""
import os
import sys
from pathlib import Path

# Добавляем корневую папку проекта в путь
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
    """Выполняет SQL миграцию для создания таблиц истории диктантов"""
    
    # Читаем SQL файл
    sql_file = project_root / 'migrations' / 'add_dictation_history_tables.sql'
    
    if not sql_file.exists():
        print(f"❌ Файл миграции не найден: {sql_file}")
        return False
    
    with open(sql_file, 'r', encoding='utf-8') as f:
        sql = f.read()
    
    try:
        # Подключаемся к БД
        print("🔌 Подключение к базе данных...")
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Выполняем SQL
        print("📝 Выполнение миграции...")
        cursor.execute(sql)
        
        # Коммитим изменения
        conn.commit()
        
        print("✅ Миграция успешно выполнена!")
        print("   Созданы таблицы:")
        print("   - history_activity")
        print("   - history_successes")
        print("   - history_unclosed_dictations")
        print("   - history_unclosed_dictations_sentences")
        print("   Добавлены поля:")
        print("   - users.remember_unfinished_dictations")
        print("   - dictations.remember_unfinished_dictations")
        
        # Проверяем, что таблицы созданы
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN (
                'history_activity',
                'history_successes', 
                'history_unclosed_dictations',
                'history_unclosed_dictations_sentences'
            )
            ORDER BY table_name
        """)
        
        tables = cursor.fetchall()
        if tables:
            print("\n✅ Созданные таблицы подтверждены:")
            for table in tables:
                print(f"   - {table[0]}")
        else:
            print("\n⚠️  Таблицы не найдены после миграции")
        
        # Проверяем поля
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'remember_unfinished_dictations'
        """)
        
        result = cursor.fetchone()
        if result:
            print(f"\n✅ Поле users.remember_unfinished_dictations подтверждено: {result[1]}")
        else:
            print("\n⚠️  Поле users.remember_unfinished_dictations не найдено")
        
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'dictations' 
            AND column_name = 'remember_unfinished_dictations'
        """)
        
        result = cursor.fetchone()
        if result:
            print(f"✅ Поле dictations.remember_unfinished_dictations подтверждено: {result[1]}")
        else:
            print("⚠️  Поле dictations.remember_unfinished_dictations не найдено")
        
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        import traceback
        traceback.print_exc()
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("Миграция: создание таблиц истории диктантов")
    print("=" * 60)
    print()
    
    success = run_migration()
    
    if success:
        print()
        print("✅ Готово! Таблицы истории диктантов созданы.")
    else:
        print()
        print("❌ Миграция не выполнена. Проверь ошибки выше.")
        sys.exit(1)

