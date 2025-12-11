// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;

// Глобальные переменные состояния
let currentCheckoutStep = 1; // Текущий шаг оформления заказа
let isSimpleCheckout = false; // Флаг упрощенного оформления заказа
let isSimpleOrderInitialized = false; // Флаг инициализации упрощенного заказа (предотвращает дубликаты)
let summaryDateTimeInitialized = false; // Флаг инициализации календаря на странице "Итого"
let checkoutMode = null; // Режим оформления: 'full' | 'simple' | null
let checkoutScreen = 'cart'; // Текущий экран: 'cart' | 'steps' | 'summary' | 'editRecipient' | 'myAddresses' | 'editAddress' | 'addressesList'

// Данные оформления заказа (объявлено рано, чтобы избежать ошибок инициализации)
let checkoutData = {
    recipientName: '',
    recipientPhone: '',
    addressId: null,
    address: null,
    deliveryDate: null,
    deliveryTime: null,
    leaveAtDoor: false,
    orderComment: ''
};

// Определяем, нужно ли разворачивать мини-апп
// На десктопе (Telegram Desktop/Web) НЕ разворачиваем, оставляем встроенный режим
function shouldExpand() {
    if (!tg) {
        console.log('[shouldExpand] tg не найден, возвращаем false');
        return false;
    }
    
    const platform = (tg.platform || '').toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Определяем десктоп более строго
    const isDesktop = platform.includes('desktop') || 
                     platform.includes('web') ||
                     userAgent.includes('windows') ||
                     userAgent.includes('macintosh') ||
                     userAgent.includes('linux') ||
                     (window.innerWidth > 768 && window.innerHeight < 1200); // Широкий и невысокий = десктоп
    
    console.log('[shouldExpand] Platform:', platform, 'isDesktop:', isDesktop, 'viewport:', window.innerWidth, 'x', window.innerHeight);
    
    // НЕ разворачиваем на десктопе
    return !isDesktop;
}

// Включаем fullscreen режим только на мобильных устройствах
if (tg && shouldExpand() && typeof tg.expand === 'function') {
    console.log('[init] Вызываем tg.expand() при инициализации');
    tg.expand();
} else {
    console.log('[init] НЕ вызываем tg.expand() при инициализации - десктоп или метод недоступен');
}

// Функция выхода в корзину
function exitToCart() {
    checkoutMode = null;
    checkoutScreen = 'cart';
    currentCheckoutStep = 1;
    summaryDateTimeInitialized = false; // Сбрасываем флаг при выходе
    
    switchTab('cartTab');
    showBackButton(false);
}

// Функция показа/скрытия BackButton
function showBackButton(visible) {
    if (!tg || !tg.BackButton) return;
    if (visible) {
        tg.BackButton.show();
    } else {
        tg.BackButton.hide();
    }
}

// Централизованный обработчик BackButton
function handleBackButton() {
    console.log('[BackButton] 🔙 нажата, checkoutMode =', checkoutMode, 'checkoutScreen =', checkoutScreen, 'currentCheckoutStep =', currentCheckoutStep);
    
    // Проверяем видимость элементов перед выполнением действий
    const editRecipientTab = document.getElementById('editRecipientTab');
    const myAddressesTab = document.getElementById('myAddressesTab');
    const editAddressTab = document.getElementById('editAddressTab');
    const orderHistoryTab = document.getElementById('orderHistoryTab');
    const addToHomeScreenModal = document.getElementById('addToHomeScreenModal');
    const profileEditModal = document.getElementById('profileEditModal');
    const addressSelectModal = document.getElementById('addressSelectModal');
    const serviceFeeHelpModal = document.getElementById('serviceFeeHelpModal');
    
    // Модальное окно "Добавить на главный экран"
    if (addToHomeScreenModal && addToHomeScreenModal.style.display === 'flex') {
        console.log('[BackButton] Закрытие модального окна "Добавить на главный экран"');
        addToHomeScreenModal.style.display = 'none';
        unlockBodyScroll();
        showBackButton(false);
        return;
    }
    
    // Модальное окно редактирования профиля
    if (profileEditModal && profileEditModal.style.display === 'flex') {
        console.log('[BackButton] Закрытие модального окна редактирования профиля');
        const closeProfileEditModal = document.getElementById('closeProfileEditModal');
        if (closeProfileEditModal) {
            closeProfileEditModal.click();
        }
        return;
    }
    
    // Модальное окно выбора адреса
    if (addressSelectModal && addressSelectModal.style.display !== 'none') {
        console.log('[BackButton] Закрытие модального окна выбора адреса');
        const closeAddressModal = document.getElementById('closeAddressModal');
        if (closeAddressModal) {
            closeAddressModal.click();
        }
        return;
    }
    
    // Модальное окно помощи по сервисному сбору
    if (serviceFeeHelpModal && serviceFeeHelpModal.style.display === 'flex') {
        console.log('[BackButton] Закрытие модального окна помощи по сервисному сбору');
        const closeBtn = document.getElementById('closeServiceFeeHelpModal');
        if (closeBtn) {
            closeBtn.click();
        }
        return;
    }
    
    // История заказов
    if (orderHistoryTab && orderHistoryTab.classList.contains('active')) {
        console.log('[BackButton] Возврат из истории заказов в профиль');
        switchTab('profileTab');
        showBackButton(false);
        return;
    }
    
    // === УПРОЩЁННЫЙ ЧЕКАУТ ===
    if (checkoutMode === 'simple' || isSimpleCheckout) {
        console.log('[SimpleMenu] 📍 Обработка BackButton в упрощенном режиме, checkoutScreen:', checkoutScreen);
        
        switch (checkoutScreen) {
            case 'summary':
            case 'simpleSummary':
                // Шаг "Итого" — назад в корзину
                console.log('[SimpleMenu] 📍 Переход: возврат в корзину из summary');
                exitToCart();
                return;
                
            case 'editRecipient':
                // Из редактирования получателя — назад на "Итого"
                console.log('[SimpleMenu] 📍 Переход: возврат из editRecipient в summary');
                closeEditRecipientAndReturnToSummary();
                return;
                
            case 'addressesList':
                // Из списка адресов — назад на "Итого"
                console.log('[SimpleMenu] 📍 Переход: возврат из addressesList в summary');
                closeMyAddressesAndReturnToSummary();
                return;
                
            case 'editAddress':
                // Из формы редактирования адреса — назад к списку адресов
                console.log('[SimpleMenu] 📍 Переход: возврат из editAddress в addressesList');
                closeEditAddressAndReturnToAddressList();
                return;
                
            case 'steps':
                // Сюда вообще не должны попадать в упрощённом режиме,
                // но если вдруг — просто в корзину
                console.warn('[SimpleMenu] ⚠️ steps в simple-режиме, уходим в корзину');
                exitToCart();
                return;
                
            default:
                // На всякий случай – просто вернёмся в корзину
                console.warn('[SimpleMenu] ⚠️ Неизвестный checkoutScreen в упрощенном режиме:', checkoutScreen, '- возврат в корзину');
                exitToCart();
                return;
        }
    }
    
    // === ОБЫЧНЫЙ 4-ШАГОВЫЙ ЧЕКАУТ ===
    if (checkoutMode === 'full') {
        // Редактирование получателя
        if (editRecipientTab && editRecipientTab.style.display !== 'none') {
            console.log('[BackButton] Возврат из редактирования получателя');
            editRecipientTab.style.display = 'none';
            
            const orderPageHeader = document.querySelector('.order-page-header');
            if (orderPageHeader) {
                orderPageHeader.style.display = '';
            }
            
            checkoutScreen = 'steps';
            goToStep(4);
            return;
        }
        
        // Редактирование адреса
        if (editAddressTab && editAddressTab.style.display !== 'none') {
            console.log('[BackButton] Возврат из редактирования адреса');
            editAddressTab.style.display = 'none';
            checkoutScreen = 'myAddresses';
            openMyAddressesPage();
            return;
        }
        
        // Список адресов (myAddressesTab)
        if (myAddressesTab && myAddressesTab.style.display !== 'none') {
            console.log('[BackButton] Возврат из списка адресов');
            myAddressesTab.style.display = 'none';
            
            const orderPageHeader = document.querySelector('.order-page-header');
            if (orderPageHeader) {
                orderPageHeader.style.display = '';
            }
            
            checkoutScreen = 'steps';
            goToStep(4);
            return;
        }
        
        // Шаги оформления
        if (checkoutScreen === 'steps') {
            if (currentCheckoutStep === 1) {
                console.log('[BackButton] Возвращаемся в корзину с шага 1');
                exitToCart();
            } else if (currentCheckoutStep > 1) {
                console.log('[BackButton] переходим на шаг', currentCheckoutStep - 1);
                goToStep(currentCheckoutStep - 1);
            }
            return;
        }
    }
    
    // Обработка адресов в профиле
    const addressTab = document.getElementById('addressTab');
    if (addressTab && addressTab.style.display === 'block') {
        console.log('[BackButton] Возврат из адресов в профиль');
        switchTab('profileTab');
        showBackButton(false);
        return;
    }
    
    console.log('[BackButton] Не обработано, checkoutMode =', checkoutMode, 'checkoutScreen =', checkoutScreen);
}

if (tg) {
    tg.ready();
    
    // Инициализация BackButton один раз при старте
    if (tg.BackButton && typeof tg.BackButton.onClick === 'function') {
        console.log('[init] Telegram WebApp найден, устанавливаем централизованный обработчик BackButton');
        tg.BackButton.onClick(handleBackButton);
    } else {
        console.warn('[init] BackButton не поддерживается в этой версии Telegram WebApp');
    }
} else {
    console.warn('[init] Telegram WebApp (tg) не найден, BackButton работать не будет');
}

// После ready() снова пробуем expand() только на мобильных устройствах
if (tg && shouldExpand() && typeof tg.expand === 'function') {
    console.log('[init] Вызываем tg.expand() после ready()');
    tg.expand();
    // Устанавливаем viewportStableHeight для стабильного fullscreen
    if (typeof tg.viewportStableHeight !== 'undefined') {
        tg.viewportStableHeight = true;
    }
} else {
    console.log('[init] НЕ вызываем tg.expand() - десктоп или tg.expand недоступен');
}

// Дополнительная попытка через requestFullscreen только на мобильных устройствах
// Это может помочь, если Mini App открыт через Menu Button
if (tg && shouldExpand() && typeof tg.requestFullscreen === 'function') {
    try {
        tg.requestFullscreen();
    } catch (e) {
        // Игнорируем ошибки, если метод не поддерживается
    }
} else {
    console.log('[init] НЕ вызываем tg.requestFullscreen() - десктоп или метод недоступен');
}

// Также пробуем через событие viewportChanged только на мобильных устройствах
if (tg && typeof tg.onEvent === 'function') {
    tg.onEvent('viewportChanged', () => {
        console.log('[viewportChanged] Событие viewportChanged, shouldExpand:', shouldExpand());
        if (tg && shouldExpand() && typeof tg.expand === 'function') {
            tg.expand();
        }
    });
    
    // Обработчик закрытия мини-аппа
    tg.onEvent('close', () => {
        if (cart && cart.length > 0) {
            // Показываем предупреждение через alert (так как beforeunload не работает в Telegram WebApp)
            if (confirm('Изменения могут быть потеряны. Вы уверены, что хотите закрыть?')) {
                saveCartOnClose();
            } else {
                // Отменяем закрытие (если возможно)
                return false;
            }
        } else {
            saveCartOnClose();
        }
    });
}

// Сохранение корзины при закрытии мини-аппа
function saveCartOnClose() {
    // Сохраняем корзину в localStorage и на сервер
    try {
        saveCart();
        console.log('Корзина сохранена при закрытии мини-аппа');
    } catch (e) {
        console.error('Ошибка сохранения корзины при закрытии:', e);
        // В случае ошибки хотя бы сохраняем в localStorage
        try {
            saveCartToLocalStorage(cart);
        } catch (localError) {
            console.error('Ошибка сохранения в localStorage:', localError);
        }
    }
}

// Обработчик закрытия страницы
window.addEventListener('beforeunload', (e) => {
    saveCartOnClose();
    // Показываем предупреждение только если есть товары в корзине
    if (cart && cart.length > 0) {
        e.preventDefault();
        e.returnValue = 'Изменения могут быть потеряны. Вы уверены, что хотите закрыть?';
        return e.returnValue;
    }
});

// Обработчик скрытия страницы (для мобильных устройств)
window.addEventListener('pagehide', () => {
    saveCartOnClose();
});

// Обработчик изменения видимости (когда мини-апп сворачивается)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        saveCartOnClose();
    } else {
        // При возврате видимости проверяем, нужно ли восстановить состояние
        // Если был открыт overlay успеха, скрываем его и возвращаемся в меню
        const successOverlay = document.getElementById('successOverlay');
        if (successOverlay && successOverlay.classList.contains('active')) {
            console.log('[visibilitychange] Восстанавливаем состояние после возврата с платежной страницы');
            successOverlay.classList.remove('active');
            // Убеждаемся, что нижнее меню видно после закрытия overlay
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) {
                bottomNav.style.display = 'flex';
                bottomNav.classList.remove('hidden');
            }
            // Очищаем форму заказа
            checkoutData = {
                recipientName: '',
                recipientPhone: '',
                address: null,
                deliveryDate: '',
                deliveryTime: '',
                orderComment: '',
                leaveAtDoor: false
            };
            currentCheckoutStep = 1;
            
            // Скрываем все шаги checkout
            document.querySelectorAll('.checkout-step').forEach(s => {
                s.classList.remove('active');
                s.style.display = 'none';
            });
            
            // Скрываем вкладку оформления заказа
            const orderTab = document.getElementById('orderTab');
            if (orderTab) {
                orderTab.style.display = 'none';
            }
            
            // Показываем меню
            switchTab('menuTab');
            initNavigation();
            
            // Прокрутка в начало
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        }
    }
});

// Дополнительная попытка через событие загрузки только на мобильных устройствах
window.addEventListener('load', () => {
    console.log('[load] Событие load, shouldExpand:', shouldExpand());
    if (tg && shouldExpand() && typeof tg.expand === 'function') {
        console.log('[load] Вызываем tg.expand()');
        tg.expand();
    } else {
        console.log('[load] НЕ вызываем tg.expand() - десктоп или метод недоступен');
    }
});

// Попытка через DOMContentLoaded только на мобильных устройствах
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[DOMContentLoaded] Событие DOMContentLoaded, shouldExpand:', shouldExpand());
        if (tg && shouldExpand() && typeof tg.expand === 'function') {
            console.log('[DOMContentLoaded] Вызываем tg.expand()');
            tg.expand();
        } else {
            console.log('[DOMContentLoaded] НЕ вызываем tg.expand() - десктоп или метод недоступен');
        }
    });
} else {
    // Если DOM уже загружен
    console.log('[init] DOM уже загружен, shouldExpand:', shouldExpand());
    if (tg && shouldExpand() && typeof tg.expand === 'function') {
        console.log('[init] Вызываем tg.expand()');
        tg.expand();
    } else {
        console.log('[init] НЕ вызываем tg.expand() - десктоп или метод недоступен');
    }
}

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
let isProductsLoading = true; // Флаг загрузки товаров (изначально true для показа спиннера)
let cart = loadCart(); // Загружаем корзину из localStorage при старте
let filteredProducts = [];
let activeFilters = {
    type: ['all'], // По умолчанию выбран "Все"
    color: [],
    feature: []
};
let productQuantities = {}; // Количество для каждого товара в карточке
let isSubmittingOrder = false; // Флаг для предотвращения двойной отправки заказа

// Утилита для получения минимального количества товара
function getMinQty(product) {
    return (product.minStemQuantity && product.minStemQuantity > 0)
        ? product.minStemQuantity
        : (product.min_order_quantity && product.min_order_quantity > 0)
        ? product.min_order_quantity
        : (product.min_stem_quantity && product.min_stem_quantity > 0)
        ? product.min_stem_quantity
        : 1;
}

// Округление количества до ближайшего кратного minQty (вверх)
function roundUpToStep(quantity, step) {
    return Math.ceil(quantity / step) * step;
}

// Округление количества до ближайшего кратного minQty (вниз)
function roundDownToStep(quantity, step) {
    return Math.floor(quantity / step) * step;
}
let deliveryPrice = 500; // По умолчанию "В пределах КАД" (используется только на итоговой странице)
let serviceFee = 450;
// Глобальное хранилище адресов (единый источник правды)
let savedAddresses = [];

// Универсальный сеттер для адресов (единый источник правды)
function setSavedAddresses(addresses) {
    savedAddresses = Array.isArray(addresses) ? addresses.filter(addr => addr && addr.id && typeof addr.id === 'number' && addr.id > 0) : [];
    
    localStorage.setItem('savedAddresses', JSON.stringify(savedAddresses));
    
    console.log('[addresses] setSavedAddresses ids:', savedAddresses.map(a => a.id).join(', '));
    
    // ВСЕ места, где используются адреса - обновляем автоматически
    if (typeof renderProfileAddresses === 'function') {
        renderProfileAddresses();
    }
    if (typeof renderCheckoutAddresses === 'function') {
        renderCheckoutAddresses();
    }
    // Также вызываем старую функцию для обратной совместимости
    if (typeof loadSavedAddresses === 'function') {
        loadSavedAddresses();
    }
}

// Загружаем адреса из localStorage при старте (fallback)
(function() {
    try {
        const savedAddressesLocal = localStorage.getItem('savedAddresses');
        if (savedAddressesLocal) {
            const addresses = JSON.parse(savedAddressesLocal);
            setSavedAddresses(addresses);
            console.log('[init] 📦 Загружены адреса из localStorage при старте:', savedAddresses.length);
        } else {
            console.log('[init] 📦 localStorage пуст при старте');
        }
    } catch (e) {
        console.error('[init] ❌ Ошибка загрузки адресов из localStorage при старте:', e);
        setSavedAddresses([]);
    }
})();
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
let navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Фильтры
let filterButtons = []; // Будет обновляться после загрузки фильтров

// Навигация по полям по Enter без отправки формы
function setupEnterKeyNavigation(form) {
    if (!form) return;
    
    const focusable = Array.from(
        form.querySelectorAll('input, textarea, select')
    ).filter(el => !el.disabled && el.type !== 'hidden');
    
    focusable.forEach((field, index) => {
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Не отправляем форму по Enter
                e.preventDefault();
                
                const next = focusable[index + 1];
                if (next && typeof next.focus === 'function') {
                    next.focus();
                }
            }
        });
    });
}

// Загрузка фильтров
async function loadFilters() {
    try {
        // Загружаем категории
        const categoriesResponse = await fetch('/api/categories');
        const categories = await categoriesResponse.json();
        const categoryContainer = document.getElementById('categoryFilters');
        if (categoryContainer) {
            // Оставляем кнопку "Все"
            const allBtn = categoryContainer.querySelector('[data-filter="all"]');
            categoryContainer.innerHTML = '';
            if (allBtn) {
                categoryContainer.appendChild(allBtn);
            }
            // Добавляем категории (исключаем категорию "корзина")
            categories.forEach(category => {
                // Пропускаем категорию "корзина" - она не должна быть в фильтрах главного меню
                const categoryNameLower = category.name.toLowerCase();
                if (categoryNameLower === 'корзина' || categoryNameLower === 'cart') {
                    return;
                }
                
                const btn = document.createElement('button');
                btn.className = 'filter-btn filter-btn-large';
                btn.setAttribute('data-filter', category.name.toLowerCase().replace(/\s+/g, '-'));
                btn.setAttribute('data-category', 'type');
                btn.setAttribute('data-category-id', category.id);
                btn.textContent = category.name;
                categoryContainer.appendChild(btn);
            });
        }
        
        // Загружаем цвета
        const colorsResponse = await fetch('/api/colors');
        const colors = await colorsResponse.json();
        const colorContainer = document.getElementById('colorFilters');
        if (colorContainer) {
            colorContainer.innerHTML = '';
            colors.forEach(color => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn filter-btn-small';
                btn.setAttribute('data-filter', color.name.toLowerCase().replace(/\s+/g, '-'));
                btn.setAttribute('data-category', 'color');
                btn.setAttribute('data-color-id', color.id);
                btn.textContent = color.name;
                colorContainer.appendChild(btn);
            });
        }
        
        // Загружаем качества
        const qualitiesResponse = await fetch('/api/qualities');
        const qualities = await qualitiesResponse.json();
        const qualityContainer = document.getElementById('qualityFilters');
        if (qualityContainer) {
            qualityContainer.innerHTML = '';
            qualities.forEach(quality => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn filter-btn-small';
                btn.setAttribute('data-filter', quality.name.toLowerCase().replace(/\s+/g, '-'));
                btn.setAttribute('data-category', 'feature');
                btn.setAttribute('data-quality-id', quality.id);
                btn.textContent = quality.name;
                qualityContainer.appendChild(btn);
            });
        }
        
        // Обновляем список кнопок фильтров и привязываем обработчики
        filterButtons = document.querySelectorAll('.filter-btn');
        attachFilterHandlers();
        initFilters();
    } catch (error) {
        console.error('Ошибка загрузки фильтров:', error);
    }
}

// Загрузка товаров
async function loadProducts() {
    isProductsLoading = true;
    renderProducts(); // Показываем спиннер
    
    try {
        const response = await fetch('/api/products');
        const allProducts = await response.json();
        
        // Исключаем товары с категорией "корзина" из основного списка товаров
        // Эти товары должны отображаться только на вкладке корзины
        products = allProducts.filter(p => {
            const category = (p.category || p.type || '').toLowerCase();
            return category !== 'корзина' && category !== 'cart';
        });
        
        // Инициализация количества для каждого товара с учетом minStemQuantity
        products.forEach(p => {
            const minQty = getMinQty(p);
            productQuantities[p.id] = minQty;
        });
        filteredProducts = [...products];
        // Загружаем дополнительные товары из категории "корзина" для вкладки корзины
        loadAdditionalProducts();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        products = []; // Пустой массив при ошибке
        filteredProducts = [];
    } finally {
        isProductsLoading = false;
        renderProducts(); // Перерисовываем с результатами
    }
}

// Фильтрация товаров
function applyFilters() {
    filteredProducts = products.filter(product => {
        // Исключаем товары с категорией "корзина" из отображения в главном меню
        const productCategory = (product.category || product.type || '').toLowerCase();
        if (productCategory === 'корзина' || productCategory === 'cart') {
            return false;
        }
        
        // Фильтр по категории (типу)
        if (activeFilters.type.length > 0 && !activeFilters.type.includes('all')) {
            // Сравниваем по названию категории (приводим к нижнему регистру и заменяем пробелы на дефисы)
            const normalizedProductCategory = productCategory.replace(/\s+/g, '-');
            const filterCategory = activeFilters.type[0].toLowerCase().replace(/\s+/g, '-');
            if (normalizedProductCategory !== filterCategory) return false;
        }
        
        // Фильтр по цвету (только один выбор)
        if (activeFilters.color.length > 0) {
            // Сравниваем по названию цвета (приводим к нижнему регистру и заменяем пробелы на дефисы)
            const productColor = (product.color || '').toLowerCase().replace(/\s+/g, '-');
            const filterColor = activeFilters.color[0].toLowerCase().replace(/\s+/g, '-');
            if (productColor !== filterColor) return false;
        }
        
        // Фильтр по качествам (характеристикам) - только один выбор
        if (activeFilters.feature.length > 0) {
            const productFeatures = product.features || [];
            // Приводим к нижнему регистру и заменяем пробелы на дефисы для сравнения
            const normalizedProductFeatures = productFeatures.map(f => 
                (typeof f === 'string' ? f : '').toLowerCase().replace(/\s+/g, '-')
            );
            const filterFeature = activeFilters.feature[0].toLowerCase().replace(/\s+/g, '-');
            if (!normalizedProductFeatures.includes(filterFeature)) return false;
        }
        
        return true;
    });
    
    renderProducts();
}

// Привязка обработчиков к фильтрам
function attachFilterHandlers() {
    filterButtons.forEach(btn => {
        // Удаляем старые обработчики, если они есть
        btn.replaceWith(btn.cloneNode(true));
    });
    
    // Получаем обновленный список кнопок
    filterButtons = document.querySelectorAll('.filter-btn');
    
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
}

// Отображение товаров
function renderProducts() {
    // 1) Идёт загрузка – показываем только спиннер
    if (isProductsLoading) {
        productsContainer.classList.add('products-container-empty');
        productsContainer.innerHTML = `
            <div class="products-loader">
                <div class="spinner"></div>
            </div>
        `;
        return;
    }

    // 2) Загрузка закончилась, но товаров нет – показываем красивое пустое состояние
    if (!filteredProducts || filteredProducts.length === 0) {
        productsContainer.classList.add('products-container-empty');
        productsContainer.innerHTML = `
            <div class="products-empty">
                <div class="products-empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet">
                        <g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)" fill="#d95d83" stroke="none" opacity="0.6">
                            <path d="M2440 5064 c-472 -57 -825 -361 -941 -809 -19 -74 -23 -117 -23 -242 -1 -84 -1 -153 -2 -153 0 0 -34 11 -75 25 -306 105 -652 56 -936 -132 -77 -50 -219 -192 -273 -272 -63 -94 -128 -237 -157 -348 -21 -83 -26 -121 -27 -248 -1 -151 7 -207 44 -332 96 -316 350 -581 660 -687 41 -14 94 -30 118 -36 l42 -11 -39 -52 c-241 -321 -283 -742 -111 -1104 145 -305 411 -513 753 -589 99 -22 317 -22 417 1 287 65 518 221 672 455 27 41 51 76 52 78 2 1 19 -22 39 -51 127 -193 368 -359 612 -424 88 -23 119 -26 260 -26 141 0 172 3 258 26 111 30 255 95 348 157 151 102 305 293 375 465 66 161 77 221 78 410 0 153 -3 180 -27 268 -43 159 -126 318 -225 431 l-34 39 95 32 c549 187 847 772 676 1330 -17 55 -42 122 -56 150 -90 179 -245 347 -418 451 -70 42 -207 99 -288 119 -200 48 -467 30 -641 -45 -26 -11 -51 -20 -55 -20 -5 0 -11 49 -14 109 -9 147 -30 246 -81 373 -58 143 -136 257 -255 370 -194 185 -415 279 -686 291 -55 3 -116 3 -135 1z m248 -230 c266 -55 484 -220 604 -459 14 -27 38 -88 53 -135 26 -77 28 -99 29 -235 1 -130 -2 -162 -24 -242 -23 -89 -24 -93 -7 -128 22 -46 75 -71 118 -56 16 5 57 30 92 55 176 125 399 184 601 157 430 -58 746 -415 746 -846 0 -231 -87 -439 -252 -603 -151 -152 -335 -232 -570 -249 -84 -6 -96 -9 -120 -34 -22 -22 -28 -37 -28 -71 0 -51 14 -70 90 -125 341 -248 452 -702 263 -1077 -204 -405 -676 -576 -1098 -399 -201 85 -376 268 -455 478 -18 46 -40 91 -50 100 -42 38 -125 35 -154 -7 -9 -12 -27 -59 -42 -106 -69 -214 -228 -395 -438 -497 -331 -161 -730 -89 -978 174 -117 124 -182 241 -219 398 -18 74 -20 109 -16 223 5 152 19 215 75 335 47 101 114 193 199 271 l66 60 -19 30 -18 29 27 -24 c25 -23 28 -23 46 -7 25 23 32 64 16 102 -19 46 -51 64 -115 64 -320 0 -591 138 -755 384 -285 429 -130 1013 330 1236 129 63 194 80 333 87 189 10 336 -29 509 -133 81 -49 98 -56 129 -51 45 7 70 29 84 72 9 26 6 46 -14 111 -34 108 -46 183 -46 280 0 419 302 774 717 844 81 13 210 11 291 -6z"/>
                            <path d="M2430 3341 c-329 -72 -577 -300 -686 -631 -26 -79 -28 -97 -28 -250 -1 -193 10 -241 83 -395 198 -415 674 -615 1108 -466 354 122 590 438 609 816 23 426 -263 806 -691 920 -95 26 -293 29 -395 6z m355 -216 c115 -29 221 -90 310 -179 144 -142 207 -293 207 -491 0 -199 -63 -349 -207 -492 -68 -67 -99 -89 -176 -127 -122 -58 -231 -81 -352 -72 -283 20 -524 209 -615 483 -22 66 -26 97 -26 203 -1 104 3 138 22 200 80 257 299 448 562 490 71 11 199 4 275 -15z"/>
                        </g>
                    </svg>
                </div>
                <div class="products-empty-title">Похоже, у нас всё раскупили.</div>
                <div class="products-empty-subtitle">Мы сообщим вам, когда что-то появится.</div>
            </div>
        `;
        return;
    }
    
    // Убираем класс пустого состояния, если есть товары
    productsContainer.classList.remove('products-container-empty');

    // 3) Есть товары – рендерим их
    productsContainer.innerHTML = filteredProducts.map(product => {
        const minQty = getMinQty(product);
        const stemQuantity = product.min_stem_quantity || product.minStemQuantity || product.min_order_quantity || 1;
        // Используем сохраненное количество или minQty, округляем до кратного minQty
        const savedQty = productQuantities[product.id];
        const quantity = savedQty ? roundUpToStep(savedQty, minQty) : minQty;
        const totalPrice = product.price * quantity;
        const isMinQty = quantity <= minQty;
        
        // Проверяем, есть ли товар в корзине
        const cartItem = cart.find(item => item.id === product.id);
        const isInCart = !!cartItem;
        const cartQuantity = cartItem ? cartItem.quantity : 0;
        // Количество банчей = количество товара / мин заказ (сколько раз добавлен мин заказ)
        const bunchesCount = isInCart ? Math.floor(cartQuantity / minQty) : 0;
        
        return `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-image-wrapper">
                    <img src="${product.image}" alt="${product.name}" class="product-image">
                    ${isInCart && bunchesCount > 0 ? `
                        <div class="product-quantity-overlay">
                            <div class="product-quantity-overlay-text">${bunchesCount}</div>
                        </div>
                    ` : ''}
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    ${stemQuantity > 1 ? `<div class="product-stem-quantity">${stemQuantity} шт</div>` : ''}
                    <div class="product-action-row ${isInCart ? 'product-action-row-filled' : ''}">
                        ${isInCart ? `
                            <button class="product-minus-btn" onclick="changeCartQuantity(${product.id}, -1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                            <div class="product-price-filled">${totalPrice} <span class="ruble">₽</span></div>
                            <button class="product-plus-btn" onclick="changeCartQuantity(${product.id}, 1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                        ` : `
                            <button class="product-add-btn" onclick="addToCart(${product.id}, ${quantity})" id="add-btn-${product.id}">
                                <span class="product-price-semi-transparent">${totalPrice} <span class="ruble">₽</span></span>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="1.5">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Изменение количества товара в карточке
function changeProductQuantity(productId, delta) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const minQty = getMinQty(product);
    const currentQty = productQuantities[productId] || minQty;
    
    // Изменяем количество с шагом minQty
    let newQty;
    if (delta > 0) {
        // Увеличиваем: округляем вверх до следующего кратного minQty
        newQty = roundUpToStep(currentQty + delta, minQty);
    } else {
        // Уменьшаем: округляем вниз до предыдущего кратного minQty
        const decreasedQty = currentQty + delta; // delta отрицательный
        if (decreasedQty < minQty) {
            // Не позволяем уменьшить ниже минимума
            tg.HapticFeedback.notificationOccurred('error');
            return;
        }
        newQty = roundDownToStep(decreasedQty, minQty);
        // Если получилось меньше минимума, оставляем минимум
        if (newQty < minQty) {
            newQty = minQty;
        }
    }
    
    // Ограничиваем максимум 500
    newQty = Math.min(500, newQty);
    productQuantities[productId] = newQty;
    
    const newTotalPrice = product.price * newQty;
    const isMinQty = newQty <= minQty;
    
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
        if (minusBtn) {
            minusBtn.disabled = isMinQty;
            if (isMinQty) {
                minusBtn.classList.add('disabled');
            } else {
                minusBtn.classList.remove('disabled');
            }
        }
        if (plusBtn) plusBtn.disabled = newQty >= 500;
    }
    
    // Обновляем корзину, если товар уже в корзине
    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.quantity = newQty;
        updateCartUI();
        saveUserData(); // Сохраняем корзину на сервер
    }
    
    tg.HapticFeedback.impactOccurred('light');
}

