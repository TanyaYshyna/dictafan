-- Удаляем колонку speaker из dictation_sentences
-- speaker был полем для диалогов (автор реплики), но теперь диалоги
-- не поддерживаются в новой архитектуре DictationContent

ALTER TABLE dictation_sentences DROP COLUMN IF EXISTS speaker;
