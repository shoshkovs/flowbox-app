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
    type: ['all'], // По умолчанию выбран "Все"
    color: [],
    feature: []
};
let productQuantities = {}; // Количество для каждого товара в карточке
let deliveryPrice = 500; // По умолчанию "В пределах КАД"
let serviceFee = 450;
let bonusUsed = 0;
let accumulatedBonuses = 500;
let savedAddresses = []; // Сохраненные адреса
let userActiveOrders = []; // Активные заказы
let userCompletedOrders = []; // Завершенные заказы
let selectedRecipientId = 'self'; // Выбранный получатель

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
const orderTab = document.getElementById('orderTab');
const backFromOrder = document.getElementById('backFromOrder');
const orderForm = document.getElementById('orderForm');
const successOverlay = document.getElementById('successOverlay');
const backToShop = document.getElementById('backToShop');

// Элементы профиля
const profileName = document.getElementById('profileName');
const profileInitial = document.getElementById('profileInitial');
const profileAvatarImg = document.getElementById('profileAvatarImg');
const profileAvatarFallback = document.getElementById('profileAvatarFallback');
const activeOrdersElement = document.getElementById('activeOrders');

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
        
        // Фильтр по цвету (только один выбор)
        if (activeFilters.color.length > 0) {
            const productColor = product.color || [];
            if (!activeFilters.color.some(c => productColor.includes(c))) return false;
        }
        
        // Фильтр по характеристикам (только один выбор)
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
            // Для маленьких фильтров (color, feature) - только один выбор среди всех маленьких фильтров
            if (btn.classList.contains('active')) {
                // Отмена фильтра
                btn.classList.remove('active');
                activeFilters.color = [];
                activeFilters.feature = [];
            } else {
                // Снимаем все активные маленькие фильтры (и color, и feature)
                document.querySelectorAll(`.filter-btn[data-category="color"], .filter-btn[data-category="feature"]`).forEach(b => {
                    b.classList.remove('active');
                });
                // Очищаем оба массива
                activeFilters.color = [];
                activeFilters.feature = [];
                // Активация нового фильтра
                btn.classList.add('active');
                activeFilters[category] = [filter];
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

// Получение ID пользователя Telegram
function getUserId() {
    return tg.initDataUnsafe?.user?.id || null;
}

// Сохранение всех данных пользователя на сервер
async function saveUserData() {
    const userId = getUserId();
    if (!userId) {
        // Если нет userId, сохраняем только локально
        localStorage.setItem('cart', JSON.stringify(cart));
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
        localStorage.setItem('userProfile', JSON.stringify(localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile')) : null));
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
        return;
    }
    
    try {
        const profileData = localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile')) : null;
        
        await fetch('/api/user-data', {
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
                completedOrders: userCompletedOrders,
                bonuses: accumulatedBonuses
            })
        });
        
        // Также сохраняем локально как резервную копию
        localStorage.setItem('cart', JSON.stringify(cart));
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
        if (profileData) {
            localStorage.setItem('userProfile', JSON.stringify(profileData));
        }
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
    } catch (error) {
        console.error('Ошибка сохранения данных на сервер:', error);
        // Сохраняем локально при ошибке
        localStorage.setItem('cart', JSON.stringify(cart));
        localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
    }
}

// Загрузка всех данных пользователя с сервера
async function loadUserData() {
    const userId = getUserId();
    
    if (userId) {
        try {
            const response = await fetch(`/api/user-data/${userId}`);
            const data = await response.json();
            
            if (data.cart) cart = data.cart;
            if (data.addresses) savedAddresses = data.addresses;
            if (data.profile) localStorage.setItem('userProfile', JSON.stringify(data.profile));
            if (data.activeOrders) userActiveOrders = data.activeOrders;
            if (data.completedOrders) userCompletedOrders = data.completedOrders;
            if (data.bonuses !== undefined) accumulatedBonuses = data.bonuses;
            
            // Обновляем UI
            updateCartUI();
            updateGoToCartButton();
            loadSavedAddresses();
            loadActiveOrders();
            loadProfile();
            
            return;
        } catch (error) {
            console.error('Ошибка загрузки данных с сервера:', error);
        }
    }
    
    // Если нет userId или ошибка, загружаем из localStorage
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            updateCartUI();
            updateGoToCartButton();
        } catch (e) {
            console.error('Ошибка загрузки корзины:', e);
            cart = [];
        }
    }
}

// Сохранение корзины (обновленная функция)
function saveCart() {
    saveUserData();
}

