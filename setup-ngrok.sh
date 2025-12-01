#!/bin/bash
echo "🔐 Настройка ngrok"
echo ""
echo "1. Зарегистрируйтесь на https://dashboard.ngrok.com/signup"
echo "2. Получите authtoken на https://dashboard.ngrok.com/get-started/your-authtoken"
echo ""
read -p "Вставьте ваш authtoken: " authtoken

if [ -z "$authtoken" ]; then
    echo "❌ Токен не введен"
    exit 1
fi

npx ngrok config add-authtoken "$authtoken"
echo ""
echo "✅ Ngrok настроен!"
echo "Теперь запустите: npm run tunnel:ngrok"

