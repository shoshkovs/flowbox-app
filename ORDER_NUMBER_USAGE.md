# Использование номера заказа во всех местах системы

## Формат номера заказа

**Новый формат:** `#userId016` (например, `#1059138125016`)
- `userId` - ID пользователя в Telegram
- `016` - номер заказа пользователя (001, 002, 003 и т.д.) с ведущими нулями

**Старый формат (больше не используется):** `#175` (просто ID заказа)

---

## 1. Генерация номера заказа (Backend - bot.js)

### Функция: `createOrderInDb()` (строки 2020-2038)

```javascript
// Генерируем номер заказа: userId + номер заказа пользователя (с ведущими нулями до 3 цифр)
let orderNumber = null;
if (userId && orderData.userId) {
  // Считаем количество заказов пользователя
  const userOrdersCountResult = await client.query(
    'SELECT COUNT(*) as count FROM orders WHERE user_id = $1',
    [userId]
  );
  const userOrderNumber = parseInt(userOrdersCountResult.rows[0].count, 10) + 1; // +1 потому что это будет новый заказ
  
  // Формируем номер заказа: userId + номер заказа (с ведущими нулями до 3 цифр)
  const userIdStr = String(orderData.userId);
  const orderNumberStr = String(userOrderNumber).padStart(3, '0');
  orderNumber = parseInt(userIdStr + orderNumberStr, 10);
  console.log(`📝 Сгенерирован номер заказа: ${orderNumber} (userId: ${userIdStr}, номер заказа пользователя: ${userOrderNumber})`);
  
  // Сохраняем номер заказа пользователя для возврата в ответе
  orderData.userOrderNumber = userOrderNumber;
}
```

**Логика:**
1. Подсчитывается количество существующих заказов пользователя
2. К этому количеству добавляется 1 (новый заказ)
3. Формируется строка: `userId` + `userOrderNumber` (с ведущими нулями до 3 цифр)
4. Результат: `1059138125` + `016` = `1059138125016`

### Возврат данных (строки 2329-2341)

```javascript
// Извлекаем номер заказа пользователя из order_number (последние 3 цифры)
let userOrderNumber = null;
if (order.order_number || orderNumber) {
  const fullOrderNumber = String(order.order_number || orderNumber);
  // Берем последние 3 цифры как номер заказа пользователя
  userOrderNumber = fullOrderNumber.slice(-3);
}

return {
  orderId: order.id,
  order_number: order.order_number || orderNumber || null,
  userOrderNumber: userOrderNumber || orderData.userOrderNumber || null,
  telegramOrderId: Date.now()
};
```

---

## 2. Отправка подтверждения заказа пользователю (Telegram)

### Функция: `sendOrderConfirmation()` (строки 2641-2739)

**Место использования:** Отправка сообщения пользователю после создания заказа

```javascript
async function sendOrderConfirmation(orderId, telegramId, orderData) {
  // ...
  let message = `📦 <b>Ваш заказ #${orderId}</b>\n\n`;
  // ... остальное содержимое сообщения
}
```

**⚠️ ПРОБЛЕМА:** Используется старый формат `#${orderId}` вместо нового формата `#userId016`

**Нужно изменить на:**
```javascript
// Получаем userId из telegramId или из orderData
const userId = telegramId; // или из orderData.userId
const userOrderNumber = orderData.userOrderNumber || null;

// Формируем номер заказа в новом формате
let orderNumberDisplay = `#${orderId}`; // fallback
if (userId && userOrderNumber) {
  const userOrderNumberStr = String(userOrderNumber).padStart(3, '0');
  orderNumberDisplay = `#${userId}${userOrderNumberStr}`;
} else if (orderData.order_number) {
  // Извлекаем из order_number
  const fullOrderNumber = String(orderData.order_number);
  const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
  orderNumberDisplay = `#${userId}${userOrderNumberStr}`;
}

let message = `📦 <b>Ваш заказ ${orderNumberDisplay}</b>\n\n`;
```

**Вызов функции:** Строка 3407 в `app.post('/api/orders')`
```javascript
await sendOrderConfirmation(result.orderId, orderData.userId, orderDataForMessage);
```

**Нужно передать `userOrderNumber`:**
```javascript
orderDataForMessage.userOrderNumber = result.userOrderNumber;
await sendOrderConfirmation(result.orderId, orderData.userId, orderDataForMessage);
```

---

## 3. Отправка уведомления в админку (Telegram группа)

### Функция: `sendOrderNotificationToGroup()` (строки 2507-2639)

**Место использования:** Отправка сообщения в группу админов о новом заказе

```javascript
async function sendOrderNotificationToGroup(orderId, orderData) {
  // ...
  let message = `🆕 <b>Новый заказ #${orderId}</b>\n\n`;
  // ... остальное содержимое сообщения
  // ...
  const orderUrl = `${adminUrl}/admin/orders/${orderId}`;
  message += `🔗 <a href="${orderUrl}">Открыть заказ в админке</a>`;
}
```

**⚠️ ПРОБЛЕМА:** Используется старый формат `#${orderId}` вместо нового формата `#userId016`

