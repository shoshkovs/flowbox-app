# Документация: Номер заказа в FlowBox

## Общая информация

Номер заказа в FlowBox отображается в формате **`#userId016`**, где:
- `userId` - ID пользователя из Telegram (например, `1059138125`)
- `016` - порядковый номер заказа пользователя (001, 002, 003...), дополненный ведущими нулями до 3 цифр

**Пример:** `#1059138125001` означает первый заказ пользователя с ID `1059138125`.

---

## 1. Структура данных в базе

### Поля в таблице `orders`:

- **`id`** (BIGINT, PRIMARY KEY) - внутренний ID заказа в базе данных
- **`order_number`** (BIGINT) - полный номер заказа в формате `userId + userOrderNumber` (например, `1059138125001`)
- **`user_id`** (BIGINT) - ID пользователя из Telegram
- **`userOrderNumber`** - порядковый номер заказа пользователя (1, 2, 3...), вычисляется при создании

### Формула генерации `order_number`:

```javascript
order_number = parseInt(userId + userOrderNumber.padStart(3, '0'), 10)
```

**Пример:**
- `userId = 1059138125`
- `userOrderNumber = 1` (первый заказ пользователя)
- `order_number = 1059138125001`

---

## 2. Генерация номера заказа (Backend)

### Файл: `bot.js`

**Функция создания заказа** (строки ~2029-2046):

```javascript
// Считаем количество заказов пользователя
const userOrdersCountResult = await client.query(
  'SELECT COUNT(*) as count FROM orders WHERE user_id = $1',
  [userId]
);
const userOrderNumber = parseInt(userOrdersCountResult.rows[0].count, 10) + 1;

// Формируем номер заказа
const userIdStr = String(orderData.userId);
const orderNumberStr = String(userOrderNumber).padStart(3, '0');
orderNumber = parseInt(userIdStr + orderNumberStr, 10);

// Сохраняем userOrderNumber для возврата в ответе
orderData.userOrderNumber = userOrderNumber;
```

**Логика:**
1. Подсчитываем количество существующих заказов пользователя
2. Добавляем 1 (это будет новый заказ)
3. Формируем `order_number` как конкатенацию `userId` + `userOrderNumber` (с ведущими нулями)
4. Сохраняем `order_number` в БД и `userOrderNumber` возвращаем в ответе API

---

## 3. Форматирование номера заказа для отображения

### 3.1. Мини-приложение (Frontend)

**Файл:** `public/app.js`

**Функция:** `formatOrderNumber(order)` (строки 6776-6838)

