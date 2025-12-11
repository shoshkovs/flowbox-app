-- Миграция: добавление поля service_fee_percent в таблицу orders
-- Это поле будет хранить процент сервисного сбора для каждого заказа

-- Добавляем колонку service_fee_percent (NUMERIC для точности процентов)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS service_fee_percent NUMERIC(5,2) DEFAULT 10.00;

-- Комментарий к колонке
COMMENT ON COLUMN orders.service_fee_percent IS 'Процент сервисного сбора от суммы товаров (без доставки). По умолчанию 10%';

-- Обновляем существующие заказы, устанавливая процент по умолчанию
-- Если service_fee > 0 и flowers_total > 0, вычисляем процент из существующих данных
UPDATE orders 
SET service_fee_percent = CASE 
    WHEN flowers_total > 0 THEN ROUND((service_fee::NUMERIC / flowers_total::NUMERIC * 100)::NUMERIC, 2)
    ELSE 10.00
END
WHERE service_fee_percent IS NULL;

-- Устанавливаем значение по умолчанию для заказов, где не удалось вычислить процент
UPDATE orders 
SET service_fee_percent = 10.00
WHERE service_fee_percent IS NULL;
