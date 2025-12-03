#!/bin/bash
# Скрипт для проверки таблиц в базе данных

echo "🔍 Проверка таблиц в базе данных Render.com"
echo ""
read -p "Введите строку подключения (или нажмите Enter для использования DATABASE_URL из .env): " DB_URL

if [ -z "$DB_URL" ]; then
    if [ -f .env ]; then
        DB_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
        if [ -z "$DB_URL" ]; then
            echo "❌ DATABASE_URL не найден в .env файле"
            exit 1
        fi
        echo "✅ Используется DATABASE_URL из .env"
    else
        echo "❌ .env файл не найден"
        exit 1
    fi
fi

echo ""
echo "📋 Список таблиц:"
psql "$DB_URL" -c "\dt"

echo ""
echo "📊 Количество записей:"
psql "$DB_URL" -c "
SELECT 
    'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'addresses', COUNT(*) FROM addresses
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items;
"

echo ""
echo "✅ Проверка завершена!"
