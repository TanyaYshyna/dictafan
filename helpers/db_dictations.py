"""
Функции для работы с диктантами в PostgreSQL
"""
import json
from datetime import datetime
from helpers.db import get_db_connection


def create_dictation(title, language_code, level=None, owner_id=None, is_public=True, 
                    speakers=None, audio_user_shared=None, title_translations=None, author_materials_url=None):
    """
    Создаёт новый диктант в БД
    
    Args:
        title: Название диктанта (основное, на языке оригинала)
        language_code: Код языка (en, ru, uk и т.д.)
        level: Уровень сложности (A1, A2 и т.д.)
        owner_id: ID владельца (если None - публичный)
        is_public: Публичный ли диктант
        speakers: Словарь спикеров {"1": "Таня", "2": "Ваня"} или None
        audio_user_shared: URL общего аудио файла (если есть)
        title_translations: Словарь переводов заголовка {"en": "Title", "ru": "Заголовок", "uk": "Заголовок"} или None
        author_materials_url: URL на материалы автора (если есть)
    
    Returns:
        dict: Данные созданного диктанта с полем 'id'
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Проверяем, существует ли колонка author_materials_url
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='dictations' AND column_name='author_materials_url'
            """)
            has_author_materials_url = cur.fetchone() is not None
            
            # Преобразуем speakers и title_translations в JSON строки
            speakers_json = json.dumps(speakers) if speakers else None
            title_translations_json = json.dumps(title_translations) if title_translations else None
            
            if has_author_materials_url:
                cur.execute("""
                    INSERT INTO dictations 
                    (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json, author_materials_url)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, author_materials_url, created_at, updated_at
                """, (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json, author_materials_url))
            else:
                cur.execute("""
                    INSERT INTO dictations 
                    (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, created_at, updated_at
                """, (title, language_code, level, owner_id, is_public, speakers_json, audio_user_shared, title_translations_json))
            
            row = cur.fetchone()
            conn.commit()
            
            # Преобразуем результат в словарь
            if has_author_materials_url:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'updated_at': row[11].isoformat() if row[11] else None,
                }
            else:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': None,
                    'created_at': row[9].isoformat() if row[9] else None,
                    'updated_at': row[10].isoformat() if row[10] else None,
                }
            
            return dictation
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to create dictation: {e}")
    finally:
        conn.close()


def update_dictation(dictation_id, title=None, language_code=None, level=None, 
                    is_public=None, speakers=None, audio_user_shared=None, title_translations=None, author_materials_url=None):
    """
    Обновляет диктант в БД
    
    Args:
        dictation_id: ID диктанта
        title: Новое название (если None - не обновляется)
        language_code: Новый код языка (если None - не обновляется)
        level: Новый уровень (если None - не обновляется)
        is_public: Новый статус публичности (если None - не обновляется)
        speakers: Новый словарь спикеров (если None - не обновляется)
        audio_user_shared: Новый URL общего аудио (если None - не обновляется)
        title_translations: Новый словарь переводов заголовка (если None - не обновляется)
        author_materials_url: URL на материалы автора (если None - не обновляется)
    
    Returns:
        dict: Обновлённые данные диктанта
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Проверяем, существует ли колонка author_materials_url
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='dictations' AND column_name='author_materials_url'
            """)
            has_author_materials_url = cur.fetchone() is not None
            
            # Формируем список обновляемых полей
            updates = []
            values = []
            
            if title is not None:
                updates.append("title = %s")
                values.append(title)
            
            if language_code is not None:
                updates.append("language_code = %s")
                values.append(language_code)
            
            if level is not None:
                updates.append("level = %s")
                values.append(level)
            
            if is_public is not None:
                updates.append("is_public = %s")
                values.append(is_public)
            
            if speakers is not None:
                updates.append("speakers_json = %s")
                values.append(json.dumps(speakers) if speakers else None)
            
            if audio_user_shared is not None:
                updates.append("audio_user_shared = %s")
                values.append(audio_user_shared)
            
            if title_translations is not None:
                updates.append("title_translations_json = %s")
                values.append(json.dumps(title_translations) if title_translations else None)
            
            # author_materials_url всегда обновляется, если передано (даже None для очистки)
            if has_author_materials_url:
                updates.append("author_materials_url = %s")
                values.append(author_materials_url)
            
            # Всегда обновляем updated_at
            updates.append("updated_at = CURRENT_TIMESTAMP")
            
            if not updates:
                # Ничего не обновляем, просто возвращаем текущие данные
                return get_dictation_by_id(dictation_id)
            
            values.append(dictation_id)
            
            if has_author_materials_url:
                query = f"""
                    UPDATE dictations 
                    SET {', '.join(updates)}
                    WHERE id = %s
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, author_materials_url, created_at, updated_at
                """
            else:
                query = f"""
                    UPDATE dictations 
                    SET {', '.join(updates)}
                    WHERE id = %s
                    RETURNING id, title, language_code, level, owner_id, is_public, 
                              speakers_json, audio_user_shared, title_translations_json, created_at, updated_at
                """
            
            cur.execute(query, values)
            row = cur.fetchone()
            conn.commit()
            
            if not row:
                raise Exception(f"Dictation with id {dictation_id} not found")
            
            if has_author_materials_url:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'updated_at': row[11].isoformat() if row[11] else None,
                }
            else:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': None,
                    'created_at': row[9].isoformat() if row[9] else None,
                    'updated_at': row[10].isoformat() if row[10] else None,
                }
            
            return dictation
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to update dictation: {e}")
    finally:
        conn.close()


