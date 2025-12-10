# 📋 Поток данных клиента и получателя

Документ описывает, как записываются и передаются данные клиента и получателя на всех этапах.

---

## 🔄 Общий поток данных

```
1. Инициализация формы (initOrderForm / checkoutBtnFinal)
   ↓
2. Заполнение полей получателя (customerName, customerPhone)
   ↓
3. Сохранение шага 1 (saveStep1)
   ↓
4. Валидация и отправка (validateAndSubmitOrder)
   ↓
5. Backend endpoint (/api/orders)
```

---

## 1️⃣ Инициализация формы заказа

### 📍 Место: `public/app.js` → `checkoutBtnFinal.addEventListener('click')` (строка ~1708)

```javascript
// Оформление заказа
checkoutBtnFinal.addEventListener('click', () => {
    currentCheckoutStep = 1;
    goToStep(1);
    
    // Заполняем поля получателя
    const customerNameField = document.getElementById('customerName');
    const customerPhoneField = document.getElementById('customerPhone');
    
    // Имя получателя - загружаем из localStorage (если человек уже делал заказ)
    // При первом заказе savedRecipientName == '' → поле будет пустым
    if (customerNameField) {
        const savedRecipientName = localStorage.getItem('flowbox_recipient_name') || '';
        customerNameField.value = savedRecipientName;
    }
    
    // Телефон получателя - из профиля (если есть)
    if (customerPhoneField) {
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            try {
                const profileData = JSON.parse(savedProfile);
                if (profileData.phone) {
                    customerPhoneField.value = profileData.phone;
                }
            } catch (e) {
                console.error('Ошибка парсинга профиля:', e);
            }
        }
    }
    
    switchTab('orderTab');
});
```

### 📍 Место: `public/app.js` → `goToStep(1)` (строка ~5257)

```javascript
// Если переходим на шаг 1, восстанавливаем поля получателя
if (step === 1) {
    const customerNameField = document.getElementById('customerName');
    const customerPhoneField = document.getElementById('customerPhone');
    
    // Имя получателя - загружаем из localStorage (если человек уже делал заказ)
    if (customerNameField) {
        const savedRecipientName = localStorage.getItem('flowbox_recipient_name') || '';
        customerNameField.value = savedRecipientName;
    }
    
    // Телефон получателя - из checkoutData или из профиля
    if (customerPhoneField) {
        if (checkoutData.recipientPhone) {
            customerPhoneField.value = checkoutData.recipientPhone;
        } else {
            const savedProfile = localStorage.getItem('userProfile');
            if (savedProfile) {
                try {
                    const profileData = JSON.parse(savedProfile);
                    if (profileData.phone) {
                        customerPhoneField.value = profileData.phone;
                    }
                } catch (e) {
                    console.error('Ошибка парсинга профиля:', e);
                }
            }
        }
    }
}
```

**Что происходит:**
- ✅ Имя получателя загружается из `localStorage.getItem('flowbox_recipient_name')`
- ✅ Телефон получателя загружается из профиля (`userProfile.phone`)
- ✅ При первом заказе поле имени пустое

---

## 2️⃣ Сохранение шага 1

### 📍 Место: `public/app.js` → `saveStep1()` (строка ~5552)

```javascript
// Сохранение шага 1
async function saveStep1() {
    const recipientNameInput = document.getElementById('customerName');
    const recipientPhoneInput = document.getElementById('customerPhone');
    
    const recipientName = (recipientNameInput ? recipientNameInput.value.trim() : '');
    const recipientPhone = (recipientPhoneInput ? recipientPhoneInput.value.trim() : '');
    
    checkoutData.recipientName = recipientName;
    checkoutData.recipientPhone = recipientPhone;
    
    // Если имя получателя введено - сохраняем его в localStorage для будущих заказов
    if (recipientName) {
        localStorage.setItem('flowbox_recipient_name', recipientName);
    }
    
    // Сохраняем телефон в профиль пользователя (если нужно)
    const userId = getUserId();
    if (userId && recipientPhone) {
        try {
            await fetch('/api/user-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    profile: {
                        phone: recipientPhone
                    }
                })
            });
        } catch (error) {
            console.error('Ошибка сохранения телефона получателя:', error);
        }
    }
}
```

**Что происходит:**
- ✅ Имя получателя сохраняется в `localStorage.setItem('flowbox_recipient_name', recipientName)`
- ✅ Имя получателя сохраняется в `checkoutData.recipientName`
- ✅ Телефон получателя сохраняется в `checkoutData.recipientPhone`
- ✅ Телефон получателя сохраняется в профиль на сервере

---

## 3️⃣ Валидация и формирование orderData

### 📍 Место: `public/app.js` → `validateAndSubmitOrder()` (строка ~2545)

