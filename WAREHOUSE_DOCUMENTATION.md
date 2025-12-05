# 📦 Документация: Склад (Warehouse)

## 🗄️ Структура базы данных

### Таблица `supplies` (Поставки/Партии)
```sql
CREATE TABLE supplies (
    id                  SERIAL PRIMARY KEY,
    product_id          INTEGER REFERENCES products(id),  -- NULL для новых поставок с множественными товарами
    quantity            INTEGER,                          -- NULL для новых поставок
    unit_purchase_price DECIMAL(10,2),                    -- NULL для новых поставок
    delivery_date       DATE NOT NULL,
    supplier_id         INTEGER REFERENCES suppliers(id),
    total_amount        DECIMAL(10,2),                    -- Общая сумма поставки (для новых поставок)
    delivery_price       DECIMAL(10,2) DEFAULT 0,          -- Цена доставки
    comment             TEXT,                             -- Комментарий
    parent_supply_id     INTEGER REFERENCES supplies(id) ON DELETE CASCADE,  -- ID основной поставки
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
```

**Логика:**
- Основная поставка (с `total_amount`) имеет `product_id = NULL`
- Для каждого товара создается запись в `supplies` с `parent_supply_id = ID основной поставки`
- Все товары из одной поставки имеют одинаковый `parent_supply_id`

