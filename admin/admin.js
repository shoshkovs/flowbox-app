// Конфигурация
const API_BASE = window.location.origin;
const ADMIN_PASSWORD = 'admin123'; // По умолчанию, можно изменить через переменную окружения

// Состояние
let authToken = localStorage.getItem('admin_token');
let currentPage = 'products';

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initEventListeners();
});

// Проверка авторизации
function checkAuth() {
    if (authToken) {
        showAdminPanel();
        loadPage(currentPage);
    } else {
        showLoginScreen();
    }
}

// Показать экран авторизации
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
}

// Показать админ-панель
function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
}

// Инициализация обработчиков событий
function initEventListeners() {
    // Авторизация
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Навигация
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            switchPage(page);
        });
    });

    // Товары
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('productForm').addEventListener('submit', handleProductSubmit);
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    // Заказы
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const status = e.target.dataset.status;
            loadOrders(status);
        });
    });
}

// Обработка авторизации
async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    if (password === ADMIN_PASSWORD) {
        authToken = password;
        localStorage.setItem('admin_token', authToken);
        errorDiv.style.display = 'none';
        showAdminPanel();
        loadPage(currentPage);
    } else {
        errorDiv.textContent = 'Неверный пароль';
        errorDiv.style.display = 'block';
    }
}

// Выход
function handleLogout() {
    authToken = null;
    localStorage.removeItem('admin_token');
    showLoginScreen();
}

// Переключение страниц
function switchPage(page) {
    currentPage = page;
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `${page}Page`);
    });
    
    loadPage(page);
}

// Загрузка страницы
function loadPage(page) {
    if (page === 'products') {
        loadProducts();
    } else if (page === 'orders') {
        loadOrders();
    }
}

// Загрузка товаров
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/products`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки товаров');
        }

        const products = await response.json();
        renderProducts(products);
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        document.getElementById('productsList').innerHTML = 
            '<div class="error-message">Ошибка загрузки товаров</div>';
    }
}

// Отображение товаров
function renderProducts(products) {
    const container = document.getElementById('productsList');
    
    if (products.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Товаров пока нет</div>';
        return;
    }

    container.innerHTML = products.map(product => `
        <div class="product-card">
            ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-image">` : ''}
            <div class="product-name">${product.name}</div>
            ${product.description ? `<div style="color: #666; font-size: 14px; margin-bottom: 10px;">${product.description}</div>` : ''}
            <div class="product-price">${product.price} ₽</div>
            <div style="font-size: 12px; color: #999; margin-bottom: 10px;">
                ${product.type ? `Тип: ${product.type}` : ''} 
                ${product.color ? ` | Цвет: ${product.color}` : ''}
            </div>
            <div class="product-actions">
                <button class="btn-secondary" onclick="editProduct(${product.id})">Редактировать</button>
                <button class="btn-danger" onclick="deleteProduct(${product.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

// Открыть модальное окно товара
function openProductModal(product = null) {
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');
    
    document.getElementById('modalTitle').textContent = product ? 'Редактировать товар' : 'Добавить товар';
    form.reset();
    
    if (product) {
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name || '';
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productPrice').value = product.price || '';
        document.getElementById('productImage').value = product.image_url || '';
        document.getElementById('productType').value = product.type || '';
        document.getElementById('productColor').value = product.color || '';
        document.getElementById('productFeatures').value = (product.features || []).join(', ');
        document.getElementById('productActive').checked = product.is_active !== false;
    } else {
        document.getElementById('productId').value = '';
        document.getElementById('productActive').checked = true;
    }
    
    modal.style.display = 'flex';
}

