-- Скрипт для очистки всех поставок и активных заказов
-- ВНИМАНИЕ: Это удалит все данные о поставках и заказах!

BEGIN;

-- Удаляем все движения по складу (они связаны с поставками и заказами)
DELETE FROM stock_movements;

-- Удаляем все позиции заказов
DELETE FROM order_items;

-- Удаляем историю статусов заказов
DELETE FROM order_status_history;

-- Удаляем транзакции бонусов, связанные с заказами
DELETE FROM bonus_transactions WHERE order_id IS NOT NULL;

-- Удаляем все заказы
DELETE FROM orders;

-- Удаляем все поставки
DELETE FROM supplies;

COMMIT;

-- Проверка: должны остаться только товары, пользователи, адреса и справочники
SELECT 
  (SELECT COUNT(*) FROM supplies) as supplies_count,
  (SELECT COUNT(*) FROM orders) as orders_count,
  (SELECT COUNT(*) FROM stock_movements) as movements_count,
  (SELECT COUNT(*) FROM order_items) as order_items_count;

