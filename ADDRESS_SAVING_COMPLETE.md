# Полная документация по сохранению адресов

## 📋 Содержание
1. [Backend функции (bot.js)](#backend-функции-botjs)
2. [API Endpoints](#api-endpoints)
3. [Frontend функции (app.js)](#frontend-функции-appjs)
4. [Логика извлечения house из street](#логика-извлечения-house-из-street)
5. [Схема сохранения адресов](#схема-сохранения-адресов)

---

## Backend функции (bot.js)

### 1. `saveUserAddresses(userId, addresses)` - Сохранение адресов в БД

**Расположение:** `bot.js:1214-1331`

```javascript
async function saveUserAddresses(userId, addresses) {
  if (!pool) return false;
  
  // Защита от случайной очистки: если передан пустой массив, не удаляем адреса
  if (!addresses || addresses.length === 0) {
    console.log(`⚠️  saveUserAddresses: передан пустой массив адресов для user_id=${userId}, пропускаем сохранение`);
    return true; // Возвращаем true, чтобы не ломать логику сохранения других данных
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Получаем существующие адреса для проверки дубликатов (ДО удаления!)
      const existingAddressesResult = await client.query(
        'SELECT city, street, house, apartment FROM addresses WHERE user_id = $1',
        [userId]
      );
      const existingAddresses = existingAddressesResult.rows;
      
      // Функция для проверки дубликата среди существующих адресов
      const isDuplicate = (newAddr) => {
        const newCity = (newAddr.city || '').toLowerCase().trim();
        const newStreet = (newAddr.street || '').toLowerCase().trim();
        const newHouse = (newAddr.house || '').toLowerCase().trim();
        const newApartment = (newAddr.apartment || '').toLowerCase().trim();
        
        return existingAddresses.some(existing => {
          const existingCity = (existing.city || '').toLowerCase().trim();
          const existingStreet = (existing.street || '').toLowerCase().trim();
          const existingHouse = (existing.house || '').toLowerCase().trim();
          const existingApartment = (existing.apartment || '').toLowerCase().trim();
          
          return newCity === existingCity &&
                 newStreet === existingStreet &&
                 newHouse === existingHouse &&
                 newApartment === existingApartment;
        });
      };
      
      // Функция для проверки дубликата среди новых адресов (внутри массива)
      const isDuplicateInNew = (newAddr, index, allAddresses) => {
        const newCity = (newAddr.city || '').toLowerCase().trim();
        const newStreet = (newAddr.street || '').toLowerCase().trim();
        const newHouse = (newAddr.house || '').toLowerCase().trim();
        const newApartment = (newAddr.apartment || '').toLowerCase().trim();
        
        return allAddresses.some((addr, idx) => {
          if (idx === index) return false;
          const addrCity = (addr.city || '').toLowerCase().trim();
          const addrStreet = (addr.street || '').toLowerCase().trim();
          const addrHouse = (addr.house || '').toLowerCase().trim();
          const addrApartment = (addr.apartment || '').toLowerCase().trim();
          
          return addrCity === newCity &&
                 addrStreet === newStreet &&
                 addrHouse === newHouse &&
                 addrApartment === newApartment;
        });
      };
      
      // Удаляем старые адреса
      await client.query('DELETE FROM addresses WHERE user_id = $1', [userId]);
      
      // Добавляем новые адреса, пропуская дубликаты
      let addedCount = 0;
      let skippedCount = 0;
      
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        
        // Пропускаем дубликаты: как среди существующих (уже удаленных), так и внутри нового массива
        if (!isDuplicate(addr) && !isDuplicateInNew(addr, i, addresses)) {
          await client.query(
            `INSERT INTO addresses 
             (user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              userId,
              addr.name || 'Новый адрес',
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
          addedCount++;
        } else {
          skippedCount++;
        }
      }
      
      // Логируем дубликаты только если их много (не критично)
      if (skippedCount > 0 && skippedCount > 3) {
        console.log(`ℹ️  Пропущено ${skippedCount} дубликатов адресов для пользователя ${userId}`);
      }
      
      console.log(`✅ saveUserAddresses: добавлено ${addedCount} адресов для user_id=${userId}, пропущено дубликатов=${skippedCount}`);
      
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

**Особенности:**
- Защита от пустого массива (не удаляет существующие адреса)
- Проверка дубликатов по city, street, house, apartment
- Транзакция для атомарности операций
- Логирование количества добавленных и пропущенных адресов

---

### 2. `loadUserAddresses(userId)` - Загрузка адресов из БД

**Расположение:** `bot.js:1334-1363`

```javascript
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

**Особенности:**
- Возвращает пустой массив при ошибке
- Сортировка по дате создания (новые первыми)
- Маппинг полей БД в формат фронтенда

---

## API Endpoints

### 1. `POST /api/user-data` - Сохранение данных пользователя (включая адреса)

**Расположение:** `bot.js:2040-2107`

```javascript
app.post('/api/user-data', async (req, res) => {
  const { userId, cart, addresses, profile, activeOrders, completedOrders, bonuses } = req.body;
  
  // ... валидация ...
  
  try {
    if (pool) {
      // Работа с БД
      const user = await getOrCreateUser(userId, null, profile);
      if (!user) {
        return res.status(500).json({ error: 'Не удалось создать/найти пользователя' });
      }
      
      // Сохраняем адреса
      // КРИТИЧНО: Не перезаписываем существующие адреса пустым массивом после деплоя
      if (addresses !== undefined && Array.isArray(addresses)) {
        // Проверяем текущие адреса в БД перед сохранением
        const currentAddresses = await loadUserAddresses(user.id);
        
        // Если фронт отправил пустой массив, но в БД уже есть адреса - это может быть ошибка после деплоя
        // В этом случае НЕ перезаписываем существующие адреса пустым массивом
        if (addresses.length === 0 && currentAddresses.length > 0) {
          // Это нормальная ситуация - фронт может отправлять пустой массив при сохранении других данных
          // Не логируем как ошибку, так как защита работает правильно
          // Не сохраняем пустой массив, оставляем существующие адреса
        } else {
          // Сохраняем адреса только если:
          // 1. Массив не пустой (реальное изменение)
          // 2. Или текущих адресов нет (первая инициализация)
          const saved = await saveUserAddresses(user.id, addresses);
          if (saved) {
            console.log(`✅ Сохранено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
          } else {
            console.error(`❌ Ошибка сохранения адресов для пользователя ${userId}`);
          }
        }
      }
      
      // ... остальная логика ...
      
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Ошибка сохранения данных:', error);
    res.status(500).json({ error: 'Ошибка сохранения данных' });
  }
});
```

**Особенности:**
- Защита от перезаписи существующих адресов пустым массивом
- Проверка текущих адресов перед сохранением
- Сохранение только при реальных изменениях

---

### 2. `POST /api/user-data/:userId` - Загрузка данных пользователя (включая адреса)

**Расположение:** `bot.js:2110-2139`

```javascript
app.post('/api/user-data/:userId', async (req, res) => {
  const { userId } = req.params;
  const { telegramUser } = req.body;
  
  try {
    if (pool) {
      // Работа с БД - передаем данные пользователя из Telegram для создания/обновления
      const user = await getOrCreateUser(userId, telegramUser || null);
      if (!user) {
        return res.json({
          cart: [],
          addresses: [],
          profile: null,
          activeOrders: [],
          completedOrders: [],
          bonuses: 0
        });
      }
      
      const addresses = await loadUserAddresses(user.id);
      console.log(`📦 Загружено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
      
      // ... загрузка заказов ...
      
      res.json({
        cart: [],
        addresses: addresses,
        profile: user,
        activeOrders: activeOrders,
        completedOrders: completedOrders,
        bonuses: user.bonuses || 0
      });
    }
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
    res.status(500).json({ error: 'Ошибка загрузки данных' });
  }
});
```

---

### 3. Сохранение адреса при создании заказа

**Расположение:** `bot.js:2272-2325`

```javascript
// В обработчике POST /api/orders
if (orderData.userId && orderData.addressData) {
  try {
    // Передаем данные пользователя из Telegram для обновления username и phone_number
    const telegramUser = (orderData.username || orderData.phone_number) ? {
      id: orderData.userId,
      username: orderData.username || null,
      phone_number: orderData.phone_number || null
    } : null;
    const user = await getOrCreateUser(orderData.userId, telegramUser);
    if (user && orderData.addressData && orderData.addressData.street) {
      // Проверяем, не является ли это дубликатом
      const existingAddresses = await loadUserAddresses(user.id);
      const isDuplicate = existingAddresses.some(existing => {
        const sameCity = (existing.city || '').toLowerCase().trim() === (orderData.addressData.city || '').toLowerCase().trim();
        const sameStreet = (existing.street || '').toLowerCase().trim() === (orderData.addressData.street || '').toLowerCase().trim();
        // house может быть пустым, так как теперь street содержит "улица + дом"
        const sameHouse = (!existing.house && !orderData.addressData.house) || 
                         ((existing.house || '').toLowerCase().trim() === (orderData.addressData.house || '').toLowerCase().trim());
        const sameApartment = (existing.apartment || '').toLowerCase().trim() === (orderData.addressData.apartment || '').toLowerCase().trim();
        return sameCity && sameStreet && sameHouse && sameApartment;
      });
      
      if (!isDuplicate) {
        // Если house пустое, но street содержит "улица + дом", пытаемся извлечь house из street
        let houseValue = orderData.addressData.house || '';
        let streetValue = orderData.addressData.street || '';
        
        // Если house пустое, но в street есть номер дома (последние цифры/буквы после пробела)
        if (!houseValue && streetValue) {
          // Пытаемся извлечь номер дома из конца строки (например, "Невский проспект 10к2" -> "10к2")
          const houseMatch = streetValue.match(/(\d+[а-яА-ЯкК]*)$/);
          if (houseMatch) {
            houseValue = houseMatch[1];
            // Убираем номер дома из street, оставляя только название улицы
            streetValue = streetValue.replace(/\s*\d+[а-яА-ЯкК]*$/, '').trim();
          }
        }
        
        const addressToSave = [{
          name: orderData.addressData.name || orderData.addressData.street || 'Новый адрес',
          city: orderData.addressData.city || 'Санкт-Петербург',
          street: streetValue || orderData.addressData.street,
          house: houseValue,
          entrance: orderData.addressData.entrance || '',
          apartment: orderData.addressData.apartment || '',
          floor: orderData.addressData.floor || '',
          intercom: orderData.addressData.intercom || '',
          comment: orderData.addressData.comment || ''
        }];
        await saveUserAddresses(user.id, addressToSave);
        console.log('✅ Адрес из заказа сохранен в БД:', { street: streetValue, house: houseValue });
      } else {
        console.log('ℹ️  Адрес из заказа уже существует, пропускаем');
      }
    }
  } catch (addrError) {
    console.error('⚠️  Ошибка сохранения адреса из заказа:', addrError);
    // Не прерываем создание заказа из-за ошибки сохранения адреса
  }
}
```

**Особенности:**
- Извлечение `house` из `street` при сохранении
- Проверка дубликатов перед сохранением
- Не прерывает создание заказа при ошибке сохранения адреса

---

## Frontend функции (app.js)

### 1. `saveUserData()` - Сохранение всех данных пользователя (включая адреса)

**Расположение:** `app.js:829-882`

```javascript
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
        
        const response = await fetch('/api/user-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                cart: cart,
                addresses: savedAddresses,
                profile: profileData,
                activeOrders: userActiveOrders,
                completedOrders: userCompletedOrders
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Также сохраняем локально как резервную копию
        saveCartToLocalStorage(cart);
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
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
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
    }
}
```

**Особенности:**
- Сохранение в БД через API
- Дублирование в localStorage как резервная копия
- Fallback на localStorage при ошибке

---

### 2. `loadUserData()` - Загрузка всех данных пользователя (включая адреса)

**Расположение:** `app.js:885-999`

```javascript
async function loadUserData() {
    const userId = getUserId();
    
    if (userId) {
        try {
            // Получаем данные пользователя из Telegram
            const telegramUser = tg.initDataUnsafe?.user || null;
            
            // Передаем данные пользователя в запросе
            const requestBody = telegramUser ? {
                telegramUser: {
                    id: telegramUser.id,
                    first_name: telegramUser.first_name,
                    last_name: telegramUser.last_name,
                    username: telegramUser.username || null,
                    phone_number: telegramUser.phone_number || null
                }
            } : {};
            
            const response = await fetch(`/api/user-data/${userId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // ... загрузка корзины ...
            
            if (data.addresses && Array.isArray(data.addresses)) {
                console.log('📦 Загружены адреса с сервера:', data.addresses.length);
                savedAddresses = data.addresses;
                // Синхронизируем с localStorage
                localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
                console.log('📦 Адреса сохранены в localStorage:', savedAddresses.length);
                if (savedAddresses.length > 0) {
                    console.log('📦 ID адресов:', savedAddresses.map(a => a.id).join(', '));
                }
            } else {
                console.log('📦 Адреса не получены с сервера или не массив. Получено:', data.addresses);
                // Если адреса не получены с сервера, пробуем загрузить из localStorage
                const savedAddressesLocal = localStorage.getItem('savedAddresses');
                if (savedAddressesLocal) {
                    try {
                        savedAddresses = JSON.parse(savedAddressesLocal);
                        console.log('📦 Адреса загружены из localStorage:', savedAddresses.length);
                    } catch (e) {
                        console.error('📦 Ошибка загрузки адресов из localStorage:', e);
                        savedAddresses = [];
                    }
                } else {
                    savedAddresses = [];
                }
            }
            
            // ... остальная логика ...
            
            // Обновляем UI
            updateCartUI();
            updateGoToCartButton();
            loadSavedAddresses();
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            // Fallback на localStorage
            const savedAddressesLocal = localStorage.getItem('savedAddresses');
            if (savedAddressesLocal) {
                try {
                    savedAddresses = JSON.parse(savedAddressesLocal);
                } catch (e) {
                    savedAddresses = [];
                }
            }
        }
    }
}
```

**Особенности:**
- Загрузка с сервера через API
- Fallback на localStorage при ошибке
- Синхронизация с localStorage после загрузки

---

### 3. Обработчик формы сохранения адреса

**Расположение:** `app.js:3185-3335`

```javascript
addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // ... валидация полей ...
    
    // Пытаемся извлечь номер дома из street для совместимости с БД
    let houseValue = '';
    let streetValue = street || '';
    
    // Если в street есть номер дома (последние цифры/буквы после пробела)
    if (streetValue) {
        const houseMatch = streetValue.match(/(\d+[а-яА-ЯкК]*)$/);
        if (houseMatch) {
            houseValue = houseMatch[1];
            // Убираем номер дома из street, оставляя только название улицы
            streetValue = streetValue.replace(/\s*\d+[а-яА-ЯкК]*$/, '').trim();
        }
    }
    
    const address = {
        id: editingAddressId || Date.now(),
        name: name || street || 'Адрес',
        city: city,
        street: streetValue || street, // Название улицы без номера дома
        house: houseValue, // Номер дома отдельно для совместимости с БД
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
            const sameCity = (existingAddr.city || '').toLowerCase().trim() === (address.city || '').toLowerCase().trim();
            const sameStreet = (existingAddr.street || '').toLowerCase().trim() === (address.street || '').toLowerCase().trim();
            const sameApartment = (existingAddr.apartment || '').toLowerCase().trim() === (address.apartment || '').toLowerCase().trim();
            return sameCity && sameStreet && sameApartment;
        });
        
        if (!isDuplicate) {
            savedAddresses.push(address);
        }
    }
    
    saveUserData(); // Сохраняем на сервер
    
    // ... обновление UI ...
});
```

**Особенности:**
- Извлечение `house` из `street` перед сохранением
- Проверка дубликатов перед добавлением
- Сохранение через `saveUserData()`

---

### 4. Сохранение адреса при создании заказа

**Расположение:** `app.js:2413-2456`

```javascript
// Сохранение адреса из заказа в сохраненные адреса (если это новый адрес и его еще нет)
if (addressData && shouldUseForm) {
    // Проверяем, не является ли это дубликатом существующего адреса
    const isDuplicate = savedAddresses.some(existingAddr => {
        const sameCity = (existingAddr.city || '').toLowerCase().trim() === (addressData.city || '').toLowerCase().trim();
        const sameStreet = (existingAddr.street || '').toLowerCase().trim() === (addressData.street || '').toLowerCase().trim();
        const sameApartment = (existingAddr.apartment || '').toLowerCase().trim() === (addressData.apartment || '').toLowerCase().trim();
        return sameCity && sameStreet && sameApartment;
    });
    
    if (!isDuplicate && addressData.street) {
        // Создаем адрес с именем на основе улицы (теперь содержит "улица + дом")
        // Пытаемся извлечь номер дома из street для совместимости с БД
        let houseValue = addressData.house || '';
        let streetValue = addressData.street || '';
        
        // Если house пустое, но в street есть номер дома (последние цифры/буквы после пробела)
        if (!houseValue && streetValue) {
            const houseMatch = streetValue.match(/(\d+[а-яА-ЯкК]*)$/);
            if (houseMatch) {
                houseValue = houseMatch[1];
                // Убираем номер дома из street, оставляя только название улицы
                streetValue = streetValue.replace(/\s*\d+[а-яА-ЯкК]*$/, '').trim();
            }
        }
        
        const newAddress = {
            id: Date.now(),
            name: addressData.street || 'Адрес',
            city: addressData.city || 'Санкт-Петербург',
            street: streetValue || addressData.street, // Название улицы без номера дома
            house: houseValue, // Номер дома отдельно для совместимости с БД
            entrance: addressData.entrance || '',
            apartment: addressData.apartment || '',
            floor: addressData.floor || '',
            intercom: addressData.intercom || '',
            comment: addressData.comment || ''
        };
        savedAddresses.push(newAddress);
        console.log('📦 Добавлен новый адрес в сохраненные:', newAddress);
    } else {
        console.log('📦 Адрес не добавлен (дубликат или неполные данные):', addressData);
    }
}

// ВАЖНО: Сохраняем адреса на сервер ПЕРЕД очисткой формы
if (savedAddresses.length > 0) {
    console.log('📦 Сохраняем адреса на сервер перед очисткой формы, адресов:', savedAddresses.length);
    await saveUserData();
}
```

**Особенности:**
- Сохранение только если адрес введен через форму (не выбран из списка)
- Извлечение `house` из `street`
- Проверка дубликатов
- Сохранение на сервер перед очисткой формы

---

### 5. `loadSavedAddresses()` - Отображение сохраненных адресов

**Расположение:** `app.js:3385-3434`

```javascript
function loadSavedAddresses() {
    // Отображение в профиле
    const addressesList = document.getElementById('deliveryAddressesList');
    if (addressesList) {
        if (savedAddresses.length === 0) {
            addressesList.innerHTML = '<p class="no-addresses">У вас нет сохраненных адресов доставки</p>';
        } else {
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
    if (typeof window.renderAddressOptions === 'function') {
        window.renderAddressOptions();
    }
    
    // Обновляем список адресов на шаге 2, если он активен
    if (currentCheckoutStep === 2) {
        renderCheckoutAddresses();
    }
}
```

**Особенности:**
- Объединение `street` и `house` при отображении
- Отображение деталей (квартира, этаж, подъезд)
- Обновление UI в разных местах приложения

---

### 6. `fillOrderFormWithAddress(address)` - Заполнение формы заказа адресом

**Расположение:** `app.js:3437-3456`

```javascript
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

**Особенности:**
- Объединение `street` и `house` при заполнении формы
- Обратная совместимость со старыми адресами

---

## Логика извлечения house из street

### Регулярное выражение

```javascript
const houseMatch = streetValue.match(/(\d+[а-яА-ЯкК]*)$/);
```

**Описание:**
- `\d+` - одна или более цифр
- `[а-яА-ЯкК]*` - ноль или более русских букв (для корпусов типа "10к2")
- `$` - конец строки

**Примеры:**
- "Невский проспект 10" → house = "10", street = "Невский проспект"
- "Невский проспект 10к2" → house = "10к2", street = "Невский проспект"
- "Невский проспект" → house = "", street = "Невский проспект"

### Использование

**В bot.js (при сохранении адреса из заказа):**
```javascript
if (!houseValue && streetValue) {
    const houseMatch = streetValue.match(/(\d+[а-яА-ЯкК]*)$/);
    if (houseMatch) {
        houseValue = houseMatch[1];
        streetValue = streetValue.replace(/\s*\d+[а-яА-ЯкК]*$/, '').trim();
    }
}
```

**В app.js (при сохранении через форму):**
```javascript
if (streetValue) {
    const houseMatch = streetValue.match(/(\d+[а-яА-ЯкК]*)$/);
    if (houseMatch) {
        houseValue = houseMatch[1];
        streetValue = streetValue.replace(/\s*\d+[а-яА-ЯкК]*$/, '').trim();
    }
}
```

---

## Схема сохранения адресов

### 1. Сохранение через форму адреса

```
Пользователь заполняет форму
    ↓
Валидация полей
    ↓
Извлечение house из street
    ↓
Создание объекта address {street, house, ...}
    ↓
Проверка дубликатов в savedAddresses
    ↓
Добавление в savedAddresses (если не дубликат)
    ↓
saveUserData() → POST /api/user-data
    ↓
saveUserAddresses() → INSERT INTO addresses
    ↓
Сохранение в localStorage (резервная копия)
```

### 2. Сохранение при создании заказа

```
Пользователь создает заказ с новым адресом
    ↓
validateAndSubmitOrder() формирует addressData
    ↓
Проверка: shouldUseForm (адрес введен через форму)
    ↓
Извлечение house из street
    ↓
Проверка дубликатов в savedAddresses
    ↓
Добавление в savedAddresses (если не дубликат)
    ↓
POST /api/orders с orderData.addressData
    ↓
На сервере: извлечение house из street
    ↓
Проверка дубликатов в БД
    ↓
saveUserAddresses() → INSERT INTO addresses
    ↓
Сохранение адреса в БД
```

### 3. Загрузка адресов

```
Загрузка приложения
    ↓
loadUserData() → POST /api/user-data/:userId
    ↓
loadUserAddresses() → SELECT * FROM addresses
    ↓
Возврат массива адресов
    ↓
Сохранение в savedAddresses
    ↓
Синхронизация с localStorage
    ↓
loadSavedAddresses() → отображение в UI
```

---

## Важные моменты

1. **Защита от пустого массива:** Функция `saveUserAddresses` не удаляет существующие адреса, если передан пустой массив
2. **Извлечение house:** При сохранении адреса номер дома извлекается из поля `street` для совместимости с БД
3. **Объединение при отображении:** При отображении адресов `street` и `house` объединяются обратно
4. **Проверка дубликатов:** Дубликаты проверяются по city, street, house, apartment
5. **Транзакции:** Сохранение адресов выполняется в транзакции для атомарности
6. **Fallback на localStorage:** При ошибке загрузки с сервера используется localStorage
7. **Двойное сохранение:** Адреса сохраняются и в БД, и в localStorage как резервная копия
