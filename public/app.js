// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Поиск логотипа в разных форматах
let logoFormats = ['logo.jpg', 'logo.png', 'logo.svg', 'logo.jpeg'];
let currentLogoIndex = 0;

function tryNextLogoFormat() {
    const logoImg = document.getElementById('logoImg');
    const logoFallback = document.getElementById('logoFallback');
    
    if (currentLogoIndex < logoFormats.length - 1) {
        currentLogoIndex++;
        logoImg.src = logoFormats[currentLogoIndex];
    } else {
        // Если ни один формат не найден, показываем fallback
        logoImg.style.display = 'none';
        logoFallback.style.display = 'block';
    }
}

// Экспорт для использования в onerror
window.tryNextLogoFormat = tryNextLogoFormat;

// Состояние приложения
let products = [];
let cart = [];
let filteredProducts = [];
let activeFilters = {
    type: [],
    color: [],
    feature: []
};
let productQuantities = {}; // Количество для каждого товара в карточке
let deliveryPrice = 0;
let serviceFee = 450;
let bonusUsed = 0;
let accumulatedBonuses = 500;
let savedAddresses = []; // Сохраненные адреса

// Элементы DOM
const productsContainer = document.getElementById('productsContainer');
const navCartCount = document.getElementById('navCartCount');
const goToCartFixed = document.getElementById('goToCartFixed');
const fixedCartTotal = document.getElementById('fixedCartTotal');
const emptyCartContainer = document.getElementById('emptyCartContainer');
const cartWithItems = document.getElementById('cartWithItems');
const cartItemsList = document.getElementById('cartItemsList');
const finalTotalAmount = document.getElementById('finalTotalAmount');
const checkoutBtnFinal = document.getElementById('checkoutBtnFinal');
const orderOverlay = document.getElementById('orderOverlay');
const closeOrder = document.getElementById('closeOrder');
const orderForm = document.getElementById('orderForm');
const successOverlay = document.getElementById('successOverlay');
const backToShop = document.getElementById('backToShop');

// Элементы профиля
const profileName = document.getElementById('profileName');
const profileInitial = document.getElementById('profileInitial');
const profileAvatarImg = document.getElementById('profileAvatarImg');
const profileAvatarFallback = document.getElementById('profileAvatarFallback');
const activeOrders = document.getElementById('activeOrders');

// Навигация
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Фильтры
const filterButtons = document.querySelectorAll('.filter-btn');

// Загрузка товаров
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        products = await response.json();
        // Инициализация количества для каждого товара
        products.forEach(p => {
            productQuantities[p.id] = 1;
        });
        filteredProducts = [...products];
        renderProducts();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        productsContainer.innerHTML = '<div class="loading">Ошибка загрузки товаров</div>';
    }
}

// Фильтрация товаров
function applyFilters() {
    filteredProducts = products.filter(product => {
        // Фильтр по типу
        if (activeFilters.type.length > 0 && !activeFilters.type.includes('all')) {
            const productType = product.type || 'all';
            if (!activeFilters.type.includes(productType)) return false;
        }
        
        // Фильтр по цвету
        if (activeFilters.color.length > 0) {
            const productColor = product.color || '';
            if (!activeFilters.color.some(c => productColor.includes(c))) return false;
        }
        
        // Фильтр по характеристикам
        if (activeFilters.feature.length > 0) {
            const productFeatures = product.features || [];
            if (!activeFilters.feature.some(f => productFeatures.includes(f))) return false;
        }
        
        return true;
    });
    
    renderProducts();
}