### Таблица `supply_items` (Товары в поставке)
```sql
CREATE TABLE supply_items (
    id                  SERIAL PRIMARY KEY,
    supply_id           INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
    product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_count         INTEGER NOT NULL CHECK (batch_count > 0),      -- Количество банчей
    pieces_per_batch    INTEGER NOT NULL CHECK (pieces_per_batch > 0), -- Штук в банче
    batch_price         DECIMAL(10,2) NOT NULL CHECK (batch_price > 0), -- Цена банча
    unit_price          DECIMAL(10,2) NOT NULL CHECK (unit_price > 0),   -- Цена за штуку
    total_pieces        INTEGER NOT NULL CHECK (total_pieces > 0),       -- Общее количество штук
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

### Таблица `stock_movements` (Движения по складу)
```sql
CREATE TABLE stock_movements (
    id              SERIAL PRIMARY KEY,
    product_id       INTEGER NOT NULL REFERENCES products(id),
    type            TEXT NOT NULL CHECK (type IN ('SUPPLY', 'SALE', 'WRITE_OFF')),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    supply_id       INTEGER REFERENCES supplies(id),  -- Привязка к конкретной партии
    order_id        BIGINT REFERENCES orders(id),      -- Для движений типа SALE
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Типы движений:**
- `SUPPLY` - Поступление товара (при создании поставки)
- `SALE` - Продажа (при создании заказа, FIFO логика)
- `WRITE_OFF` - Списание (ручное списание из конкретной партии)

### Таблица `suppliers` (Поставщики)
```sql
CREATE TABLE suppliers (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 🔌 API Endpoints

### 1. `GET /api/admin/warehouse`
**Назначение:** Получить список всех товаров с партиями (для вкладки "Товары")

**Ответ:**
```json
[
  {
    "id": "1",
    "productId": "1",
    "productName": "Роза пинки",
    "category": "Розы",
    "color": "Розовые",
    "image": "url",
    "totalRemaining": 30,
    "batches": [
      {
        "id": "2",
        "supplyId": "1",  // ID основной поставки (parent_supply_id)
        "batchNumber": "#2",
        "deliveryDate": "2025-12-05",
        "initialQuantity": 10,
        "sold": 0,
        "writeOff": 0,
        "remaining": 10,
        "purchasePrice": 160.00,
        "supplier": "family"
      }
    ]
  }
]
```

**Логика расчета остатков:**
- Для каждой партии: `remaining = supplied - sold - writeOff`
- `supplied` берется из `SUPPLY` движений или `supplies.quantity`
- `sold` и `writeOff` считаются по `supply_id` конкретной партии
- `supplyId` для отображения = `parent_supply_id` (если есть) или `id`

---

### 2. `GET /api/admin/supplies`
**Назначение:** Получить все поставки с товарами (для вкладки "Поставки")

**Ответ:**
```json
[
  {
    "id": 1,
    "deliveryDate": "2025-12-05",
    "supplierName": "family",
    "totalAmount": 1600.00,
    "deliveryPrice": 0,
    "comment": null,
    "items": [
      {
        "id": 1,
        "productId": 1,
        "productName": "Роза пинки",
        "batchCount": 1,
        "piecesPerBatch": 10,
        "batchPrice": 1600.00,
        "unitPrice": 160.00,
        "totalPieces": 10,
        "sold": 0,
        "writeOff": 0,
        "remaining": 10,
        "totalPrice": 1600.00
      }
    ]
  }
]
```

**Логика расчета остатков:**
- Для каждого товара в поставке находятся все партии с `parent_supply_id = supply.id`
- `sold` и `writeOff` суммируются только по партиям ЭТОЙ поставки
- `remaining = totalPieces - sold - writeOff`

---

### 3. `POST /api/admin/supplies`
**Назначение:** Создать новую поставку с множественными товарами

**Тело запроса:**
```json
{
  "deliveryDate": "2025-12-05",
  "supplierId": 1,
  "totalAmount": 5000.00,  // Опционально, если не указано - рассчитывается автоматически
  "deliveryPrice": 500.00,
  "comment": "Комментарий",
  "items": [
    {
      "productId": 1,
      "batchCount": 2,
      "piecesPerBatch": 10,
      "batchPrice": 1600.00,
      "unitPrice": 160.00,  // Опционально, рассчитывается автоматически
      "totalPieces": 20     // Опционально, рассчитывается автоматически
    }
  ]
}
```

**Логика создания:**
1. Создается основная поставка в `supplies` (с `total_amount`, без `product_id`)
2. Для каждого товара:
   - Создается запись в `supply_items`
   - Создается запись в `supplies` с `parent_supply_id = ID основной поставки`
   - Создается движение `SUPPLY` с `supply_id = ID партии`

---

### 4. `DELETE /api/admin/supplies/:id`
**Назначение:** Удалить партию (поставку)

**Логика:**
- Проверяет наличие движений типа `SALE` или `WRITE_OFF`
- Если есть - возвращает ошибку
- Если нет - удаляет все движения и саму поставку

---

### 5. `POST /api/admin/stock-movements/write-off`
**Назначение:** Списать товар из конкретной партии

**Тело запроса:**
```json
{
  "productId": 1,
  "supplyId": 2,  // ID конкретной партии
  "quantity": 5,
  "comment": "Брак"
}
```

**Логика:**
1. Проверяет доступный остаток для ЭТОЙ партии (`supply_id`)
2. Использует `SUPPLY` движения для расчета начального количества
3. Создает движение `WRITE_OFF` с привязкой к `supply_id`

---

### 6. `POST /api/admin/warehouse/fix-negative-stock`
**Назначение:** Исправить отрицательные остатки (удалить лишние списания)

---

### 7. `POST /api/admin/warehouse/delete-hydrangeas`
**Назначение:** Удалить все данные по гортензиям

---

### 8. `POST /api/admin/warehouse/clear-all`
**Назначение:** Очистить все поставки и заказы (для тестирования)

---

## 🔄 Логика расчета остатков

### В `GET /api/admin/warehouse` (вкладка "Товары"):
```javascript
// Для каждой партии:
const supplied = movementsBySupply[`${supply.id}_SUPPLY`] || supply.initial_quantity;
const sold = movementsBySupply[`${supply.id}_SALE`] || 0;
const writeOff = movementsBySupply[`${supply.id}_WRITE_OFF`] || 0;
const remaining = Math.max(0, supplied - sold - writeOff);

// Отображение ID:
const displaySupplyId = supply.parent_supply_id || supply.id;  // Все товары из одной поставки имеют одинаковый ID
```

### В `GET /api/admin/supplies` (вкладка "Поставки"):
```javascript
// Для каждого товара в поставке:
// 1. Находим все партии с parent_supply_id = supply.id
const relatedSupplyIds = suppliesByParentAndProduct[`${supply.id}_${item.product_id}`];

// 2. Суммируем продано и списано только по этим партиям
relatedSupplyIds.forEach(supplyId => {
  sold += movementsBySupplyProduct[`${supplyId}_${item.product_id}_SALE`] || 0;
  writeOff += movementsBySupplyProduct[`${supplyId}_${item.product_id}_WRITE_OFF`] || 0;
});

// 3. Остаток = начальное количество - продано - списано
const remaining = item.total_pieces - sold - writeOff;
```

### В `createOrderInDb` (при создании заказа):
```javascript
// Считаем остаток по каждой поставке отдельно, затем суммируем
const suppliesResult = await client.query(`
  SELECT 
    s.id,
    COALESCE(
      (SELECT SUM(quantity) FROM stock_movements WHERE supply_id = s.id AND type = 'SUPPLY'),
      s.quantity
    ) as initial_quantity,
    COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as sold,
    COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as written_off
  FROM supplies s
  LEFT JOIN stock_movements sm ON s.id = sm.supply_id
  WHERE s.product_id = $1
  GROUP BY s.id, s.quantity
`, [productId]);

let totalAvailable = 0;
for (const supply of suppliesResult.rows) {
  const remaining = Math.max(0, initial_quantity - sold - written_off);
  totalAvailable += remaining;
}
```

---

## 📝 Важные моменты

1. **Привязка списаний:** Все движения (`SALE`, `WRITE_OFF`) привязаны к конкретной партии через `supply_id`
2. **FIFO логика:** При продаже товар списывается с самых старых партий (по `delivery_date`)
3. **Отрицательные остатки:** Не допускаются (`Math.max(0, ...)`)
4. **ID поставки:** Все товары из одной поставки отображают одинаковый `parent_supply_id` в колонке "ID поставки"
5. **Расчет остатков:** Используется `SUPPLY` движения, если они есть, иначе `supplies.quantity`

