# Настройка базы данных для FlowBox

## Вариант 1: Supabase (Рекомендуется - самый простой)

### Шаг 1: Создать проект
1. Зайди на https://supabase.com
2. Нажми "Start your project" (можно зарегистрироваться через GitHub)
3. Создай новый проект:
   - Название: `flowbox` (или любое другое)
   - Пароль: придумай надежный (сохрани его!)
   - Регион: выбери ближайший (например, `West US` или `Europe West`)

### Шаг 2: Выполнить SQL схему
1. В левом меню выбери **SQL Editor**
2. Нажми **New query**
3. Скопируй весь текст из файла `schema.sql` и вставь в редактор
4. Нажми **Run** (или `Cmd+Enter` / `Ctrl+Enter`)
5. Должно появиться сообщение "Success. No rows returned"

### Шаг 3: Получить строку подключения
1. В левом меню выбери **Project Settings** (шестеренка внизу)
2. Перейди в раздел **Database**
3. Найди секцию **Connection string**
4. Выбери **URI** и скопируй строку (она выглядит так: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`)
5. Замени `[YOUR-PASSWORD]` на пароль, который ты создал при создании проекта

### Шаг 4: Добавить в Render.com
1. Зайди в свой проект на Render.com
2. Перейди в **Environment** (переменные окружения)
3. Добавь новую переменную:
   - **Key**: `DATABASE_URL`
   - **Value**: вставь строку подключения из шага 3
4. Нажми **Save Changes**
5. Render автоматически перезапустит сервер

### Шаг 5: Проверить работу
1. Открой MiniApp в Telegram
2. Добавь товар в корзину
3. Зайди в Supabase → **Table Editor** → **users** - должен появиться новый пользователь
4. Зайди в **addresses** - должны появиться адреса, если ты их добавил

---

## Вариант 2: Render PostgreSQL

Если твой бот уже на Render.com, можно создать БД там же:

1. В Render.com нажми **New +** → **PostgreSQL**
2. Название: `flowbox-db`
3. Выбери бесплатный план (Free)
4. После создания зайди в настройки БД
5. Скопируй **Internal Database URL** (или External, если нужен доступ извне)
6. Добавь переменную `DATABASE_URL` в настройки твоего веб-сервиса (где бот)
7. Выполни SQL из `schema.sql` через любой PostgreSQL клиент (например, DBeaver, TablePlus, или через `psql`)

---

## Вариант 3: Neon (альтернатива Supabase)

1. Зайди на https://neon.tech
2. Создай аккаунт (можно через GitHub)
3. Создай новый проект
4. Скопируй Connection String
5. Выполни SQL из `schema.sql` через веб-интерфейс Neon (SQL Editor)
6. Добавь `DATABASE_URL` в Render.com

---

## Просмотр данных

### В Supabase:
- **Table Editor** - просмотр и редактирование данных в таблицах
- **SQL Editor** - выполнение SQL запросов

### Полезные SQL запросы:

```sql
-- Посмотреть все заказы
SELECT * FROM orders ORDER BY created_at DESC;

-- Посмотреть активные заказы
SELECT * FROM orders WHERE status = 'active' ORDER BY created_at DESC;

-- Посмотреть заказ с позициями
SELECT 
    o.*,
    json_agg(oi.*) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.id = 1
GROUP BY o.id;

-- Посмотреть всех пользователей с их адресами
SELECT 
    u.*,
    json_agg(a.*) as addresses
FROM users u
LEFT JOIN addresses a ON u.id = a.user_id
GROUP BY u.id;
```

---

## Миграция данных из файла

Если у тебя уже есть данные в `user-data.json`, можно их перенести в БД. Напиши мне, и я помогу создать скрипт для миграции.

