-- Схема базы данных для FlowBox Telegram MiniApp

-- Пользователи Telegram
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    telegram_id     BIGINT UNIQUE NOT NULL,
    username        TEXT,
    first_name      TEXT,
    last_name       TEXT,
    phone           TEXT,
    email           TEXT,
    bonuses         INTEGER DEFAULT 500,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Адреса пользователя
CREATE TABLE IF NOT EXISTS addresses (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,             -- "Мой дом", "Дом мамы"
    city            TEXT NOT NULL,
    street          TEXT NOT NULL,
    house           TEXT NOT NULL,
    entrance        TEXT,
    apartment       TEXT,
    floor           TEXT,
    intercom        TEXT,
    comment         TEXT,
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Заказы
CREATE TABLE IF NOT EXISTS orders (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'active',  -- active / completed / cancelled
    total           INTEGER NOT NULL,                -- сумма с доставкой и сборами
    flowers_total   INTEGER NOT NULL,                -- только цветы
    service_fee     INTEGER NOT NULL DEFAULT 450,
    delivery_price  INTEGER NOT NULL DEFAULT 0,
    bonus_used      INTEGER NOT NULL DEFAULT 0,
    bonus_earned    INTEGER NOT NULL DEFAULT 0,
    recipient_name  TEXT,
    recipient_phone TEXT,
    address_string  TEXT NOT NULL,                   -- человекочитаемый адрес
    address_json    JSONB,                           -- полные данные адреса с формы
    delivery_date   DATE,
    delivery_time   TEXT,
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Позиции в заказе
CREATE TABLE IF NOT EXISTS order_items (
    id              SERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER,
    name            TEXT NOT NULL,
    price           INTEGER NOT NULL,
    quantity        INTEGER NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