```javascript
async function validateAndSubmitOrder(e) {
    // ... валидация ...
    
    // Проверка основных полей покупателя
    const nameField = document.getElementById('customerName');
    const phoneField = document.getElementById('customerPhone');
    const emailField = document.getElementById('customerEmail');
    
    const name = nameField ? nameField.value.trim() : '';
    const phone = phoneField ? phoneField.value.trim() : '';
    const email = emailField ? emailField.value.trim() : '';
    
    // Проверка получателя, если выбран "Другой получатель"
    const recipientRadio = document.querySelector('input[name="recipient"]:checked');
    let recipientName = '';
    let recipientPhone = '';
    
    if (recipientRadio && recipientRadio.value === 'other') {
        // Если выбран "Другой получатель"
        const recipientNameField = document.getElementById('recipientName');
        const recipientPhoneField = document.getElementById('recipientPhone');
        recipientName = recipientNameField ? recipientNameField.value.trim() : '';
        recipientPhone = recipientPhoneField ? recipientPhoneField.value.trim() : '';
    } else if (recipientRadio && recipientRadio.value === 'self') {
        // Если выбран "Я получу заказ", используем данные из профиля
        const savedProfile = localStorage.getItem('userProfile');
        let profileData = null;
        if (savedProfile) {
            try {
                profileData = JSON.parse(savedProfile);
            } catch (e) {
                console.error('Ошибка парсинга профиля:', e);
            }
        }
        if (profileData) {
            recipientName = profileData.name || '';
            recipientPhone = profileData.phone || '';
        } else {
            recipientName = '';
            recipientPhone = '';
        }
    } else {
        // По умолчанию (новая поэтапная форма) - используем данные из полей формы
        recipientName = name; // Из customerName
        recipientPhone = phone; // Из customerPhone
    }
    
    // ... формирование orderData ...
    
    const orderData = {
        items: cart.map(item => ({ ... })),
        total: total,
        flowersTotal: flowersTotal,
        serviceFee: serviceFee,
        deliveryPrice: deliveryPrice,
        
        // КЛИЕНТ (из формы - customerName, customerPhone)
        name: name,              // ← Имя из поля customerName
        phone: phone,            // ← Телефон из поля customerPhone
        email: email,            // ← Email из поля customerEmail (если есть)
        
        // ПОЛУЧАТЕЛЬ (из формы или профиля)
        recipientName: recipientName,     // ← Имя получателя
        recipientPhone: recipientPhone,   // ← Телефон получателя
        
        address: addressString,
        addressData: addressData,
        deliveryDate: deliveryDate,
        deliveryTime: deliveryTime,
        comment: comment,
        userComment: comment,
        orderComment: comment,
        leaveAtDoor: leaveAtDoor,
        courierComment: addressData?.comment || null,
        
        // Телеграм-метаданные
        userId: tg.initDataUnsafe?.user?.id || null,
        username: tg.initDataUnsafe?.user?.username || null,
        phone_number: tg.initDataUnsafe?.user?.phone_number || null
    };
    
    // Сохраняем имя получателя в localStorage после успешной отправки
    if (name && name.trim()) {
        localStorage.setItem('flowbox_recipient_name', name.trim());
    }
    
    // ... отправка на сервер ...
}
```

**Что происходит:**
- ✅ `name` и `phone` берутся из полей формы (`customerName`, `customerPhone`)
- ✅ `recipientName` и `recipientPhone` определяются в зависимости от выбора получателя
- ✅ В новой поэтапной форме: `recipientName = name`, `recipientPhone = phone`
- ✅ После успешной отправки имя сохраняется в `localStorage`

---

## 4️⃣ Backend endpoint - получение заказа

### 📍 Место: `bot.js` → `app.post('/api/orders')` (строка ~2593)

```javascript
app.post('/api/orders', async (req, res) => {
    const orderData = req.body;
    
    // Вызываем функцию создания заказа в БД
    const result = await createOrderInDb(orderData);
    
    // ... обработка результата ...
});
```

### 📍 Место: `bot.js` → `createOrderInDb()` (строка ~1698)

