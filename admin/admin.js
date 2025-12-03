// Конфигурация
const API_BASE = window.location.origin;
const ADMIN_PASSWORD = 'admin123';

// Состояние
let authToken = localStorage.getItem('admin_token');
let currentPage = 'dashboard';

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initEventListeners();
    // Устанавливаем сегодняшнюю дату по умолчанию для фильтра доставки
    const today = new Date().toISOString().split('T')[0];
    const deliveryDateFilter = document.getElementById('filterDeliveryDate');
    if (deliveryDateFilter) {
        deliveryDateFilter.value = today;
    }
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
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (adminPanel) adminPanel.style.display = 'none';
}

// Показать админ-панель
function showAdminPanel() {
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'flex';
}

// Инициализация обработчиков событий
function initEventListeners() {
    // Авторизация
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Навигация по боковому меню
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) {
                switchPage(page);
            }
        });
    });

    // Товары
    const addProductBtn = document.getElementById('addProductBtn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => openProductModal());
    }

    // Фильтры товаров
    ['filterProductType', 'filterProductColor', 'filterProductStatus', 'filterPriceMin', 'filterPriceMax'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => loadProducts());
        }
    });

    // Склад
    const addStockMovementBtn = document.getElementById('addStockMovementBtn');
    if (addStockMovementBtn) {
        addStockMovementBtn.addEventListener('click', () => openStockMovementModal());
    }

    // Заказы
    const filterOrderStatus = document.getElementById('filterOrderStatus');
    if (filterOrderStatus) {
        filterOrderStatus.addEventListener('change', () => loadOrders());
    }

    // Доставка
    const filterDeliveryDate = document.getElementById('filterDeliveryDate');
    if (filterDeliveryDate) {
        filterDeliveryDate.addEventListener('change', () => loadDeliveries());
    }

    // Аналитика - переключение вкладок
    document.querySelectorAll('.analytics-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = tab.dataset.tab;
            switchAnalyticsTab(tabName);
        });
    });

    // Настройки
    const saveGeneralSettings = document.getElementById('saveGeneralSettings');
    if (saveGeneralSettings) {
        saveGeneralSettings.addEventListener('click', () => saveSettings());
    }
}

// Обработка авторизации
async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    if (password === ADMIN_PASSWORD) {
        authToken = password;
        localStorage.setItem('admin_token', authToken);
        if (errorDiv) errorDiv.style.display = 'none';
        showAdminPanel();
        loadPage(currentPage);
    } else {
        if (errorDiv) {
            errorDiv.textContent = 'Неверный пароль';
            errorDiv.style.display = 'block';
        }
    }
}

// Выход
function handleLogout() {
    authToken = null;
    localStorage.removeItem('admin_token');
    showLoginScreen();
}

// Переключение страниц
function switchPage(pageName) {
    currentPage = pageName;
    
    // Скрываем все страницы
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Показываем выбранную страницу
    const targetPage = document.getElementById(pageName + 'Page');
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Обновляем активный пункт меню
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });
    
    // Загружаем данные для страницы
    loadPage(pageName);
}

