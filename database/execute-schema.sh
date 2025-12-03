#!/bin/bash
# Скрипт для выполнения SQL схемы в базе данных Render.com

echo "📋 Выполнение SQL схемы для FlowBox..."
echo ""
echo "Убедитесь, что у вас есть строка подключения из Render.com"
echo "Она должна выглядеть так:"
echo "postgresql://flowbox_db_user:password@dpg-xxxxx-a.oregon-postgres.render.com/flowbox_db"
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
echo "🔌 Подключение к базе данных..."
psql "$DB_URL" -f database/schema.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Таблицы успешно созданы!"
    echo ""
    echo "Проверка созданных таблиц:"
    psql "$DB_URL" -c "\dt"
else
    echo ""
    echo "❌ Ошибка при выполнении SQL схемы"
    exit 1
fi