// Обновление UI корзины
function updateCartUI() {
    // Сохранение корзины
    saveCart();
    
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
                </div>
                    <div class="cart-item-new-controls">
                        <div class="cart-item-new-quantity">
                            <button class="quantity-btn-small ${item.quantity <= 1 ? 'disabled' : ''}" onclick="changeQuantity(${item.id}, -1)" ${item.quantity <= 1 ? 'disabled' : ''}>−</button>
                            <span class="quantity-value">${item.quantity}</span>
                            <button class="quantity-btn-small" onclick="changeQuantity(${item.id}, 1)">+</button>
                        </div>
                    <button class="cart-item-delete-btn" onclick="removeFromCart(${item.id})" title="Удалить">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
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
    
    if (finalTotalAmount) {
        finalTotalAmount.innerHTML = `${total} <span class="ruble-sign">₽</span>`;
    }
    
    // Обновление детализации
    const flowersTotalElement = document.getElementById('flowersTotalAmount');
    if (flowersTotalElement) {
        flowersTotalElement.textContent = `${flowersTotal} ₽`;
    }
    
    const deliveryTotalElement = document.getElementById('deliveryTotalAmount');
    if (deliveryTotalElement) {
        deliveryTotalElement.textContent = `${deliveryPrice} ₽`;
    }
    
    // Расчет бонусов
    const bonusToEarn = bonusUsed > 0 ? 0 : Math.floor(flowersTotal * 0.01);
    const bonusToEarnElement = document.getElementById('bonusToEarn');
    if (bonusToEarnElement) {
        bonusToEarnElement.textContent = bonusToEarn;
    }
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
    
    // Скрыть/показать навигацию и header
    const bottomNav = document.querySelector('.bottom-nav');
    const header = document.querySelector('.header');
    
    if (tabId === 'orderTab') {
        // Скрыть навигацию и header при открытии формы заказа
        if (bottomNav) bottomNav.style.display = 'none';
        if (header) header.style.display = 'none';
        // Инициализировать форму заказа
        initOrderForm();
        // Прокрутить страницу в начало (для Android)
        setTimeout(() => {
            const orderTab = document.getElementById('orderTab');
            if (orderTab) {
                // Для Android используем несколько методов прокрутки
                orderTab.scrollTop = 0;
                if (orderTab.scrollIntoView) {
                    orderTab.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
                // Прокрутка окна
                if (window.scrollTo) {
                    window.scrollTo(0, 0);
                }
                // Альтернативный метод для старых браузеров
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
            }
        }, 150);
    } else {
        // Показать навигацию и header для других вкладок
        if (bottomNav) bottomNav.style.display = 'flex';
        if (header) header.style.display = 'flex';
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
    switchTab('orderTab');
    // Прокрутка обрабатывается в switchTab для orderTab
});

// Инициализация формы заказа
function initOrderForm() {
    // Загрузка адресов
    loadSavedAddresses();
    
    // Инициализация радио-кнопок получателя
    const recipientRadios = document.querySelectorAll('input[name="recipient"]');
    const recipientFields = document.getElementById('recipientFields');
    
    if (recipientRadios.length > 0 && recipientFields) {
        // Функция обновления стилей выбранной опции
        function updateRecipientStyles() {
            recipientRadios.forEach(radio => {
                const radioOption = radio.closest('.radio-option');
                if (radio.checked && radioOption) {
                    radioOption.style.borderColor = 'var(--primary-color)';
                    radioOption.style.backgroundColor = '#fef5f8';
                } else if (radioOption) {
                    radioOption.style.borderColor = 'var(--border-color)';
                    radioOption.style.backgroundColor = 'white';
                }
            });
        }
        
        recipientRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                selectedRecipientId = radio.value;
                updateRecipientStyles();
                if (radio.value === 'other') {
                    recipientFields.style.display = 'block';
                } else {
                    recipientFields.style.display = 'none';
                    const recipientNameField = document.getElementById('recipientName');
                    const recipientPhoneField = document.getElementById('recipientPhone');
                    if (recipientNameField) recipientNameField.value = '';
                    if (recipientPhoneField) recipientPhoneField.value = '';
                }
            });
        });
        
        // Инициализация стилей при загрузке
        updateRecipientStyles();
    }
    
    // Инициализация списка адресов
    const addressOptionsList = document.getElementById('addressOptionsList');
    const newAddressForm = document.getElementById('newAddressForm');
    const newAddressRadio = document.getElementById('newAddressRadio');
    let selectedAddressId = null;
    
    // Функция для отображения списка адресов
    window.renderAddressOptions = function() {
        if (!addressOptionsList) return;
        
        addressOptionsList.innerHTML = '';
        
        // Добавляем сохраненные адреса как кнопки
        if (savedAddresses.length > 0) {
            savedAddresses.forEach((addr, index) => {
                const addressBtn = document.createElement('label');
                addressBtn.className = 'address-option-btn';
                if (index === 0) {
                    addressBtn.classList.add('selected');
                    selectedAddressId = addr.id;
                    fillOrderFormWithAddress(addr);
                    // Скрыть форму нового адреса, если выбран сохраненный
                    if (newAddressForm) newAddressForm.style.display = 'none';
                    if (newAddressRadio) newAddressRadio.checked = false;
                }
                // Формируем краткий адрес
                const shortAddress = `${addr.street}${addr.house ? ', д. ' + addr.house : ''}${addr.apartment ? ', ' + addr.apartment : ''}`;
                addressBtn.innerHTML = `
                    <input type="radio" name="selectedAddress" value="${addr.id}" class="radio-input" ${index === 0 ? 'checked' : ''}>
                    <span class="radio-label">
                        <span class="address-name-bold">${addr.name}</span>
                        <span class="address-separator"> - </span>
                        <span class="address-short">${shortAddress}</span>
                    </span>
                `;
                addressBtn.addEventListener('click', () => {
                    // Убрать выделение со всех кнопок
                    document.querySelectorAll('.address-option-btn').forEach(btn => btn.classList.remove('selected'));
                    // Добавить выделение к выбранной
                    addressBtn.classList.add('selected');
                    selectedAddressId = addr.id;
                    // Скрыть форму нового адреса
                    if (newAddressForm) newAddressForm.style.display = 'none';
                    if (newAddressRadio) newAddressRadio.checked = false;
                    // Заполнить форму выбранным адресом
                    fillOrderFormWithAddress(addr);
                });
                addressOptionsList.appendChild(addressBtn);
            });
        } else {
            // Если нет сохраненных адресов, показать форму нового адреса
            if (newAddressForm) newAddressForm.style.display = 'block';
            if (newAddressRadio) newAddressRadio.checked = true;
        }
    }
    
    // Инициализация списка адресов
    window.renderAddressOptions();
    
    // Обработка выбора "Новый адрес"
    if (newAddressRadio) {
        newAddressRadio.addEventListener('change', () => {
            if (newAddressRadio.checked) {
                // Убрать выделение со всех кнопок адресов
                document.querySelectorAll('.address-option-btn').forEach(btn => {
                    btn.classList.remove('selected');
                    const radio = btn.querySelector('input[type="radio"]');
                    if (radio) radio.checked = false;
                });
                selectedAddressId = null;
                // Показать форму нового адреса
                if (newAddressForm) newAddressForm.style.display = 'block';
                // Очистить все поля
                const fields = ['orderAddressCity', 'orderAddressStreet', 'orderAddressHouse', 
                               'orderAddressEntrance', 'orderAddressApartment', 'orderAddressFloor', 
                               'orderAddressIntercom', 'orderAddressComment'];
                fields.forEach(fieldId => {
                    const field = document.getElementById(fieldId);
                    if (field) {
                        field.value = '';
                        validateField(field, true); // Сбросить ошибки валидации
                    }
                });
                const orderAddressError = document.getElementById('orderAddressError');
                if (orderAddressError) orderAddressError.style.display = 'none';
            }
        });
    }
    
    // Установка минимальной даты (завтра)
    const deliveryDateInput = document.getElementById('deliveryDate');
    if (deliveryDateInput) {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deliveryDateInput.min = tomorrow.toISOString().split('T')[0];
        deliveryDateInput.value = tomorrow.toISOString().split('T')[0];
        
        // Функция обновления времени доставки
        function updateDeliveryTimeOptions() {
            const selectedDate = new Date(deliveryDateInput.value);
            const todayStr = today.toISOString().split('T')[0];
            const selectedDateStr = selectedDate.toISOString().split('T')[0];
            const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
            
            if (deliveryTimeOptions) {
                // Если выбрана сегодняшняя дата
                if (selectedDateStr === todayStr) {
                    deliveryTimeOptions.innerHTML = '<div class="no-time-slots">Нет свободных слотов</div>';
                } else {
                    // Показываем обычные слоты времени
                    deliveryTimeOptions.innerHTML = `
                        <button type="button" class="time-slot-btn" data-time="10-12">10:00 - 12:00</button>
                        <button type="button" class="time-slot-btn" data-time="12-14">12:00 - 14:00</button>
                        <button type="button" class="time-slot-btn" data-time="14-16">14:00 - 16:00</button>
                        <button type="button" class="time-slot-btn" data-time="16-18">16:00 - 18:00</button>
                        <button type="button" class="time-slot-btn" data-time="18-20">18:00 - 20:00</button>
                        <button type="button" class="time-slot-btn" data-time="20-22">20:00 - 22:00</button>
                    `;
                    
                    // Обработка выбора времени доставки
                    deliveryTimeOptions.querySelectorAll('.time-slot-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            deliveryTimeOptions.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            tg.HapticFeedback.impactOccurred('light');
                        });
                    });
                }
            }
        }
        
        // Инициализация времени доставки
        updateDeliveryTimeOptions();
        
        // Обработка изменения даты
        deliveryDateInput.addEventListener('change', () => {
            updateDeliveryTimeOptions();
        });
    }
    
    // Инициализация обработчиков времени доставки (если они уже есть в DOM)
    const existingTimeSlots = document.querySelectorAll('.time-slot-btn');
    if (existingTimeSlots.length > 0) {
        existingTimeSlots.forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Снимаем ошибку при выборе времени (в реальном времени)
                const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
                if (deliveryTimeOptions) {
                    // Убираем красную рамку со всех кнопок времени сразу
                    const timeSlotButtons = deliveryTimeOptions.querySelectorAll('.time-slot-btn');
                    timeSlotButtons.forEach(btn => {
                        btn.classList.remove('error-time-slot');
                    });
                }
                tg.HapticFeedback.impactOccurred('light');
            });
        });
    }
    
    // Добавление обработчиков для автоматического сброса ошибок при вводе
    const formFields = document.querySelectorAll('#orderForm input, #orderForm textarea, #orderForm select');
    formFields.forEach(field => {
        // Сброс ошибки при вводе
        field.addEventListener('input', function() {
            validateField(this, true);
        });
        
        // Сброс ошибки при изменении (для select и date)
        field.addEventListener('change', function() {
            validateField(this, true);
        });
        
        // Сброс ошибки при фокусе (когда пользователь начинает вводить)
        field.addEventListener('focus', function() {
            // Не сбрасываем сразу, только при вводе
        });
    });
    
    // Специальная проверка города при выходе из поля (blur)
    const cityField = document.getElementById('orderAddressCity');
    const orderAddressError = document.getElementById('orderAddressError');
    if (cityField && orderAddressError) {
        cityField.addEventListener('blur', function() {
            const city = this.value.trim();
            // Проверяем только после того, как пользователь вышел из поля
            if (city && city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб') {
                // Показываем ошибку, если город не СПб
                validateField(this, false);
                orderAddressError.style.display = 'block';
            } else if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
                // Убираем ошибку, если город правильный
                validateField(this, true);
                orderAddressError.style.display = 'none';
            } else if (!city) {
                // Если поле пустое - убираем сообщение об ошибке города (но поле может быть подсвечено красным как обязательное)
                orderAddressError.style.display = 'none';
            }
        });
        
        // При вводе убираем сообщение об ошибке города (но не убираем красную рамку, если поле пустое)
        cityField.addEventListener('input', function() {
            const city = this.value.trim();
            // Если пользователь начал вводить правильный город - убираем ошибку
            if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб' || city.toLowerCase().startsWith('санкт-петербург') || city.toLowerCase().startsWith('спб')) {
                orderAddressError.style.display = 'none';
                if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
                    validateField(this, true);
                }
            }
        });
    }
    
    // Обработчик для блока времени доставки (сброс ошибки при клике на любой слот в реальном времени)
    const deliveryTimeContainer = document.getElementById('deliveryTimeOptions');
    if (deliveryTimeContainer) {
        // Используем делегирование событий для обработки кликов на кнопки времени
        deliveryTimeContainer.addEventListener('click', function(e) {
            if (e.target.classList.contains('time-slot-btn')) {
                // Убираем красную рамку со всех кнопок времени
                const timeSlotButtons = this.querySelectorAll('.time-slot-btn');
                timeSlotButtons.forEach(btn => {
                    btn.classList.remove('error-time-slot');
                });
            }
        }, true); // Используем capture phase для более раннего срабатывания
    }
    
    // Красивое форматирование номера телефона в реальном времени
    function setupPhoneInput(phoneField) {
        if (!phoneField) return;
        
        // Проверяем, не добавлен ли уже обработчик
        if (phoneField.dataset.phoneFormatted === 'true') {
            // Если обработчик уже есть, удаляем его через клонирование
            const newField = phoneField.cloneNode(true);
            const savedValue = phoneField.value;
            phoneField.parentNode.replaceChild(newField, phoneField);
            newField.value = savedValue;
            phoneField = newField;
        }
        phoneField.dataset.phoneFormatted = 'true';
        
        phoneField.addEventListener('input', function(e) {
            let value = this.value;
            const cursorPosition = this.selectionStart;
            const oldLength = this.value.length;
            
            // Сохраняем количество цифр до курсора для правильного позиционирования
            const digitsBeforeCursor = value.substring(0, cursorPosition).replace(/\D/g, '').length;
            
            // Если начинается с 8, заменяем на +7
            if (value.startsWith('8')) {
                value = '+7' + value.substring(1);
            }
            // Если начинается с цифры (но не 8) и не +7, добавляем +7 в начало
            else if (value.length > 0 && value[0].match(/\d/) && !value.startsWith('+7') && !value.startsWith('8')) {
                value = '+7' + value;
            }
            
            // Удаляем все нецифровые символы для обработки
            let digits = value.replace(/\D/g, '');
            
            // Если начинается с 8, заменяем на 7
            if (digits.startsWith('8')) {
                digits = '7' + digits.substring(1);
            }
            
            // Если не начинается с 7, добавляем 7 в начало
            if (digits.length > 0 && !digits.startsWith('7')) {
                digits = '7' + digits;
            }
            
            // Ограничиваем до 11 цифр (7 + 10 цифр)
            if (digits.length > 11) {
                digits = digits.substring(0, 11);
            }
            
            // Форматируем номер
            let formattedValue = '';
            if (digits.length > 0) {
                formattedValue = '+7';
                if (digits.length > 1) {
                    formattedValue += ' (' + digits.substring(1, 4);
                }
                if (digits.length >= 5) {
                    formattedValue += ') ' + digits.substring(4, 7);
                }
                if (digits.length >= 8) {
                    formattedValue += '-' + digits.substring(7, 9);
                }
                if (digits.length >= 10) {
                    formattedValue += '-' + digits.substring(9, 11);
                }
            }
            
            // Всегда применяем форматирование для реального времени
            this.value = formattedValue;
            
            // Корректировка позиции курсора
            let newPosition = formattedValue.length;
            
            // Если курсор был не в конце, пытаемся сохранить позицию относительно цифр
            if (cursorPosition < oldLength && digitsBeforeCursor > 0) {
                // Находим позицию в новом отформатированном значении
                let digitCount = 0;
                for (let i = 0; i < formattedValue.length; i++) {
                    if (/\d/.test(formattedValue[i])) {
                        digitCount++;
                        if (digitCount === digitsBeforeCursor) {
                            newPosition = i + 1;
                            break;
                        }
                    }
                }
            }
            
            // Используем setTimeout для правильной установки курсора после обновления DOM
            setTimeout(() => {
                this.setSelectionRange(newPosition, newPosition);
            }, 0);
        });
        
        // При вставке (paste) тоже форматируем
        phoneField.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            let digits = pastedText.replace(/\D/g, '');
            
            // Если начинается с 8, заменяем на 7
            if (digits.startsWith('8')) {
                digits = '7' + digits.substring(1);
            }
            
            // Если не начинается с 7, добавляем 7 в начало
            if (digits.length > 0 && !digits.startsWith('7')) {
                digits = '7' + digits;
            }
            
            // Ограничиваем до 11 цифр
            if (digits.length > 11) {
                digits = digits.substring(0, 11);
            }
            
            // Форматируем и вставляем
            let formattedValue = '';
            if (digits.length > 0) {
                formattedValue = '+7';
                if (digits.length > 1) {
                    formattedValue += ' (' + digits.substring(1, 4);
                }
                if (digits.length >= 5) {
                    formattedValue += ') ' + digits.substring(4, 7);
                }
                if (digits.length >= 8) {
                    formattedValue += '-' + digits.substring(7, 9);
                }
                if (digits.length >= 10) {
                    formattedValue += '-' + digits.substring(9, 11);
                }
            }
            
            this.value = formattedValue;
            this.setSelectionRange(formattedValue.length, formattedValue.length);
        });
    }
    
    // Настройка полей телефона
    const customerPhoneField = document.getElementById('customerPhone');
    const recipientPhoneField = document.getElementById('recipientPhone');
    setupPhoneInput(customerPhoneField);
    setupPhoneInput(recipientPhoneField);
    
    // Автоматическое разбиение адреса на улицу и дом
    const streetField = document.getElementById('orderAddressStreet');
    const houseField = document.getElementById('orderAddressHouse');
    
    if (streetField && houseField) {
        streetField.addEventListener('blur', function() {
            const value = this.value.trim();
            if (value && !houseField.value.trim()) {
                // Паттерн: "Улица Номер" или "Улица НомерБуква" (например, "Корпусная 9" или "Невский проспект 35Б")
                // Ищем последнее число с возможной буквой в конце
                const match = value.match(/^(.+?)\s+(\d+[А-Яа-яA-Za-z]*)$/);
                if (match) {
                    const street = match[1].trim();
                    const house = match[2].trim();
                    
                    // Заполняем поля
                    this.value = street;
                    houseField.value = house;
                    
                    // Убираем ошибки валидации
                    validateField(this, true);
                    validateField(houseField, true);
                }
            }
        });
    }
    
    // Расчет суммы
    const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = flowersTotal + serviceFee + deliveryPrice - bonusUsed;
    
    const summaryTotal = document.getElementById('summaryTotal');
    if (summaryTotal) {
        summaryTotal.innerHTML = `${total} <span class="ruble-sign">₽</span>`;
    }
    
    // Заполнение данных пользователя из профиля или Telegram
    const savedProfile = localStorage.getItem('userProfile');
    let profileData = null;
    if (savedProfile) {
        try {
            profileData = JSON.parse(savedProfile);
        } catch (e) {
            console.error('Ошибка парсинга профиля:', e);
        }
    }
    
    const nameInput = document.getElementById('customerName');
    const phoneInput = document.getElementById('customerPhone');
    const emailInput = document.getElementById('customerEmail');
    
    if (nameInput && phoneInput && emailInput) {
        if (profileData) {
            if (profileData.name) nameInput.value = profileData.name;
            if (profileData.phone) {
                // Форматируем номер при загрузке в форму заказа
                let phoneDigits = profileData.phone.replace(/\D/g, '');
                if (phoneDigits.startsWith('8')) {
                    phoneDigits = '7' + phoneDigits.substring(1);
                }
                if (phoneDigits.length > 0 && !phoneDigits.startsWith('7')) {
                    phoneDigits = '7' + phoneDigits;
                }
                if (phoneDigits.length > 11) {
                    phoneDigits = phoneDigits.substring(0, 11);
                }
                
                let formattedPhone = '';
                if (phoneDigits.length > 0) {
                    formattedPhone = '+7';
                    if (phoneDigits.length > 1) {
                        formattedPhone += ' (' + phoneDigits.substring(1, 4);
                    }
                    if (phoneDigits.length >= 5) {
                        formattedPhone += ') ' + phoneDigits.substring(4, 7);
                    }
                    if (phoneDigits.length >= 8) {
                        formattedPhone += '-' + phoneDigits.substring(7, 9);
                    }
                    if (phoneDigits.length >= 10) {
                        formattedPhone += '-' + phoneDigits.substring(9, 11);
                    }
                }
                phoneInput.value = formattedPhone || profileData.phone;
            }
            if (profileData.email) emailInput.value = profileData.email;
        } else {
            // Заполнение из Telegram
            const user = tg.initDataUnsafe?.user;
            if (user) {
                if (user.first_name) {
                    const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
                    nameInput.value = fullName;
                }
            }
        }
    }
}

