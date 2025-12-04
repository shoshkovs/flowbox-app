# Полная структура базы данных FlowBox

## 📊 Обзор всех таблиц

База данных состоит из следующих основных групп таблиц:
1. **Пользователи и заказы** (основные таблицы)
2. **Товары и каталог** (справочники товаров)
3. **Склад** (поставки и движения товаров)
4. **Админка** (пользователи админки, настройки)
5. **Доставка** (зоны, слоты, курьеры - частично реализовано)
6. **Промокоды** (частично реализовано)

---

## 1️⃣ ПОЛЬЗОВАТЕЛИ И ЗАКАЗЫ

### Таблица `users`
**Назначение:** Основная информация о пользователях Telegram

```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    telegram_id     BIGINT UNIQUE NOT NULL,
    username        TEXT,                    -- @username
    first_name      TEXT,
    last_name       TEXT,
    phone           TEXT,
    email           TEXT,
    bonuses         INTEGER DEFAULT 500,     -- Бонусные баллы
    manager_note   TEXT,                    -- Внутренний комментарий менеджера
    registered_at   TIMESTAMPTZ DEFAULT now(), -- Дата регистрации
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Индексы:**
- `idx_users_telegram_id` на `telegram_id`

---

### Таблица `addresses`
**Назначение:** Сохраненные адреса доставки пользователей

```sql
CREATE TABLE addresses (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,          -- "Мой дом", "Дом мамы"
    city            TEXT NOT NULL,
    street          TEXT NOT NULL,
    house           TEXT NOT NULL,
    entrance        TEXT,
    apartment       TEXT,
    floor           TEXT,
    intercom        TEXT,
    comment         TEXT,
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Индексы:**
- `idx_addresses_user_id` на `user_id`

---

### Таблица `orders`
**Назначение:** Все заказы пользователей

```sql
CREATE TABLE orders (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'NEW',
    total           INTEGER NOT NULL,                -- Общая сумма
    flowers_total   INTEGER NOT NULL,                -- Только цветы
    service_fee     INTEGER NOT NULL DEFAULT 450,    -- Сервисный сбор
    delivery_price  INTEGER NOT NULL DEFAULT 0,      -- Доставка
    bonus_used      INTEGER NOT NULL DEFAULT 0,      -- Использованные бонусы
    bonus_earned    INTEGER NOT NULL DEFAULT 0,     -- Начисленные бонусы
    -- Данные клиента на момент заказа
    client_name     TEXT,                           -- Имя клиента
    client_phone    TEXT,                           -- Телефон клиента
    client_email    TEXT,                           -- Email клиента
    -- Данные получателя
    recipient_name  TEXT,                           -- Имя получателя
    recipient_phone TEXT,                          -- Телефон получателя
    -- Адрес доставки
    address_id      INTEGER REFERENCES addresses(id), -- Ссылка на сохраненный адрес
    address_string  TEXT NOT NULL,                   -- Адрес (текст)
    address_json    JSONB,                          -- Адрес (полные данные)
    -- Доставка
    delivery_type   TEXT,                           -- 'INSIDE_KAD','OUTSIDE_KAD_10','OUTSIDE_KAD_20','PICKUP'
    delivery_zone_id INTEGER REFERENCES delivery_zones(id), -- Зона доставки
    delivery_slot_id INTEGER REFERENCES delivery_slots(id),  -- Временной слот
    delivery_date   DATE,                           -- Дата доставки
    delivery_time   TEXT,                           -- Время доставки (для обратной совместимости)
    delivery_time_from TIME,                        -- Время доставки от
    delivery_time_to TIME,                          -- Время доставки до
    -- Комментарии
    comment         TEXT,                           -- Комментарий к заказу
    florist_comment TEXT,                           -- Комментарий для флориста
    internal_comment TEXT,                          -- Внутренний комментарий
    courier_comment TEXT,                          -- Комментарий для курьера
    -- Промокод
    promocode_code  TEXT,                           -- Код промокода
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT orders_status_check CHECK (status IN ('UNPAID','NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED','CANCELED'))
);
```

**Статусы:**
- `NEW` - Новый заказ
- `PROCESSING` - В обработке
- `COLLECTING` - Собирается
- `DELIVERING` - В пути
- `COMPLETED` - Доставлен
- `CANCELED` - Отменён
- `UNPAID` - Не оплачен

**Индексы:**
- `idx_orders_user_id` на `user_id`
- `idx_orders_status` на `status`

---

### Таблица `order_items`
**Назначение:** Позиции в заказах

```sql
CREATE TABLE order_items (
    id              SERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    price           INTEGER NOT NULL,        -- Цена за единицу
    quantity        INTEGER NOT NULL,         -- Количество
    total_price     INTEGER,                  -- Общая стоимость (price * quantity)
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Индексы:**
- `idx_order_items_order_id` на `order_id`

---

### Таблица `order_status_history`
**Назначение:** История изменения статусов заказов

```sql
CREATE TABLE order_status_history (
    id              SERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    source          TEXT,                    -- 'admin', 'operator', 'system'
    changed_by_id   INTEGER,                 -- ID админа/оператора
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Индексы:**
- `idx_order_status_history_order` на `order_id`

---

## 2️⃣ ТОВАРЫ И КАТАЛОГ

### Таблица `products`
**Назначение:** Товары (цветы)

```sql
CREATE TABLE products (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL,              -- Название товара
    category_id         INTEGER REFERENCES product_categories(id),
    color_id            INTEGER REFERENCES colors(id),
    price_per_stem      INTEGER NOT NULL,            -- Цена за стебель (рубли)
    min_stem_quantity   INTEGER DEFAULT 1,          -- Минимальное количество для заказа
    image_url           TEXT,
    features            JSONB,                       -- Отличительные качества (массив)
    -- Характеристики для сотрудника (текстовые поля)
    stem_length         TEXT,                        -- "40 см", "50 см"
    country             TEXT,                         -- "Кения", "Эквадор"
    variety             TEXT,                         -- "Freedom", "Explorer"
    tags                TEXT,                         -- Теги через запятую или JSONB
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `product_categories`
**Назначение:** Категории товаров

```sql
CREATE TABLE product_categories (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,    -- "Розы", "Хризантемы"
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `colors`
**Назначение:** Цвета товаров

```sql
CREATE TABLE colors (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,    -- "Розовые", "Белые"
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `product_qualities`
**Назначение:** Отличительные качества товаров

```sql
CREATE TABLE product_qualities (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,    -- "Ароматные", "Стойкие"
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `stem_lengths`
**Назначение:** Длина стебля (для сотрудников)

```sql
CREATE TABLE stem_lengths (
    id              SERIAL PRIMARY KEY,
    length          TEXT UNIQUE NOT NULL,    -- "40 см", "50 см"
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `countries`
**Назначение:** Страны происхождения (для сотрудников)

```sql
CREATE TABLE countries (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,    -- "Кения", "Эквадор"
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `varieties`
**Назначение:** Сорта цветов (для сотрудников)

```sql
CREATE TABLE varieties (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,    -- "Freedom", "Explorer"
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `tags`
**Назначение:** Теги для товаров (для сотрудников)

```sql
CREATE TABLE tags (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 3️⃣ СКЛАД

### Таблица `supplies`
**Назначение:** Поставки товаров на склад

```sql
CREATE TABLE supplies (
    id                  SERIAL PRIMARY KEY,
    product_id          INTEGER NOT NULL REFERENCES products(id),
    quantity            INTEGER NOT NULL,            -- Количество
    unit_purchase_price DECIMAL(10,2) NOT NULL,      -- Цена закупки за единицу
    delivery_date       DATE DEFAULT CURRENT_DATE,    -- Дата поставки
    comment             TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `stock_movements`
**Назначение:** Движения товаров на складе

```sql
CREATE TABLE stock_movements (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id),
    type            TEXT NOT NULL,                   -- 'SUPPLY', 'SALE', 'WRITE_OFF'
    quantity        INTEGER NOT NULL,                -- Количество (всегда > 0)
    supply_id       INTEGER REFERENCES supplies(id),  -- Связь с поставкой (для SUPPLY)
    order_id        BIGINT REFERENCES orders(id),     -- Связь с заказом (для SALE)
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Типы движений:**
- `SUPPLY` - Поступление товара (при создании поставки)
- `SALE` - Продажа (при создании заказа)
- `WRITE_OFF` - Списание (ручное списание товара)

**Расчет остатка:**
```
Остаток = SUM(SUPPLY) - SUM(SALE) - SUM(WRITE_OFF)
```

---

## 4️⃣ АДМИНКА

### Таблица `admin_users`
**Назначение:** Пользователи админ-панели

```sql
CREATE TABLE admin_users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'operator', -- 'admin' или 'operator'
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Индексы:**
- `idx_admin_users_email` на `email`

---

### Таблица `settings`
**Назначение:** Общие настройки системы

```sql
CREATE TABLE settings (
    id              SERIAL PRIMARY KEY,
    key             TEXT UNIQUE NOT NULL,    -- 'service_fee', 'bonus_percent'
    value           TEXT NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Примеры настроек:**
- `service_fee` = "450" - Сервисный сбор
- `bonus_percent` = "1" - Процент начисления бонусов
- `min_order_amount` = "1000" - Минимальная сумма заказа

---

## 5️⃣ ДОСТАВКА (частично реализовано)

### Таблица `delivery_zones`
**Назначение:** Зоны доставки

```sql
CREATE TABLE delivery_zones (
    id              SERIAL PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,    -- "В пределах КАД"
    price           INTEGER NOT NULL DEFAULT 0,
    free_from_amount INTEGER,                -- Бесплатная доставка от суммы
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `delivery_slots`
**Назначение:** Временные слоты доставки

```sql
CREATE TABLE delivery_slots (
    id              SERIAL PRIMARY KEY,
    start_time      TIME NOT NULL,           -- "10:00"
    end_time        TIME NOT NULL,           -- "12:00"
    max_orders      INTEGER DEFAULT 10,      -- Максимум заказов на слот
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `couriers`
**Назначение:** Курьеры (частично реализовано)

```sql
CREATE TABLE couriers (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL UNIQUE,
    pin_code        TEXT NOT NULL,
    zone_id         INTEGER REFERENCES delivery_zones(id),
    is_active       BOOLEAN DEFAULT TRUE,
    total_deliveries INTEGER DEFAULT 0,
    avg_delivery_time INTEGER,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 6️⃣ ПРОМОКОДЫ (частично реализовано)

### Таблица `promocodes`
**Назначение:** Промокоды

```sql
CREATE TABLE promocodes (
    id              SERIAL PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,    -- "FLOW10"
    type            TEXT NOT NULL,            -- 'fixed' или 'percent'
    value           INTEGER NOT NULL,         -- Сумма или процент
    min_order       INTEGER DEFAULT 0,       -- Минимальная сумма заказа
    start_date      DATE,
    end_date        DATE,
    max_uses        INTEGER,                  -- Максимум использований
    used_count      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### Таблица `promocode_uses`
**Назначение:** История использования промокодов

```sql
CREATE TABLE promocode_uses (
    id              SERIAL PRIMARY KEY,
    promocode_id    INTEGER NOT NULL REFERENCES promocodes(id),
    order_id        BIGINT NOT NULL REFERENCES orders(id),
    user_id         INTEGER REFERENCES users(id),
    discount_amount INTEGER NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 🔗 Связи между таблицами

```
users (id)
  ├── addresses (user_id)
  ├── orders (user_id)
  │   ├── order_items (order_id)
  │   └── order_status_history (order_id)
  └── promocode_uses (user_id)

products (id)
  ├── supplies (product_id)
  ├── stock_movements (product_id)
  ├── order_items (product_id)
  ├── category_id → product_categories (id)
  ├── color_id → colors (id)
  ├── stem_length_id → stem_lengths (id)
  ├── country_id → countries (id)
  └── variety_id → varieties (id)

orders (id)
  ├── order_items (order_id)
  ├── order_status_history (order_id)
  ├── stock_movements (order_id) - для типа SALE
  └── promocode_uses (order_id)

supplies (id)
  └── stock_movements (supply_id) - для типа SUPPLY
```

---

## 📊 Основные запросы

### Получить все данные пользователя:
```sql
-- Основные данные
SELECT * FROM users WHERE telegram_id = ?;

-- Адреса
SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC;

-- Активные заказы
SELECT o.*, json_agg(oi.*) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = ? 
  AND o.status IN ('NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'CANCELED')
GROUP BY o.id
ORDER BY o.created_at DESC;

-- История заказов
SELECT o.*, json_agg(oi.*) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = ? AND o.status = 'COMPLETED'
GROUP BY o.id
ORDER BY o.created_at DESC;
```

### Получить остаток товара на складе:
```sql
SELECT 
  p.id,
  p.name,
  COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) as total_supplied,
  COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as total_sold,
  COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as total_written_off,
  COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as stock
FROM products p
LEFT JOIN stock_movements sm ON p.id = sm.product_id
WHERE p.id = ?
GROUP BY p.id, p.name;
```

---

## 7️⃣ БОНУСЫ И ПОДПИСКИ

### Таблица `bonus_transactions`
**Назначение:** История движения бонусов

```sql
CREATE TABLE bonus_transactions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id        BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
    type            TEXT NOT NULL CHECK (type IN ('accrual','redeem','adjustment')),
    amount          INTEGER NOT NULL,      -- плюс или минус
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Типы транзакций:**
- `accrual` - Начисление бонусов (amount > 0)
- `redeem` - Списание бонусов (amount < 0)
- `adjustment` - Ручная корректировка менеджером (amount может быть + или -)

**Индексы:**
- `idx_bonus_transactions_user_id` на `user_id`
- `idx_bonus_transactions_order_id` на `order_id`
- `idx_bonus_transactions_type` на `type`
- `idx_bonus_transactions_created_at` на `created_at`

---

### Таблица `subscriptions`
**Назначение:** Подписки пользователей

```sql
CREATE TABLE subscriptions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('active','canceled','expired','trial')),
    plan_code       TEXT NOT NULL,          -- код плана/тарифа
    started_at      TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    canceled_at     TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Статусы:**
- `active` - Активная подписка
- `canceled` - Отменена вручную

- `expired` - Истекла
- `trial` - Пробный период

**Индексы:**
- `idx_subscriptions_user_id` на `user_id`
- `idx_subscriptions_status` на `status`
- `idx_subscriptions_ends_at` на `ends_at`

---

## ✅ Итоговая структура

**Всего таблиц:** ~22

**Основные группы:**
1. ✅ Пользователи и заказы (5 таблиц)
2. ✅ Товары и каталог (8 таблиц)
3. ✅ Склад (2 таблицы)
4. ✅ Админка (2 таблицы)
5. ⚠️ Доставка (3 таблицы - частично)
6. ⚠️ Промокоды (2 таблицы - частично)
7. ✅ Бонусы и подписки (2 таблицы)

**Все данные пользователя хранятся в БД и связаны через `user_id`!**

**Важные изменения:**
- ✅ Добавлены поля `manager_note` и `registered_at` в `users`
- ✅ Добавлены поля `client_*`, `address_id`, `delivery_type`, `delivery_time_from/to`, `florist_comment`, `promocode_code` в `orders`
- ✅ Добавлен `total_price` в `order_items`
- ✅ Добавлены текстовые поля характеристик (`stem_length`, `country`, `variety`, `tags`) в `products`
- ✅ Создана таблица `bonus_transactions` для истории бонусов
- ✅ Создана таблица `subscriptions` для подписок
- ✅ Добавлен constraint на статусы заказов
