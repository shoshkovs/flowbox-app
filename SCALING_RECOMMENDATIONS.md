# Рекомендации по масштабированию бота FlowBox

## Текущие проблемы

### 1. **Telegram API лимиты**
- **30 сообщений в секунду** на один бот
- При одновременном создании 50+ заказов → перегрузка → ошибки 429
- Сообщения теряются без обработки ошибок

### 2. **Синхронная отправка без очередей**
- Все `sendMessage` выполняются сразу в обработчике
- Нет retry механизма
- Нет приоритизации (важные уведомления блокируются)

### 3. **Зависимость от одного инстанса**
- Если процесс упадет → все уведомления потеряются
- Нет персистентности очереди

---

## Решение: Redis + Bull Queue

### Преимущества
✅ **Rate limiting** — автоматическое соблюдение лимитов Telegram (30 msg/sec)  
✅ **Retry** — автоматические повторы при ошибках  
✅ **Персистентность** — очередь сохраняется в Redis, переживает перезапуски  
✅ **Приоритизация** — важные уведомления обрабатываются первыми  
✅ **Масштабирование** — можно запустить несколько воркеров  
✅ **Мониторинг** — видно сколько сообщений в очереди, какие падают

---

## Установка и настройка

### 1. Установка зависимостей

```bash
npm install bull ioredis
```

### 2. Создание файла `queue/telegramQueue.js`

```javascript
const Bull = require('bull');
const Redis = require('ioredis');

// Redis клиент (или используй REDIS_URL из env)
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  // Для Render.com Redis
  ...(process.env.REDIS_URL && { url: process.env.REDIS_URL })
};

const telegramQueue = new Bull('telegram-messages', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 5, // 5 попыток
    backoff: {
      type: 'exponential', // Экспоненциальная задержка
      delay: 2000 // Начинаем с 2 секунд
    },
    removeOnComplete: 100, // Храним последние 100 успешных
    removeOnFail: 1000 // Храним последние 1000 неуспешных для анализа
  },
  settings: {
    // Rate limiting: максимум 25 сообщений в секунду (оставляем запас от 30)
    maxStalledCount: 2,
    retryProcessDelay: 5000
  }
});

// Rate limiter: 25 сообщений в секунду
telegramQueue.process(25, async (job) => {
  const { chatId, message, options } = job.data;
  const { default: bot } = await import('../bot.js'); // Импортируем бота
  
  try {
    const result = await bot.telegram.sendMessage(chatId, message, options);
    console.log(`✅ Сообщение отправлено в очередь: chatId=${chatId}, jobId=${job.id}`);
    return result;
  } catch (error) {
    console.error(`❌ Ошибка отправки (job ${job.id}):`, error.message);
    
    // Специальная обработка 429 (Too Many Requests)
    if (error.response?.error_code === 429) {
      const retryAfter = error.response?.parameters?.retry_after || 1;
      console.log(`⏳ Rate limit, повтор через ${retryAfter} секунд`);
      throw new Error(`RATE_LIMIT:${retryAfter}`);
    }
    
    // Для других ошибок (бот заблокирован и т.д.) - не ретраим
    if (error.response?.error_code === 403) {
      console.log(`🚫 Бот заблокирован пользователем ${chatId}`);
      return null; // Не ретраим
    }
    
    throw error; // Ретраим для других ошибок
  }
});

// Обработка успешных отправок
telegramQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed`);
});

// Обработка ошибок после всех попыток
telegramQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
});

// Обработка rate limit ошибок (кастомная логика)
telegramQueue.on('error', (error) => {
  if (error.message.includes('RATE_LIMIT')) {
    const retryAfter = parseInt(error.message.split(':')[1] || '1');
    console.log(`⏳ Rate limit hit, waiting ${retryAfter}s`);
  }
});

module.exports = telegramQueue;
```

### 3. Обновление `bot.js`

```javascript
const telegramQueue = require('./queue/telegramQueue');

// Вместо прямого вызова bot.telegram.sendMessage:

// ❌ БЫЛО:
// await bot.telegram.sendMessage(telegramId, message);

// ✅ СТАЛО:
async function sendMessageSafe(chatId, message, options = {}) {
  return telegramQueue.add({
    chatId,
    message,
    options
  }, {
    priority: options.priority || 0, // Приоритет (0 = обычный, 10 = высокий)
    delay: options.delay || 0 // Задержка в мс
  });
}

// Обновляем все функции отправки:
async function sendOrderStatusNotification(orderId, newStatus, oldStatus = null, comment = null) {
  // ... получение данных из БД ...
  
  // Отправляем через очередь
  await sendMessageSafe(telegramId, message, {
    priority: 5 // Приоритет выше обычного
  });
}

async function sendOrderConfirmation(orderId, telegramId, orderData) {
  // ... формирование сообщения ...
  
  await sendMessageSafe(telegramIdNum, message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
    priority: 10 // Высокий приоритет - подтверждения важны
  });
}