// Кнопка "Назад" в форме заказа
if (backFromOrder) {
    backFromOrder.addEventListener('click', () => {
        switchTab('cartTab');
    });
}

// Строгая валидация email по правилам
function validateEmail(email) {
    if (!email) return false;
    
    // 1. Перед проверкой: trim(), убрать невидимые символы, привести к нижнему регистру
    email = email.trim().replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
    
    if (!email) return false;
    
    // 2. Формат: должен быть один @, обе части не пустые, без пробелов внутри, домен содержит хотя бы одну точку
    const atCount = (email.match(/@/g) || []).length;
    if (atCount !== 1) return false;
    
    const parts = email.split('@');
    const localPart = parts[0];
    const domainPart = parts[1];
    
    if (!localPart || !domainPart) return false;
    if (email.includes(' ')) return false;
    if (!domainPart.includes('.')) return false;
    
    // 3. Local-part (до @): разрешены буквы, цифры, . _ - +
    // нельзя начинать/заканчивать точкой, нельзя ..
    const localPartRegex = /^[a-z0-9._+-]+$/;
    if (!localPartRegex.test(localPart)) return false;
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;
    
    // 4. Domain-part (после @): разрешены буквы/цифры/дефисы
    // сегменты между точками не начинаются и не заканчиваются -
    // доменная зона ≥ 2 символов, без ограничений по длине
    const domainSegments = domainPart.split('.');
    if (domainSegments.length < 2) return false;
    
    const domainSegmentRegex = /^[a-z0-9-]+$/;
    for (let i = 0; i < domainSegments.length; i++) {
        const segment = domainSegments[i];
        if (!segment) return false; // Пустой сегмент
        if (!domainSegmentRegex.test(segment)) return false;
        if (segment.startsWith('-') || segment.endsWith('-')) return false;
    }
    
    // Доменная зона (последний сегмент) должна быть ≥ 2 символов
    const tld = domainSegments[domainSegments.length - 1];
    if (tld.length < 2) return false;
    
    return true;
}

