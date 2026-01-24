#!/usr/bin/env python3
"""
Скрипт миграции аудиофайлов и аватаров в Backblaze B2

Использование:
    python scripts/migrate_to_b2.py [--dry-run] [--dictations-only] [--avatars-only]

Опции:
    --dry-run          Только показать, что будет мигрировано (не загружать)
    --dictations-only  Мигрировать только диктанты (аудио + обложки)
    --avatars-only     Мигрировать только аватары пользователей
"""

import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Добавляем корневую папку проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Загружаем переменные окружения из .env файла
env_path = project_root / '.env'
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Загружены переменные окружения из: {env_path}")
else:
    print(f"⚠️  Файл .env не найден: {env_path}")
    print("   Используются переменные окружения системы")

from helpers.b2_storage import b2_storage

# Расширения аудиофайлов
AUDIO_EXTENSIONS = ('.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.mp4')

# Расширения изображений (аватары и обложки)
IMAGE_EXTENSIONS = ('.webp', '.jpg', '.jpeg', '.png')


def migrate_dictations(dry_run=False):
    """Мигрирует аудиофайлы и обложки из dictations и temp"""
    print("\n" + "="*60)
    print("📁 МИГРАЦИЯ ДИКТАНТОВ (аудио + обложки)")
    print("="*60)
    
    dictations_path = project_root / 'static' / 'data' / 'dictations'
    temp_path = project_root / 'static' / 'data' / 'temp'
    
    stats = {
        'dictations': {'audio': 0, 'covers': 0, 'total_size': 0},
        'temp': {'audio': 0, 'total_size': 0},
        'errors': []
    }
    
    # Мигрируем dictations
    if dictations_path.exists():
        print(f"\n📂 Обработка: {dictations_path}")
        for dictation_id in os.listdir(dictations_path):
            dictation_dir = dictations_path / dictation_id
            if not dictation_dir.is_dir():
                continue
            
            print(f"\n  📝 Диктант: {dictation_id}")
            
            # Обрабатываем обложку
            cover_path = dictation_dir / 'cover.webp'
            if cover_path.exists():
                remote_path = f"dictations/{dictation_id}/cover.webp"
                if not dry_run:
                    b2_url = b2_storage.upload_file(str(cover_path), remote_path)
                    if b2_url:
                        stats['dictations']['covers'] += 1
                        file_size = cover_path.stat().st_size
                        stats['dictations']['total_size'] += file_size
                        print(f"    ✅ Обложка: {remote_path} ({file_size // 1024} KB)")
                    else:
                        stats['errors'].append(f"Ошибка загрузки обложки: {remote_path}")
                        print(f"    ❌ Ошибка загрузки обложки: {remote_path}")
                else:
                    stats['dictations']['covers'] += 1
                    file_size = cover_path.stat().st_size
                    stats['dictations']['total_size'] += file_size
                    print(f"    📋 [DRY-RUN] Обложка: {remote_path} ({file_size // 1024} KB)")
            
            # Обрабатываем аудиофайлы
            for root, dirs, files in os.walk(dictation_dir):
                for file in files:
                    file_path = Path(root) / file
                    
                    # Пропускаем JSON файлы
                    if file.endswith('.json'):
                        continue
                    
                    # Обрабатываем аудио
                    if file.lower().endswith(AUDIO_EXTENSIONS):
                        rel_path = file_path.relative_to(dictations_path)
                        remote_path = f"dictations/{rel_path.as_posix()}"
                        
                        if not dry_run:
                            b2_url = b2_storage.upload_file(str(file_path), remote_path)
                            if b2_url:
                                stats['dictations']['audio'] += 1
                                file_size = file_path.stat().st_size
                                stats['dictations']['total_size'] += file_size
                                print(f"    ✅ Аудио: {remote_path} ({file_size // 1024} KB)")
                            else:
                                stats['errors'].append(f"Ошибка загрузки: {remote_path}")
                                print(f"    ❌ Ошибка: {remote_path}")
                        else:
                            stats['dictations']['audio'] += 1
                            file_size = file_path.stat().st_size
                            stats['dictations']['total_size'] += file_size
                            print(f"    📋 [DRY-RUN] Аудио: {remote_path} ({file_size // 1024} KB)")
    
    # Мигрируем temp
    if temp_path.exists():
        print(f"\n📂 Обработка: {temp_path}")
        for dictation_id in os.listdir(temp_path):
            temp_dictation_dir = temp_path / dictation_id
            if not temp_dictation_dir.is_dir():
                continue
            
            print(f"\n  📝 Временный диктант: {dictation_id}")
            
            for root, dirs, files in os.walk(temp_dictation_dir):
                for file in files:
                    file_path = Path(root) / file
                    
                    # Обрабатываем только аудио
                    if file.lower().endswith(AUDIO_EXTENSIONS):
                        rel_path = file_path.relative_to(temp_path)
                        remote_path = f"temp/{rel_path.as_posix()}"
                        
                        if not dry_run:
                            b2_url = b2_storage.upload_file(str(file_path), remote_path)
                            if b2_url:
                                stats['temp']['audio'] += 1
                                file_size = file_path.stat().st_size
                                stats['temp']['total_size'] += file_size
                                print(f"    ✅ Аудио: {remote_path} ({file_size // 1024} KB)")
                            else:
                                stats['errors'].append(f"Ошибка загрузки: {remote_path}")
                                print(f"    ❌ Ошибка: {remote_path}")
                        else:
                            stats['temp']['audio'] += 1
                            file_size = file_path.stat().st_size
                            stats['temp']['total_size'] += file_size
                            print(f"    📋 [DRY-RUN] Аудио: {remote_path} ({file_size // 1024} KB)")
    
    return stats