// Загрузка данных для страницы
function loadPage(pageName) {
    switch(pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadProducts();
            break;
        case 'warehouse':
            loadWarehouse();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'delivery':
            loadDeliveries();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'customers':
            loadCustomers();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// ==================== ДАШБОРД ====================

async function loadDashboard() {
    try {
        // Загружаем статистику
        const ordersRes = await fetch(`${API_BASE}/api/admin/orders?status=active&limit=10`);
        const orders = await ordersRes.json();
        
        // Обновляем статистику
        updateStat('statOrdersToday', orders.length || 0);
        
        // Загружаем последние заказы
        renderRecentOrders(orders.slice(0, 5));
        
        // Загружаем популярные товары
        const productsRes = await fetch(`${API_BASE}/api/admin/products`);
        const products = await productsRes.json();
        renderPopularProducts(products.slice(0, 5));
        
    } catch (error) {
        console.error('Ошибка загрузки дашборда:', error);
    }
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderRecentOrders(orders) {
    const container = document.getElementById('recentOrders');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<p>Нет заказов</p>';
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="recent-order-item">
            <div>Заказ #${order.id}</div>
            <div>${order.total} ₽</div>
        </div>
    `).join('');
}

function renderPopularProducts(products) {
    const container = document.getElementById('popularProducts');
    if (!container) return;
    
    if (products.length === 0) {
        container.innerHTML = '<p>Нет товаров</p>';
        return;
    }
    
    container.innerHTML = products.map(product => `
        <div class="popular-product-item">
            <div>${product.name}</div>
            <div>${product.price} ₽</div>
        </div>
    `).join('');
}

// ==================== ТОВАРЫ ====================

async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/products`);
        const products = await response.json();
        
        // Применяем фильтры
        let filtered = products;
        
        const typeFilter = document.getElementById('filterProductType')?.value;
        const colorFilter = document.getElementById('filterProductColor')?.value;
        const statusFilter = document.getElementById('filterProductStatus')?.value;
        const priceMin = document.getElementById('filterPriceMin')?.value;
        const priceMax = document.getElementById('filterPriceMax')?.value;
        
        if (typeFilter) {
            filtered = filtered.filter(p => p.type === typeFilter);
        }
        if (colorFilter) {
            filtered = filtered.filter(p => p.color === colorFilter);
        }
        if (statusFilter) {
            if (statusFilter === 'hidden') {
                filtered = filtered.filter(p => p.is_hidden);
            } else if (statusFilter === 'out_of_stock') {
                // Нужно будет проверить остатки на складе
            }
        }
        if (priceMin) {
            filtered = filtered.filter(p => p.price >= parseInt(priceMin));
        }
        if (priceMax) {
            filtered = filtered.filter(p => p.price <= parseInt(priceMax));
        }
        
        renderProductsTable(filtered);
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
    }
}

function renderProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Нет товаров</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => {
        const statusClass = product.is_hidden ? 'hidden' : 'active';
        const statusText = product.is_hidden ? 'Скрыт' : 'Активен';
        
        return `
            <tr>
                <td>${product.id}</td>
                <td><img src="${product.image_url || '/placeholder.jpg'}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover;"></td>
                <td>${product.name}</td>
                <td>${product.type || '-'}</td>
                <td>${product.color || '-'}</td>
                <td>${product.price} ₽</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon edit" onclick="editProduct(${product.id})">✏️</button>
                        <button class="btn-icon delete" onclick="deleteProduct(${product.id})">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openProductModal(productId = null) {
    // TODO: Реализовать модальное окно для товара
    alert('Модальное окно товара будет реализовано');
}

function editProduct(id) {
    openProductModal(id);
}

function deleteProduct(id) {
    if (confirm('Удалить товар?')) {
        // TODO: Реализовать удаление
        console.log('Удаление товара', id);
    }
}

// ==================== СКЛАД ====================

async function loadWarehouse() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/warehouse/stock`);
        const stock = await response.json();
        
        renderWarehouseTable(stock);
        
        // Обновляем статистику
        const totalValue = stock.reduce((sum, item) => sum + (item.quantity * (item.cost_price || 0)), 0);
        const lowStock = stock.filter(item => item.quantity < 10 && item.quantity > 0).length;
        const zeroStock = stock.filter(item => item.quantity === 0).length;
        
        updateStat('warehouseTotalValue', totalValue.toFixed(2) + ' ₽');
        updateStat('warehouseLowStock', lowStock);
        updateStat('warehouseZeroStock', zeroStock);
        
    } catch (error) {
        console.error('Ошибка загрузки склада:', error);
        // Если endpoint еще не реализован, показываем заглушку
        const tbody = document.getElementById('warehouseTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">API endpoint для склада еще не реализован</td></tr>';
        }
    }
}

