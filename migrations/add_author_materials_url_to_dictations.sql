-- Добавляем поле author_materials_url в таблицу dictations
-- Это поле для хранения URL на материалы автора (ссылка на внешний ресурс)

-- Проверяем, что поле еще не существует, и добавляем его
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'dictations' 
        AND column_name = 'author_materials_url'
    ) THEN
        ALTER TABLE dictations 
        ADD COLUMN author_materials_url VARCHAR(500);
        
        COMMENT ON COLUMN dictations.author_materials_url IS 
        'URL на материалы автора (ссылка на внешний ресурс)';
    END IF;
END $$;

