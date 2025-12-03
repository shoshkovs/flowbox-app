-- Миграция: обновление поля price -> price_per_stem
-- Если price_per_stem еще не существует, создаем его
-- Если price существует и NOT NULL, делаем его nullable или удаляем

-- Шаг 1: Если price_per_stem еще не существует, создаем его
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'price_per_stem'
    ) THEN
        -- Создаем price_per_stem как INTEGER
        ALTER TABLE products ADD COLUMN price_per_stem INTEGER;
        
        -- Копируем данные из price в price_per_stem, если price существует
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'price'
        ) THEN
            UPDATE products SET price_per_stem = price WHERE price IS NOT NULL;
        END IF;
        
        -- Делаем price_per_stem NOT NULL после копирования данных
        ALTER TABLE products ALTER COLUMN price_per_stem SET NOT NULL;
        ALTER TABLE products ALTER COLUMN price_per_stem SET DEFAULT 0;
    ELSE
        -- Если price_per_stem существует, но это DECIMAL, конвертируем в INTEGER
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'products' 
            AND column_name = 'price_per_stem' 
            AND data_type IN ('numeric', 'decimal')
        ) THEN
            ALTER TABLE products ALTER COLUMN price_per_stem TYPE INTEGER USING ROUND(price_per_stem)::INTEGER;
        END IF;
    END IF;
END $$;

-- Шаг 2: Делаем старое поле price nullable (если оно существует)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'price'
    ) THEN
        -- Убираем NOT NULL constraint
        ALTER TABLE products ALTER COLUMN price DROP NOT NULL;
        -- Можно также удалить поле позже, но пока оставим для обратной совместимости
    END IF;
END $$;

-- Шаг 3: Делаем description nullable (если оно NOT NULL)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'description' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE products ALTER COLUMN description DROP NOT NULL;
    END IF;
END $$;

