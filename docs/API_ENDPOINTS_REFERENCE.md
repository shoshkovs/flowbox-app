# 📡 Полный список API Endpoints для FlowBox

## Базовая информация

**Base URL:** `https://your-app.onrender.com`

**Аутентификация:**
- Админка: `Authorization: Bearer <JWT_TOKEN>`
- Курьер: `Authorization: Bearer <COURIER_TOKEN>`

**Формат ответов:**
- Успех: `200 OK` с JSON телом
- Ошибка: `4xx/5xx` с `{ error: "описание ошибки" }`

---

## 🔐 Аутентификация админа

### POST `/api/admin/auth/login`
Вход в админку.

**Тело запроса:**
```json
{
  "email": "admin@flowbox.ru",
  "password": "password123"
}
```

**Ответ (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@flowbox.ru",
    "name": "Администратор",
    "role": "admin"
  }
}
```

**Ошибки:**
- `401` - Неверный email или пароль
- `400` - Не указаны email или password

---

### GET `/api/admin/auth/me`
Получить информацию о текущем пользователе.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "id": 1,
  "email": "admin@flowbox.ru",
  "name": "Администратор",
  "role": "admin"
}
```

---

### POST `/api/admin/auth/logout`
Выход из системы.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "success": true
}
```

---

## 📊 Dashboard

### GET `/api/admin/dashboard/stats`
Статистика за день.

**Заголовки:** `Authorization: Bearer <token>`

**Query параметры:**
- `date` (опционально) - дата в формате `YYYY-MM-DD`, по умолчанию сегодня

**Ответ (200):**
```json
{
  "today": {
    "orders_count": 15,
    "revenue": 45000,
    "average_order": 3000
  },
  "statuses": {
    "new": 3,
    "confirmed": 5,
    "preparing": 2,
    "assigned": 1,
    "in_transit": 2,
    "delivered": 10,
    "cancelled": 1
  },
  "recent_orders": [
    {
      "id": 123,
      "customer_name": "Иван Иванов",
      "total": 3500,
      "status": "new",
      "created_at": "2025-12-03T10:30:00Z"
    }
  ]
}
```

---

## 📦 Заказы

### GET `/api/admin/orders`
Список заказов с фильтрацией.

**Заголовки:** `Authorization: Bearer <token>`

**Query параметры:**
- `status` - фильтр по статусу (new/confirmed/preparing/assigned/in_transit/delivered/cancelled)
- `date_from` - дата начала (YYYY-MM-DD)
- `date_to` - дата окончания (YYYY-MM-DD)
- `search` - поиск по номеру/телефону/имени
- `page` - номер страницы (по умолчанию 1)
- `limit` - количество на странице (по умолчанию 50)

**Ответ (200):**
```json
{
  "orders": [
    {
      "id": 123,
      "telegram_order_id": "1234567890",
      "customer_name": "Иван Иванов",
      "customer_phone": "+7 (999) 123-45-67",
      "recipient_name": "Мария Петрова",
      "recipient_phone": "+7 (999) 765-43-21",
      "total": 3500,
      "flowers_total": 3000,
      "service_fee": 450,
      "delivery_price": 500,
      "status": "new",
      "payment_status": "unpaid",
      "payment_method": "online",
      "delivery_date": "2025-12-04",
      "delivery_time": "10:00-12:00",
      "address_string": "Санкт-Петербург, ул. Примерная, д. 1, кв. 10",
      "courier_id": null,
      "courier_name": null,
      "created_at": "2025-12-03T10:30:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 50
}
```

---

### GET `/api/admin/orders/:id`
Детальная информация о заказе.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "id": 123,
  "telegram_order_id": "1234567890",
  "user_id": 1,
  "customer": {
    "name": "Иван Иванов",
    "phone": "+7 (999) 123-45-67",
    "email": "ivan@example.com"
  },
  "recipient": {
    "name": "Мария Петрова",
    "phone": "+7 (999) 765-43-21"
  },
  "items": [
    {
      "id": 1,
      "product_id": 5,
      "name": "Розы красные",
      "price": 1500,
      "quantity": 2
    }
  ],
  "totals": {
    "flowers_total": 3000,
    "service_fee": 450,
    "delivery_price": 500,
    "bonus_used": 0,
    "bonus_earned": 30,
    "discount_amount": 0,
    "total": 3500
  },
  "address": {
    "city": "Санкт-Петербург",
    "street": "ул. Примерная",
    "house": "1",
    "apartment": "10",
    "entrance": "2",
    "floor": "3",
    "intercom": "123",
    "comment": "Позвонить за 10 минут"
  },
  "delivery": {
    "date": "2025-12-04",
    "time": "10:00-12:00",
    "zone": "В пределах КАД"
  },
  "status": "new",
  "payment_status": "unpaid",
  "payment_method": "online",
  "courier": null,
  "status_history": [
    {
      "status": "new",
      "changed_by": "system",
      "created_at": "2025-12-03T10:30:00Z"
    }
  ],
  "created_at": "2025-12-03T10:30:00Z",
  "updated_at": "2025-12-03T10:30:00Z"
}
```

---

### PATCH `/api/admin/orders/:id/status`
Изменить статус заказа.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "status": "confirmed",
  "comment": "Заказ подтвержден оператором"
}
```

**Ответ (200):** Обновленный заказ (как в GET `/api/admin/orders/:id`)

**Возможные статусы:**
- `new` - Новый заказ
- `confirmed` - Подтвержден
- `preparing` - В сборке
- `assigned` - Назначен курьеру
- `in_transit` - В пути
- `delivered` - Доставлен
- `cancelled` - Отменен

---

### POST `/api/admin/orders/:id/assign-courier`
Назначить курьера на заказ.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "courier_id": 1
}
```

**Ответ (200):** Обновленный заказ

**Ошибки:**
- `404` - Курьер не найден
- `400` - Курьер неактивен или заказ уже назначен

---

### POST `/api/admin/orders/:id/cancel`
Отменить заказ.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "reason": "Клиент отменил заказ"
}
```

**Ответ (200):** Обновленный заказ

---

## 🛍️ Товары

### GET `/api/admin/products`
Список товаров.

**Заголовки:** `Authorization: Bearer <token>`

**Query параметры:**
- `category` - фильтр по категории
- `is_active` - фильтр по активности (true/false)
- `search` - поиск по названию

**Ответ (200):**
```json
{
  "products": [
    {
      "id": 1,
      "name": "Розы красные",
      "description": "Красные розы, 50 см",
      "price": 1500,
      "cost_price": 800,
      "image_url": "https://...",
      "type": "roses",
      "color": "red",
      "features": ["aromatic", "durable"],
      "min_quantity": 1,
      "step": 5,
      "stock": 100,
      "is_active": true,
      "created_at": "2025-12-01T10:00:00Z"
    }
  ]
}
```

---

### GET `/api/admin/products/:id`
Информация о товаре.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):** Объект товара (как в списке)

---

### POST `/api/admin/products`
Создать товар.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "name": "Розы красные",
  "description": "Красные розы, 50 см",
  "price": 1500,
  "cost_price": 800,
  "image_url": "https://...",
  "type": "roses",
  "color": "red",
  "features": ["aromatic", "durable"],
  "min_quantity": 1,
  "step": 5,
  "stock": 100,
  "is_active": true
}
```