**Нужно изменить на:**
```javascript
// Получаем userId из orderData
const userId = orderData.userId || null;
const userOrderNumber = orderData.userOrderNumber || null;

// Формируем номер заказа в новом формате
let orderNumberDisplay = `#${orderId}`; // fallback
if (userId && userOrderNumber) {
  const userOrderNumberStr = String(userOrderNumber).padStart(3, '0');
  orderNumberDisplay = `#${userId}${userOrderNumberStr}`;
} else if (orderData.order_number) {
  // Извлекаем из order_number
  const fullOrderNumber = String(orderData.order_number);
  const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
  orderNumberDisplay = `#${userId}${userOrderNumberStr}`;
}

let message = `🆕 <b>Новый заказ ${orderNumberDisplay}</b>\n\n`;
```

**Вызов функции:** Строка 3449 в `app.post('/api/orders')`
```javascript
await sendOrderNotificationToGroup(result.orderId, orderDataForGroup);
```

**Нужно передать `userOrderNumber`:**
```javascript
orderDataForGroup.userOrderNumber = result.userOrderNumber;
orderDataForGroup.userId = orderData.userId;
await sendOrderNotificationToGroup(result.orderId, orderDataForGroup);
```

---

## 4. Уведомление о смене статуса заказа

### Функция: `sendOrderStatusNotification()` (строки 2470-2503)

**Место использования:** Отправка уведомления пользователю при изменении статуса заказа

```javascript
async function sendOrderStatusNotification(orderId, telegramId, newStatus) {
  // ...
  let message = `📦 Заказ #${orderId}\n\n`;
  message += `Статус изменен на: <b>${statusText}</b>`;
  // ...
}
```

**⚠️ ПРОБЛЕМА:** Используется старый формат `#${orderId}`

**Нужно изменить:**
- Получить `order_number` и `user_id` из БД
- Сформировать номер в новом формате

---

## 5. Отображение в профиле пользователя (Frontend - app.js)

### Функция: `formatOrderNumber()` (строки 6584-6620)

**Место использования:** Форматирование номера заказа для отображения в UI

```javascript
function formatOrderNumber(order) {
    // Получаем userId
    let userId = null;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userId = tg.initDataUnsafe.user.id;
    }
    
    // Если userId не получен из Telegram, пробуем получить из localStorage
    if (!userId) {
        const userData = localStorage.getItem('userData');
        if (userData) {
            try {
                const parsed = JSON.parse(userData);
                userId = parsed.userId || parsed.id;
            } catch (e) {
                console.warn('[formatOrderNumber] Не удалось распарсить userData из localStorage');
            }
        }
    }
    
    // Формируем номер заказа в формате "#userId016"
    if (userId) {
        if (order.userOrderNumber) {
            const userOrderNumberStr = String(order.userOrderNumber).padStart(3, '0');
            return `#${userId}${userOrderNumberStr}`;
        } else if (order.order_number) {
            // Извлекаем номер заказа пользователя из order_number (последние 3 цифры)
            const fullOrderNumber = String(order.order_number);
            const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
            return `#${userId}${userOrderNumberStr}`;
        }
    }
    
    // Fallback: если userId не найден или нет order_number/userOrderNumber, используем id
    return `#${order.id}`;
}
```

**✅ УЖЕ ИСПРАВЛЕНО:** Использует новый формат

### Использование в активных заказах (строки 6635-6668)

```javascript
// Форматируем номер заказа в новый формат
const orderNumber = formatOrderNumber(order);

return `
    <div class="order-card-carousel" onclick="openOrderDetail(${order.id})">
        <div class="order-card-header">
            <h4>Заказ ${orderNumber}</h4>
            <span class="order-status ${statusClass}">${statusText}</span>
        </div>
        <!-- ... -->
    </div>
`;
```

**✅ УЖЕ ИСПРАВЛЕНО**

### Использование в истории заказов (строки 7097-7102)

```javascript
// Форматируем номер заказа в новый формат
const orderNumber = formatOrderNumber(order);