// Функция валидации и отправки заказа (вынесена отдельно для использования из разных обработчиков)
async function validateAndSubmitOrder(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Сброс всех ошибок
    document.querySelectorAll('#orderForm .form-group input, #orderForm .form-group textarea, #orderForm .form-group select').forEach(field => {
        validateField(field, true);
    });
    const orderAddressError = document.getElementById('orderAddressError');
    if (orderAddressError) orderAddressError.style.display = 'none';
    // Сброс ошибки времени доставки
    const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
    if (deliveryTimeOptions) {
        // Убираем красную рамку со всех кнопок времени
        const timeSlotButtons = deliveryTimeOptions.querySelectorAll('.time-slot-btn');
        timeSlotButtons.forEach(btn => {
            btn.classList.remove('error-time-slot');
        });
    }
    
    let hasErrors = false;
    let firstErrorField = null;
    
    // Проверка основных полей покупателя
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const email = document.getElementById('customerEmail').value.trim();
    const comment = document.getElementById('orderComment').value.trim();
    const deliveryDate = document.getElementById('deliveryDate').value;
    const selectedTimeSlot = document.querySelector('.time-slot-btn.active');
    const deliveryTime = selectedTimeSlot ? selectedTimeSlot.dataset.time : null;
    
    // Валидация имени (минимум 2 символа)
    const nameField = document.getElementById('customerName');
    const nameAnchor = document.getElementById('anchor-customerName');
    if (!name || name.length < 2) {
        validateField(nameField, false);
        if (!firstErrorField) firstErrorField = nameAnchor || nameField;
        hasErrors = true;
    }
    
    // Валидация телефона (минимум 10 цифр)
    const phoneField = document.getElementById('customerPhone');
    const phoneAnchor = document.getElementById('anchor-customerPhone');
    const phoneDigits = phone.replace(/\D/g, ''); // Убираем все нецифровые символы
    if (!phone || phoneDigits.length < 10) {
        validateField(phoneField, false);
        if (!firstErrorField) firstErrorField = phoneAnchor || phoneField;
        hasErrors = true;
    }
    
    // Валидация email (улучшенная: должна быть @ и точка, нельзя белеберду)
    const emailField = document.getElementById('customerEmail');
    const emailAnchor = document.getElementById('anchor-customerEmail');
    // Более строгая проверка: должна быть @, точка после @, и валидные символы
    // Используем строгую валидацию email
    if (!email) {
        // Пустое поле - ошибка
        validateField(emailField, false);
        if (!firstErrorField) firstErrorField = emailAnchor || emailField;
        hasErrors = true;
    } else if (!validateEmail(email)) {
        // Email заполнен, но невалидный
        validateField(emailField, false);
        if (!firstErrorField) firstErrorField = emailAnchor || emailField;
        hasErrors = true;
    } else {
        // Email валидный
        validateField(emailField, true);
    }
    
    // Проверка получателя, если выбран "Другой получатель"
    const recipientRadio = document.querySelector('input[name="recipient"]:checked');
    if (recipientRadio && recipientRadio.value === 'other') {
        const recipientNameField = document.getElementById('recipientName');
        const recipientNameAnchor = document.getElementById('anchor-recipientName');
        const recipientPhoneField = document.getElementById('recipientPhone');
        const recipientPhoneAnchor = document.getElementById('anchor-recipientPhone');
        const recipientName = recipientNameField ? recipientNameField.value.trim() : '';
        const recipientPhone = recipientPhoneField ? recipientPhoneField.value.trim() : '';
        
        // Валидация имени получателя (минимум 2 символа)
        if (recipientName && recipientName.length >= 2) {
            validateField(recipientNameField, true);
        } else {
            validateField(recipientNameField, false);
            if (!firstErrorField) firstErrorField = recipientNameAnchor || recipientNameField;
            hasErrors = true;
        }
        
        // Валидация телефона получателя (минимум 10 цифр)
        const recipientPhoneDigits = recipientPhone.replace(/\D/g, '');
        if (recipientPhone && recipientPhoneDigits.length >= 10) {
            validateField(recipientPhoneField, true);
        } else {
            validateField(recipientPhoneField, false);
            if (!firstErrorField) firstErrorField = recipientPhoneAnchor || recipientPhoneField;
            hasErrors = true;
        }
    }
    
    // Проверка выбранного адреса (ПЕРЕД проверкой времени доставки)
    const selectedAddressRadio = document.querySelector('input[name="selectedAddress"]:checked');
    const newAddressRadio = document.getElementById('newAddressRadio');
    let addressData = null;
    let hasAddressErrors = false;
    
    if (selectedAddressRadio) {
        // Выбран сохраненный адрес
        const addressId = parseInt(selectedAddressRadio.value);
        addressData = savedAddresses.find(a => a.id === addressId);
        if (!addressData) {
            alert('Выбранный адрес не найден');
            return;
        }
    } else if (newAddressRadio && newAddressRadio.checked) {
        // Проверка формы нового адреса
        const city = document.getElementById('orderAddressCity').value.trim();
        const street = document.getElementById('orderAddressStreet').value.trim();
        const house = document.getElementById('orderAddressHouse').value.trim();
        
        // Валидация обязательных полей адреса
        const cityField = document.getElementById('orderAddressCity');
        const cityAnchor = document.getElementById('anchor-orderAddressCity');
        const orderAddressError = document.getElementById('orderAddressError');
        
        if (!city) {
            // Если поле пустое - показываем только красную рамку, без сообщения об ошибке города
            validateField(cityField, false);
            if (orderAddressError) orderAddressError.style.display = 'none';
            if (!firstErrorField) firstErrorField = cityAnchor || cityField;
            hasAddressErrors = true;
            hasErrors = true;
        } else if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
            // Если город правильный - убираем ошибку
            validateField(cityField, true);
            if (orderAddressError) orderAddressError.style.display = 'none';
        } else {
            // Если город заполнен, но не СПб - показываем ошибку города
            validateField(cityField, false);
            if (orderAddressError) orderAddressError.style.display = 'block';
            if (!firstErrorField) firstErrorField = cityAnchor || cityField;
            hasAddressErrors = true;
            hasErrors = true;
        }
        const streetField = document.getElementById('orderAddressStreet');
        const streetAnchor = document.getElementById('anchor-orderAddressStreet');
        if (street) {
            validateField(streetField, true);
        } else {
            validateField(streetField, false);
            if (!firstErrorField) firstErrorField = streetAnchor || streetField;
            hasAddressErrors = true;
            hasErrors = true;
        }
        const houseField = document.getElementById('orderAddressHouse');
        const houseAnchor = document.getElementById('anchor-orderAddressHouse');
        if (house) {
            validateField(houseField, true);
        } else {
            validateField(houseField, false);
            if (!firstErrorField) firstErrorField = houseAnchor || houseField;
            hasAddressErrors = true;
            hasErrors = true;
        }
        
        // Не делаем return здесь - нужно проверить и время доставки тоже
        // Ошибки адреса уже установлены, продолжаем проверку других полей
        
        addressData = {
            name: 'Новый адрес',
            city: city,
            street: street,
            house: house,
            entrance: document.getElementById('orderAddressEntrance').value.trim(),
            apartment: document.getElementById('orderAddressApartment').value.trim(),
            floor: document.getElementById('orderAddressFloor').value.trim(),
            intercom: document.getElementById('orderAddressIntercom').value.trim(),
            comment: document.getElementById('orderAddressComment').value.trim()
        };
    } else {
        // Не выбран адрес
        const addressOptionsList = document.getElementById('addressOptionsList');
        if (addressOptionsList && !firstErrorField) {
            firstErrorField = addressOptionsList;
        }
        hasErrors = true;
    }
    
    // Проверка даты доставки (после проверки адреса)
    if (deliveryDate) {
        const deliveryDateField = document.getElementById('deliveryDate');
        validateField(deliveryDateField, true);
    } else {
        const deliveryDateField = document.getElementById('deliveryDate');
        const deliveryDateAnchor = document.getElementById('anchor-deliveryDate');
        validateField(deliveryDateField, false);
        if (!firstErrorField) firstErrorField = deliveryDateAnchor || deliveryDateField;
        hasErrors = true;
    }
    
    // Проверка времени доставки (после проверки адреса и даты)
    if (!deliveryTime) {
        const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
        const deliveryTimeAnchor = document.getElementById('anchor-deliveryTime');
        if (deliveryTimeOptions && !deliveryTimeOptions.querySelector('.no-time-slots')) {
            // Добавляем красную рамку на все кнопки времени доставки (без рамки на контейнере)
            const timeSlotButtons = deliveryTimeOptions.querySelectorAll('.time-slot-btn');
            timeSlotButtons.forEach(btn => {
                btn.classList.add('error-time-slot');
            });
            // Устанавливаем firstErrorField только если еще не установлено (адрес имеет приоритет для прокрутки)
            // Но время все равно подсвечивается красным независимо от того, заполнен адрес или нет
            if (!firstErrorField) firstErrorField = deliveryTimeAnchor || deliveryTimeOptions;
            hasErrors = true;
        }
    } else {
        // Если время выбрано - убираем ошибки с кнопок
        const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
        if (deliveryTimeOptions) {
            const timeSlotButtons = deliveryTimeOptions.querySelectorAll('.time-slot-btn');
            timeSlotButtons.forEach(btn => {
                btn.classList.remove('error-time-slot');
            });
        }
    }
    
    // Если есть ошибки, прокрутить к первому полю с ошибкой
    if (hasErrors) {
        // Для Android используем более простой и надежный метод
        if (firstErrorField) {
            // Немедленная прокрутка без задержки для Android
            try {
                const fieldId = firstErrorField.id || '';
                let anchorElement = firstErrorField;
                
                // Определяем якорь
                if (fieldId && fieldId.startsWith('anchor-')) {
                    anchorElement = firstErrorField;
                } else if (fieldId) {
                    // Пытаемся найти соответствующий якорь
                    const anchorId = 'anchor-' + fieldId.replace(/^(customer|recipient|orderAddress|delivery)/, '');
                    const foundAnchor = document.getElementById(anchorId);
                    if (foundAnchor) {
                        anchorElement = foundAnchor;
                    }
                }
                
                // Метод 1: Простая прокрутка через scrollIntoView (самый надежный для Android)
                if (anchorElement && anchorElement.scrollIntoView) {
                    anchorElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
                
                // Метод 2: Прокрутка через getBoundingClientRect (для Android)
                if (anchorElement) {
                    const rect = anchorElement.getBoundingClientRect();
                    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                    const targetScroll = currentScroll + rect.top - 150; // Отступ 150px сверху
                    
                    // Используем requestAnimationFrame для плавной прокрутки на Android
                    const scrollToPosition = () => {
                        window.scrollTo(0, Math.max(0, targetScroll));
                        document.documentElement.scrollTop = Math.max(0, targetScroll);
                        document.body.scrollTop = Math.max(0, targetScroll);
                    };
                    
                    if (window.requestAnimationFrame) {
                        requestAnimationFrame(scrollToPosition);
                    } else {
                        scrollToPosition();
                    }
                }
                
                // Метод 3: Фокус на поле ввода
                const inputField = anchorElement ? anchorElement.querySelector('input, textarea, select') : null;
                if (inputField && inputField.focus) {
                    setTimeout(() => {
                        try {
                            inputField.focus();
                            // Дополнительная прокрутка после фокуса
                            if (inputField.scrollIntoView) {
                                inputField.scrollIntoView({ behavior: 'auto', block: 'center' });
                            }
                        } catch (focusError) {
                            console.log('Не удалось установить фокус:', focusError);
                        }
                    }, 100);
                }
            } catch (scrollError) {
                console.error('Ошибка прокрутки:', scrollError);
                // Fallback: простая прокрутка
                try {
                    if (firstErrorField.scrollIntoView) {
                        firstErrorField.scrollIntoView();
                    }
                } catch (e) {
                    console.error('Критическая ошибка прокрутки:', e);
                }
            }
        }
        
        // Важно: возвращаем false для предотвращения отправки формы
        return false;
    }
    
    // Формирование строки адреса
    let addressString = '';
    if (addressData.city) {
        addressString = addressData.city;
    }
    if (addressData.street) {
        addressString += addressString ? ', ' + addressData.street : addressData.street;
    }
    if (addressData.house) {
        addressString += ', д. ' + addressData.house;
    }
    if (addressData.apartment) {
        addressString += ', ' + addressData.apartment;
    }
    if (addressData.entrance) {
        addressString += ', парадная ' + addressData.entrance;
    }
    if (addressData.floor) {
        addressString += ', этаж ' + addressData.floor;
    }
    if (addressData.intercom) {
        addressString += ', домофон ' + addressData.intercom;
    }
    
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
        recipientName: recipientName,
        recipientPhone: recipientPhone,
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
            
            // Сохранение заказа в активные
            const order = {
                id: result.orderId || Date.now(),
                date: new Date().toLocaleDateString('ru-RU'),
                items: orderData.items,
                total: orderData.total,
                address: orderData.address,
                deliveryDate: orderData.deliveryDate,
                deliveryTime: orderData.deliveryTime,
                status: 'active',
                createdAt: new Date().toISOString()
            };
            
            userActiveOrders.push(order);
            saveUserData(); // Сохраняем на сервер
            
            successOverlay.classList.add('active');
            // Скрыть форму заказа
            const orderTab = document.getElementById('orderTab');
            if (orderTab) orderTab.classList.remove('active');
            
            // Очистка корзины
            cart = [];
            saveCart(); // Сохраняем пустую корзину
            updateCartUI();
            orderForm.reset();
            
            // Обновление активных заказов
            loadActiveOrders();
            
            switchTab('menuTab');
            
            tg.HapticFeedback.notificationOccurred('success');
        }
    } catch (error) {
        console.error('Ошибка отправки заказа:', error);
        alert('Произошла ошибка при оформлении заказа. Попробуйте еще раз.');
    }
    
    return true;
}

