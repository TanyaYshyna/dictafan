#!/usr/bin/env python3
"""
Скрипт для тестирования подключения к базе данных
"""
import sys
import os

# Добавляем корневую директорию проекта в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from helpers.db import test_connection

# Загружаем переменные окружения
load_dotenv()

if __name__ == "__main__":
    print("=" * 50)
    print("Тест подключения к базе данных")
    print("=" * 50)
    print(f"ENV: {os.getenv('ENV', 'не установлен')}")
    print(f"DATABASE_URL: {os.getenv('DATABASE_URL', 'не установлен')[:50]}...")
    print("=" * 50)
    
    success = test_connection()
    
    if success:
        print("\n✅ Всё готово! Можно переходить к созданию таблиц.")
        sys.exit(0)
    else:
        print("\n❌ Проверь настройки подключения в .env")
        sys.exit(1)

