-- Миграция: убрать DEFAULT 500 из users.bonuses
-- users.bonuses теперь только кэш, который можно пересчитать из bonus_transactions

-- Убираем DEFAULT значение
ALTER TABLE users ALTER COLUMN bonuses DROP DEFAULT;

-- Обновляем существующие NULL значения на 0 (они будут пересчитаны из транзакций)
UPDATE users SET bonuses = 0 WHERE bonuses IS NULL;

-- Устанавливаем NOT NULL, если нужно (опционально)
-- ALTER TABLE users ALTER COLUMN bonuses SET NOT NULL;

COMMENT ON COLUMN users.bonuses IS 'Кэшированный баланс бонусов. Единственный источник правды - таблица bonus_transactions. Можно пересчитать через SUM(amount)';

