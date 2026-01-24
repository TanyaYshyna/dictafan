#!/usr/bin/env python3
"""
Скрипт для выполнения SQL миграции напрямую
Используется для быстрого добавления поля title_translations_json
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
    """Выполняет SQL миграцию для добавления поля title_translations_json"""
    
    # Читаем SQL файл
    sql_file = project_root / 'migrations' / 'add_title_translations.sql'
    
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
        print("   Добавлено поле: title_translations_json в таблицу dictations")
        
        # Проверяем, что поле добавлено
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'dictations' 
            AND column_name = 'title_translations_json'
        """)
        
        result = cursor.fetchone()
        if result:
            print(f"✅ Поле подтверждено: {result[0]} ({result[1]})")
        else:
            print("⚠️  Поле не найдено после миграции")
        
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("Миграция: добавление поля title_translations_json")
    print("=" * 60)
    print()
    
    success = run_migration()
    
    if success:
        print()
        print("✅ Готово! Теперь можно использовать title_translations в коде.")
    else:
        print()
        print("❌ Миграция не выполнена. Проверь ошибки выше.")
        sys.exit(1)

