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
    // Прокрутить страницу в начало
    setTimeout(() => {
        const orderTab = document.getElementById('orderTab');
        if (orderTab) {
            orderTab.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, 100);
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
                tg.HapticFeedback.impactOccurred('light');
            });
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
            if (profileData.phone) phoneInput.value = profileData.phone;
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

// Отправка заказа
orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Сброс всех ошибок
    document.querySelectorAll('#orderForm .form-group input, #orderForm .form-group textarea, #orderForm .form-group select').forEach(field => {
        validateField(field, true);
    });
    const orderAddressError = document.getElementById('orderAddressError');
    if (orderAddressError) orderAddressError.style.display = 'none';
    
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
    
    if (!name) {
        validateField(document.getElementById('customerName'), false);
        if (!firstErrorField) firstErrorField = document.getElementById('customerName');
        hasErrors = true;
    }
    
    if (!phone) {
        validateField(document.getElementById('customerPhone'), false);
        if (!firstErrorField) firstErrorField = document.getElementById('customerPhone');
        hasErrors = true;
    }
    
    // Валидация email
    const emailField = document.getElementById('customerEmail');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        validateField(emailField, false);
        if (!firstErrorField) firstErrorField = emailField;
        hasErrors = true;
    }
    
    // Проверка получателя, если выбран "Другой получатель"
    const recipientRadio = document.querySelector('input[name="recipient"]:checked');
    if (recipientRadio && recipientRadio.value === 'other') {
        const recipientName = document.getElementById('recipientName').value.trim();
        const recipientPhone = document.getElementById('recipientPhone').value.trim();
        
        if (!recipientName) {
            validateField(document.getElementById('recipientName'), false);
            if (!firstErrorField) firstErrorField = document.getElementById('recipientName');
            hasErrors = true;
        }
        
        if (!recipientPhone) {
            validateField(document.getElementById('recipientPhone'), false);
            if (!firstErrorField) firstErrorField = document.getElementById('recipientPhone');
            hasErrors = true;
        }
    }
    
    // Проверка времени доставки
    if (!deliveryTime) {
        const deliveryTimeOptions = document.getElementById('deliveryTimeOptions');
        if (deliveryTimeOptions && !deliveryTimeOptions.querySelector('.no-time-slots')) {
            // Добавляем визуальную индикацию ошибки
            deliveryTimeOptions.classList.add('error');
            if (!firstErrorField) firstErrorField = deliveryTimeOptions;
            hasErrors = true;
        }
    }
    
    if (!deliveryDate) {
        validateField(document.getElementById('deliveryDate'), false);
        if (!firstErrorField) firstErrorField = document.getElementById('deliveryDate');
        hasErrors = true;
    }
    
    // Проверка выбранного адреса
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
        
        // Валидация обязательных полей
        if (!city || (city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб')) {
            validateField(document.getElementById('orderAddressCity'), false);
            const orderAddressError = document.getElementById('orderAddressError');
            if (orderAddressError) orderAddressError.style.display = 'block';
            hasAddressErrors = true;
        }
        if (!street) {
            validateField(document.getElementById('orderAddressStreet'), false);
            hasAddressErrors = true;
        }
        if (!house) {
            validateField(document.getElementById('orderAddressHouse'), false);
            hasAddressErrors = true;
        }
        
        // Валидация обязательных полей адреса
        if (!city || (city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб')) {
            validateField(document.getElementById('orderAddressCity'), false);
            const orderAddressError = document.getElementById('orderAddressError');
            if (orderAddressError) orderAddressError.style.display = 'block';
            if (!firstErrorField) firstErrorField = document.getElementById('orderAddressCity');
            hasAddressErrors = true;
            hasErrors = true;
        }
        if (!street) {
            validateField(document.getElementById('orderAddressStreet'), false);
            if (!firstErrorField) firstErrorField = document.getElementById('orderAddressStreet');
            hasAddressErrors = true;
            hasErrors = true;
        }
        if (!house) {
            validateField(document.getElementById('orderAddressHouse'), false);
            if (!firstErrorField) firstErrorField = document.getElementById('orderAddressHouse');
            hasAddressErrors = true;
            hasErrors = true;
        }
        
        if (hasAddressErrors) {
            // Прокрутка к первому полю с ошибкой адреса
            if (firstErrorField) {
                setTimeout(() => {
                    firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (firstErrorField.focus && typeof firstErrorField.focus === 'function') {
                        firstErrorField.focus();
                    }
                }, 100);
            }
            return;
        }
        
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
    
    // Если есть ошибки, прокрутить к первому полю с ошибкой
    if (hasErrors) {
        if (firstErrorField) {
            setTimeout(() => {
                firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (firstErrorField.focus && typeof firstErrorField.focus === 'function') {
                    firstErrorField.focus();
                }
            }, 100);
        }
        return;
    }
    
    // Если есть ошибки, прокрутить к первому полю с ошибкой
    if (hasErrors && firstErrorField) {
        setTimeout(() => {
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstErrorField.focus();
        }, 100);
        return;
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
    
    // Сброс всех ошибок
    document.querySelectorAll('.form-group input, .form-group textarea').forEach(field => {
        validateField(field, true);
    });
    addressError.style.display = 'none';
    
    let hasErrors = false;
    const city = addressCity.value.trim();
    const street = document.getElementById('addressStreet').value.trim();
    const name = document.getElementById('addressName').value.trim();
    const house = document.getElementById('addressHouse') ? document.getElementById('addressHouse').value.trim() : '';
    
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
    
    // Валидация дома
    const addressHouseField = document.getElementById('addressHouse');
    if (addressHouseField && !house) {
        validateField(addressHouseField, false);
        hasErrors = true;
    }
    
    if (hasErrors) return;
    
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
    if (profileData) {
        document.getElementById('editProfileName').value = profileData.name || '';
        document.getElementById('editProfilePhone').value = profileData.phone || '';
        document.getElementById('editProfileEmail').value = profileData.email || '';
    } else {
        // Заполнение из текущих значений или Telegram
        const nameInput = document.getElementById('customerName');
        const phoneInput = document.getElementById('customerPhone');
        const emailInput = document.getElementById('customerEmail');
        
        document.getElementById('editProfileName').value = nameInput ? nameInput.value : '';
        document.getElementById('editProfilePhone').value = phoneInput ? phoneInput.value : '';
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
});

closeProfileEditModal.addEventListener('click', () => {
    profileEditModal.style.display = 'none';
    tg.BackButton.hide();
});

profileEditForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const profileData = {
        name: document.getElementById('editProfileName').value,
        phone: document.getElementById('editProfilePhone').value,
        email: document.getElementById('editProfileEmail').value
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

// Инициализация при загрузке
loadProducts();
loadUserData(); // Загружаем все данные пользователя с сервера
loadProfile();
loadSavedAddresses();
loadActiveOrders();
initFilters(); // Инициализируем фильтры

// Экспорт функций для глобального доступа
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.changeProductQuantity = changeProductQuantity;
window.switchTab = switchTab;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;
