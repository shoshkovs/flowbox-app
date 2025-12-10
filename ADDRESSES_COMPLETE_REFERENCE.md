# 📍 Полный справочник по работе с адресами в FlowBox

Этот документ содержит всю информацию о работе с адресами: схема БД, функции бэкенда и фронтенда, API endpoints, логика работы.

---

## 📊 Схема базы данных

### Таблица `addresses`

```sql
CREATE TABLE IF NOT EXISTS addresses (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,             -- "Мой дом", "Дом мамы", "Новый адрес"
    city            TEXT NOT NULL,             -- "Санкт-Петербург"
    street          TEXT NOT NULL,             -- "Кемская", "Невский проспект"
    house           TEXT NOT NULL,            -- "7", "10к2"
    entrance        TEXT,                      -- "6"
    apartment       TEXT,                      -- "57", "34"
    floor           TEXT,                      -- "2"
    intercom        TEXT,                      -- Код домофона
    comment         TEXT,                      -- Комментарий к адресу
    is_default      BOOLEAN DEFAULT FALSE,     -- Адрес по умолчанию
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Структура объекта адреса (JavaScript)

```javascript
{
    id: 1277,                          // number - ID адреса из БД
    name: "Новый адрес",               // string - Название адреса
    city: "Санкт-Петербург",           // string - Город
    street: "Кемская",                 // string - Улица
    house: "7",                        // string - Номер дома
    entrance: "6",                     // string | null - Подъезд
    apartment: "57",                   // string | null - Квартира/Офис
    floor: "2",                        // string | null - Этаж
    intercom: null,                    // string | null - Домофон
    comment: null,                     // string | null - Комментарий
    isDefault: false                   // boolean - Адрес по умолчанию
}
```

---

## 🔧 Бэкенд (bot.js)

### 1. Функция парсинга улицы и дома

**`parseStreetAndHouse(streetValue)`**

Извлекает номер дома из строки адреса, если он не указан отдельно.

```javascript
// Унифицированная функция для извлечения house из street
function parseStreetAndHouse(streetValue) {
  if (!streetValue || typeof streetValue !== 'string') {
    return { street: streetValue || '', house: '' };
  }
  
  // Улучшенный regex: ищем номер дома в конце строки после пробела
  // Примеры: "Невский проспект 10" -> {street: "Невский проспект", house: "10"}
  //          "Кемская 7" -> {street: "Кемская", house: "7"}
  //          "Невский проспект 10к2" -> {street: "Невский проспект", house: "10к2"}
  const trimmed = streetValue.trim();
  // Паттерн: пробел + одна или более цифр + опционально буквы/корпус
  const houseMatch = trimmed.match(/\s+(\d+[а-яА-Яa-zA-ZкК\s]*?)$/);
  
  if (houseMatch && houseMatch[1]) {
    const house = houseMatch[1].trim();
    const street = trimmed.replace(/\s+\d+[а-яА-Яa-zA-ZкК\s]*?$/, '').trim();
    return { street, house };
  }
  
  return { street: trimmed, house: '' };
}
```

**Параметры:**
- `streetValue` (string) - Строка адреса, например "Кемская 7"

**Возвращает:**
- `{ street: string, house: string }` - Объект с разделенными улицей и домом

---

### 2. Функция проверки дубликатов адресов

**`isAddressDuplicate(newAddr, existingAddr)`**

Проверяет, является ли новый адрес дубликатом существующего.

```javascript
// Унифицированная функция для проверки дубликатов адресов
function isAddressDuplicate(newAddr, existingAddr) {
  const normalize = (str) => (str || '').toLowerCase().trim();
  
  const newCity = normalize(newAddr.city);
  const newStreet = normalize(newAddr.street);
  const newHouse = normalize(newAddr.house);
  const newApartment = normalize(newAddr.apartment);
  
  const existingCity = normalize(existingAddr.city);
  const existingStreet = normalize(existingAddr.street);
  const existingHouse = normalize(existingAddr.house);
  const existingApartment = normalize(existingAddr.apartment);
  
  // Проверяем совпадение по city, street, apartment
  // house учитываем только если оба не пустые (если оба пустые - считаем совпадением)
  const cityMatch = newCity === existingCity;
  const streetMatch = newStreet === existingStreet;
  const apartmentMatch = newApartment === existingApartment;
  
  // house: совпадает если оба пустые ИЛИ оба не пустые и равны
  const houseMatch = (!newHouse && !existingHouse) || 
                     (newHouse && existingHouse && newHouse === existingHouse);
  
  return cityMatch && streetMatch && apartmentMatch && houseMatch;
}
```

**Параметры:**
- `newAddr` (object) - Новый адрес для проверки
- `existingAddr` (object) - Существующий адрес для сравнения

**Возвращает:**
- `boolean` - `true` если адреса дубликаты, `false` если разные

**Логика сравнения:**
- Город должен совпадать точно
- Улица должна совпадать точно
- Квартира должна совпадать точно
- Дом: совпадает если оба пустые ИЛИ оба не пустые и равны

---

### 3. Безопасное добавление одного адреса

**`addUserAddress(userId, address)`**

Добавляет один адрес пользователю, не удаляя существующие. Используется при создании заказа.

```javascript
// Безопасное добавление одного адреса (не удаляет существующие)
async function addUserAddress(userId, address) {
  if (!pool || !address) return false;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Загружаем существующие адреса
      const existingAddresses = await loadUserAddresses(userId);
      
      // Проверяем дубликаты
      const isDuplicate = existingAddresses.some(existing => isAddressDuplicate(address, existing));
      
      if (isDuplicate) {
        console.log(`ℹ️  Адрес является дубликатом для user_id=${userId}, пропускаем`);
        await client.query('COMMIT');
        return true; // Возвращаем true, так как адрес уже существует
      }
      
      // Парсим street и house если нужно
      let streetValue = address.street || '';
      let houseValue = address.house || '';
      
      // Если house пустое, пытаемся извлечь из street
      if (!houseValue && streetValue) {
        const parsed = parseStreetAndHouse(streetValue);
        streetValue = parsed.street;
        houseValue = parsed.house;
      }
      
      // Вставляем новый адрес
      await client.query(
        `INSERT INTO addresses 
         (user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          address.name || streetValue || 'Новый адрес',
          address.city || '',
          streetValue,
          houseValue,
          address.entrance || null,
          address.apartment || null,
          address.floor || null,
          address.intercom || null,
          address.comment || null,
          address.isDefault || false
        ]
      );
      
      console.log(`✅ addUserAddress: добавлен адрес для user_id=${userId}, street=${streetValue}, house=${houseValue}`);
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка addUserAddress:', error);
    return false;
  }
}
```

**Параметры:**
- `userId` (number) - `user_id` из таблицы `users` (не `telegram_id`)
- `address` (object) - Объект адреса

**Возвращает:**
- `boolean` - `true` если адрес добавлен или уже существует, `false` при ошибке

**Особенности:**
- Не удаляет существующие адреса
- Проверяет дубликаты перед добавлением
- Автоматически парсит `house` из `street`, если `house` не указан

---

### 4. Сохранение всех адресов пользователя

**`saveUserAddresses(userIdOrTelegramId, addresses)`**

Полная замена всех адресов пользователя. Используется при сохранении из фронтенда.

```javascript
// Сохранение адресов пользователя (полная замена - используется только при сохранении всех адресов из фронта)
// Параметр userId может быть:
// - user_id (внутренний ID из таблицы users) - если вызвано из POST /api/user-data
// - telegram_id - если вызвано из других мест
// Функция автоматически определяет, что передано, и использует правильное значение
async function saveUserAddresses(userIdOrTelegramId, addresses) {
  if (!pool) return false;
  
  // Валидация
  console.log(`[saveUserAddresses] 🚀 userIdOrTelegramId = ${userIdOrTelegramId}, typeof = ${typeof userIdOrTelegramId}`);
  if (!userIdOrTelegramId || userIdOrTelegramId === null || userIdOrTelegramId === undefined) {
    console.error(`[saveUserAddresses] ❌ userIdOrTelegramId is null/undefined, не можем сохранить адреса`);
    return false;
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Определяем, что передано: user_id (обычно маленькие числа: 1, 2, 3...) или telegram_id (большие: 1059138125)
      // Если userId < 1000000, скорее всего это user_id из таблицы users
      // Если userId >= 1000000, скорее всего это telegram_id
      let user_id;
      let telegram_id;
      
      if (userIdOrTelegramId < 1000000) {
        // Скорее всего это user_id из таблицы users
        user_id = userIdOrTelegramId;
        // Получаем telegram_id для вызова loadUserAddresses
        const userResult = await client.query(
          'SELECT telegram_id FROM users WHERE id = $1::integer LIMIT 1',
          [user_id]
        );
        if (userResult.rows.length === 0) {
          console.error(`[saveUserAddresses] ❌ Пользователь с user_id=${user_id} не найден в таблице users`);
          await client.query('ROLLBACK');
          return false;
        }
        telegram_id = userResult.rows[0].telegram_id;
        console.log(`[saveUserAddresses] ✅ Используем user_id=${user_id} (telegram_id=${telegram_id})`);
      } else {
        // Скорее всего это telegram_id
        telegram_id = userIdOrTelegramId;
        // Получаем user_id из таблицы users
        const userResult = await client.query(
          'SELECT id FROM users WHERE telegram_id = $1::bigint LIMIT 1',
          [telegram_id]
        );
        if (userResult.rows.length === 0) {
          console.error(`[saveUserAddresses] ❌ Пользователь с telegram_id=${telegram_id} не найден в таблице users`);
          await client.query('ROLLBACK');
          return false;
        }
        user_id = userResult.rows[0].id;
        console.log(`[saveUserAddresses] ✅ Найден user_id=${user_id} для telegram_id=${telegram_id}`);
      }
      
      // Валидация user_id перед использованием
      if (!user_id || user_id === null || user_id === undefined) {
        console.error(`[saveUserAddresses] ❌ user_id не может быть null/undefined после определения`);
        await client.query('ROLLBACK');
        return false;
      }
      
      // 🟢 Случай: пользователь удалил все адреса - пустой массив
      if (!Array.isArray(addresses) || addresses.length === 0) {
        console.log(`[saveUserAddresses] 🧹 Пустой список адресов — удаляем все адреса пользователя из БД для user_id=${user_id}`);
        
        await client.query(
          'DELETE FROM addresses WHERE user_id = $1',
          [user_id]
        );
        
        await client.query('COMMIT');
        console.log(`[saveUserAddresses] ✅ Все адреса для user_id=${user_id} (telegram_id=${telegram_id}) удалены`);
        return true;
      }
      
      // Загружаем существующие адреса для проверки дубликатов (ДО удаления!)
      // loadUserAddresses принимает user_id из таблицы users
      const existingAddresses = await loadUserAddresses(user_id);
      
      // Подготавливаем адреса для сохранения: парсим street и house, проверяем дубликаты
      const addressesToUpdate = []; // Адреса с ID для UPDATE
      const addressesToInsert = []; // Адреса без ID для INSERT
      const addressesToKeep = []; // Адреса, которые уже есть в БД и не нужно удалять
      
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        
        // Парсим street и house если нужно
        let streetValue = addr.street || '';
        let houseValue = addr.house || '';
        
        if (!houseValue && streetValue) {
          const parsed = parseStreetAndHouse(streetValue);
          streetValue = parsed.street;
          houseValue = parsed.house;
        }
        
        const normalizedAddr = {
          ...addr,
          street: streetValue,
          house: houseValue
        };
        
        // Если у адреса есть ID - обновляем существующий
        if (addr.id && typeof addr.id === 'number') {
          // Проверяем, существует ли адрес с таким ID
          const existingAddr = existingAddresses.find(existing => existing.id === addr.id);
          if (existingAddr) {
            // Обновляем существующий адрес
            addressesToUpdate.push(normalizedAddr);
            addressesToKeep.push(addr.id);
          } else {
            // ID есть, но адреса нет в БД - добавляем как новый (но сохраняем ID, если возможно)
            addressesToInsert.push(normalizedAddr);
          }
        } else {
          // Адреса без ID - проверяем дубликаты
          const isDuplicateInExisting = existingAddresses.some(existing => 
            isAddressDuplicate(normalizedAddr, existing)
          );
          
          const isDuplicateInNew = addressesToInsert.some(addrToInsert => 
            isAddressDuplicate(normalizedAddr, addrToInsert)
          );
          
          if (!isDuplicateInExisting && !isDuplicateInNew) {
            addressesToInsert.push(normalizedAddr);
          } else if (isDuplicateInExisting) {
            // Сохраняем ID существующего адреса, чтобы не удалить его
            const existingAddr = existingAddresses.find(existing => 
              isAddressDuplicate(normalizedAddr, existing)
            );
            if (existingAddr) {
              addressesToKeep.push(existingAddr.id);
            }
          }
        }
      }
      
      // Удаляем только те адреса, которых нет в новом списке
      if (addressesToKeep.length > 0) {
        await client.query(
          'DELETE FROM addresses WHERE user_id = $1 AND id != ALL($2::int[])',
          [user_id, addressesToKeep]
        );
      } else {
        // Если нет адресов для сохранения (включая случай пустого массива), удаляем все адреса пользователя
        await client.query('DELETE FROM addresses WHERE user_id = $1', [user_id]);
        console.log(`[saveUserAddresses] ✅ Удалены все адреса для user_id=${user_id}`);
      }
      
      // Обновляем существующие адреса
      let updatedCount = 0;
      for (const addr of addressesToUpdate) {
        await client.query(
          `UPDATE addresses SET
           name = $2, city = $3, street = $4, house = $5, entrance = $6, 
           apartment = $7, floor = $8, intercom = $9, comment = $10, is_default = $11,
           updated_at = now()
           WHERE id = $1 AND user_id = $12`,
          [
            addr.id,
            addr.name || addr.street || 'Новый адрес',
            addr.city || '',
            addr.street || '',
            addr.house || '',
            addr.entrance || null,
            addr.apartment || null,
            addr.floor || null,
            addr.intercom || null,
            addr.comment || null,
            addr.isDefault || false,
            user_id
          ]
        );
        updatedCount++;
      }
      
      // Добавляем новые адреса
      let insertedCount = 0;
      for (const addr of addressesToInsert) {
        // Проверяем, что адрес действительно новый (нет такого же в БД)
        const isDuplicate = existingAddresses.some(existing => 
          isAddressDuplicate(addr, existing)
        );
        
        if (isDuplicate) {
          console.log(`[saveUserAddresses] ⚠️ Пропущен дубликат адреса: ${addr.city}, ${addr.street}, ${addr.house}, ${addr.apartment}`);
          continue;
        }
        
        await client.query(
          `INSERT INTO addresses 
           (user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            user_id, // КРИТИЧНО: используем user_id из таблицы users, а не telegram_id
            addr.name || addr.street || 'Новый адрес',
            addr.city || '',
            addr.street || '',
            addr.house || '',
            addr.entrance || null,
            addr.apartment || null,
            addr.floor || null,
            addr.intercom || null,
            addr.comment || null,
            addr.isDefault || false
          ]
        );
        insertedCount++;
        console.log(`[saveUserAddresses] ✅ Добавлен новый адрес: ${addr.city}, ${addr.street}, ${addr.house}`);
      }
      
      const addedCount = updatedCount + insertedCount;
      
      const skippedCount = addresses.length - addedCount;
      
      // Логируем дубликаты только если их много (не критично)
      if (skippedCount > 0 && skippedCount > 3) {
        console.log(`ℹ️  Пропущено ${skippedCount} дубликатов адресов для пользователя ${userId}`);
      }
      
      console.log(`✅ saveUserAddresses: обновлено ${updatedCount}, добавлено ${insertedCount}, всего ${addedCount} адресов для telegram_id=${telegram_id} (user_id=${user_id}), пропущено дубликатов=${skippedCount}`);
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка saveUserAddresses:', error);
    return false;
  }
}
```

**Параметры:**
- `userIdOrTelegramId` (number) - Может быть `user_id` (< 1000000) или `telegram_id` (>= 1000000)
- `addresses` (array) - Массив адресов для сохранения (может быть пустым для удаления всех)

**Возвращает:**
- `boolean` - `true` если успешно, `false` при ошибке

**Логика работы:**
1. **Определение типа ID:** Автоматически определяет, передан `user_id` или `telegram_id`
2. **Пустой массив:** Если массив пустой, удаляет все адреса пользователя и завершает работу
3. **Загрузка существующих адресов:** Вызывает `loadUserAddresses(user_id)` для получения текущих адресов из БД (используется `user_id`, а не `telegram_id`)
4. **Обработка адресов:**
   - Адреса с ID → обновление существующих (`UPDATE`)
   - Адреса без ID → проверка дубликатов → добавление новых (`INSERT`)
   - Адреса, которых нет в новом списке → удаление (`DELETE`)
5. **Парсинг:** Автоматически парсит `house` из `street`, если `house` не указан
6. **Дедупликация:** Проверяет дубликаты перед добавлением

---

### 5. Загрузка адресов пользователя

**`loadUserAddresses(userId)`**

Загружает все адреса пользователя из БД.

```javascript
// Загрузка адресов пользователя
async function loadUserAddresses(userId) {
  if (!pool) return [];
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        city: row.city,
        street: row.street,
        house: row.house,
        entrance: row.entrance,
        apartment: row.apartment,
        floor: row.floor,
        intercom: row.intercom,
        comment: row.comment,
        isDefault: row.is_default
      }));
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка loadUserAddresses:', error);
    return [];
  }
}
```

**Параметры:**
- `userId` (number) - `user_id` из таблицы `users` (не `telegram_id`)

**Возвращает:**
- `array` - Массив объектов адресов, отсортированных по дате создания (новые первыми)

**SQL запрос:**
```sql
SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC
```

---

## 🌐 API Endpoints

### POST `/api/user-data`

Сохранение всех данных пользователя, включая адреса.

**Тело запроса:**
```json
{
  "userId": 1059138125,
  "cart": [...],
  "addresses": [
    {
      "id": 1277,
      "name": "Новый адрес",
      "city": "Санкт-Петербург",
      "street": "Кемская",
      "house": "7",
      "entrance": "6",
      "apartment": "57",
      "floor": "2",
      "intercom": null,
      "comment": null,
      "isDefault": false
    }
  ],
  "profile": {...},
  "activeOrders": [...],
  "completedOrders": [...]
}
```

**Обработка адресов:**
```javascript
// Сохраняем адреса (включая пустой массив - разрешаем удаление всех адресов)
if (addresses !== undefined && Array.isArray(addresses)) {
  // Сохраняем адреса (включая пустой массив для удаления всех адресов)
  const saved = await saveUserAddresses(user.id, addresses);
  if (saved) {
    console.log(`✅ Сохранено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
  } else {
    console.error(`❌ Ошибка сохранения адресов для пользователя ${userId}`);
  }
}

// Загружаем обновлённые адреса из БД для возврата фронту
const updatedAddresses = await loadUserAddresses(user.id);
```

**Ответ:**
```json
{
  "success": true,
  "addresses": [
    {
      "id": 1277,
      "name": "Новый адрес",
      "city": "Санкт-Петербург",
      "street": "Кемская",
      "house": "7",
      "entrance": "6",
      "apartment": "57",
      "floor": "2",
      "intercom": null,
      "comment": null,
      "isDefault": false
    }
  ]
}
```

**Важно:**
- Пустой массив `[]` удаляет все адреса пользователя
- Адреса без ID создаются как новые
- Адреса с ID обновляются, если существуют
- **После сохранения возвращаются обновлённые адреса из БД** - это гарантирует, что фронт получает каноничные данные с правильными ID

---

### GET `/api/user-data/:userId`

Загрузка всех данных пользователя, включая адреса.

**Ответ:**
```json
{
  "cart": [...],
  "addresses": [
    {
      "id": 1277,
      "name": "Новый адрес",
      "city": "Санкт-Петербург",
      "street": "Кемская",
      "house": "7",
      "entrance": "6",
      "apartment": "57",
      "floor": "2",
      "intercom": null,
      "comment": null,
      "isDefault": false
    }
  ],
  "profile": {...},
  "activeOrders": [...],
  "completedOrders": [...],
  "bonuses": 0
}
```

**Код:**
```javascript
const addresses = await loadUserAddresses(user.id);
console.log(`📦 Загружено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
```

---

## 💻 Фронтенд (public/app.js)

### Глобальная переменная

```javascript
let savedAddresses = []; // Массив сохраненных адресов пользователя
```

---

### 1. Дедупликация адресов

**`normalizeAddressKey(addr)`**

Создает ключ для сравнения адресов.

```javascript
function normalizeAddressKey(addr) {
    if (!addr) return '';
    return [
        (addr.city || '').trim().toLowerCase(),
        (addr.street || '').trim().toLowerCase(),
        (addr.house || '').trim().toLowerCase(),
        (addr.apartment || '').trim().toLowerCase(),
        (addr.entrance || '').trim().toLowerCase(),
        (addr.floor || '').trim().toLowerCase(),
        (addr.intercom || '').trim().toLowerCase(),
    ].join('|');
}
```

**`dedupeAddresses(addresses)`**

Удаляет дубликаты из массива адресов.

```javascript
// Дедупликация адресов: оставляем только уникальные по набору полей
function dedupeAddresses(addresses) {
    if (!addresses || !Array.isArray(addresses)) return [];
    
    const map = new Map();
    for (const addr of addresses) {
        // Пропускаем полностью пустые адреса
        if (!addr || (!addr.city && !addr.street && !addr.house)) {
            continue;
        }
        
        const key = normalizeAddressKey(addr);
        
        // Если такой адрес уже есть - оставляем тот, у которого есть ID (приоритет)
        if (!map.has(key)) {
            map.set(key, addr);
        } else {
            const existing = map.get(key);
            // Если новый адрес имеет ID, а старый нет - заменяем
            if (addr.id && !existing.id) {
                map.set(key, addr);
            }
        }
    }
    
    return Array.from(map.values());
}
```

---

### 2. Сохранение данных пользователя

**`saveUserData()`**

Сохраняет все данные пользователя на сервер, включая адреса.

```javascript
// Сохранение всех данных пользователя на сервер
async function saveUserData() {
    const userId = getUserId();
    if (!userId) {
        // Если нет userId, сохраняем только локально
        saveCartToLocalStorage(cart);
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
        localStorage.setItem('userProfile', JSON.stringify(localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile')) : null));
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
        return;
    }
    
    try {
        const profileData = localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile')) : null;
        
        // Фильтруем адреса - убираем адреса без ID перед отправкой
        // Адреса без ID могут создавать дубликаты
        // ДЕДУПЛИКАЦИЯ: удаляем дубликаты перед отправкой на сервер
        const deduplicatedAddresses = dedupeAddresses(savedAddresses);
        console.log(`[saveUserData] 📦 Адресов до дедупликации: ${savedAddresses.length}, после: ${deduplicatedAddresses.length}`);
        
        // Фильтруем только невалидные адреса и очищаем фейковые ID
        const addressesToSave = deduplicatedAddresses
            .filter(addr => {
                // Фильтруем только полностью пустые/невалидные адреса
                if (!addr || (!addr.city && !addr.street && !addr.house)) {
                    console.warn('[saveUserData] ⚠️ Пропущен невалидный адрес:', addr);
                    return false;
                }
                return true;
            })
            .map(addr => {
                const cleaned = { ...addr };
                // Если id фейковый или не число — не отправляем его, пусть бэк создаёт новый адрес
                if (!Number.isInteger(cleaned.id) || cleaned.id <= 0) {
                    delete cleaned.id;
                }
                return cleaned;
            });
        
        const response = await fetch('/api/user-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                cart: cart,
                addresses: addressesToSave, // Может быть пустым массивом для удаления всех адресов
                profile: profileData,
                activeOrders: userActiveOrders,
                completedOrders: userCompletedOrders
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // 🔥 ВАЖНО: приводим фронт в соответствие с БД
        if (Array.isArray(result.addresses)) {
            savedAddresses = result.addresses;
            localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
            console.log('[saveUserData] ✅ Адреса обновлены с сервера:', savedAddresses.length);
        } else {
            // fallback: сохраняем то, что у нас локально
            localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
        }
        
        // Также сохраняем остальные данные локально как резервную копию
        saveCartToLocalStorage(cart);
        if (profileData) {
            localStorage.setItem('userProfile', JSON.stringify(profileData));
        }
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
    } catch (error) {
        console.error('Ошибка сохранения данных на сервер:', error);
        // Сохраняем локально при ошибке
        saveCartToLocalStorage(cart);
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
    }
}
```

**Особенности:**
- Дедупликация адресов перед отправкой
- Фильтрация невалидных адресов
- **Очистка фейковых ID** (не `Number.isInteger()` или `<= 0`) перед отправкой - новые адреса отправляются без `id`, бэк создаёт их через `INSERT`
- **Синхронизация с ответом сервера** - после сохранения `savedAddresses` обновляется из `result.addresses`, гарантируя соответствие с БД
- Сохранение в `localStorage` как резервная копия
- Пустой массив `[]` разрешен для удаления всех адресов

---

### 3. Загрузка данных пользователя

**`loadUserData()`**

Загружает все данные пользователя с сервера, включая адреса.

```javascript
async function loadUserData() {
    const userId = getUserId();
    if (!userId) {
        console.log('[loadUserData] ⚠️ userId не найден, пропускаем загрузку');
        return;
    }
    
    try {
        const response = await fetch(`/api/user-data/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Загружаем адреса
        if (data.addresses && Array.isArray(data.addresses)) {
            console.log('[loadUserData] 📦 Загружены адреса с сервера:', data.addresses.length);
            console.log('[loadUserData] 📦 Данные адресов:', JSON.stringify(data.addresses, null, 2));
            // Фильтруем только адреса с валидным ID
            const addressesFromServer = data.addresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
            
            // Если на сервере есть адреса, используем их
            // Если на сервере пустой массив, это означает, что пользователь удалил все адреса - используем пустой массив
            savedAddresses = addressesFromServer;
            
            // Синхронизируем с localStorage
            localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
            console.log('[loadUserData] 💾 Адреса сохранены в localStorage:', savedAddresses.length);
            if (savedAddresses.length > 0) {
                console.log('[loadUserData] 📦 ID адресов:', savedAddresses.map(a => a.id).join(', '));
                console.log('[loadUserData] 📦 Первый адрес:', JSON.stringify(savedAddresses[0], null, 2));
            } else {
                console.log('[loadUserData] ℹ️ Пустой массив адресов с сервера - все адреса удалены');
            }
        } else {
            console.log('[loadUserData] ⚠️ Адреса не получены с сервера или не массив. Получено:', typeof data.addresses, data.addresses);
            // Если адреса не получены с сервера, пробуем загрузить из localStorage
            const savedAddressesLocal = localStorage.getItem('savedAddresses');
            console.log('[loadUserData] 🔍 Проверка localStorage:', !!savedAddressesLocal);
            if (savedAddressesLocal) {
                try {
                    const addressesFromLocal = JSON.parse(savedAddressesLocal);
                    // Фильтруем только адреса с валидным ID
                    savedAddresses = addressesFromLocal.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
                    // Сохраняем отфильтрованные адреса обратно в localStorage
                    localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
                    console.log('[loadUserData] 📦 Адреса загружены из localStorage:', savedAddresses.length);
                    if (savedAddresses.length > 0) {
                        console.log('[loadUserData] 📦 Первый адрес из localStorage:', JSON.stringify(savedAddresses[0], null, 2));
                    }
                } catch (e) {
                    console.error('[loadUserData] ❌ Ошибка загрузки адресов из localStorage:', e);
                    savedAddresses = [];
                }
            } else {
                console.log('[loadUserData] ⚠️ localStorage пуст, устанавливаем пустой массив');
                savedAddresses = [];
            }
        }
        
        // ... загрузка других данных ...
        
        // После загрузки данных вызываем loadSavedAddresses для обновления UI
        loadSavedAddresses();
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
    }
}
```

**Особенности:**
- Загружает адреса с сервера
- Фильтрует только адреса с валидным ID
- Синхронизирует с `localStorage`
- Если сервер вернул пустой массив, использует его (все адреса удалены)
- Fallback на `localStorage` при ошибке загрузки

---

### 4. Загрузка и отображение адресов

**`loadSavedAddresses()`**

Загружает адреса из глобальной переменной `savedAddresses` и отображает их в UI.

```javascript
function loadSavedAddresses() {
    // Сначала фильтруем адреса без ID
    savedAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    
    console.log('[loadSavedAddresses] 🚀 Начало загрузки адресов');
    console.log('[loadSavedAddresses] 📦 savedAddresses.length:', savedAddresses.length);
    console.log('[loadSavedAddresses] 📦 savedAddresses:', JSON.stringify(savedAddresses, null, 2));
    
    // Отображение в профиле
    const addressesList = document.getElementById('deliveryAddressesList');
    console.log('[loadSavedAddresses] 🔍 addressesList найден:', !!addressesList);
    
    if (addressesList) {
        if (savedAddresses.length === 0) {
            console.log('[loadSavedAddresses] ⚠️ Нет сохраненных адресов, показываем сообщение');
            addressesList.innerHTML = '<p class="no-addresses">У вас нет сохраненных адресов доставки</p>';
        } else {
            console.log('[loadSavedAddresses] ✅ Рендерим', savedAddresses.length, 'адресов');
            addressesList.innerHTML = savedAddresses.map(addr => {
                // Название (жирным): улица, дом - объединяем street и house
                let streetName = addr.street || '';
                if (addr.house && !streetName.includes(addr.house)) {
                    streetName = streetName ? `${streetName} ${addr.house}` : addr.house;
                }
                if (!streetName) streetName = 'Адрес не заполнен';
                
                // Детали (серым): кв., эт., под.
                const details = [];
                if (addr.apartment) details.push(`кв. ${addr.apartment}`);
                if (addr.floor) details.push(`эт. ${addr.floor}`);
                if (addr.entrance) details.push(`под. ${addr.entrance}`);
                const detailsStr = details.join(', ');
                
                return `
                <div class="address-item">
                    <div class="address-item-content">
                        <div class="address-item-name">${streetName}</div>
                        ${detailsStr ? `<div class="address-item-details">${detailsStr}</div>` : ''}
                    </div>
                    <button class="address-edit-icon-btn" onclick="editAddress(${JSON.stringify(addr.id)})" title="Изменить">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
            `;
            }).join('');
        }
    }
    
    // Обновление списка адресов в форме заказа
    console.log('[loadSavedAddresses] 🔍 Проверка renderAddressOptions:', typeof window.renderAddressOptions);
    if (typeof window.renderAddressOptions === 'function') {
        console.log('[loadSavedAddresses] ✅ Вызываем renderAddressOptions');
        window.renderAddressOptions();
    } else {
        console.log('[loadSavedAddresses] ⚠️ renderAddressOptions не определена');
    }
    
    // Обновляем список адресов на шаге 2, если он активен
    console.log('[loadSavedAddresses] 🔍 currentCheckoutStep:', currentCheckoutStep);
    if (currentCheckoutStep === 2) {
        console.log('[loadSavedAddresses] ✅ Вызываем renderCheckoutAddresses');
        renderCheckoutAddresses();
    }
    
    console.log('[loadSavedAddresses] ✅ Загрузка адресов завершена');
}
```

**Особенности:**
- Фильтрует адреса без ID
- Отображает адреса в профиле
- Объединяет `street` и `house` для отображения
- Вызывает `renderAddressOptions()` для обновления списка в форме заказа
- Показывает сообщение, если адресов нет

---

### 5. Удаление адреса

**`deleteAddress(addressId)`**

Удаляет адрес из списка и сохраняет на сервер.

```javascript
// Удаление адреса
function deleteAddress(addressId) {
    if (confirm('Вы уверены, что хотите удалить этот адрес?')) {
        savedAddresses = savedAddresses.filter(a => String(a.id) !== String(addressId));
        saveUserData(); // Сохраняем на сервер
        loadSavedAddresses();
        tg.HapticFeedback.impactOccurred('light');
    }
}
```

**`deleteAddressFromMyAddresses(addressId)`**

Удаляет адрес из списка "Мои адреса" (на шаге 4 оформления заказа).

```javascript
// Удаление адреса из списка "Мои адреса"
async function deleteAddressFromMyAddresses(addressId) {
    if (!confirm('Вы уверены, что хотите удалить этот адрес?')) {
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Удаляем адрес из списка
    savedAddresses = savedAddresses.filter(a => String(a.id) !== String(addressId));
    
    // Сохраняем на сервер (включая пустой массив, если это последний адрес)
    await saveUserData();
    
    // Принудительно обновляем localStorage, чтобы избежать восстановления из кэша
    localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
    
    // Обновляем список адресов
    loadSavedAddresses();
    
    // Обновляем отображение списка
    renderMyAddressesList();
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}
```

**Особенности:**
- Удаляет адрес из массива `savedAddresses`
- Сохраняет на сервер через `saveUserData()`
- Принудительно обновляет `localStorage`
- Обновляет UI после удаления
- Разрешает удаление всех адресов (включая последний)

---

### 6. Редактирование адреса

**`editAddress(addressId)`**

Открывает форму редактирования адреса.

```javascript
function editAddress(addressId) {
    const address = savedAddresses.find(a => String(a.id) === String(addressId));
    if (!address) return;
    openAddressPage(address);
}
```

**`openAddressPage(address)`**

Открывает страницу редактирования/создания адреса.

```javascript
function openAddressPage(address = null) {
    if (!addressForm) return;
    
    ensureAddressFormValidation();
    
    if (address) {
        editingAddressId = address.id;
        if (addressPageTitle) addressPageTitle.textContent = 'Редактировать адрес';
        if (deleteAddressBtn) deleteAddressBtn.style.display = 'block';
        setAddressFormValues(address);
    } else {
        editingAddressId = null;
        if (addressPageTitle) addressPageTitle.textContent = 'Новый адрес';
        if (deleteAddressBtn) deleteAddressBtn.style.display = 'none';
    }
    
    switchTab('addressTab');
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        switchTab('profileTab');
        tg.BackButton.hide();
    });
}
```

**`setAddressFormValues(address)`**

Заполняет форму адреса значениями из объекта.

```javascript
function setAddressFormValues(address) {
    if (!address) return;
    document.getElementById('addressCity').value = address.city || 'Санкт-Петербург';
    // Объединяем street и house для обратной совместимости со старыми адресами
    let streetValue = address.street || '';
    if (address.house && !streetValue.includes(address.house)) {
        // Если house есть и не включен в street, объединяем их
        streetValue = streetValue ? `${streetValue} ${address.house}` : address.house;
    }
    document.getElementById('addressStreet').value = streetValue;
    document.getElementById('addressEntrance').value = address.entrance || '';
    document.getElementById('addressApartment').value = address.apartment || '';
    document.getElementById('addressFloor').value = address.floor || '';
    document.getElementById('addressIntercom').value = address.intercom || '';
    document.getElementById('addressComment').value = address.comment || '';
}
```

---

### 7. Сохранение адреса из формы

**Обработчик формы `addressForm`**

```javascript
addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Получаем все поля заново, чтобы убедиться, что они актуальны
    const addressCityField = document.getElementById('addressCity');
    const addressStreetField = document.getElementById('addressStreet');
    const addressErrorElement = document.getElementById('addressError');
    
    const city = addressCityField ? addressCityField.value.trim() : '';
    const street = addressStreetField ? addressStreetField.value.trim() : '';
    
    // Валидация города
    if (!city) {
        validateField(addressCityField, false);
        hasErrors = true;
    } else if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
        validateField(addressCityField, true);
        addressErrorElement.style.display = 'none';
    } else {
        validateField(addressCityField, false);
        addressErrorElement.style.display = 'block';
        hasErrors = true;
    }
    
    // Валидация улицы
    if (!street) {
        validateField(addressStreetField, false);
        hasErrors = true;
    } else {
        validateField(addressStreetField, true);
    }
    
    if (hasErrors) {
        // Прокрутка к первому полю с ошибкой
        return;
    }
    
    // Парсим street и house
    let streetValue = street.trim();
    let houseValue = '';
    
    // Пытаемся извлечь номер дома из street
    const houseMatch = streetValue.match(/\s+(\d+[а-яА-ЯкКa-zA-Z\s]*?)$/);
    if (houseMatch && houseMatch[1]) {
        houseValue = houseMatch[1].trim();
        // Убираем номер дома из street, оставляя только название улицы
        streetValue = streetValue.replace(/\s+\d+[а-яА-ЯкКa-zA-Z\s]*?$/, '').trim();
    }
    
    const address = {
        id: editingAddressId || Date.now(),
        name: name || street || 'Адрес',
        city: city,
        street: streetValue,
        house: houseValue,
        entrance: document.getElementById('addressEntrance').value.trim(),
        apartment: document.getElementById('addressApartment').value.trim(),
        floor: document.getElementById('addressFloor').value.trim(),
        intercom: document.getElementById('addressIntercom').value.trim(),
        comment: document.getElementById('addressComment').value.trim()
    };
    
    if (editingAddressId) {
        // Обновление существующего адреса
        const index = savedAddresses.findIndex(a => String(a.id) === String(editingAddressId));
        if (index !== -1) {
            savedAddresses[index] = address;
        }
        editingAddressId = null;
    } else {
        // Проверка на дубликаты перед добавлением нового адреса
        const isDuplicate = savedAddresses.some(existingAddr => {
            // Сравниваем по основным полям: город, улица (теперь содержит "улица + дом"), квартира
            const normalize = (str) => (str || '').toLowerCase().trim();
            
            const newCity = normalize(address.city);
            const newStreet = normalize(address.street);
            const newHouse = normalize(address.house);
            const newApartment = normalize(address.apartment);
            
            const existingCity = normalize(existingAddr.city);
            const existingStreet = normalize(existingAddr.street);
            const existingHouse = normalize(existingAddr.house);
            const existingApartment = normalize(existingAddr.apartment);
            
            const cityMatch = newCity === existingCity;
            const streetMatch = newStreet === existingStreet;
            const apartmentMatch = newApartment === existingApartment;
            
            // house: совпадает если оба пустые ИЛИ оба не пустые и равны
            const houseMatch = (!newHouse && !existingHouse) || 
                             (newHouse && existingHouse && newHouse === existingHouse);
            
            return cityMatch && streetMatch && apartmentMatch && houseMatch;
        });
        
        if (!isDuplicate) {
            savedAddresses.push(address);
        }
    }
    
    saveUserData(); // Сохраняем на сервер
    
    resetAddressFormState();
    if (addressPageTitle) addressPageTitle.textContent = 'Новый адрес';
    if (deleteAddressBtn) deleteAddressBtn.style.display = 'none';
    switchTab('profileTab');
    tg.BackButton.hide();
    loadSavedAddresses();
    tg.HapticFeedback.notificationOccurred('success');
});
```

**Особенности:**
- Валидация города (только "Санкт-Петербург" или "СПб")
- Валидация улицы (обязательное поле)
- Парсинг `house` из `street`, если не указан отдельно
- Проверка дубликатов перед добавлением
- Обновление существующего адреса или создание нового

---

### 8. Заполнение формы заказа адресом

**`fillOrderFormWithAddress(address)`**

Заполняет форму адреса на шаге оформления заказа.

```javascript
// Заполнение формы заказа адресом
function fillOrderFormWithAddress(address) {
    clearOrderAddressErrors();
    const cityField = document.getElementById('orderAddressCity');
    const streetField = document.getElementById('orderAddressStreet');
    const entranceField = document.getElementById('orderAddressEntrance');
    const apartmentField = document.getElementById('orderAddressApartment');
    const floorField = document.getElementById('orderAddressFloor');
    const intercomField = document.getElementById('orderAddressIntercom');
    const commentField = document.getElementById('orderAddressComment');
    
    if (cityField) cityField.value = address.city || 'Санкт-Петербург';
    // Объединяем street и house для обратной совместимости со старыми адресами
    let streetValue = address.street || '';
    if (address.house && !streetValue.includes(address.house)) {
        // Если house есть и не включен в street, объединяем их
        streetValue = streetValue ? `${streetValue} ${address.house}` : address.house;
    }
    if (streetField) streetField.value = streetValue;
    if (entranceField) entranceField.value = address.entrance || '';
    if (apartmentField) apartmentField.value = address.apartment || '';
    if (floorField) floorField.value = address.floor || '';
    if (intercomField) intercomField.value = address.intercom || '';
    if (commentField) commentField.value = address.comment || '';
}
```

---

### 9. Редактирование адреса из списка "Мои адреса"

**`editAddressFromMyAddresses(addressId)`**

Открывает форму редактирования адреса из списка на шаге 4 оформления заказа.

```javascript
// Редактирование адреса из списка "Мои адреса"
function editAddressFromMyAddresses(addressId) {
    // Ищем адрес только среди адресов с валидным ID
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    const addr = validAddresses.find(a => String(a.id) === String(addressId));
    
    if (!addr) {
        console.error('[editAddressFromMyAddresses] ❌ Адрес с ID', addressId, 'не найден');
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Закрываем вкладку со списком адресов
    const myAddressesTab = document.getElementById('myAddressesTab');
    if (myAddressesTab) {
        myAddressesTab.style.display = 'none';
    }
    
    // Открываем форму редактирования с данными выбранного адреса
    openEditAddressPageFromList(addr);
}
```

**`openEditAddressPageFromList(address)`**

Открывает страницу редактирования адреса с предзаполненными данными.

```javascript
// Открытие страницы редактирования адреса доставки из списка
function openEditAddressPageFromList(address) {
    const editAddressTab = document.getElementById('editAddressTab');
    const cityField = document.getElementById('editAddressCity');
    const streetField = document.getElementById('editAddressStreet');
    const apartmentField = document.getElementById('editAddressApartment');
    const floorField = document.getElementById('editAddressFloor');
    const entranceField = document.getElementById('editAddressEntrance');
    const intercomField = document.getElementById('editAddressIntercom');
    const commentField = document.getElementById('editAddressComment');
    
    if (!editAddressTab || !cityField || !streetField || !address) {
        console.error('[openEditAddressPageFromList] ❌ Не найдены необходимые элементы или адрес');
        return;
    }
    
    // Сохраняем ID редактируемого адреса для последующего обновления
    const addressId = address.id || null;
    if (addressId) {
        editAddressTab.dataset.editingAddressId = addressId;
        console.log('[openEditAddressPageFromList] ✅ Редактирование адреса с ID:', addressId);
    } else {
        console.warn('[openEditAddressPageFromList] ⚠️ Адрес без ID, будет создан новый');
        delete editAddressTab.dataset.editingAddressId;
    }
    
    // Парсим адрес из разных форматов
    let addrData = {};
    if (typeof address.address_json === 'object' && address.address_json !== null) {
        addrData = address.address_json;
    } else if (typeof address.address_json === 'string') {
        try {
            addrData = JSON.parse(address.address_json);
        } catch (e) {
            addrData = {};
        }
    }
    
    // Формируем street из street и house для отображения в поле ввода
    let streetValue = address.street || addrData.street || '';
    const houseValue = address.house || addrData.house || '';
    
    // Объединяем street и house только если house есть и еще не включен в street
    if (houseValue) {
        if (!streetValue.includes(houseValue)) {
            streetValue = streetValue ? `${streetValue} ${houseValue}` : houseValue;
        }
    }
    
    cityField.value = address.city || addrData.city || 'Санкт-Петербург';
    streetField.value = streetValue;
    apartmentField.value = address.apartment || addrData.apartment || '';
    floorField.value = address.floor || addrData.floor || '';
    entranceField.value = address.entrance || addrData.entrance || '';
    intercomField.value = address.intercom || addrData.intercom || '';
    commentField.value = address.comment || addrData.comment || '';
    
    // Показываем страницу редактирования
    editAddressTab.style.display = 'block';
    
    // Прокрутка в начало страницы редактирования
    setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        if (editAddressTab) {
            editAddressTab.scrollTop = 0;
            if (editAddressTab.scrollIntoView) {
                editAddressTab.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
        }
    }, 100);
}
```

**`saveEditAddress()`**

Сохраняет отредактированный адрес.

```javascript
async function saveEditAddress() {
    const editAddressTab = document.getElementById('editAddressTab');
    const cityField = document.getElementById('editAddressCity');
    const streetField = document.getElementById('editAddressStreet');
    const apartmentField = document.getElementById('editAddressApartment');
    const floorField = document.getElementById('editAddressFloor');
    const entranceField = document.getElementById('editAddressEntrance');
    const intercomField = document.getElementById('editAddressIntercom');
    const commentField = document.getElementById('editAddressComment');
    
    if (!cityField || !streetField) return;
    
    const city = cityField.value.trim();
    const street = streetField.value.trim();
    
    // Валидация
    if (!city || !street) {
        alert('Пожалуйста, заполните город и улицу');
        return;
    }
    
    // Парсим street и house
    let streetValue = street.trim();
    let houseValue = '';
    
    // Пытаемся извлечь номер дома из street
    const houseMatch = streetValue.match(/\s+(\d+[а-яА-ЯкКa-zA-Z\s]*?)$/);
    if (houseMatch && houseMatch[1]) {
        houseValue = houseMatch[1].trim();
        // Убираем номер дома из street, оставляя только название улицы
        streetValue = streetValue.replace(/\s+\d+[а-яА-ЯкКa-zA-Z\s]*?$/, '').trim();
    }
    
    // Проверяем, редактируется ли существующий адрес
    const editingAddressId = editAddressTab?.dataset.editingAddressId;
    if (editingAddressId) {
        // Обновляем существующий адрес в savedAddresses с сохранением ID
        const addressIndex = savedAddresses.findIndex(a => String(a.id) === String(editingAddressId));
        if (addressIndex !== -1) {
            savedAddresses[addressIndex] = {
                id: savedAddresses[addressIndex].id, // ВАЖНО: сохраняем ID
                city: city,
                street: streetValue,
                house: houseValue,
                apartment: apartmentField.value.trim() || null,
                floor: floorField.value.trim() || null,
                entrance: entranceField.value.trim() || null,
                intercom: intercomField.value.trim() || null,
                comment: commentField.value.trim() || null,
                name: streetValue || 'Адрес',
                isDefault: savedAddresses[addressIndex].isDefault || false
            };
            
            console.log('[saveEditAddress] ✅ Обновлен адрес с ID:', editingAddressId, savedAddresses[addressIndex]);
            
            // Сохраняем на сервер
            await saveUserData();
            
            // Обновляем список адресов
            await loadSavedAddresses();
        } else {
            console.error('[saveEditAddress] ❌ Адрес с ID', editingAddressId, 'не найден в savedAddresses');
        }
    }
    
    // Обновляем checkoutData.address с сохранением ID, если редактировали существующий
    const existingAddressId = editingAddressId || checkoutData.address?.id;
    checkoutData.address = {
        id: existingAddressId || null,
        city: city,
        street: streetValue,
        house: houseValue,
        apartment: apartmentField.value.trim(),
        floor: floorField.value.trim(),
        entrance: entranceField.value.trim(),
        intercom: intercomField.value.trim(),
        comment: commentField.value.trim()
    };
    
    // Скрываем страницу редактирования
    if (editAddressTab) {
        editAddressTab.style.display = 'none';
        delete editAddressTab.dataset.editingAddressId;
    }
    
    // Обновляем отображение и возвращаемся на шаг 4
    renderCheckoutSummary();
    goToStep(4);
}
```

---

## 🔄 Поток данных

### Создание нового адреса

1. Пользователь заполняет форму адреса
2. `addressForm.addEventListener('submit')` обрабатывает отправку
3. Парсинг `street` и `house` из поля ввода
4. Проверка дубликатов
5. Добавление в `savedAddresses` (с фейковым ID `Date.now()`)
6. Вызов `saveUserData()` → POST `/api/user-data`
7. **Фронтенд:** Очистка фейковых ID (удаление `id`, если не `Number.isInteger()` или `<= 0`)
8. Бэкенд: `saveUserAddresses(user.id, addresses)`
9. Бэкенд: `loadUserAddresses(user_id)` для проверки дубликатов
10. Бэкенд: INSERT нового адреса в БД (без `id`)
11. Бэкенд: `loadUserAddresses(user.id)` для получения обновлённых адресов
12. Бэкенд: Возврат `{ success: true, addresses: updatedAddresses }`
13. **Фронтенд:** Синхронизация `savedAddresses = result.addresses` (теперь с реальными ID из БД)
14. Обновление UI через `loadSavedAddresses()`

### Редактирование адреса

1. Пользователь нажимает "Редактировать" на адресе
2. `editAddress(addressId)` → `openAddressPage(address)`
3. Форма заполняется через `setAddressFormValues(address)`
4. Пользователь редактирует и сохраняет
5. `addressForm.addEventListener('submit')` обрабатывает сохранение
6. Обновление в `savedAddresses[index]` (с сохранением реального ID из БД)
7. Вызов `saveUserData()` → POST `/api/user-data`
8. **Фронтенд:** Очистка фейковых ID (если есть)
9. Бэкенд: `saveUserAddresses(user.id, addresses)`
10. Бэкенд: `loadUserAddresses(user_id)` для проверки дубликатов
11. Бэкенд: UPDATE существующего адреса в БД (по реальному ID)
12. Бэкенд: `loadUserAddresses(user.id)` для получения обновлённых адресов
13. Бэкенд: Возврат `{ success: true, addresses: updatedAddresses }`
14. **Фронтенд:** Синхронизация `savedAddresses = result.addresses`
15. Обновление UI через `loadSavedAddresses()`

### Удаление адреса

1. Пользователь нажимает "Удалить" на адресе
2. Подтверждение через `confirm()`
3. Удаление из `savedAddresses` через `filter()`
4. Вызов `saveUserData()` → POST `/api/user-data` с обновленным массивом
5. Бэкенд: `saveUserAddresses(user.id, addresses)`
6. Бэкенд: `loadUserAddresses(user_id)` для проверки существующих адресов
7. Бэкенд: DELETE адреса из БД (если его нет в новом списке)
8. Бэкенд: `loadUserAddresses(user.id)` для получения обновлённых адресов
9. Бэкенд: Возврат `{ success: true, addresses: updatedAddresses }`
10. **Фронтенд:** Синхронизация `savedAddresses = result.addresses` (удалённый адрес больше не в списке)
11. Принудительное обновление `localStorage`
12. Обновление UI через `loadSavedAddresses()`

### Удаление всех адресов

1. Пользователь удаляет последний адрес
2. `savedAddresses` становится пустым массивом `[]`
3. Вызов `saveUserData()` → POST `/api/user-data` с `addresses: []`
4. Бэкенд: `saveUserAddresses(user.id, [])`
5. Бэкенд: Ранний выход - DELETE всех адресов пользователя
6. Бэкенд: `loadUserAddresses(user.id)` возвращает пустой массив `[]`
7. Бэкенд: Возврат `{ success: true, addresses: [] }`
8. **Фронтенд:** Синхронизация `savedAddresses = []`
9. Принудительное обновление `localStorage` с пустым массивом
10. При перезагрузке: GET `/api/user-data/:userId` → возвращает `addresses: []`
11. Фронтенд: использует пустой массив, адреса не возвращаются

### Загрузка адресов при старте

1. При загрузке страницы вызывается `loadUserData()`
2. GET `/api/user-data/:userId`
3. Бэкенд: `loadUserAddresses(user.id)` → SELECT из БД
4. Возврат адресов в ответе API
5. Фронтенд: `savedAddresses = data.addresses`
6. Сохранение в `localStorage`
7. Вызов `loadSavedAddresses()` для отображения в UI

---

## 🎯 Ключевые особенности

### 1. Разделение street и house

- В БД адреса хранятся с раздельными полями `street` и `house`
- При вводе пользователь вводит "Кемская 7" в одно поле
- Функция `parseStreetAndHouse()` автоматически парсит номер дома
- При отображении `street` и `house` объединяются для удобства

### 2. Дедупликация

- Проверка дубликатов происходит на бэкенде (`isAddressDuplicate`)
- Проверка также на фронтенде перед добавлением нового адреса
- Дубликаты определяются по: `city`, `street`, `house`, `apartment`

### 3. Удаление всех адресов

- Разрешено удалить все адреса, включая последний
- Пустой массив `[]` передается на сервер
- Бэкенд удаляет все адреса пользователя из БД
- После перезагрузки адреса не возвращаются

### 4. Автоматическое определение user_id/telegram_id

- Функция `saveUserAddresses()` автоматически определяет тип ID
- Если `userId < 1000000` → это `user_id`
- Если `userId >= 1000000` → это `telegram_id`
- Автоматически получает недостающий ID из таблицы `users`
- **Важно:** `loadUserAddresses()` всегда вызывается с `user_id`, а не `telegram_id`

### 5. Очистка фейковых ID и синхронизация с БД

- **Фронтенд:** Перед отправкой на сервер удаляются фейковые ID (`Date.now()` и т.п.)
- Адреса без валидного ID (`!Number.isInteger(id) || id <= 0`) отправляются без поля `id`
- Бэкенд создаёт новые адреса через `INSERT` и возвращает их с реальными ID из БД
- **После сохранения:** Фронтенд синхронизирует `savedAddresses` с ответом сервера (`result.addresses`)
- Это гарантирует, что ID на фронте всегда соответствуют ID в БД
- Один источник правды = таблица `addresses` в БД

### 6. Сохранение адреса из заказа

- При создании заказа адрес сохраняется через `addUserAddress()`
- Эта функция не удаляет существующие адреса
- Проверяет дубликаты перед добавлением
- Используется только при создании заказа, не при сохранении из профиля

---

## 📝 SQL запросы

### SELECT - Загрузка адресов

```sql
SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC
```

### INSERT - Добавление нового адреса

```sql
INSERT INTO addresses 
(user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING id
```

### UPDATE - Обновление существующего адреса

```sql
UPDATE addresses SET
name = $2, city = $3, street = $4, house = $5, entrance = $6, 
apartment = $7, floor = $8, intercom = $9, comment = $10, is_default = $11,
updated_at = now()
WHERE id = $1 AND user_id = $12
```

### DELETE - Удаление одного адреса

```sql
DELETE FROM addresses WHERE user_id = $1 AND id != ALL($2::int[])
```

### DELETE - Удаление всех адресов пользователя

```sql
DELETE FROM addresses WHERE user_id = $1
```

---

## 🐛 Известные проблемы и решения

### Проблема: Адрес возвращается после удаления

**Причина:** Защита от пустого массива в `/api/user-data` блокировала удаление.

**Решение:** Убрана защита, пустой массив теперь корректно передается в `saveUserAddresses()`.

### Проблема: Потеря номера дома при редактировании

**Причина:** Неправильный парсинг `street` и `house` при сохранении.

**Решение:** Использование функции `parseStreetAndHouse()` для корректного разделения.

### Проблема: Дубликаты адресов

**Причина:** Отсутствие проверки дубликатов перед добавлением.

**Решение:** Проверка дубликатов на фронтенде и бэкенде через `isAddressDuplicate()`.

### Проблема: ReferenceError: updatedAddresses is not defined

**Причина:** Переменная `updatedAddresses` объявлялась внутри блока `if (pool)`, но использовалась вне этого блока.

**Решение:** Возврат адресов перенесён внутрь каждого блока (`if (pool)` и `else`), чтобы переменная всегда была в области видимости.

### Проблема: Фейковые ID (Date.now) отправлялись на сервер

**Причина:** При создании нового адреса использовался `id: Date.now()`, который бэкенд пытался обновить через `UPDATE`, хотя адреса в БД ещё не было.

**Решение:** Перед отправкой на сервер удаляются фейковые ID (`!Number.isInteger(id) || id <= 0`). Новые адреса отправляются без `id`, бэкенд создаёт их через `INSERT` и возвращает с реальными ID.

### Проблема: Расхождение состояния фронта и бэка

**Причина:** После сохранения фронт не синхронизировался с ответом сервера, продолжая использовать локальные данные с фейковыми ID.

**Решение:** После получения ответа от `POST /api/user-data` фронт обновляет `savedAddresses = result.addresses`, синхронизируя состояние с БД. Бэкенд всегда возвращает обновлённые адреса из БД после сохранения.

### Проблема: loadUserAddresses вызывался с telegram_id вместо user_id

**Причина:** В `saveUserAddresses` функция `loadUserAddresses` вызывалась с `telegram_id`, хотя она ожидает `user_id`.

**Решение:** Изменён вызов на `loadUserAddresses(user_id)`, что обеспечивает корректную работу дедупликации и удаления адресов.

---

## 📚 Связанные файлы

- `bot.js` - Бэкенд логика (строки 1355-1747)
- `public/app.js` - Фронтенд логика (строки 870-6503)
- `public/index.html` - HTML форма адреса (строки 230-280)
- `database/schema.sql` - Схема БД (строки 18-33)

---

**Последнее обновление:** 2025-12-10
**Версия:** 2.0
