# 📋 План расширения админки и добавления функционала курьеров

## Этап 1: Расширение базы данных

### Новые таблицы для добавления:

1. **admin_users** - пользователи админки (админы и операторы)
2. **couriers** - курьеры
3. **delivery_zones** - зоны доставки
4. **delivery_slots** - временные слоты доставки
5. **promocodes** - промокоды
6. **order_status_history** - история изменения статусов заказов
7. **settings** - общие настройки системы

### Изменения в существующих таблицах:

1. **orders** - добавить поля:
   - `courier_id` (FK к couriers)
   - `payment_status` (paid/unpaid)
   - `payment_method` (online/cash)
   - Расширить `status` (new/confirmed/preparing/assigned/in_transit/delivered/cancelled)

2. **products** - добавить поля:
   - `cost_price` (себестоимость)
   - `min_quantity` (минимальное количество)
   - `step` (шаг добавления)
   - `is_active` (уже есть)
   - `stock` (остаток на складе)

---

## Этап 2: API Endpoints

### 2.1. Аутентификация

#### POST `/api/admin/auth/login`
- **Тело:** `{ email, password }`
- **Ответ:** `{ token, user: { id, email, role, name } }`
- **Роль:** Публичный

#### POST `/api/admin/auth/logout`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ success: true }`
- **Роль:** Admin, Operator

#### GET `/api/admin/auth/me`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ id, email, role, name }`
- **Роль:** Admin, Operator

---

### 2.2. Dashboard

#### GET `/api/admin/dashboard/stats`
- **Заголовки:** `Authorization: Bearer <token>`
- **Query:** `?date=2025-12-03` (опционально, по умолчанию сегодня)
- **Ответ:**
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
  "recent_orders": [...]
}
```
- **Роль:** Admin, Operator

---

### 2.3. Заказы

#### GET `/api/admin/orders`
- **Заголовки:** `Authorization: Bearer <token>`
- **Query:** 
  - `status` (new/confirmed/preparing/assigned/in_transit/delivered/cancelled)
  - `date_from` (YYYY-MM-DD)
  - `date_to` (YYYY-MM-DD)
  - `search` (по номеру/телефону/имени)
  - `page` (пагинация)
  - `limit` (по умолчанию 50)
- **Ответ:** `{ orders: [...], total: 100, page: 1, limit: 50 }`
- **Роль:** Admin, Operator

#### GET `/api/admin/orders/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** Полная информация о заказе + история статусов
- **Роль:** Admin, Operator

#### PATCH `/api/admin/orders/:id/status`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ status: "confirmed", comment: "..." }`
- **Ответ:** Обновленный заказ
- **Роль:** Admin, Operator

#### POST `/api/admin/orders/:id/assign-courier`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ courier_id: 1 }`
- **Ответ:** Обновленный заказ
- **Роль:** Admin, Operator

#### POST `/api/admin/orders/:id/cancel`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ reason: "..." }`
- **Ответ:** Обновленный заказ
- **Роль:** Admin, Operator

---

### 2.4. Товары

#### GET `/api/admin/products`
- **Заголовки:** `Authorization: Bearer <token>`
- **Query:** `?category=roses&is_active=true`
- **Ответ:** `{ products: [...] }`
- **Роль:** Admin, Operator

#### GET `/api/admin/products/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** Полная информация о товаре
- **Роль:** Admin, Operator

#### POST `/api/admin/products`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ name, description, price, cost_price, image_url, type, color, features, min_quantity, step, stock, is_active }`
- **Ответ:** Созданный товар
- **Роль:** Admin

#### PUT `/api/admin/products/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** Те же поля что и в POST
- **Ответ:** Обновленный товар
- **Роль:** Admin

#### DELETE `/api/admin/products/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ success: true }`
- **Роль:** Admin

---

### 2.5. Клиенты

#### GET `/api/admin/customers`
- **Заголовки:** `Authorization: Bearer <token>`
- **Query:** `?search=...&page=1&limit=50`
- **Ответ:** `{ customers: [...], total: 100 }`
- **Роль:** Admin, Operator

#### GET `/api/admin/customers/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** Полная информация о клиенте + заказы + адреса
- **Роль:** Admin, Operator

#### PATCH `/api/admin/customers/:id/bonuses`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ bonuses: 1000, reason: "..." }`
- **Ответ:** Обновленный клиент
- **Роль:** Admin

---

### 2.6. Курьеры

#### GET `/api/admin/couriers`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ couriers: [...] }`
- **Роль:** Admin

#### GET `/api/admin/couriers/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** Полная информация о курьере + статистика
- **Роль:** Admin

#### POST `/api/admin/couriers`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ name, phone, zone_id, pin_code, is_active }`
- **Ответ:** Созданный курьер
- **Роль:** Admin

#### PUT `/api/admin/couriers/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** Те же поля что и в POST
- **Ответ:** Обновленный курьер
- **Роль:** Admin