return `
    <div class="order-history-item">
        <div class="order-item-header">
            <h4>Заказ ${orderNumber}</h4>
            <!-- ... -->
        </div>
    </div>
`;
```

**✅ УЖЕ ИСПРАВЛЕНО**

### Использование в деталях заказа (строки 6842-6904)

```javascript
// Форматируем номер заказа в формате "#userId016"
let orderNumber;

// Получаем userId
let userId = null;
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userId = tg.initDataUnsafe.user.id;
}

// Если userId не получен из Telegram, пробуем получить из localStorage
if (!userId) {
    const userData = localStorage.getItem('userData');
    if (userData) {
        try {
            const parsed = JSON.parse(userData);
            userId = parsed.userId || parsed.id;
        } catch (e) {
            console.warn('[renderOrderDetails] Не удалось распарсить userData из localStorage');
        }
    }
}

// Формируем номер заказа в формате "#userId016"
if (userId) {
    if (order.userOrderNumber) {
        const userOrderNumberStr = String(order.userOrderNumber).padStart(3, '0');
        orderNumber = `#${userId}${userOrderNumberStr}`;
    } else if (order.order_number) {
        // Извлекаем номер заказа пользователя из order_number (последние 3 цифры)
        const fullOrderNumber = String(order.order_number);
        const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
        orderNumber = `#${userId}${userOrderNumberStr}`;
    } else {
        // Fallback: используем id заказа
        orderNumber = `#${order.id}`;
    }
} else {
    // Если userId не найден, используем order_number или id
    if (order.order_number) {
        orderNumber = String(order.order_number);
    } else {
        orderNumber = `#${order.id}`;
    }
}

// Отображение
orderDetailsContent.innerHTML = `
    <!-- ... -->
    <div class="order-details-meta-row">
        <div class="order-details-meta-label">Номер заказа</div>
        <div class="order-details-meta-pill">${orderNumber}</div>
    </div>
    <!-- ... -->
`;
```

**✅ УЖЕ ИСПРАВЛЕНО**

### Использование на странице успешной оплаты (строки 2617-2673)

```javascript
// Устанавливаем номер заказа в формате "#userId016"
const orderIdElement = document.getElementById('paymentSuccessOrderId');
if (orderIdElement) {
    // Получаем userId
    let userId = null;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userId = tg.initDataUnsafe.user.id;
    }
    
    // Если userId не получен из Telegram, пробуем получить из localStorage
    if (!userId) {
        const userData = localStorage.getItem('userData');
        if (userData) {
            try {
                const parsed = JSON.parse(userData);
                userId = parsed.userId || parsed.id;
            } catch (e) {
                console.warn('[openPaymentSuccessPage] Не удалось распарсить userData из localStorage');
            }
        }
    }
    
    // Если передан userOrderNumber и userId, формируем номер в формате "#userId016"
    if (userOrderNumber && userId) {
        const userOrderNumberStr = String(userOrderNumber).padStart(3, '0');
        orderIdElement.textContent = `#${userId}${userOrderNumberStr}`;
    } else if (orderIdForFetch && userId) {
        // Если userOrderNumber не передан, пытаемся получить его из заказа
        // ... загрузка через API ...
    } else {
        orderIdElement.textContent = `#${orderId}`;
    }
}
```

**✅ УЖЕ ИСПРАВЛЕНО**

---

## 6. API ответы (Backend - bot.js)

### POST `/api/orders` (строки 3465-3471)

```javascript
const responseData = { 
  success: true, 
  orderId: result.orderId,
  order_number: result.order_number || null,
  userOrderNumber: result.userOrderNumber || null
};

res.status(200).json(responseData);
```

**✅ УЖЕ ИСПРАВЛЕНО:** Возвращает `order_number` и `userOrderNumber`

### GET `/api/orders/:orderId` (строки 3286-3302)

```javascript
// Извлекаем номер заказа пользователя из order_number (последние 3 цифры)
let userOrderNumber = null;
if (row.order_number) {
  const fullOrderNumber = String(row.order_number);
  userOrderNumber = fullOrderNumber.slice(-3);
}

const orderData = {
  id: row.id,
  // ...
  order_number: row.order_number || null,
  userOrderNumber: userOrderNumber,
  // ...
};
```

**✅ УЖЕ ИСПРАВЛЕНО:** Возвращает `order_number` и `userOrderNumber`

---

## 7. Админка (Backend - bot.js)

### GET `/api/admin/orders/:id` (строки 6042-6171)

**Место использования:** Получение данных заказа для админки

```javascript
// Проверяем наличие колонки order_number
const columnCheck = await client.query(`
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'orders' AND column_name = 'order_number'
`);
const hasOrderNumber = columnCheck.rows.length > 0;