async function sendOrderNotificationToGroup(orderId, orderData) {
  // ... формирование сообщения ...
  
  await sendMessageSafe(ORDERS_GROUP_ID, message, {
    parse_mode: 'HTML',
    message_thread_id: ORDERS_TOPIC_ID,
    priority: 3 // Группа - средний приоритет
  });
}
```

### 4. Обработчик очереди (воркер) — отдельный файл `worker.js`

```javascript
// worker.js — запускается отдельно для обработки очереди
const telegramQueue = require('./queue/telegramQueue');
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

console.log('🚀 Запуск воркера для обработки очереди Telegram сообщений...');

// Обработчик уже настроен в telegramQueue.js, просто запускаем
telegramQueue.on('active', (job) => {
  console.log(`🔄 Обработка job ${job.id}: chatId=${job.data.chatId}`);
});

telegramQueue.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

telegramQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⏹️  Остановка воркера...');
  await telegramQueue.close();
  process.exit(0);
});
```

---

## Конфигурация для Render.com

### 1. Добавить Redis в `render.yaml`

```yaml
services:
  # ... существующие сервисы ...
  
  - type: redis
    name: flowbox-redis
    plan: free # или starter для продакшена
    maxmemoryPolicy: allkeys-lru

  - type: worker # НОВЫЙ: воркер для обработки очереди
    name: flowbox-worker
    env: node
    buildCommand: npm install
    startCommand: node worker.js
    envVars:
      - key: BOT_TOKEN
        fromService:
          type: web
          name: flowbox-app
          property: BOT_TOKEN
      - key: REDIS_URL
        fromService:
          type: redis
          name: flowbox-redis
          property: connectionString
```

### 2. Обновить `.env` для основного сервиса

```env
REDIS_URL=redis://... # Будет автоматически привязан от Redis сервиса
```

---

## Альтернатива (без Redis): простая in-memory очередь

Если не хочешь добавлять Redis прямо сейчас, можно сделать простую очередь в памяти:

```javascript
// queue/simpleQueue.js
class SimpleMessageQueue {
  constructor(bot) {
    this.bot = bot;
    this.queue = [];
    this.processing = false;
    this.rateLimit = 25; // сообщений в секунду
    this.lastSent = 0;
    this.interval = 1000 / this.rateLimit; // ~40ms между сообщениями
  }

  async add(chatId, message, options = {}) {
    this.queue.push({ chatId, message, options, priority: options.priority || 0 });
    // Сортируем по приоритету
    this.queue.sort((a, b) => b.priority - a.priority);
    
    if (!this.processing) {
      this.process();
    }
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastSent = now - this.lastSent;
      
      if (timeSinceLastSent < this.interval) {
        await new Promise(resolve => setTimeout(resolve, this.interval - timeSinceLastSent));
      }
      
      const job = this.queue.shift();
      
      try {
        await this.bot.telegram.sendMessage(job.chatId, job.message, job.options);
        this.lastSent = Date.now();
      } catch (error) {
        if (error.response?.error_code === 429) {
          // Rate limit - возвращаем в очередь и ждем
          const retryAfter = error.response?.parameters?.retry_after || 1;
          this.queue.unshift(job); // Возвращаем в начало
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else {
          console.error('Ошибка отправки:', error.message);
          // Для других ошибок просто пропускаем
        }
      }
    }
    
    this.processing = false;
  }
}

module.exports = SimpleMessageQueue;
```

**Проблема**: при перезапуске процесса очередь теряется. Redis — лучшее решение для продакшена.

---

## Мониторинг очереди

### Добавить endpoint для мониторинга

```javascript
// В bot.js
app.get('/api/queue/stats', async (req, res) => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    telegramQueue.getWaitingCount(),
    telegramQueue.getActiveCount(),
    telegramQueue.getCompletedCount(),
    telegramQueue.getFailedCount(),
    telegramQueue.getDelayedCount()
  ]);
  
  res.json({
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  });
});
```

---

## Оценка нагрузки

### Текущая ситуация:
- **10 заказов в минуту** → ~1 сообщение в секунду ✅ ОК без очереди
- **50 заказов в минуту** → ~5 сообщений в секунду ✅ ОК без очереди
- **300+ заказов в минуту** → ~30+ сообщений в секунду ❌ Нужна очередь

### С очередью:
- ✅ Обрабатывает **до 25 сообщений/сек стабильно**
- ✅ При пиках автоматически ставит в очередь
- ✅ Retry при ошибках
- ✅ Персистентность при перезапусках

---

## Вывод

**Для продакшена с высокой нагрузкой: Redis + Bull обязательны.**

**Для стартапа/небольшой нагрузки:** можно начать с простой in-memory очереди, но при росте мигрировать на Redis.

**Рекомендация:** установить Redis + Bull сразу — это займет 30 минут, но защитит от проблем при росте.
