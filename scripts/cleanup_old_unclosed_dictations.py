#!/usr/bin/env python3
"""
Скрипт для очистки старых незавершенных диктантов из БД
Удаляет записи, которые не обновлялись более N дней (по умолчанию 30, для теста можно поставить 2)
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

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

def cleanup_old_unclosed_dictations(days_threshold=30):
    """
    Удаляет незавершенные диктанты, которые не обновлялись более указанного количества дней
    
    Args:
        days_threshold: Количество дней (по умолчанию 30, для теста можно поставить 2)
    """
    print(f"🧹 Очистка незавершенных диктантов старше {days_threshold} дней...")
    
    cutoff_date = datetime.now() - timedelta(days=days_threshold)
    print(f"📅 Дата отсечки: {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')}")
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Сначала получаем статистику
            cur.execute("""
                SELECT COUNT(*) 
                FROM history_unclosed_dictations
                WHERE updated_at < %s
            """, (cutoff_date,))
            
            count_to_delete = cur.fetchone()[0]
            print(f"📊 Найдено записей для удаления: {count_to_delete}")
            
            if count_to_delete == 0:
                print("✅ Нет записей для удаления")
                return
            
            # Удаляем предложения (CASCADE должен удалить автоматически, но удаляем явно)
            cur.execute("""
                DELETE FROM history_unclosed_dictations_sentences
                WHERE (user_id, dictation_id) IN (
                    SELECT user_id, dictation_id
                    FROM history_unclosed_dictations
                    WHERE updated_at < %s
                )
            """, (cutoff_date,))
            
            sentences_deleted = cur.rowcount
            print(f"🗑️  Удалено записей предложений: {sentences_deleted}")
            
            # Удаляем основные записи
            cur.execute("""
                DELETE FROM history_unclosed_dictations
                WHERE updated_at < %s
            """, (cutoff_date,))
            
            dictations_deleted = cur.rowcount
            print(f"🗑️  Удалено незавершенных диктантов: {dictations_deleted}")
            
            conn.commit()
            print(f"✅ Очистка завершена успешно!")
            print(f"   Удалено: {dictations_deleted} диктантов, {sentences_deleted} записей предложений")
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Ошибка при очистке: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Очистка старых незавершенных диктантов')
    parser.add_argument(
        '--days',
        type=int,
        default=30,
        help='Количество дней (по умолчанию 30, для теста можно поставить 2)'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Очистка старых незавершенных диктантов")
    print("=" * 60)
    print()
    
    try:
        cleanup_old_unclosed_dictations(args.days)
        print()
        print("✅ Скрипт завершен успешно!")
        sys.exit(0)
    except Exception as e:
        print()
        print(f"❌ Скрипт завершился с ошибкой: {e}")
        sys.exit(1)