def migrate_avatars(dry_run=False):
    """Мигрирует аватары пользователей"""
    print("\n" + "="*60)
    print("👤 МИГРАЦИЯ АВАТАРОВ ПОЛЬЗОВАТЕЛЕЙ")
    print("="*60)
    
    users_path = project_root / 'static' / 'data' / 'users'
    
    stats = {
        'avatars': 0,
        'total_size': 0,
        'errors': []
    }
    
    if not users_path.exists():
        print(f"\n⚠️  Папка не найдена: {users_path}")
        return stats
    
    print(f"\n📂 Обработка: {users_path}")
    
    for user_folder in os.listdir(users_path):
        user_dir = users_path / user_folder
        if not user_dir.is_dir():
            continue
        
        # Ищем аватары
        avatar_large = user_dir / 'avatar.webp'
        avatar_small = user_dir / 'avatar_min.webp'
        
        user_email = user_folder.replace('_at_', '@').replace('_dot_', '.')
        print(f"\n  👤 Пользователь: {user_email}")
        
        # Загружаем большой аватар
        if avatar_large.exists():
            remote_path = f"avatars/{user_folder}/avatar.webp"
            if not dry_run:
                b2_url = b2_storage.upload_file(str(avatar_large), remote_path)
                if b2_url:
                    stats['avatars'] += 1
                    file_size = avatar_large.stat().st_size
                    stats['total_size'] += file_size
                    print(f"    ✅ Аватар (large): {remote_path} ({file_size // 1024} KB)")
                else:
                    stats['errors'].append(f"Ошибка загрузки: {remote_path}")
                    print(f"    ❌ Ошибка: {remote_path}")
            else:
                stats['avatars'] += 1
                file_size = avatar_large.stat().st_size
                stats['total_size'] += file_size
                print(f"    📋 [DRY-RUN] Аватар (large): {remote_path} ({file_size // 1024} KB)")
        
        # Загружаем маленький аватар
        if avatar_small.exists():
            remote_path = f"avatars/{user_folder}/avatar_min.webp"
            if not dry_run:
                b2_url = b2_storage.upload_file(str(avatar_small), remote_path)
                if b2_url:
                    stats['avatars'] += 1
                    file_size = avatar_small.stat().st_size
                    stats['total_size'] += file_size
                    print(f"    ✅ Аватар (small): {remote_path} ({file_size // 1024} KB)")
                else:
                    stats['errors'].append(f"Ошибка загрузки: {remote_path}")
                    print(f"    ❌ Ошибка: {remote_path}")
            else:
                stats['avatars'] += 1
                file_size = avatar_small.stat().st_size
                stats['total_size'] += file_size
                print(f"    📋 [DRY-RUN] Аватар (small): {remote_path} ({file_size // 1024} KB)")
    
    return stats