function renderWarehouseTable(stock) {
    const tbody = document.getElementById('warehouseTableBody');
    if (!tbody) return;
    
    if (stock.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Нет данных</td></tr>';
        return;
    }
    
    tbody.innerHTML = stock.map(item => `
        <tr>
            <td>${item.id}</td>
            <td>${item.product_name || 'Товар #' + item.product_id}</td>
            <td>${item.quantity}</td>
            <td>${item.cost_price || '-'} ₽</td>
            <td>${item.last_restock_date ? new Date(item.last_restock_date).toLocaleDateString('ru-RU') : '-'}</td>
            <td>
                <button class="btn-icon" onclick="addStockMovement(${item.product_id})">➕</button>
            </td>
        </tr>
    `).join('');
}

function openStockMovementModal() {
    alert('Модальное окно добавления поставки будет реализовано');
}

function addStockMovement(productId) {
    openStockMovementModal();
}

// ==================== ЗАКАЗЫ ====================

async function loadOrders() {
    try {
        const statusFilter = document.getElementById('filterOrderStatus')?.value || '';
        const url = statusFilter 
            ? `${API_BASE}/api/admin/orders?status=${statusFilter}`
            : `${API_BASE}/api/admin/orders`;
        
        const response = await fetch(url);
        const orders = await response.json();
        
        renderOrdersTable(orders);
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
    }
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Нет заказов</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => {
        const statusText = getOrderStatusText(order.status);
        const statusClass = getOrderStatusClass(order.status);
        
        return `
            <tr>
                <td>${order.id}</td>
                <td>${new Date(order.created_at).toLocaleDateString('ru-RU')}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${order.customer_name || '-'}</td>
                <td>${order.recipient_name || '-'}</td>
                <td>${order.total} ₽</td>
                <td>${order.delivery_date || '-'} ${order.delivery_time || ''}</td>
                <td>
                    <button class="btn-icon" onclick="viewOrder(${order.id})">👁️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function getOrderStatusText(status) {
    const statusMap = {
        'new': 'Новый',
        'paid': 'Оплачен',
        'purchasing': 'Закупка',
        'assembling': 'Сборка',
        'delivering': 'Доставка',
        'delivered': 'Завершён',
        'cancelled': 'Отменён'
    };
    return statusMap[status] || status;
}

function getOrderStatusClass(status) {
    const classMap = {
        'new': 'active',
        'paid': 'active',
        'purchasing': 'active',
        'assembling': 'active',
        'delivering': 'active',
        'delivered': 'success',
        'cancelled': 'hidden'
    };
    return classMap[status] || '';
}

function viewOrder(id) {
    alert('Детали заказа будут показаны в модальном окне');
}

// ==================== ДОСТАВКА ====================

async function loadDeliveries() {
    try {
        const dateFilter = document.getElementById('filterDeliveryDate')?.value;
        const url = dateFilter 
            ? `${API_BASE}/api/admin/delivery?date=${dateFilter}`
            : `${API_BASE}/api/admin/delivery`;
        
        const response = await fetch(url);
        const deliveries = await response.json();
        
        renderDeliveries(deliveries);
    } catch (error) {
        console.error('Ошибка загрузки доставок:', error);
        const container = document.getElementById('deliveryList');
        if (container) {
            container.innerHTML = '<p>API endpoint для доставки еще не реализован</p>';
        }
    }
}

function renderDeliveries(deliveries) {
    const container = document.getElementById('deliveryList');
    if (!container) return;
    
    if (deliveries.length === 0) {
        container.innerHTML = '<p>Нет доставок на выбранную дату</p>';
        return;
    }
    
    container.innerHTML = deliveries.map(delivery => `
        <div class="delivery-card">
            <div class="delivery-time">${delivery.delivery_time || '-'}</div>
            <div class="delivery-info">
                <div><strong>${delivery.address || '-'}</strong></div>
                <div>${delivery.recipient_name || '-'} - ${delivery.recipient_phone || '-'}</div>
                <div>Заказ #${delivery.order_id}</div>
            </div>
            <div class="delivery-actions">
                <button class="btn-icon" onclick="callRecipient('${delivery.recipient_phone}')">☎️</button>
                <button class="btn-icon" onclick="openMap('${delivery.address}')">📍</button>
            </div>
        </div>
    `).join('');
}

function callRecipient(phone) {
    window.location.href = `tel:${phone}`;
}

function openMap(address) {
    const url = `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
}

// ==================== АНАЛИТИКА ====================

function switchAnalyticsTab(tabName) {
    document.querySelectorAll('.analytics-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
    document.querySelectorAll('.analytics-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetContent = document.getElementById('analytics' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (targetContent) {
        targetContent.classList.add('active');
    }
    
    loadAnalyticsTab(tabName);
}

function loadAnalytics() {
    switchAnalyticsTab('traffic');
}

function loadAnalyticsTab(tabName) {
    switch(tabName) {
        case 'traffic':
            loadTrafficAnalytics();
            break;
        case 'sales':
            loadSalesAnalytics();
            break;
        case 'warehouse-analytics':
            loadWarehouseAnalytics();
            break;
    }
}

async function loadTrafficAnalytics() {
    // TODO: Реализовать загрузку аналитики трафика
    console.log('Загрузка аналитики трафика');
}

async function loadSalesAnalytics() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/analytics/sales`);
        const data = await response.json();
        
        updateStat('salesToday', (data.today || 0) + ' ₽');
        updateStat('salesWeek', (data.week || 0) + ' ₽');
        updateStat('salesMonth', (data.month || 0) + ' ₽');
        updateStat('avgCheck', (data.avgCheck || 0) + ' ₽');
        
    } catch (error) {
        console.error('Ошибка загрузки аналитики продаж:', error);
    }
}

async function loadWarehouseAnalytics() {
    // TODO: Реализовать загрузку аналитики склада
    console.log('Загрузка аналитики склада');
}

// ==================== КЛИЕНТЫ ====================

async function loadCustomers() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/customers`);
        const customers = await response.json();
        
        renderCustomersTable(customers);
    } catch (error) {
        console.error('Ошибка загрузки клиентов:', error);
    }
}