// Отправка заказа - обработчик submit формы
if (orderForm) {
    orderForm.addEventListener('submit', async (e) => {
        await validateAndSubmitOrder(e);
    }, false);
}

// Дополнительный обработчик клика на кнопку для Android (более надежный)
const submitBtn = document.querySelector('.submit-order-btn');
if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await validateAndSubmitOrder(e);
    }, false);
}

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
    
    // Обновление бонусов внизу профиля
    if (profileBonusesAmount) {
        profileBonusesAmount.textContent = accumulatedBonuses;
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

const profileBonusesAmount = document.getElementById('profileBonusesAmount');

// Открытие модальных окон
addressesBtn.addEventListener('click', () => {
    editingAddressId = null;
    document.getElementById('addressModalTitle').textContent = 'Добавить адрес';
    document.getElementById('deleteAddressBtn').style.display = 'none';
    addressForm.reset();
    
    addressModal.style.display = 'flex';
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeAddressModal.click();
    });
    
    // Инициализация улучшений для формы адреса
    setTimeout(() => {
        initAddressFormValidation();
    }, 100);
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
    // Сворачиваем мини-апп и открываем команду /support в боте
    tg.close();
    // Отправляем команду в бота (если возможно)
    if (tg.initDataUnsafe?.user) {
        // Пытаемся открыть бота с командой
        window.open(`https://t.me/FlowboxBot?start=support`, '_blank');
    }
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

// Валидация поля
function validateField(field, isValid) {
    if (!field) return;
    
    if (isValid) {
        field.classList.remove('error');
        // Сбрасываем ошибку времени доставки, если это поле даты
        if (field.id === 'deliveryDate') {
            const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
            if (deliveryTimeOptions) {
            }
        }
        // Не меняем цвет заголовка - он всегда черный
    } else {
        field.classList.add('error');
        // Поле подсвечивается красным через CSS класс .error
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
    const addressHouseField = document.getElementById('addressHouse');
    if (addressHouseField) addressHouseField.value = address.house || '';
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
    
    // Инициализация улучшений для формы адреса
    setTimeout(() => {
        initAddressFormValidation();
    }, 100);
}

// Удаление адреса
function deleteAddress(addressId) {
    if (confirm('Вы уверены, что хотите удалить этот адрес?')) {
        savedAddresses = savedAddresses.filter(a => a.id !== addressId);
        saveUserData(); // Сохраняем на сервер
        loadSavedAddresses();
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Обработка формы адреса
addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Получаем все поля заново, чтобы убедиться, что они актуальны
    const addressNameField = document.getElementById('addressName');
    const addressCityField = document.getElementById('addressCity');
    const addressStreetField = document.getElementById('addressStreet');
    const addressHouseField = document.getElementById('addressHouse');
    const addressErrorElement = document.getElementById('addressError');
    
    // Сброс всех ошибок
    if (addressNameField) validateField(addressNameField, true);
    if (addressCityField) validateField(addressCityField, true);
    if (addressStreetField) validateField(addressStreetField, true);
    if (addressHouseField) validateField(addressHouseField, true);
    if (addressErrorElement) addressErrorElement.style.display = 'none';
    
    let hasErrors = false;
    let firstErrorField = null;
    
    const name = addressNameField ? addressNameField.value.trim() : '';
    const city = addressCityField ? addressCityField.value.trim() : '';
    const street = addressStreetField ? addressStreetField.value.trim() : '';
    const house = addressHouseField ? addressHouseField.value.trim() : '';
    
    // Валидация наименования
    if (!name) {
        if (addressNameField) {
            validateField(addressNameField, false);
            if (!firstErrorField) firstErrorField = addressNameField;
        }
        hasErrors = true;
    } else {
        if (addressNameField) validateField(addressNameField, true);
    }
    
    // Валидация города (улучшенная логика)
    if (!city) {
        // Если поле пустое - показываем только красную рамку, без сообщения об ошибке города
        if (addressCityField) {
            validateField(addressCityField, false);
            if (!firstErrorField) firstErrorField = addressCityField;
        }
        if (addressErrorElement) addressErrorElement.style.display = 'none';
        hasErrors = true;
    } else if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
        // Если город правильный - убираем ошибку
        if (addressCityField) validateField(addressCityField, true);
        if (addressErrorElement) addressErrorElement.style.display = 'none';
    } else {
        // Если город заполнен, но не СПб - показываем ошибку города
        if (addressCityField) {
            validateField(addressCityField, false);
            if (!firstErrorField) firstErrorField = addressCityField;
        }
        if (addressErrorElement) addressErrorElement.style.display = 'block';
        hasErrors = true;
    }
    
    // Валидация улицы
    if (!street) {
        if (addressStreetField) {
            validateField(addressStreetField, false);
            if (!firstErrorField) firstErrorField = addressStreetField;
        }
        hasErrors = true;
    } else {
        if (addressStreetField) validateField(addressStreetField, true);
    }
    
    // Валидация дома
    if (addressHouseField && !house) {
        validateField(addressHouseField, false);
        if (!firstErrorField) firstErrorField = addressHouseField;
        hasErrors = true;
    } else if (addressHouseField && house) {
        validateField(addressHouseField, true);
    }
    
    // Если есть ошибки, прокрутить к первому полю с ошибкой
    if (hasErrors && firstErrorField) {
        setTimeout(() => {
            try {
                if (firstErrorField.scrollIntoView) {
                    firstErrorField.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
                const rect = firstErrorField.getBoundingClientRect();
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                const targetScroll = currentScroll + rect.top - 150;
                
                const scrollToPosition = () => {
                    window.scrollTo(0, Math.max(0, targetScroll));
                    document.documentElement.scrollTop = Math.max(0, targetScroll);
                    document.body.scrollTop = Math.max(0, targetScroll);
                };
                
                if (window.requestAnimationFrame) {
                    requestAnimationFrame(scrollToPosition);
                } else {
                    scrollToPosition();
                }
                
                if (firstErrorField.focus && typeof firstErrorField.focus === 'function' && firstErrorField.tagName === 'INPUT') {
                    setTimeout(() => {
                        try {
                            firstErrorField.focus();
                            if (firstErrorField.scrollIntoView) {
                                firstErrorField.scrollIntoView({ behavior: 'auto', block: 'center' });
                            }
                        } catch (focusError) {
                            console.log('Не удалось установить фокус:', focusError);
                        }
                    }, 100);
                }
            } catch (scrollError) {
                console.error('Ошибка прокрутки:', scrollError);
                try {
                    if (firstErrorField.scrollIntoView) {
                        firstErrorField.scrollIntoView();
                    }
                } catch (e) {
                    console.error('Критическая ошибка прокрутки:', e);
                }
            }
        }, 200);
        return;
    }
    
    const address = {
        id: editingAddressId || Date.now(),
        name: name,
        city: city,
        street: street,
        house: house,
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
    
    saveUserData(); // Сохраняем на сервер
    
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
        saveUserData(); // Сохраняем на сервер
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

// Инициализация валидации формы адреса в профиле
function initAddressFormValidation() {
    // Проверка города при выходе из поля (blur)
    const addressCityField = document.getElementById('addressCity');
    const addressErrorElement = document.getElementById('addressError');
    
    if (addressCityField && addressErrorElement) {
        // Удаляем старые обработчики через клонирование (если есть)
        const hasListener = addressCityField.dataset.cityValidated === 'true';
        let actualCityField = addressCityField;
        
        if (hasListener) {
            const newField = addressCityField.cloneNode(true);
            const savedValue = addressCityField.value;
            addressCityField.parentNode.replaceChild(newField, addressCityField);
            newField.value = savedValue;
            actualCityField = newField;
        }
        actualCityField.dataset.cityValidated = 'true';
        
        // Проверка города при выходе из поля (blur)
        actualCityField.addEventListener('blur', function() {
            const city = this.value.trim();
            // Проверяем только после того, как пользователь вышел из поля
            if (city && city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб') {
                // Показываем ошибку, если город не СПб
                validateField(this, false);
                addressErrorElement.style.display = 'block';
            } else if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
                // Убираем ошибку, если город правильный
                validateField(this, true);
                addressErrorElement.style.display = 'none';
            } else if (!city) {
                // Если поле пустое - убираем сообщение об ошибке города (но поле может быть подсвечено красным как обязательное)
                addressErrorElement.style.display = 'none';
            }
        });
        
        // При вводе убираем сообщение об ошибке города
        actualCityField.addEventListener('input', function() {
            const city = this.value.trim();
            // Если пользователь начал вводить правильный город - убираем ошибку
            if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб' || city.toLowerCase().startsWith('санкт-петербург') || city.toLowerCase().startsWith('спб')) {
                addressErrorElement.style.display = 'none';
                if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
                    validateField(this, true);
                }
            }
        });
    }
    
    // Автоматический сброс ошибок для всех полей формы адреса
    const addressFormFields = document.querySelectorAll('#addressForm input, #addressForm textarea');
    addressFormFields.forEach(field => {
        if (field.id !== 'addressCity') {
            // Удаляем старые обработчики через проверку флага
            if (!field.dataset.addressFormatted) {
                field.dataset.addressFormatted = 'true';
                
                field.addEventListener('input', function() {
                    validateField(this, true);
                });
                
                field.addEventListener('change', function() {
                    validateField(this, true);
                });
            }
        }
    });
}

// Текущий редактируемый адрес
let editingAddressId = null;

// Загрузка сохраненных адресов
function loadSavedAddresses() {
    // Данные уже загружены в loadUserData, просто обновляем отображение
    // Если данные не загружены с сервера, загружаем из localStorage
    if (savedAddresses.length === 0) {
        const stored = localStorage.getItem('savedAddresses');
        if (stored) {
            savedAddresses = JSON.parse(stored);
        }
    }
    
    // Отображение в профиле
    const addressesList = document.getElementById('deliveryAddressesList');
    if (addressesList) {
        if (savedAddresses.length === 0) {
            addressesList.innerHTML = '<p class="no-addresses">Адреса не добавлены</p>';
        } else {
            addressesList.innerHTML = savedAddresses.map(addr => `
                <div class="address-item">
                    <div class="address-item-content">
                        <div class="address-item-name">${addr.name}</div>
                        <div class="address-item-details">${addr.street}${addr.apartment ? ', ' + addr.apartment : ''}</div>
                    </div>
                    <button class="address-edit-icon-btn" onclick="editAddress(${addr.id})" title="Изменить">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
            `).join('');
        }
    }
    
    // Обновление списка адресов в форме заказа
    if (typeof window.renderAddressOptions === 'function') {
        window.renderAddressOptions();
    }
}

// Заполнение формы заказа адресом
function fillOrderFormWithAddress(address) {
    const cityField = document.getElementById('orderAddressCity');
    const streetField = document.getElementById('orderAddressStreet');
    const houseField = document.getElementById('orderAddressHouse');
    const entranceField = document.getElementById('orderAddressEntrance');
    const apartmentField = document.getElementById('orderAddressApartment');
    const floorField = document.getElementById('orderAddressFloor');
    const intercomField = document.getElementById('orderAddressIntercom');
    const commentField = document.getElementById('orderAddressComment');
    
    if (cityField) cityField.value = address.city || '';
    if (streetField) streetField.value = address.street || '';
    if (houseField) houseField.value = address.house || '';
    if (entranceField) entranceField.value = address.entrance || '';
    if (apartmentField) apartmentField.value = address.apartment || '';
    if (floorField) floorField.value = address.floor || '';
    if (intercomField) intercomField.value = address.intercom || '';
    if (commentField) commentField.value = address.comment || '';
}

// Загрузка активных заказов
function loadActiveOrders() {
    // Данные уже загружены в loadUserData, просто обновляем отображение
    
    if (activeOrdersElement) {
        if (userActiveOrders.length === 0) {
            activeOrdersElement.innerHTML = '<p class="no-orders">У вас нет активных заказов</p>';
        } else {
            activeOrdersElement.innerHTML = userActiveOrders.map(order => `
                <div class="order-item">
                    <div class="order-item-header">
                        <h4>Заказ #${order.id}</h4>
                        <span class="order-status active">Активный</span>
                    </div>
                    <p class="order-date">Дата: ${order.date}</p>
                    <p class="order-address">Адрес: ${order.address}</p>
                    <p class="order-delivery">Доставка: ${order.deliveryDate} ${order.deliveryTime}</p>
                    <p class="order-total">Сумма: ${order.total} ₽</p>
                </div>
            `).join('');
        }
    }
}

// Загрузка истории заказов
function loadOrderHistory() {
    const allOrders = [...userActiveOrders, ...userCompletedOrders].sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    if (allOrders.length === 0) {
        orderHistoryList.innerHTML = '<p class="no-orders">Заказов пока нет</p>';
    } else {
        orderHistoryList.innerHTML = allOrders.map(order => `
            <div class="order-history-item">
                <div class="order-item-header">
                    <h4>Заказ #${order.id}</h4>
                    <span class="order-status ${order.status}">${order.status === 'completed' ? 'Завершен' : 'Активный'}</span>
                </div>
                <p>Дата: ${order.date}</p>
                <p>Сумма: ${order.total} ₽</p>
                ${order.status === 'active' ? '<button class="pay-btn">Оплатить</button>' : ''}
            </div>
        `).join('');
    }
}

// Редактирование профиля
const profileEditModal = document.getElementById('profileEditModal');
const profileEditForm = document.getElementById('profileEditForm');
const editProfileBtn = document.getElementById('editProfileBtn');
const closeProfileEditModal = document.getElementById('closeProfileEditModal');

editProfileBtn.addEventListener('click', () => {
    const savedProfile = localStorage.getItem('userProfile');
    let profileData = null;
    if (savedProfile) {
        try {
            profileData = JSON.parse(savedProfile);
        } catch (e) {
            console.error('Ошибка парсинга профиля:', e);
        }
    }
    
    // Заполнение формы
    const editProfilePhoneField = document.getElementById('editProfilePhone');
    if (profileData) {
        document.getElementById('editProfileName').value = profileData.name || '';
        // Форматируем номер телефона при загрузке
        if (profileData.phone) {
            let phoneDigits = profileData.phone.replace(/\D/g, '');
            if (phoneDigits.startsWith('8')) {
                phoneDigits = '7' + phoneDigits.substring(1);
            }
            if (phoneDigits.length > 0 && !phoneDigits.startsWith('7')) {
                phoneDigits = '7' + phoneDigits;
            }
            if (phoneDigits.length > 11) {
                phoneDigits = phoneDigits.substring(0, 11);
            }
            // Форматируем
            let formattedPhone = '';
            if (phoneDigits.length > 0) {
                formattedPhone = '+7';
                if (phoneDigits.length > 1) {
                    formattedPhone += ' (' + phoneDigits.substring(1, 4);
                }
                if (phoneDigits.length >= 5) {
                    formattedPhone += ') ' + phoneDigits.substring(4, 7);
                }
                if (phoneDigits.length >= 8) {
                    formattedPhone += '-' + phoneDigits.substring(7, 9);
                }
                if (phoneDigits.length >= 10) {
                    formattedPhone += '-' + phoneDigits.substring(9, 11);
                }
            }
            editProfilePhoneField.value = formattedPhone || profileData.phone;
        } else {
            editProfilePhoneField.value = '';
        }
        document.getElementById('editProfileEmail').value = profileData.email || '';
    } else {
        // Заполнение из текущих значений или Telegram
        const nameInput = document.getElementById('customerName');
        const phoneInput = document.getElementById('customerPhone');
        const emailInput = document.getElementById('customerEmail');
        
        document.getElementById('editProfileName').value = nameInput ? nameInput.value : '';
        editProfilePhoneField.value = phoneInput ? phoneInput.value : '';
        document.getElementById('editProfileEmail').value = emailInput ? emailInput.value : '';
        
        // Если нет в форме, берем из Telegram
        const user = tg.initDataUnsafe?.user;
        if (user && user.first_name) {
            const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            if (!document.getElementById('editProfileName').value) {
                document.getElementById('editProfileName').value = fullName;
            }
        }
    }
    
    profileEditModal.style.display = 'flex';
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        closeProfileEditModal.click();
    });
    
    // Настройка форматирования телефона для профиля
    if (editProfilePhoneField) {
        // Удаляем старый обработчик через клонирование (если есть)
        const hasListener = editProfilePhoneField.dataset.phoneFormatted === 'true';
        let actualField = editProfilePhoneField;
        
        if (hasListener) {
            const newField = editProfilePhoneField.cloneNode(true);
            const savedValue = editProfilePhoneField.value;
            editProfilePhoneField.parentNode.replaceChild(newField, editProfilePhoneField);
            newField.value = savedValue;
            actualField = newField;
        }
        
        // Добавляем обработчик форматирования
        setupPhoneInput(actualField);
        
        // Сохраняем ссылку на поле
        window.editProfilePhoneField = actualField;
        
        // Если в поле уже есть значение, триггерим событие input для применения форматирования
        if (actualField.value) {
            // Используем setTimeout, чтобы обработчик успел добавиться
            setTimeout(() => {
                actualField.dispatchEvent(new Event('input', { bubbles: true }));
            }, 10);
        }
    }
});