```javascript
async function createOrderInDb(orderData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const userId = orderData.userId || null;
        
        // Получаем данные пользователя из БД
        let userData = null;
        if (userId) {
            const userResult = await client.query(
                'SELECT id, first_name, last_name, phone, email FROM users WHERE telegram_id = $1::bigint',
                [userId]
            );
            if (userResult.rows.length > 0) {
                userId = userResult.rows[0].id; // Внутренний ID пользователя
                userData = userResult.rows[0];
            }
        }
        
        // Данные клиента на момент заказа (ПРИОРИТЕТ: сначала orderData из формы, потом userData из профиля)
        const clientName = orderData.name || (userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : null);
        const clientPhone = orderData.phone || userData?.phone || null;
        const clientEmail = orderData.email || userData?.email || null;
        
        // ... расчет итоговой суммы ...
        
        // Сохранение в БД
        const orderResult = await client.query(
            `INSERT INTO orders 
             (user_id, total, flowers_total, service_fee, delivery_price, bonus_used, bonus_earned,
              client_name, client_phone, client_email,
              recipient_name, recipient_phone, 
              address_id, address_string, address_json, 
              delivery_zone, delivery_date, delivery_time,
              user_comment, courier_comment, leave_at_door, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'NEW')
             RETURNING *`,
            [
                userId,
                finalTotal,
                orderData.flowersTotal,
                orderData.serviceFee || 450,
                orderData.deliveryPrice || 0,
                0, // bonus_used
                0, // bonus_earned
                clientName,              // → client_name (из профиля или orderData.name)
                clientPhone,             // → client_phone (из профиля или orderData.phone)
                clientEmail,             // → client_email (из профиля или orderData.email)
                orderData.recipientName || null,    // → recipient_name
                orderData.recipientPhone || null,   // → recipient_phone
                addressId,
                orderData.address,
                JSON.stringify(orderData.addressData || {}),
                deliveryZone,
                orderData.deliveryDate || null,
                orderData.deliveryTime || null,
                userComment,
                courierComment,
                leaveAtDoor
            ]
        );
        
        // Сохраняем телефон и почту из формы заказа в профиль пользователя, если они были заполнены
        if (userId && (orderData.phone || orderData.email)) {
            // Обновляем профиль пользователя данными из формы заказа
            if (orderData.phone) {
                await client.query(
                    `UPDATE users SET phone = $1, updated_at = now() WHERE id = $2`,
                    [orderData.phone, userId]
                );
            }
            if (orderData.email) {
                await client.query(
                    `UPDATE users SET email = $1, updated_at = now() WHERE id = $2`,
                    [orderData.email, userId]
                );
            }
        }
        
        await client.query('COMMIT');
        return { orderId: order.id };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
```

**Что происходит:**
- ✅ **Приоритет данных клиента:** сначала `orderData` (из формы), потом `userData` (из профиля)
- ✅ `clientName` = `orderData.name` (из поля `customerName`) ИЛИ `userData.first_name + last_name` (из профиля)
- ✅ `clientPhone` = `orderData.phone` (из поля `customerPhone`) ИЛИ `userData.phone` (из профиля)
- ✅ `clientEmail` = `orderData.email` (из поля `customerEmail`) ИЛИ `userData.email` (из профиля)
- ✅ `recipientName` → сохраняется в `recipient_name` (БД) из `orderData.recipientName`
- ✅ `recipientPhone` → сохраняется в `recipient_phone` (БД) из `orderData.recipientPhone`
- ✅ Телефон и email из формы заказа (`orderData.phone`, `orderData.email`) обновляют профиль пользователя в БД

---

## 📊 Структура данных в БД

### Таблица `orders`:

| Поле БД | Источник (приоритет) | Описание |
|---------|---------------------|----------|
| `client_name` | 1) `orderData.name` (из `customerName`)<br>2) `userData.first_name + last_name` (из профиля) | Имя клиента |
| `client_phone` | 1) `orderData.phone` (из `customerPhone`)<br>2) `userData.phone` (из профиля) | Телефон клиента |
| `client_email` | 1) `orderData.email` (из `customerEmail`)<br>2) `userData.email` (из профиля) | Email клиента |
| `recipient_name` | `orderData.recipientName` | Имя получателя |
| `recipient_phone` | `orderData.recipientPhone` | Телефон получателя |

---

## 🔑 Ключевые моменты

1. **Имя получателя:**
   - При первом заказе: поле пустое, пользователь вводит вручную
   - При следующих заказах: подставляется из `localStorage.getItem('flowbox_recipient_name')`
   - Сохраняется в `localStorage` после успешной отправки заказа

2. **Телефон получателя:**
   - Загружается из профиля (`userProfile.phone`)
   - Сохраняется в профиль на сервере при сохранении шага 1

3. **В новой поэтапной форме:**
   - `name` и `phone` из полей `customerName` и `customerPhone` → это данные получателя
   - `recipientName = name`, `recipientPhone = phone` (по умолчанию)

4. **В админке:**
   - **Клиент:** `client_name`, `client_phone`, `client_email` (из полей формы)
   - **Получатель:** `recipient_name`, `recipient_phone` (из полей формы или профиля)

---

## 📝 Примечания

- В текущей реализации `name` и `phone` в `orderData` - это данные получателя (из полей `customerName`, `customerPhone`)
- `recipientName` и `recipientPhone` дублируют эти данные в новой поэтапной форме
- Для разделения клиента и получателя нужно изменить логику в `validateAndSubmitOrder()`:
  - Клиент → из Telegram + профиля
  - Получатель → из формы (`customerName`, `customerPhone`)