// Используем условный SELECT в зависимости от наличия колонки order_number
const orderQuery = hasOrderNumber ? `
  SELECT o.*, o.order_number,
  -- ... остальные поля
` : `
  SELECT o.*,
  -- ... остальные поля без order_number
`;

// В ответе возвращается order_number, если есть
```

**✅ УЖЕ ИСПРАВЛЕНО:** Поддерживает `order_number`

---

## 8. SMS отправка

**⚠️ НЕ НАЙДЕНО:** В коде не найдено отправки SMS с номером заказа. Если используется внешний сервис, нужно проверить его интеграцию.

---

## Итоговый список мест, требующих исправления

### ❌ Требуют исправления:

1. **`sendOrderConfirmation()` (bot.js, строка 2659)**
   - Заменить `#${orderId}` на новый формат `#userId016`
   - Передать `userOrderNumber` в `orderDataForMessage`

2. **`sendOrderNotificationToGroup()` (bot.js, строка 2528)**
   - Заменить `#${orderId}` на новый формат `#userId016`
   - Передать `userOrderNumber` в `orderDataForGroup`

3. **`sendOrderStatusNotification()` (bot.js, строка 2484)**
   - Заменить `#${orderId}` на новый формат `#userId016`
   - Получить `order_number` и `user_id` из БД для формирования номера

### ✅ Уже исправлено:

1. Генерация номера заказа в `createOrderInDb()`
2. Возврат `userOrderNumber` в API ответах
3. Отображение в профиле (`formatOrderNumber()`)
4. Отображение в активных заказах
5. Отображение в истории заказов
6. Отображение в деталях заказа
7. Отображение на странице успешной оплаты
8. API GET `/api/orders/:orderId`
9. API POST `/api/orders`
10. Админка GET `/api/admin/orders/:id`

---

## Рекомендации по исправлению

### 1. Создать вспомогательную функцию форматирования (bot.js)

```javascript
// Форматирует номер заказа в новый формат "#userId016"
function formatOrderNumberForDisplay(orderId, userId, userOrderNumber, orderNumber) {
  if (userId && userOrderNumber) {
    const userOrderNumberStr = String(userOrderNumber).padStart(3, '0');
    return `#${userId}${userOrderNumberStr}`;
  } else if (userId && orderNumber) {
    // Извлекаем номер заказа пользователя из order_number (последние 3 цифры)
    const fullOrderNumber = String(orderNumber);
    const userOrderNumberStr = fullOrderNumber.slice(-3).padStart(3, '0');
    return `#${userId}${userOrderNumberStr}`;
  }
  // Fallback
  return `#${orderId}`;
}
```

### 2. Использовать функцию во всех местах отправки сообщений

```javascript
// В sendOrderConfirmation
const orderNumberDisplay = formatOrderNumberForDisplay(
  orderId, 
  telegramId, 
  orderData.userOrderNumber, 
  orderData.order_number
);
let message = `📦 <b>Ваш заказ ${orderNumberDisplay}</b>\n\n`;

// В sendOrderNotificationToGroup
const orderNumberDisplay = formatOrderNumberForDisplay(
  orderId, 
  orderData.userId, 
  orderData.userOrderNumber, 
  orderData.order_number
);
let message = `🆕 <b>Новый заказ ${orderNumberDisplay}</b>\n\n`;

// В sendOrderStatusNotification
// Нужно получить order_number и user_id из БД
const order = await getOrderFromDb(orderId);
const orderNumberDisplay = formatOrderNumberForDisplay(
  orderId, 
  order.user_id, 
  null, // userOrderNumber нужно извлечь из order_number
  order.order_number
);
let message = `📦 Заказ ${orderNumberDisplay}\n\n`;
```

### 3. Убедиться, что `userOrderNumber` передается во все функции

```javascript
// В app.post('/api/orders')
orderDataForMessage.userOrderNumber = result.userOrderNumber;
orderDataForMessage.userId = orderData.userId;
await sendOrderConfirmation(result.orderId, orderData.userId, orderDataForMessage);

orderDataForGroup.userOrderNumber = result.userOrderNumber;
orderDataForGroup.userId = orderData.userId;
await sendOrderNotificationToGroup(result.orderId, orderDataForGroup);
```