// Закрыть модальные окна
function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// Обработка сохранения товара
async function handleProductSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('productId').value;
    const productData = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDescription').value,
        price: parseInt(document.getElementById('productPrice').value),
        image_url: document.getElementById('productImage').value || null,
        type: document.getElementById('productType').value || null,
        color: document.getElementById('productColor').value || null,
        features: document.getElementById('productFeatures').value
            .split(',')
            .map(f => f.trim())
            .filter(f => f),
        is_active: document.getElementById('productActive').checked
    };

    try {
        const url = id 
            ? `${API_BASE}/api/admin/products/${id}`
            : `${API_BASE}/api/admin/products`;
        
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(productData)
        });

        if (!response.ok) {
            throw new Error('Ошибка сохранения товара');
        }

        closeModals();
        loadProducts();
    } catch (error) {
        console.error('Ошибка сохранения товара:', error);
        alert('Ошибка сохранения товара');
    }
}

// Редактировать товар
async function editProduct(id) {
    try {
        const response = await fetch(`${API_BASE}/api/admin/products`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки товаров');
        }

        const products = await response.json();
        const product = products.find(p => p.id === id);
        
        if (product) {
            openProductModal(product);
        }
    } catch (error) {
        console.error('Ошибка загрузки товара:', error);
        alert('Ошибка загрузки товара');
    }
}

// Удалить товар
async function deleteProduct(id) {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/products/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления товара');
        }

        loadProducts();
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        alert('Ошибка удаления товара');
    }
}

// Загрузка заказов
async function loadOrders(status = '') {
    try {
        const url = status 
            ? `${API_BASE}/api/admin/orders?status=${status}`
            : `${API_BASE}/api/admin/orders`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки заказов');
        }

        const orders = await response.json();
        renderOrders(orders);
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        document.getElementById('ordersList').innerHTML = 
            '<div class="error-message">Ошибка загрузки заказов</div>';
    }
}

// Отображение заказов
function renderOrders(orders) {
    const container = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Заказов пока нет</div>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const addressData = order.address_data || {};
        const items = order.items || [];
        
        return `
            <div class="order-card" onclick="showOrderDetails(${order.id})">
                <div class="order-header">
                    <div class="order-id">Заказ #${order.id}</div>
                    <div class="order-status ${order.status}">${getStatusText(order.status)}</div>
                </div>
                <div class="order-info">
                    <div class="order-info-item">
                        <strong>Клиент</strong>
                        ${order.customer_name || 'Не указано'}<br>
                        ${order.customer_phone || ''}<br>
                        ${order.customer_email || ''}
                    </div>
                    <div class="order-info-item">
                        <strong>Получатель</strong>
                        ${order.recipient_name || order.customer_name || 'Не указано'}<br>
                        ${order.recipient_phone || order.customer_phone || ''}
                    </div>
                    <div class="order-info-item">
                        <strong>Адрес</strong>
                        ${order.address_string || 'Не указан'}
                    </div>
                    <div class="order-info-item">
                        <strong>Доставка</strong>
                        ${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('ru-RU') : 'Не указана'}<br>
                        ${order.delivery_time || ''}
                    </div>
                </div>
                <div class="order-total">Итого: ${order.total} ₽</div>
            </div>
        `;
    }).join('');
}

// Получить текст статуса
function getStatusText(status) {
    const statuses = {
        'active': 'Активный',
        'completed': 'Завершен',
        'cancelled': 'Отменен'
    };
    return statuses[status] || status;
}