def print_summary(dictations_stats, avatars_stats, dry_run=False):
    """Выводит итоговую статистику"""
    print("\n" + "="*60)
    print("📊 ИТОГОВАЯ СТАТИСТИКА")
    print("="*60)
    
    total_audio = dictations_stats['dictations']['audio'] + dictations_stats['temp']['audio']
    total_covers = dictations_stats['dictations']['covers']
    total_avatars = avatars_stats['avatars']
    total_size = (
        dictations_stats['dictations']['total_size'] + 
        dictations_stats['temp']['total_size'] + 
        avatars_stats['total_size']
    )
    total_errors = len(dictations_stats['errors']) + len(avatars_stats['errors'])
    
    print(f"\n📁 Диктанты:")
    print(f"   Аудиофайлов: {total_audio}")
    print(f"   Обложек: {total_covers}")
    print(f"   Размер: {total_size // (1024*1024)} MB")
    
    print(f"\n👤 Аватары:")
    print(f"   Файлов: {total_avatars}")
    print(f"   Размер: {avatars_stats['total_size'] // 1024} KB")
    
    print(f"\n📦 Всего:")
    print(f"   Файлов: {total_audio + total_covers + total_avatars}")
    print(f"   Общий размер: {total_size // (1024*1024)} MB")
    
    if total_errors > 0:
        print(f"\n❌ Ошибок: {total_errors}")
        print("\nОшибки:")
        for error in dictations_stats['errors'] + avatars_stats['errors']:
            print(f"   - {error}")
    
    if dry_run:
        print("\n⚠️  Это был DRY-RUN (тестовый режим). Файлы не были загружены.")
        print("   Запустите без --dry-run для реальной миграции.")
    else:
        print("\n✅ Миграция завершена!")


def main():
    parser = argparse.ArgumentParser(
        description='Миграция аудиофайлов и аватаров в Backblaze B2'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Только показать, что будет мигрировано (не загружать)'
    )
    parser.add_argument(
        '--dictations-only',
        action='store_true',
        help='Мигрировать только диктанты (аудио + обложки)'
    )
    parser.add_argument(
        '--avatars-only',
        action='store_true',
        help='Мигрировать только аватары пользователей'
    )
    
    args = parser.parse_args()
    
    # Проверяем, что B2 настроен
    if not b2_storage.enabled:
        print("❌ ОШИБКА: B2 Storage не настроен!")
        print("\nУбедитесь, что установлены переменные окружения:")
        print("  - B2_ENABLED=true")
        print("  - B2_APPLICATION_KEY_ID")
        print("  - B2_APPLICATION_KEY")
        print("  - B2_BUCKET_NAME")
        sys.exit(1)
    
    print("="*60)
    print("🚀 МИГРАЦИЯ В BACKBLAZE B2")
    print("="*60)
    print(f"Bucket: {b2_storage.bucket_name}")
    print(f"Режим: {'DRY-RUN (тестовый)' if args.dry_run else 'РЕАЛЬНАЯ МИГРАЦИЯ'}")
    print("="*60)
    
    dictations_stats = {
        'dictations': {'audio': 0, 'covers': 0, 'total_size': 0},
        'temp': {'audio': 0, 'total_size': 0},
        'errors': []
    }
    avatars_stats = {'avatars': 0, 'total_size': 0, 'errors': []}
    
    # Мигрируем диктанты
    if not args.avatars_only:
        dictations_stats = migrate_dictations(dry_run=args.dry_run)
    
    # Мигрируем аватары
    if not args.dictations_only:
        avatars_stats = migrate_avatars(dry_run=args.dry_run)
    
    # Выводим статистику
    print_summary(dictations_stats, avatars_stats, dry_run=args.dry_run)


if __name__ == '__main__':
    main()

