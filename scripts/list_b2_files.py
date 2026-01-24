#!/usr/bin/env python3
"""
Скрипт для просмотра файлов в Backblaze B2

Показывает структуру и содержимое bucket.

Использование:
    python scripts/list_b2_files.py [--path dictations/] [--tree]

Опции:
    --path PATH   Показать файлы только в указанной папке
    --tree        Показать в виде дерева
    --stats       Показать статистику (количество файлов, размер)
"""

import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv
from collections import defaultdict

# Добавляем корневую папку проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Загружаем переменные окружения
env_path = project_root / '.env'
if env_path.exists():
    load_dotenv(env_path)

from helpers.b2_storage import b2_storage


def format_size(size_bytes):
    """Форматирует размер в читаемый вид"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"


def list_files(path_prefix="", tree_view=False, show_stats=False):
    """
    Списывает файлы в B2
    
    Args:
        path_prefix: Префикс пути (например, "dictations/")
        tree_view: Показать в виде дерева
        show_stats: Показать статистику
    """
    if not b2_storage.enabled or not b2_storage.bucket:
        print("❌ ОШИБКА: B2 Storage не настроен!")
        print("\nУбедитесь, что установлены переменные окружения:")
        print("  - B2_ENABLED=true")
        print("  - B2_APPLICATION_KEY_ID")
        print("  - B2_APPLICATION_KEY")
        print("  - B2_BUCKET_NAME")
        sys.exit(1)
    
    print("="*60)
    print("📦 ФАЙЛЫ В BACKBLAZE B2")
    print("="*60)
    print(f"Bucket: {b2_storage.bucket_name}")
    if path_prefix:
        print(f"Путь: {path_prefix}")
    print("="*60)
    print()
    
    try:
        # Получаем список файлов
        files = []
        folders = defaultdict(list)
        
        # Итерируемся по файлам в bucket
        for file_version, folder_name in b2_storage.bucket.ls(folder_to_list=path_prefix, recursive=True):
            file_name = file_version.file_name
            file_info = file_version
            
            # Фильтруем по path_prefix, если указан
            if path_prefix and not file_name.startswith(path_prefix):
                continue
            
            # Пропускаем служебные файлы
            if file_name.startswith('.') or file_name.endswith('~'):
                continue
            
            files.append({
                'name': file_name,
                'size': file_version.size,
                'uploaded': file_version.upload_timestamp / 1000  # Конвертируем из миллисекунд
            })
            
            # Группируем по папкам для tree view
            if tree_view:
                parts = file_name.split('/')
                if len(parts) > 1:
                    folder = '/'.join(parts[:-1])
                    folders[folder].append({
                        'name': parts[-1],
                        'size': file_version.size,
                        'uploaded': file_version.upload_timestamp / 1000
                    })
                else:
                    folders['.'].append({
                        'name': file_name,
                        'size': file_version.size,
                        'uploaded': file_version.upload_timestamp / 1000
                    })
        
        if not files:
            print("📭 Файлы не найдены")
            if path_prefix:
                print(f"   (в папке {path_prefix})")
            return
        
        # Показываем в виде дерева
        if tree_view:
            print("🌳 СТРУКТУРА ПАПОК:\n")
            
            # Сортируем папки
            sorted_folders = sorted(folders.keys())
            
            for folder in sorted_folders:
                if folder == '.':
                    print("📁 Корень:")
                else:
                    print(f"📁 {folder}/")
                
                folder_files = sorted(folders[folder], key=lambda x: x['name'])
                for file_info in folder_files:
                    size_str = format_size(file_info['size'])
                    print(f"   📄 {file_info['name']} ({size_str})")
                print()
        else:
            # Показываем плоский список
            print(f"📄 ФАЙЛЫ ({len(files)}):\n")
            
            # Сортируем по имени
            files.sort(key=lambda x: x['name'])
            
            for file_info in files:
                size_str = format_size(file_info['size'])
                from datetime import datetime
                upload_date = datetime.fromtimestamp(file_info['uploaded']).strftime('%Y-%m-%d %H:%M')
                print(f"📄 {file_info['name']}")
                print(f"   💾 Размер: {size_str}")
                print(f"   📅 Загружен: {upload_date}")
                print()
        
        # Показываем статистику
        if show_stats:
            total_size = sum(f['size'] for f in files)
            total_files = len(files)
            
            # Группируем по типам
            by_type = defaultdict(lambda: {'count': 0, 'size': 0})
            for file_info in files:
                ext = Path(file_info['name']).suffix.lower() or 'без расширения'
                by_type[ext]['count'] += 1
                by_type[ext]['size'] += file_info['size']
            
            print("="*60)
            print("📊 СТАТИСТИКА")
            print("="*60)
            print(f"📄 Всего файлов: {total_files}")
            print(f"💾 Общий размер: {format_size(total_size)}")
            print()
            print("📁 По типам файлов:")
            for ext, stats in sorted(by_type.items()):
                print(f"   {ext}: {stats['count']} файлов, {format_size(stats['size'])}")
            print()
    
    except Exception as e:
        print(f"❌ Ошибка при получении списка файлов: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Просмотр файлов в Backblaze B2'
    )
    parser.add_argument(
        '--path',
        type=str,
        default='',
        help='Показать файлы только в указанной папке (например, "dictations/")'
    )
    parser.add_argument(
        '--tree',
        action='store_true',
        help='Показать в виде дерева'
    )
    parser.add_argument(
        '--stats',
        action='store_true',
        help='Показать статистику'
    )
    
    args = parser.parse_args()
    
    list_files(
        path_prefix=args.path,
        tree_view=args.tree,
        show_stats=args.stats
    )


if __name__ == '__main__':
    main()