// Обработка фильтров
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        const category = btn.dataset.category;
        
        // Для первой строки (type) - взаимоисключающий выбор
        if (category === 'type') {
            // Если нажали "Все"
            if (filter === 'all') {
                // Снимаем все фильтры типа
                document.querySelectorAll(`.filter-btn[data-category="type"]`).forEach(b => {
                    b.classList.remove('active');
                });
                activeFilters.type = ['all'];
                btn.classList.add('active');
            } else {
                // Если нажали конкретный тип - убираем "Все"
                const allBtn = document.querySelector(`.filter-btn[data-filter="all"][data-category="type"]`);
                if (allBtn) {
                    allBtn.classList.remove('active');
                }
                // Убираем все остальные фильтры типа
                document.querySelectorAll(`.filter-btn[data-category="type"]:not([data-filter="${filter}"])`).forEach(b => {
                    b.classList.remove('active');
                });
                activeFilters.type = [filter];
                btn.classList.add('active');
            }
        } else {
            // Для остальных категорий - множественный выбор
            if (btn.classList.contains('active')) {
                // Отмена фильтра
                btn.classList.remove('active');
                const index = activeFilters[category].indexOf(filter);
                if (index > -1) {
                    activeFilters[category].splice(index, 1);
                }
            } else {
                // Активация фильтра
                btn.classList.add('active');
                if (!activeFilters[category].includes(filter)) {
                    activeFilters[category].push(filter);
                }
            }
        }
        
        applyFilters();
        tg.HapticFeedback.impactOccurred('light');
    });
});