def get_dictation_by_id(dictation_id):
    """
    Получает диктант по ID
    
    Args:
        dictation_id: ID диктанта
    
    Returns:
        dict: Данные диктанта или None если не найден
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Проверяем, существует ли колонка author_materials_url
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='dictations' AND column_name='author_materials_url'
            """)
            has_author_materials_url = cur.fetchone() is not None
            
            if has_author_materials_url:
                cur.execute("""
                    SELECT id, title, language_code, level, owner_id, is_public, 
                           speakers_json, audio_user_shared, title_translations_json, author_materials_url, created_at, updated_at
                    FROM dictations
                    WHERE id = %s
                """, (dictation_id,))
            else:
                cur.execute("""
                    SELECT id, title, language_code, level, owner_id, is_public, 
                           speakers_json, audio_user_shared, title_translations_json, created_at, updated_at
                    FROM dictations
                    WHERE id = %s
                """, (dictation_id,))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            if has_author_materials_url:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'updated_at': row[11].isoformat() if row[11] else None,
                }
            else:
                dictation = {
                    'id': row[0],
                    'title': row[1],
                    'language_code': row[2],
                    'level': row[3],
                    'owner_id': row[4],
                    'is_public': row[5],
                    'speakers': json.loads(row[6]) if row[6] else {},
                    'audio_user_shared': row[7],
                    'title_translations': json.loads(row[8]) if row[8] else {},
                    'author_materials_url': None,
                    'created_at': row[9].isoformat() if row[9] else None,
                    'updated_at': row[10].isoformat() if row[10] else None,
                }
            
            return dictation
    except Exception as e:
        raise Exception(f"Failed to get dictation: {e}")
    finally:
        conn.close()


def add_sentence(dictation_id, language_code, sentence_key, text, explanation=None,
                speaker=None, audio=None, audio_avto=None, audio_mic=None, audio_user=None,
                start=None, end=None, chain=False, checked=False):
    """
    Добавляет предложение к диктанту
    
    Args:
        dictation_id: ID диктанта
        language_code: Код языка предложения
        sentence_key: Ключ предложения (000, 001 и т.д.)
        text: Текст предложения
        explanation: Пояснение/подсказка
        speaker: ID спикера
        audio: Основной аудио файл
        audio_avto: Автоматический аудио файл
        audio_mic: Микрофонный аудио файл
        audio_user: Пользовательский аудио файл
        start: Начало в секундах
        end: Конец в секундах
        chain: Цепочка
        checked: Выбрано по умолчанию
    
    Returns:
        dict: Данные созданного предложения с полем 'id'
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO dictation_sentences 
                (dictation_id, language_code, sentence_key, text, explanation, speaker,
                 audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, dictation_id, language_code, sentence_key, text, explanation,
                          speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked
            """, (dictation_id, language_code, sentence_key, text, explanation, speaker,
                  audio, audio_avto, audio_mic, audio_user, start, end, chain, checked))
            
            row = cur.fetchone()
            conn.commit()
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
            }
            
            return sentence
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to add sentence: {e}")
    finally:
        conn.close()


