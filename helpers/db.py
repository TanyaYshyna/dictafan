"""
Модуль для работы с базой данных PostgreSQL
"""
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Optional


def get_db_connection():
    """
    Создаёт и возвращает подключение к базе данных PostgreSQL
    
    Читает DATABASE_URL из переменных окружения.
    Если ENV=dev - подключается к локальной БД
    Если ENV=prod - подключается к Railway Postgres
    
    Returns:
        psycopg2.connection: Подключение к БД
        
    Raises:
        Exception: Если не удалось подключиться к БД
    """
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        raise ValueError(
            "DATABASE_URL не установлен в переменных окружения. "
            "Проверь файл .env или настройки Railway."
        )
    
    try:
        conn = psycopg2.connect(database_url)
        return conn
    except psycopg2.Error as e:
        raise Exception(f"Ошибка подключения к базе данных: {e}")


def get_db_cursor(conn=None, dict_cursor=True):
    """
    Создаёт курсор для работы с БД
    
    Args:
        conn: Подключение к БД (если None, создаст новое)
        dict_cursor: Если True, возвращает RealDictCursor (результаты как словари)
    
    Returns:
        tuple: (connection, cursor) - подключение и курсор
    """
    if conn is None:
        conn = get_db_connection()
    
    if dict_cursor:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
    else:
        cursor = conn.cursor()
    
    return conn, cursor


def test_connection():
    """
    Тестовая функция для проверки подключения к БД
    
    Returns:
        bool: True если подключение успешно
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        cursor.close()
        conn.close()
        print(f"✅ Подключение к БД успешно! PostgreSQL версия: {version[0]}")
        return True
    except Exception as e:
        print(f"❌ Ошибка подключения к БД: {e}")
        return False