```javascript
function formatOrderNumber(order) {
    if (!order) return `#${order?.id || '?'}`;

    // 1. Получаем userId из разных источников
    let userId = order.user_id || order.userId || order.customer_id || order.customerId || null;
    
    if (!userId) {
        // Из Telegram
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            userId = tg.initDataUnsafe.user.id;
        }
        // Из localStorage
        if (!userId) {
            const userData = localStorage.getItem('userData');
            if (userData) {
                const parsed = JSON.parse(userData);
                userId = parsed.userId || parsed.id;
            }
        }
    }

    // 2. Проверяем userOrderNumber
    const userOrderNumber = order.userOrderNumber || order.user_order_number || null;
    
    // 3. Проверяем order_number
    const orderNumber = order.order_number || order.orderNumber || null;

    // 4. Формируем номер заказа
    if (userId) {
        // Приоритет 1: userOrderNumber
        if (userOrderNumber != null && userOrderNumber !== undefined && userOrderNumber !== '') {
            const userOrderNumberStr = String(userOrderNumber).padStart(3, '0');
            return `#${userId}${userOrderNumberStr}`;
        }

        // Приоритет 2: извлекаем из order_number
        if (orderNumber != null && orderNumber !== undefined && orderNumber !== '') {
            const fullOrderNumber = String(orderNumber);
            const userIdStr = String(userId);
            
            if (fullOrderNumber.startsWith(userIdStr)) {
                // order_number = userId + userOrderNumber
                const userOrderNumberPart = fullOrderNumber.slice(userIdStr.length);
                const userOrderNumberStr = userOrderNumberPart.padStart(3, '0');
                return `#${userId}${userOrderNumberStr}`;
            } else {
                // Берем последние 3 цифры
                const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
                return `#${userId}${userOrderNumberStr}`;
            }
        }
    }

    // Fallback: используем id заказа
    return `#${order.id}`;
}
```

**Приоритет получения данных:**
1. `userOrderNumber` (если есть)
2. `order_number` (извлекаем последние 3 цифры или часть после `userId`)
3. `order.id` (fallback)

---

### 3.2. Админ-панель - Список заказов

**Файл:** `admin/src/components/Orders.jsx`

**Функция:** `formatOrderNumber(order)` (строки 167-209)

Логика идентична функции в `public/app.js`.

**Использование:**
- Отображение в таблице заказов (строка 618)
- Поиск по номеру заказа (строки 400-405)

```jsx
<span className="text-blue-600 font-medium">{formatOrderNumber(order)}</span>
```

---

### 3.3. Админ-панель - Детали заказа

**Файл:** `admin/src/components/orders/OrderDetail.jsx`

**Функция:** `formatOrderNumber(order)` (строки 9-51)

Логика идентична функции в `public/app.js`.

**Использование:**
- Заголовок страницы (строка 370)
- Поле "ID заказа" (строка 396)

```jsx
<h1 className="text-3xl font-bold">Заказ {formatOrderNumber(order)}</h1>
<p className="text-gray-900">{formatOrderNumber(order)}</p>
```

---

### 3.4. Backend - Уведомления

**Файл:** `bot.js`

**Функция:** `formatOrderNumberForDisplay({ orderId, userId, userOrderNumber, orderNumber })` (строки 2449-2464)

```javascript
function formatOrderNumberForDisplay({ orderId, userId, userOrderNumber, orderNumber }) {
  // Приоритет 1: userOrderNumber
  if (userId && userOrderNumber != null) {
    const n = String(userOrderNumber).padStart(3, '0');
    return `#${userId}${n}`;
  }

  // Приоритет 2: order_number (последние 3 цифры)
  if (userId && orderNumber != null) {
    const n = String(orderNumber).slice(-3).padStart(3, '0');
    return `#${userId}${n}`;
  }

  // Fallback: orderId
  return `#${orderId}`;
}
```

**Использование:**
- Уведомления о смене статуса (строка 2510)
- Уведомления о новом заказе (строка 2563)
- Уведомления пользователю о заказе (строка 2702)

---

## 4. Места отображения номера заказа

### 4.1. Мини-приложение (Frontend)

#### А) Активные заказы в профиле
**Файл:** `public/app.js`, функция `renderActiveOrders()` (строки ~6855-6888)

```javascript
const orderNumber = formatOrderNumber(order);
// Отображается в карточке заказа
<h4>Заказ ${orderNumber}</h4>
```

#### Б) История заказов
**Файл:** `public/app.js`, функция `renderOrderHistory()` (строки ~7341-7352)

```javascript
const orderNumber = formatOrderNumber(order);
// Отображается в списке истории
<h4>Заказ ${orderNumber}</h4>
```

#### В) Детали заказа
**Файл:** `public/app.js`, функция `renderOrderDetails()` (строки ~7077-7138)

```javascript
// Формирование номера заказа с проверкой userId
let orderNumber;
if (order.userOrderNumber) {
    const userOrderNumberStr = String(order.userOrderNumber).padStart(3, '0');
    orderNumber = `#${userId}${userOrderNumberStr}`;
} else if (order.order_number) {
    const fullOrderNumber = String(order.order_number);
    const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
    orderNumber = `#${userId}${userOrderNumberStr}`;
} else {
    orderNumber = `#${order.id}`;
}

// Отображается в мета-информации заказа
<div class="order-details-meta-pill">${orderNumber}</div>
```

#### Г) Страница успешной оплаты
**Файл:** `public/app.js`, функция `openPaymentSuccessPage()` (строки ~2728-2749)

```javascript
// Формирование номера заказа для отображения
if (userOrderNumber && userId) {
    const userOrderNumberStr = String(userOrderNumber).padStart(3, '0');
    orderIdElement.textContent = `#${userId}${userOrderNumberStr}`;
}
```

---

### 4.2. Админ-панель

#### А) Список заказов
**Файл:** `admin/src/components/Orders.jsx`

- **Таблица заказов** (строка 618): отображается в колонке "Номер заказа"
- **Поиск** (строки 400-405): поиск работает по ID и по отформатированному номеру

```jsx
<span className="text-blue-600 font-medium">{formatOrderNumber(order)}</span>
```

#### Б) Детали заказа
**Файл:** `admin/src/components/orders/OrderDetail.jsx`

- **Заголовок страницы** (строка 370): `Заказ {formatOrderNumber(order)}`
- **Поле "ID заказа"** (строка 396): отображается в карточке информации

---

### 4.3. Backend (Уведомления)

**Файл:** `bot.js`

#### А) Уведомление о смене статуса
**Функция:** `sendOrderStatusNotification()` (строки 2510-2520)

```javascript
const orderNumberDisplay = formatOrderNumberForDisplay({
  orderId,
  userId: userId || telegramId,
  userOrderNumber: null,
  orderNumber: orderNumber
});

