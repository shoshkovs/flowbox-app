-- Создание справочников для товаров

-- Категории товаров
CREATE TABLE IF NOT EXISTS product_categories (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Цвета
CREATE TABLE IF NOT EXISTS product_colors (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Отличительные качества (Ароматные, Стойкие, Высокие и т.д.)
CREATE TABLE IF NOT EXISTS product_qualities (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Длины стеблей
CREATE TABLE IF NOT EXISTS stem_lengths (
    id              SERIAL PRIMARY KEY,
    value           TEXT UNIQUE NOT NULL, -- "40 см", "50 см", "60 см"
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Страны
CREATE TABLE IF NOT EXISTS countries (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Сорта
CREATE TABLE IF NOT EXISTS varieties (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Теги
CREATE TABLE IF NOT EXISTS product_tags (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Связь товаров с качествами (many-to-many)
CREATE TABLE IF NOT EXISTS product_qualities_map (
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quality_id      INTEGER NOT NULL REFERENCES product_qualities(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, quality_id)
);

-- Связь товаров с тегами (many-to-many)
CREATE TABLE IF NOT EXISTS product_tags_map (
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_product_categories_name ON product_categories(name);
CREATE INDEX IF NOT EXISTS idx_product_colors_name ON product_colors(name);
CREATE INDEX IF NOT EXISTS idx_product_qualities_name ON product_qualities(name);
CREATE INDEX IF NOT EXISTS idx_product_qualities_map_product ON product_qualities_map(product_id);
CREATE INDEX IF NOT EXISTS idx_product_tags_map_product ON product_tags_map(product_id);

-- Добавляем поля в products для новых данных
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS color_id INTEGER REFERENCES product_colors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS price_per_stem INTEGER,
ADD COLUMN IF NOT EXISTS min_stem_quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS stem_length_id INTEGER REFERENCES stem_lengths(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS country_id INTEGER REFERENCES countries(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS variety_id INTEGER REFERENCES varieties(id) ON DELETE SET NULL;

-- Комментарии
COMMENT ON COLUMN products.price_per_stem IS 'Цена за один стебель';
COMMENT ON COLUMN products.min_stem_quantity IS 'Минимальное количество стеблей для покупки';

