# Код второй вкладки оформления заказа (Шаг 2 - Доставка)

## HTML код (из index.html, строки 352-403)

```html
<!-- Вкладка 2: Доставка -->
<div class="checkout-step" id="checkoutStep2">
    <div class="checkout-step-content">
        <h3 class="checkout-step-title">Доставка</h3>
        
        <!-- Список сохраненных адресов -->
        <div id="checkoutAddressesList" class="checkout-addresses-list" style="display: none;">
            <!-- Адреса будут добавлены динамически -->
        </div>
        
        <!-- Кнопка добавить новый адрес -->
        <button type="button" class="checkout-add-address-btn" id="addNewAddressBtn" style="display: none;">
            Добавить новый адрес
        </button>
        
        <!-- Форма ввода адреса (скрыта по умолчанию, если есть сохраненные адреса) -->
        <div id="checkoutAddressForm" class="checkout-address-form">
            <div class="form-group" id="anchor-orderAddressCity">
                <label>Город <span class="required">*</span></label>
                <input type="text" id="orderAddressCity" required value="Санкт-Петербург" readonly>
            </div>
            <div class="form-group" id="anchor-orderAddressStreet">
                <label>Улица, дом <span class="required">*</span></label>
                <input type="text" id="orderAddressStreet" required placeholder="Например Невский проспект, 10к2">
            </div>
            <div class="address-row">
                <div class="form-group form-group-half">
                    <label>Квартира/Офис</label>
                    <input type="text" id="orderAddressApartment" placeholder="№">
                </div>
                <div class="form-group form-group-half">
                    <label>Этаж</label>
                    <input type="text" id="orderAddressFloor" placeholder="№">
                </div>
            </div>
            <div class="address-row">
                <div class="form-group form-group-half">
                    <label>Подъезд</label>
                    <input type="text" id="orderAddressEntrance" placeholder="№">
                </div>
                <div class="form-group form-group-half">
                    <label>Домофон</label>
                    <input type="text" id="orderAddressIntercom" placeholder="Код домофона">
                </div>
            </div>
            <div class="form-group">
                <label>Комментарий</label>
                <textarea id="orderAddressComment" placeholder="Дополнительная информация для курьера"></textarea>
            </div>
        </div>
        <button type="button" class="checkout-continue-btn" id="continueStep2">Продолжить</button>
    </div>
</div>
```

## JavaScript код рендеринга адресов (из app.js, строки 5715-5776)

```javascript
function renderCheckoutAddresses() {
    const addressesList = document.getElementById('checkoutAddressesList');
    const addNewAddressBtn = document.getElementById('addNewAddressBtn');
    const addressForm = document.getElementById('checkoutAddressForm');
    
    if (!addressesList || !addNewAddressBtn || !addressForm) return;
    
    // Если есть сохраненные адреса - показываем список
    if (savedAddresses && savedAddresses.length > 0) {
        // ВСЕГДА показываем список адресов и скрываем форму, если есть сохраненные адреса
        addressesList.style.display = 'block';
        addNewAddressBtn.style.display = 'block';
        addressForm.style.display = 'none';
        
        // Рендерим список адресов с радио-кнопками
        addressesList.innerHTML = savedAddresses.map((addr, index) => {
            // Объединяем street и house для обратной совместимости
            let street = addr.street || '';
            const house = addr.house || '';
            if (house && !street.includes(house)) {
                street = street ? `${street} ${house}` : house;
            }
            
            // Не показываем город в кратком отображении
            const addressStr = [
                street,
                addr.apartment ? `кв. ${addr.apartment}` : ''
            ].filter(Boolean).join(', ');
            
            // Проверяем, выбран ли этот адрес по addressId
            const isSelected = checkoutData.addressId && Number(checkoutData.addressId) === Number(addr.id);
            
            return `
                <label class="checkout-address-option">
                    <input type="radio" name="checkoutAddress" value="${addr.id}" ${isSelected ? 'checked' : ''} onchange="selectCheckoutAddress(${addr.id})">
                    <div class="checkout-address-option-content">
                        <div class="checkout-address-text">${addressStr}</div>
                    </div>
                </label>
            `;
        }).join('');
        
        // Если адрес еще не выбран, выбираем последний (самый свежий)
        if (!checkoutData.addressId) {
            const lastAddress = savedAddresses[savedAddresses.length - 1];
            if (lastAddress) {
                selectCheckoutAddress(lastAddress.id);
            }
        } else {
            // Если адрес уже выбран по ID, убеждаемся, что он отмечен в списке
            const selectedRadio = document.querySelector(`input[name="checkoutAddress"][value="${checkoutData.addressId}"]`);
            if (selectedRadio) {
                selectedRadio.checked = true;
            }
        }
    } else {
        // Если адресов нет - показываем форму
        addressesList.style.display = 'none';
        addNewAddressBtn.style.display = 'none';
        addressForm.style.display = 'block';
    }
}
```

## JavaScript код выбора адреса (из app.js, строки 5778-5825)

```javascript
// Выбор адреса на шаге 2
function selectCheckoutAddress(addressId) {
    const id = Number(addressId);
    const addr = savedAddresses.find(a => Number(a.id) === id);
    
    if (!addr) {
        console.warn('[selectCheckoutAddress] адрес с id', id, 'не найден');
        return;
    }
    
    console.log('[selectCheckoutAddress] выбран адрес:', addr);
    
    // Сохраняем выбранный id в черновике чекаута
    checkoutData.addressId = id;
    
    // Объединяем street и house для обратной совместимости со старыми адресами
    let streetValue = addr.street || '';
    const houseValue = addr.house || '';
    if (houseValue && !streetValue.includes(houseValue)) {
        streetValue = streetValue ? `${streetValue} ${houseValue}` : houseValue;
    }
    
    // Заполняем checkoutData.address для обратной совместимости
    checkoutData.address = {
        id: addr.id,
        city: addr.city || 'Санкт-Петербург',
        street: streetValue,
        apartment: addr.apartment || '',
        floor: addr.floor || '',
        entrance: addr.entrance || '',
        intercom: addr.intercom || '',
        comment: addr.comment || ''
    };
    
    // Обновляем UI шагов (подсветка выбранной карточки и т.п.)
    if (typeof renderCheckoutAddresses === 'function') {
        renderCheckoutAddresses();
    }
    
    // Скрываем форму и показываем список адресов после выбора
    const addressesList = document.getElementById('checkoutAddressesList');
    const addNewAddressBtn = document.getElementById('addNewAddressBtn');
    const addressForm = document.getElementById('checkoutAddressForm');
    
    if (addressesList) addressesList.style.display = 'block';
    if (addNewAddressBtn) addNewAddressBtn.style.display = 'block';
    if (addressForm) addressForm.style.display = 'none';
}
```

## JavaScript код показа формы нового адреса (из app.js, строки 5827-5831)

```javascript
// Показ формы добавления нового адреса на шаге 2
function showCheckoutAddressForm() {
    // Используем универсальную функцию
    openAddressForm({ mode: 'create', source: 'checkout' });
}
```

## Примечание

В текущей версии кода кнопки "Редактировать" и "Удалить" для каждого адреса в списке отсутствуют. 
Если нужно добавить эти кнопки, их можно добавить в функцию `renderCheckoutAddresses()` 
внутри каждого элемента списка адресов.
