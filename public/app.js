// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Состояние приложения
let products = [];
let cart = [];

// Элементы DOM
const productsContainer = document.getElementById('productsContainer');
const navCartCount = document.getElementById('navCartCount');
const cartItemsPage = document.getElementById('cartItemsPage');
const cartTotalPage = document.getElementById('cartTotalPage');
const checkoutBtnPage = document.getElementById('checkoutBtnPage');
const orderOverlay = document.getElementById('orderOverlay');
const closeOrder = document.getElementById('closeOrder');
const orderForm = document.getElementById('orderForm');
const successOverlay = document.getElementById('successOverlay');
const backToShop = document.getElementById('backToShop');

// Элементы профиля
const profileName = document.getElementById('profileName');
const profileUsername = document.getElementById('profileUsername');
const profileInitial = document.getElementById('profileInitial');

// Навигация
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Загрузка товаров
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        products = await response.json();
        renderProducts();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        productsContainer.innerHTML = '<div class="loading">Ошибка загрузки товаров</div>';
    }
}

// Отображение товаров
function renderProducts() {
    if (products.length === 0) {
        productsContainer.innerHTML = '<div class="loading">Товары не найдены</div>';
        return;
    }

    productsContainer.innerHTML = products.map(product => `
        <div class="product-card">
            <img src="${product.image}" alt="${product.name}" class="product-image">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-description">${product.description}</div>
                <div class="product-price">${product.price} ₽</div>
                <button class="add-to-cart-btn" onclick="addToCart(${product.id})">
                    В корзину
                </button>
            </div>
        </div>
    `).join('');
}

// Добавление в корзину
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            ...product,
            quantity: 1
        });
    }

    updateCartUI();
    tg.HapticFeedback.impactOccurred('light');
    
    // Переключение на вкладку корзины, если товар добавлен
    switchTab('cartTab');
}

// Удаление из корзины
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartUI();
    tg.HapticFeedback.impactOccurred('light');
}

// Изменение количества
function changeQuantity(productId, delta) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    item.quantity += delta;
    
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
        cartItemsPage.innerHTML = '<p class="empty-cart">Корзина пуста</p>';
        checkoutBtnPage.disabled = true;
        cartTotalPage.textContent = '0';
    } else {
        cartItemsPage.innerHTML = cart.map(item => `
            <div class="cart-item-page">
                <img src="${item.image}" alt="${item.name}" class="cart-item-page-image">
                <div class="cart-item-page-info">
                    <div class="cart-item-page-name">${item.name}</div>
                    <div class="cart-item-page-price">${item.price} ₽ × ${item.quantity}</div>
                    <div class="cart-item-page-controls">
                        <button class="quantity-btn" onclick="changeQuantity(${item.id}, -1)">−</button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="quantity-btn" onclick="changeQuantity(${item.id}, 1)">+</button>
                    </div>
                </div>
            </div>
        `).join('');
        checkoutBtnPage.disabled = false;
        
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotalPage.textContent = total;
    }
}

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
checkoutBtnPage.addEventListener('click', () => {
    orderOverlay.classList.add('active');
    
    // Заполнение формы
    const summaryItems = document.getElementById('summaryItems');
    const summaryTotal = document.getElementById('summaryTotal');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    summaryItems.textContent = totalItems;
    summaryTotal.textContent = total;
    
    // Заполнение данных пользователя из Telegram, если доступны
    const user = tg.initDataUnsafe?.user;
    if (user) {
        const nameInput = document.getElementById('customerName');
        const phoneInput = document.getElementById('customerPhone');
        
        if (user.first_name) {
            const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            nameInput.value = fullName;
        }
        
        if (user.phone) {
            phoneInput.value = user.phone;
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
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const orderData = {
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: total,
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
            // Отправка данных в бот
            tg.sendData(JSON.stringify(orderData));
            
            // Показ успешного сообщения
            orderOverlay.classList.remove('active');
            successOverlay.classList.add('active');
            tg.BackButton.hide();
            
            // Очистка корзины
            cart = [];
            updateCartUI();
            
            // Очистка формы
            orderForm.reset();
            
            // Переключение на вкладку меню
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
        
        // Username
        if (user.username) {
            profileUsername.textContent = '@' + user.username;
        } else {
            profileUsername.style.display = 'none';
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
