-- Миграция: добавление поля title_translations_json в таблицу dictations
-- Это поле хранит переводы заголовка диктанта на разные языки в формате JSON
-- Формат: {"en": "English Title", "ru": "Русский заголовок", "uk": "Український заголовок"}

ALTER TABLE dictations 
ADD COLUMN IF NOT EXISTS title_translations_json TEXT;

-- Комментарий к полю
COMMENT ON COLUMN dictations.title_translations_json IS 'JSON объект с переводами заголовка на разные языки. Формат: {"en": "Title", "ru": "Заголовок", "uk": "Заголовок"}';

