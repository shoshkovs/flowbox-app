-- Добавление колонок для комментариев в таблицу orders
-- internal_comment: внутренний комментарий для сотрудников
-- courier_comment: комментарий для курьера

DO $$
BEGIN
  -- Добавляем internal_comment, если его нет
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'internal_comment'
  ) THEN
    ALTER TABLE orders ADD COLUMN internal_comment TEXT;
    RAISE NOTICE 'Добавлена колонка internal_comment';
  ELSE
    RAISE NOTICE 'Колонка internal_comment уже существует';
  END IF;

  -- Добавляем courier_comment, если его нет
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'courier_comment'
  ) THEN
    ALTER TABLE orders ADD COLUMN courier_comment TEXT;
    RAISE NOTICE 'Добавлена колонка courier_comment';
  ELSE
    RAISE NOTICE 'Колонка courier_comment уже существует';
  END IF;
END $$;