#### DELETE `/api/admin/couriers/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ success: true }`
- **Роль:** Admin

---

### 2.7. Доставка

#### GET `/api/admin/delivery/zones`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ zones: [...] }`
- **Роль:** Admin

#### POST `/api/admin/delivery/zones`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ name, price, free_from_amount }`
- **Ответ:** Созданная зона
- **Роль:** Admin

#### GET `/api/admin/delivery/slots`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ slots: [...] }`
- **Роль:** Admin

#### POST `/api/admin/delivery/slots`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ start_time: "10:00", end_time: "12:00", max_orders: 10 }`
- **Ответ:** Созданный слот
- **Роль:** Admin

---

### 2.8. Промокоды

#### GET `/api/admin/promocodes`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ promocodes: [...] }`
- **Роль:** Admin

#### POST `/api/admin/promocodes`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ code, type: "fixed"/"percent", value, min_order, start_date, end_date, max_uses }`
- **Ответ:** Созданный промокод
- **Роль:** Admin

---

### 2.9. Настройки

#### GET `/api/admin/settings`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ settings: {...} }`
- **Роль:** Admin

#### PUT `/api/admin/settings`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ min_order_amount, bonus_percent, bonus_max_percent, support_phone, ... }`
- **Ответ:** Обновленные настройки
- **Роль:** Admin

---

## Этап 3: API для курьеров

### 3.1. Аутентификация курьера

#### POST `/api/courier/auth/login`
- **Тело:** `{ phone: "+7...", pin_code: "1234" }`
- **Ответ:** `{ token, courier: { id, name, phone } }`
- **Роль:** Публичный

#### GET `/api/courier/auth/me`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** `{ id, name, phone, zone }`
- **Роль:** Courier

---

### 3.2. Заказы курьера

#### GET `/api/courier/orders`
- **Заголовки:** `Authorization: Bearer <token>`
- **Query:** `?date=2025-12-03` (по умолчанию сегодня)
- **Ответ:** `{ orders: [...] }` - только заказы назначенные этому курьеру
- **Роль:** Courier

#### GET `/api/courier/orders/:id`
- **Заголовки:** `Authorization: Bearer <token>`
- **Ответ:** Полная информация о заказе
- **Роль:** Courier

#### POST `/api/courier/orders/:id/status`
- **Заголовки:** `Authorization: Bearer <token>`
- **Тело:** `{ status: "in_transit" | "delivered" | "problem", comment: "..." }`
- **Ответ:** Обновленный заказ
- **Роль:** Courier

---

## Этап 4: Структура фронтенда

### 4.1. Админка (`/admin`)

**Структура файлов:**
```
admin/
├── index.html (главная страница с роутингом)
├── admin.css
├── admin.js
├── pages/
│   ├── login.html
│   ├── dashboard.html
│   ├── orders.html
│   ├── order-detail.html
│   ├── products.html
│   ├── customers.html
│   ├── couriers.html
│   ├── delivery.html
│   ├── promos.html
│   └── settings.html
└── components/
    ├── header.js
    ├── sidebar.js
    └── order-card.js
```

**Роутинг:**
- Использовать `window.location.hash` для SPA роутинга
- Или простой роутинг через условное отображение страниц

---

### 4.2. Интерфейс курьера (`/courier`)

**Структура файлов:**
```
courier/
├── index.html
├── courier.css
├── courier.js
├── login.html
└── order-detail.html
```

**Особенности:**
- Максимально простой интерфейс
- Адаптивный дизайн для мобильных
- Большие кнопки для удобства нажатия
- Минимум текста, максимум функционала

---

## Этап 5: Порядок реализации

### Фаза 1 (Критично):
1. ✅ Расширение схемы БД (couriers, admin_users, delivery_zones)
2. ✅ API аутентификации для админа
3. ✅ Улучшение страницы заказов в админке
4. ✅ Карточка заказа с возможностью изменения статуса

### Фаза 2 (Важно):
5. ✅ Dashboard с статистикой
6. ✅ Управление курьерами
7. ✅ Назначение курьера на заказ
8. ✅ Интерфейс курьера (базовый)

### Фаза 3 (Желательно):
9. ✅ Управление товарами (расширенное)
10. ✅ Клиенты
11. ✅ Настройки доставки
12. ✅ Промокоды

### Фаза 4 (Опционально):
13. ✅ Настройки системы
14. ✅ Расширенная статистика
15. ✅ Экспорт отчетов

---

## Следующие шаги

**Что делаем сейчас?**

1. **Вариант A:** Начинаем с расширения БД и API endpoints (рекомендую)
2. **Вариант B:** Сначала делаем фронтенд админки
3. **Вариант C:** Начинаем с интерфейса курьера

**Мой совет:** Вариант A - сначала расширяем БД и API, потом фронтенд.

Какой вариант выбираешь?

