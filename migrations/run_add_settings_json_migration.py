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
    print("   Убедись, что DATABASE_URL установлен в переменных окружения")

from helpers.db import get_db_connection

def run_migration():
    sql_file = project_root / 'migrations' / 'add_settings_json_to_users.sql'
    
    if not sql_file.exists():
        print(f"❌ Файл миграции не найден: {sql_file}")
        return False
    
    with open(sql_file, 'r', encoding='utf-8') as f:
        sql = f.read()
    
    conn = None
    try:
        print("🔌 Подключение к базе данных...")
        conn = get_db_connection()
        cursor = conn.cursor()
        
        print("📝 Выполнение миграции...")
        cursor.execute(sql)
        conn.commit()
        
        print("✅ Миграция успешно выполнена!")
        print("   Добавлено поле: settings_json (TEXT) в таблицу users")
        print("   Формат: JSON с настройками пользователя для диктантов")
        
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'settings_json'
        """)
        result = cursor.fetchone()
        if result:
            print(f"✅ Поле подтверждено: {result[0]} ({result[1]})")
        else:
            print("⚠️  Поле 'settings_json' не найдено после миграции")
        
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при выполнении миграции: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("Миграция: добавление поля settings_json в таблицу users")
    print("=" * 60)
    print()
    
    success = run_migration()
    
    if success:
        print()
        print("✅ Готово! Теперь используется settings_json для хранения настроек.")
    else:
        print()
        print("❌ Миграция не выполнена. Проверь ошибки выше.")
        sys.exit(1)