// Добавление в корзину
function addToCart(productId, quantity = null) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const minQty = getMinQty(product);
    // Используем переданное quantity или минимальное количество
    const actualQty = quantity !== null ? Math.max(minQty, quantity) : minQty;

    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += actualQty;
    } else {
        cart.push({
            ...product,
            quantity: actualQty,
            minStemQuantity: product.minStemQuantity,
            min_order_quantity: product.min_order_quantity,
            min_stem_quantity: product.min_stem_quantity
        });
    }

    updateCartUI();
    updateGoToCartButton();
    saveUserData(); // Сохраняем корзину на сервер
    tg.HapticFeedback.impactOccurred('light');
    
    // Обновляем только эту карточку
    updateProductCard(productId);
}

// Изменение количества товара в корзине из карточки
function changeCartQuantity(productId, delta) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const minQty = getMinQty(product);
    const cartItem = cart.find(item => item.id === productId);

    if (!cartItem) {
        // Если товара нет в корзине, добавляем
        addToCart(productId, minQty);
        return;
    }

    // Изменяем количество на minQty (а не на 1)
    const newQty = cartItem.quantity + (delta * minQty);

    if (newQty < minQty) {
        // Удаляем из корзины, если количество меньше минимума
        cart = cart.filter(item => item.id !== productId);
        updateCartUI();
        updateGoToCartButton();
        saveUserData();
        updateProductCard(productId);
        tg.HapticFeedback.impactOccurred('light');
        return;
    }

    cartItem.quantity = newQty;
    updateCartUI();
    updateGoToCartButton();
    saveUserData();
    updateProductCard(productId);
    tg.HapticFeedback.impactOccurred('light');
}

// Обновление одной карточки товара
function updateProductCard(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const minQty = getMinQty(product);
    const cartItem = cart.find(item => item.id === productId);
    const isInCart = !!cartItem;
    const cartQuantity = cartItem ? cartItem.quantity : 0;
    // Количество банчей = количество товара / мин заказ (сколько раз добавлен мин заказ)
    const bunchesCount = isInCart ? Math.floor(cartQuantity / minQty) : 0;
    const totalPrice = product.price * (cartItem ? cartItem.quantity : minQty);
    
    const card = document.querySelector(`[data-product-id="${productId}"]`);
    if (!card) return;
    
    // Обновляем overlay с количеством банчей
    const imageWrapper = card.querySelector('.product-image-wrapper');
    if (imageWrapper) {
        let overlay = imageWrapper.querySelector('.product-quantity-overlay');
        if (isInCart && bunchesCount > 0) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'product-quantity-overlay';
                const overlayText = document.createElement('div');
                overlayText.className = 'product-quantity-overlay-text';
                overlay.appendChild(overlayText);
                imageWrapper.appendChild(overlay);
            }
            const overlayText = overlay.querySelector('.product-quantity-overlay-text');
            if (overlayText) {
                overlayText.textContent = bunchesCount;
            }
        } else {
            if (overlay) {
                overlay.remove();
            }
        }
    }
    
    // Обновляем кнопку действий
    const actionRow = card.querySelector('.product-action-row');
    if (actionRow) {
        if (isInCart) {
            actionRow.classList.add('product-action-row-filled');
            actionRow.innerHTML = `
                <button class="product-minus-btn" onclick="changeCartQuantity(${productId}, -1)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                <div class="product-price-filled">${totalPrice} <span class="ruble">₽</span></div>
                <button class="product-plus-btn" onclick="changeCartQuantity(${productId}, 1)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            `;
        } else {
            actionRow.classList.remove('product-action-row-filled');
            actionRow.innerHTML = `
                <button class="product-add-btn" onclick="addToCart(${productId}, ${minQty})" id="add-btn-${productId}">
                    <span class="product-price-semi-transparent">${totalPrice} <span class="ruble">₽</span></span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="3">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            `;
        }
    }
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
    saveUserData(); // Сохраняем корзину на сервер
    tg.HapticFeedback.impactOccurred('light');
}

// Изменение количества в корзине
function changeQuantity(productId, delta) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    const minQty = getMinQty(item);
    
    // Вычисляем текущее количество "банчей"
    const currentBunches = Math.floor(item.quantity / minQty);
    
    // Если количество = 1 банч и нажимаем минус - удаляем из корзины
    if (currentBunches === 1 && delta < 0) {
        removeFromCart(productId);
        return;
    }

    // Изменяем количество на minQty (а не на 1)
    const newQuantity = item.quantity + (delta * minQty);
    
    if (newQuantity < minQty) {
        // Если получилось меньше минимума, удаляем из корзины
        removeFromCart(productId);
        return;
    }

    // Ограничиваем максимум 500
    item.quantity = Math.min(500, newQuantity);

    updateCartUI();
    saveUserData(); // Сохраняем корзину на сервер
    tg.HapticFeedback.impactOccurred('light');
}

// Получение ID пользователя Telegram
function getUserId() {
    return tg.initDataUnsafe?.user?.id || null;
}

// Дедупликация адресов: нормализация ключа адреса
function normalizeAddressKey(addr) {
    if (!addr) return '';
    return [
        (addr.city || '').trim().toLowerCase(),
        (addr.street || '').trim().toLowerCase(),
        (addr.house || '').trim().toLowerCase(),
        (addr.apartment || '').trim().toLowerCase(),
        (addr.entrance || '').trim().toLowerCase(),
        (addr.floor || '').trim().toLowerCase(),
        (addr.intercom || '').trim().toLowerCase(),
    ].join('|');
}

// Дедупликация адресов: оставляем только уникальные по набору полей
function dedupeAddresses(addresses) {
    if (!addresses || !Array.isArray(addresses)) return [];
    
    const map = new Map();
    for (const addr of addresses) {
        // Пропускаем полностью пустые адреса
        if (!addr || (!addr.city && !addr.street && !addr.house)) {
            continue;
        }
        
        const key = normalizeAddressKey(addr);
        
        // Если такой адрес уже есть - оставляем тот, у которого есть ID (приоритет)
        if (!map.has(key)) {
            map.set(key, addr);
        } else {
            const existing = map.get(key);
            // Если новый адрес имеет ID, а старый нет - заменяем
            if (addr.id && !existing.id) {
                map.set(key, addr);
            }
        }
    }
    
    return Array.from(map.values());
}

// Получение ключа для сохранения корзины (с привязкой к user_id)
function getCartKey() {
    const userId = getUserId();
    return userId ? `flowbox_cart_${userId}` : 'flowbox_cart_anon';
}

// Загрузка корзины из localStorage
function loadCart() {
    try {
        const cartKey = getCartKey();
        const raw = localStorage.getItem(cartKey);
        if (!raw) {
            console.log('[cart] корзина не найдена в localStorage');
            return [];
        }
        const cart = JSON.parse(raw);
        console.log('[cart] загружена из localStorage:', cart);
        return Array.isArray(cart) ? cart : [];
    } catch (e) {
        console.error('[cart] ошибка парсинга корзины:', e);
        return [];
    }
}

// Сохранение корзины в localStorage
function saveCartToLocalStorage(cart) {
    try {
        const cartKey = getCartKey();
        localStorage.setItem(cartKey, JSON.stringify(cart));
        console.log('[cart] сохранена в localStorage:', cart);
    } catch (e) {
        console.error('[cart] ошибка сохранения в localStorage:', e);
    }
}

// Сохранение всех данных пользователя на сервер
async function saveUserData() {
    const userId = getUserId();
    if (!userId) {
        // Если нет userId, сохраняем только локально через единый сеттер
        saveCartToLocalStorage(cart);
        setSavedAddresses(savedAddresses); // Используем единый сеттер
        localStorage.setItem('userProfile', JSON.stringify(localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile')) : null));
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
        return;
    }
    
    try {
        const profileData = localStorage.getItem('userProfile') ? JSON.parse(localStorage.getItem('userProfile')) : null;
        
        // Фильтруем адреса - убираем адреса без ID перед отправкой
        // Адреса без ID могут создавать дубликаты
        // ДЕДУПЛИКАЦИЯ: удаляем дубликаты перед отправкой на сервер
        const deduplicatedAddresses = dedupeAddresses(savedAddresses);
        console.log(`[saveUserData] 📦 Адресов до дедупликации: ${savedAddresses.length}, после: ${deduplicatedAddresses.length}`);
        
        // Фильтруем только невалидные адреса и очищаем фейковые ID
        const addressesToSave = deduplicatedAddresses
            .filter(addr => {
                // Фильтруем только полностью пустые/невалидные адреса
                if (!addr || (!addr.city && !addr.street && !addr.house)) {
                    console.warn('[saveUserData] ⚠️ Пропущен невалидный адрес:', addr);
                    return false;
                }
                return true;
            })
            .map(addr => {
                const cleaned = { ...addr };
                // Если id фейковый или не число — не отправляем его, пусть бэк создаёт новый адрес
                // Также фильтруем слишком большие значения (Date.now() и т.п. - обычно > 10^12)
                // Реальные ID из БД будут максимум до 10^8
                if (!Number.isInteger(cleaned.id) || cleaned.id <= 0 || cleaned.id > 100000000) {
                    delete cleaned.id;
                }
                return cleaned;
            });
        
        const response = await fetch('/api/user-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                cart: cart,
                addresses: addressesToSave,
                profile: profileData,
                activeOrders: userActiveOrders,
                completedOrders: userCompletedOrders
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // 🔥 ВАЖНО: приводим фронт в соответствие с БД через единый сеттер
        if (Array.isArray(result.addresses)) {
            setSavedAddresses(result.addresses);
            console.log('[saveUserData] ✅ Адреса обновлены с сервера:', savedAddresses.length);
        } else if (result.addresses === undefined || result.addresses === null) {
            // Если сервер не вернул адреса, сохраняем то, что у нас локально
            // НЕ вызываем setSavedAddresses, чтобы не перезаписать пустым массивом
            console.log('[saveUserData] ⚠️ Сервер не вернул адреса, сохраняем локально');
        }
        
        // Также сохраняем остальные данные локально как резервную копию
        saveCartToLocalStorage(cart);
        if (profileData) {
            localStorage.setItem('userProfile', JSON.stringify(profileData));
        }
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
    } catch (error) {
        console.error('Ошибка сохранения данных на сервер:', error);
        // Сохраняем локально при ошибке через единый сеттер
        saveCartToLocalStorage(cart);
        setSavedAddresses(savedAddresses); // Используем единый сеттер
        localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
        localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
    }
}

// Загрузка всех данных пользователя с сервера
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
                    username: telegramUser.username,
                    phone_number: telegramUser.phone_number || null // Номер телефона из Telegram (если доступен)
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
            
            // Загружаем данные с сервера, если они есть
            // Используем корзину с сервера только если локальная корзина пуста
            // Иначе используем локальную (более актуальную)
            if (data.cart && Array.isArray(data.cart) && cart.length === 0) {
                cart = data.cart;
                saveCartToLocalStorage(cart); // Сохраняем загруженную корзину в localStorage
                // Обновляем карточки товаров после загрузки корзины
                setTimeout(() => {
                    cart.forEach(item => {
                        updateProductCard(item.id);
                    });
                }, 100);
            }
            // Загружаем адреса с сервера через единый сеттер
            const addressesFromServer = data.addresses && Array.isArray(data.addresses) ? data.addresses : [];
            setSavedAddresses(addressesFromServer);
            console.log('[loadUserData] адресов:', savedAddresses.length);
            if (data.profile) {
                localStorage.setItem('userProfile', JSON.stringify(data.profile));
                // Восстанавливаем телефон получателя из профиля
                if (data.profile.phone) {
                    checkoutData.recipientPhone = data.profile.phone;
                }
                // Имя получателя НЕ берем из профиля - оно хранится отдельно в localStorage
                // Восстанавливаем имя получателя из localStorage (если было сохранено)
                const savedRecipientName = localStorage.getItem('flowbox_recipient_name');
                if (savedRecipientName) {
                    checkoutData.recipientName = savedRecipientName;
                }
            }
            if (data.activeOrders && Array.isArray(data.activeOrders)) {
                console.log('[loadUserData] 📥 Загружено активных заказов с сервера:', data.activeOrders.length);
                console.log('[loadUserData] Статусы заказов:', data.activeOrders.map(o => `${o.id}:${o.status}`).join(', '));
                // Фильтруем только активные статусы: NEW, PROCESSING, PURCHASE, COLLECTING, DELIVERING, UNPAID
                // Исключаем CANCELED и COMPLETED - они должны быть в истории
                userActiveOrders = data.activeOrders.filter(order => {
                    const status = order.status?.toUpperCase();
                    const isActive = status === 'NEW' || 
                                   status === 'PROCESSING' || 
                                   status === 'PURCHASE' ||
                                   status === 'COLLECTING' || 
                                   status === 'DELIVERING' || 
                                   status === 'UNPAID';
                    if (!isActive) {
                        console.log('[loadUserData] 🚫 Заказ отфильтрован (не активный):', order.id, 'статус:', status);
                    }
                    return isActive;
                });
                localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
                console.log('[loadUserData] 📥 Отфильтровано активных заказов:', userActiveOrders.length);
                console.log('[loadUserData] ID активных заказов:', userActiveOrders.map(o => o.id).join(', '));
            } else {
                console.log('📥 Активные заказы не получены или не массив:', data.activeOrders);
            }
            if (data.completedOrders && Array.isArray(data.completedOrders)) {
                // Фильтруем только COMPLETED и CANCELED для истории
                userCompletedOrders = data.completedOrders.filter(order => {
                    const status = order.status?.toUpperCase();
                    return status === 'COMPLETED' || status === 'CANCELED';
                });
                localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
            }
            
            // Логируем только если есть что загружать
            if (savedAddresses.length > 0 || userActiveOrders.length > 0) {
                console.log(`✅ Загружены данные с сервера: адресов=${savedAddresses.length}, заказов=${userActiveOrders.length}`);
            }
            
            // Обновляем UI
            updateCartUI();
            updateGoToCartButton();
            
            console.log('[loadUserData] 🔄 Вызываем loadSavedAddresses после загрузки данных');
            console.log('[loadUserData] 📦 Текущее состояние savedAddresses перед loadSavedAddresses:', savedAddresses.length);
            loadSavedAddresses();
            
            console.log('[loadUserData] 📦 Вызываем loadActiveOrders после загрузки данных, активных заказов:', userActiveOrders.length);
            loadActiveOrders();
            loadProfile();
            
            return;
        } catch (error) {
            console.error('Ошибка загрузки данных с сервера:', error);
        }
    }
    
    // Если нет userId или ошибка, загружаем из localStorage (уже загружено при старте через loadCart())
    // Обновляем UI корзины
    updateCartUI();
    updateGoToCartButton();
    
    // Загружаем адреса из localStorage
    const savedAddressesLocal = localStorage.getItem('savedAddresses');
    if (savedAddressesLocal) {
        try {
            savedAddresses = JSON.parse(savedAddressesLocal);
            loadSavedAddresses();
        } catch (e) {
            console.error('Ошибка загрузки адресов:', e);
            savedAddresses = [];
        }
    }
    
    // Загружаем заказы из localStorage
    const savedActiveOrders = localStorage.getItem('activeOrders');
    if (savedActiveOrders) {
        try {
            const parsedOrders = JSON.parse(savedActiveOrders);
            // Фильтруем только активные статусы: NEW, PROCESSING, COLLECTING, DELIVERING
            // Разделяем заказы на активные и завершенные
            const completedAndCanceled = [];
            const trulyActive = [];
            
            parsedOrders.forEach(order => {
                const status = order.status?.toUpperCase();
                if (status === 'COMPLETED' || status === 'CANCELED') {
                    completedAndCanceled.push(order);
                } else {
                    trulyActive.push(order);
                }
            });
            
            userActiveOrders = trulyActive;
            
            // Добавляем завершенные в историю
            if (completedAndCanceled.length > 0) {
                const existingHistoryIds = new Set(userCompletedOrders.map(o => o.id));
                completedAndCanceled.forEach(order => {
                    if (!existingHistoryIds.has(order.id)) {
                        userCompletedOrders.push(order);
                    }
                });
                localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
            }
            loadActiveOrders();
        } catch (e) {
            console.error('Ошибка загрузки активных заказов:', e);
            userActiveOrders = [];
        }
    }
    
    const savedCompletedOrders = localStorage.getItem('completedOrders');
    if (savedCompletedOrders) {
        try {
            userCompletedOrders = JSON.parse(savedCompletedOrders);
        } catch (e) {
            console.error('Ошибка загрузки завершенных заказов:', e);
            userCompletedOrders = [];
        }
    }
    
    // Загружаем профиль из localStorage
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
        try {
            loadProfile();
        } catch (e) {
            console.error('Ошибка загрузки профиля:', e);
        }
    }
}

// Сохранение корзины (обновленная функция)
function saveCart() {
    saveCartToLocalStorage(cart); // Сохраняем в localStorage с ключом по user_id
    saveUserData(); // Сохраняем на сервер
}

// Обновление UI корзины
function updateCartUI() {
    // Сохранение корзины
    saveCart();

    // Обновление счетчика в навигации (показываем количество "банчей", а не общее количество)
    let totalBunches = 0;
    cart.forEach(item => {
        const minQty = getMinQty(item);
        const bunches = Math.floor(item.quantity / minQty);
        totalBunches += bunches;
    });
    navCartCount.textContent = totalBunches;
    if (totalBunches === 0) {
        navCartCount.style.display = 'none';
    } else {
        navCartCount.style.display = 'block';
    }
    
    // Обновляем карточки товаров, которые есть в корзине или были удалены
    cart.forEach(item => {
        updateProductCard(item.id);
    });
    // Обновляем карточки товаров, которые были удалены из корзины
    products.forEach(product => {
        const cartItem = cart.find(item => item.id === product.id);
        if (!cartItem) {
            updateProductCard(product.id);
        }
    });
    
    // Обновление страницы корзины
    if (cart.length === 0) {
        emptyCartContainer.style.display = 'block';
        cartWithItems.style.display = 'none';
    } else {
        emptyCartContainer.style.display = 'none';
        cartWithItems.style.display = 'block';
        
        // Рендер товаров в корзине
        cartItemsList.innerHTML = cart.map(item => {
            const minQty = getMinQty(item);
            // НЕ округляем количество - используем именно то, что выбрал пользователь
            // Проверяем только, что количество не меньше минимума
            if (item.quantity < minQty) {
                item.quantity = minQty;
            }
            // Вычисляем количество "банчей" (сколько раз добавлен мин заказ)
            const bunchesCount = Math.floor(item.quantity / minQty);
            const totalPrice = item.price * item.quantity;
            
            return `
            <div class="cart-item-new">
                <img src="${item.image}" alt="${item.name}" class="cart-item-new-image">
                <div class="cart-item-new-info">
                    <div class="cart-item-new-name">${item.name}</div>
                    ${minQty > 1 ? `<div class="cart-item-new-min-qty">${minQty} шт</div>` : ''}
                    <div class="cart-item-new-quantity-controls">
                        <button class="cart-quantity-btn" onclick="changeQuantity(${item.id}, -1)">−</button>
                        <span class="cart-quantity-value">${bunchesCount}</span>
                        <button class="cart-quantity-btn" onclick="changeQuantity(${item.id}, 1)">+</button>
                    </div>
                </div>
                <div class="cart-item-new-price">${totalPrice} <span class="ruble">₽</span></div>
            </div>
        `;
        }).join('');
        
        // Расчет итоговой суммы
        calculateFinalTotal();
        
        // Рендерим карусель дополнительных товаров
        renderAdditionalProducts();
    }
    
    updateGoToCartButton();
}

// Дополнительные товары для карусели (загружаются из базы данных с категорией "корзина")
let additionalProducts = [];

// Загрузка дополнительных товаров из базы данных
async function loadAdditionalProducts() {
    try {
        const response = await fetch('/api/products');
        const allProducts = await response.json();
        console.log('Все товары загружены:', allProducts.length);
        // Фильтруем товары с категорией "корзина"
        additionalProducts = allProducts.filter(p => {
            const category = (p.category || p.type || '').toLowerCase();
            const matches = category === 'корзина' || category === 'cart';
            if (matches) {
                console.log('Найден товар из категории "корзина":', p.name, p.id, 'category:', p.category || p.type);
            }
            return matches;
        });
        console.log('Товаров из категории "корзина":', additionalProducts.length);
        renderAdditionalProducts();
    } catch (error) {
        console.error('Ошибка загрузки дополнительных товаров:', error);
        // Fallback на пустой массив
        additionalProducts = [];
        renderAdditionalProducts();
    }
}

// Рендеринг карусели дополнительных товаров
function renderAdditionalProducts() {
    const carousel = document.getElementById('additionalProductsCarousel');
    if (!carousel) return;
    
    if (additionalProducts.length === 0) {
        carousel.innerHTML = '';
        return;
    }
    
    carousel.innerHTML = additionalProducts.map(product => {
        // Проверяем, есть ли товар в корзине (сравниваем как строки и числа)
        const isInCart = cart.some(item => {
            const itemId = String(item.id);
            const productId = String(product.id);
            return itemId === productId || item.id === product.id || item.id === Number(product.id);
        });
        // Используем изображение товара или дефолтное изображение
        const productImage = product.image || product.image_url || '/logo.jpg';
        // Экранируем ID для безопасного использования в onclick
        const safeProductId = String(product.id).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        console.log('Рендеринг товара:', product.name, 'ID:', safeProductId, 'isInCart:', isInCart);
        return `
            <div class="additional-product-card">
                <div class="additional-product-image-wrapper">
                    <img src="${productImage}" alt="${product.name}" class="additional-product-image">
                </div>
                <div class="additional-product-info">
                    <div class="additional-product-name">${product.name}</div>
                    <div class="additional-product-price">${product.price} ₽</div>
                </div>
                <button class="additional-product-add-btn" onclick="addAdditionalProduct(${JSON.stringify(product.id)})" ${isInCart ? 'disabled' : ''}>
                    ${isInCart ? 'В корзине' : 'Добавить'}
                </button>
            </div>
        `;
    }).join('');
}

// Добавление дополнительного товара в корзину
function addAdditionalProduct(productId) {
    console.log('addAdditionalProduct called with productId:', productId, 'type:', typeof productId);
    console.log('additionalProducts:', additionalProducts);
    
    // Приводим productId к строке для сравнения
    const productIdStr = String(productId);
    
    // Ищем товар в additionalProducts (сравниваем как строки и числа)
    let product = additionalProducts.find(p => {
        const pId = String(p.id);
        return pId === productIdStr || p.id === productId || p.id === Number(productId);
    });
    
    if (!product) {
        // Если не найден в additionalProducts, ищем в основном списке товаров
        const productFromMain = products.find(p => {
            const pId = String(p.id);
            return pId === productIdStr || p.id === productId || p.id === Number(productId);
        });
        if (!productFromMain) {
            console.error('Товар не найден:', productId, 'в additionalProducts:', additionalProducts.length, 'в products:', products.length);
            tg.HapticFeedback.notificationOccurred('error');
            return;
        }
        
        const minQty = getMinQty(productFromMain);
        console.log('minQty для товара из основного списка:', minQty);
        const existingItem = cart.find(item => {
            const itemId = String(item.id);
            return itemId === productIdStr || item.id === productId || item.id === Number(productId);
        });
        if (existingItem) {
            existingItem.quantity += minQty;
        } else {
            cart.push({
                ...productFromMain,
                quantity: minQty
            });
        }
    } else {
        const minQty = getMinQty(product);
        console.log('minQty для товара из additionalProducts:', minQty);
        const existingItem = cart.find(item => {
            const itemId = String(item.id);
            return itemId === productIdStr || item.id === productId || item.id === Number(productId);
        });
        if (existingItem) {
            existingItem.quantity += minQty;
        } else {
            cart.push({
                ...product,
                quantity: minQty
            });
        }
    }
    
    updateCartUI();
    saveUserData(); // Сохраняем корзину на сервер
    tg.HapticFeedback.impactOccurred('light');
}

// Расчет итоговой суммы
function calculateFinalTotal() {
    const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // В корзине не показываем доставку, только товары и сборы
    const total = flowersTotal + serviceFee;
    
    if (finalTotalAmount) {
        finalTotalAmount.innerHTML = `${total} <span class="ruble-sign">₽</span>`;
    }
    
    // Обновление детализации
    const flowersTotalElement = document.getElementById('flowersTotalAmount');
    if (flowersTotalElement) {
        flowersTotalElement.textContent = `${flowersTotal} ₽`;
    }
}

// Обработка доставки удалена - доставка фиксированная 500₽


// Переключение вкладок
function switchTab(tabId) {
    // Скрыть все вкладки
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // При переключении на профиль - обновляем заказы для актуальных статусов
    if (tabId === 'profileTab') {
        refreshOrders();
    }
    
    // Показать выбранную вкладку
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Скрыть/показать навигацию и header
    const bottomNav = document.querySelector('.bottom-nav');
    const header = document.querySelector('.header');
    
    if (tabId === 'orderTab') {
        // Скрыть навигацию, но оставить header видимым
        if (bottomNav) bottomNav.style.display = 'none';
        if (header) header.style.display = 'flex'; // Header остается видимым
        // Инициализировать поэтапную форму заказа
        initCheckoutSteps();
        // Убеждаемся, что мы на первом шаге
        if (currentCheckoutStep !== 1) {
            goToStep(1);
        } else {
            // Обновляем BackButton для текущего шага
            goToStep(1);
        }
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
    } else if (tabId === 'addressTab') {
        if (bottomNav) bottomNav.style.display = 'none';
        if (header) header.style.display = 'flex'; // Header остается видимым
        setTimeout(() => {
            const addressTab = document.getElementById('addressTab');
            if (addressTab) {
                addressTab.scrollTop = 0;
                if (window.scrollTo) {
                    window.scrollTo(0, 0);
                }
            }
        }, 150);
    } else if (tabId === 'orderHistoryTab') {
        // Скрыть навигацию, но оставить header видимым
        if (bottomNav) bottomNav.style.display = 'none';
        if (header) header.style.display = 'flex';
        // Показать BackButton для возврата в профиль
        showBackButton(true);
        setTimeout(() => {
            const historyTab = document.getElementById('orderHistoryTab');
            if (historyTab) {
                historyTab.scrollTop = 0;
                if (window.scrollTo) {
                    window.scrollTo(0, 0);
                }
            }
        }, 150);
    } else {
        // Показать навигацию и header для других вкладок
        if (bottomNav) bottomNav.style.display = 'flex';
        if (header) header.style.display = 'flex';
        // Скрыть BackButton для основных вкладок (меню, корзина, профиль)
        tg.BackButton.hide();
    }
    
    // Обновить навигацию (перезапрашиваем элементы каждый раз, так как DOM может пересоздаваться)
    const currentNavItems = document.querySelectorAll('.nav-item');
    currentNavItems.forEach(item => {
        if (item.dataset.tab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Обновить корзину при открытии вкладки
    if (tabId === 'cartTab') {
        updateCartUI();
        // Прокрутить страницу в начало при открытии корзины
        setTimeout(() => {
            const cartTab = document.getElementById('cartTab');
            if (cartTab) {
                cartTab.scrollTop = 0;
                if (cartTab.scrollIntoView) {
                    cartTab.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
                if (window.scrollTo) {
                    window.scrollTo(0, 0);
                }
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
            }
        }, 100);
    }
    
    tg.HapticFeedback.impactOccurred('light');
}

// Обработчики навигации
// Инициализация навигации с делегированием событий (обработчики не теряются)
// Используем делегирование событий на document - это гарантирует работу даже после пересоздания DOM
document.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item');
    if (navItem && navItem.dataset.tab) {
        const tabId = navItem.dataset.tab;
        console.log('[navigation] ✅ Клик по навигации:', tabId);
        e.preventDefault();
        e.stopPropagation();
        switchTab(tabId);
    }
});

// Также устанавливаем обработчики напрямую на элементы (для надежности)
const initNavigation = () => {
    const items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        // Удаляем старые обработчики через клон
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // Добавляем новый обработчик
        newItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tabId = newItem.dataset.tab;
            console.log('[navigation] ✅ Прямой клик по навигации:', tabId);
            switchTab(tabId);
    });
});
    
    // Обновляем глобальную переменную navItems для совместимости
    navItems = document.querySelectorAll('.nav-item');
    
    console.log('[navigation] ✅ Инициализирована навигация, элементов:', navItems.length);
};