def update_sentence(sentence_id, text=None, explanation=None, speaker=None,
                   audio=None, audio_avto=None, audio_mic=None, audio_user=None,
                   start=None, end=None, chain=None, checked=None):
    """
    Обновляет предложение
    
    Args:
        sentence_id: ID предложения
        Остальные параметры: новые значения (если None - не обновляется)
    
    Returns:
        dict: Обновлённые данные предложения
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            updates = []
            values = []
            
            if text is not None:
                updates.append("text = %s")
                values.append(text)
            
            if explanation is not None:
                updates.append("explanation = %s")
                values.append(explanation)
            
            if speaker is not None:
                updates.append("speaker = %s")
                values.append(speaker)
            
            if audio is not None:
                updates.append("audio = %s")
                values.append(audio)
            
            if audio_avto is not None:
                updates.append("audio_avto = %s")
                values.append(audio_avto)
            
            if audio_mic is not None:
                updates.append("audio_mic = %s")
                values.append(audio_mic)
            
            if audio_user is not None:
                updates.append("audio_user = %s")
                values.append(audio_user)
            
            if start is not None:
                updates.append("start = %s")
                values.append(start)
            
            if end is not None:
                updates.append('"end" = %s')
                values.append(end)
            
            if chain is not None:
                updates.append("chain = %s")
                values.append(chain)
            
            if checked is not None:
                updates.append("checked = %s")
                values.append(checked)
            
            if not updates:
                # Ничего не обновляем
                return get_sentence_by_id(sentence_id)
            
            values.append(sentence_id)
            
            query = f"""
                UPDATE dictation_sentences 
                SET {', '.join(updates)}
                WHERE id = %s
                RETURNING id, dictation_id, language_code, sentence_key, text, explanation,
                          speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked
            """
            
            cur.execute(query, values)
            row = cur.fetchone()
            conn.commit()
            
            if not row:
                raise Exception(f"Sentence with id {sentence_id} not found")
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
            }
            
            return sentence
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to update sentence: {e}")
    finally:
        conn.close()


def get_sentence_by_id(sentence_id):
    """
    Получает предложение по ID
    
    Args:
        sentence_id: ID предложения
    
    Returns:
        dict: Данные предложения или None если не найдено
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                       speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked
                FROM dictation_sentences
                WHERE id = %s
            """, (sentence_id,))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
            }
            
            return sentence
    except Exception as e:
        raise Exception(f"Failed to get sentence: {e}")
    finally:
        conn.close()


def get_sentence_by_key(dictation_id, language_code, sentence_key):
    """
    Получает предложение по ключу (dictation_id, language_code, sentence_key)
    
    Args:
        dictation_id: ID диктанта
        language_code: Код языка
        sentence_key: Ключ предложения (000, 001 и т.д.)
    
    Returns:
        dict: Данные предложения или None если не найдено
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                       speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked
                FROM dictation_sentences
                WHERE dictation_id = %s AND language_code = %s AND sentence_key = %s
            """, (dictation_id, language_code, sentence_key))
            
            row = cur.fetchone()
            
            if not row:
                return None
            
            sentence = {
                'id': row[0],
                'dictation_id': row[1],
                'language_code': row[2],
                'sentence_key': row[3],
                'text': row[4],
                'explanation': row[5],
                'speaker': row[6],
                'audio': row[7],
                'audio_avto': row[8],
                'audio_mic': row[9],
                'audio_user': row[10],
                'start': float(row[11]) if row[11] is not None else None,
                'end': float(row[12]) if row[12] is not None else None,
                'chain': row[13],
                'checked': row[14],
            }
            
            return sentence
    except Exception as e:
        raise Exception(f"Failed to get sentence by key: {e}")
    finally:
        conn.close()


def get_dictation_sentences(dictation_id, language_code=None):
    """
    Получает все предложения диктанта
    
    Args:
        dictation_id: ID диктанта
        language_code: Код языка (если указан - только предложения этого языка)
    
    Returns:
        list: Список предложений
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if language_code:
                cur.execute("""
                    SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                           speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked
                    FROM dictation_sentences
                    WHERE dictation_id = %s AND language_code = %s
                    ORDER BY sentence_key
                """, (dictation_id, language_code))
            else:
                cur.execute("""
                    SELECT id, dictation_id, language_code, sentence_key, text, explanation,
                           speaker, audio, audio_avto, audio_mic, audio_user, start, "end", chain, checked
                    FROM dictation_sentences
                    WHERE dictation_id = %s
                    ORDER BY language_code, sentence_key
                """, (dictation_id,))
            
            rows = cur.fetchall()
            
            sentences = []
            for row in rows:
                sentence = {
                    'id': row[0],
                    'dictation_id': row[1],
                    'language_code': row[2],
                    'sentence_key': row[3],
                    'text': row[4],
                    'explanation': row[5],
                    'speaker': row[6],
                    'audio': row[7],
                    'audio_avto': row[8],
                    'audio_mic': row[9],
                    'audio_user': row[10],
                    'start': float(row[11]) if row[11] is not None else None,
                    'end': float(row[12]) if row[12] is not None else None,
                    'chain': row[13],
                    'checked': row[14],
                }
                sentences.append(sentence)
            
            return sentences
    except Exception as e:
        raise Exception(f"Failed to get sentences: {e}")
    finally:
        conn.close()


def delete_sentence(sentence_id):
    """
    Удаляет предложение
    
    Args:
        sentence_id: ID предложения
    
    Returns:
        bool: True если удалено успешно
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dictation_sentences WHERE id = %s", (sentence_id,))
            conn.commit()
            return cur.rowcount > 0
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to delete sentence: {e}")
    finally:
        conn.close()


def delete_dictation(dictation_id):
    """
    Удаляет диктант и все его предложения (CASCADE)
    
    Args:
        dictation_id: ID диктанта
    
    Returns:
        bool: True если удалено успешно
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dictations WHERE id = %s", (dictation_id,))
            conn.commit()
            return cur.rowcount > 0
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to delete dictation: {e}")
    finally:
        conn.close()