**Ответ (200):** Созданный товар

**Роль:** Только `admin`

---

### PUT `/api/admin/products/:id`
Обновить товар.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:** Те же поля что и в POST

**Ответ (200):** Обновленный товар

**Роль:** Только `admin`

---

### DELETE `/api/admin/products/:id`
Удалить товар.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "success": true
}
```

**Роль:** Только `admin`

---

## 👥 Клиенты

### GET `/api/admin/customers`
Список клиентов.

**Заголовки:** `Authorization: Bearer <token>`

**Query параметры:**
- `search` - поиск по имени/телефону/email
- `page` - номер страницы
- `limit` - количество на странице

**Ответ (200):**
```json
{
  "customers": [
    {
      "id": 1,
      "telegram_id": 123456789,
      "username": "ivan_ivanov",
      "first_name": "Иван",
      "last_name": "Иванов",
      "phone": "+7 (999) 123-45-67",
      "email": "ivan@example.com",
      "bonuses": 500,
      "orders_count": 5,
      "total_spent": 15000,
      "created_at": "2025-11-01T10:00:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 50
}
```

---

### GET `/api/admin/customers/:id`
Информация о клиенте.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "id": 1,
  "telegram_id": 123456789,
  "username": "ivan_ivanov",
  "first_name": "Иван",
  "last_name": "Иванов",
  "phone": "+7 (999) 123-45-67",
  "email": "ivan@example.com",
  "bonuses": 500,
  "orders": [...],
  "addresses": [...],
  "orders_count": 5,
  "total_spent": 15000,
  "created_at": "2025-11-01T10:00:00Z"
}
```

---

### PATCH `/api/admin/customers/:id/bonuses`
Изменить баланс бонусов клиента.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "bonuses": 1000,
  "reason": "Бонус за отзыв"
}
```

**Ответ (200):** Обновленный клиент

**Роль:** Только `admin`

---

## 🚚 Курьеры

### GET `/api/admin/couriers`
Список курьеров.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "couriers": [
    {
      "id": 1,
      "name": "Петр Петров",
      "phone": "+7 (999) 111-22-33",
      "zone": {
        "id": 1,
        "name": "В пределах КАД"
      },
      "is_active": true,
      "total_deliveries": 150,
      "avg_delivery_time": 45,
      "created_at": "2025-11-01T10:00:00Z"
    }
  ]
}
```

---

### GET `/api/admin/couriers/:id`
Информация о курьере.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):** Объект курьера + статистика доставок

