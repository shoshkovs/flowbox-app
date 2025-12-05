-- Исправление отрицательных остатков на складе
-- Этот скрипт удаляет лишние WRITE_OFF движения, которые создали отрицательные остатки

BEGIN;

-- Находим товары с отрицательными остатками
DO $$
DECLARE
    product_record RECORD;
    total_supplied INTEGER;
    total_sold INTEGER;
    total_written_off INTEGER;
    current_stock INTEGER;
    excess_write_off INTEGER;
BEGIN
    -- Проходим по всем товарам
    FOR product_record IN 
        SELECT DISTINCT product_id 
        FROM stock_movements 
        WHERE product_id IS NOT NULL
    LOOP
        -- Считаем общие движения
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' THEN quantity ELSE 0 END), 0)
        INTO total_supplied, total_sold, total_written_off
        FROM stock_movements
        WHERE product_id = product_record.product_id;
        
        -- Если нет SUPPLY движений, используем supplies.quantity
        IF total_supplied = 0 THEN
            SELECT COALESCE(SUM(quantity), 0)
            INTO total_supplied
            FROM supplies
            WHERE product_id = product_record.product_id;
        END IF;
        
        current_stock := total_supplied - total_sold - total_written_off;
        
        -- Если остаток отрицательный, нужно удалить лишние WRITE_OFF движения
        IF current_stock < 0 THEN
            excess_write_off := ABS(current_stock);
            
            RAISE NOTICE 'Товар ID %: остаток %, избыточное списание %', 
                product_record.product_id, current_stock, excess_write_off;
            
            -- Удаляем избыточные WRITE_OFF движения (самые последние)
            -- Сначала удаляем те, которые не привязаны к поставкам
            DELETE FROM stock_movements
            WHERE id IN (
                SELECT id
                FROM stock_movements
                WHERE product_id = product_record.product_id
                  AND type = 'WRITE_OFF'
                  AND supply_id IS NULL
                ORDER BY created_at DESC
                LIMIT excess_write_off
            );
            
            -- Если еще есть избыток, удаляем привязанные к поставкам (самые последние)
            IF (SELECT COUNT(*) FROM stock_movements 
                WHERE product_id = product_record.product_id 
                  AND type = 'WRITE_OFF') > (total_written_off - excess_write_off) THEN
                DELETE FROM stock_movements
                WHERE id IN (
                    SELECT id
                    FROM stock_movements
                    WHERE product_id = product_record.product_id
                      AND type = 'WRITE_OFF'
                      AND supply_id IS NOT NULL
                    ORDER BY created_at DESC
                    LIMIT excess_write_off
                );
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;

-- Проверка результата
SELECT 
    p.id,
    p.name,
    COALESCE(
        (SELECT SUM(quantity) FROM stock_movements WHERE product_id = p.id AND type = 'SUPPLY'),
        (SELECT SUM(quantity) FROM supplies WHERE product_id = p.id)
    , 0) as supplied,
    COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as sold,
    COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as written_off,
    COALESCE(
        (SELECT SUM(quantity) FROM stock_movements WHERE product_id = p.id AND type = 'SUPPLY'),
        (SELECT SUM(quantity) FROM supplies WHERE product_id = p.id)
    , 0) - 
    COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
    COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as stock
FROM products p
LEFT JOIN stock_movements sm ON p.id = sm.product_id
WHERE p.is_active = true
GROUP BY p.id, p.name
HAVING (
    COALESCE(
        (SELECT SUM(quantity) FROM stock_movements WHERE product_id = p.id AND type = 'SUPPLY'),
        (SELECT SUM(quantity) FROM supplies WHERE product_id = p.id)
    , 0) - 
    COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
    COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0)
) < 0
ORDER BY stock ASC;