// Инициализируем навигацию при загрузке
initNavigation();

// Проверка: можем ли сделать упрощённый чек-аут
function canUseSimpleCheckout() {
    const hasRecipient =
        (checkoutData.recipientName && checkoutData.recipientPhone) ||
        (document.getElementById('customerName')?.value && document.getElementById('customerPhone')?.value);
    
    const hasAddress = savedAddresses && savedAddresses.length > 0;
    
    return !!(hasRecipient && hasAddress);
}

// Полный сценарий (как сейчас, 4 шага)
function startFullCheckout() {
    isSimpleCheckout = false;
    isSimpleOrderInitialized = false; // Сбрасываем флаг при полном сценарии
    summaryDateTimeInitialized = false; // Сбрасываем флаг календаря
    checkoutMode = 'full';
    checkoutScreen = 'steps';
    
    switchTab('orderTab');
    
    const progress = document.querySelector('.checkout-progress');
    if (progress) progress.style.display = 'flex';
    
    currentCheckoutStep = 1;
    goToStep(1);
    showBackButton(true);
    
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
    }

// Универсальная функция показа экрана "Итого" в упрощенном режиме
function showSimpleSummary() {
    console.log('[SimpleMenu] 📍 Показ экрана "Итого" в упрощенном режиме');
    
    checkoutMode = 'simple';
    checkoutScreen = 'summary';
    isSimpleCheckout = true;
    
    // Показываем вкладку orderTab
    switchTab('orderTab');
    
    // Скрываем прогресс-бар
    const progress = document.querySelector('.checkout-progress');
    if (progress) progress.style.display = 'none';
    
    // Скрываем шаги 1–3
    ['checkoutStep1', 'checkoutStep2', 'checkoutStep3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });
    
    // Показываем шаг 4
    const step4 = document.getElementById('checkoutStep4');
    if (step4) {
        step4.style.display = 'block';
        step4.classList.add('active');
    }
    
    // Скрываем поле "Дата и время доставки" с прочерком в упрощенном сценарии
    const summaryDateTimeContainer = document.getElementById('summaryDateTimeContainer');
    if (summaryDateTimeContainer) {
        summaryDateTimeContainer.style.display = 'none';
    }
    
    // Скрываем поле "Оставить у двери" с текстом "Да/Нет" в упрощенном сценарии
    const summaryLeaveAtDoor = document.getElementById('summaryLeaveAtDoor');
    if (summaryLeaveAtDoor) {
        const summaryLeaveAtDoorItem = summaryLeaveAtDoor.closest('.checkout-summary-item');
        if (summaryLeaveAtDoorItem) {
            summaryLeaveAtDoorItem.style.display = 'none';
        }
    }
    
    // Заголовок «Оформление заказа»
    const orderPageHeader = document.querySelector('.order-page-header');
    if (orderPageHeader) {
        orderPageHeader.style.display = '';
    }
    
    // Скрываем все вкладки редактирования
    const editingTabs = ['editRecipientTab', 'editAddressTab', 'myAddressesTab'];
    editingTabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.style.display = 'none';
        }
    });
    
    // Скрываем элементы списка адресов
    const checkoutAddressesList = document.getElementById('checkoutAddressesList');
    const checkoutAddressForm = document.getElementById('checkoutAddressForm');
    const addNewAddressBtn = document.getElementById('addNewAddressBtn');
    if (checkoutAddressesList) checkoutAddressesList.style.display = 'none';
    if (checkoutAddressForm) checkoutAddressForm.style.display = 'none';
    if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
    
    // Подставляем получателя и адрес
    if (typeof prefillSimpleCheckoutSummary === 'function') {
        prefillSimpleCheckoutSummary();
    }
    
    // Инициализируем календарь + слоты на «Итого»
    if (typeof initSimpleDateTimeOnSummary === 'function') {
        initSimpleDateTimeOnSummary();
    }
    
    // Обновляем данные
    if (typeof renderCheckoutSummary === 'function') {
        renderCheckoutSummary();
    }
    
    // Скроллим наверх
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    
    console.log('[SimpleMenu] ✅ Экран "Итого" показан, checkoutScreen:', checkoutScreen);
}

// Функции возврата из экранов редактирования в упрощенном режиме
function closeEditRecipientAndReturnToSummary() {
    console.log('[SimpleMenu] 📍 Закрытие редактирования получателя, возврат на summary');
    const tab = document.getElementById('editRecipientTab');
    if (tab) tab.style.display = 'none';
    showSimpleSummary();
}

function closeMyAddressesAndReturnToSummary() {
    console.log('[SimpleMenu] 📍 Закрытие списка адресов, возврат на summary');
    const tab = document.getElementById('myAddressesTab');
    if (tab) tab.style.display = 'none';
    
    // Также скрываем элементы списка адресов из checkout
    const checkoutAddressesList = document.getElementById('checkoutAddressesList');
    const checkoutAddressForm = document.getElementById('checkoutAddressForm');
    const addNewAddressBtn = document.getElementById('addNewAddressBtn');
    if (checkoutAddressesList) checkoutAddressesList.style.display = 'none';
    if (checkoutAddressForm) checkoutAddressForm.style.display = 'none';
    if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
    
    showSimpleSummary();
}

function closeEditAddressAndReturnToAddressList() {
    console.log('[SimpleMenu] 📍 Закрытие редактирования адреса, возврат к списку адресов');
    const editTab = document.getElementById('editAddressTab');
    if (editTab) editTab.style.display = 'none';
    
    // Возвращаемся к списку адресов
    openCheckoutAddressesForSimple();
}

// Упрощённый сценарий: сразу «Итого» (4-й шаг)
function startSimpleCheckout() {
    isSimpleCheckout = true;
    showSimpleSummary();
    
    // Помечаем, что упрощенный заказ инициализирован
    isSimpleOrderInitialized = true;
    
    // Показываем BackButton
    showBackButton(true);
    
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}

// Оформление заказа
checkoutBtnFinal.addEventListener('click', () => {
    if (canUseSimpleCheckout()) {
        startSimpleCheckout();   // упрощённый сценарий
    } else {
        startFullCheckout();     // как сейчас, 4 шага
    }
});

// Инициализация формы заказа
function initOrderForm() {
    // В упрощенном сценарии инициализация уже выполнена, не повторяем
    if (isSimpleCheckout && isSimpleOrderInitialized) {
        console.log('[initOrderForm] ⏭️ Упрощенный заказ уже инициализирован, пропускаем');
        return;
    }
    
    console.log('[initOrderForm] 🚀 Инициализация формы заказа');
    console.log('[initOrderForm] 📦 savedAddresses.length:', savedAddresses.length);
    
    // Загрузка адресов
    console.log('[initOrderForm] 🔄 Вызываем loadSavedAddresses');
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
    let selectedAddressId = null;
    
    window.renderAddressOptions = function() {
        console.log('[renderAddressOptions] 🚀 Начало рендеринга адресов');
        console.log('[renderAddressOptions] 📦 savedAddresses.length:', savedAddresses.length);
        console.log('[renderAddressOptions] 🔍 addressOptionsList найден:', !!addressOptionsList);
        
        if (!addressOptionsList) {
            console.log('[renderAddressOptions] ⚠️ addressOptionsList не найден, выходим');
            return;
        }
        
        addressOptionsList.innerHTML = '';
        
        if (savedAddresses.length === 0) {
            console.log('[renderAddressOptions] ⚠️ Нет адресов, скрываем список');
            addressOptionsList.style.display = 'none';
            selectedAddressId = 'new';
            if (newAddressForm) newAddressForm.style.display = 'block';
            clearOrderAddressFields();
            return;
        }
        
        console.log('[renderAddressOptions] ✅ Показываем список с', savedAddresses.length, 'адресами');
        addressOptionsList.style.display = 'block';
        
        if (!selectedAddressId || selectedAddressId === 'new') {
            selectedAddressId = savedAddresses[0]?.id || null;
        }
        
        const selectedSavedAddress = savedAddresses.find(addr => String(addr.id) === String(selectedAddressId));
        if (selectedAddressId !== 'new' && selectedSavedAddress) {
            fillOrderFormWithAddress(selectedSavedAddress);
            if (newAddressForm) newAddressForm.style.display = 'none';
        } else if (selectedAddressId === 'new') {
            clearOrderAddressFields();
            if (newAddressForm) newAddressForm.style.display = 'block';
        }
        
        savedAddresses.forEach(addr => {
            const shortParts = [];
            // Объединяем street и house для отображения
            let streetValue = addr.street || '';
            if (addr.house && !streetValue.includes(addr.house)) {
                streetValue = streetValue ? `${streetValue} ${addr.house}` : addr.house;
            }
            if (streetValue) shortParts.push(streetValue);
            if (addr.apartment) shortParts.push(addr.apartment);
            const shortAddress = shortParts.join(', ') || 'Адрес не заполнен';
            
            const option = document.createElement('label');
            option.className = 'address-option-btn';
            option.innerHTML = `
                <input type="radio" name="selectedAddress" value="${addr.id}" class="radio-input">
                <span class="radio-label">
                    <span class="address-name-bold">${addr.name || 'Без названия'}</span>
                    <span class="address-separator"> - </span>
                    <span class="address-short">${shortAddress}</span>
                </span>
            `;
            
            const radio = option.querySelector('input');
            if (String(selectedAddressId) === String(addr.id)) {
                radio.checked = true;
                option.classList.add('selected');
            }
            
            radio.addEventListener('change', () => {
                selectedAddressId = addr.id;
                document.querySelectorAll('.address-option-btn').forEach(btn => btn.classList.remove('selected'));
                option.classList.add('selected');
                fillOrderFormWithAddress(addr);
                if (newAddressForm) newAddressForm.style.display = 'none';
            });
            
            addressOptionsList.appendChild(option);
        });
        
        const newOption = document.createElement('label');
        newOption.className = 'address-option-btn new-address-option';
        newOption.innerHTML = `
            <input type="radio" name="selectedAddress" value="new" class="radio-input">
            <span class="radio-label">
                <span class="address-name-bold">Новый адрес</span>
            </span>
        `;
        const newRadio = newOption.querySelector('input');
        if (selectedAddressId === 'new') {
            newRadio.checked = true;
            newOption.classList.add('selected');
            if (newAddressForm) newAddressForm.style.display = 'block';
        }
        
        newRadio.addEventListener('change', () => {
            selectedAddressId = 'new';
            document.querySelectorAll('.address-option-btn').forEach(btn => btn.classList.remove('selected'));
            newOption.classList.add('selected');
            clearOrderAddressFields();
            if (newAddressForm) newAddressForm.style.display = 'block';
        });
        
        addressOptionsList.appendChild(newOption);
            
            console.log('[renderAddressOptions] ✅ Рендеринг завершен, добавлено', savedAddresses.length, 'адресов + опция "Новый адрес"');
    };
    
    console.log('[init] 🔄 Вызываем renderAddressOptions при инициализации');
    window.renderAddressOptions();
    
    // Функции для работы с датами
    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }
    
    function toInputValue(date) {
        // YYYY-MM-DD
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    
    function todayWithoutTime() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }
    
    function isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }
    
    const monthNames = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    
    const weekdayShort = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    
    function formatDeliveryDate(date) {
        const today = todayWithoutTime();
        const tomorrow = addDays(today, 1);
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        const weekday = weekdayShort[date.getDay()];
        
        if (isSameDay(date, today)) {
            return `сегодня, ${day} ${month}`;
        }
        
        if (isSameDay(date, tomorrow)) {
            return `завтра, ${day} ${month}`;
        }
        
        // Дальше – "пн, 30 декабря"
        return `${weekday}, ${day} ${month}`;
    }
    
    function updateDeliveryLabel(date) {
        const dateLabel = document.getElementById('deliveryDateLabel');
        if (!dateLabel) return;
        
        if (!date) {
            dateLabel.textContent = '';
            return;
        }
        
        dateLabel.textContent = formatDeliveryDate(date);
    }
    
    // Кастомный календарь
    const monthNamesFull = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    let currentCalendarDate = null; // Текущая дата, отображаемая в календаре
    let selectedDate = null; // Выбранная дата пользователем
    let calendarRenderFunction = null; // Функция для перерисовки календаря
    
    function initCustomCalendar() {
        const calendarContainer = document.getElementById('customCalendar');
    const deliveryDateInput = document.getElementById('deliveryDate');
        
        console.log('[initCustomCalendar] Инициализация кастомного календаря');
        console.log('[initCustomCalendar] calendarContainer:', !!calendarContainer);
        console.log('[initCustomCalendar] deliveryDateInput:', !!deliveryDateInput);
        
        if (!calendarContainer || !deliveryDateInput) {
            console.warn('[initCustomCalendar] Календарь или поле не найдены, выходим');
            return;
        }
        
        const today = todayWithoutTime();
        const minDate = addDays(today, 1);     // завтра
        const maxDate = addDays(minDate, 13);  // всего 14 дней (завтра + 13)
        
        console.log('[initCustomCalendar] Диапазон дат:');
        console.log('[initCustomCalendar]   - Сегодня:', today.toISOString().split('T')[0]);
        console.log('[initCustomCalendar]   - Минимум (завтра):', minDate.toISOString().split('T')[0]);
        console.log('[initCustomCalendar]   - Максимум (через 14 дней):', maxDate.toISOString().split('T')[0]);
        
        // Проверяем, есть ли сохраненная дата
        let initialDate = minDate;
        if (deliveryDateInput.value) {
            const savedDate = new Date(deliveryDateInput.value);
            // Проверяем, что сохраненная дата в допустимом диапазоне
            if (savedDate >= minDate && savedDate <= maxDate) {
                initialDate = savedDate;
            }
        }
        
        // Устанавливаем дефолт = завтра или сохраненная дата
        selectedDate = initialDate;
        // Календарь открывается на текущем месяце (не на месяце выбранной даты)
        currentCalendarDate = new Date(today);
        deliveryDateInput.value = toInputValue(initialDate);
        
        // Удаляем вызов updateDeliveryLabel, так как поле убрано
        
        // Функция отрисовки календаря
        function renderCalendar(date) {
            console.log('[renderCalendar] 🎯 НАЧАЛО ОТРИСОВКИ календаря для даты:', date);
            
            if (!date || isNaN(date.getTime())) {
                console.error('[renderCalendar] ❌ Некорректная дата:', date);
                return;
            }
            
            const year = date.getFullYear();
            const month = date.getMonth();
            
            // Обновляем заголовок месяца/года
            const monthYearEl = document.getElementById('calendarMonthYear');
            if (monthYearEl) {
                monthYearEl.textContent = `${monthNamesFull[month]} ${year}`;
            }
            
            // Первый день месяца и количество дней в месяце
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();
            
            console.log('[renderCalendar] Дней в месяце:', daysInMonth, 'месяц:', month, 'год:', year);
            
            // День недели первого дня (0 = воскресенье, нужно преобразовать: 0 -> 6, 1-6 -> 0-5)
            let firstDayOfWeek = firstDay.getDay();
            firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Понедельник = 0
            
            console.log('[renderCalendar] Первый день недели:', firstDayOfWeek);
            
            // Контейнер для дней
            const daysContainer = document.getElementById('calendarDays');
            if (!daysContainer) {
                console.error('[renderCalendar] ❌ Контейнер calendarDays не найден!');
                console.error('[renderCalendar] Проверяем родительские элементы:');
                console.error('[renderCalendar] - customCalendar:', !!document.getElementById('customCalendar'));
                console.error('[renderCalendar] - checkoutStep3:', !!document.getElementById('checkoutStep3'));
                return;
            }
            
            console.log('[renderCalendar] ✅ Контейнер найден, очищаем и заполняем');
            console.log('[renderCalendar] Текущее содержимое контейнера (до очистки):', daysContainer.children.length, 'элементов');
            daysContainer.innerHTML = '';
            
            // Пустые ячейки до первого дня месяца
            for (let i = 0; i < firstDayOfWeek; i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'calendar-day';
                daysContainer.appendChild(emptyDay);
            }
            
            // Получаем текущие ограничения дат
            const today = todayWithoutTime();
            const minDate = addDays(today, 1);     // завтра
            const maxDate = addDays(minDate, 13);  // всего 14 дней (завтра + 13)
            
            console.log('[renderCalendar] Ограничения: minDate:', minDate.toISOString().split('T')[0], 'maxDate:', maxDate.toISOString().split('T')[0]);
            
            // Дни месяца
            let daysAdded = 0;
            for (let day = 1; day <= daysInMonth; day++) {
                const dayDate = new Date(year, month, day);
                const dayEl = document.createElement('div');
                dayEl.className = 'calendar-day';
                dayEl.textContent = day.toString(); // Явно преобразуем в строку
                
                // Проверяем, доступна ли дата (от завтра до 2 недель вперед)
                // Сбрасываем время для корректного сравнения дат
                const dayDateNormalized = new Date(year, month, day);
                dayDateNormalized.setHours(0, 0, 0, 0);
                const isBeforeMin = dayDateNormalized < minDate;
                const isAfterMax = dayDateNormalized > maxDate;
                
                if (isBeforeMin || isAfterMax) {
                    dayEl.classList.add('disabled');
                } else {
                    // Добавляем класс для доступных дат (для обводки)
                    dayEl.classList.add('available');
                    
                    // Проверяем, является ли это сегодня
                    if (isSameDay(dayDateNormalized, today)) {
                        dayEl.classList.add('today');
                    }
                    
                    // Проверяем, выбрана ли эта дата
                    if (selectedDate && isSameDay(dayDateNormalized, selectedDate)) {
                        dayEl.classList.add('selected');
                    }
                    
                    // Обработчик клика
                    dayEl.addEventListener('click', () => {
                        if (!dayEl.classList.contains('disabled')) {
                            // Убираем выделение с предыдущей даты
                            daysContainer.querySelectorAll('.calendar-day.selected').forEach(el => {
                                el.classList.remove('selected');
                            });
                            
                            // Выделяем новую дату
                            dayEl.classList.add('selected');
                            // Создаем нормализованную дату без времени
                            const clickedDate = new Date(year, month, day);
                            clickedDate.setHours(0, 0, 0, 0);
                            selectedDate = clickedDate;
                            deliveryDateInput.value = toInputValue(selectedDate);
                            updateDeliveryTimeOptions();
                            
                            // Убираем красную рамку с поля даты при выборе
                            const deliveryDateField = document.getElementById('deliveryDate');
                            const deliveryDateAnchor = document.getElementById('anchor-deliveryDate');
                            if (deliveryDateField) {
                                validateField(deliveryDateField, true);
                            }
                            
                            console.log('[renderCalendar] Выбрана дата:', selectedDate.toISOString().split('T')[0]);
                            
                            // Тактильная обратная связь
                            if (tg && tg.HapticFeedback) {
                                tg.HapticFeedback.impactOccurred('light');
                            }
                        }
                    });
                }
                
                daysContainer.appendChild(dayEl);
                daysAdded++;
                
                // Отладочный вывод для первых нескольких дней
                if (day <= 3) {
                    console.log(`[renderCalendar] День ${day}:`, {
                        text: dayEl.textContent,
                        classes: dayEl.className,
                        disabled: dayEl.classList.contains('disabled'),
                        available: dayEl.classList.contains('available'),
                        selected: dayEl.classList.contains('selected')
                    });
                }
            }
            
            console.log('[renderCalendar] Добавлено дней:', daysAdded, 'всего элементов в контейнере:', daysContainer.children.length);
            
            // Проверяем видимость элементов
            const firstAvailableDay = daysContainer.querySelector('.calendar-day.available');
            if (firstAvailableDay) {
                console.log('[renderCalendar] Первая доступная дата найдена:', firstAvailableDay.textContent);
                const styles = window.getComputedStyle(firstAvailableDay);
                console.log('[renderCalendar] Стили первой доступной даты:', {
                    display: styles.display,
                    visibility: styles.visibility,
                    opacity: styles.opacity,
                    width: styles.width,
                    height: styles.height
                });
            } else {
                console.warn('[renderCalendar] Нет доступных дат в календаре!');
            }
            
            // Обновляем состояние кнопок навигации
            const prevBtn = document.getElementById('calendarPrevMonth');
            const nextBtn = document.getElementById('calendarNextMonth');
            
            // Пересчитываем ограничения для кнопок навигации
            const todayForNav = todayWithoutTime();
            const minDateForNav = addDays(todayForNav, 1);
            const maxDateForNav = addDays(minDateForNav, 13);
            
            if (prevBtn) {
                // Отключаем кнопку "назад", если предыдущий месяц не содержит доступных дат
                const prevMonth = new Date(year, month - 1, 1);
                const prevMonthLastDay = new Date(year, month, 0);
                prevBtn.disabled = prevMonthLastDay < minDateForNav;
            }
            
            if (nextBtn) {
                // Отключаем кнопку "вперед", если следующий месяц не содержит доступных дат
                const nextMonth = new Date(year, month + 1, 1);
                nextBtn.disabled = nextMonth > maxDateForNav;
            }
            
            console.log('[renderCalendar] Календарь отрисован, добавлено элементов:', daysContainer.children.length);
        }
        
        // Сохраняем ссылку на функцию для использования извне
        calendarRenderFunction = renderCalendar;
        
        // Навигация по месяцам
        const prevBtn = document.getElementById('calendarPrevMonth');
        const nextBtn = document.getElementById('calendarNextMonth');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const newDate = new Date(currentCalendarDate);
                newDate.setMonth(newDate.getMonth() - 1);
                currentCalendarDate = newDate;
                renderCalendar(newDate);
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const newDate = new Date(currentCalendarDate);
                newDate.setMonth(newDate.getMonth() + 1);
                currentCalendarDate = newDate;
                renderCalendar(newDate);
                
                if (tg && tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }
            });
        }
        
        // Функция обновления времени доставки
        function updateDeliveryTimeOptions() {
            if (!selectedDate) return;
            
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
                            // Сохраняем выбранное время в checkoutData
                            checkoutData.deliveryTime = btn.dataset.time;
                            if (tg && tg.HapticFeedback) {
                            tg.HapticFeedback.impactOccurred('light');
                            }
                        });
                    });
                    
                    // Восстанавливаем выбранное время, если оно было сохранено
                    if (checkoutData.deliveryTime) {
                        const savedTimeBtn = deliveryTimeOptions.querySelector(`.time-slot-btn[data-time="${checkoutData.deliveryTime}"]`);
                        if (savedTimeBtn) {
                            savedTimeBtn.classList.add('active');
                        }
                    }
                }
            }
        }
        
        // Инициализация времени доставки
        updateDeliveryTimeOptions();
        
        // Сохраняем ссылку на функцию для использования извне
        calendarRenderFunction = renderCalendar;
        
        // Первоначальная отрисовка календаря
        console.log('[initCustomCalendar] Вызываем renderCalendar с датой:', currentCalendarDate);
        if (currentCalendarDate && !isNaN(currentCalendarDate.getTime())) {
            renderCalendar(currentCalendarDate);
        } else {
            console.error('[initCustomCalendar] Некорректная дата для отрисовки:', currentCalendarDate);
            // Пробуем отрисовать текущий месяц
            const todayForRender = todayWithoutTime();
            currentCalendarDate = new Date(todayForRender);
            renderCalendar(currentCalendarDate);
        }
        
        // Экспортируем функцию для обновления календаря извне
        window.updateCustomCalendar = function(dateValue) {
            if (dateValue && calendarRenderFunction) {
                const date = new Date(dateValue);
                if (!isNaN(date.getTime())) {
                    selectedDate = date;
                    // Календарь открывается на текущем месяце, но выделяет выбранную дату
                    const todayForUpdate = todayWithoutTime();
                    currentCalendarDate = new Date(todayForUpdate);
                    deliveryDateInput.value = toInputValue(date);
                    calendarRenderFunction(currentCalendarDate);
                }
            }
        };
    }
    
    // Инициализация кастомного календаря
    // Экспортируем функцию для повторной инициализации
    window.initCustomCalendar = initCustomCalendar;
    
    // Пробуем инициализировать сразу (если форма уже загружена)
    const calendarContainer = document.getElementById('customCalendar');
    const deliveryDateInput = document.getElementById('deliveryDate');
    if (calendarContainer && deliveryDateInput) {
        console.log('[init] Календарь найден при загрузке, инициализируем');
        initCustomCalendar();
    } else {
        console.log('[init] Календарь не найден при загрузке (форма еще не открыта), будет инициализирован при переходе на шаг 3');
    }
    
    // Инициализация обработчиков времени доставки (если они уже есть в DOM)
    const existingTimeSlots = document.querySelectorAll('.time-slot-btn');
    if (existingTimeSlots.length > 0) {
        existingTimeSlots.forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Сохраняем выбранное время в checkoutData
                checkoutData.deliveryTime = btn.dataset.time;
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
    
    // Настройка полей телефона
    const customerPhoneField = document.getElementById('customerPhone');
    const recipientPhoneField = document.getElementById('recipientPhone');
    setupPhoneInput(customerPhoneField);
    setupPhoneInput(recipientPhoneField);
    
    // Автоматическое разбиение адреса убрано - теперь "улица + дом" в одном поле
    
    // Расчет суммы
    const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = flowersTotal + serviceFee + deliveryPrice;
    
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

// Кнопка "Назад" в форме заказа (старая, если есть - для совместимости)
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
    // Защита от двойного вызова
    if (isSubmittingOrder) {
        console.log('[validateAndSubmitOrder] ⚠️ Заказ уже отправляется, игнорируем повторный вызов');
        return;
    }
    
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Устанавливаем флаг отправки
    isSubmittingOrder = true;
    console.log('[validateAndSubmitOrder] 🔒 Флаг отправки установлен');
    
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
    
    // --- ПОЛУЧАТЕЛЬ: данные ИЗ ФОРМЫ ---
    const recipientNameFieldFromForm = document.getElementById('customerName');
    const recipientPhoneFieldFromForm = document.getElementById('customerPhone');
    
    const recipientNameFromForm = recipientNameFieldFromForm ? recipientNameFieldFromForm.value.trim() : '';
    const recipientPhoneFromForm = recipientPhoneFieldFromForm ? recipientPhoneFieldFromForm.value.trim() : '';
    
    // Валидация имени получателя (минимум 2 символа)
    const nameAnchor = document.getElementById('anchor-customerName');
    if (!recipientNameFromForm || recipientNameFromForm.length < 2) {
        if (recipientNameFieldFromForm) validateField(recipientNameFieldFromForm, false);
        if (!firstErrorField) firstErrorField = nameAnchor || recipientNameFieldFromForm;
        hasErrors = true;
    }
    
    // Валидация телефона получателя (минимум 10 цифр)
    const phoneAnchor = document.getElementById('anchor-customerPhone');
    const recipientPhoneDigits = recipientPhoneFromForm.replace(/\D/g, ''); // Убираем все нецифровые символы
    if (!recipientPhoneFromForm || recipientPhoneDigits.length < 10) {
        if (recipientPhoneFieldFromForm) validateField(recipientPhoneFieldFromForm, false);
        if (!firstErrorField) firstErrorField = phoneAnchor || recipientPhoneFieldFromForm;
        hasErrors = true;
    }
    
    // --- КЛИЕНТ: данные ИЗ ТЕЛЕГРАМА + ПРОФИЛЯ ---
    const emailField = document.getElementById('customerEmail');
    
    // Профиль из localStorage (то, что сохраняется через /api/user-data)
    let profileData = {};
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
        try {
            profileData = JSON.parse(savedProfile) || {};
        } catch (e) {
            console.error('Ошибка парсинга профиля:', e);
        }
    }
    
    // Данные из Telegram
    const tgUser = tg?.initDataUnsafe?.user || {};
    
    // Имя клиента: приоритет — имя из профиля, потом first_name, потом username
    const clientName =
        profileData.name ||
        (tgUser.first_name && tgUser.last_name ? `${tgUser.first_name} ${tgUser.last_name}` : tgUser.first_name) ||
        tgUser.username ||
        '';
    
    // Телефон клиента: из профиля, если есть, иначе из Telegram (если когда-нибудь появится)
    const clientPhone =
        profileData.phone ||
        tgUser.phone_number ||
        '';
    
    // Email клиента: только из профиля (можно вводить на экране профиля)
    const clientEmail =
        profileData.email ||
        (emailField ? emailField.value.trim() : '');
    
    // --- Остальные поля ---
    const commentField = document.getElementById('orderComment');
    const deliveryDateField = document.getElementById('deliveryDate');
    
    // Используем комментарий из checkoutData (синхронизирован с полем на шаге 4)
    const comment = checkoutData.orderComment || (commentField ? commentField.value.trim() : '');
    const deliveryDate = deliveryDateField ? deliveryDateField.value : '';
    // В упрощенном сценарии проверяем оба места (шаг 3 и шаг 4)
    let selectedTimeSlot = document.querySelector('.time-slot-btn.active');
    if (!selectedTimeSlot && isSimpleCheckout) {
        // Проверяем слоты времени на шаге 4
        const summaryTimeOptions = document.getElementById('summaryDeliveryTimeOptions');
        if (summaryTimeOptions) {
            selectedTimeSlot = summaryTimeOptions.querySelector('.time-slot-btn.active');
        }
    }
    const deliveryTime = selectedTimeSlot ? selectedTimeSlot.dataset.time : (checkoutData.deliveryTime || null);
    // Используем значение из checkoutData (синхронизирован с чекбоксом на шаге 3)
    const leaveAtDoor = !!checkoutData.leaveAtDoor;
    
    console.log('[validateAndSubmitOrder] 📝 Проверка полей:');
    console.log('[validateAndSubmitOrder]   - clientName:', clientName);
    console.log('[validateAndSubmitOrder]   - clientPhone:', clientPhone);
    console.log('[validateAndSubmitOrder]   - clientEmail:', clientEmail || '(не заполнено)');
    console.log('[validateAndSubmitOrder]   - recipientName:', recipientNameFromForm);
    console.log('[validateAndSubmitOrder]   - recipientPhone:', recipientPhoneFromForm);
    console.log('[validateAndSubmitOrder]   - comment:', comment || '(не заполнено)');
    console.log('[validateAndSubmitOrder]   - deliveryDate:', deliveryDate);
    console.log('[validateAndSubmitOrder]   - deliveryTime:', deliveryTime);
    
    // Валидация email (улучшенная: должна быть @ и точка, нельзя белеберду)
    const emailAnchor = document.getElementById('anchor-customerEmail');
    // Более строгая проверка: должна быть @, точка после @, и валидные символы
    // Используем строгую валидацию email
    // Email необязателен в новой поэтапной форме, но если поле существует - валидируем
    if (emailField) {
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
    } else {
        // Поле email не существует в форме - используем пустое значение
        console.log('[validateAndSubmitOrder] ⚠️ Поле customerEmail не найдено, используем пустое значение');
    }
    
    // В поэтапной форме получатель ВСЕГДА из формы customerName / customerPhone
    let recipientName = recipientNameFromForm;
    let recipientPhone = recipientPhoneFromForm;
    
    // Проверка выбранного адреса (ПЕРЕД проверкой времени доставки)
    const selectedAddressRadio = document.querySelector('input[name="selectedAddress"]:checked');
    const addressOptionsList = document.getElementById('addressOptionsList');
    let addressData = null;
    let hasAddressErrors = false;
    
    const shouldUseForm =
        savedAddresses.length === 0 ||
        !selectedAddressRadio ||
        selectedAddressRadio.value === 'new';
    
    if (shouldUseForm) {
        // Проверка формы нового адреса
        const city = document.getElementById('orderAddressCity').value.trim();
        const street = document.getElementById('orderAddressStreet').value.trim(); // Теперь содержит "улица + дом"
        
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
        
        // Валидация дома убрана - теперь "улица + дом" в одном поле
        
        // Не делаем return здесь - нужно проверить и время доставки тоже
        // Ошибки адреса уже установлены, продолжаем проверку других полей
        
        // Парсим street и house из поля "улица, дом"
        // Пользователь вводит "Кемская 7" - нужно правильно извлечь "7"
        let streetValue = street.trim();
        let houseValue = '';
        
        // Пытаемся извлечь номер дома из street
        // Паттерн: пробел + одна или более цифр + опционально буквы/корпус
        // Используем тот же regex, что и на бэке для единообразия
        const houseMatch = streetValue.match(/\s+(\d+[а-яА-Яa-zA-ZкК\s]*?)$/);
        if (houseMatch && houseMatch[1]) {
            houseValue = houseMatch[1].trim();
            // Убираем номер дома из street, оставляя только название улицы
            streetValue = streetValue.replace(/\s+\d+[а-яА-ЯкКa-zA-Z\s]*?$/, '').trim();
        }
        
        addressData = {
            name: 'Новый адрес',
            city: city,
            street: streetValue, // Название улицы без номера дома
            house: houseValue, // Номер дома отдельно
            entrance: document.getElementById('orderAddressEntrance').value.trim(),
            apartment: document.getElementById('orderAddressApartment').value.trim(),
            floor: document.getElementById('orderAddressFloor').value.trim(),
            intercom: document.getElementById('orderAddressIntercom').value.trim(),
            comment: document.getElementById('orderAddressComment').value.trim()
        };
        
        console.log('[validateAndSubmitOrder] 📦 addressData сформирован:', JSON.stringify(addressData, null, 2));
    } else {
        const addressId = selectedAddressRadio.value;
        addressData = savedAddresses.find(a => String(a.id) === String(addressId));
        if (!addressData) {
            if (addressOptionsList && !firstErrorField) {
                firstErrorField = addressOptionsList;
            }
            hasErrors = true;
        } else {
            // ВАЖНО: Если адрес был отредактирован через checkoutData, используем его
            // Это предотвращает создание дубликата при оплате
            // Если checkoutData.address существует и имеет ID, который совпадает с выбранным адресом, используем его
            if (checkoutData.address && checkoutData.address.id && String(checkoutData.address.id) === String(addressId)) {
                console.log('[validateAndSubmitOrder] ✅ Используем отредактированный адрес из checkoutData (ID совпадает)');
                addressData = {
                    ...addressData, // Базовые данные из savedAddresses
                    ...checkoutData.address // Обновленные данные из checkoutData (включая house)
                };
            } else if (checkoutData.address && checkoutData.address.street && checkoutData.address.city) {
                // Если checkoutData.address был установлен (отредактирован), но ID не совпадает или отсутствует,
                // всё равно используем его, так как он был отредактирован пользователем
                console.log('[validateAndSubmitOrder] ✅ Используем отредактированный адрес из checkoutData (был отредактирован)');
                addressData = {
                    ...addressData, // Базовые данные из savedAddresses
                    ...checkoutData.address // Обновленные данные из checkoutData (включая house)
                };
            }
        }
    }
    
    // Проверка даты доставки (после проверки адреса)
    // В упрощенном сценарии используем другие селекторы
    if (isSimpleCheckout) {
        // Убеждаемся, что календарь показан (но не создаем его заново)
        const summaryDateTimePicker = document.getElementById('summaryDateTimePicker');
        if (summaryDateTimePicker && summaryDateTimePicker.style.display === 'none') {
            // Показываем календарь, если он скрыт, но не инициализируем заново
            summaryDateTimePicker.style.display = 'block';
        }
        
        // Упрощенный сценарий - проверяем календарь на шаге 4
        if (deliveryDate) {
            // Убираем ошибки с календаря
            const summaryCalendar = document.getElementById('summaryCustomCalendar');
            if (summaryCalendar) {
                summaryCalendar.classList.remove('error-field');
            }
        } else {
            // Подсвечиваем календарь красным
            const summaryDeliveryDateAnchor = document.getElementById('anchor-summaryDeliveryDate');
            const summaryCalendar = document.getElementById('summaryCustomCalendar');
            if (summaryCalendar) {
                summaryCalendar.classList.add('error-field');
            }
            if (!firstErrorField) firstErrorField = summaryDeliveryDateAnchor || summaryCalendar;
            hasErrors = true;
        }
        
        // Проверка времени доставки в упрощенном сценарии
        if (!deliveryTime) {
            const summaryTimeOptions = document.getElementById('summaryDeliveryTimeOptions');
            const summaryDeliveryTimeAnchor = document.getElementById('anchor-summaryDeliveryTime');
            if (summaryTimeOptions) {
                // Добавляем красную рамку на все кнопки времени
                const timeSlotButtons = summaryTimeOptions.querySelectorAll('.time-slot-btn');
                timeSlotButtons.forEach(btn => {
                    btn.classList.add('error-time-slot');
                });
                if (!firstErrorField) firstErrorField = summaryDeliveryTimeAnchor || summaryTimeOptions;
                hasErrors = true;
            }
        } else {
            // Убираем ошибки с кнопок времени
            const summaryTimeOptions = document.getElementById('summaryDeliveryTimeOptions');
            if (summaryTimeOptions) {
                const timeSlotButtons = summaryTimeOptions.querySelectorAll('.time-slot-btn');
                timeSlotButtons.forEach(btn => {
                    btn.classList.remove('error-time-slot');
                });
            }
        }
    } else {
        // Обычный сценарий (4 шага)
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
        
        // Сбрасываем флаг отправки при ошибках валидации
        isSubmittingOrder = false;
        console.log('[validateAndSubmitOrder] 🔓 Флаг отправки сброшен (ошибки валидации)');
        
        // Важно: возвращаем false для предотвращения отправки формы
        return false;
    }
    
    // Формирование строки адреса
    let addressString = '';
    if (addressData.city) {
        addressString = addressData.city;
    }
    if (addressData.street) {
        addressString += addressString ? ', ' + addressData.street : addressData.street; // Теперь содержит "улица + дом"
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
    const total = flowersTotal + serviceFee + deliveryPrice;
    
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
        // --- КЛИЕНТ ---
        name: clientName,        // ← ИМЯ КЛИЕНТА из Telegram/профиля
        phone: clientPhone,      // ← ТЕЛЕФОН КЛИЕНТА из профиля
        email: clientEmail,      // ← EMAIL КЛИЕНТА из профиля (или из поля email)
        
        // --- ПОЛУЧАТЕЛЬ ---
        recipientName: recipientNameFromForm,   // ← ИМЯ ПОЛУЧАТЕЛЯ из формы
        recipientPhone: recipientPhoneFromForm, // ← ТЕЛЕФОН ПОЛУЧАТЕЛЯ из формы
        address: addressString,
        addressData: addressData,
        deliveryDate: deliveryDate,
        deliveryTime: deliveryTime,
        comment: comment, // Особые пожелания к заказу (user_comment)
        comment: comment, // Комментарий пользователя (для обратной совместимости)
        userComment: comment, // Комментарий пользователя (новое имя поля)
        orderComment: comment, // Дублируем для полной совместимости
        leaveAtDoor: leaveAtDoor, // Оставить у двери (boolean)
        courierComment: addressData?.comment || null, // Комментарий для курьера (courier_comment)
        userId: tg.initDataUnsafe?.user?.id || null,
        username: tg.initDataUnsafe?.user?.username || null,
        phone_number: tg.initDataUnsafe?.user?.phone_number || null // Номер телефона из Telegram (если доступен)
    };
    
    console.log('[validateAndSubmitOrder] 📦 orderData подготовлен для отправки:');
    console.log('[validateAndSubmitOrder]   - items:', orderData.items.length, 'товаров');
    console.log('[validateAndSubmitOrder]   - total:', orderData.total);
    console.log('[validateAndSubmitOrder]   - name:', orderData.name);
    console.log('[validateAndSubmitOrder]   - phone:', orderData.phone);
    console.log('[validateAndSubmitOrder]   - addressData:', JSON.stringify(orderData.addressData, null, 2));
    console.log('[validateAndSubmitOrder]   - address:', orderData.address);
    console.log('[validateAndSubmitOrder]   - deliveryDate:', orderData.deliveryDate);
    console.log('[validateAndSubmitOrder]   - deliveryTime:', orderData.deliveryTime);

    try {
        console.log('[validateAndSubmitOrder] 🚀 Отправка запроса на /api/orders');
        console.log('[validateAndSubmitOrder] 📤 Тело запроса:', JSON.stringify(orderData, null, 2));
        
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });
        
        console.log('[validateAndSubmitOrder] 📥 Получен ответ от сервера. Status:', response.status, response.statusText);

        // Проверяем статус ответа
        if (!response.ok) {
            let errorData;
            try {
                const text = await response.text();
                console.error('❌ Текст ответа сервера:', text);
                errorData = JSON.parse(text);
            } catch (parseError) {
                errorData = { error: `HTTP error! status: ${response.status}` };
            }
            console.error('❌ HTTP ошибка при создании заказа:', response.status, errorData);
            console.error('❌ Полный ответ сервера:', errorData);
            
            // Проверяем, является ли ошибка связанной с недостатком товара
            const errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
            if (errorMessage.includes('Недостаточно товара')) {
                // Показываем понятное сообщение пользователю
                if (tg && tg.showAlert) {
                    tg.showAlert(`❌ ${errorMessage}\n\nПожалуйста, уменьшите количество товара или выберите другой товар.`);
                } else {
                    alert(`❌ ${errorMessage}\n\nПожалуйста, уменьшите количество товара или выберите другой товар.`);
                }
                throw new Error(errorMessage);
            }
            
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        console.log('📦 Ответ от сервера при создании заказа:', result);
        
        // Проверяем успешность операции - явная проверка (orderId может быть числом или строкой)
        const hasOrderId = result.orderId !== undefined && result.orderId !== null;
        const isSuccess = result.success === true && hasOrderId;
        
        console.log('📦 Проверка успешности:', { 
            success: result.success, 
            orderId: result.orderId, 
            hasOrderId, 
            isSuccess 
        });
        
        if (isSuccess) {
            // Успешный ответ - обрабатываем заказ
            const orderId = parseInt(result.orderId) || result.orderId; // Приводим к числу, если возможно
            console.log('✅ Заказ успешно создан, ID:', orderId);
            
            // Сохраняем ИМЯ ПОЛУЧАТЕЛЯ в localStorage для будущих заказов
            if (recipientNameFromForm && recipientNameFromForm.trim()) {
                localStorage.setItem('flowbox_recipient_name', recipientNameFromForm.trim());
                console.log('[validateAndSubmitOrder] 💾 Сохранено имя получателя в localStorage:', recipientNameFromForm.trim());
            }
            
            try {
                tg.sendData(JSON.stringify(orderData));
            } catch (tgError) {
                console.warn('⚠️ Ошибка отправки данных в Telegram:', tgError);
                // Не критично, продолжаем обработку заказа
            }
            
            // Сохранение заказа в активные
            const order = {
                id: orderId,
                date: new Date().toLocaleDateString('ru-RU'),
                items: orderData.items,
                total: orderData.total,
                address: orderData.address,
                deliveryDate: orderData.deliveryDate,
                deliveryTime: orderData.deliveryTime,
                status: 'NEW',
                createdAt: new Date().toISOString()
            };
            
            console.log('📦 Добавляем заказ в активные:', order);
            userActiveOrders.push(order);
            console.log('📦 Активных заказов после добавления:', userActiveOrders.length);
            
            // Чистим корзину / чек-аут
            cart = [];
            saveCartToLocalStorage(cart);
            updateCartUI();
            
            checkoutData = {
                recipientName: '',
                recipientPhone: '',
                address: null,
                deliveryDate: '',
                deliveryTime: '',
                orderComment: '',
                leaveAtDoor: false
            };
            currentCheckoutStep = 1;
            
            // Скрываем все шаги оформления
            document.querySelectorAll('.checkout-step').forEach(step => {
                step.style.display = 'none';
                step.classList.remove('active');
            });
            
            // Скрываем все вкладки редактирования
            const editingTabs = ['editRecipientTab', 'editAddressTab', 'myAddressesTab'];
            editingTabs.forEach(tabId => {
                const tab = document.getElementById(tabId);
                if (tab) {
                    tab.style.display = 'none';
                }
            });
            
            // Скрываем элементы списка адресов
            const checkoutAddressesList = document.getElementById('checkoutAddressesList');
            const checkoutAddressForm = document.getElementById('checkoutAddressForm');
            const addNewAddressBtn = document.getElementById('addNewAddressBtn');
            if (checkoutAddressesList) checkoutAddressesList.style.display = 'none';
            if (checkoutAddressForm) checkoutAddressForm.style.display = 'none';
            if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
            
            // Прячем контейнер оформления, если есть
            const orderTabEl = document.getElementById('orderTab');
            if (orderTabEl) {
                orderTabEl.style.display = 'none';
                orderTabEl.classList.remove('active');
            }
            
            // Сбрасываем состояние чекаута
            checkoutMode = null;
            checkoutScreen = 'cart';
            currentCheckoutStep = 1;
            isSimpleCheckout = false;
            
            // ЯВНО показываем нижнее меню (оно было скрыто при переходе на orderTab)
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) {
                bottomNav.style.display = 'flex';
                bottomNav.classList.remove('hidden');
            }
            
            // Переключаемся на каталог через switchTab (консистентный способ)
            switchTab('menuTab');
            
            // Скрываем BackButton
            showBackButton(false);
            
            // Показываем алерт с номером заказа
            if (tg && tg.showAlert) {
                tg.showAlert(`Заказ #${orderId} успешно создан! Мы скоро всё подтвердим 😊`);
            }
            
            // Тактильная обратная связь
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            // Прокрутка в начало
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            
            // Сохраняем адреса и заказы на сервер асинхронно (не блокируем UI)
            if (savedAddresses.length > 0) {
                saveUserData().catch(err => {
                    console.warn('⚠️ Ошибка сохранения адресов (не критично):', err);
                });
            }
            
            // Разблокируем кнопку
            unlockSubmitButton();
            
            return;
        } else {
            // Если ответ не содержит success: true и orderId, считаем это ошибкой
            console.error('❌ Неожиданный формат ответа от сервера:', result);
            throw new Error(result.error || 'Заказ не был создан. Неожиданный формат ответа от сервера');
        }
    } catch (error) {
        console.error('❌ Ошибка отправки заказа:', error);
        console.error('Детали ошибки:', error.message, error.stack);
        
        // Разблокируем кнопку при ошибке
        unlockSubmitButton();
        
        // Сбрасываем флаг отправки при ошибке
        isSubmittingOrder = false;
        console.log('[validateAndSubmitOrder] 🔓 Флаг отправки сброшен (ошибка)');
        
        // Показываем ошибку только если экран успеха еще не показан
        if (!successOverlay.classList.contains('active')) {
            // Если ошибка связана с нехваткой товара, сообщение уже показано в блоке проверки ответа
            // Показываем общее сообщение только для других ошибок
            const isStockError = error.message && error.message.includes('Недостаточно товара');
            if (!isStockError) {
                // Для других ошибок показываем общее сообщение
                if (tg && tg.showAlert) {
                    tg.showAlert(`❌ Произошла ошибка при оформлении заказа.\n\n${error.message || 'Попробуйте еще раз.'}`);
                } else {
                    alert(`Произошла ошибка при оформлении заказа.\n\n${error.message || 'Попробуйте еще раз.'}`);
                }
            } else {
                console.log('[validateAndSubmitOrder] Сообщение о нехватке товара уже показано пользователю');
            }
        } else {
            console.warn('⚠️ Ошибка произошла, но экран успеха уже показан. Возможно, заказ был создан.');
        }
    } finally {
        // Гарантируем разблокировку кнопки в любом случае
        setTimeout(() => {
            unlockSubmitButton();
        }, 100);
    }
    
    // Сбрасываем флаг отправки при успешном завершении
    isSubmittingOrder = false;
    console.log('[validateAndSubmitOrder] 🔓 Флаг отправки сброшен (успех)');
    
    return true;
}

