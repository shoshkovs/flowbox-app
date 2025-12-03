-- Добавление поля минимального количества для заказа
-- Это минимальное количество, которое можно заказать (например, 5 штук)

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS min_order_quantity INTEGER DEFAULT 1;

-- Комментарий к колонке
COMMENT ON COLUMN products.min_order_quantity IS 'Минимальное количество для заказа (по умолчанию 1)';