// Отображение товаров
function renderProducts() {
    if (filteredProducts.length === 0) {
        productsContainer.innerHTML = '<div class="loading">Товары не найдены</div>';
        return;
    }

    productsContainer.innerHTML = filteredProducts.map(product => {
        const quantity = productQuantities[product.id] || 1;
        const totalPrice = product.price * quantity;
        
        return `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image-wrapper">
                    <img src="${product.image}" alt="${product.name}" class="product-image">
                    <div class="delivery-badge">Доставим Завтра</div>
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-price-row">
                        <div class="product-price" id="price-${product.id}">
                            ${totalPrice} <span class="ruble">₽</span>
                        </div>
                        <div class="product-quantity">
                            <button class="quantity-btn-small" onclick="changeProductQuantity(${product.id}, -1)" ${quantity <= 1 ? 'disabled' : ''}>−</button>
                            <span class="quantity-value" id="qty-${product.id}">${quantity}</span>
                            <button class="quantity-btn-small" onclick="changeProductQuantity(${product.id}, 1)" ${quantity >= 500 ? 'disabled' : ''}>+</button>
                        </div>
                    </div>
                    <button class="add-to-cart-btn" onclick="addToCart(${product.id}, ${quantity})" id="add-btn-${product.id}">
                        Добавить
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Изменение количества товара в карточке
function changeProductQuantity(productId, delta) {
    const currentQty = productQuantities[productId] || 1;
    const newQty = Math.max(1, Math.min(500, currentQty + delta));
    productQuantities[productId] = newQty;
    
    // Находим товар для получения цены
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const newTotalPrice = product.price * newQty;
    
    // Обновляем элементы карточки
    const quantityValue = document.getElementById(`qty-${productId}`);
    const priceElement = document.getElementById(`price-${productId}`);
    const addBtn = document.getElementById(`add-btn-${productId}`);
    const card = document.querySelector(`[data-product-id="${productId}"]`);
    
    if (quantityValue) quantityValue.textContent = newQty;
    if (priceElement) priceElement.innerHTML = `${newTotalPrice} <span class="ruble">₽</span>`;
    if (addBtn) addBtn.setAttribute('onclick', `addToCart(${productId}, ${newQty})`);
    
    // Обновляем кнопки +/-
    if (card) {
        const minusBtn = card.querySelector(`[onclick*="changeProductQuantity(${productId}, -1)"]`);
        const plusBtn = card.querySelector(`[onclick*="changeProductQuantity(${productId}, 1)"]`);
        if (minusBtn) minusBtn.disabled = newQty <= 1;
        if (plusBtn) plusBtn.disabled = newQty >= 500;
    }
    
    // Обновляем корзину, если товар уже в корзине
    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.quantity = newQty;
        updateCartUI();
    }
    
    tg.HapticFeedback.impactOccurred('light');
}

// Добавление в корзину
function addToCart(productId, quantity = 1) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            ...product,
            quantity: quantity
        });
    }
    
    // Сброс количества в карточке
    productQuantities[productId] = 1;

    updateCartUI();
    updateGoToCartButton();
    tg.HapticFeedback.impactOccurred('light');
}

// Обновление кнопки "Перейти в корзину"
function updateGoToCartButton() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    fixedCartTotal.textContent = total;
    
    if (cart.length > 0) {
        goToCartFixed.style.display = 'block';
    } else {
        goToCartFixed.style.display = 'none';
    }
}

// Удаление из корзины
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartUI();
    tg.HapticFeedback.impactOccurred('light');
}

// Изменение количества в корзине
function changeQuantity(productId, delta) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    item.quantity = Math.max(1, Math.min(500, item.quantity + delta));
    
    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        updateCartUI();
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Обновление UI корзины
function updateCartUI() {
    // Обновление счетчика в навигации
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    navCartCount.textContent = totalItems;
    if (totalItems === 0) {
        navCartCount.style.display = 'none';
    } else {
        navCartCount.style.display = 'block';
    }
    
    // Обновление страницы корзины
    if (cart.length === 0) {
        emptyCartContainer.style.display = 'block';
        cartWithItems.style.display = 'none';
    } else {
        emptyCartContainer.style.display = 'none';
        cartWithItems.style.display = 'block';
        
        // Рендер товаров в корзине
        cartItemsList.innerHTML = cart.map(item => `
            <div class="cart-item-new">
                <img src="${item.image}" alt="${item.name}" class="cart-item-new-image">
                <div class="cart-item-new-info">
                    <div class="cart-item-new-name">${item.name}</div>
                    <div class="cart-item-new-price">${item.price} ₽</div>
                    <div class="cart-item-new-quantity">
                        <button class="quantity-btn-small" onclick="changeQuantity(${item.id}, -1)">−</button>
                        <span class="quantity-value">${item.quantity}</span>
                        <button class="quantity-btn-small" onclick="changeQuantity(${item.id}, 1)">+</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Расчет итоговой суммы
        calculateFinalTotal();
    }
    
    updateGoToCartButton();
}

// Расчет итоговой суммы
function calculateFinalTotal() {
    const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Если тумблер включен, обновляем bonusUsed
    if (bonusToggle && bonusToggle.checked) {
        bonusUsed = Math.min(accumulatedBonuses, flowersTotal);
    }
    
    const total = flowersTotal + serviceFee + deliveryPrice - bonusUsed;
    
    finalTotalAmount.textContent = total;
    
    // Расчет бонусов
    const bonusToEarn = bonusUsed > 0 ? 0 : Math.floor(flowersTotal * 0.01);
    document.getElementById('bonusToEarn').textContent = bonusToEarn;
}

// Обработка доставки (используем делегирование событий для динамически созданных элементов)
document.addEventListener('click', (e) => {
    if (e.target.closest('.delivery-option')) {
        const btn = e.target.closest('.delivery-option');
        document.querySelectorAll('.delivery-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        deliveryPrice = parseInt(btn.dataset.price) || 0;
        calculateFinalTotal();
        tg.HapticFeedback.impactOccurred('light');
    }
});

// Обработка бонусов (тумблер)
const bonusToggle = document.getElementById('bonusToggle');

bonusToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        // Включаем бонусы - списываем все доступные
        const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        bonusUsed = Math.min(accumulatedBonuses, flowersTotal);
    } else {
        // Выключаем бонусы
        bonusUsed = 0;
    }
    calculateFinalTotal();
    tg.HapticFeedback.impactOccurred('light');
});

// Переключение вкладок
function switchTab(tabId) {
    // Скрыть все вкладки
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Показать выбранную вкладку
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Обновить навигацию
    navItems.forEach(item => {
        if (item.dataset.tab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Обновить корзину при открытии вкладки
    if (tabId === 'cartTab') {
        updateCartUI();
    }
    
    tg.HapticFeedback.impactOccurred('light');
}

// Обработчики навигации
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const tabId = item.dataset.tab;
        switchTab(tabId);
    });
});

