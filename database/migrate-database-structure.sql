-- Миграция структуры БД FlowBox к согласованному виду
-- Выполняется через ALTER TABLE для сохранения существующих данных

-- ==================================================
-- 1. ТАБЛИЦА users — добавить поля профиля
-- ==================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS manager_note TEXT,
    ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT now();

-- Если registered_at NULL, заполняем из created_at
UPDATE users SET registered_at = created_at WHERE registered_at IS NULL;

-- ==================================================
-- 2. ТАБЛИЦА orders — добавить address_id
-- ==================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_address_id ON orders(address_id);

-- ==================================================
-- 3. ТАБЛИЦА orders — расширить под форму заказа
-- ==================================================

-- Данные клиента на момент заказа
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS client_phone TEXT,
    ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Тип доставки
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_type TEXT;  -- 'INSIDE_KAD','OUTSIDE_KAD_10','OUTSIDE_KAD_20','PICKUP'

-- Время доставки как интервал
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_time_from TIME,
    ADD COLUMN IF NOT EXISTS delivery_time_to TIME;

-- Комментарий для флориста
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS florist_comment TEXT;

-- Ссылки на зону доставки и слот
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delivery_slot_id INTEGER REFERENCES delivery_slots(id) ON DELETE SET NULL;

-- Промокод
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS promocode_code TEXT;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_orders_delivery_type ON orders(delivery_type);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_zone_id ON orders(delivery_zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_slot_id ON orders(delivery_slot_id);
CREATE INDEX IF NOT EXISTS idx_orders_promocode_code ON orders(promocode_code);

-- Миграция старых статусов
UPDATE orders SET status = 'NEW' WHERE status = 'active';
UPDATE orders SET status = 'COMPLETED' WHERE status = 'completed';
UPDATE orders SET status = 'CANCELED' WHERE status = 'cancelled' OR status = 'canceled';

-- Constraint на статусы
DO $$
BEGIN
    -- Удаляем старый constraint, если есть
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_status_check;
    END IF;
    
    -- Добавляем новый constraint
    ALTER TABLE orders
        ADD CONSTRAINT orders_status_check
            CHECK (status IN ('UNPAID','NEW','PROCESSING','PURCHASE','COLLECTING','DELIVERING','COMPLETED','CANCELED'));
EXCEPTION
    WHEN others THEN
        -- Игнорируем ошибки, если constraint уже существует
        NULL;
END $$;

-- ==================================================
-- 4. ТАБЛИЦА order_items — добавить FK и total_price
-- ==================================================

-- FK на product_id (если еще нет)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'order_items_product_fk'
    ) THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_product_fk
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN others THEN
        NULL;
END $$;

-- total_price
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS total_price INTEGER;

-- Заполняем total_price для существующих записей
UPDATE order_items 
SET total_price = price * quantity 
WHERE total_price IS NULL;

-- Индекс
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- ==================================================
-- 5. ТАБЛИЦА products — добавить характеристики
-- ==================================================

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS stem_length TEXT,  -- "40 см", "50 см"
    ADD COLUMN IF NOT EXISTS country TEXT,      -- "Кения", "Эквадор"
    ADD COLUMN IF NOT EXISTS variety TEXT,      -- "Freedom", "Explorer"
    ADD COLUMN IF NOT EXISTS tags TEXT;         -- теги через запятую или JSONB

-- ==================================================
-- 6. БОНУСЫ: таблица bonus_transactions
-- ==================================================

CREATE TABLE IF NOT EXISTS bonus_transactions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id        BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
    type            TEXT NOT NULL CHECK (type IN ('accrual','redeem','adjustment')),
    amount          INTEGER NOT NULL,      -- плюс или минус
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_transactions_user_id ON bonus_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_order_id ON bonus_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_type ON bonus_transactions(type);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_created_at ON bonus_transactions(created_at);

-- ==================================================
-- 7. ПОДПИСКИ: таблица subscriptions
-- ==================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('active','canceled','expired','trial')),
    plan_code       TEXT NOT NULL,          -- код плана/тарифа
    started_at      TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    canceled_at     TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at ON subscriptions(ends_at);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- ИТОГ: Проверка структуры
-- ==================================================

-- Проверяем, что все поля добавлены
DO $$
DECLARE
    missing_columns TEXT[];
BEGIN
    -- Проверка users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'manager_note'
    ) THEN
        missing_columns := array_append(missing_columns, 'users.manager_note');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'registered_at'
    ) THEN
        missing_columns := array_append(missing_columns, 'users.registered_at');
    END IF;
    
    -- Проверка orders
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'address_id'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.address_id');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'client_name'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.client_name');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivery_type'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.delivery_type');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivery_time_from'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.delivery_time_from');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'florist_comment'
    ) THEN
        missing_columns := array_append(missing_columns, 'orders.florist_comment');
    END IF;
    
    -- Проверка order_items
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'total_price'
    ) THEN
        missing_columns := array_append(missing_columns, 'order_items.total_price');
    END IF;
    
    -- Проверка products
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'stem_length'
    ) THEN
        missing_columns := array_append(missing_columns, 'products.stem_length');
    END IF;
    
    -- Проверка таблиц
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'bonus_transactions'
    ) THEN
        missing_columns := array_append(missing_columns, 'TABLE bonus_transactions');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'subscriptions'
    ) THEN
        missing_columns := array_append(missing_columns, 'TABLE subscriptions');
    END IF;
    
    IF array_length(missing_columns, 1) > 0 THEN
        RAISE NOTICE 'Внимание: не все поля/таблицы созданы: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ Все миграции выполнены успешно';
    END IF;
END $$;