closeProfileEditModal.addEventListener('click', () => {
    profileEditModal.style.display = 'none';
    tg.BackButton.hide();
});

profileEditForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Валидация полей
    let hasErrors = false;
    const nameField = document.getElementById('editProfileName');
    const emailField = document.getElementById('editProfileEmail');
    
    // Валидация имени
    const name = nameField.value.trim();
    if (!name || name.length < 2) {
        validateField(nameField, false);
        hasErrors = true;
    } else {
        validateField(nameField, true);
    }
    
    // Валидация email
    const email = emailField.value.trim();
    if (!email) {
        validateField(emailField, false);
        hasErrors = true;
    } else if (!validateEmail(email)) {
        validateField(emailField, false);
        hasErrors = true;
    } else {
        validateField(emailField, true);
    }
    
    // Если есть ошибки, не сохраняем
    if (hasErrors) {
        // Прокрутка к первому полю с ошибкой
        const firstErrorField = nameField.classList.contains('error') ? nameField : emailField;
        setTimeout(() => {
            if (firstErrorField.scrollIntoView) {
                firstErrorField.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }, 100);
        return;
    }
    
    // Используем актуальное поле (может быть клонированным)
    const phoneField = window.editProfilePhoneField || document.getElementById('editProfilePhone');
    let phoneValue = phoneField ? phoneField.value : document.getElementById('editProfilePhone').value;
    
    // Форматируем номер перед сохранением, если он не отформатирован
    if (phoneValue) {
        let phoneDigits = phoneValue.replace(/\D/g, '');
        if (phoneDigits.startsWith('8')) {
            phoneDigits = '7' + phoneDigits.substring(1);
        }
        if (phoneDigits.length > 0 && !phoneDigits.startsWith('7')) {
            phoneDigits = '7' + phoneDigits;
        }
        if (phoneDigits.length > 11) {
            phoneDigits = phoneDigits.substring(0, 11);
        }
        
        let formattedPhone = '';
        if (phoneDigits.length > 0) {
            formattedPhone = '+7';
            if (phoneDigits.length > 1) {
                formattedPhone += ' (' + phoneDigits.substring(1, 4);
            }
            if (phoneDigits.length >= 5) {
                formattedPhone += ') ' + phoneDigits.substring(4, 7);
            }
            if (phoneDigits.length >= 8) {
                formattedPhone += '-' + phoneDigits.substring(7, 9);
            }
            if (phoneDigits.length >= 10) {
                formattedPhone += '-' + phoneDigits.substring(9, 11);
            }
        }
        phoneValue = formattedPhone || phoneValue;
    }
    
    // Нормализуем email перед сохранением (trim, lowercase)
    const normalizedEmail = email.trim().replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
    
    const profileData = {
        name: name,
        phone: phoneValue,
        email: normalizedEmail
    };
    
    localStorage.setItem('userProfile', JSON.stringify(profileData));
    saveUserData(); // Сохраняем на сервер
    
    // Обновление отображения
    profileName.textContent = profileData.name || 'Пользователь';
    
    profileEditModal.style.display = 'none';
    tg.BackButton.hide();
    tg.HapticFeedback.notificationOccurred('success');
});