// Оформление заказа
checkoutBtnFinal.addEventListener('click', () => {
    orderOverlay.classList.add('active');
    
    // Загрузка адресов
    loadSavedAddresses();
    
    // Установка минимальной даты (завтра)
    const deliveryDateInput = document.getElementById('deliveryDate');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    deliveryDateInput.min = tomorrow.toISOString().split('T')[0];
    deliveryDateInput.value = tomorrow.toISOString().split('T')[0];
    
    // Обработка выбора времени доставки
    document.querySelectorAll('.time-slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tg.HapticFeedback.impactOccurred('light');
        });
    });
    
    // Заполнение формы
    const summaryItems = document.getElementById('summaryItems');
    const summaryTotal = document.getElementById('summaryTotal');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = flowersTotal + serviceFee + deliveryPrice - bonusUsed;
    
    summaryItems.textContent = totalItems;
    summaryTotal.textContent = total;
    
    // Заполнение данных пользователя из Telegram
    const user = tg.initDataUnsafe?.user;
    if (user) {
        const nameInput = document.getElementById('customerName');
        if (user.first_name) {
            const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            nameInput.value = fullName;
        }
    }
    
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeOrderPanel();
    });
});

// Закрытие формы заказа
closeOrder.addEventListener('click', closeOrderPanel);

function closeOrderPanel() {
    orderOverlay.classList.remove('active');
    tg.BackButton.hide();
}

// Отправка заказа
orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Сброс ошибок
    document.querySelectorAll('#newAddressForm .form-group input, #newAddressForm .form-group textarea').forEach(field => {
        validateField(field, true);
    });
    const orderAddressError = document.getElementById('orderAddressError');
    if (orderAddressError) orderAddressError.style.display = 'none';
    
    const name = document.getElementById('customerName').value;
    const phone = document.getElementById('customerPhone').value;
    const email = document.getElementById('customerEmail').value;
    const comment = document.getElementById('orderComment').value;
    const deliveryDate = document.getElementById('deliveryDate').value;
    const selectedTimeSlot = document.querySelector('.time-slot-btn.active');
    const deliveryTime = selectedTimeSlot ? selectedTimeSlot.dataset.time : null;
    
    // Проверка времени доставки
    if (!deliveryTime) {
        alert('Пожалуйста, выберите время доставки');
        return;
    }
    
    // Проверка выбранного адреса
    const selectedAddressItem = document.querySelector('.saved-addresses-list .address-item.selected');
    let addressData = null;
    
    if (selectedAddressItem) {
        const addressId = parseInt(selectedAddressItem.dataset.addressId);
        addressData = savedAddresses.find(a => a.id === addressId);
    } else {
        // Проверка формы нового адреса
        const city = document.getElementById('orderAddressCity').value.trim();
        const street = document.getElementById('orderAddressStreet').value.trim();
        
        let hasErrors = false;
        if (!city || (city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб')) {
            validateField(document.getElementById('orderAddressCity'), false);
            if (orderAddressError) orderAddressError.style.display = 'block';
            hasErrors = true;
        }
        if (!street) {
            validateField(document.getElementById('orderAddressStreet'), false);
            hasErrors = true;
        }
        
        if (hasErrors) return;
        
        addressData = {
            name: document.getElementById('orderAddressName').value.trim() || 'Новый адрес',
            city: city,
            street: street,
            entrance: document.getElementById('orderAddressEntrance').value.trim(),
            apartment: document.getElementById('orderAddressApartment').value.trim(),
            floor: document.getElementById('orderAddressFloor').value.trim(),
            intercom: document.getElementById('orderAddressIntercom').value.trim(),
            comment: document.getElementById('orderAddressComment').value.trim()
        };
    }
    
    // Формирование строки адреса
    const addressString = `${addressData.city}, ${addressData.street}${addressData.apartment ? ', ' + addressData.apartment : ''}${addressData.entrance ? ', парадная ' + addressData.entrance : ''}${addressData.floor ? ', этаж ' + addressData.floor : ''}${addressData.intercom ? ', домофон ' + addressData.intercom : ''}`;
    
    const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = flowersTotal + serviceFee + deliveryPrice - bonusUsed;
    
    const orderData = {
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: total,
        flowersTotal: flowersTotal,
        serviceFee: serviceFee,
        deliveryPrice: deliveryPrice,
        bonusUsed: bonusUsed,
        name: name,
        phone: phone,
        email: email,
        address: addressString,
        addressData: addressData,
        deliveryDate: deliveryDate,
        deliveryTime: deliveryTime,
        comment: comment,
        userId: tg.initDataUnsafe?.user?.id || null,
        username: tg.initDataUnsafe?.user?.username || null
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();
        
        if (result.success) {
            tg.sendData(JSON.stringify(orderData));
            
            orderOverlay.classList.remove('active');
            successOverlay.classList.add('active');
            tg.BackButton.hide();
            
            // Очистка корзины
            cart = [];
            updateCartUI();
            orderForm.reset();
            
            switchTab('menuTab');
            
            tg.HapticFeedback.notificationOccurred('success');
        }
    } catch (error) {
        console.error('Ошибка отправки заказа:', error);
        alert('Произошла ошибка при оформлении заказа. Попробуйте еще раз.');
    }
});