// Отправка заказа - обработчик submit формы
if (orderForm) {
    orderForm.addEventListener('submit', async (e) => {
        await validateAndSubmitOrder(e);
    }, false);
    
    // На мобильных Enter просто переносит фокус на следующее поле, не отправляя форму
    setupEnterKeyNavigation(orderForm);
}

// Функция для разблокировки кнопки
function unlockSubmitButton() {
    const submitBtn = document.querySelector('.submit-order-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Оплатить';
        console.log('✅ Кнопка "Оплатить" разблокирована');
    }
}

// Дополнительный обработчик клика на кнопку для Android (более надежный)
function setupSubmitButton() {
    const submitBtn = document.querySelector('.submit-order-btn');
    if (submitBtn) {
        // Удаляем старые обработчики, если они есть
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        
        // Добавляем обработчик на новую кнопку
        newSubmitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 Кнопка "Оплатить" нажата');
            
            // Проверяем, что кнопка не disabled
            if (newSubmitBtn.disabled) {
                console.warn('⚠️ Кнопка заблокирована');
                return;
            }
            
            // Временно блокируем кнопку для предотвращения двойного клика
            newSubmitBtn.disabled = true;
            newSubmitBtn.textContent = 'Обработка...';
            
            // Устанавливаем таймаут для автоматической разблокировки (30 секунд)
            const timeoutId = setTimeout(() => {
                console.warn('⚠️ Таймаут обработки заказа - разблокируем кнопку');
                unlockSubmitButton();
            }, 30000);
            
            try {
                await validateAndSubmitOrder(e);
                // Успешно завершено - разблокируем кнопку
                clearTimeout(timeoutId);
                unlockSubmitButton();
            } catch (error) {
                console.error('❌ Ошибка при обработке заказа:', error);
                clearTimeout(timeoutId);
                // Разблокируем кнопку при ошибке
                unlockSubmitButton();
                
                // Показываем пользователю сообщение об ошибке
                alert('Произошла ошибка при создании заказа. Пожалуйста, попробуйте еще раз.');
            }
        }, false);
        
        console.log('✅ Обработчик кнопки "Оплатить" установлен');
    } else {
        console.warn('⚠️ Кнопка "Оплатить" не найдена в DOM');
    }
}

// Устанавливаем обработчик при загрузке
setupSubmitButton();

// Также устанавливаем обработчик при переключении на вкладку заказа
const orderTabBtn = document.querySelector('[data-tab="orderTab"]');
if (orderTabBtn) {
    orderTabBtn.addEventListener('click', () => {
        setTimeout(setupSubmitButton, 100); // Небольшая задержка для обновления DOM
    });
}

// Возврат в магазин
backToShop.addEventListener('click', () => {
    successOverlay.classList.remove('active');
    // Убеждаемся, что нижнее меню видно после закрытия overlay
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.display = 'flex';
        bottomNav.classList.remove('hidden');
    }
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

// Страница адреса
const addressForm = document.getElementById('addressForm');
const addressCity = document.getElementById('addressCity');
const addressError = document.getElementById('addressError');
// Кнопка "Добавить новый адрес" удалена из профиля
// Кнопки "Назад" удалены - используем только BackButton от Telegram
const addressPageTitle = document.getElementById('addressPageTitle');
const deleteAddressBtn = document.getElementById('deleteAddressBtn');

const orderHistoryList = document.getElementById('orderHistoryList');
const orderHistoryBtn = document.getElementById('orderHistoryBtn');

const supportModal = document.getElementById('supportModal');
const closeSupportModal = document.getElementById('closeSupportModal');
const supportBtn = document.getElementById('supportBtn');


function resetAddressFormState() {
    if (!addressForm) return;
    addressForm.reset();
    
    // Устанавливаем город по умолчанию
    const cityField = document.getElementById('addressCity');
    if (cityField) {
        cityField.value = 'Санкт-Петербург';
    }
    
    if (addressError) addressError.style.display = 'none';
    
    const errorFields = addressForm.querySelectorAll('.error');
    errorFields.forEach(field => field.classList.remove('error'));
}

function setAddressFormValues(address) {
    if (!address) return;
    document.getElementById('addressCity').value = address.city || 'Санкт-Петербург';
    // Объединяем street и house для обратной совместимости со старыми адресами
    let streetValue = address.street || '';
    if (address.house && !streetValue.includes(address.house)) {
        // Если house есть и не включен в street, объединяем их
        streetValue = streetValue ? `${streetValue} ${address.house}` : address.house;
    }
    document.getElementById('addressStreet').value = streetValue;
    document.getElementById('addressEntrance').value = address.entrance || '';
    document.getElementById('addressApartment').value = address.apartment || '';
    document.getElementById('addressFloor').value = address.floor || '';
    document.getElementById('addressIntercom').value = address.intercom || '';
    document.getElementById('addressComment').value = address.comment || '';
}

function ensureAddressFormValidation() {
    if (!addressForm || addressForm.dataset.validationInitialized === 'true') return;
    addressForm.dataset.validationInitialized = 'true';
    
    const fields = addressForm.querySelectorAll('input, textarea');
    fields.forEach(field => {
        field.addEventListener('input', function() {
            if (this.value.trim()) {
                validateField(this, true);
            }
        });
        field.addEventListener('change', function() {
            if (this.value.trim()) {
                validateField(this, true);
            }
        });
    });
    
    if (addressCity && addressError) {
        addressCity.addEventListener('blur', function() {
            const city = this.value.trim();
            if (city && city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб') {
                validateField(this, false);
                addressError.style.display = 'block';
            } else if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
                validateField(this, true);
                addressError.style.display = 'none';
            } else if (!city) {
                addressError.style.display = 'none';
            }
        });
        
        addressCity.addEventListener('input', function() {
            const city = this.value.trim();
            if (city.toLowerCase() === 'санкт-петербург' || city.toLowerCase() === 'спб') {
                validateField(this, true);
                addressError.style.display = 'none';
            } else if (!city) {
                addressError.style.display = 'none';
            }
        });
    }
}

function openAddressPage(address = null) {
    // Используем универсальную функцию
    if (address && address.id) {
        openAddressForm({ mode: 'edit', source: 'profile', addressId: address.id });
    } else {
        openAddressForm({ mode: 'create', source: 'profile' });
    }
}

// Открытие модальных окон
// Кнопка "Добавить новый адрес" удалена из профиля

// Обработчик кнопки "Назад" удален - используем только BackButton от Telegram

orderHistoryBtn.addEventListener('click', () => {
    switchTab('orderHistoryTab');
    loadOrderHistory();
});

// Обработчик кнопки добавления на главный экран
const addToHomeScreenBtn = document.getElementById('addToHomeScreenBtn');
const addToHomeScreenModal = document.getElementById('addToHomeScreenModal');
const closeAddToHomeModal = document.getElementById('closeAddToHomeModal');
const openInBrowserBtn = document.getElementById('openInBrowserBtn');

// Функция для добавления на главный экран через Telegram WebApp API
async function maybeAskAddToHome() {
    if (!tg || !tg.checkHomeScreenStatus || !tg.addToHomeScreen) {
        console.log('[home] API недоступно');
        return false;
    }

    try {
        // Узнаём статус
        const status = await tg.checkHomeScreenStatus();
        console.log('[home] status =', status);
        // варианты: 'unsupported' | 'unknown' | 'added' | 'can_be_added'

        if (status === 'can_be_added') {
            console.log('[home] показываем диалог добавления на главный экран');
            tg.addToHomeScreen();
            return true;
        } else if (status === 'added') {
            console.log('[home] уже добавлено на главный экран');
            return false;
        } else {
            console.log('[home] статус:', status);
            return false;
        }
    } catch (e) {
        console.error('[home] ошибка при проверке статуса:', e);
        return false;
    }
}

if (addToHomeScreenBtn) {
    addToHomeScreenBtn.addEventListener('click', async () => {
        const platform = tg?.platform || 'unknown';
        console.log('[home] платформа:', platform);

        if (platform === 'android') {
            // Для Android используем нативный метод Telegram WebApp
            const success = await maybeAskAddToHome();
            if (!success) {
                // Если метод не сработал, показываем инструкции
                if (addToHomeScreenModal) {
                    addToHomeScreenModal.style.display = 'flex';
                    lockBodyScroll();
                    showBackButton(true);
                }
            }
        } else if (platform === 'ios') {
            // Для iOS: открываем ссылку в Safari
            const link = 'https://t.me/FlowboxBot/?startapp&addToHomeScreen';
            if (tg && tg.openLink) {
                tg.openLink(link, { try_instant_view: false });
            } else {
                window.open(link, '_blank');
            }
        } else {
            // Для других платформ: показываем инструкции
            if (addToHomeScreenModal) {
                addToHomeScreenModal.style.display = 'flex';
                lockBodyScroll();
                showBackButton(true);
            }
        }
    });
}

if (closeAddToHomeModal) {
    closeAddToHomeModal.addEventListener('click', () => {
        if (addToHomeScreenModal) {
            addToHomeScreenModal.style.display = 'none';
            unlockBodyScroll();
            tg.BackButton.hide();
        }
    });
}

if (openInBrowserBtn) {
    openInBrowserBtn.addEventListener('click', () => {
        // Открываем текущий URL в системном браузере
        const currentUrl = window.location.href;
        if (tg && tg.openLink) {
            tg.openLink(currentUrl, { try_instant_view: false });
        } else {
            window.open(currentUrl, '_blank');
        }
    });
}

supportBtn.addEventListener('click', async () => {
    // Открываем бота с командой /support через Telegram WebApp API
    // Получаем имя бота из API
    let botUsername = 'FlowboxBot'; // Дефолтное имя
    
    try {
        const response = await fetch('/api/bot-info');
        if (response.ok) {
            const botInfo = await response.json();
            if (botInfo && botInfo.username) {
                botUsername = botInfo.username;
            }
        }
    } catch (e) {
        console.log('Не удалось получить имя бота, используем дефолтное');
    }
    
    const supportUrl = `https://t.me/${botUsername}?start=support`;
    
    if (tg && tg.openTelegramLink) {
        // Используем Telegram WebApp API для открытия бота
        tg.openTelegramLink(supportUrl);
        // Закрываем мини-апп, чтобы вернуть пользователя в чат
        if (tg.close) {
            tg.close();
        }
    } else if (tg && tg.openLink) {
        // Fallback: используем openLink
        tg.openLink(supportUrl);
        // Закрываем мини-апп, чтобы вернуть пользователя в чат
        if (tg.close) {
            tg.close();
        }
    } else {
        // Последний fallback: закрываем MiniApp и открываем бота
        if (tg && tg.close) {
            tg.close();
        }
        if (tg.initDataUnsafe?.user) {
            window.open(supportUrl, '_blank');
        }
    }
});