let message = `📦 Заказ ${orderNumberDisplay}\n\n`;
message += `Статус заказа изменён: ${statusText}\n`;
```

#### Б) Уведомление о новом заказе (админу)
**Функция:** `sendNewOrderNotification()` (строки 2563-2571)

```javascript
const orderNumberDisplay = formatOrderNumberForDisplay({
  orderId,
  userId: orderData.userId,
  userOrderNumber: orderData.userOrderNumber,
  orderNumber: orderData.order_number
});

let message = `🆕 <b>Новый заказ ${orderNumberDisplay}</b>\n\n`;
```

#### В) Уведомление пользователю о заказе
**Функция:** `sendOrderConfirmationToUser()` (строки 2702-2710)

```javascript
const orderNumberDisplay = formatOrderNumberForDisplay({
  orderId,
  userId: telegramId,
  userOrderNumber: orderData.userOrderNumber,
  orderNumber: orderData.order_number
});

let message = `📦 <b>Ваш заказ ${orderNumberDisplay}</b>\n\n`;
```

---

## 5. API ответы

### 5.1. Создание заказа

**Endpoint:** `POST /api/orders`

**Ответ:**
```json
{
  "id": 123,
  "order_number": 1059138125001,
  "userOrderNumber": 1,
  "status": "NEW",
  ...
}
```

### 5.2. Получение заказа

**Endpoint:** `GET /api/orders/:id?userId=:userId`

**Ответ:**
```json
{
  "id": 123,
  "order_number": 1059138125001,
  "user_id": 1059138125,
  "userOrderNumber": 1,
  "status": "NEW",
  ...
}
```

### 5.3. Список заказов (админ)

**Endpoint:** `GET /api/admin/orders`

**Ответ:**
```json
[
  {
    "id": 123,
    "order_number": 1059138125001,
    "user_id": 1059138125,
    "userOrderNumber": 1,
    ...
  }
]
```

---

## 6. Миграции базы данных

### Добавление колонки `order_number`

**Файл:** `bot.js` (строки ~1013-1043)

```javascript
// Проверка наличия колонки
const orderNumberColumnCheck = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name = 'order_number'
`);

if (orderNumberColumnCheck.rows.length === 0) {
  await client.query(`
    ALTER TABLE orders
    ADD COLUMN order_number BIGINT
  `);
}
```

---

## 7. Важные замечания

### 7.1. Совместимость полей

Функции форматирования проверяют разные варианты названий полей:
- `user_id` / `userId` / `customer_id` / `customerId`
- `userOrderNumber` / `user_order_number`
- `order_number` / `orderNumber`

Это обеспечивает совместимость с разными версиями API и структурами данных.

### 7.2. Fallback логика

Если `userId` или `userOrderNumber` не найдены:
1. Пытаемся извлечь из `order_number`
2. Если не получается - используем `order.id` как fallback

### 7.3. Формат отображения

Всегда в формате: **`#userId016`**
- Символ `#` в начале
- `userId` без изменений
- `userOrderNumber` с ведущими нулями (3 цифры)

---

## 8. Примеры использования

### Пример 1: Первый заказ пользователя
- `userId = 1059138125`
- `userOrderNumber = 1`
- `order_number = 1059138125001`
- **Отображение:** `#1059138125001`

### Пример 2: Десятый заказ пользователя
- `userId = 1059138125`
- `userOrderNumber = 10`
- `order_number = 1059138125010`
- **Отображение:** `#1059138125010`

### Пример 3: Сотый заказ пользователя
- `userId = 1059138125`
- `userOrderNumber = 100`
- `order_number = 1059138125100`
- **Отображение:** `#1059138125100`

---

## 9. Файлы, содержащие логику номера заказа

### Frontend (Мини-приложение)
- `public/app.js`:
  - `formatOrderNumber()` - основная функция форматирования
  - `openPaymentSuccessPage()` - отображение на странице успеха
  - `renderActiveOrders()` - активные заказы в профиле
  - `renderOrderHistory()` - история заказов
  - `renderOrderDetails()` - детали заказа

### Frontend (Админ-панель)
- `admin/src/components/Orders.jsx`:
  - `formatOrderNumber()` - форматирование для списка заказов
  - Использование в таблице и поиске

- `admin/src/components/orders/OrderDetail.jsx`:
  - `formatOrderNumber()` - форматирование для деталей заказа
  - Использование в заголовке и карточке информации

