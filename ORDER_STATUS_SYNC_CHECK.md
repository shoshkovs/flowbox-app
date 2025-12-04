# Проверка синхронизации статусов заказов между админкой и мини-аппом

## Проблема
При изменении статуса заказа в админке статус не обновляется в мини-аппе.

## Анализ кода

### ✅ Мини-апп работает правильно

**Функция `loadActiveOrders()`** (`public/app.js:2642-2694`):
- Только рендерит данные из массива `userActiveOrders`
- Использует `getOrderStatusText()` и `getOrderStatusClass()` для форматирования
- Не отвечает за загрузку данных

**Загрузка данных** (`public/app.js:518-544`):
```javascript
if (data.activeOrders && Array.isArray(data.activeOrders)) {
    userActiveOrders = data.activeOrders;  // ✅ Берет данные из ответа сервера
    localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
}
loadActiveOrders();  // ✅ Обновляет отображение
```

### ✅ Бэкенд endpoints настроены правильно

**GET `/api/user-data/:userId`** (`bot.js:1424-1462`):
- Вызывает `loadUserOrders(user.id, ['NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'CANCELED'])`
- Возвращает `activeOrders: activeOrders` в ответе
- ✅ Читает статусы из `orders.status` (та же таблица, что и админка)

**PUT `/api/admin/orders/:id`** (`bot.js:2444-2600`):
- Обновляет `orders.status` через `UPDATE orders SET status = $1`
- ✅ Использует нормализацию статусов (новое)
- ✅ Записывает в `order_status_history`

**PATCH `/api/admin/orders/:orderId/status`** (`bot.js:3585-3648`):
- Обновляет `orders.status` через `UPDATE orders SET status = $1`
- ✅ Валидирует статусы: `['PROCESSING', 'DELIVERING', 'COMPLETED', 'CANCELED']`
- ✅ Записывает в `order_status_history`

### ✅ Функция загрузки заказов

**`loadUserOrders(userId, status)`** (`bot.js:1244-1294`):
```sql
SELECT o.*, ... FROM orders o
WHERE o.user_id = $1
  AND o.status = ANY($2::text[])  -- ✅ Фильтр по статусам
```

Возвращает:
```javascript
{
  id: row.id,
  status: row.status,  // ✅ Берет напрямую из orders.status
  // ...
}
```

## Что исправлено

### 1. Добавлена нормализация статусов

**Функция `normalizeOrderStatus(status)`** (`bot.js:3274-3295`):
- Преобразует старые форматы (`'new'`, `'active'`, `'delivered'`) в единый enum
- Маппинг: `'ACTIVE'` → `'NEW'`, `'DELIVERED'` → `'COMPLETED'`, и т.д.
- Используется во всех endpoints обновления статуса

### 2. Улучшена валидация статусов

**PUT `/api/admin/orders/:id/status`**:
- Теперь принимает только правильные статусы: `['UNPAID', 'NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'COMPLETED', 'CANCELED']`
- Старые форматы автоматически нормализуются

**PUT `/api/admin/orders/:id`**:
- Добавлена нормализация статуса перед сохранением
- Валидация с понятным сообщением об ошибке

## Единый enum статусов

**В БД и API должны использоваться ТОЛЬКО эти значения:**
- `UNPAID` - Не оплачен
- `NEW` - Новый
- `PROCESSING` - В обработке
- `COLLECTING` - Собирается
- `DELIVERING` - В пути
- `COMPLETED` - Доставлен
- `CANCELED` - Отменён

**Русские названия** отображаются только на фронтенде через `getOrderStatusText()`.

## Чек-лист для проверки синхронизации

### 1. Проверить, что статусы читаются из правильного места

**В DevTools → Network:**
1. Открой мини-апп
2. Найдите запрос `GET /api/user-data/:userId`
3. Проверь Response → `activeOrders`:
   ```json
   {
     "activeOrders": [
       {
         "id": 123,
         "status": "PROCESSING",  // ✅ Должен быть из orders.status
         ...
       }
     ]
   }
   ```

**Если статус другой или отсутствует:**
- Проверить SQL запрос в `loadUserOrders()` - должен быть `SELECT o.status FROM orders o`
- Убедиться, что нет JOIN с другими таблицами, которые перезаписывают статус

### 2. Проверить, что админка записывает в правильное поле