// Закрытие модальных окон
// Функции для блокировки/разблокировки прокрутки фона
function lockBodyScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
}

function unlockBodyScroll() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
}

// Закрытие истории заказов теперь через BackButton в switchTab

closeSupportModal.addEventListener('click', () => {
    supportModal.style.display = 'none';
    tg.BackButton.hide();
    unlockBodyScroll();
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

// Красивое форматирование номера телефона в реальном времени (используется в заказе и профиле)
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
    
    phoneField.addEventListener('input', function() {
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

// Редактирование адреса
function editAddress(idFromDom) {
    const id = Number(idFromDom);
    
    console.log('[editAddress] 🚀 Редактирование адреса с ID:', id);
    console.log('[editAddress] 📦 savedAddresses ids:', savedAddresses.map(a => a.id));
    
    const addr = savedAddresses.find(a => Number(a.id) === id);
    
    if (!addr) {
        console.warn('[editAddress] ❌ Адрес с ID', id, 'не найден в savedAddresses');
        return;
    }
    
    openAddressForm({ mode: 'edit', source: 'profile', addressId: id });
}

// Удаление адреса
function deleteAddress(addressId) {
    if (confirm('Вы уверены, что хотите удалить этот адрес?')) {
        const filtered = savedAddresses.filter(a => String(a.id) !== String(addressId));
        setSavedAddresses(filtered);
        saveUserData(); // Сохраняем на сервер
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Универсальная функция открытия формы адреса
function openAddressForm({ mode = 'create', source = 'profile', addressId = null } = {}) {
    if (!addressForm) {
        console.error('[openAddressForm] addressForm не найден');
        return;
    }
    
    let initialData = null;
    
    if (mode === 'edit' && addressId != null) {
        const id = Number(addressId);
        initialData = savedAddresses.find(a => Number(a.id) === id) || null;
        if (!initialData) {
            console.warn('[openAddressForm] Адрес с ID', id, 'не найден');
            return;
        }
    }
    
    // Заполняем форму
    ensureAddressFormValidation();
    resetAddressFormState();
    
    if (initialData) {
        setAddressFormValues(initialData);
        if (addressPageTitle) addressPageTitle.textContent = initialData.name || 'Редактировать адрес';
        if (deleteAddressBtn) deleteAddressBtn.style.display = 'block';
        editingAddressId = initialData.id;
    } else {
        if (addressPageTitle) addressPageTitle.textContent = 'Новый адрес';
        if (deleteAddressBtn) deleteAddressBtn.style.display = 'none';
        editingAddressId = null;
    }
    
    // Сохраняем метаданные в форме
    addressForm.dataset.mode = mode;
    addressForm.dataset.source = source;
    addressForm.dataset.addressId = addressId != null ? String(addressId) : '';
    
    // Показываем форму
    if (source === 'checkout') {
        // Для чекаута показываем форму прямо на шаге 2
        const checkoutAddressForm = document.getElementById('checkoutAddressForm');
        const checkoutAddressesList = document.getElementById('checkoutAddressesList');
        const addNewAddressBtn = document.getElementById('addNewAddressBtn');
        
        if (checkoutAddressForm) checkoutAddressForm.style.display = 'block';
        if (checkoutAddressesList) checkoutAddressesList.style.display = 'none';
        if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
    } else if (source === 'simple') {
        // Для упрощенного режима показываем форму редактирования адреса
        const editAddressTab = document.getElementById('editAddressTab');
        const editAddressCity = document.getElementById('editAddressCity');
        const editAddressStreet = document.getElementById('editAddressStreet');
        const editAddressApartment = document.getElementById('editAddressApartment');
        const editAddressFloor = document.getElementById('editAddressFloor');
        const editAddressEntrance = document.getElementById('editAddressEntrance');
        const editAddressIntercom = document.getElementById('editAddressIntercom');
        const editAddressComment = document.getElementById('editAddressComment');
        
        if (!editAddressTab) {
            console.error('[openAddressForm] editAddressTab не найден');
            return;
        }
        
        // Заполняем форму редактирования адреса
        if (initialData) {
            // Формируем street из street и house для отображения в поле ввода
            let streetValue = initialData.street || '';
            const houseValue = initialData.house || '';
            if (houseValue && !streetValue.includes(houseValue)) {
                streetValue = streetValue ? `${streetValue} ${houseValue}` : houseValue;
            }
            
            if (editAddressCity) editAddressCity.value = initialData.city || 'Санкт-Петербург';
            if (editAddressStreet) editAddressStreet.value = streetValue;
            if (editAddressApartment) editAddressApartment.value = initialData.apartment || '';
            if (editAddressFloor) editAddressFloor.value = initialData.floor || '';
            if (editAddressEntrance) editAddressEntrance.value = initialData.entrance || '';
            if (editAddressIntercom) editAddressIntercom.value = initialData.intercom || '';
            if (editAddressComment) editAddressComment.value = initialData.comment || '';
            
            // Сохраняем ID редактируемого адреса
            editAddressTab.dataset.editingAddressId = initialData.id;
        } else {
            // Очищаем форму для нового адреса
            if (editAddressCity) editAddressCity.value = 'Санкт-Петербург';
            if (editAddressStreet) editAddressStreet.value = '';
            if (editAddressApartment) editAddressApartment.value = '';
            if (editAddressFloor) editAddressFloor.value = '';
            if (editAddressEntrance) editAddressEntrance.value = '';
            if (editAddressIntercom) editAddressIntercom.value = '';
            if (editAddressComment) editAddressComment.value = '';
            
            // Удаляем ID редактируемого адреса
            delete editAddressTab.dataset.editingAddressId;
        }
        
        // Скрываем все вкладки
        document.querySelectorAll('.tab-content').forEach(tab => {
            if (tab.id !== 'editAddressTab') {
                tab.style.display = 'none';
            }
        });
        
        // Скрываем все шаги checkout
        document.querySelectorAll('.checkout-step').forEach(s => {
            s.classList.remove('active');
            s.style.display = 'none';
        });
        
        // Скрываем заголовок
        const orderPageHeader = document.querySelector('.order-page-header');
        if (orderPageHeader) {
            orderPageHeader.style.display = 'none';
        }
        
        // Показываем форму редактирования
        editAddressTab.style.display = 'block';
        
        // Устанавливаем правильный checkoutScreen
        checkoutScreen = 'editAddress';
        console.log('[SimpleMenu] 📍 Переход: открытие формы адреса, checkoutScreen:', checkoutScreen, 'mode:', mode);
        
        // Прокручиваем страницу вверх
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        
        showBackButton(true);
    } else {
        // Для профиля переключаемся на вкладку адресов
        switchTab('addressTab');
        showBackButton(true);
    }
}

// Универсальный обработчик сабмита формы адреса
async function handleAddressFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const mode = form.dataset.mode || 'create';
    const source = form.dataset.source || 'profile';
    const addressId = form.dataset.addressId ? Number(form.dataset.addressId) : null;
    
    // Валидация (используем существующую логику)
    // Для упрощенного режима используем поля из editAddressTab
    let addressCityField, addressStreetField, addressApartmentField, addressFloorField, addressEntranceField, addressIntercomField, addressCommentField;
    
    if (source === 'simple') {
        addressCityField = document.getElementById('editAddressCity');
        addressStreetField = document.getElementById('editAddressStreet');
        addressApartmentField = document.getElementById('editAddressApartment');
        addressFloorField = document.getElementById('editAddressFloor');
        addressEntranceField = document.getElementById('editAddressEntrance');
        addressIntercomField = document.getElementById('editAddressIntercom');
        addressCommentField = document.getElementById('editAddressComment');
    } else {
        addressCityField = document.getElementById('addressCity');
        addressStreetField = document.getElementById('addressStreet');
        addressApartmentField = document.getElementById('addressApartment');
        addressFloorField = document.getElementById('addressFloor');
        addressEntranceField = document.getElementById('addressEntrance');
        addressIntercomField = document.getElementById('addressIntercom');
        addressCommentField = document.getElementById('addressComment');
    }
    
    const city = addressCityField ? addressCityField.value.trim() : '';
    const street = addressStreetField ? addressStreetField.value.trim() : '';
    
    if (!city || (city.toLowerCase() !== 'санкт-петербург' && city.toLowerCase() !== 'спб')) {
        if (addressCityField) validateField(addressCityField, false);
        return;
    }
    if (!street) {
        if (addressStreetField) validateField(addressStreetField, false);
        return;
    }
    
    // Извлекаем номер дома из street
    let houseValue = '';
    let streetValue = street || '';
    if (streetValue) {
        const houseMatch = streetValue.match(/\s+(\d+[а-яА-Яa-zA-ZкК\s]*?)$/);
        if (houseMatch && houseMatch[1]) {
            houseValue = houseMatch[1].trim();
            streetValue = streetValue.replace(/\s+\d+[а-яА-ЯкКa-zA-Z\s]*?$/, '').trim();
        }
    }
    
    const addressName = streetValue ? (houseValue ? `${streetValue} ${houseValue}` : streetValue) : 'Адрес';
    
    const payload = {
        name: addressName,
        city: city,
        street: streetValue || street,
        house: houseValue,
        entrance: addressEntranceField ? addressEntranceField.value.trim() : '',
        apartment: addressApartmentField ? addressApartmentField.value.trim() : '',
        floor: addressFloorField ? addressFloorField.value.trim() : '',
        intercom: addressIntercomField ? addressIntercomField.value.trim() : '',
        comment: addressCommentField ? addressCommentField.value.trim() : ''
    };
    
    // Подготавливаем обновленный список адресов
    let updatedAddresses = [...savedAddresses];
    
    if (mode === 'edit' && addressId != null) {
        const index = updatedAddresses.findIndex(a => Number(a.id) === Number(addressId));
        if (index !== -1) {
            updatedAddresses[index] = { ...updatedAddresses[index], ...payload, id: addressId };
        }
    } else {
        // Проверка на дубликаты
        const isDuplicate = updatedAddresses.some(existingAddr => {
            const sameCity = (existingAddr.city || '').toLowerCase().trim() === (payload.city || '').toLowerCase().trim();
            const sameStreet = (existingAddr.street || '').toLowerCase().trim() === (payload.street || '').toLowerCase().trim();
            const sameApartment = (existingAddr.apartment || '').toLowerCase().trim() === (payload.apartment || '').toLowerCase().trim();
            return sameCity && sameStreet && sameApartment;
        });
        
        if (!isDuplicate) {
            updatedAddresses.push({ ...payload, id: null });
        }
    }
    
    // Сохраняем локальную копию для восстановления, если сервер вернет пустой массив
    const localAddressesBackup = [...updatedAddresses];
    
    // Используем единый сеттер для обновления локально (оптимистичное обновление UI)
    setSavedAddresses(updatedAddresses);
    
    // Сохраняем на сервер
    await saveUserData();
    
    // Проверяем, что сервер вернул адреса (не пустой массив)
    // Если savedAddresses стал пустым после saveUserData, восстанавливаем из локальной копии
    if (savedAddresses.length === 0 && localAddressesBackup.length > 0) {
        console.warn('[handleAddressFormSubmit] ⚠️ Сервер вернул пустой массив адресов, восстанавливаем из локальной копии');
        setSavedAddresses(localAddressesBackup);
        // Пробуем сохранить еще раз через небольшую задержку
        setTimeout(async () => {
            await saveUserData();
        }, 500);
    }
    
    // После сохранения savedAddresses уже обновлён из ответа сервера через setSavedAddresses в saveUserData
    // Находим только что созданный/обновленный адрес
    let createdAddressId = null;
    if (mode === 'create') {
        // Находим только что созданный адрес
        const createdAddress = savedAddresses.find(addr => {
            const sameCity = (addr.city || '').toLowerCase().trim() === (payload.city || '').toLowerCase().trim();
            const sameStreet = (addr.street || '').toLowerCase().trim() === (payload.street || '').toLowerCase().trim();
            const sameApartment = (addr.apartment || '').toLowerCase().trim() === (payload.apartment || '').toLowerCase().trim();
            return sameCity && sameStreet && sameApartment && addr.id && typeof addr.id === 'number' && addr.id > 0;
        });
        if (createdAddress && createdAddress.id) {
            createdAddressId = createdAddress.id;
        }
    } else if (addressId) {
        createdAddressId = addressId;
    }
    
    resetAddressFormState();
    editingAddressId = null;
    
    // Если форма была открыта со страницы чекаута — сразу выбираем этот адрес
    if (source === 'checkout' && createdAddressId) {
        console.log('[handleAddressFormSubmit] ✅ Создан адрес на шаге 2, выбираем его:', createdAddressId);
        selectCheckoutAddress(createdAddressId);
        
        // Скрываем форму и показываем список
        const checkoutAddressForm = document.getElementById('checkoutAddressForm');
        const checkoutAddressesList = document.getElementById('checkoutAddressesList');
        const addNewAddressBtn = document.getElementById('addNewAddressBtn');
        
        if (checkoutAddressForm) checkoutAddressForm.style.display = 'none';
        if (checkoutAddressesList) checkoutAddressesList.style.display = 'block';
        if (addNewAddressBtn) addNewAddressBtn.style.display = 'block';
    } else if (source === 'simple') {
        // В упрощенном режиме возвращаемся на вкладку оформления
        console.log('[handleAddressFormSubmit] ✅ Адрес сохранен в упрощенном режиме, возвращаемся на вкладку оформления');
        
        // Скрываем форму редактирования
        const editAddressTab = document.getElementById('editAddressTab');
        if (editAddressTab) {
            editAddressTab.style.display = 'none';
        }
        
        // Если адрес был создан или обновлен, обновляем checkoutData
        if (createdAddressId) {
            const updatedAddr = savedAddresses.find(a => Number(a.id) === Number(createdAddressId));
            if (updatedAddr) {
                checkoutData.addressId = updatedAddr.id;
                checkoutData.address = {
                    id: updatedAddr.id,
                    city: updatedAddr.city || 'Санкт-Петербург',
                    street: updatedAddr.street || '',
                    house: updatedAddr.house || '',
                    apartment: updatedAddr.apartment || '',
                    floor: updatedAddr.floor || '',
                    entrance: updatedAddr.entrance || '',
                    intercom: updatedAddr.intercom || '',
                    comment: updatedAddr.comment || ''
                };
            }
        }
        
        // Возвращаемся на вкладку оформления
        showSimpleSummary();
    } else if (source === 'profile') {
        // Возвращаемся в профиль
    switchTab('profileTab');
        if (tg && tg.BackButton) {
    tg.BackButton.hide();
        }
    }
    
    tg.HapticFeedback.impactOccurred('success');
}

// Обработка формы адреса (универсальный обработчик)
if (addressForm) {
    addressForm.addEventListener('submit', handleAddressFormSubmit);
}

// Обработка удаления адреса
if (deleteAddressBtn) {
    deleteAddressBtn.addEventListener('click', async () => {
        if (editingAddressId && confirm('Вы уверены, что хотите удалить этот адрес?')) {
            const idToDelete = editingAddressId;
            const filtered = savedAddresses.filter(a => String(a.id) !== String(idToDelete));
            // Используем единый сеттер
            setSavedAddresses(filtered);
            // Сохраняем на сервер
            await saveUserData();
            resetAddressFormState();
            editingAddressId = null;
            if (addressPageTitle) addressPageTitle.textContent = 'Новый адрес';
            deleteAddressBtn.style.display = 'none';
            switchTab('profileTab');
            if (tg && tg.BackButton) {
            tg.BackButton.hide();
            }
            tg.HapticFeedback.impactOccurred('light');
        }
    });
}

ensureAddressFormValidation();
// На странице профиля Enter в форме адреса просто переходит к следующему полю
setupEnterKeyNavigation(addressForm);

// Текущий редактируемый адрес
let editingAddressId = null;

// Рендеринг адресов в профиле (профиль всегда рисуем из savedAddresses)
function renderProfileAddresses() {
    const list = document.getElementById('deliveryAddressesList');
    if (!list) return;
    
        if (savedAddresses.length === 0) {
        list.innerHTML = '<p class="no-addresses">У вас нет сохраненных адресов доставки</p>';
        return;
    }
    
    list.innerHTML = savedAddresses.map(addr => {
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
        
        const addressId = addr.id;
                
                return `
            <div class="address-item" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #eee;">
                <div class="address-item-content" style="flex: 1;">
                        <div class="address-item-name">${streetName}</div>
                        ${detailsStr ? `<div class="address-item-details">${detailsStr}</div>` : ''}
                    </div>
                <div class="address-menu" style="position: relative;">
                    <button class="address-menu-btn" onclick="event.stopPropagation(); toggleAddressMenu(${addressId})" style="background: none; border: none; padding: 8px; cursor: pointer; color: #666;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="5" r="1"/>
                            <circle cx="12" cy="12" r="1"/>
                            <circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                    <div class="address-menu-dropdown" id="addressMenu${addressId}" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 10000; min-width: 150px; margin-top: 4px;">
                        <button onclick="event.stopPropagation(); editAddressFromProfile(${addressId})" style="width: 100%; padding: 12px; text-align: left; background: none; border: none; cursor: pointer; border-bottom: 1px solid #eee;">
                            Изменить
                        </button>
                        <button onclick="event.stopPropagation(); deleteAddressFromProfile(${addressId})" style="width: 100%; padding: 12px; text-align: left; background: none; border: none; cursor: pointer; color: #ff4444;">
                            Удалить
                    </button>
                    </div>
                </div>
                </div>
            `;
            }).join('');
}

// Загрузка сохраненных адресов (только рендеринг, не меняет savedAddresses)
function loadSavedAddresses() {
    console.log('[loadSavedAddresses] 🚀 Рендеринг адресов, savedAddresses.length:', savedAddresses.length);
    
    // Если savedAddresses пустой, пробуем загрузить из localStorage (только для отображения)
    // НО не перезаписываем savedAddresses, если он уже заполнен
    if (savedAddresses.length === 0) {
        try {
            const savedAddressesLocal = localStorage.getItem('savedAddresses');
            if (savedAddressesLocal) {
                const addresses = JSON.parse(savedAddressesLocal);
                if (Array.isArray(addresses) && addresses.length > 0) {
                    // Только для отображения, не меняем глобальный savedAddresses
                    // setSavedAddresses будет вызван из loadUserData
                    console.log('[loadSavedAddresses] 📦 Найдены адреса в localStorage, но не загружаем (ждем loadUserData)');
                }
            }
        } catch (e) {
            console.error('[loadSavedAddresses] ❌ Ошибка чтения из localStorage:', e);
        }
    }
    
    // Рендерим профиль
    renderProfileAddresses();
    
    // Обновление списка адресов в форме заказа
    if (typeof window.renderAddressOptions === 'function') {
        window.renderAddressOptions();
    }
    
    // Обновляем список адресов на шаге 2, если он активен
    if (currentCheckoutStep === 2 && typeof renderCheckoutAddresses === 'function') {
        renderCheckoutAddresses();
    }
    
    console.log('[loadSavedAddresses] ✅ Рендеринг завершен');
}

// Заполнение формы заказа адресом
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

function clearOrderAddressErrors() {
    const fields = [
        'orderAddressCity',
        'orderAddressStreet',
        'orderAddressEntrance',
        'orderAddressApartment',
        'orderAddressFloor',
        'orderAddressIntercom',
        'orderAddressComment'
    ];
    fields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.classList.remove('error');
    });
    const orderAddressError = document.getElementById('orderAddressError');
    if (orderAddressError) orderAddressError.style.display = 'none';
}

function clearOrderAddressFields() {
    // Очищаем все поля, кроме города (он остается "Санкт-Петербург")
    const cityField = document.getElementById('orderAddressCity');
    if (cityField) {
        cityField.value = 'Санкт-Петербург';
        cityField.classList.remove('error');
    }
    
    const fields = [
        'orderAddressStreet',
        'orderAddressHouse',
        'orderAddressEntrance',
        'orderAddressApartment',
        'orderAddressFloor',
        'orderAddressIntercom',
        'orderAddressComment'
    ];
    fields.forEach(id => {
        const field = document.getElementById(id);
        if (field) {
            field.value = '';
            field.classList.remove('error');
        }
    });
    const orderAddressError = document.getElementById('orderAddressError');
    if (orderAddressError) orderAddressError.style.display = 'none';
}

// Возвращает человекочитаемый текст статуса
function getOrderStatusText(status) {
  switch (status) {
    case 'UNPAID':
      return 'Не оплачен';
    case 'NEW':
      return 'В обработке';
    case 'PROCESSING':
      return 'Принят';
    case 'COLLECTING':
      return 'Собирается';
    case 'DELIVERING':
      return 'В пути';
    case 'COMPLETED':
      return 'Доставлен';
    case 'CANCELED':
      return 'Отменён';
    default:
      return 'Неизвестный статус';
  }
}

// Возвращает CSS-класс для бейджа статуса
function getOrderStatusClass(status) {
  switch (status) {
    case 'UNPAID':
      return 'status-unpaid';
    case 'NEW':
      return 'status-new'; // В обработке - серый
    case 'PROCESSING':
      return 'status-processing'; // Принят - слабо зеленый
    case 'COLLECTING':
      return 'status-collecting'; // Сборка - желтый
    case 'DELIVERING':
      return 'status-delivering'; // В пути - синий
    case 'COMPLETED':
      return 'status-completed'; // Доставлен - залит зеленый
    case 'CANCELED':
      return 'status-canceled'; // Отменён - залит красный
    default:
      return 'status-unknown';
  }
}

// Загрузка активных заказов
function loadActiveOrders() {
    const filteredActiveOrders = userActiveOrders;
    const activeOrdersContainer = document.getElementById('activeOrders');
    
    if (activeOrdersContainer) {
        if (filteredActiveOrders.length === 0) {
            activeOrdersContainer.innerHTML = '<p class="no-orders">У вас нет активных заказов</p>';
        } else {
            // Рендерим как вертикальный список
            activeOrdersContainer.innerHTML = filteredActiveOrders.map(order => {
                const statusText = getOrderStatusText(order.status);
                const statusClass = getOrderStatusClass(order.status);
                
                // Форматируем дату доставки для отображения
                let deliveryDateFormatted = '';
                if (order.deliveryDate) {
                    try {
                        const deliveryDate = new Date(order.deliveryDate);
                        deliveryDateFormatted = deliveryDate.toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'long'
                        });
                    } catch (e) {
                        deliveryDateFormatted = order.deliveryDate;
                    }
                }
                
                // Форматируем время доставки (если формат "10-12", преобразуем в "10:00–12:00")
                let deliveryTimeFormatted = order.deliveryTime || '';
                if (deliveryTimeFormatted && !deliveryTimeFormatted.includes(':')) {
                    const timeParts = deliveryTimeFormatted.split('-');
                    if (timeParts.length === 2) {
                        deliveryTimeFormatted = `${timeParts[0]}:00–${timeParts[1]}:00`;
                    }
                }
                
                // Получаем первые 2 товара для мини-фото
                const items = order.items || [];
                const firstItems = items.slice(0, 2);
                
                return `
                <div class="order-card-carousel" onclick="openOrderDetail(${order.id})">
                    <div class="order-card-header">
                        <h4>Заказ #${order.id}</h4>
                        <span class="order-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="order-card-info">
                        <p class="order-card-date">${order.date || ''}</p>
                        <p class="order-card-total">${order.total} ₽</p>
                    </div>
                    ${firstItems.length > 0 ? `
                        <div class="order-card-items-preview">
                            ${firstItems.map(item => `
                                <div class="order-item-preview">${item.name || 'Товар'}</div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            }).join('');
        }
    }
}

// Функция для открытия детального экрана заказа
function openOrderDetail(orderId) {
    const order = userActiveOrders.find(o => o.id === orderId);
    if (!order) return;
    
    // Показываем модальное окно с деталями заказа
    // Можно использовать существующее модальное окно или создать новое
    alert(`Детали заказа #${orderId}\n\nСтатус: ${getOrderStatusText(order.status)}\nСумма: ${order.total} ₽\nДата: ${order.date}`);
}

// Загрузка истории заказов
function loadOrderHistory() {
    // В истории показываем только завершенные заказы (COMPLETED и CANCELED)
    // Активные заказы (NEW, PROCESSING, COLLECTING, DELIVERING) не показываем в истории
    const allOrders = userCompletedOrders.filter(order => {
        const status = order.status?.toUpperCase();
        return status === 'COMPLETED' || status === 'CANCELED';
    }).sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    if (allOrders.length === 0) {
        orderHistoryList.innerHTML = '<p class="no-orders">Заказов пока нет</p>';
    } else {
        orderHistoryList.innerHTML = allOrders.map(order => `
            <div class="order-history-item">
                <div class="order-item-header">
                    <h4>Заказ #${order.id}</h4>
                    <span class="order-status ${getOrderStatusClass(order.status)}">${getOrderStatusText(order.status)}</span>
                </div>
                <p>Дата: ${order.date}</p>
                <p>Сумма: ${order.total} ₽</p>
                ${order.status === 'UNPAID' || order.status === 'unpaid' ? '<button class="pay-btn">Оплатить</button>' : ''}
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
    const user = tg.initDataUnsafe?.user;
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
    const editProfileNameField = document.getElementById('editProfileName');
    const editProfilePhoneField = document.getElementById('editProfilePhone');
    const editProfileEmailField = document.getElementById('editProfileEmail');
    
    if (profileData) {
        editProfileNameField.value = profileData.name || '';
        editProfilePhoneField.value = profileData.phone || '';
        editProfileEmailField.value = profileData.email || '';
    } else {
        // Заполнение из Telegram
        if (user) {
            const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            editProfileNameField.value = fullName || '';
        }
        editProfilePhoneField.value = '';
        editProfileEmailField.value = '';
    }
    
    // Очистка ошибок
    validateField(editProfileNameField, true);
    validateField(editProfilePhoneField, true);
    validateField(editProfileEmailField, true);
    
    profileEditModal.style.display = 'flex';
    lockBodyScroll();
    showBackButton(true);
    
    // Настройка форматирования телефона
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
            setTimeout(() => {
                actualField.dispatchEvent(new Event('input', { bubbles: true }));
            }, 10);
        }
    }
    
    // Валидация в реальном времени
    editProfileNameField.addEventListener('input', function() {
        const name = this.value.trim();
        if (name && name.length >= 2) {
            validateField(this, true);
        }
    });
    
    editProfileEmailField.addEventListener('input', function() {
        const email = this.value.trim();
        if (email && validateEmail(email)) {
            validateField(this, true);
        }
    });
    
    editProfileEmailField.addEventListener('blur', function() {
        const email = this.value.trim();
        if (email && !validateEmail(email)) {
            validateField(this, false);
        }
    });
});

closeProfileEditModal.addEventListener('click', () => {
    profileEditModal.style.display = 'none';
    tg.BackButton.hide();
    unlockBodyScroll();
});

profileEditForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Валидация полей
    let hasErrors = false;
    let firstErrorField = null;
    
    const nameField = document.getElementById('editProfileName');
    const phoneField = window.editProfilePhoneField || document.getElementById('editProfilePhone');
    const emailField = document.getElementById('editProfileEmail');
    
    // Валидация имени
    const name = nameField.value.trim();
    if (!name || name.length < 2) {
        validateField(nameField, false);
        if (!firstErrorField) firstErrorField = document.getElementById('anchor-editProfileName') || nameField;
        hasErrors = true;
    } else {
        validateField(nameField, true);
    }
    
    // Валидация телефона
    let phoneValue = phoneField ? phoneField.value : '';
    if (!phoneValue || phoneValue.trim() === '') {
        validateField(phoneField, false);
        if (!firstErrorField) firstErrorField = document.getElementById('anchor-editProfilePhone') || phoneField;
        hasErrors = true;
    } else {
        // Проверяем, что номер содержит достаточно цифр
        const phoneDigits = phoneValue.replace(/\D/g, '');
        if (phoneDigits.length < 11) {
            validateField(phoneField, false);
            if (!firstErrorField) firstErrorField = document.getElementById('anchor-editProfilePhone') || phoneField;
            hasErrors = true;
        } else {
            validateField(phoneField, true);
        }
    }
    
    // Валидация email
    const email = emailField.value.trim();
    if (!email) {
        validateField(emailField, false);
        if (!firstErrorField) firstErrorField = document.getElementById('anchor-editProfileEmail') || emailField;
        hasErrors = true;
    } else if (!validateEmail(email)) {
        validateField(emailField, false);
        if (!firstErrorField) firstErrorField = document.getElementById('anchor-editProfileEmail') || emailField;
        hasErrors = true;
    } else {
        validateField(emailField, true);
    }
    
    // Если есть ошибки, прокручиваем к первой
    if (hasErrors) {
        if (firstErrorField) {
            setTimeout(() => {
                try {
                    if (firstErrorField.scrollIntoView) {
                        firstErrorField.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                    
                    const rect = firstErrorField.getBoundingClientRect();
                    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                    const targetScroll = currentScroll + rect.top - 150;
                    
                    let startTime = null;
                    const duration = 300;
                    function animateScroll(currentTime) {
                        if (!startTime) startTime = currentTime;
                        const progress = Math.min((currentTime - startTime) / duration, 1);
                        window.scrollTo(0, currentScroll + (targetScroll - currentScroll) * progress);
                        if (progress < 1) {
                            requestAnimationFrame(animateScroll);
                        }
                    }
                    requestAnimationFrame(animateScroll);
                    
                    const inputField = firstErrorField.querySelector('input') || firstErrorField;
                    if (inputField && inputField.focus) {
                        setTimeout(() => {
                            try {
                                inputField.focus();
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
                    try {
                        if (firstErrorField.scrollIntoView) {
                            firstErrorField.scrollIntoView();
                        }
                    } catch (e) {
                        console.error('Критическая ошибка прокрутки:', e);
                    }
                }
            }, 100);
        }
        return;
    }
    
    // Форматируем номер перед сохранением
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
    
    // Нормализуем email перед сохранением
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
    unlockBodyScroll();
    tg.HapticFeedback.notificationOccurred('success');
});

// В форме редактирования профиля Enter просто переходит к следующему полю
setupEnterKeyNavigation(profileEditForm);

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
function initServiceFeeHelpModal() {
    const modal = document.getElementById('serviceFeeHelpModal');
    const helpBtn = document.getElementById('serviceFeeHelpBtn');
    const closeBtn = document.getElementById('closeServiceFeeHelpModal');
    
    if (!modal || !helpBtn || !closeBtn) {
        console.warn('Элементы модального окна сборов не найдены');
        return;
    }
    
    // Прямой обработчик на кнопку помощи
    helpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'flex';
        lockBodyScroll();
        showBackButton(true);
        tg.HapticFeedback.impactOccurred('light');
    });
    
    // Обработчик закрытия
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'none';
        tg.BackButton.hide();
        unlockBodyScroll();
        tg.HapticFeedback.impactOccurred('light');
    });
    
    // Закрытие при клике на overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            tg.BackButton.hide();
            unlockBodyScroll();
        }
    });
}

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServiceFeeHelpModal);
} else {
    initServiceFeeHelpModal();
}

// Также используем делегирование событий для динамически созданных элементов
document.addEventListener('click', (e) => {
    // Обработчик для кнопки знака вопроса (fallback)
    if (e.target.closest('#serviceFeeHelpBtn') || 
        e.target.id === 'serviceFeeHelpBtn' || 
        e.target.classList.contains('help-icon-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const modal = document.getElementById('serviceFeeHelpModal');
        if (modal && modal.style.display !== 'flex') {
            modal.style.display = 'flex';
            lockBodyScroll();
            showBackButton(true);
            tg.HapticFeedback.impactOccurred('light');
        }
    }
});

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

// Автоматическое обновление заказов
let ordersRefreshInterval = null;

// Функция для обновления только заказов (без полной перезагрузки всех данных)
async function refreshOrders() {
    const userId = getUserId();
    if (!userId) return;
    
    try {
        const response = await fetch(`/api/user-data/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Обновляем только заказы
        if (data.activeOrders && Array.isArray(data.activeOrders)) {
            const oldOrdersCount = userActiveOrders.length;
            const oldOrdersJson = JSON.stringify(userActiveOrders);
            
            // Разделяем заказы на активные и завершенные
            const completedAndCanceled = [];
            const trulyActive = [];
            
            console.log('[updateOrdersPeriodically] Загружено заказов с сервера:', data.activeOrders.length);
            console.log('[updateOrdersPeriodically] Статусы заказов:', data.activeOrders.map(o => `${o.id}:${o.status}`).join(', '));
            
            data.activeOrders.forEach(order => {
                const status = order.status?.toUpperCase();
                if (status === 'COMPLETED' || status === 'CANCELED') {
                    completedAndCanceled.push(order);
                } else {
                    // Фильтруем только активные статусы
                    const isActive = status === 'NEW' || 
                                   status === 'PROCESSING' || 
                                   status === 'PURCHASE' ||
                                   status === 'COLLECTING' || 
                                   status === 'DELIVERING' || 
                                   status === 'UNPAID';
                    if (isActive) {
                        trulyActive.push(order);
                    } else {
                        console.log('[updateOrdersPeriodically] 🚫 Заказ отфильтрован (неизвестный статус):', order.id, 'статус:', status);
                    }
                }
            });
            
            console.log('[updateOrdersPeriodically] Активных заказов:', trulyActive.length);
            console.log('[updateOrdersPeriodically] Завершенных заказов:', completedAndCanceled.length);
            
            const newOrdersJson = JSON.stringify(trulyActive);
            
            // Обновляем активные заказы (без COMPLETED и CANCELED)
            userActiveOrders = trulyActive;
            
            // Добавляем COMPLETED и CANCELED в историю
            if (completedAndCanceled.length > 0) {
                const existingHistoryIds = new Set(userCompletedOrders.map(o => o.id));
                completedAndCanceled.forEach(order => {
                    if (!existingHistoryIds.has(order.id)) {
                        userCompletedOrders.push(order);
                    }
                });
                localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
            }
            localStorage.setItem('activeOrders', JSON.stringify(userActiveOrders));
            
            // Обновляем отображение только если есть изменения
            if (oldOrdersCount !== userActiveOrders.length || oldOrdersJson !== newOrdersJson) {
                loadActiveOrders();
                console.log(`🔄 Обновлены активные заказы: ${userActiveOrders.length} заказов`);
            }
        }
        
        if (data.completedOrders && Array.isArray(data.completedOrders)) {
            // Фильтруем только COMPLETED и CANCELED для истории
            userCompletedOrders = data.completedOrders.filter(order => {
                const status = order.status?.toUpperCase();
                return status === 'COMPLETED' || status === 'CANCELED';
            });
            localStorage.setItem('completedOrders', JSON.stringify(userCompletedOrders));
        }
    } catch (error) {
        console.error('Ошибка обновления заказов:', error);
    }
}

// Запуск автоматического обновления заказов каждые 30 секунд
function startOrdersAutoRefresh() {
    // Останавливаем предыдущий интервал, если он был
    if (ordersRefreshInterval) {
        clearInterval(ordersRefreshInterval);
    }
    
    // Обновляем заказы каждые 30 секунд
    ordersRefreshInterval = setInterval(() => {
        refreshOrders();
    }, 30000); // 30 секунд
    
    console.log('🔄 Автообновление заказов запущено (каждые 30 секунд)');
}

// Остановка автоматического обновления
function stopOrdersAutoRefresh() {
    if (ordersRefreshInterval) {
        clearInterval(ordersRefreshInterval);
        ordersRefreshInterval = null;
        console.log('⏸️ Автообновление заказов остановлено');
    }
}

// Обновление заказов при возврате на страницу (когда вкладка становится видимой)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Страница стала видимой - обновляем заказы
        refreshOrders();
    }
});

// Инициализация при загрузке
// Показываем спиннер сразу при загрузке страницы
function initProductsLoader() {
    if (productsContainer) {
        renderProducts(); // Показываем спиннер сразу
    }
}

// Вызываем сразу, если DOM уже загружен, иначе ждем DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductsLoader);
} else {
    initProductsLoader();
}

// Загружаем фильтры, затем товары
loadFilters().then(() => {
    loadProducts();
    loadUserData(); // Загружаем все данные пользователя с сервера
    loadProfile();
    loadSavedAddresses();
    loadActiveOrders();
});

initKeyboardHandling(); // Инициализируем обработку клавиатуры

// Запускаем автоматическое обновление заказов
startOrdersAutoRefresh();

// Экспорт функций для глобального доступа
window.addToCart = addToCart;
window.changeCartQuantity = changeCartQuantity;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.changeProductQuantity = changeProductQuantity;
window.switchTab = switchTab;
window.editAddress = editAddress;
window.deleteAddress = deleteAddress;
window.selectAddressFromMyAddresses = selectAddressFromMyAddresses;
window.editAddressFromMyAddresses = editAddressFromMyAddresses;
window.deleteAddressFromMyAddresses = deleteAddressFromMyAddresses;
window.toggleAddressMenu = toggleAddressMenu;
window.editAddressFromProfile = editAddressFromProfile;
window.deleteAddressFromProfile = deleteAddressFromProfile;
window.editAddressFromSimple = editAddressFromSimple;
window.deleteAddressFromSimple = deleteAddressFromSimple;
window.addAdditionalProduct = addAdditionalProduct;
window.selectCheckoutAddress = selectCheckoutAddress;
window.showCheckoutAddressForm = showCheckoutAddressForm;
window.selectAddress = selectAddress;
window.editCheckoutAddress = editCheckoutAddress;
window.deleteCheckoutAddress = deleteCheckoutAddress;
window.selectCheckoutAddressForSimple = selectCheckoutAddressForSimple;
window.openOrderDetail = openOrderDetail;

// ==================== ПОЭТАПНАЯ ФОРМА ОФОРМЛЕНИЯ ЗАКАЗА ====================

// checkoutData уже объявлен выше в начале файла

// Инициализация чекбокса "Оставить у двери"
function initLeaveAtDoorCheckbox() {
    const checkbox = document.getElementById('leaveAtDoorCheckbox');
    if (!checkbox) {
        console.warn('[leaveAtDoor] чекбокс не найден');
        return;
    }

    // Чтобы не вешать обработчик много раз
    if (checkbox.dataset.inited === 'true') {
        console.log('[leaveAtDoor] уже инициализирован, выходим');
        return;
    }
    checkbox.dataset.inited = 'true';

    // стартовое значение из checkoutData
    checkbox.checked = !!checkoutData.leaveAtDoor;

    console.log('[leaveAtDoor] инициализация, начальное состояние:', checkbox.checked);

    checkbox.addEventListener('change', () => {
        checkoutData.leaveAtDoor = checkbox.checked;
        console.log('[leaveAtDoor] изменено:', checkoutData.leaveAtDoor);
    });
}

// Инициализация поэтапной формы
function initCheckoutSteps() {
    // Настройка поля телефона
    const customerPhoneField = document.getElementById('customerPhone');
    if (customerPhoneField && typeof setupPhoneInput === 'function') {
        setupPhoneInput(customerPhoneField);
    }
    
    // Обработчики кнопок "Продолжить"
    const continueStep1Btn = document.getElementById('continueStep1');
    if (continueStep1Btn) {
        continueStep1Btn.onclick = () => {
            if (validateStep1()) {
                saveStep1();
                goToStep(2);
            }
        };
    }
    
    const continueStep2Btn = document.getElementById('continueStep2');
    if (continueStep2Btn) {
        continueStep2Btn.onclick = async () => {
            if (validateStep2()) {
                await saveStep2();
                goToStep(3);
            }
        };
    }
    
    // Обработчик кнопки "Добавить новый адрес"
    const addNewAddressBtn = document.getElementById('addNewAddressBtn');
    if (addNewAddressBtn) {
        addNewAddressBtn.onclick = () => {
            openAddressForm({ mode: 'create', source: 'checkout' });
        };
    }
    
    // Настройка навигации по Enter для формы адреса в заказе
    const checkoutAddressForm = document.getElementById('checkoutAddressForm');
    if (checkoutAddressForm) {
        setupEnterKeyNavigation(checkoutAddressForm);
    }
    
    const continueStep3Btn = document.getElementById('continueStep3');
    if (continueStep3Btn) {
        continueStep3Btn.onclick = () => {
            if (validateStep3()) {
                saveStep3();
                goToStep(4);
                renderCheckoutSummary();
            }
        };
    }
    
    // Обработчик кнопки "Оплатить"
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    if (submitOrderBtn) {
        submitOrderBtn.onclick = submitOrder;
    }
    
    // Обработчики редактирования на итоговой странице
    const editRecipientBtn = document.getElementById('editRecipient');
    if (editRecipientBtn) {
        editRecipientBtn.onclick = () => {
            if (checkoutMode === 'simple' || isSimpleCheckout) {
                // Упрощённый сценарий: сразу открываем страницу редактирования
                openEditRecipientPage();
            } else {
                // Обычный сценарий: уходим на шаг 1
                goToStep(1);
            }
        };
    }
    
    const editAddressBtn = document.getElementById('editAddress');
    if (editAddressBtn) {
        editAddressBtn.onclick = () => {
            if (checkoutMode === 'simple' || isSimpleCheckout) {
                // Упрощённый: открыть список адресов
                openCheckoutAddressesForSimple();
            } else {
                // Обычный: на шаг 2
                goToStep(2);
            }
        };
    }
    
    // Обработчик кнопки "Добавить новый адрес" из списка адресов
    const addNewAddressFromListBtn = document.getElementById('addNewAddressFromListBtn');
    if (addNewAddressFromListBtn) {
        addNewAddressFromListBtn.onclick = () => {
            // Скрываем вкладку со списком адресов
            const myAddressesTab = document.getElementById('myAddressesTab');
            if (myAddressesTab) {
                myAddressesTab.style.display = 'none';
            }
            
            // В упрощенном сценарии показываем заголовок обратно
            if (isSimpleCheckout) {
                const orderPageHeader = document.querySelector('.order-page-header');
                if (orderPageHeader) {
                    orderPageHeader.style.display = '';
                }
            }
            
            // Переходим на вкладку адресов для создания нового
            switchTab('addressTab');
            
            // Прокручиваем страницу вверх
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        };
    }
    
    // Обработчик сохранения редактируемого адреса
    const saveEditAddressBtn = document.getElementById('saveEditAddressBtn');
    if (saveEditAddressBtn) {
        saveEditAddressBtn.onclick = async (e) => {
            e.preventDefault();
            await saveEditAddress();
        };
    }
    
    // Синхронизация комментария к заказу
    const orderCommentField = document.getElementById('orderCommentField');
    if (orderCommentField) {
        // Заполняем поле из checkoutData при загрузке
        if (checkoutData.orderComment) {
            orderCommentField.value = checkoutData.orderComment;
        }
        
        // Обновляем checkoutData при изменении
        orderCommentField.addEventListener('input', () => {
            checkoutData.orderComment = orderCommentField.value.trim();
        });
    }
    
    // Синхронизация чекбокса "Оставить у двери"
    // Инициализация чекбокса "Оставить у двери" вынесена в отдельную функцию
    initLeaveAtDoorCheckbox();
    
    // Обработчик кнопки "Назад" удален - используем только BackButton от Telegram
    
    // Обработчик сохранения получателя
    const saveRecipientBtn = document.getElementById('saveRecipientBtn');
    if (saveRecipientBtn) {
        saveRecipientBtn.onclick = async (e) => {
            e.preventDefault();
            const nameField = document.getElementById('editRecipientName');
            const phoneField = document.getElementById('editRecipientPhone');
            const name = nameField.value.trim();
            const phone = phoneField.value.trim();
            
            // Валидация
            let isValid = true;
            if (!name) {
                validateField(nameField, false);
                isValid = false;
            } else {
                validateField(nameField, true);
            }
            
            const phoneDigits = phone.replace(/\D/g, '');
            if (!phone || phoneDigits.length < 10) {
                validateField(phoneField, false);
                isValid = false;
            } else {
                validateField(phoneField, true);
            }
            
            if (!isValid) return;
            
            // Сохраняем данные
            checkoutData.recipientName = name;
            checkoutData.recipientPhone = phone;
            
            // Сохраняем в профиль пользователя в БД
            const userId = getUserId();
            if (userId) {
                try {
                    await fetch('/api/user-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: userId,
                            profile: {
                                name: name,
                                phone: phone
                            }
                        })
                    });
                } catch (error) {
                    console.error('Ошибка сохранения данных получателя:', error);
                }
            }
            
            // Обновляем отображение на странице итого
            renderCheckoutSummary();
            
            // Возвращаемся на страницу итого
            document.getElementById('editRecipientTab').style.display = 'none';
            goToStep(4);
        };
    }
    
    // Обработчик кнопки "Назад" удален - используем только BackButton от Telegram
    
    // Инициализация даты доставки
    const deliveryDateInput = document.getElementById('deliveryDate');
    if (deliveryDateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deliveryDateInput.min = tomorrow.toISOString().split('T')[0];
    }
    
    // Автоматический сброс ошибок при вводе
    const step1Fields = document.querySelectorAll('#checkoutStep1 input');
    step1Fields.forEach(field => {
        field.addEventListener('input', function() {
            if (this.value.trim()) {
                validateField(this, true);
            }
        });
    });
    
    const step2Fields = document.querySelectorAll('#checkoutStep2 input, #checkoutStep2 textarea');
    step2Fields.forEach(field => {
        field.addEventListener('input', function() {
            if (this.value.trim() && this.id !== 'orderAddressCity') {
                validateField(this, true);
            }
        });
    });
    
    const step3DateField = document.getElementById('deliveryDate');
    if (step3DateField) {
        step3DateField.addEventListener('change', function() {
            if (this.value) {
                validateField(this, true);
            }
        });
    }
}

// Переход к шагу
function goToStep(step) {
    console.log('[goToStep] переход на шаг', step);
    
    // Скрываем все шаги
    document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
    
    // Скрываем только вкладки редактирования (не основные вкладки меню/корзина/профиль)
    const editingTabs = ['editRecipientTab', 'editAddressTab', 'myAddressesTab'];
    editingTabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.style.display = 'none';
    }
    });
    
    // Показываем нужный шаг
    const stepElement = document.getElementById(`checkoutStep${step}`);
    if (stepElement) {
        stepElement.classList.add('active');
        // Убеждаемся, что шаг видим
        stepElement.style.display = '';
    }
    
    // Убеждаемся, что вкладка оформления заказа видна
    const orderTab = document.getElementById('orderTab');
    if (orderTab) {
        orderTab.style.display = 'block';
    }
    
    // Обновляем индикатор прогресса
    document.querySelectorAll('.progress-step').forEach((s, index) => {
        if (index + 1 <= step) {
            s.classList.add('active');
        } else {
            s.classList.remove('active');
        }
    });
    
    currentCheckoutStep = step;
    
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
    
    // Если переходим на шаг 2, инициализируем адреса и подтягиваем сохраненный адрес
    if (step === 2) {
        // Рендерим список адресов
        renderCheckoutAddresses();
        
        // Если в checkoutData есть сохраненный адрес с ID - выбираем его
        if (checkoutData.address && checkoutData.address.id) {
            const savedAddress = savedAddresses.find(addr => String(addr.id) === String(checkoutData.address.id));
            if (savedAddress) {
                console.log('[goToStep] ✅ Восстанавливаем сохраненный адрес из checkoutData:', checkoutData.address.id);
                selectCheckoutAddress(checkoutData.address.id);
            } else {
                console.warn('[goToStep] ⚠️ Адрес с ID', checkoutData.address.id, 'не найден в savedAddresses');
            }
        }
    }
    
    // Если переходим на шаг 3, синхронизируем чекбокс "Оставить у двери"
    if (step === 3) {
        // Переинициализируем чекбокс при переходе на шаг 3
        initLeaveAtDoorCheckbox();
        
        // ВАЖНО: Убеждаемся, что состояние чекбокса синхронизировано с checkoutData
        setTimeout(() => {
            const checkbox = document.getElementById('leaveAtDoorCheckbox');
            if (checkbox) {
                checkbox.checked = !!checkoutData.leaveAtDoor;
                if (checkbox.checked) {
                    checkbox.setAttribute('checked', 'checked');
                } else {
                    checkbox.removeAttribute('checked');
                }
            }
        }, 100);
    }
    
    // Если переходим на шаг 4, обновляем отображение (включая комментарий и "Оставить у двери")
    if (step === 4) {
        renderCheckoutSummary();
        
        // Обновляем состояние экрана
        if (isSimpleCheckout || checkoutMode === 'simple') {
            checkoutScreen = 'summary';
        } else {
            checkoutScreen = 'steps';
        }
        
        // Показываем BackButton
        showBackButton(true);
        
        // Прокрутка в начало шага 4
        setTimeout(() => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            const orderTab = document.getElementById('orderTab');
            if (orderTab) {
                orderTab.scrollTop = 0;
                if (orderTab.scrollIntoView) {
                    orderTab.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }
        }, 100);
    }
    
    // Если переходим на шаг 2, инициализируем адреса и подтягиваем сохраненный адрес
    if (step === 2) {
        // Рендерим список адресов
        renderCheckoutAddresses();
        
        // Если в checkoutData есть сохраненный адрес с ID - выбираем его
        if (checkoutData.addressId) {
            const savedAddress = savedAddresses.find(addr => Number(addr.id) === Number(checkoutData.addressId));
            if (savedAddress) {
                console.log('[goToStep] ✅ Восстанавливаем сохраненный адрес из checkoutData.addressId:', checkoutData.addressId);
                selectCheckoutAddress(checkoutData.addressId);
            } else {
                console.warn('[goToStep] ⚠️ Адрес с ID', checkoutData.addressId, 'не найден в savedAddresses');
            }
        }
    }
    
    // Если переходим на шаг 3, инициализируем календарь (если еще не инициализирован)
    if (step === 3) {
        // Небольшая задержка, чтобы убедиться, что DOM обновлен и шаг видим
        setTimeout(() => {
            console.log('[goToStep] 📅 Инициализация календаря на шаге 3');
            const stepElement = document.getElementById(`checkoutStep${step}`);
            const calendarContainer = document.getElementById('customCalendar');
            const deliveryDateInput = document.getElementById('deliveryDate');
            
            console.log('[goToStep] stepElement:', !!stepElement, 'active:', stepElement?.classList.contains('active'));
            console.log('[goToStep] calendarContainer:', !!calendarContainer, 'deliveryDateInput:', !!deliveryDateInput);
            
            if (!stepElement) {
                console.error('[goToStep] ❌ Элемент шага 3 не найден!');
                return;
            }
            
            if (calendarContainer && deliveryDateInput) {
                // Сначала пробуем вызвать initOrderForm, чтобы убедиться, что функция определена
                if (typeof initOrderForm === 'function') {
                    initOrderForm();
                }
                
                // Затем вызываем календарь
                if (typeof window.initCustomCalendar === 'function') {
                    console.log('[goToStep] ✅ Вызываем window.initCustomCalendar');
                    window.initCustomCalendar();
                } else {
                    console.error('[goToStep] ❌ window.initCustomCalendar не определена после initOrderForm!');
                    console.error('[goToStep] Проверяем доступность функций:', {
                        initOrderForm: typeof initOrderForm,
                        windowInitCustom: typeof window.initCustomCalendar
                    });
                }
            } else {
                console.warn('[goToStep] ⚠️ Элементы календаря не найдены в DOM');
                console.warn('[goToStep] Проверяем все элементы формы заказа:');
                console.warn('[goToStep] - checkoutStep3:', !!document.getElementById('checkoutStep3'));
                console.warn('[goToStep] - customCalendar:', !!document.getElementById('customCalendar'));
                console.warn('[goToStep] - deliveryDate:', !!document.getElementById('deliveryDate'));
                
                // Пробуем еще раз через небольшую задержку
                setTimeout(() => {
                    const retryCalendarContainer = document.getElementById('customCalendar');
                    const retryDeliveryDateInput = document.getElementById('deliveryDate');
                    if (retryCalendarContainer && retryDeliveryDateInput && typeof window.initCustomCalendar === 'function') {
                        console.log('[goToStep] ✅ Повторная попытка инициализации календаря');
                        window.initCustomCalendar();
                    }
                }, 200);
            }
        }, 100);
    }
    
    // Обновляем состояние экрана
    checkoutScreen = 'steps';
    
    // Показываем BackButton
    showBackButton(true);
}

