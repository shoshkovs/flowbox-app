# Карточка товара: структура и листание изображений

## 1. HTML структура карточки товара

Карточка товара генерируется динамически в функции `renderProductCard()` в файле `public/app.js`.

### Основная структура HTML:

```html
<div class="product-card" data-product-id="${product.id}" data-swipe-blocked="false">
    <!-- Контейнер для изображений -->
    <div class="product-image-wrapper">
        <!-- Трек для листания изображений -->
        <div class="product-image-track" 
             data-product-id="${product.id}" 
             style="display: flex; width: ${images.length * 100}%; height: 100%; transition: transform 0.3s ease-out;">
            <!-- Слайды с изображениями -->
            <div class="product-image-slide" style="min-width: 100%; width: 100%; flex-shrink: 0; height: 100%;">
                <img src="${img}" alt="${product.name}" class="product-image">
            </div>
            <!-- ... еще слайды для каждого изображения ... -->
        </div>
        
        <!-- Индикаторы (точки) для множественных изображений -->
        ${hasMultipleImages ? `
            <div class="product-image-dots" data-product-id="${product.id}">
                <span class="product-image-dot active" data-index="0"></span>
                <span class="product-image-dot" data-index="1"></span>
                <!-- ... еще точки ... -->
            </div>
        ` : ''}
        
        <!-- Overlay с количеством товара в корзине (если есть) -->
        ${isInCart && bunchesCount > 0 ? `
            <div class="product-quantity-overlay show">
                <div class="product-quantity-overlay-text">${bunchesCount}</div>
            </div>
        ` : ''}
    </div>
    
    <!-- Информация о товаре -->
    <div class="product-info">
        <div class="product-name">${product.name}</div>
        <!-- ... остальная информация ... -->
    </div>
</div>
```

## 2. Сборка изображений товара

Код для сбора всех изображений товара (строки 1238-1252 в `app.js`):

```javascript
// Собираем все изображения товара
const images = [];
if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    images.push(...product.images.filter(Boolean));
} else {
    if (product.image_url) images.push(product.image_url);
    if (product.image_url_2) images.push(product.image_url_2);
    if (product.image_url_3) images.push(product.image_url_3);
    if (images.length === 0 && product.image) images.push(product.image);
}

// Если нет изображений, используем заглушку
if (images.length === 0) {
    images.push('/logo2.jpg');
}

const hasMultipleImages = images.length > 1;
```

### Логика сбора изображений:
1. Сначала проверяется массив `product.images` (если есть)
2. Если массива нет, проверяются отдельные поля: `image_url`, `image_url_2`, `image_url_3`
3. Если ничего не найдено, используется заглушка `/logo2.jpg`
4. Если изображений больше одного, показываются индикаторы (точки)

## 3. Генерация HTML для изображений

Код генерации HTML слайдов (строки 1255-1259):

```javascript
const imagesHTML = images.map((img, idx) => `
    <div class="product-image-slide" style="min-width: 100%; width: 100%; flex-shrink: 0; height: 100%;">
        <img src="${img}" alt="${product.name}" class="product-image">
    </div>
`).join('');
```

Каждое изображение оборачивается в `.product-image-slide`, который занимает 100% ширины трека. Все слайды размещаются горизонтально в `.product-image-track`.

## 4. CSS стили для изображений

### Контейнер изображения (`.product-image-wrapper`):

```css
.product-image-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 0.7;  /* Соотношение сторон 0.7 (высота больше ширины) */
    overflow: hidden;    /* Скрывает изображения за пределами контейнера */
    border-radius: 12px;
}
```

### Трек для листания (`.product-image-track`):

```css
.product-image-track {
    display: flex;           /* Горизонтальное размещение слайдов */
    height: 100%;
    will-change: transform;  /* Оптимизация для анимации */
    position: relative;
}
```

**Важно:** Ширина трека устанавливается динамически: `width: ${images.length * 100}%` - если 3 изображения, то ширина 300%.

### Слайд изображения (`.product-image-slide`):

```css
.product-image-slide {
    min-width: 100%;         /* Каждый слайд занимает 100% ширины трека */
    width: 100%;
    flex-shrink: 0;          /* Не сжимается */
    height: 100%;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;     /* Вертикальное центрирование */
    justify-content: center;  /* Горизонтальное центрирование */
    background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); /* Фон, если изображение не заполняет */
}
```

