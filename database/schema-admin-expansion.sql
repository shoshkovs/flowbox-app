-- Расширение схемы БД для новой админ-панели
-- Добавляет таблицы для склада, движений, аналитики и расширенные поля

-- ==================== СКЛАД ====================

-- Таблица остатков на складе
CREATE TABLE IF NOT EXISTS warehouse_stock (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL DEFAULT 0, -- текущий остаток
    cost_price      DECIMAL(10,2), -- цена закупки за единицу
    warehouse_name  TEXT DEFAULT 'main', -- название склада (если несколько)
    min_threshold   INTEGER DEFAULT 10, -- минимальный порог для предупреждения
    last_restock_date TIMESTAMPTZ, -- дата последней поставки
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, warehouse_name)
);

-- Таблица движений по складу (приход/расход)
CREATE TABLE IF NOT EXISTS warehouse_movements (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type   TEXT NOT NULL, -- 'in' (приход), 'out' (расход), 'writeoff' (списание), 'sale' (продажа)
    quantity        INTEGER NOT NULL,
    cost_price      DECIMAL(10,2), -- цена закупки на момент движения
    warehouse_name  TEXT DEFAULT 'main',
    order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL, -- если связано с заказом
    comment         TEXT, -- комментарий (поставщик, номер накладной, причина списания)
    created_by      INTEGER, -- ID админа/оператора (позже добавим таблицу admin_users)
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Индекс для быстрого поиска движений по товару
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_product ON warehouse_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_date ON warehouse_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_type ON warehouse_movements(movement_type);

-- ==================== РАСШИРЕНИЕ ТАБЛИЦЫ PRODUCTS ====================

-- Добавляем поля в таблицу products, если их еще нет
DO $$ 
BEGIN
    -- Страна происхождения
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='country') THEN
        ALTER TABLE products ADD COLUMN country TEXT;
    END IF;
    
    -- Сорт
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='variety') THEN
        ALTER TABLE products ADD COLUMN variety TEXT;
    END IF;
    
    -- Длина стебля (см)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='stem_length') THEN
        ALTER TABLE products ADD COLUMN stem_length INTEGER;
    END IF;
    
    -- Количество стеблей в единице
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='stems_per_unit') THEN
        ALTER TABLE products ADD COLUMN stems_per_unit INTEGER DEFAULT 1;
    END IF;
    
    -- Флаги
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='is_hidden') THEN
        ALTER TABLE products ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='is_bestseller') THEN
        ALTER TABLE products ADD COLUMN is_bestseller BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='is_new') THEN
        ALTER TABLE products ADD COLUMN is_new BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Цена закупки (если еще нет)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='cost_price') THEN
        ALTER TABLE products ADD COLUMN cost_price DECIMAL(10,2);
    END IF;
END $$;

-- ==================== РАСШИРЕНИЕ ТАБЛИЦЫ ORDERS ====================

-- Добавляем поля для расширенной информации о заказе
DO $$ 
BEGIN
    -- Канал создания заказа
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='source') THEN
        ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'miniapp'; -- 'miniapp', 'operator', 'test'
    END IF;
    
    -- UTM метки
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='utm_source') THEN
        ALTER TABLE orders ADD COLUMN utm_source TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='utm_medium') THEN
        ALTER TABLE orders ADD COLUMN utm_medium TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='utm_campaign') THEN
        ALTER TABLE orders ADD COLUMN utm_campaign TEXT;
    END IF;
    
    -- Способ оплаты
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='payment_method') THEN
        ALTER TABLE orders ADD COLUMN payment_method TEXT; -- 'online', 'cash', 'courier'
    END IF;
    
    -- Комментарий для курьера
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='courier_comment') THEN
        ALTER TABLE orders ADD COLUMN courier_comment TEXT;
    END IF;
    
    -- Внутренний комментарий
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='internal_comment') THEN
        ALTER TABLE orders ADD COLUMN internal_comment TEXT;
    END IF;
END $$;

-- ==================== АНАЛИТИКА ====================

-- Таблица событий воронки (для аналитики трафика)
CREATE TABLE IF NOT EXISTS analytics_events (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    telegram_id     BIGINT, -- для анонимных пользователей
    event_type      TEXT NOT NULL, -- 'bot_start', 'miniapp_open', 'profile_filled', 'cart_add', 'checkout_start', 'payment_success'
    session_id      TEXT, -- ID сессии для группировки событий
    utm_source      TEXT,
    utm_medium      TEXT,
    utm_campaign    TEXT,
    metadata        JSONB, -- дополнительные данные события
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Индексы для аналитики
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_date ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);

-- ==================== РАСШИРЕНИЕ ТАБЛИЦЫ USERS ====================