// Рендеринг списка адресов на шаге 2
function renderCheckoutAddresses(forSimple = false) {
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
            const addressId = addr.id;
            
            // В упрощенном режиме добавляем кнопки редактирования и удаления
            const editDeleteButtons = forSimple ? `
                <div class="checkout-address-actions" style="display: flex; gap: 8px; margin-left: auto;">
                    <button type="button" class="checkout-address-edit-btn" onclick="event.stopPropagation(); editCheckoutAddress(${addressId}, true)" style="padding: 6px 12px; background: #f0f0f0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        Редактировать
                    </button>
                    <button type="button" class="checkout-address-delete-btn" onclick="event.stopPropagation(); deleteCheckoutAddress(${addressId}, true)" style="padding: 6px 12px; background: #ff4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                        Удалить
                    </button>
                </div>
            ` : '';
            
            return `
                <label class="checkout-address-option" style="display: flex; align-items: center; gap: 12px;">
                    <input type="radio" name="checkoutAddress" value="${addressId}" ${isSelected ? 'checked' : ''} onchange="selectCheckoutAddressForSimple(${addressId})">
                    <div class="checkout-address-option-content" style="flex: 1;">
                        <div class="checkout-address-text">${addressStr}</div>
                    </div>
                    ${editDeleteButtons}
                </label>
            `;
        }).join('');
        
        // Если адрес еще не выбран, выбираем последний (самый свежий)
        if (!checkoutData.addressId) {
            const lastAddress = savedAddresses[savedAddresses.length - 1];
            if (lastAddress) {
                if (forSimple) {
                    selectCheckoutAddressForSimple(lastAddress.id);
                } else {
                    selectCheckoutAddress(lastAddress.id);
                }
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

// Показ формы добавления нового адреса на шаге 2
function showCheckoutAddressForm() {
    // Используем универсальную функцию
    openAddressForm({ mode: 'create', source: 'checkout' });
}

// Выбор адреса в упрощенном режиме (с возвратом на шаг 4)
function selectCheckoutAddressForSimple(addressId) {
    console.log('[SimpleMenu] 📍 Переход: выбор адреса, addressId:', addressId, 'checkoutScreen:', checkoutScreen);
    
    // Используем существующую функцию для обновления checkoutData
    selectCheckoutAddress(addressId);
    
    // Возвращаемся к шагу 4 (упрощенное Итого)
    if (isSimpleCheckout || checkoutMode === 'simple') {
        showSimpleSummary();
        console.log('[SimpleMenu] ✅ Переход выполнен: summary (выбор адреса)');
    }
}

// Открытие списка адресов для упрощенного режима
function openCheckoutAddressesForSimple() {
    console.log('[SimpleMenu] 📍 Переход: открытие списка адресов, checkoutScreen:', checkoutScreen, 'checkoutMode:', checkoutMode);
    
    const myAddressesTab = document.getElementById('myAddressesTab');
    const myAddressesList = document.getElementById('myAddressesList');
    const addNewAddressFromListBtn = document.getElementById('addNewAddressFromListBtn');
    
    if (!myAddressesTab || !myAddressesList) {
        console.error('[SimpleMenu] ❌ Не найдены необходимые элементы для списка адресов');
        return;
    }
    
    // Скрываем все шаги checkout
    document.querySelectorAll('.checkout-step').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id !== 'myAddressesTab') {
            tab.style.display = 'none';
        }
    });
    
    // Скрываем заголовок
    const orderPageHeader = document.querySelector('.order-page-header');
    if (orderPageHeader) {
        orderPageHeader.style.display = 'none';
    }
    
    // Рендерим список адресов с радио кнопками и меню
    renderMyAddressesListForSimple();
    
    // Настраиваем обработчик кнопки "Добавить новый адрес"
    if (addNewAddressFromListBtn) {
        addNewAddressFromListBtn.onclick = () => {
            console.log('[SimpleMenu] 📍 Переход: открытие формы создания адреса');
            openAddressForm({ mode: 'create', source: 'simple' });
        };
    }
    
    // Показываем вкладку со списком адресов
    myAddressesTab.style.display = 'block';
    
    const previousScreen = checkoutScreen;
    checkoutScreen = 'addressesList';
    console.log('[SimpleMenu] ✅ Переход выполнен: список адресов, было:', previousScreen, 'стало:', checkoutScreen);
    
    // Прокручиваем страницу вверх
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    
    // Показываем BackButton
    showBackButton(true);
}

