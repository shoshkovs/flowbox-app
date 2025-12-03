-- Расширение схемы базы данных для FlowBox
-- Добавляет функционал админки, курьеров, зон доставки и промокодов

-- ==================== АДМИНКА ====================

-- Пользователи админки (админы и операторы)
CREATE TABLE IF NOT EXISTS admin_users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'operator', -- 'admin' или 'operator'
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ==================== КУРЬЕРЫ ====================

-- Курьеры
CREATE TABLE IF NOT EXISTS couriers (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL UNIQUE,
    pin_code        TEXT NOT NULL, -- PIN-код для входа
    zone_id         INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    total_deliveries INTEGER DEFAULT 0,
    avg_delivery_time INTEGER, -- среднее время доставки в минутах
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ==================== ДОСТАВКА ====================

-- Зоны доставки
CREATE TABLE IF NOT EXISTS delivery_zones (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE, -- "В пределах КАД", "До 10 км от КАД"
    price           INTEGER NOT NULL DEFAULT 0,
    free_from_amount INTEGER, -- бесплатная доставка от суммы
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Временные слоты доставки
CREATE TABLE IF NOT EXISTS delivery_slots (
    id              SERIAL PRIMARY KEY,
    start_time      TIME NOT NULL, -- "10:00"
    end_time        TIME NOT NULL, -- "12:00"
    max_orders      INTEGER DEFAULT 10, -- максимум заказов на слот
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ==================== ПРОМОКОДЫ ====================

-- Промокоды
CREATE TABLE IF NOT EXISTS promocodes (
    id              SERIAL PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL, -- "FLOW10"
    type            TEXT NOT NULL, -- 'fixed' (фиксированная скидка) или 'percent' (процент)
    value           INTEGER NOT NULL, -- сумма скидки или процент
    min_order       INTEGER DEFAULT 0, -- минимальная сумма заказа
    start_date      DATE,
    end_date        DATE,
    max_uses        INTEGER, -- максимальное количество использований
    used_count      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- История использования промокодов
CREATE TABLE IF NOT EXISTS promocode_uses (
    id              SERIAL PRIMARY KEY,
    promocode_id    INTEGER NOT NULL REFERENCES promocodes(id) ON DELETE CASCADE,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    discount_amount INTEGER NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ==================== РАСШИРЕНИЕ ТАБЛИЦЫ ЗАКАЗОВ ====================

-- Добавляем поля в таблицу orders
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS courier_id INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid', -- 'paid' или 'unpaid'
    ADD COLUMN IF NOT EXISTS payment_method TEXT, -- 'online' или 'cash'
    ADD COLUMN IF NOT EXISTS promocode_id INTEGER REFERENCES promocodes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0;

-- Обновляем статусы заказов (расширяем список)
-- Старые значения: 'active', 'completed', 'cancelled'
-- Новые значения: 'new', 'confirmed', 'preparing', 'assigned', 'in_transit', 'delivered', 'cancelled'

-- История изменения статусов заказов
CREATE TABLE IF NOT EXISTS order_status_history (
    id              SERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    changed_by      TEXT, -- 'admin', 'operator', 'courier', 'system'
    changed_by_id   INTEGER, -- ID админа/оператора/курьера
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ==================== РАСШИРЕНИЕ ТАБЛИЦЫ ТОВАРОВ ====================

-- Добавляем поля в таблицу products
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS cost_price INTEGER, -- себестоимость
    ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 1, -- минимальное количество
    ADD COLUMN IF NOT EXISTS step INTEGER DEFAULT 1, -- шаг добавления (5, 10, 25)
    ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0; -- остаток на складе

-- ==================== НАСТРОЙКИ ====================

-- Общие настройки системы
CREATE TABLE IF NOT EXISTS settings (
    id              SERIAL PRIMARY KEY,
    key             TEXT UNIQUE NOT NULL, -- 'min_order_amount', 'bonus_percent', etc.
    value           TEXT NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ==================== ИНДЕКСЫ ====================

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_couriers_phone ON couriers(phone);
CREATE INDEX IF NOT EXISTS idx_couriers_zone ON couriers(zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_promocodes_code ON promocodes(code);
CREATE INDEX IF NOT EXISTS idx_promocode_uses_order ON promocode_uses(order_id);

-- ==================== ТРИГГЕРЫ ====================

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_couriers_updated_at BEFORE UPDATE ON couriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_slots_updated_at BEFORE UPDATE ON delivery_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promocodes_updated_at BEFORE UPDATE ON promocodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Триггер для автоматической записи истории изменения статусов
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_history (order_id, status, changed_by, changed_by_id)
        VALUES (NEW.id, NEW.status, 'system', NULL);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER log_order_status_change_trigger
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_order_status_change();

-- ==================== НАЧАЛЬНЫЕ ДАННЫЕ ====================

-- Создаем дефолтного админа (пароль нужно будет хешировать в коде)
-- Пароль по умолчанию: admin123 (нужно изменить!)
INSERT INTO admin_users (email, password_hash, name, role) 
VALUES ('admin@flowbox.ru', '$2b$10$placeholder', 'Администратор', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Создаем дефолтные зоны доставки
INSERT INTO delivery_zones (name, price, free_from_amount) VALUES
    ('В пределах КАД', 500, NULL),
    ('До 10 км от КАД', 900, NULL),
    ('До 20 км от КАД', 1300, NULL),
    ('Самовывоз', 0, NULL)
ON CONFLICT (name) DO NOTHING;

-- Создаем дефолтные временные слоты
INSERT INTO delivery_slots (start_time, end_time, max_orders) VALUES
    ('10:00', '12:00', 10),
    ('12:00', '14:00', 10),
    ('14:00', '16:00', 10),
    ('16:00', '18:00', 10),
    ('18:00', '20:00', 10)
ON CONFLICT DO NOTHING;

-- Создаем дефолтные настройки
INSERT INTO settings (key, value, description) VALUES
    ('min_order_amount', '1000', 'Минимальная сумма заказа'),
    ('bonus_percent', '1', 'Процент начисления бонусов'),
    ('bonus_max_percent', '50', 'Максимальный процент оплаты бонусами'),
    ('service_fee', '450', 'Сервисный сбор'),
    ('support_phone', '+7 (999) 123-45-67', 'Телефон поддержки')
ON CONFLICT (key) DO NOTHING;