// Возврат в магазин
backToShop.addEventListener('click', () => {
    successOverlay.classList.remove('active');
    switchTab('menuTab');
});

// Загрузка данных профиля
function loadProfile() {
    const user = tg.initDataUnsafe?.user;
    
    if (user) {
        // Имя
        if (user.first_name) {
            const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            profileName.textContent = fullName;
            
            // Инициалы для аватара
            const initials = user.first_name[0] + (user.last_name ? user.last_name[0] : '');
            profileInitial.textContent = initials.toUpperCase();
        }
        
        // Аватар
        if (user.photo_url) {
            profileAvatarImg.src = user.photo_url;
            profileAvatarImg.style.display = 'block';
            profileAvatarFallback.style.display = 'none';
        }
    }
}

// Модальные окна профиля
const addressModal = document.getElementById('addressModal');
const addressForm = document.getElementById('addressForm');
const addressCity = document.getElementById('addressCity');
const addressError = document.getElementById('addressError');
const closeAddressModal = document.getElementById('closeAddressModal');
const addressesBtn = document.getElementById('addressesBtn');

const orderHistoryModal = document.getElementById('orderHistoryModal');
const orderHistoryList = document.getElementById('orderHistoryList');
const closeOrderHistoryModal = document.getElementById('closeOrderHistoryModal');
const orderHistoryBtn = document.getElementById('orderHistoryBtn');

const supportModal = document.getElementById('supportModal');
const closeSupportModal = document.getElementById('closeSupportModal');
const supportBtn = document.getElementById('supportBtn');

const bonusesModal = document.getElementById('bonusesModal');
const modalBonusesAmount = document.getElementById('modalBonusesAmount');
const closeBonusesModal = document.getElementById('closeBonusesModal');
const bonusesBtn = document.getElementById('bonusesBtn');

// Открытие модальных окон
addressesBtn.addEventListener('click', () => {
    addressModal.style.display = 'flex';
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeAddressModal.click();
    });
});

orderHistoryBtn.addEventListener('click', () => {
    orderHistoryModal.style.display = 'flex';
    loadOrderHistory();
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeOrderHistoryModal.click();
    });
});

supportBtn.addEventListener('click', () => {
    supportModal.style.display = 'flex';
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeSupportModal.click();
    });
});

bonusesBtn.addEventListener('click', () => {
    bonusesModal.style.display = 'flex';
    modalBonusesAmount.textContent = accumulatedBonuses;
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeBonusesModal.click();
    });
});

// Закрытие модальных окон
closeAddressModal.addEventListener('click', () => {
    addressModal.style.display = 'none';
    tg.BackButton.hide();
});

closeOrderHistoryModal.addEventListener('click', () => {
    orderHistoryModal.style.display = 'none';
    tg.BackButton.hide();
});

closeSupportModal.addEventListener('click', () => {
    supportModal.style.display = 'none';
    tg.BackButton.hide();
});

closeBonusesModal.addEventListener('click', () => {
    bonusesModal.style.display = 'none';
    tg.BackButton.hide();
});

// Валидация поля
function validateField(field, isValid) {
    if (isValid) {
        field.classList.remove('error');
        const label = field.closest('.form-group')?.querySelector('label');
        if (label) label.classList.remove('error-label');
    } else {
        field.classList.add('error');
        const label = field.closest('.form-group')?.querySelector('label');
        if (label) label.classList.add('error-label');
    }
}

