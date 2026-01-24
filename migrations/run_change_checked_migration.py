#!/usr/bin/env python3
"""
Скрипт для выполнения SQL миграции изменения поля checked на selection_state
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
    """Выполняет SQL миграцию для изменения поля checked на selection_state"""
    
    # Читаем SQL файл
    sql_file = project_root / 'migrations' / 'change_checked_to_selection_state.sql'
    
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
        print("   Изменено поле: checked (BOOLEAN) -> selection_state (TEXT)")
        print("   Возможные значения: 'unchecked', 'checked', 'completed'")
        
        # Проверяем, что поле изменено
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'history_unclosed_dictations_sentences' 
            AND column_name = 'selection_state'
        """)
        
        result = cursor.fetchone()
        if result:
            print(f"✅ Поле подтверждено: {result[0]} ({result[1]})")
        else:
            print("⚠️  Поле selection_state не найдено после миграции")
        
        # Проверяем, что старая колонка удалена
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'history_unclosed_dictations_sentences' 
            AND column_name = 'checked'
        """)
        
        result = cursor.fetchone()
        if result:
            print("⚠️  Старая колонка 'checked' все еще существует")
        else:
            print("✅ Старая колонка 'checked' успешно удалена")
        
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
    print("Миграция: изменение поля checked на selection_state")
    print("=" * 60)
    print()
    
    success = run_migration()
    
    if success:
        print()
        print("✅ Готово! Теперь используется selection_state вместо checked.")
    else:
        print()
        print("❌ Миграция не выполнена. Проверь ошибки выше.")
        sys.exit(1)

