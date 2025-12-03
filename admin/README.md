# FlowBox Admin Panel

React админ-панель для управления цветочным магазином FlowBox.

## Установка

1. Установите зависимости:
```bash
cd admin
npm install
```

## Разработка

Для запуска в режиме разработки:
```bash
npm run dev
```

Админ-панель будет доступна по адресу `http://localhost:5173`

## Сборка для production

Для сборки production версии:
```bash
npm run build
```

Собранные файлы будут в папке `admin-build` в корне проекта.

## Структура проекта

```
admin/
├── src/
│   ├── components/      # React компоненты
│   │   ├── Dashboard.jsx
│   │   ├── Products.jsx
│   │   ├── Orders.jsx
│   │   └── ...
│   ├── lib/             # Утилиты
│   ├── App.jsx          # Главный компонент
│   ├── main.jsx         # Точка входа
│   └── index.css        # Глобальные стили
├── index.html           # HTML шаблон
├── vite.config.js       # Конфигурация Vite
└── package.json         # Зависимости
```

## Интеграция с Express

После сборки Express сервер автоматически раздает админ-панель из папки `admin-build`.
Если сборка отсутствует, используется старая версия из папки `admin`.

Админ-панель доступна по адресу: `http://localhost:3000/admin`

## Авторизация

По умолчанию пароль: `admin123`

