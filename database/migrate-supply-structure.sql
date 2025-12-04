-- Миграция структуры поставок для поддержки множественных товаров и банчей

BEGIN;

-- Делаем product_id и quantity nullable для новой структуры (поставки без конкретного товара)
ALTER TABLE supplies 
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN unit_purchase_price DROP NOT NULL;

-- Добавляем новые поля в таблицу supplies
ALTER TABLE supplies 
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS delivery_price DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment TEXT;

-- Создаем таблицу для товаров в поставке (supply_items)
CREATE TABLE IF NOT EXISTS supply_items (
  id SERIAL PRIMARY KEY,
  supply_id INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_count INTEGER NOT NULL CHECK (batch_count > 0),
  pieces_per_batch INTEGER NOT NULL CHECK (pieces_per_batch > 0),
  batch_price DECIMAL(10,2) NOT NULL CHECK (batch_price > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price > 0),
  total_pieces INTEGER NOT NULL CHECK (total_pieces > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Создаем индекс для быстрого поиска товаров по поставке
CREATE INDEX IF NOT EXISTS idx_supply_items_supply_id ON supply_items(supply_id);
CREATE INDEX IF NOT EXISTS idx_supply_items_product_id ON supply_items(product_id);

COMMIT;