---

### POST `/api/admin/couriers`
Создать курьера.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "name": "Петр Петров",
  "phone": "+7 (999) 111-22-33",
  "zone_id": 1,
  "pin_code": "1234",
  "is_active": true
}
```

**Ответ (200):** Созданный курьер

**Роль:** Только `admin`

---

### PUT `/api/admin/couriers/:id`
Обновить курьера.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:** Те же поля что и в POST

**Ответ (200):** Обновленный курьер

**Роль:** Только `admin`

---

### DELETE `/api/admin/couriers/:id`
Удалить курьера.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "success": true
}
```

**Роль:** Только `admin`

---

## 🗺️ Доставка

### GET `/api/admin/delivery/zones`
Список зон доставки.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "zones": [
    {
      "id": 1,
      "name": "В пределах КАД",
      "price": 500,
      "free_from_amount": null,
      "created_at": "2025-11-01T10:00:00Z"
    }
  ]
}
```

---

### POST `/api/admin/delivery/zones`
Создать зону доставки.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "name": "До 30 км от КАД",
  "price": 2000,
  "free_from_amount": 5000
}
```

**Ответ (200):** Созданная зона

**Роль:** Только `admin`

---

### GET `/api/admin/delivery/slots`
Список временных слотов.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "slots": [
    {
      "id": 1,
      "start_time": "10:00",
      "end_time": "12:00",
      "max_orders": 10,
      "is_active": true,
      "created_at": "2025-11-01T10:00:00Z"
    }
  ]
}
```

---

### POST `/api/admin/delivery/slots`
Создать временной слот.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "start_time": "20:00",
  "end_time": "22:00",
  "max_orders": 5,
  "is_active": true
}
```

**Ответ (200):** Созданный слот

**Роль:** Только `admin`

---

## 🎟️ Промокоды