### Само изображение (`.product-image`):

```css
.product-image {
    width: 100%;
    height: 100%;
    object-fit: contain;      /* Изображение вписывается в контейнер с сохранением пропорций */
    object-position: center;  /* Центрирование */
    border-radius: 12px;
    display: block;
}
```

### Индикаторы (точки) (`.product-image-dots`):

```css
.product-image-dots {
    position: absolute;       /* Абсолютное позиционирование */
    bottom: 8px;             /* 8px от низа */
    left: 50%;
    transform: translateX(-50%); /* Центрирование */
    display: flex;
    gap: 6px;
    z-index: 2;              /* Поверх изображения */
}

.product-image-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5); /* Полупрозрачный белый */
    transition: all 0.2s ease-out;
    cursor: pointer;
}

.product-image-dot.active {
    background: rgba(255, 255, 255, 1);     /* Полностью белый */
    width: 20px;                           /* Увеличивается при активации */
    border-radius: 3px;                    /* Становится прямоугольным */
}
```

## 5. JavaScript логика листания изображений

### Инициализация свайпа

Функция `initProductCardImageSwipe()` (строки 3012-3142) инициализирует свайп для всех карточек товаров:

```javascript
function initProductCardImageSwipe() {
    const imageTracks = document.querySelectorAll('.product-image-track');
    
    imageTracks.forEach(track => {
        const productId = track.getAttribute('data-product-id');
        const dots = document.querySelector(`.product-image-dots[data-product-id="${productId}"]`);
        if (!dots) return; // Если нет точек, значит только одно изображение, свайп не нужен
        
        const totalImages = dots.querySelectorAll('.product-image-dot').length;
        if (totalImages <= 1) return;
        
        let currentIndex = 0;
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        let hasMoved = false; // Флаг, что было движение (свайп)
        
        // Функция перехода к изображению по индексу
        const goToImage = (index) => {
            currentIndex = Math.max(0, Math.min(index, totalImages - 1));
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
            
            // Обновляем точки
            const dotButtons = dots.querySelectorAll('.product-image-dot');
            dotButtons.forEach((dot, idx) => {
                if (idx === currentIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        };
        
        // Находим карточку товара для блокировки открытия при свайпе
        const productCard = track.closest('.product-card');
        
        // Обработчик начала касания/клика
        const handleStart = (e) => {
            hasMoved = false;
            startX = e.touches ? e.touches[0].clientX : e.clientX;
            currentX = startX; // Инициализируем currentX
            isDragging = true;
            track.style.transition = 'none'; // Отключаем анимацию для плавного перетаскивания
            // Сбрасываем флаг блокировки
            if (productCard) {
                productCard.setAttribute('data-swipe-blocked', 'false');
            }
        };
        
        // Обработчик движения
        const handleMove = (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Предотвращаем скролл страницы
            currentX = e.touches ? e.touches[0].clientX : e.clientX;
            const diff = Math.abs(currentX - startX);
            
            // Если движение больше 5px, считаем это свайпом
            if (diff > 5) {
                hasMoved = true;
                // Блокируем открытие карточки при свайпе
                if (productCard) {
                    productCard.setAttribute('data-swipe-blocked', 'true');
                }
                e.stopPropagation(); // Предотвращаем всплытие события
            }
            
            // Вычисляем новую позицию с ограничениями
            const currentTranslate = -currentIndex * 100;
            const dragOffset = ((currentX - startX) / track.offsetWidth) * 100;
            let newTranslate = currentTranslate + dragOffset;
            
            // Ограничиваем движение: нельзя свайпнуть дальше первого или последнего изображения
            const minTranslate = -(totalImages - 1) * 100;
            const maxTranslate = 0;
            newTranslate = Math.max(minTranslate, Math.min(maxTranslate, newTranslate));
            
            track.style.transform = `translateX(${newTranslate}%)`;
        };
        
        // Обработчик окончания касания/клика
        const handleEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            track.style.transition = 'transform 0.3s ease-out'; // Включаем анимацию обратно
            
            const diff = currentX - startX;
            const threshold = track.offsetWidth * 0.2; // 20% для переключения
            
            if (!hasMoved) {
                // Если не было свайпа, сразу сбрасываем флаг
                if (productCard) {
                    productCard.setAttribute('data-swipe-blocked', 'false');
                }
            }
            
            // Определяем направление свайпа
            // diff > 0 означает, что палец двигался вправо (свайп вправо) - показываем предыдущее изображение
            // diff < 0 означает, что палец двигался влево (свайп влево) - показываем следующее изображение
            if (Math.abs(diff) > threshold) {
                if (diff > 0) {
                    // Свайп вправо (палец вправо) - предыдущее изображение (индекс уменьшается)
                    if (currentIndex > 0) {
                        goToImage(currentIndex - 1);
                    } else {
                        // Уже на первом изображении, возвращаемся
                        goToImage(0);
                    }
                } else if (diff < 0) {
                    // Свайп влево (палец влево) - следующее изображение (индекс увеличивается)
                    if (currentIndex < totalImages - 1) {
                        goToImage(currentIndex + 1);
                    } else {
                        // Уже на последнем изображении, возвращаемся
                        goToImage(totalImages - 1);
                    }
                }
            } else {
                // Возвращаемся к текущему изображению, если свайп был недостаточным
                goToImage(currentIndex);
            }
        };
        
        // Привязываем обработчики для touch событий (мобильные устройства)
        track.addEventListener('touchstart', handleStart, { passive: false });
        track.addEventListener('touchmove', handleMove, { passive: false });
        track.addEventListener('touchend', handleEnd, { passive: false });
        
        // Привязываем обработчики для mouse событий (десктоп)
        track.addEventListener('mousedown', handleStart);
        track.addEventListener('mousemove', handleMove);
        track.addEventListener('mouseup', handleEnd);
        track.addEventListener('mouseleave', handleEnd); // Если мышь вышла за пределы
    });
}
```