**В DevTools → Network (админка):**
1. Измени статус заказа в админке
2. Найдите запрос `PUT /api/admin/orders/:id` или `PATCH /api/admin/orders/:orderId/status`
3. Проверь Request Payload:
   ```json
   {
     "status": "PROCESSING"  // ✅ Должен быть правильный enum
   }
   ```

**В Render.com → Logs:**
После изменения статуса должны быть логи:
```
UPDATE orders SET status = $1 WHERE id = $2
```

**Проверить БД напрямую:**
```sql
SELECT id, status FROM orders WHERE id = <order_id>;
-- Должен быть статус в формате: PROCESSING, DELIVERING, и т.д.
```

### 3. Проверить, что после изменения статуса мини-апп получает новые данные

**Сценарий:**
1. Открой мини-апп → Профиль → Активные заказы
2. Запомни текущий статус заказа (например, "В обработке")
3. В админке измени статус на "В пути" (`DELIVERING`)
4. В мини-аппе:
   - Закрой и открой профиль заново
   - ИЛИ подожди 30 секунд (периодическая синхронизация)
5. Проверь, что статус обновился

**Если статус не обновился:**
- Проверить логи Render.com: возвращает ли `GET /api/user-data/:userId` новый статус
- Проверить DevTools → Network: какой статус приходит в `activeOrders`
- Проверить, что `loadUserData()` вызывается после изменения статуса

### 4. Проверить единообразие enum статусов

**В БД:**
```sql
-- Проверить все уникальные статусы в таблице orders
SELECT DISTINCT status FROM orders ORDER BY status;

-- Должны быть только: UNPAID, NEW, PROCESSING, COLLECTING, DELIVERING, COMPLETED, CANCELED
-- Если есть другие (например, 'new', 'active', 'delivered') - нужно мигрировать
```

**Миграция старых статусов:**
```sql
UPDATE orders SET status = 'NEW' WHERE status = 'active' OR status = 'new';
UPDATE orders SET status = 'PROCESSING' WHERE status = 'confirmed' OR status = 'preparing';
UPDATE orders SET status = 'COLLECTING' WHERE status = 'assembly';
UPDATE orders SET status = 'DELIVERING' WHERE status = 'in_transit' OR status = 'delivery';
UPDATE orders SET status = 'COMPLETED' WHERE status = 'delivered' OR status = 'completed';
UPDATE orders SET status = 'CANCELED' WHERE status = 'cancelled' OR status = 'canceled';
```

## Что уже исправлено в коде

1. ✅ Добавлена функция `normalizeOrderStatus()` для нормализации статусов
2. ✅ В `PUT /api/admin/orders/:id/status` добавлена нормализация и строгая валидация
3. ✅ В `PUT /api/admin/orders/:id` добавлена нормализация статуса перед сохранением
4. ✅ Все endpoints обновления статуса записывают в `orders.status` (одно и то же поле)
5. ✅ `loadUserOrders()` читает статусы из `orders.status` (то же поле)

## Ожидаемое поведение после исправлений

1. **Админка меняет статус:**
   - Статус нормализуется (если был старый формат)
   - Сохраняется в `orders.status`
   - Записывается в `order_status_history`

2. **Мини-апп запрашивает данные:**
   - `GET /api/user-data/:userId` вызывает `loadUserOrders()`
   - `loadUserOrders()` читает из `orders.status` (то же поле!)
   - Возвращает `activeOrders` с актуальными статусами

3. **Мини-апп отображает:**
   - `loadActiveOrders()` берет статусы из `userActiveOrders`
   - `getOrderStatusText()` и `getOrderStatusClass()` форматируют статусы
   - Пользователь видит актуальный статус

## Если проблема сохраняется

1. **Проверить кэширование:**
   - Убедиться, что нет кэша на уровне API
   - Проверить, что `loadUserData()` вызывается при открытии профиля

2. **Проверить периодическую синхронизацию:**
   - В `public/app.js` должна быть функция `initPeriodicSync()` или аналогичная
   - Она должна вызывать `loadUserData()` каждые 30 секунд

3. **Проверить логи:**
   - После изменения статуса в админке проверить логи Render.com
   - Убедиться, что статус действительно обновился в БД
   - Проверить, что следующий запрос от мини-аппа возвращает новый статус