-- Добавляем поля для клиентов
DO $$ 
BEGIN
    -- Дата регистрации (если еще нет)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='registered_at') THEN
        ALTER TABLE users ADD COLUMN registered_at TIMESTAMPTZ DEFAULT now();
    END IF;
    
    -- Комментарий менеджера
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='manager_comment') THEN
        ALTER TABLE users ADD COLUMN manager_comment TEXT;
    END IF;
END $$;

-- ==================== НАСТРОЙКИ ====================

-- Таблица настроек системы
CREATE TABLE IF NOT EXISTS system_settings (
    id              SERIAL PRIMARY KEY,
    key             TEXT UNIQUE NOT NULL, -- 'min_order_amount', 'service_fee', 'delivery_zones', etc.
    value           JSONB NOT NULL, -- значение настройки (может быть объектом)
    description     TEXT,
    updated_by      INTEGER, -- ID админа, который изменил
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Вставляем дефолтные настройки
INSERT INTO system_settings (key, value, description) VALUES
    ('min_order_amount', '{"value": 0}', 'Минимальная сумма заказа'),
    ('service_fee', '{"value": 450}', 'Сервисный сбор'),
    ('tax_rate', '{"value": 20}', 'Процент налога для аналитики'),
    ('working_hours', '{"start": "09:00", "end": "21:00"}', 'Время работы'),
    ('default_city', '{"value": "Санкт-Петербург"}', 'Город по умолчанию')
ON CONFLICT (key) DO NOTHING;

-- ==================== ТРИГГЕРЫ ====================

-- Триггер для автоматического обновления остатков при движении
CREATE OR REPLACE FUNCTION update_warehouse_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.movement_type = 'in' THEN
        -- Приход: увеличиваем остаток
        INSERT INTO warehouse_stock (product_id, quantity, cost_price, warehouse_name, last_restock_date)
        VALUES (NEW.product_id, NEW.quantity, NEW.cost_price, NEW.warehouse_name, NEW.created_at)
        ON CONFLICT (product_id, warehouse_name) 
        DO UPDATE SET 
            quantity = warehouse_stock.quantity + NEW.quantity,
            cost_price = NEW.cost_price,
            last_restock_date = NEW.created_at,
            updated_at = now();
    ELSIF NEW.movement_type IN ('out', 'sale', 'writeoff') THEN
        -- Расход: уменьшаем остаток
        UPDATE warehouse_stock 
        SET quantity = GREATEST(0, quantity - NEW.quantity),
            updated_at = now()
        WHERE product_id = NEW.product_id 
          AND warehouse_name = NEW.warehouse_name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_warehouse_stock
AFTER INSERT ON warehouse_movements
FOR EACH ROW
EXECUTE FUNCTION update_warehouse_stock();

-- Триггер для автоматического списания со склада при оплате заказа
CREATE OR REPLACE FUNCTION auto_writeoff_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    order_item RECORD;
BEGIN
    -- Если заказ перешел в статус "Оплачен" или "Закупка"
    IF NEW.status IN ('paid', 'purchasing') AND (OLD.status IS NULL OR OLD.status NOT IN ('paid', 'purchasing')) THEN
        -- Списываем товары со склада
        FOR order_item IN 
            SELECT product_id, quantity 
            FROM order_items 
            WHERE order_id = NEW.id
        LOOP
            INSERT INTO warehouse_movements (product_id, movement_type, quantity, order_id, comment)
            VALUES (order_item.product_id, 'sale', order_item.quantity, NEW.id, 
                    'Автоматическое списание при оплате заказа #' || NEW.id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_writeoff_on_payment
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION auto_writeoff_on_payment();

-- ==================== ВИДЫ (VIEWS) ДЛЯ АНАЛИТИКИ ====================

-- Вид для статистики по товарам
CREATE OR REPLACE VIEW product_stats AS
SELECT 
    p.id,
    p.name,
    COUNT(DISTINCT oi.order_id) as orders_count,
    SUM(oi.quantity) as total_sold,
    SUM(oi.quantity * oi.price) as total_revenue,
    AVG(oi.price) as avg_price,
    ws.quantity as stock_quantity,
    ws.cost_price
FROM products p
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('delivered', 'completed')
LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND ws.warehouse_name = 'main'
GROUP BY p.id, p.name, ws.quantity, ws.cost_price;

-- Вид для статистики по клиентам
CREATE OR REPLACE VIEW customer_stats AS
SELECT 
    u.id,
    u.telegram_id,
    u.first_name,
    u.last_name,
    u.phone,
    u.bonuses,
    COUNT(DISTINCT o.id) as orders_count,
    SUM(o.total) as total_spent,
    AVG(o.total) as avg_order_value,
    MIN(o.created_at) as first_order_date,
    MAX(o.created_at) as last_order_date
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.telegram_id, u.first_name, u.last_name, u.phone, u.bonuses;

