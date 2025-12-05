-- Удаление всех данных по гортензиям (гортензии)
-- Этот скрипт удаляет все поставки, движения и связанные данные для гортензий

BEGIN;

-- Находим ID гортензий
DO $$
DECLARE
    hydrangea_ids INTEGER[];
BEGIN
    -- Получаем все ID товаров, которые содержат "гортензия" в названии (регистронезависимо)
    SELECT ARRAY_AGG(id) INTO hydrangea_ids
    FROM products
    WHERE LOWER(name) LIKE '%гортензия%' OR LOWER(name) LIKE '%hydrangea%';
    
    IF hydrangea_ids IS NULL OR array_length(hydrangea_ids, 1) IS NULL THEN
        RAISE NOTICE 'Гортензии не найдены';
    ELSE
        RAISE NOTICE 'Найдено гортензий: %', array_length(hydrangea_ids, 1);
        
        -- Удаляем движения по складу для гортензий
        DELETE FROM stock_movements
        WHERE product_id = ANY(hydrangea_ids);
        
        RAISE NOTICE 'Удалены движения по складу для гортензий';
        
        -- Удаляем товары из заказов (order_items) для гортензий
        DELETE FROM order_items
        WHERE product_id = ANY(hydrangea_ids);
        
        RAISE NOTICE 'Удалены товары из заказов для гортензий';
        
        -- Удаляем поставки для гортензий
        DELETE FROM supplies
        WHERE product_id = ANY(hydrangea_ids);
        
        RAISE NOTICE 'Удалены поставки для гортензий';
        
        -- Удаляем товары из supply_items (если есть)
        DELETE FROM supply_items
        WHERE product_id = ANY(hydrangea_ids);
        
        RAISE NOTICE 'Удалены товары из supply_items для гортензий';
        
        -- Удаляем сами товары (гортензии)
        DELETE FROM products
        WHERE id = ANY(hydrangea_ids);
        
        RAISE NOTICE 'Удалены товары (гортензии)';
    END IF;
END $$;

COMMIT;

-- Проверка результата
SELECT 
    (SELECT COUNT(*) FROM products WHERE LOWER(name) LIKE '%гортензия%' OR LOWER(name) LIKE '%hydrangea%') as remaining_hydrangeas,
    (SELECT COUNT(*) FROM supplies WHERE product_id IN (SELECT id FROM products WHERE LOWER(name) LIKE '%гортензия%' OR LOWER(name) LIKE '%hydrangea%')) as remaining_supplies,
    (SELECT COUNT(*) FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE LOWER(name) LIKE '%гортензия%' OR LOWER(name) LIKE '%hydrangea%')) as remaining_movements;