### Backend
- `bot.js`:
  - Генерация `order_number` при создании заказа (строки ~2029-2046)
  - `formatOrderNumberForDisplay()` - форматирование для уведомлений
  - `sendOrderStatusNotification()` - уведомления о смене статуса
  - `sendNewOrderNotification()` - уведомления о новом заказе
  - `sendOrderConfirmationToUser()` - подтверждение заказа пользователю
  - Миграция добавления колонки `order_number` (строки ~1013-1043)

---

## 10. Поиск по номеру заказа

### Админ-панель

**Файл:** `admin/src/components/Orders.jsx` (строки 400-405)

Поиск работает по:
- ID заказа (`order.id`)
- Отформатированному номеру заказа (с символом `#` и без)

```javascript
const formattedOrderNumber = formatOrderNumber(order);
return orderIdStr.includes(searchId) ||
       orderIdStr === searchId ||
       formattedOrderNumber.includes(searchId) ||
       formattedOrderNumber.replace('#', '') === searchId;
```

---

## 11. Резюме

### Формат номера заказа
**`#userId016`** (например, `#1059138125001`)

### Где используется
1. ✅ Мини-приложение: профиль, история, детали заказа, страница успеха
2. ✅ Админ-панель: список заказов, детали заказа, поиск
3. ✅ Backend: уведомления в Telegram

### Источники данных
1. **Приоритет 1:** `userOrderNumber` (прямое значение)
2. **Приоритет 2:** `order_number` (извлекаем часть после `userId` или последние 3 цифры)
3. **Fallback:** `order.id` (если ничего не найдено)

### Генерация
- При создании заказа подсчитывается количество заказов пользователя
- `userOrderNumber = COUNT(*) + 1`
- `order_number = userId + userOrderNumber.padStart(3, '0')`

---

---

## 12. Известные проблемы и исправления

### Проблема: Отображение `#id` вместо `#userId016`

**Симптомы:**
- В админ-панели и профиле показывается `#175` вместо `#1059138125001`
- Функция `formatOrderNumber()` работает правильно, но получает `null` для `order_number` или `user_id`

**Причины:**
1. **API не возвращает нужные поля** - в списковых эндпоинтах (`/api/admin/orders`, `/api/user-data/:userId`) не возвращались `order_number`, `user_id` или `userOrderNumber`
2. **Старые заказы без `order_number`** - заказы, созданные до внедрения генерации, имеют `order_number = NULL`

**Исправления:**

#### А) Функция `loadUserOrders()` (для профиля)
**Файл:** `bot.js` (строки ~2793-2851)

**Было:**
```javascript
return result.rows.map(row => ({
  id: row.id,
  date: ...,
  // order_number и user_id не возвращались
}));
```

**Стало:**
```javascript
return result.rows.map(row => {
  let userOrderNumber = null;
  if (row.order_number) {
    const fullOrderNumber = String(row.order_number);
    userOrderNumber = parseInt(fullOrderNumber.slice(-3), 10);
  }
  
  return {
    id: row.id,
    user_id: row.user_id, // ✅ Добавлено
    order_number: row.order_number || null, // ✅ Добавлено
    userOrderNumber: userOrderNumber, // ✅ Добавлено
    date: ...,
    ...
  };
});
```

#### Б) Эндпоинт `/api/admin/orders`
**Файл:** `bot.js` (строки ~6082-6088)

**Было:**
```javascript
const orders = result.rows.map(row => ({
  ...row,
  total: row.total || 0,
  address_data: ...
}));
```

**Стало:**
```javascript
const orders = result.rows.map(row => {
  let userOrderNumber = null;
  if (row.order_number) {
    const fullOrderNumber = String(row.order_number);
    if (row.user_id) {
      const userIdStr = String(row.user_id);
      if (fullOrderNumber.startsWith(userIdStr)) {
        userOrderNumber = parseInt(fullOrderNumber.slice(userIdStr.length), 10);
      } else {
        userOrderNumber = parseInt(fullOrderNumber.slice(-3), 10);
      }
    } else {
      userOrderNumber = parseInt(fullOrderNumber.slice(-3), 10);
    }
  }
  
  return {
    ...row,
    total: row.total || 0,
    address_data: ...,
    userOrderNumber: userOrderNumber // ✅ Добавлено
  };
});
```

### Backfill для старых заказов (SQL)

Если в базе есть заказы с `order_number IS NULL`, можно заполнить их:

```sql
WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) AS n
  FROM orders
  WHERE order_number IS NULL
)
UPDATE orders o
SET order_number = (CAST(r.user_id AS bigint) * 1000 + r.n)
FROM ranked r
WHERE o.id = r.id
  AND o.order_number IS NULL;
```

**Важно:** Порядок заказов фиксируется по `created_at`, затем по `id` для стабильности.

---

*Документ создан: 2024*
*Последнее обновление: автоматически при изменении кода*