### Принцип работы листания:

1. **Начало свайпа (`handleStart`):**
   - Запоминается начальная позиция (`startX`)
   - Включается режим перетаскивания (`isDragging = true`)
   - Отключается CSS transition для плавного перетаскивания

2. **Движение (`handleMove`):**
   - Вычисляется разница между текущей и начальной позицией
   - Если движение > 5px, считается свайпом и блокируется открытие карточки
   - Трек перемещается с помощью `transform: translateX()`
   - Движение ограничено границами (нельзя свайпнуть дальше первого/последнего изображения)

3. **Окончание свайпа (`handleEnd`):**
   - Если свайп был достаточным (> 20% ширины), переключается изображение
   - Если нет, возвращается к текущему изображению
   - Включается CSS transition для плавной анимации

4. **Переход к изображению (`goToImage`):**
   - Вычисляется позиция: `translateX(-${index * 100}%)`
   - Обновляются индикаторы (точки)

### Блокировка открытия карточки при свайпе

Чтобы свайп не открывал карточку товара, используется атрибут `data-swipe-blocked`:

```javascript
// При свайпе устанавливается флаг
productCard.setAttribute('data-swipe-blocked', 'true');

// При клике на карточку проверяется флаг
if (productCard.getAttribute('data-swipe-blocked') === 'true') {
    return; // Не открываем карточку
}
```

## 6. Вызов функции инициализации

Функция `initProductCardImageSwipe()` вызывается после рендеринга товаров:

```javascript
// После рендеринга товаров
originalRenderProducts();
initProductCardImageSwipe(); // Инициализируем свайп для новых карточек
```

## 7. Пример работы

1. **Товар с 3 изображениями:**
   - Ширина трека: `300%` (3 × 100%)
   - Три слайда по `100%` ширины каждый
   - Три индикатора (точки) внизу

2. **Свайп влево (палец двигается влево):**
   - `diff < 0`
   - `currentIndex` увеличивается
   - Трек сдвигается влево: `translateX(-100%)`, `translateX(-200%)`

3. **Свайп вправо (палец двигается вправо):**
   - `diff > 0`
   - `currentIndex` уменьшается
   - Трек сдвигается вправо: `translateX(0%)`, `translateX(-100%)`

## 8. Важные детали

- **Адаптивность:** Работает на мобильных (touch) и десктопе (mouse)
- **Производительность:** Используется `will-change: transform` для оптимизации
- **UX:** Плавные анимации, визуальная обратная связь через индикаторы
- **Безопасность:** Предотвращение случайного открытия карточки при свайпе

