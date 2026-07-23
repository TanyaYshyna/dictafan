-- Удаление ошибочной записи из history_current
-- Запись с id=257 содержит некорректные данные

DELETE FROM history_current WHERE id = 257;
