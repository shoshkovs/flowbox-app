-- Таблицы для учета склада и движений

-- Таблица поставок
CREATE TABLE IF NOT EXISTS supplies (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_purchase_price DECIMAL(10,2) NOT NULL CHECK (unit_purchase_price > 0),
    delivery_date   DATE NOT NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Таблица движений по складу
CREATE TABLE IF NOT EXISTS stock_movements (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('SUPPLY', 'SALE', 'WRITE_OFF')),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    supply_id       INTEGER REFERENCES supplies(id) ON DELETE SET NULL,
    order_id        BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_supplies_product_id ON supplies(product_id);
CREATE INDEX IF NOT EXISTS idx_supplies_delivery_date ON supplies(delivery_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_supply_id ON stock_movements(supply_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON stock_movements(order_id);

-- Триггер для автоматического обновления updated_at в supplies
CREATE TRIGGER update_supplies_updated_at BEFORE UPDATE ON supplies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Комментарии
COMMENT ON TABLE supplies IS 'Поставки товаров на склад';
COMMENT ON TABLE stock_movements IS 'Движения по складу: поставки, продажи, списания';
COMMENT ON COLUMN stock_movements.type IS 'Тип движения: SUPPLY (поставка), SALE (продажа), WRITE_OFF (списание)';

