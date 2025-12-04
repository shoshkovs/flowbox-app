-- Миграция БД к финальной структуре согласно ТЗ
-- Приводим структуру к согласованному виду

-- ==================================================
-- 1. ТАБЛИЦА orders — приведение к финальной структуре
-- ==================================================

-- Переименовываем florist_comment в user_comment
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'florist_comment'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'user_comment'
    ) THEN
        ALTER TABLE orders RENAME COLUMN florist_comment TO user_comment;
    END IF;
END $$;

-- Добавляем delivery_zone (TEXT) если его нет
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_zone TEXT;

-- Добавляем status_comment если его нет
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS status_comment TEXT;

-- Удаляем ненужные поля (если они есть)
ALTER TABLE orders
    DROP COLUMN IF EXISTS delivery_type,
    DROP COLUMN IF EXISTS delivery_zone_id,
    DROP COLUMN IF EXISTS delivery_slot_id,
    DROP COLUMN IF EXISTS delivery_time_from,
    DROP COLUMN IF EXISTS delivery_time_to,
    DROP COLUMN IF EXISTS promocode_code;

-- Заполняем delivery_zone из delivery_price (для обратной совместимости)
UPDATE orders 
SET delivery_zone = CASE
    WHEN delivery_price = 0 THEN 'Самовывоз'
    WHEN delivery_price = 500 THEN 'В пределах КАД'
    WHEN delivery_price = 900 THEN 'До 10 км от КАД'
    WHEN delivery_price = 1300 THEN 'До 20 км от КАД'
    ELSE 'В пределах КАД'
END
WHERE delivery_zone IS NULL;

-- ==================================================
-- 2. ТАБЛИЦА products — features как TEXT[]
-- ==================================================

-- Конвертируем features из JSONB в TEXT[] если нужно
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'features' 
        AND data_type = 'jsonb'
    ) THEN
        -- Конвертируем JSONB в TEXT[]
        ALTER TABLE products
            ALTER COLUMN features TYPE TEXT[]
            USING CASE
                WHEN features IS NULL THEN NULL::TEXT[]
                WHEN jsonb_typeof(features) = 'array' THEN
                    ARRAY(SELECT jsonb_array_elements_text(features))
                ELSE ARRAY[]::TEXT[]
            END;
    END IF;
END $$;

-- Если features еще не TEXT[], создаем как TEXT[]
ALTER TABLE products
    ALTER COLUMN features TYPE TEXT[] USING COALESCE(features::TEXT[], ARRAY[]::TEXT[]);

-- ==================================================
-- 3. ТАБЛИЦА users — убираем manager_note, добавляем manager_comment
-- ==================================================

-- Переименовываем manager_note в manager_comment
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'manager_note'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'manager_comment'
    ) THEN
        ALTER TABLE users RENAME COLUMN manager_note TO manager_comment;
    END IF;
END $$;

-- Добавляем manager_comment если его нет
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS manager_comment TEXT;

-- ==================================================
-- 4. ТАБЛИЦА order_status_history — проверка структуры
-- ==================================================

-- Убеждаемся, что таблица существует и имеет нужные поля
CREATE TABLE IF NOT EXISTS order_status_history (
    id              SERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    source          TEXT,
    changed_by_id   INTEGER,
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Добавляем недостающие колонки если их нет
ALTER TABLE order_status_history
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS changed_by_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);

-- ==================================================
-- 5. ТАБЛИЦА products — проверка структуры
-- ==================================================

-- Убеждаемся, что все нужные поля есть
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS stem_length_id INTEGER REFERENCES stem_lengths(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS country_id INTEGER REFERENCES countries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS variety_id INTEGER REFERENCES varieties(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tags TEXT[];

-- ==================================================
-- 6. Удаляем неиспользуемые таблицы/поля (опционально)
-- ==================================================

-- Оставляем bonus_transactions и subscriptions как есть (они могут понадобиться позже)

-- ==================================================
-- 7. Индексы для производительности
-- ==================================================

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_color_id ON products(color_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON stock_movements(order_id);

-- ==================================================
-- ИТОГ: Проверка структуры
-- ==================================================

DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    -- Проверка orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'user_comment'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.user_comment');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivery_zone'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.delivery_zone');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'status_comment'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.status_comment');
    END IF;
    
    -- Проверка users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'manager_comment'
    ) THEN
        missing_columns := array_append(missing_columns, 'users.manager_comment');
    END IF;
    
    IF array_length(missing_columns, 1) > 0 THEN
        RAISE NOTICE 'Внимание: не все поля созданы: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ Все миграции выполнены успешно';
    END IF;
END $$;