function renderCustomersTable(customers) {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    
    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Нет клиентов</td></tr>';
        return;
    }
    
    tbody.innerHTML = customers.map(customer => `
        <tr>
            <td>${customer.telegram_id || '-'}</td>
            <td>${customer.first_name || ''} ${customer.last_name || ''}</td>
            <td>${customer.phone || '-'}</td>
            <td>${customer.orders_count || 0}</td>
            <td>${customer.total_spent || 0} ₽</td>
            <td>${customer.bonuses || 0}</td>
            <td>${customer.created_at ? new Date(customer.created_at).toLocaleDateString('ru-RU') : '-'}</td>
            <td>
                <button class="btn-icon" onclick="viewCustomer(${customer.id})">👁️</button>
            </td>
        </tr>
    `).join('');
}

function viewCustomer(id) {
    alert('Профиль клиента будет показан в модальном окне');
}

// ==================== НАСТРОЙКИ ====================

async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/settings`);
        const settings = await response.json();
        
        // Заполняем поля настроек
        const defaultCity = document.getElementById('settingDefaultCity');
        const minOrder = document.getElementById('settingMinOrder');
        const serviceFee = document.getElementById('settingServiceFee');
        
        if (defaultCity && settings.default_city) defaultCity.value = settings.default_city;
        if (minOrder && settings.min_order_amount) minOrder.value = settings.min_order_amount;
        if (serviceFee && settings.service_fee) serviceFee.value = settings.service_fee;
        
    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
    }
}

async function saveSettings() {
    const settings = {
        default_city: document.getElementById('settingDefaultCity')?.value,
        min_order_amount: document.getElementById('settingMinOrder')?.value,
        service_fee: document.getElementById('settingServiceFee')?.value
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            alert('Настройки сохранены');
        } else {
            alert('Ошибка сохранения настроек');
        }
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        alert('Ошибка сохранения настроек');
    }
}
