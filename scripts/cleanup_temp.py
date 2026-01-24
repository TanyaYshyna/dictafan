#!/usr/bin/env python3
"""
Скрипт очистки старых файлов из папки temp

Удаляет диктанты из static/data/temp, которые старше указанного количества дней.

Использование:
    python scripts/cleanup_temp.py [--days 3] [--dry-run]

Опции:
    --days N      Удалять файлы старше N дней (по умолчанию 3)
    --dry-run     Только показать, что будет удалено (не удалять)
"""

import os
import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta
import shutil

# Добавляем корневую папку проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

def cleanup_temp_folder(days=3, dry_run=False):
    """
    Удаляет диктанты из temp, которые старше указанного количества дней
    
    Args:
        days: Количество дней (по умолчанию 3)
        dry_run: Если True, только показывает, что будет удалено
    """
    temp_path = project_root / 'static' / 'data' / 'temp'
    
    if not temp_path.exists():
        print(f"⚠️  Папка temp не найдена: {temp_path}")
        return
    
    print("="*60)
    print("🧹 ОЧИСТКА ПАПКИ TEMP")
    print("="*60)
    print(f"📂 Папка: {temp_path}")
    print(f"⏰ Удаляем файлы старше {days} дней")
    print(f"🔍 Режим: {'DRY-RUN (тестовый)' if dry_run else 'РЕАЛЬНАЯ ОЧИСТКА'}")
    print("="*60)
    
    cutoff_date = datetime.now() - timedelta(days=days)
    cutoff_timestamp = cutoff_date.timestamp()
    
    stats = {
        'folders_deleted': 0,
        'files_deleted': 0,
        'total_size': 0,
        'errors': []
    }
    
    if not os.listdir(temp_path):
        print("\n✅ Папка temp пуста, нечего удалять")
        return stats
    
    print(f"\n📅 Удаляем файлы, созданные до: {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Проходим по всем папкам в temp
    for item in os.listdir(temp_path):
        item_path = temp_path / item
        
        if not item_path.is_dir():
            continue
        
        # Получаем время модификации папки (время создания)
        try:
            mtime = item_path.stat().st_mtime
            creation_time = datetime.fromtimestamp(mtime)
            
            # Проверяем, старше ли папка указанного количества дней
            if mtime < cutoff_timestamp:
                # Подсчитываем размер и количество файлов
                folder_size = 0
                file_count = 0
                
                for root, dirs, files in os.walk(item_path):
                    for file in files:
                        file_path = Path(root) / file
                        try:
                            folder_size += file_path.stat().st_size
                            file_count += 1
                        except OSError:
                            pass
                
                age_days = (datetime.now() - creation_time).days
                
                print(f"🗑️  Удаляем: {item}")
                print(f"   📅 Создан: {creation_time.strftime('%Y-%m-%d %H:%M:%S')} ({age_days} дней назад)")
                print(f"   📁 Файлов: {file_count}")
                print(f"   💾 Размер: {folder_size // 1024} KB")
                
                if not dry_run:
                    try:
                        shutil.rmtree(item_path)
                        stats['folders_deleted'] += 1
                        stats['files_deleted'] += file_count
                        stats['total_size'] += folder_size
                        print(f"   ✅ Удалено")
                    except Exception as e:
                        error_msg = f"Ошибка удаления {item}: {e}"
                        stats['errors'].append(error_msg)
                        print(f"   ❌ {error_msg}")
                else:
                    stats['folders_deleted'] += 1
                    stats['files_deleted'] += file_count
                    stats['total_size'] += folder_size
                    print(f"   📋 [DRY-RUN] Будет удалено")
                
                print()
            else:
                # Показываем, что папка не будет удалена (опционально, можно закомментировать)
                age_days = (datetime.now() - creation_time).days
                if age_days < days:
                    print(f"✅ Оставляем: {item} ({age_days} дней)")
        
        except OSError as e:
            error_msg = f"Ошибка обработки {item}: {e}"
            stats['errors'].append(error_msg)
            print(f"❌ {error_msg}")
    
    # Выводим статистику
    print("="*60)
    print("📊 ИТОГОВАЯ СТАТИСТИКА")
    print("="*60)
    print(f"📁 Папок удалено: {stats['folders_deleted']}")
    print(f"📄 Файлов удалено: {stats['files_deleted']}")
    print(f"💾 Освобождено места: {stats['total_size'] // (1024*1024)} MB")
    
    if stats['errors']:
        print(f"\n❌ Ошибок: {len(stats['errors'])}")
        for error in stats['errors']:
            print(f"   - {error}")
    
    if dry_run:
        print("\n⚠️  Это был DRY-RUN (тестовый режим). Файлы не были удалены.")
        print("   Запустите без --dry-run для реальной очистки.")
    else:
        print("\n✅ Очистка завершена!")
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description='Очистка старых файлов из папки temp'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=3,
        help='Удалять файлы старше N дней (по умолчанию 3)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Только показать, что будет удалено (не удалять)'
    )
    
    args = parser.parse_args()
    
    cleanup_temp_folder(days=args.days, dry_run=args.dry_run)


if __name__ == '__main__':
    main()

