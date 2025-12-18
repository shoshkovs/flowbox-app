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

# 4. Генерируем понятное описание изменений
echo "💾 Анализ изменений..."

# Получаем diff для анализа
DIFF_CONTENT=$(git diff --cached 2>/dev/null)
if [ -z "$DIFF_CONTENT" ]; then
    DIFF_CONTENT=$(git diff 2>/dev/null)
fi

# Анализируем изменения и формируем понятное описание
DESCRIPTION=""

# Проверяем изменения связанные с safe area insets
if echo "$DIFF_CONTENT" | grep -qiE "(safe.*area|safeAreaInset|contentSafeAreaInset|--safe-top|--safe-bottom|applyInsets)"; then
    DESCRIPTION="${DESCRIPTION}Адаптация отступов для разных устройств"
fi

# Проверяем изменения в хедере
if echo "$DIFF_CONTENT" | grep -qiE "(\.header|header.*padding|header.*top|logo-wrapper)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения размеров хедера"
fi

# Проверяем изменения в нижнем меню
if echo "$DIFF_CONTENT" | grep -qiE "(\.bottom-nav|bottom-nav.*padding|bottom-nav.*bottom|\.nav-item|\.nav-icon|\.nav-badge)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения размеров нижнего меню"
fi

# Проверяем изменения в адресах
if echo "$DIFF_CONTENT" | grep -qiE "(address|адрес|checkoutAddress|renderCheckoutAddresses|selectCheckoutAddress)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения в работе с адресами"
fi

# Проверяем изменения в корзине
if echo "$DIFF_CONTENT" | grep -qiE "(cart|корзина|goToCartFixed|updateGoToCartButton)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения в корзине"
fi

# Проверяем изменения в оформлении заказа
if echo "$DIFF_CONTENT" | grep -qiE "(checkout|оформление|checkoutStep|goToStep)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения в оформлении заказа"
fi

# Проверяем изменения в стилях/цветах
if echo "$DIFF_CONTENT" | grep -qiE "(color|цвет|background|border-color|#f9a8d4|#fb2d5c)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения цветов и стилей"
fi

# Проверяем изменения в профиле
if echo "$DIFF_CONTENT" | grep -qiE "(profile|профиль|profileTab)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}изменения в профиле"
fi

# Проверяем изменения в админ-панели
if echo "$DIFF_CONTENT" | grep -qiE "(admin|PUSH_TO_RENDER)"; then
    if [ -n "$DESCRIPTION" ]; then
        DESCRIPTION="${DESCRIPTION}, "
    fi
    DESCRIPTION="${DESCRIPTION}обновление админ-панели"
fi

# Если не удалось определить изменения, используем общее описание
if [ -z "$DESCRIPTION" ]; then
    DESCRIPTION="Обновление приложения"
fi

# Формируем финальное сообщение
COMMIT_MSG="Deploy: ${DESCRIPTION}"

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

