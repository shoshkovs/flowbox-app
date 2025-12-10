-- Миграция: объединение street и house в одно поле street
-- Дата: 2025-01-XX
-- Описание: Объединяем street и house в одно поле street для упрощения структуры адресов

-- Шаг 1: Склеиваем street + house в street
UPDATE addresses
SET street = TRIM(
    CASE
        WHEN (house IS NULL OR house = '') AND (street IS NOT NULL AND street <> '')
            THEN street
        WHEN (street IS NULL OR street = '') AND (house IS NOT NULL AND house <> '')
            THEN house
        WHEN (street IS NOT NULL AND street <> '') AND (house IS NOT NULL AND house <> '')
            THEN street || ', ' || house
        ELSE street
    END
);

-- Шаг 2: Проверка результата (можно выполнить вручную)
-- SELECT id, street, house FROM addresses ORDER BY id DESC LIMIT 20;

-- Шаг 3: Удаляем колонку house
ALTER TABLE addresses DROP COLUMN IF EXISTS house;

-- Готово! Теперь все адреса хранятся в формате "Улица, дом" в поле street