// Показать детали заказа
async function showOrderDetails(orderId) {
    try {
        const response = await fetch(`${API_BASE}/api/admin/orders/${orderId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки заказа');
        }

        const order = await response.json();
        renderOrderDetails(order);
        
        document.getElementById('orderModal').style.display = 'flex';
    } catch (error) {
        console.error('Ошибка загрузки заказа:', error);
        alert('Ошибка загрузки заказа');
    }
}

// Отображение деталей заказа
function renderOrderDetails(order) {
    const addressData = order.address_data || {};
    const items = order.items || [];
    
    document.getElementById('orderNumber').textContent = order.id;
    
    document.getElementById('orderDetails').innerHTML = `
        <div class="order-section">
            <h4>Информация о клиенте</h4>
            <div class="order-section-item">
                <strong>Имя:</strong> ${order.customer_name || 'Не указано'}
            </div>
            <div class="order-section-item">
                <strong>Телефон:</strong> ${order.customer_phone || 'Не указан'}
            </div>
            <div class="order-section-item">
                <strong>E-mail:</strong> ${order.customer_email || 'Не указан'}
            </div>
        </div>

        <div class="order-section">
            <h4>Получатель</h4>
            <div class="order-section-item">
                <strong>Имя:</strong> ${order.recipient_name || order.customer_name || 'Не указано'}
            </div>
            <div class="order-section-item">
                <strong>Телефон:</strong> ${order.recipient_phone || order.customer_phone || 'Не указан'}
            </div>
        </div>

        <div class="order-section">
            <h4>Адрес доставки</h4>
            <div class="order-section-item">
                <strong>Город:</strong> ${addressData.city || 'Не указан'}
            </div>
            <div class="order-section-item">
                <strong>Улица:</strong> ${addressData.street || 'Не указана'}
            </div>
            <div class="order-section-item">
                <strong>Дом:</strong> ${addressData.house || 'Не указан'}
            </div>
            ${addressData.entrance ? `<div class="order-section-item"><strong>Подъезд:</strong> ${addressData.entrance}</div>` : ''}
            ${addressData.apartment ? `<div class="order-section-item"><strong>Квартира/Офис:</strong> ${addressData.apartment}</div>` : ''}
            ${addressData.floor ? `<div class="order-section-item"><strong>Этаж:</strong> ${addressData.floor}</div>` : ''}
            ${addressData.intercom ? `<div class="order-section-item"><strong>Домофон:</strong> ${addressData.intercom}</div>` : ''}
            ${addressData.comment ? `<div class="order-section-item"><strong>Комментарий:</strong> ${addressData.comment}</div>` : ''}
        </div>

        <div class="order-section">
            <h4>Доставка</h4>
            <div class="order-section-item">
                <strong>Дата:</strong> ${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('ru-RU') : 'Не указана'}
            </div>
            <div class="order-section-item">
                <strong>Время:</strong> ${order.delivery_time || 'Не указано'}
            </div>
        </div>

        ${order.comment ? `
        <div class="order-section">
            <h4>Комментарий к заказу</h4>
            <div class="order-section-item">${order.comment}</div>
        </div>
        ` : ''}

        <div class="order-section">
            <h4>Состав заказа</h4>
            <ul class="order-items-list">
                ${items.map(item => `
                    <li>
                        <span>${item.name} × ${item.quantity}</span>
                        <span>${item.price * item.quantity} ₽</span>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="order-section">
            <h4>Стоимость</h4>
            <div class="order-section-item">
                <strong>Товары:</strong> ${order.flowers_total} ₽
            </div>
            <div class="order-section-item">
                <strong>Сервисный сбор:</strong> ${order.service_fee} ₽
            </div>
            <div class="order-section-item">
                <strong>Доставка:</strong> ${order.delivery_price} ₽
            </div>
            ${order.bonus_used > 0 ? `<div class="order-section-item"><strong>Использовано бонусов:</strong> ${order.bonus_used} ₽</div>` : ''}
            <div class="order-section-item" style="font-size: 18px; font-weight: 700; color: var(--primary-color); margin-top: 10px;">
                <strong>Итого:</strong> ${order.total} ₽
            </div>
        </div>

        <div class="order-section">
            <h4>Статус заказа</h4>
            <select id="orderStatusSelect" class="form-group" style="margin-top: 10px;">
                <option value="active" ${order.status === 'active' ? 'selected' : ''}>Активный</option>
                <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Завершен</option>
                <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
            </select>
            <button class="btn-primary" onclick="updateOrderStatus(${order.id})" style="margin-top: 10px;">Обновить статус</button>
        </div>
    `;
}

// Обновить статус заказа
async function updateOrderStatus(orderId) {
    const status = document.getElementById('orderStatusSelect').value;
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) {
            throw new Error('Ошибка обновления статуса');
        }

        alert('Статус обновлен');
        closeModals();
        loadOrders();
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        alert('Ошибка обновления статуса');
    }
}

// Закрытие модального окна при клике вне его
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModals();
    }
});