// Редактирование адреса
function editAddress(addressId) {
    const address = savedAddresses.find(a => a.id === addressId);
    if (!address) return;
    
    editingAddressId = addressId;
    document.getElementById('addressModalTitle').textContent = 'Редактировать адрес';
    document.getElementById('deleteAddressBtn').style.display = 'block';
    
    // Заполнение формы
    document.getElementById('addressName').value = address.name || '';
    document.getElementById('addressCity').value = address.city || '';
    document.getElementById('addressStreet').value = address.street || '';
    document.getElementById('addressEntrance').value = address.entrance || '';
    document.getElementById('addressApartment').value = address.apartment || '';
    document.getElementById('addressFloor').value = address.floor || '';
    document.getElementById('addressIntercom').value = address.intercom || '';
    document.getElementById('addressComment').value = address.comment || '';
    
    addressModal.style.display = 'flex';
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeAddressModal.click();
    });
}

// Удаление адреса
function deleteAddress(addressId) {
    if (confirm('Вы уверены, что хотите удалить этот адрес?')) {
        savedAddresses = savedAddresses.filter(a => a.id !== addressId);
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
        loadSavedAddresses();
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Обработка формы адреса
addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Сброс всех ошибок
    document.querySelectorAll('.form-group input, .form-group textarea').forEach(field => {
        validateField(field, true);
    });
    addressError.style.display = 'none';
    
    let hasErrors = false;
    const city = addressCity.value.trim();
    const street = document.getElementById('addressStreet').value.trim();
    const name = document.getElementById('addressName').value.trim();
    
    // Валидация города
    if (!city || (city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб')) {
        validateField(addressCity, false);
        addressError.style.display = 'block';
        hasErrors = true;
    }
    
    // Валидация наименования
    if (!name) {
        validateField(document.getElementById('addressName'), false);
        hasErrors = true;
    }
    
    // Валидация улицы
    if (!street) {
        validateField(document.getElementById('addressStreet'), false);
        hasErrors = true;
    }
    
    if (hasErrors) return;
    
    const address = {
        id: editingAddressId || Date.now(),
        name: name,
        city: city,
        street: street,
        entrance: document.getElementById('addressEntrance').value.trim(),
        apartment: document.getElementById('addressApartment').value.trim(),
        floor: document.getElementById('addressFloor').value.trim(),
        intercom: document.getElementById('addressIntercom').value.trim(),
        comment: document.getElementById('addressComment').value.trim()
    };
    
    if (editingAddressId) {
        // Обновление существующего адреса
        const index = savedAddresses.findIndex(a => a.id === editingAddressId);
        if (index !== -1) {
            savedAddresses[index] = address;
        }
        editingAddressId = null;
    } else {
        // Добавление нового адреса
        savedAddresses.push(address);
    }
    
    localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
    
    addressForm.reset();
    document.getElementById('addressModalTitle').textContent = 'Добавить адрес';
    document.getElementById('deleteAddressBtn').style.display = 'none';
    closeAddressModal.click();
    loadSavedAddresses();
    tg.HapticFeedback.notificationOccurred('success');
});

// Обработка удаления адреса
document.getElementById('deleteAddressBtn').addEventListener('click', () => {
    if (editingAddressId && confirm('Вы уверены, что хотите удалить этот адрес?')) {
        savedAddresses = savedAddresses.filter(a => a.id !== editingAddressId);
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
        addressForm.reset();
        editingAddressId = null;
        document.getElementById('addressModalTitle').textContent = 'Добавить адрес';
        document.getElementById('deleteAddressBtn').style.display = 'none';
        closeAddressModal.click();
        loadSavedAddresses();
        tg.HapticFeedback.impactOccurred('light');
    }
});

// Сброс формы при открытии для нового адреса
addressesBtn.addEventListener('click', () => {
    editingAddressId = null;
    document.getElementById('addressModalTitle').textContent = 'Добавить адрес';
    document.getElementById('deleteAddressBtn').style.display = 'none';
    addressForm.reset();
});

// Текущий редактируемый адрес
let editingAddressId = null;

// Загрузка сохраненных адресов
function loadSavedAddresses() {
    const stored = localStorage.getItem('savedAddresses');
    if (stored) {
        savedAddresses = JSON.parse(stored);
    }
    
    // Отображение в профиле
    const addressesList = document.getElementById('deliveryAddressesList');
    if (addressesList) {
        if (savedAddresses.length === 0) {
            addressesList.innerHTML = '<p class="no-addresses">Адреса не добавлены</p>';
        } else {
            addressesList.innerHTML = savedAddresses.map(addr => `
                <div class="address-item">
                    <div class="address-item-name">${addr.name}</div>
                    <div class="address-item-details">${addr.street}${addr.apartment ? ', ' + addr.apartment : ''}</div>
                    <div class="address-item-actions">
                        <button class="address-edit-btn" onclick="editAddress(${addr.id})">Изменить</button>
                        <button class="address-delete-btn" onclick="deleteAddress(${addr.id})">Удалить</button>
                    </div>
                </div>
            `).join('');
        }
    }
    
    // Отображение в форме заказа
    const savedAddressesSection = document.getElementById('savedAddressesSection');
    const savedAddressesList = document.getElementById('savedAddressesList');
    const newAddressForm = document.getElementById('newAddressForm');
    const useNewAddressBtn = document.getElementById('useNewAddressBtn');
    
    if (savedAddresses.length > 0) {
        savedAddressesSection.style.display = 'block';
        newAddressForm.style.display = 'none';
        
        savedAddressesList.innerHTML = savedAddresses.map(addr => `
            <div class="address-item" data-address-id="${addr.id}">
                <div class="address-item-name">${addr.name}</div>
                <div class="address-item-details">${addr.street}${addr.apartment ? ', ' + addr.apartment : ''}</div>
            </div>
        `).join('');
        
        // Обработка выбора адреса
        savedAddressesList.querySelectorAll('.address-item').forEach(item => {
            item.addEventListener('click', () => {
                savedAddressesList.querySelectorAll('.address-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                const addressId = parseInt(item.dataset.addressId);
                const selectedAddress = savedAddresses.find(a => a.id === addressId);
                // Заполняем скрытые поля формы
                fillOrderFormWithAddress(selectedAddress);
            });
        });
        
        if (useNewAddressBtn) {
            useNewAddressBtn.addEventListener('click', () => {
                savedAddressesSection.style.display = 'none';
                newAddressForm.style.display = 'block';
            });
        }
    } else {
        if (savedAddressesSection) savedAddressesSection.style.display = 'none';
        if (newAddressForm) newAddressForm.style.display = 'block';
    }
}

// Заполнение формы заказа адресом
function fillOrderFormWithAddress(address) {
    document.getElementById('orderAddressName').value = address.name || '';
    document.getElementById('orderAddressCity').value = address.city || '';
    document.getElementById('orderAddressStreet').value = address.street || '';
    document.getElementById('orderAddressEntrance').value = address.entrance || '';
    document.getElementById('orderAddressApartment').value = address.apartment || '';
    document.getElementById('orderAddressFloor').value = address.floor || '';
    document.getElementById('orderAddressIntercom').value = address.intercom || '';
    document.getElementById('orderAddressComment').value = address.comment || '';
}

// Загрузка истории заказов
function loadOrderHistory() {
    // Здесь можно загрузить с сервера
    const orders = []; // Заглушка
    
    if (orders.length === 0) {
        orderHistoryList.innerHTML = '<p class="no-orders">Заказов пока нет</p>';
    } else {
        orderHistoryList.innerHTML = orders.map(order => `
            <div class="order-history-item">
                <h4>Заказ #${order.id}</h4>
                <p>Дата: ${order.date}</p>
                <p>Сумма: ${order.total} ₽</p>
                <span class="order-status ${order.status}">${order.status === 'completed' ? 'Завершен' : 'Ожидает оплаты'}</span>
                ${order.status === 'pending' ? '<button class="pay-btn">Оплатить</button>' : ''}
            </div>
        `).join('');
    }
}

// Инициализация при загрузке
loadProducts();
loadProfile();
loadSavedAddresses();

// Экспорт функций для глобального доступа
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.changeProductQuantity = changeProductQuantity;
window.switchTab = switchTab;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;
