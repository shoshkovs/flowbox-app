// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

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
            <div class="product-card">
                <div class="product-image-wrapper">
                    <img src="${product.image}" alt="${product.name}" class="product-image">
                    <div class="delivery-badge">Доставим Завтра</div>
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-price-row">
                        <div class="product-price">
                            ${product.price} <span class="ruble">₽</span>
                        </div>
                        <div class="product-quantity">
                            <button class="quantity-btn-small" onclick="changeProductQuantity(${product.id}, -1)" ${quantity <= 1 ? 'disabled' : ''}>−</button>
                            <span class="quantity-value">${quantity}</span>
                            <button class="quantity-btn-small" onclick="changeProductQuantity(${product.id}, 1)" ${quantity >= 500 ? 'disabled' : ''}>+</button>
                        </div>
                    </div>
                    <button class="add-to-cart-btn" onclick="addToCart(${product.id}, ${quantity})">
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
    
    // Обновляем только эту карточку
    const card = document.querySelector(`[onclick*="changeProductQuantity(${productId}"]`)?.closest('.product-card');
    if (card) {
        const quantityValue = card.querySelector('.quantity-value');
        const minusBtn = card.querySelector(`[onclick*="changeProductQuantity(${productId}, -1)"]`);
        const plusBtn = card.querySelector(`[onclick*="changeProductQuantity(${productId}, 1)"]`);
        const priceRow = card.querySelector('.product-price-row');
        const addBtn = card.querySelector('.add-to-cart-btn');
        
        if (quantityValue) quantityValue.textContent = newQty;
        if (minusBtn) minusBtn.disabled = newQty <= 1;
        if (plusBtn) plusBtn.disabled = newQty >= 500;
        if (addBtn) addBtn.setAttribute('onclick', `addToCart(${productId}, ${newQty})`);
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
        goToCartFixed.style.display = 'flex';
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
    const total = flowersTotal + serviceFee + deliveryPrice - bonusUsed;
    
    finalTotalAmount.textContent = total;
    
    // Расчет бонусов
    const bonusToEarn = bonusUsed > 0 ? 0 : Math.floor(flowersTotal * 0.01);
    document.getElementById('bonusToEarn').textContent = bonusToEarn;
}

// Обработка доставки
document.querySelectorAll('.delivery-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.delivery-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        deliveryPrice = parseInt(btn.dataset.price) || 0;
        calculateFinalTotal();
        tg.HapticFeedback.impactOccurred('light');
    });
});

// Обработка бонусов
const useBonusBtn = document.getElementById('useBonusBtn');
const bonusSlider = document.getElementById('bonusSlider');
const bonusAmount = document.getElementById('bonusAmount');

useBonusBtn.addEventListener('click', () => {
    if (useBonusBtn.classList.contains('active')) {
        useBonusBtn.classList.remove('active');
        bonusSlider.disabled = true;
        bonusSlider.value = 0;
        bonusUsed = 0;
        bonusAmount.textContent = '0';
    } else {
        useBonusBtn.classList.add('active');
        const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const maxBonus = Math.min(accumulatedBonuses, flowersTotal);
        bonusSlider.disabled = false;
        bonusSlider.max = maxBonus;
    }
    calculateFinalTotal();
    tg.HapticFeedback.impactOccurred('light');
});

bonusSlider.addEventListener('input', (e) => {
    bonusUsed = parseInt(e.target.value) || 0;
    bonusAmount.textContent = bonusUsed;
    calculateFinalTotal();
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
    
    const name = document.getElementById('customerName').value;
    const phone = document.getElementById('customerPhone').value;
    const address = document.getElementById('customerAddress').value;
    const comment = document.getElementById('orderComment').value;
    
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
        address: address,
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

// Инициализация при загрузке
loadProducts();
loadProfile();

// Экспорт функций для глобального доступа
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.changeProductQuantity = changeProductQuantity;
window.switchTab = switchTab;
