-- Исправление: добавление недостающих колонок в существующие таблицы

-- Добавляем updated_at в users, если его нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
        RAISE NOTICE 'Добавлена колонка updated_at в таблицу users';
    ELSE
        RAISE NOTICE 'Колонка updated_at уже существует в таблице users';
    END IF;
END $$;

-- Добавляем updated_at в addresses, если его нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'addresses' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE addresses ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
        RAISE NOTICE 'Добавлена колонка updated_at в таблицу addresses';
    ELSE
        RAISE NOTICE 'Колонка updated_at уже существует в таблице addresses';
    END IF;
END $$;

-- Добавляем updated_at в orders, если его нет
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
        RAISE NOTICE 'Добавлена колонка updated_at в таблицу orders';
    ELSE
        RAISE NOTICE 'Колонка updated_at уже существует в таблице orders';
    END IF;
END $$;

-- Создаем функцию для автоматического обновления updated_at, если её нет
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Создаем триггеры для автоматического обновления updated_at, если их нет
DO $$ 
BEGIN
    -- Триггер для users
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
    ) THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        RAISE NOTICE 'Создан триггер update_users_updated_at';
    END IF;
    
    -- Триггер для addresses
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_addresses_updated_at'
    ) THEN
        CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        RAISE NOTICE 'Создан триггер update_addresses_updated_at';
    END IF;
    
    -- Триггер для orders
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_orders_updated_at'
    ) THEN
        CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        RAISE NOTICE 'Создан триггер update_orders_updated_at';
    END IF;
END $$;

-- Проверка: выводим структуру таблиц
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('users', 'addresses', 'orders')
    AND column_name = 'updated_at'
ORDER BY table_name;

