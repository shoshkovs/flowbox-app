-- Миграция: изменение типа поля features с TEXT[] на JSONB
-- Это позволит хранить структурированные данные (stem_length, variety, country и т.д.)

-- Сначала создаем резервную копию данных
DO $$
BEGIN
    -- Если features содержит массив строк, конвертируем его в JSONB
    -- Если уже JSONB, оставляем как есть
    UPDATE products 
    SET features = CASE 
        WHEN features IS NULL THEN NULL::jsonb
        WHEN pg_typeof(features) = 'text[]'::regtype THEN 
            jsonb_build_array(features)
        ELSE features::jsonb
    END
    WHERE features IS NOT NULL;
END $$;

-- Изменяем тип колонки
ALTER TABLE products 
ALTER COLUMN features TYPE JSONB 
USING CASE 
    WHEN features IS NULL THEN NULL::jsonb
    WHEN pg_typeof(features) = 'text[]'::regtype THEN 
        jsonb_build_array(features)
    ELSE features::jsonb
END;

-- Добавляем комментарий к колонке
COMMENT ON COLUMN products.features IS 'JSONB объект с характеристиками товара: {stem_length, variety, country, stems_count, tags, is_bestseller, is_new}';

