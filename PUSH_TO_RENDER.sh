#!/bin/bash

# Скрипт для деплоя новой React админ-панели на Render

echo "🚀 Подготовка к деплою новой React админ-панели..."

# 1. Собираем админ-панель локально (для проверки)
echo "📦 Сборка админ-панели..."
cd admin && npm run build && cd ..

if [ $? -ne 0 ]; then
    echo "❌ Ошибка сборки админ-панели!"
    exit 1
fi

echo "✅ Админ-панель собрана успешно"

# 2. Проверяем наличие admin-build
if [ ! -d "admin-build" ]; then
    echo "❌ Папка admin-build не найдена!"
    exit 1
fi

echo "✅ Папка admin-build существует"

# 3. Добавляем все изменения в git
echo "📝 Добавление изменений в git..."
git add -A

# 4. Генерируем описание изменений
echo "💾 Анализ изменений..."

# Проверяем измененные файлы
CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null)

if [ -z "$CHANGED_FILES" ]; then
    # Если нет изменений в staged, проверяем unstaged
    CHANGED_FILES=$(git diff --name-only 2>/dev/null)
fi

# Формируем список измененных файлов
CHANGES=""
FILE_COUNT=0

for file in $CHANGED_FILES; do
    # Пропускаем служебные файлы и build директории
    if [[ "$file" == *"admin-build"* ]] || [[ "$file" == *"node_modules"* ]] || [[ "$file" == *".git"* ]]; then
        continue
    fi
    
    # Извлекаем имя файла
    filename=$(basename "$file")
    dirname=$(dirname "$file")
    
    # Формируем краткое описание
    if [[ "$file" == "public/app.js" ]]; then
        CHANGES="${CHANGES}app.js "
    elif [[ "$file" == "public/styles.css" ]]; then
        CHANGES="${CHANGES}styles.css "
    elif [[ "$file" == "public/index.html" ]]; then
        CHANGES="${CHANGES}index.html "
    elif [[ "$file" == "bot.js" ]]; then
        CHANGES="${CHANGES}bot.js "
    elif [[ "$file" == admin/* ]]; then
        CHANGES="${CHANGES}admin "
    else
        CHANGES="${CHANGES}${filename} "
    fi
    
    FILE_COUNT=$((FILE_COUNT + 1))
done

# Получаем статистику изменений
DIFF_STAT=$(git diff --cached --shortstat 2>/dev/null)
if [ -z "$DIFF_STAT" ]; then
    DIFF_STAT=$(git diff --shortstat 2>/dev/null)
fi

# Формируем сообщение коммита
if [ -n "$CHANGES" ] && [ "$FILE_COUNT" -gt 0 ]; then
    # Убираем лишние пробелы и формируем список
    CHANGES=$(echo "$CHANGES" | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/^ *//;s/ *$//')
    COMMIT_MSG="Deploy: $(echo $CHANGES | sed 's/ /, /g')"
    
    if [ -n "$DIFF_STAT" ]; then
        COMMIT_MSG="${COMMIT_MSG} - ${DIFF_STAT}"
    fi
else
    # Fallback на стандартное сообщение
    COMMIT_MSG="Deploy React admin panel with database integration"
    if [ -n "$DIFF_STAT" ]; then
        COMMIT_MSG="Deploy: ${DIFF_STAT}"
    fi
fi

# Коммитим
echo "💾 Создание коммита..."
echo "   Сообщение: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# 5. Пушим в GitHub
echo "⬆️  Отправка изменений в GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Изменения отправлены в GitHub!"
    echo ""
    echo "📋 Render автоматически начнет сборку через несколько секунд"
    echo "⏱️  Деплой займет 3-5 минут"
    echo ""
    echo "🔍 Проверьте статус деплоя:"
    echo "   https://dashboard.render.com"
    echo ""
    echo "🌐 После завершения деплоя админ-панель будет доступна:"
    echo "   https://flowbox-app.onrender.com/admin"
    echo ""
    echo "🔐 Пароль: admin123"
else
    echo "❌ Ошибка при отправке в GitHub!"
    exit 1
fi