### GET `/api/admin/promocodes`
Список промокодов.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "promocodes": [
    {
      "id": 1,
      "code": "FLOW10",
      "type": "percent",
      "value": 10,
      "min_order": 2000,
      "start_date": "2025-12-01",
      "end_date": "2025-12-31",
      "max_uses": 100,
      "used_count": 25,
      "is_active": true,
      "created_at": "2025-11-25T10:00:00Z"
    }
  ]
}
```

---

### POST `/api/admin/promocodes`
Создать промокод.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "code": "FLOW10",
  "type": "percent",
  "value": 10,
  "min_order": 2000,
  "start_date": "2025-12-01",
  "end_date": "2025-12-31",
  "max_uses": 100,
  "is_active": true
}
```

**Ответ (200):** Созданный промокод

**Роль:** Только `admin`

---

## ⚙️ Настройки

### GET `/api/admin/settings`
Получить все настройки.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ (200):**
```json
{
  "min_order_amount": 1000,
  "bonus_percent": 1,
  "bonus_max_percent": 50,
  "service_fee": 450,
  "support_phone": "+7 (999) 123-45-67"
}
```

---

### PUT `/api/admin/settings`
Обновить настройки.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса:**
```json
{
  "min_order_amount": 1500,
  "bonus_percent": 2,
  "support_phone": "+7 (999) 999-99-99"
}
```

**Ответ (200):** Обновленные настройки

**Роль:** Только `admin`

---

## 🚴 API для курьеров

### POST `/api/courier/auth/login`
Вход курьера.

**Тело запроса:**
```json
{
  "phone": "+7 (999) 111-22-33",
  "pin_code": "1234"
}
```

**Ответ (200):**
```json
{
  "token": "courier_jwt_token...",
  "courier": {
    "id": 1,
    "name": "Петр Петров",
    "phone": "+7 (999) 111-22-33"
  }
}
```

---

### GET `/api/courier/auth/me`
Информация о текущем курьере.

**Заголовки:** `Authorization: Bearer <courier_token>`

**Ответ (200):**
```json
{
  "id": 1,
  "name": "Петр Петров",
  "phone": "+7 (999) 111-22-33",
  "zone": {
    "id": 1,
    "name": "В пределах КАД"
  }
}
```

---

### GET `/api/courier/orders`
Список заказов курьера на сегодня.

**Заголовки:** `Authorization: Bearer <courier_token>`

**Query параметры:**
- `date` (опционально) - дата в формате `YYYY-MM-DD`, по умолчанию сегодня

**Ответ (200):**
```json
{
  "orders": [
    {
      "id": 123,
      "delivery_date": "2025-12-04",
      "delivery_time": "10:00-12:00",
      "address_string": "Санкт-Петербург, ул. Примерная, д. 1, кв. 10",
      "recipient_name": "Мария Петрова",
      "recipient_phone": "+7 (999) 765-43-21",
      "total": 3500,
      "payment_method": "cash",
      "status": "assigned",
      "comment": "Позвонить за 10 минут"
    }
  ]
}
```

---

### GET `/api/courier/orders/:id`
Детальная информация о заказе.

**Заголовки:** `Authorization: Bearer <courier_token>`

**Ответ (200):** Полная информация о заказе (как в админке)

---

### POST `/api/courier/orders/:id/status`
Изменить статус заказа.

**Заголовки:** `Authorization: Bearer <courier_token>`

**Тело запроса:**
```json
{
  "status": "in_transit",
  "comment": "Выехал к клиенту"
}
```

**Возможные статусы для курьера:**
- `in_transit` - В пути
- `delivered` - Доставлено
- `problem` - Проблема

**Ответ (200):** Обновленный заказ

---

## 📝 Примечания

1. Все даты в формате ISO 8601: `YYYY-MM-DD` или `YYYY-MM-DDTHH:mm:ssZ`
2. Все суммы в копейках (целые числа)
3. JWT токены имеют срок действия (например, 24 часа)
4. При ошибке авторизации возвращается `401 Unauthorized`
5. При недостатке прав возвращается `403 Forbidden`