// Инициализация фильтров
function initFilters() {
    // Активируем кнопку "Все" по умолчанию
    const allBtn = document.querySelector('.filter-btn[data-filter="all"][data-category="type"]');
    if (allBtn) {
        allBtn.classList.add('active');
    }
    applyFilters();
}

// Модальное окно объяснения сборов
const serviceFeeHelpModal = document.getElementById('serviceFeeHelpModal');
const serviceFeeHelpBtn = document.getElementById('serviceFeeHelpBtn');
const closeServiceFeeHelpModal = document.getElementById('closeServiceFeeHelpModal');

if (serviceFeeHelpBtn) {
    serviceFeeHelpBtn.addEventListener('click', () => {
        serviceFeeHelpModal.style.display = 'flex';
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            closeServiceFeeHelpModal.click();
        });
    });
}

if (closeServiceFeeHelpModal) {
    closeServiceFeeHelpModal.addEventListener('click', () => {
        serviceFeeHelpModal.style.display = 'none';
        tg.BackButton.hide();
    });
}

// Скрытие нижнего меню при открытии клавиатуры
function initKeyboardHandling() {
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    
    // Используем visualViewport API для отслеживания изменений размера viewport
    if (window.visualViewport) {
        let initialViewportHeight = window.visualViewport.height;
        
        window.visualViewport.addEventListener('resize', () => {
            const currentHeight = window.visualViewport.height;
            const heightDifference = initialViewportHeight - currentHeight;
            
            // Если высота уменьшилась более чем на 150px, считаем что клавиатура открыта
            if (heightDifference > 150) {
                bottomNav.classList.add('hidden');
            } else {
                bottomNav.classList.remove('hidden');
            }
        });
    }
    
    // Альтернативный метод: отслеживание focus/blur на полях ввода
    const inputFields = document.querySelectorAll('input, textarea, select');
    let activeInputs = 0;
    
    inputFields.forEach(field => {
        field.addEventListener('focus', () => {
            activeInputs++;
            bottomNav.classList.add('hidden');
        });
        
        field.addEventListener('blur', () => {
            activeInputs--;
            // Используем небольшую задержку, чтобы убедиться, что клавиатура закрылась
            setTimeout(() => {
                if (activeInputs === 0) {
                    bottomNav.classList.remove('hidden');
                }
            }, 300);
        });
    });
    
    // Отслеживание изменения размера окна (fallback для старых браузеров)
    let lastWindowHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        const heightDifference = lastWindowHeight - currentHeight;
        
        // Если высота уменьшилась более чем на 150px, считаем что клавиатура открыта
        if (heightDifference > 150) {
            bottomNav.classList.add('hidden');
        } else if (heightDifference < -50) {
            // Если высота увеличилась, клавиатура закрылась
            bottomNav.classList.remove('hidden');
        }
        
        lastWindowHeight = currentHeight;
    });
}

// Инициализация при загрузке
loadProducts();
loadUserData(); // Загружаем все данные пользователя с сервера
loadProfile();
loadSavedAddresses();
loadActiveOrders();
initFilters(); // Инициализируем фильтры
initKeyboardHandling(); // Инициализируем обработку клавиатуры

// Экспорт функций для глобального доступа
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.changeProductQuantity = changeProductQuantity;
window.switchTab = switchTab;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;
