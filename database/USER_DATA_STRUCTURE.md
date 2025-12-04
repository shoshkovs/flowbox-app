# Структура данных пользователя в БД FlowBox

## 📊 Обзор структуры

Все данные пользователя хранятся в PostgreSQL и связаны через `user_id` (внутренний ID из таблицы `users`).

---

## 👤 Таблица `users` - Основные данные пользователя

**Поля:**
- `id` (SERIAL PRIMARY KEY) - внутренний ID пользователя
- `telegram_id` (BIGINT UNIQUE) - ID пользователя Telegram
- `username` (TEXT) - Telegram username (@username)
- `first_name` (TEXT) - Имя пользователя
- `last_name` (TEXT) - Фамилия пользователя
- `phone` (TEXT) - Телефон пользователя
- `email` (TEXT) - Email пользователя
- `bonuses` (INTEGER DEFAULT 500) - Бонусные баллы
- `created_at`, `updated_at` - временные метки

**Связь:** `users.id` используется как `user_id` в других таблицах

---

## 📍 Таблица `addresses` - Сохраненные адреса

**Поля:**
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER FK -> users.id) - связь с пользователем
- `name` (TEXT) - название адреса ("Мой дом", "Дом мамы")
- `city` (TEXT) - город
- `street` (TEXT) - улица
- `house` (TEXT) - дом
- `entrance` (TEXT) - подъезд
- `apartment` (TEXT) - квартира/офис
- `floor` (TEXT) - этаж
- `intercom` (TEXT) - домофон
- `comment` (TEXT) - комментарий
- `is_default` (BOOLEAN) - адрес по умолчанию
- `created_at`, `updated_at` - временные метки

**Запрос:** `SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC`

---

## 📦 Таблица `orders` - Все заказы пользователя

**Поля:**
- `id` (BIGSERIAL PRIMARY KEY) - ID заказа
- `user_id` (INTEGER FK -> users.id) - связь с пользователем
- `status` (TEXT) - статус заказа (см. ниже)
- `total` (INTEGER) - общая сумма заказа
- `flowers_total` (INTEGER) - сумма только цветов
- `service_fee` (INTEGER) - сервисный сбор
- `delivery_price` (INTEGER) - стоимость доставки
- `bonus_used` (INTEGER) - использованные бонусы
- `bonus_earned` (INTEGER) - начисленные бонусы
- `recipient_name` (TEXT) - имя получателя
- `recipient_phone` (TEXT) - телефон получателя
- `address_string` (TEXT) - адрес доставки (текст)
- `address_json` (JSONB) - полные данные адреса
- `delivery_date` (DATE) - дата доставки
- `delivery_time` (TEXT) - время доставки
- `comment` (TEXT) - комментарий к заказу
- `created_at`, `updated_at` - временные метки

**Статусы заказов:**
- `NEW` - Новый заказ (после оплаты, еще не взят в работу)
- `PROCESSING` - В обработке
- `COLLECTING` - Собирается
- `DELIVERING` - В пути
- `COMPLETED` - Доставлен (история)
- `CANCELED` - Отменён

---

## 🔄 Логика статусов для отображения

### ✅ Активные заказы (в профиле пользователя):
Показываются заказы со статусами:
- `NEW` - Новый заказ
- `PROCESSING` - В обработке
- `COLLECTING` - Собирается
- `DELIVERING` - В пути
- `CANCELED` - Отменён (показывается в активных, чтобы пользователь видел отмененные заказы)

**SQL запрос:**
```sql
SELECT * FROM orders 
WHERE user_id = ? 
  AND status IN ('NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'CANCELED')
ORDER BY created_at DESC
```

### 📜 История заказов (завершенные):
Показываются только доставленные заказы:
- `COMPLETED` - Доставлен

**SQL запрос:**
```sql
SELECT * FROM orders 
WHERE user_id = ? 
  AND status = 'COMPLETED'
ORDER BY created_at DESC
```

---

## 🔗 Связи между таблицами

```
users (id)
  ├── addresses (user_id) - один ко многим
  └── orders (user_id) - один ко многим
       └── order_items (order_id) - один ко многим
```

---

## 📥 Получение данных пользователя

### 1. Основные данные (Имя, Телефон, Почта)
```sql
SELECT first_name, phone, email, bonuses 
FROM users 
WHERE telegram_id = ?
```

### 2. Сохраненные адреса
```sql
SELECT * 
FROM addresses 
WHERE user_id = ? 
ORDER BY created_at DESC
```

### 3. Активные заказы
```sql
SELECT o.*, 
       json_agg(json_build_object(
         'id', oi.product_id,
         'name', oi.name,
         'price', oi.price,
         'quantity', oi.quantity
       )) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = ? 
  AND o.status IN ('NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'CANCELED')
GROUP BY o.id 
ORDER BY o.created_at DESC
```

### 4. История заказов (завершенные)
```sql
SELECT o.*, 
       json_agg(json_build_object(
         'id', oi.product_id,
         'name', oi.name,
         'price', oi.price,
         'quantity', oi.quantity
       )) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = ? 
  AND o.status = 'COMPLETED'
GROUP BY o.id 
ORDER BY o.created_at DESC
```

---

## ✅ Проверка структуры

Все данные пользователя хранятся в БД и связаны через `user_id`:
- ✅ Имя, Телефон, Почта - в таблице `users`
- ✅ Сохраненные адреса - в таблице `addresses`
- ✅ Все заказы - в таблице `orders`
- ✅ Статусы правильно разделены на активные и завершенные