// Рендеринг списка адресов для упрощенного режима с радио кнопками
function renderMyAddressesListForSimple() {
    const myAddressesList = document.getElementById('myAddressesList');
    if (!myAddressesList) return;
    
    if (savedAddresses.length === 0) {
        myAddressesList.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">Нет сохраненных адресов</div>';
        return;
    }
    
    // Фильтруем адреса - показываем только адреса с валидным ID
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    
    if (validAddresses.length === 0) {
        myAddressesList.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">Нет сохраненных адресов</div>';
        return;
    }
    
    // Определяем выбранный адрес
    const selectedAddressId = checkoutData.addressId || (checkoutData.address && checkoutData.address.id);
    
    myAddressesList.innerHTML = validAddresses.map((addr) => {
        // Формируем строку адреса
        let street = addr.street || '';
        const house = addr.house || '';
        if (house && !street.includes(house)) {
            street = street ? `${street}, ${house}` : house;
        }
        
        const addressParts = [
            street,
            addr.apartment ? `кв. ${addr.apartment}` : '',
            addr.entrance ? `парадная ${addr.entrance}` : '',
            addr.floor ? `этаж ${addr.floor}` : ''
        ].filter(Boolean);
        
        const addressStr = addressParts.join(', ');
        const addressId = addr.id;
        const isSelected = selectedAddressId && Number(selectedAddressId) === Number(addressId);
        
        return `
            <div class="address-item" style="display: flex; align-items: center; padding: 16px; border-bottom: 1px solid #eee; ${isSelected ? 'background-color: #f9f9f9;' : ''}">
                <input type="radio" name="addressRadio" value="${addressId}" ${isSelected ? 'checked' : ''} 
                       onchange="selectCheckoutAddressForSimple(${addressId})" 
                       style="margin-right: 12px; width: 20px; height: 20px; cursor: pointer;">
                <div style="flex: 1; cursor: pointer;" onclick="selectCheckoutAddressForSimple(${addressId})">
                    <div style="font-weight: 500; margin-bottom: 4px;">${addressStr}</div>
                </div>
                <div class="address-menu" style="position: relative;">
                    <button class="address-menu-btn" onclick="event.stopPropagation(); toggleAddressMenu(${addressId})" style="background: none; border: none; padding: 8px; cursor: pointer; color: #666;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="5" r="1"/>
                            <circle cx="12" cy="12" r="1"/>
                            <circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                    <div class="address-menu-dropdown" id="addressMenu${addressId}" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 10000; min-width: 150px; margin-top: 4px;">
                        <button onclick="event.stopPropagation(); editAddressFromSimple(${addressId})" style="width: 100%; padding: 12px; text-align: left; background: none; border: none; cursor: pointer; border-bottom: 1px solid #eee;">
                            Изменить
                        </button>
                        <button onclick="event.stopPropagation(); deleteAddressFromSimple(${addressId})" style="width: 100%; padding: 12px; text-align: left; background: none; border: none; cursor: pointer; color: #ff4444;">
                            Удалить
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Редактирование адреса из списка в упрощенном режиме
function editCheckoutAddress(addressId, fromSimple = false) {
    if (fromSimple) {
        // Открываем страницу редактирования адреса
        const addr = savedAddresses.find(a => Number(a.id) === Number(addressId));
        if (addr) {
            openEditAddressPageFromList(addr);
        }
    } else {
        // Обычное редактирование (для шага 2)
        const addr = savedAddresses.find(a => Number(a.id) === Number(addressId));
        if (addr) {
            openAddressForm({ mode: 'edit', source: 'checkout', addressId: addressId });
        }
    }
}

// Удаление адреса из списка в упрощенном режиме
async function deleteCheckoutAddress(addressId, fromSimple = false) {
    if (!confirm('Вы уверены, что хотите удалить этот адрес?')) {
        return;
    }
    
    const id = Number(addressId);
    const addressIndex = savedAddresses.findIndex(a => Number(a.id) === id);
    
    if (addressIndex === -1) {
        console.warn('[deleteCheckoutAddress] Адрес с ID', id, 'не найден');
        return;
    }
    
    // Удаляем адрес из списка
    const updatedAddresses = savedAddresses.filter(a => Number(a.id) !== id);
    setSavedAddresses(updatedAddresses);
    
    // Сохраняем на сервер
    await saveUserData();
    
    // Если удаленный адрес был выбран, сбрасываем выбор
    if (checkoutData.addressId === id) {
        checkoutData.addressId = null;
        checkoutData.address = null;
    }
    
    // Обновляем список
    if (fromSimple) {
        renderCheckoutAddresses(true);
        // Если адресов не осталось, показываем форму
        if (updatedAddresses.length === 0) {
            const addressesList = document.getElementById('checkoutAddressesList');
            const addNewAddressBtn = document.getElementById('addNewAddressBtn');
            const addressForm = document.getElementById('checkoutAddressForm');
            
            if (addressesList) addressesList.style.display = 'none';
            if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
            if (addressForm) addressForm.style.display = 'block';
        }
    } else {
        renderCheckoutAddresses(false);
    }
}

// Валидация шага 1 (Получатель)
function validateStep1() {
    const nameField = document.getElementById('customerName');
    const phoneField = document.getElementById('customerPhone');
    const name = nameField.value.trim();
    const phone = phoneField.value.trim();
    
    let isValid = true;
    
    if (!name) {
        validateField(nameField, false);
        isValid = false;
    } else {
        validateField(nameField, true);
    }
    
    // Проверка телефона (минимум 10 цифр)
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone || phoneDigits.length < 10) {
        validateField(phoneField, false);
        isValid = false;
    } else {
        validateField(phoneField, true);
    }
    
    return isValid;
}

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

// Валидация шага 2 (Доставка)
function validateStep2() {
    // Проверяем, есть ли выбранный адрес из списка
    const selectedAddressRadio = document.querySelector('input[name="checkoutAddress"]:checked');
    
    if (selectedAddressRadio) {
        // Адрес выбран из списка - валидация не нужна
        return true;
    }
    
    // Если адрес не выбран из списка, проверяем форму
    const addressForm = document.getElementById('checkoutAddressForm');
    if (addressForm && addressForm.style.display !== 'none') {
        const streetField = document.getElementById('orderAddressStreet');
        const street = streetField ? streetField.value.trim() : '';

        if (!street) {
            if (streetField) validateField(streetField, false);
            return false;
        } else {
            if (streetField) validateField(streetField, true);
        }
    } else {
        // Если форма скрыта и адрес не выбран - ошибка
        return false;
    }

    return true;
}

// Сохранение шага 2
async function saveStep2() {
    // Проверяем, есть ли выбранный адрес из списка
    const selectedAddressRadio = document.querySelector('input[name="checkoutAddress"]:checked');
    
    if (selectedAddressRadio) {
        // Адрес уже выбран и сохранен в checkoutData.address через selectCheckoutAddress
        // Ничего не делаем, адрес уже в checkoutData.address
        console.log('[saveStep2] используется выбранный адрес из списка');
    } else {
        // Сохраняем данные из формы
        checkoutData.address = {
            city: 'Санкт-Петербург',
            street: document.getElementById('orderAddressStreet').value.trim(), // Теперь содержит "улица + дом"
            apartment: document.getElementById('orderAddressApartment').value.trim(),
            floor: document.getElementById('orderAddressFloor').value.trim(),
            entrance: document.getElementById('orderAddressEntrance').value.trim(),
            intercom: document.getElementById('orderAddressIntercom').value.trim(),
            comment: document.getElementById('orderAddressComment').value.trim()
        };
        
        // Сохраняем новый адрес в базу данных
        const userId = getUserId();
        if (userId && checkoutData.address.street) {
            try {
                const newAddress = {
                    id: Date.now(),
                    name: checkoutData.address.street,
                    city: checkoutData.address.city,
                    street: checkoutData.address.street,
                    apartment: checkoutData.address.apartment,
                    floor: checkoutData.address.floor,
                    entrance: checkoutData.address.entrance,
                    intercom: checkoutData.address.intercom,
                    comment: checkoutData.address.comment
                };
                
                // Проверяем, не является ли это дубликатом
                const isDuplicate = savedAddresses.some(existingAddr => {
                    const sameCity = (existingAddr.city || '').toLowerCase().trim() === (newAddress.city || '').toLowerCase().trim();
                    const sameStreet = (existingAddr.street || '').toLowerCase().trim() === (newAddress.street || '').toLowerCase().trim();
                    const sameApartment = (existingAddr.apartment || '').toLowerCase().trim() === (newAddress.apartment || '').toLowerCase().trim();
                    return sameCity && sameStreet && sameApartment;
                });
                
                if (!isDuplicate) {
                    // Используем единый сеттер
                    setSavedAddresses([...savedAddresses, newAddress]);
                    await saveUserData();
                    console.log('[saveStep2] новый адрес сохранен');
                    
                    // После сохранения savedAddresses обновлён из ответа сервера через setSavedAddresses
                    // Находим только что созданный адрес по содержимому и выбираем его
                    const createdAddress = savedAddresses.find(addr => {
                        const sameCity = (addr.city || '').toLowerCase().trim() === (newAddress.city || '').toLowerCase().trim();
                        const sameStreet = (addr.street || '').toLowerCase().trim() === (newAddress.street || '').toLowerCase().trim();
                        const sameApartment = (addr.apartment || '').toLowerCase().trim() === (newAddress.apartment || '').toLowerCase().trim();
                        return sameCity && sameStreet && sameApartment && addr.id && typeof addr.id === 'number' && addr.id > 0;
                    });
                    
                    if (createdAddress && createdAddress.id) {
                        console.log('[saveStep2] ✅ Выбираем только что созданный адрес:', createdAddress.id);
                        selectCheckoutAddress(createdAddress.id);
                    }
                }
            } catch (e) {
                console.error('[saveStep2] ошибка сохранения адреса:', e);
            }
        }
    }
    
    // Сохраняем адрес в БД
    const userId = getUserId();
    if (userId) {
        try {
            // Проверяем, не существует ли уже такой адрес
            const addressExists = savedAddresses.some(addr => {
                const addrStreet = addr.street || (addr.address_json && (typeof addr.address_json === 'object' ? addr.address_json.street : JSON.parse(addr.address_json || '{}').street));
                return addrStreet === checkoutData.address.street; // Теперь street содержит "улица + дом"
            });
            
            if (!addressExists) {
                const addressData = {
                    name: checkoutData.address.street, // Теперь street содержит "улица + дом"
                    city: checkoutData.address.city,
                    street: checkoutData.address.street, // Теперь содержит "улица + дом"
                    apartment: checkoutData.address.apartment,
                    floor: checkoutData.address.floor,
                    entrance: checkoutData.address.entrance,
                    intercom: checkoutData.address.intercom,
                    comment: checkoutData.address.comment
                };
                
                // Сохраняем адрес через API
                await fetch('/api/user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId,
                        addresses: [...savedAddresses, addressData]
                    })
                });
                
                // Используем единый сеттер
                setSavedAddresses([...savedAddresses, addressData]);
                
                // После сохранения через API нужно обновить savedAddresses из ответа сервера
                await saveUserData();
                
                // Находим только что созданный адрес по содержимому и выбираем его
                const createdAddress = savedAddresses.find(addr => {
                    const sameCity = (addr.city || '').toLowerCase().trim() === (addressData.city || '').toLowerCase().trim();
                    const sameStreet = (addr.street || '').toLowerCase().trim() === (addressData.street || '').toLowerCase().trim();
                    const sameApartment = (addr.apartment || '').toLowerCase().trim() === (addressData.apartment || '').toLowerCase().trim();
                    return sameCity && sameStreet && sameApartment && addr.id && typeof addr.id === 'number' && addr.id > 0;
                });
                
                if (createdAddress && createdAddress.id) {
                    console.log('[saveStep2] ✅ Выбираем только что созданный адрес (через API):', createdAddress.id);
                    selectCheckoutAddress(createdAddress.id);
                }
            }
        } catch (error) {
            console.error('Ошибка сохранения адреса:', error);
        }
    }
}

// Валидация шага 3 (Дата и время)
function validateStep3() {
    const dateField = document.getElementById('deliveryDate');
    const date = dateField.value;
    const timeSelected = document.querySelector('.time-slot-btn.active');
    const timeOptions = document.getElementById('deliveryTimeOptions');
    
    let isValid = true;
    
    if (!date) {
        validateField(dateField, false);
        isValid = false;
    } else {
        validateField(dateField, true);
    }
    
    if (!timeSelected) {
        // Подсвечиваем все кнопки времени красным
        if (timeOptions) {
            timeOptions.querySelectorAll('.time-slot-btn').forEach(btn => {
                btn.classList.add('error-time-slot');
            });
        }
        isValid = false;
    } else {
        // Убираем ошибки с кнопок времени
        if (timeOptions) {
            timeOptions.querySelectorAll('.time-slot-btn').forEach(btn => {
                btn.classList.remove('error-time-slot');
            });
        }
    }
    
    return isValid;
}

// Сохранение шага 3
function saveStep3() {
    checkoutData.deliveryDate = document.getElementById('deliveryDate').value;
    const timeBtn = document.querySelector('.time-slot-btn.active');
    checkoutData.deliveryTime = timeBtn ? timeBtn.dataset.time : '';
}

// Заполнение «Получатель» и «Адрес» на Итого (для упрощенного сценария)
function prefillSimpleCheckoutSummary() {
    // Получатель - имя и телефон отдельно друг под другом
    const summaryRecipientName = document.getElementById('summaryRecipientName');
    const summaryRecipientPhone = document.getElementById('summaryRecipientPhone');
    
    if (summaryRecipientName || summaryRecipientPhone) {
        const name =
            checkoutData.recipientName ||
            document.getElementById('customerName')?.value ||
            'Получатель';
        const phone =
            checkoutData.recipientPhone ||
            document.getElementById('customerPhone')?.value ||
            '';
        
        if (summaryRecipientName) {
            summaryRecipientName.textContent = name;
        }
        if (summaryRecipientPhone) {
            summaryRecipientPhone.textContent = phone || '';
        }
        
        // Сохраняем в checkoutData
        if (!checkoutData.recipientName) {
            checkoutData.recipientName = name;
        }
        if (!checkoutData.recipientPhone) {
            checkoutData.recipientPhone = phone;
        }
    }
    
    // Адрес — первый из savedAddresses (без города)
    const summaryAddress = document.getElementById('summaryAddress');
    if (summaryAddress && savedAddresses && savedAddresses.length > 0) {
        const addr = savedAddresses[0];
        
        // Формируем строку адреса (БЕЗ города)
        let streetStr = addr.street || '';
        if (addr.house && !streetStr.includes(addr.house)) {
            streetStr = streetStr ? `${streetStr}, ${addr.house}` : streetStr;
        }
        
        const parts = [
            streetStr,
            addr.apartment ? `кв. ${addr.apartment}` : '',
            addr.entrance ? `парадная ${addr.entrance}` : '',
            addr.floor ? `этаж ${addr.floor}` : ''
        ].filter(Boolean);
        
        summaryAddress.textContent = parts.join(', ');
        
        // Сохраняем в checkoutData
        checkoutData.address = addr;
        checkoutData.addressId = addr.id;
    }
}

// Форматирование даты и времени для отображения
function formatSummaryDateTime(dateStr, timeRange) {
    if (!dateStr) return '';
    
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    const options = { day: 'numeric', month: 'long' };
    const formattedDate = date.toLocaleDateString('ru-RU', options);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(today.getDate() + 2);
    
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    let prefix = '';
    if (dateOnly.getTime() === tomorrow.getTime()) {
        prefix = 'Завтра, ';
    } else if (dateOnly.getTime() === afterTomorrow.getTime()) {
        prefix = 'Послезавтра, ';
    }
    
    const timeFormatted = timeRange ? timeRange.replace('-', '–') : '';
    return `${prefix}${formattedDate}${timeFormatted ? ', ' + timeFormatted : ''}`;
}

// Инициализация календаря и слотов времени на экране «Итого» (для упрощенного сценария)
function initSimpleDateTimeOnSummary() {
    // Проверяем флаг, чтобы избежать дублирования календаря
    if (summaryDateTimeInitialized) {
        console.log('[initSimpleDateTimeOnSummary] Календарь уже инициализирован, пропускаем');
        return;
    }
    
    const summaryDateTimePicker = document.getElementById('summaryDateTimePicker');
    if (!summaryDateTimePicker) {
        console.warn('[initSimpleDateTimeOnSummary] Элемент summaryDateTimePicker не найден');
        return;
    }
    
    // Устанавливаем флаг инициализации
    summaryDateTimeInitialized = true;
    
    // Показываем календарь и слоты
    summaryDateTimePicker.style.display = 'block';
    
    const calendarContainer = document.getElementById('summaryCustomCalendar');
    const calendarDaysContainer = document.getElementById('summaryCalendarDays');
    const monthYearLabel = document.getElementById('summaryCalendarMonthYear');
    const prevBtn = document.getElementById('summaryCalendarPrevMonth');
    const nextBtn = document.getElementById('summaryCalendarNextMonth');
    const deliveryDateInput = document.getElementById('deliveryDate'); // скрытый, общий
    
    if (!calendarContainer || !calendarDaysContainer || !monthYearLabel || !deliveryDateInput) {
        console.warn('[initSimpleDateTimeOnSummary] Элементы календаря не найдены');
        return;
    }
    
    // Переиспользуем логику календаря из initCustomCalendar
    // Создаем упрощенную версию для шага 4
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 1); // завтра
    const maxDate = new Date(minDate);
    maxDate.setDate(minDate.getDate() + 13); // всего 14 дней
    
    let currentCalendarDate = new Date(minDate);
    
    function renderSummaryCalendar(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Понедельник = 0
        
        // Обновляем заголовок
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        monthYearLabel.textContent = `${monthNames[month]} ${year}`;
        
        // Очищаем контейнер
        calendarDaysContainer.innerHTML = '';
        
        // Пустые ячейки до первого дня месяца
        for (let i = 0; i < firstDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            calendarDaysContainer.appendChild(emptyDay);
        }
        
        // Дни месяца - показываем ВСЕ дни, но disabled те, что вне диапазона
        for (let day = 1; day <= daysInMonth; day++) {
            const dayDate = new Date(year, month, day);
            dayDate.setHours(0, 0, 0, 0);
            
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day; // Всегда показываем число
            
            // Проверяем доступность даты
            if (dayDate < minDate || dayDate > maxDate) {
                dayEl.classList.add('disabled');
            } else {
                dayEl.classList.add('available');
                
                // Проверяем, выбрана ли эта дата
                if (deliveryDateInput.value) {
                    const selectedDate = new Date(deliveryDateInput.value);
                    selectedDate.setHours(0, 0, 0, 0);
                    if (dayDate.getTime() === selectedDate.getTime()) {
                        dayEl.classList.add('selected');
                    }
                }
                
                dayEl.addEventListener('click', () => {
                    if (!dayEl.classList.contains('disabled')) {
                        // Убираем выделение с других дней
                        calendarDaysContainer.querySelectorAll('.calendar-day').forEach(d => {
                            d.classList.remove('selected');
                        });
                        dayEl.classList.add('selected');
                        
                        // Сохраняем дату
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        deliveryDateInput.value = dateStr;
                        checkoutData.deliveryDate = dateStr;
                        console.log('[simpleDate] выбрана дата:', dateStr);
                        
                        // Убираем красную рамку с календаря при выборе даты
                        const summaryCalendar = document.getElementById('summaryCustomCalendar');
                        if (summaryCalendar) {
                            summaryCalendar.classList.remove('error-field');
                        }
                        
                        // Обновляем отображение
                        updateSummaryDateTimeDisplay();
                    }
                });
            }
            
            calendarDaysContainer.appendChild(dayEl);
        }
    }
    
    // Навигация по месяцам - удаляем старые обработчики перед добавлением новых
    if (prevBtn) {
        // Клонируем кнопку, чтобы удалить все старые обработчики
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        
        newPrevBtn.addEventListener('click', () => {
            currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1);
            if (currentCalendarDate < minDate) {
                currentCalendarDate = new Date(minDate);
            }
            renderSummaryCalendar(currentCalendarDate);
        });
    }
    
    if (nextBtn) {
        // Клонируем кнопку, чтобы удалить все старые обработчики
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        
        newNextBtn.addEventListener('click', () => {
            currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1);
            if (currentCalendarDate > maxDate) {
                currentCalendarDate = new Date(maxDate);
            }
            renderSummaryCalendar(currentCalendarDate);
        });
    }
    
    // Инициализируем календарь
    renderSummaryCalendar(currentCalendarDate);
    
    // Слоты времени на «Итого» - удаляем старые обработчики перед добавлением новых
    const timeOptions = document.getElementById('summaryDeliveryTimeOptions');
    if (timeOptions) {
        // Клонируем контейнер, чтобы удалить все старые обработчики
        const newTimeOptions = timeOptions.cloneNode(true);
        timeOptions.parentNode.replaceChild(newTimeOptions, timeOptions);
        
        const buttons = newTimeOptions.querySelectorAll('.time-slot-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const time = btn.dataset.time;
                checkoutData.deliveryTime = time;
                console.log('[simpleTime] выбрано время:', time);
                
                // Убираем красную рамку со всех кнопок времени при выборе
                buttons.forEach(b => {
                    b.classList.remove('error-time-slot');
                });
                
                updateSummaryDateTimeDisplay();
            });
        });
    }
    
    // Чекбокс "Оставить у двери" - только чекбокс, без поля "Да/Нет"
    const leaveAtDoorCheckbox = document.getElementById('summaryLeaveAtDoorCheckbox');
    if (leaveAtDoorCheckbox) {
        // Устанавливаем начальное состояние
        leaveAtDoorCheckbox.checked = !!checkoutData.leaveAtDoor;
        
        // Удаляем все старые обработчики, создавая новый обработчик
        const handleCheckboxChange = function() {
            checkoutData.leaveAtDoor = this.checked;
            // Не обновляем summaryLeaveAtDoor в упрощенном сценарии
        };
        
        // Удаляем старые обработчики через клонирование
        const newCheckbox = leaveAtDoorCheckbox.cloneNode(true);
        newCheckbox.checked = !!checkoutData.leaveAtDoor;
        leaveAtDoorCheckbox.parentNode.replaceChild(newCheckbox, leaveAtDoorCheckbox);
        
        // Добавляем новый обработчик на change
        newCheckbox.addEventListener('change', handleCheckboxChange);
        
        // Также добавляем обработчик на click для надежности
        newCheckbox.addEventListener('click', function(e) {
            // Предотвращаем двойное срабатывание
            e.stopPropagation();
            checkoutData.leaveAtDoor = this.checked;
        });
        
        // Обрабатываем клик по label (если клик не по самому чекбоксу)
        const label = newCheckbox.closest('label');
        if (label) {
            label.addEventListener('click', function(e) {
                // Если клик был по label или span, а не по самому чекбоксу
                if (e.target !== newCheckbox && e.target.tagName !== 'INPUT') {
                    // Не нужно ничего делать - браузер сам переключит чекбокс при клике на label
                    // Просто убеждаемся, что состояние синхронизировано
                    setTimeout(() => {
                        checkoutData.leaveAtDoor = newCheckbox.checked;
                    }, 0);
                }
            });
        }
    }
    
    // Функция обновления отображения даты и времени
    function updateSummaryDateTimeDisplay() {
        const summaryDateTime = document.getElementById('summaryDateTime');
        const summaryDateTimeInline = document.getElementById('summaryDateTimeInline');
        
        if (deliveryDateInput.value && checkoutData.deliveryTime) {
            const formatted = formatSummaryDateTime(deliveryDateInput.value, checkoutData.deliveryTime);
            if (summaryDateTime) {
                summaryDateTime.textContent = formatted;
            }
            if (summaryDateTimeInline) {
                summaryDateTimeInline.textContent = formatted;
            }
        }
    }
}

// Рендеринг итоговой страницы
function renderCheckoutSummary() {
    // Получатель - имя и телефон отдельно
    const summaryRecipientName = document.getElementById('summaryRecipientName');
    const summaryRecipientPhone = document.getElementById('summaryRecipientPhone');
    
    if (summaryRecipientName) {
        summaryRecipientName.textContent = checkoutData.recipientName || '-';
    }
    if (summaryRecipientPhone) {
        summaryRecipientPhone.textContent = checkoutData.recipientPhone || '-';
    }
    
    // Адрес (без города)
    const summaryAddressEl = document.getElementById('summaryAddress');
    if (summaryAddressEl) {
        const addr = checkoutData.address || {};
        // Формируем строку адреса: street может содержать "улица + дом" или только "улица"
        let streetStr = addr.street || '';
        if (addr.house && !streetStr.includes(addr.house)) {
            streetStr = streetStr ? `${streetStr} ${addr.house}` : addr.house;
        }
        const addressStr = [
            streetStr,
            addr.apartment ? `кв. ${addr.apartment}` : ''
        ].filter(Boolean).join(', ');
        summaryAddressEl.textContent = addressStr || '-';
    }
    
    // Дата и время
    const summaryDateTimeEl = document.getElementById('summaryDateTime');
    if (summaryDateTimeEl && checkoutData.deliveryDate) {
        const date = new Date(checkoutData.deliveryDate);
        const dateStr = date.toLocaleDateString('ru-RU', { 
            day: 'numeric', 
            month: 'long',
            weekday: 'short'
        });
        const timeStr = checkoutData.deliveryTime ? checkoutData.deliveryTime.replace('-', ' - ') : '';
        summaryDateTimeEl.textContent = `${dateStr}, ${timeStr}`;
    }
    
    // Оставить у двери
    const summaryLeaveAtDoorEl = document.getElementById('summaryLeaveAtDoor');
    if (summaryLeaveAtDoorEl) {
        summaryLeaveAtDoorEl.textContent = checkoutData.leaveAtDoor ? 'Да' : 'Нет';
    }
    
    // Комментарий к заказу
    const orderCommentField = document.getElementById('orderCommentField');
    if (orderCommentField) {
        orderCommentField.value = checkoutData.orderComment || '';
    }
    
    // Корзина
    const cartItemsContainer = document.getElementById('checkoutCartItems');
    if (cartItemsContainer) {
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<div class="checkout-cart-item">Корзина пуста</div>';
        } else {
            cartItemsContainer.innerHTML = cart.map(item => `
                <div class="checkout-cart-item">
                    <span>${item.name} × ${item.quantity}</span>
                    <span>${(item.price * item.quantity).toLocaleString()} ₽</span>
                </div>
            `).join('');
        }
    }
    
    // Итого
    const checkoutFinalTotalEl = document.getElementById('checkoutFinalTotal');
    if (checkoutFinalTotalEl) {
        const flowersTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = flowersTotal + serviceFee + 500; // 500 - доставка
        checkoutFinalTotalEl.textContent = `${total.toLocaleString()} ₽`;
    }
}

// Открытие страницы редактирования получателя
function openEditRecipientPage() {
    console.log('[SimpleMenu] 📍 Переход: открытие страницы редактирования получателя, checkoutScreen:', checkoutScreen, 'checkoutMode:', checkoutMode);
    
    const editRecipientTab = document.getElementById('editRecipientTab');
    const nameField = document.getElementById('editRecipientName');
    const phoneField = document.getElementById('editRecipientPhone');
    const saveRecipientBtn = document.getElementById('saveRecipientBtn');
    
    if (!editRecipientTab || !nameField || !phoneField) {
        console.error('[SimpleMenu] ❌ Не найдены необходимые элементы для редактирования получателя');
        return;
    }
    
    // Заполняем поля текущими данными
    nameField.value = checkoutData.recipientName || '';
    phoneField.value = checkoutData.recipientPhone || '';
    
    // Настраиваем поле телефона
    if (typeof setupPhoneInput === 'function') {
        setupPhoneInput(phoneField);
    }
    
    // Скрываем все шаги checkout
    document.querySelectorAll('.checkout-step').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    
    // Скрываем все вкладки кроме editRecipientTab
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id !== 'editRecipientTab') {
            tab.style.display = 'none';
        }
    });
    
    // В упрощенном сценарии скрываем заголовок "Оформление заказа" и кнопку "Сохранить"
    if (isSimpleCheckout || checkoutMode === 'simple') {
        const orderPageHeader = document.querySelector('.order-page-header');
        if (orderPageHeader) {
            orderPageHeader.style.display = 'none';
        }
        
        // Скрываем список адресов и форму, если они открыты
        const checkoutAddressesList = document.getElementById('checkoutAddressesList');
        const checkoutAddressForm = document.getElementById('checkoutAddressForm');
        const addNewAddressBtn = document.getElementById('addNewAddressBtn');
        if (checkoutAddressesList) checkoutAddressesList.style.display = 'none';
        if (checkoutAddressForm) checkoutAddressForm.style.display = 'none';
        if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
        
        // В упрощенном режиме показываем кнопку "Сохранить" (не скрываем)
        if (saveRecipientBtn) {
            saveRecipientBtn.style.display = '';
        }
        
        // Добавляем автосохранение при изменении полей (дополнительно к кнопке)
        // Используем существующую функцию или создаем новую
        if (!nameField._autoSaveHandler) {
            nameField._autoSaveHandler = async () => {
                const name = nameField.value.trim();
                const phone = phoneField.value.trim();
                const phoneDigits = phone.replace(/\D/g, '');
                
                // Сохраняем только если данные валидны
                if (name && phone && phoneDigits.length >= 10) {
                    checkoutData.recipientName = name;
                    checkoutData.recipientPhone = phone;
                    
                    // Обновляем отображение на странице итого
                    renderCheckoutSummary();
                    
                    // Сохраняем в профиль пользователя в БД
                    const userId = getUserId();
                    if (userId) {
                        try {
                            await fetch('/api/user-data', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: userId,
                                    profile: {
                                        name: name,
                                        phone: phone
                                    }
                                })
                            });
                        } catch (error) {
                            console.error('Ошибка сохранения данных получателя:', error);
                        }
                    }
                }
            };
            
            // Используем тот же обработчик для обоих полей
            phoneField._autoSaveHandler = nameField._autoSaveHandler;
        }
        
        // Удаляем старые обработчики, если они есть
        nameField.removeEventListener('blur', nameField._autoSaveHandler);
        phoneField.removeEventListener('blur', phoneField._autoSaveHandler);
        
        // Добавляем автосохранение при потере фокуса
        nameField.addEventListener('blur', nameField._autoSaveHandler);
        phoneField.addEventListener('blur', phoneField._autoSaveHandler);
    } else {
        // В обычном режиме показываем кнопку "Сохранить"
        if (saveRecipientBtn) {
            saveRecipientBtn.style.display = '';
        }
    }
    
    // Показываем страницу редактирования
    editRecipientTab.style.display = 'block';
    
    // Обновляем состояние
    const previousScreen = checkoutScreen;
    checkoutScreen = 'editRecipient';
    console.log('[SimpleMenu] ✅ Переход выполнен: editRecipient, было:', previousScreen, 'стало:', checkoutScreen);
    
    // Показываем BackButton
    showBackButton(true);
}

// Открытие страницы "Мои адреса" (для выбора/редактирования на шаге 4)
function openMyAddressesPage() {
    const myAddressesTab = document.getElementById('myAddressesTab');
    const myAddressesList = document.getElementById('myAddressesList');
    
    if (!myAddressesTab || !myAddressesList) return;
    
    // Рендерим список адресов с кнопками редактирования и удаления
    renderMyAddressesList();
    
    // Скрываем все шаги checkout
    document.querySelectorAll('.checkout-step').forEach(s => s.classList.remove('active'));
    
    // В упрощенном сценарии скрываем заголовок "Оформление заказа"
    if (isSimpleCheckout) {
        const orderPageHeader = document.querySelector('.order-page-header');
        if (orderPageHeader) {
            orderPageHeader.style.display = 'none';
        }
    }
    
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id !== 'myAddressesTab') {
            tab.style.display = 'none';
        }
    });
    
    // Показываем вкладку со списком адресов
    myAddressesTab.style.display = 'block';
    
    // Обновляем состояние
    checkoutScreen = 'myAddresses';
    
    // Прокручиваем страницу вверх
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    
    // Показываем BackButton
    showBackButton(true);
}

// Рендеринг списка адресов на странице "Мои адреса"
function renderMyAddressesList() {
    const myAddressesList = document.getElementById('myAddressesList');
    if (!myAddressesList) return;
    
    if (savedAddresses.length === 0) {
        myAddressesList.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">Нет сохраненных адресов</div>';
        return;
    }
    
    // Фильтруем адреса - показываем только адреса с валидным ID
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    
    if (validAddresses.length === 0) {
        myAddressesList.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">Нет сохраненных адресов</div>';
        return;
    }
    
    myAddressesList.innerHTML = validAddresses.map((addr) => {
        // Формируем строку адреса
        let street = addr.street || '';
        const house = addr.house || '';
        if (house && !street.includes(house)) {
            street = street ? `${street} ${house}` : house;
        }
        
        const addressStr = [
            addr.city || 'Санкт-Петербург',
            street,
            addr.apartment ? `кв. ${addr.apartment}` : ''
        ].filter(Boolean).join(', ');
        
        const addressId = addr.id;
        
        // Проверяем, выбран ли этот адрес (по ID, если есть, иначе по содержимому)
        const isSelected = checkoutData.address && (
            (checkoutData.address.id && checkoutData.address.id === addressId) ||
            (!checkoutData.address.id && 
             checkoutData.address.street === street &&
             checkoutData.address.city === (addr.city || 'Санкт-Петербург'))
        );
        
        return `
            <div class="address-item" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #eee; cursor: pointer; ${isSelected ? 'background-color: #f9f9f9;' : ''}" onclick="selectAddressFromMyAddresses(${addressId})">
                <div style="flex: 1;">
                    <div style="font-weight: 500; margin-bottom: 4px;">${addressStr}</div>
                    ${isSelected ? '<div style="font-size: 12px; color: var(--primary-color);">Выбран</div>' : ''}
                </div>
                <div class="address-menu" style="position: relative;">
                    <button class="address-menu-btn" onclick="event.stopPropagation(); toggleAddressMenu(${addressId})" style="background: none; border: none; padding: 8px; cursor: pointer; color: #666;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="5" r="1"/>
                            <circle cx="12" cy="12" r="1"/>
                            <circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                    <div class="address-menu-dropdown" id="addressMenu${addressId}" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 10000; min-width: 150px; margin-top: 4px;">
                        <button onclick="event.stopPropagation(); editAddressFromMyAddresses(${addressId})" style="width: 100%; padding: 12px; text-align: left; background: none; border: none; cursor: pointer; border-bottom: 1px solid #eee;">
                            Изменить
                        </button>
                        <button onclick="event.stopPropagation(); deleteAddressFromMyAddresses(${addressId})" style="width: 100%; padding: 12px; text-align: left; background: none; border: none; cursor: pointer; color: #ff4444;">
                            Удалить
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Редактирование адреса из упрощенного режима
function editAddressFromSimple(addressId) {
    console.log('[SimpleMenu] 📍 Редактирование адреса из упрощенного режима, addressId:', addressId);
    
    // Ищем адрес
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    const addr = validAddresses.find(a => String(a.id) === String(addressId));
    
    if (!addr) {
        console.error('[editAddressFromSimple] ❌ Адрес с ID', addressId, 'не найден');
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Открываем форму редактирования
    openAddressForm({ mode: 'edit', source: 'simple', addressId: addressId });
}

// Удаление адреса из упрощенного режима
async function deleteAddressFromSimple(addressId) {
    if (!confirm('Вы уверены, что хотите удалить этот адрес?')) {
        return;
    }
    
    console.log('[SimpleMenu] 📍 Удаление адреса из упрощенного режима, addressId:', addressId);
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Удаляем адрес из списка
    const filtered = savedAddresses.filter(a => String(a.id) !== String(addressId));
    setSavedAddresses(filtered);
    
    // Сохраняем на сервер
    await saveUserData();
    
    // Если удаленный адрес был выбран, сбрасываем выбор
    if (checkoutData.addressId && Number(checkoutData.addressId) === Number(addressId)) {
        checkoutData.addressId = null;
        checkoutData.address = null;
    }
    
    // Обновляем отображение списка
    renderMyAddressesListForSimple();
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Переключение меню адреса (три точки)
function toggleAddressMenu(addressId) {
    // Закрываем все открытые меню
    document.querySelectorAll('.address-menu-dropdown').forEach(menu => {
        if (menu.id !== `addressMenu${addressId}`) {
            menu.style.display = 'none';
        }
    });
    
    // Переключаем текущее меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        const isVisible = menu.style.display !== 'none';
        menu.style.display = isVisible ? 'none' : 'block';
        
        // Если меню открывается, добавляем обработчик клика вне меню для его закрытия
        if (!isVisible) {
            setTimeout(() => {
                const closeMenuOnClickOutside = (e) => {
                    if (!menu.contains(e.target) && !e.target.closest('.address-menu-btn')) {
                        menu.style.display = 'none';
                        document.removeEventListener('click', closeMenuOnClickOutside);
                    }
                };
                document.addEventListener('click', closeMenuOnClickOutside);
            }, 0);
        }
    }
}

// Выбор адреса из списка "Мои адреса"
function selectAddressFromMyAddresses(addressId) {
    // Ищем адрес только среди адресов с валидным ID
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    const addr = validAddresses.find(a => String(a.id) === String(addressId));
    
    if (!addr) {
        console.error('[selectAddressFromMyAddresses] ❌ Адрес с ID', addressId, 'не найден');
        return;
    }
    
    // Парсим адрес
    let streetValue = addr.street || '';
    const houseValue = addr.house || '';
    if (houseValue && !streetValue.includes(houseValue)) {
        streetValue = streetValue ? `${streetValue} ${houseValue}` : houseValue;
    }
    
    // Обновляем checkoutData.address с сохранением ID
    checkoutData.address = {
        id: addr.id, // ВАЖНО: сохраняем ID адреса
        city: addr.city || 'Санкт-Петербург',
        street: streetValue,
        house: houseValue,
        apartment: addr.apartment || '',
        floor: addr.floor || '',
        entrance: addr.entrance || '',
        intercom: addr.intercom || '',
        comment: addr.comment || ''
    };
    
    console.log('[selectAddressFromMyAddresses] ✅ Выбран адрес с ID:', addr.id, checkoutData.address);
    
    // Закрываем вкладку со списком адресов
    const myAddressesTab = document.getElementById('myAddressesTab');
    if (myAddressesTab) {
        myAddressesTab.style.display = 'none';
    }
    
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Обновляем отображение и возвращаемся на шаг 4
    renderCheckoutSummary();
    goToStep(4);
}

// Редактирование адреса из списка "Мои адреса"
function editAddressFromMyAddresses(addressId) {
    // Ищем адрес только среди адресов с валидным ID
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    const addr = validAddresses.find(a => String(a.id) === String(addressId));
    
    if (!addr) {
        console.error('[editAddressFromMyAddresses] ❌ Адрес с ID', addressId, 'не найден');
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Закрываем вкладку со списком адресов
    const myAddressesTab = document.getElementById('myAddressesTab');
    if (myAddressesTab) {
        myAddressesTab.style.display = 'none';
    }
    
    // Открываем форму редактирования с данными выбранного адреса
    openEditAddressPageFromList(addr);
}

// Редактирование адреса из профиля
function editAddressFromProfile(addressId) {
    // Ищем адрес только среди адресов с валидным ID
    const validAddresses = savedAddresses.filter(addr => addr.id && typeof addr.id === 'number' && addr.id > 0);
    const addr = validAddresses.find(a => String(a.id) === String(addressId));
    
    if (!addr) {
        console.error('[editAddressFromProfile] ❌ Адрес с ID', addressId, 'не найден');
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Открываем форму редактирования через универсальную функцию
    openAddressForm({ mode: 'edit', source: 'profile', addressId: addressId });
}

// Удаление адреса из профиля
async function deleteAddressFromProfile(addressId) {
    if (!confirm('Вы уверены, что хотите удалить этот адрес?')) {
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Удаляем адрес из списка
    const filtered = savedAddresses.filter(a => String(a.id) !== String(addressId));
    setSavedAddresses(filtered);
    
    // Сохраняем на сервер (включая пустой массив, если это последний адрес)
    await saveUserData();
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Удаление адреса из списка "Мои адреса"
async function deleteAddressFromMyAddresses(addressId) {
    if (!confirm('Вы уверены, что хотите удалить этот адрес?')) {
        return;
    }
    
    // Закрываем меню
    const menu = document.getElementById(`addressMenu${addressId}`);
    if (menu) {
        menu.style.display = 'none';
    }
    
    // Удаляем адрес из списка
    const filtered = savedAddresses.filter(a => String(a.id) !== String(addressId));
    setSavedAddresses(filtered);
    
    // Сохраняем на сервер (включая пустой массив, если это последний адрес)
    await saveUserData();
    
    // Обновляем отображение списка
    renderMyAddressesList();
    
    // Тактильная обратная связь
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Открытие страницы редактирования адреса доставки из списка
function openEditAddressPageFromList(address) {
    console.log('[SimpleMenu] 📍 Переход: открытие страницы редактирования адреса, checkoutScreen:', checkoutScreen, 'checkoutMode:', checkoutMode);
    
    const editAddressTab = document.getElementById('editAddressTab');
    const cityField = document.getElementById('editAddressCity');
    const streetField = document.getElementById('editAddressStreet');
    const apartmentField = document.getElementById('editAddressApartment');
    const floorField = document.getElementById('editAddressFloor');
    const entranceField = document.getElementById('editAddressEntrance');
    const intercomField = document.getElementById('editAddressIntercom');
    const commentField = document.getElementById('editAddressComment');
    
    if (!editAddressTab || !cityField || !streetField || !address) {
        console.error('[openEditAddressPageFromList] ❌ Не найдены необходимые элементы или адрес');
        return;
    }
    
    // Сохраняем ID редактируемого адреса для последующего обновления
    // Используем ID из адреса, если он есть
    const addressId = address.id || null;
    if (addressId) {
        editAddressTab.dataset.editingAddressId = addressId;
        console.log('[openEditAddressPageFromList] ✅ Редактирование адреса с ID:', addressId);
    } else {
        console.warn('[openEditAddressPageFromList] ⚠️ Адрес без ID, будет создан новый');
        delete editAddressTab.dataset.editingAddressId;
    }
    
    // Парсим адрес из разных форматов
    let addrData = {};
    if (typeof address.address_json === 'object' && address.address_json !== null) {
        addrData = address.address_json;
    } else if (typeof address.address_json === 'string') {
        try {
            addrData = JSON.parse(address.address_json);
        } catch (e) {
            addrData = {};
        }
    }
    
    // Формируем street из street и house для отображения в поле ввода
    // В поле пользователь видит "Кемская 7" (street + house)
    let streetValue = address.street || addrData.street || '';
    const houseValue = address.house || addrData.house || '';
    
    // Объединяем street и house только если house есть и еще не включен в street
    if (houseValue) {
        // Проверяем, не содержится ли house уже в street (на случай, если данные уже объединены)
        if (!streetValue.includes(houseValue)) {
            streetValue = streetValue ? `${streetValue} ${houseValue}` : houseValue;
        }
    }
    
    console.log('[openEditAddressPageFromList] 📍 Адрес для редактирования:', { 
        street: streetValue, 
        house: houseValue,
        originalStreet: address.street,
        originalHouse: address.house
    });
    
    cityField.value = address.city || addrData.city || 'Санкт-Петербург';
    streetField.value = streetValue;
    apartmentField.value = address.apartment || addrData.apartment || '';
    floorField.value = address.floor || addrData.floor || '';
    entranceField.value = address.entrance || addrData.entrance || '';
    intercomField.value = address.intercom || addrData.intercom || '';
    commentField.value = address.comment || addrData.comment || '';
    
    // Скрываем все шаги checkout
    document.querySelectorAll('.checkout-step').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    
    // В упрощенном сценарии скрываем заголовок "Оформление заказа"
    if (isSimpleCheckout || checkoutMode === 'simple') {
        const orderPageHeader = document.querySelector('.order-page-header');
        if (orderPageHeader) {
            orderPageHeader.style.display = 'none';
        }
        
        // Скрываем список адресов и форму, если они открыты
        const checkoutAddressesList = document.getElementById('checkoutAddressesList');
        const checkoutAddressForm = document.getElementById('checkoutAddressForm');
        const addNewAddressBtn = document.getElementById('addNewAddressBtn');
        if (checkoutAddressesList) checkoutAddressesList.style.display = 'none';
        if (checkoutAddressForm) checkoutAddressForm.style.display = 'none';
        if (addNewAddressBtn) addNewAddressBtn.style.display = 'none';
    }
    
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id !== 'editAddressTab') {
            tab.style.display = 'none';
        }
    });
    
    // Показываем страницу редактирования
    editAddressTab.style.display = 'block';
    
    // Обновляем состояние
    const previousScreen = checkoutScreen;
    checkoutScreen = 'editAddress';
    console.log('[SimpleMenu] ✅ Переход выполнен: editAddress, было:', previousScreen, 'стало:', checkoutScreen);
    
    // Прокрутка в начало страницы редактирования
    setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        if (editAddressTab) {
            editAddressTab.scrollTop = 0;
            if (editAddressTab.scrollIntoView) {
                editAddressTab.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
        }
    }, 50);
    
    // Показываем BackButton
    showBackButton(true);
}

// Открытие страницы редактирования адреса доставки (из checkoutData)
function openEditAddressPage() {
    const address = checkoutData.address || {};
    openEditAddressPageFromList(address);
}

// Сохранение отредактированного адреса
async function saveEditAddress() {
    const editAddressTab = document.getElementById('editAddressTab');
    const cityField = document.getElementById('editAddressCity');
    const streetField = document.getElementById('editAddressStreet');
    const apartmentField = document.getElementById('editAddressApartment');
    const floorField = document.getElementById('editAddressFloor');
    const entranceField = document.getElementById('editAddressEntrance');
    const intercomField = document.getElementById('editAddressIntercom');
    const commentField = document.getElementById('editAddressComment');
    
    if (!cityField || !streetField) return;
    
    const city = cityField.value.trim();
    const street = streetField.value.trim();
    
    // Валидация
    if (!city || !street) {
        alert('Пожалуйста, заполните город и улицу');
        return;
    }
    
    // Парсим street и house
    // ВАЖНО: пользователь вводит "Кемская 7" - нужно правильно извлечь "7"
    // Regex ищет: пробел + цифры + опциональные буквы/корпус в конце строки
    let streetValue = street.trim();
    let houseValue = '';
    
    // Пытаемся извлечь номер дома из street
    // Паттерн: пробел + одна или более цифр + опционально буквы/корпус (к, к2, лит А и т.д.)
    // Используем тот же regex, что и на бэке для единообразия
    const houseMatch = streetValue.match(/\s+(\d+[а-яА-Яa-zA-ZкК\s]*?)$/);
    if (houseMatch && houseMatch[1]) {
        houseValue = houseMatch[1].trim();
        // Убираем номер дома из street, оставляя только название улицы
        // Используем тот же паттерн для замены, что и на бэке
        streetValue = streetValue.replace(/\s+\d+[а-яА-Яa-zA-ZкК\s]*?$/, '').trim();
    }
    
    console.log('[saveEditAddress] 📍 Парсинг адреса:', { 
        original: street, 
        street: streetValue, 
        house: houseValue 
    });
    
    // Проверяем, редактируется ли существующий адрес
    const editingAddressId = editAddressTab?.dataset.editingAddressId;
    if (editingAddressId) {
        // Обновляем существующий адрес в savedAddresses с сохранением ID
        const addressIndex = savedAddresses.findIndex(a => String(a.id) === String(editingAddressId));
        if (addressIndex !== -1) {
            // Создаем обновленный массив адресов
            const updatedAddresses = [...savedAddresses];
            updatedAddresses[addressIndex] = {
                id: savedAddresses[addressIndex].id, // ВАЖНО: сохраняем ID
                city: city,
                street: streetValue,
                house: houseValue,
                apartment: apartmentField.value.trim() || null,
                floor: floorField.value.trim() || null,
                entrance: entranceField.value.trim() || null,
                intercom: intercomField.value.trim() || null,
                comment: commentField.value.trim() || null,
                name: streetValue || 'Адрес', // Добавляем name для совместимости
                isDefault: savedAddresses[addressIndex].isDefault || false
            };
            
            console.log('[saveEditAddress] ✅ Обновлен адрес с ID:', editingAddressId, updatedAddresses[addressIndex]);
            
            // Используем единый сеттер
            setSavedAddresses(updatedAddresses);
            
            // Сохраняем на сервер
            await saveUserData();
        } else {
            console.error('[saveEditAddress] ❌ Адрес с ID', editingAddressId, 'не найден в savedAddresses');
        }
    }
    
    // Обновляем checkoutData.address с сохранением ID, если редактировали существующий
    const existingAddressId = editingAddressId || checkoutData.address?.id;
    checkoutData.address = {
        id: existingAddressId || null, // Сохраняем ID, если есть
        city: city,
        street: streetValue,
        house: houseValue,
        apartment: apartmentField.value.trim(),
        floor: floorField.value.trim(),
        entrance: entranceField.value.trim(),
        intercom: intercomField.value.trim(),
        comment: commentField.value.trim()
    };
    
    // Получаем ID сохраненного/обновленного адреса
    let savedAddressId = null;
    if (editingAddressId) {
        savedAddressId = Number(editingAddressId);
    } else {
        // Если создан новый адрес, ищем его в savedAddresses
        const newAddress = savedAddresses.find(addr => {
            const sameCity = (addr.city || '').toLowerCase().trim() === city.toLowerCase().trim();
            const sameStreet = (addr.street || '').toLowerCase().trim() === streetValue.toLowerCase().trim();
            const sameApartment = (addr.apartment || '').toLowerCase().trim() === (apartmentField.value.trim() || '').toLowerCase().trim();
            return sameCity && sameStreet && sameApartment && addr.id && typeof addr.id === 'number' && addr.id > 0;
        });
        if (newAddress && newAddress.id) {
            savedAddressId = newAddress.id;
        }
    }
    
    // Скрываем страницу редактирования
    if (editAddressTab) {
        editAddressTab.style.display = 'none';
        delete editAddressTab.dataset.editingAddressId;
    }
    
    // В упрощенном сценарии возвращаемся на вкладку оформления
    if (isSimpleCheckout || checkoutMode === 'simple') {
        if (savedAddressId) {
            // Обновляем checkoutData с новым адресом
            const updatedAddr = savedAddresses.find(a => Number(a.id) === Number(savedAddressId));
            if (updatedAddr) {
                checkoutData.addressId = updatedAddr.id;
                checkoutData.address = {
                    id: updatedAddr.id,
                    city: updatedAddr.city || 'Санкт-Петербург',
                    street: updatedAddr.street || '',
                    house: updatedAddr.house || '',
                    apartment: updatedAddr.apartment || '',
                    floor: updatedAddr.floor || '',
                    entrance: updatedAddr.entrance || '',
                    intercom: updatedAddr.intercom || '',
                    comment: updatedAddr.comment || ''
                };
            }
            // Возвращаемся на вкладку оформления
            showSimpleSummary();
        } else {
            // Если адрес не найден, просто возвращаемся на шаг 4
            showSimpleSummary();
        }
    } else {
        // В обычном режиме
        // Скрываем все вкладки
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.style.display = 'none';
        });
        
        // Обновляем отображение и возвращаемся на шаг 4
        renderCheckoutSummary();
        goToStep(4);
    }
}

// Показ модального окна выбора адреса
function showAddressSelectModal() {
    const modal = document.getElementById('addressSelectModal');
    const list = document.getElementById('addressSelectList');
    
    if (!modal || !list) return;
    
    if (savedAddresses.length === 0) {
        list.innerHTML = '<div class="address-select-item" style="text-align: center; color: #999;">Нет сохраненных адресов</div>';
    } else {
        list.innerHTML = savedAddresses.map((addr, index) => {
            // Парсим адрес из разных форматов
            let addrData = {};
            if (typeof addr.address_json === 'object' && addr.address_json !== null) {
                addrData = addr.address_json;
            } else if (typeof addr.address_json === 'string') {
                try {
                    addrData = JSON.parse(addr.address_json);
                } catch (e) {
                    addrData = {};
                }
            }
            
            const city = addr.city || addrData.city || 'Санкт-Петербург';
            let street = addr.street || addrData.street || '';
            const house = addr.house || addrData.house || '';
            const apartment = addr.apartment || addrData.apartment || '';
            
            // Объединяем street и house для обратной совместимости со старыми адресами
            if (house && !street.includes(house)) {
                street = street ? `${street} ${house}` : house;
            }
            
            const addrStr = [
                city,
                street, // Теперь содержит "улица + дом"
                apartment ? `кв. ${apartment}` : ''
            ].filter(Boolean).join(', ');
            
            return `
                <div class="address-select-item" onclick="selectAddress(${index})">
                    ${addrStr}
                </div>
            `;
        }).join('');
    }
    
    modal.style.display = 'flex';
}

// Выбор адреса
function selectAddress(index) {
    const addr = savedAddresses[index];
    if (!addr) return;
    
    // Парсим адрес из разных форматов
    let addrData = {};
    if (typeof addr.address_json === 'object' && addr.address_json !== null) {
        addrData = addr.address_json;
    } else if (typeof addr.address_json === 'string') {
        try {
            addrData = JSON.parse(addr.address_json);
        } catch (e) {
            addrData = {};
        }
    }
    
    // Объединяем street и house для обратной совместимости со старыми адресами
    let streetValue = addr.street || addrData.street || '';
    const houseValue = addr.house || addrData.house || '';
    if (houseValue && !streetValue.includes(houseValue)) {
        // Если house есть и не включен в street, объединяем их
        streetValue = streetValue ? `${streetValue} ${houseValue}` : houseValue;
    }
    
    checkoutData.address = {
        city: addr.city || addrData.city || 'Санкт-Петербург',
        street: streetValue, // Теперь содержит "улица + дом"
        apartment: addr.apartment || addrData.apartment || '',
        floor: addr.floor || addrData.floor || '',
        entrance: addr.entrance || addrData.entrance || '',
        intercom: addr.intercom || addrData.intercom || '',
        comment: addr.comment || addrData.comment || ''
    };
    
    const modal = document.getElementById('addressSelectModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    renderCheckoutSummary();
}

// Отправка заказа
async function submitOrder() {
    console.log('[submitOrder] 🚀 Начало отправки заказа');
    console.log('[submitOrder] checkoutData:', JSON.stringify(checkoutData, null, 2));
    
    // Проверяем, что все данные заполнены
    if (!checkoutData.recipientName || !checkoutData.recipientPhone) {
        console.error('[submitOrder] ❌ Не заполнены данные получателя');
        // В упрощенном сценарии только прокрутка и подсветка, без уведомлений
        if (isSimpleCheckout) {
            const summaryRecipientName = document.getElementById('summaryRecipientName');
            const summaryRecipientPhone = document.getElementById('summaryRecipientPhone');
            const editRecipient = document.getElementById('editRecipient');
            
            // Подсвечиваем поля получателя (если есть возможность)
            if (editRecipient) {
                editRecipient.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
        goToStep(1);
        }
        return;
    }
    
    if (!checkoutData.address || !checkoutData.address.street) {
        console.error('[submitOrder] ❌ Не заполнен адрес доставки');
        // В упрощенном сценарии только прокрутка и подсветка, без уведомлений
        if (isSimpleCheckout) {
            const editAddress = document.getElementById('editAddress');
            if (editAddress) {
                editAddress.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
        goToStep(2);
        }
        return;
    }
    
    if (!checkoutData.deliveryDate || !checkoutData.deliveryTime) {
        console.error('[submitOrder] ❌ Не выбраны дата и время доставки');
        
        // В упрощенном сценарии не переходим на шаг 3, а просто подсвечиваем и прокручиваем
        if (isSimpleCheckout) {
            const summaryDeliveryDateAnchor = document.getElementById('anchor-summaryDeliveryDate');
            const summaryCalendar = document.getElementById('summaryCustomCalendar');
            const summaryTimeOptions = document.getElementById('summaryDeliveryTimeOptions');
            
            // Подсвечиваем календарь
            if (summaryCalendar) {
                summaryCalendar.classList.add('error-field');
            }
            
            // Подсвечиваем слоты времени
            if (summaryTimeOptions) {
                const timeSlotButtons = summaryTimeOptions.querySelectorAll('.time-slot-btn');
                timeSlotButtons.forEach(btn => {
                    btn.classList.add('error-time-slot');
                });
            }
            
            // Прокручиваем к календарю
            if (summaryDeliveryDateAnchor) {
                summaryDeliveryDateAnchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (summaryCalendar) {
                summaryCalendar.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            // Убрали уведомления - только прокрутка и подсветка
        } else {
        goToStep(3);
        }
        return;
    }
    
    console.log('[submitOrder] ✅ Все данные проверены');
    
    // Заполняем скрытую форму данными из поэтапной формы (для совместимости с существующей логикой)
    const customerNameField = document.getElementById('customerName');
    const customerPhoneField = document.getElementById('customerPhone');
    const orderAddressCityField = document.getElementById('orderAddressCity');
    const orderAddressStreetField = document.getElementById('orderAddressStreet');
    const orderAddressApartmentField = document.getElementById('orderAddressApartment');
    const orderAddressFloorField = document.getElementById('orderAddressFloor');
    const orderAddressEntranceField = document.getElementById('orderAddressEntrance');
    const orderAddressIntercomField = document.getElementById('orderAddressIntercom');
    const orderAddressCommentField = document.getElementById('orderAddressComment');
    const deliveryDateField = document.getElementById('deliveryDate');
    
    if (customerNameField) customerNameField.value = checkoutData.recipientName;
    if (customerPhoneField) customerPhoneField.value = checkoutData.recipientPhone;
    if (orderAddressCityField) orderAddressCityField.value = checkoutData.address.city || 'Санкт-Петербург';
    if (orderAddressStreetField) orderAddressStreetField.value = checkoutData.address.street || ''; // Теперь содержит "улица + дом"
    if (orderAddressApartmentField) orderAddressApartmentField.value = checkoutData.address.apartment || '';
    if (orderAddressFloorField) orderAddressFloorField.value = checkoutData.address.floor || '';
    if (orderAddressEntranceField) orderAddressEntranceField.value = checkoutData.address.entrance || '';
    if (orderAddressIntercomField) orderAddressIntercomField.value = checkoutData.address.intercom || '';
    if (orderAddressCommentField) orderAddressCommentField.value = checkoutData.address.comment || '';
    if (deliveryDateField) {
        deliveryDateField.value = checkoutData.deliveryDate;
        // Обновляем кастомный календарь, если он существует
        if (typeof window.updateCustomCalendar === 'function' && checkoutData.deliveryDate) {
            window.updateCustomCalendar(checkoutData.deliveryDate);
        }
    }
    
    console.log('[submitOrder] 📝 Заполнены поля формы:');
    console.log('[submitOrder]   - customerName:', customerNameField?.value);
    console.log('[submitOrder]   - customerPhone:', customerPhoneField?.value);
    console.log('[submitOrder]   - orderAddressCity:', orderAddressCityField?.value);
    console.log('[submitOrder]   - orderAddressStreet:', orderAddressStreetField?.value);
    console.log('[submitOrder]   - orderAddressApartment:', orderAddressApartmentField?.value);
    console.log('[submitOrder]   - orderAddressFloor:', orderAddressFloorField?.value);
    console.log('[submitOrder]   - orderAddressEntrance:', orderAddressEntranceField?.value);
    console.log('[submitOrder]   - orderAddressIntercom:', orderAddressIntercomField?.value);
    console.log('[submitOrder]   - orderAddressComment:', orderAddressCommentField?.value);
    console.log('[submitOrder]   - deliveryDate:', deliveryDateField?.value);
    
    // Выбираем время доставки
    const timeBtn = document.querySelector(`.time-slot-btn[data-time="${checkoutData.deliveryTime}"]`);
    if (timeBtn) {
        document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('active'));
        timeBtn.classList.add('active');
        console.log('[submitOrder] ✅ Время доставки выбрано:', checkoutData.deliveryTime);
    } else {
        console.error('[submitOrder] ❌ Кнопка времени не найдена для:', checkoutData.deliveryTime);
    }
    
    // Вызываем существующую функцию валидации и отправки
    console.log('[submitOrder] 🔄 Вызываем validateAndSubmitOrder');
    const fakeEvent = { 
        preventDefault: () => {},
        stopPropagation: () => {}
    };
    try {
        await validateAndSubmitOrder(fakeEvent);
        console.log('[submitOrder] ✅ validateAndSubmitOrder завершена успешно');
    } catch (error) {
        console.error('[submitOrder] ❌ Ошибка в validateAndSubmitOrder:', error);
        throw error;
    }
}

// Инициализация поэтапной формы при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initCheckoutStepsModal();
    });
} else {
    initCheckoutStepsModal();
}

function initCheckoutStepsModal() {
    // Обработчик закрытия модального окна адресов
    document.getElementById('closeAddressModal')?.addEventListener('click', () => {
        document.getElementById('addressSelectModal').style.display = 'none';
    });
    
    document.getElementById('addNewAddressBtn')?.addEventListener('click', () => {
        document.getElementById('addressSelectModal').style.display = 'none';
        goToStep(2);
    });
    
    // Обработчики выбора времени доставки (делегирование событий)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('time-slot-btn')) {
            document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        }
    });
}
