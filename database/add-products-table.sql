-- Добавление таблицы products для управления товарами через админку

CREATE TABLE IF NOT EXISTS products (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    price           INTEGER NOT NULL,
    image_url       TEXT,
    type            TEXT,                    -- roses, tulips, chrysanthemums, etc.
    color           TEXT,                    -- red, pink, white, etc.
    features        TEXT[],                  -- ['aromatic', 'durable', 'tall', 'peony']
    is_active       BOOLEAN DEFAULT TRUE,    -- для скрытия товаров без удаления
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Индекс для быстрого поиска по типу и цвету
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_color ON products(color);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Миграция существующих товаров (если нужно)
-- Можно выполнить вручную после создания таблицы

