/**
 * Простая in-memory очередь для Telegram сообщений
 * Обеспечивает rate limiting и retry при ошибках
 */

class TelegramMessageQueue {
  constructor(bot) {
    this.bot = bot;
    this.queue = [];
    this.processing = false;
    this.rateLimit = 25; // сообщений в секунду (оставляем запас от лимита Telegram 30/сек)
    this.interval = 1000 / this.rateLimit; // ~40ms между сообщениями
    this.lastSent = 0;
    this.stats = {
      total: 0,
      sent: 0,
      failed: 0,
      retried: 0
    };
  }

  /**
   * Добавить сообщение в очередь
   * @param {number|string} chatId - ID чата
   * @param {string} message - Текст сообщения
   * @param {object} options - Опции для sendMessage (parse_mode, reply_markup и т.д.)
   * @param {number} priority - Приоритет (0 = низкий, 10 = высокий)
   * @returns {Promise} Promise который резолвится после отправки
   */
  async add(chatId, message, options = {}, priority = 0) {
    return new Promise((resolve, reject) => {
      const job = {
        chatId,
        message,
        options,
        priority,
        attempts: 0,
        maxAttempts: 5,
        resolve,
        reject,
        createdAt: Date.now()
      };
      
      this.queue.push(job);
      this.stats.total++;
      
      // Сортируем по приоритету (высший приоритет = больше число)
      this.queue.sort((a, b) => b.priority - a.priority);
      
      // Запускаем обработку, если она не идет
      if (!this.processing) {
        this.process();
      }
    });
  }

  /**
   * Обработка очереди сообщений
   */
  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    console.log(`🔄 [Queue] Начало обработки очереди. В очереди: ${this.queue.length} сообщений`);
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastSent = now - this.lastSent;
      
      // Соблюдаем rate limit
      if (timeSinceLastSent < this.interval) {
        const waitTime = this.interval - timeSinceLastSent;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      const job = this.queue.shift();
      
      try {
        // Отправляем сообщение
        const result = await this.bot.telegram.sendMessage(job.chatId, job.message, job.options);
        
        this.lastSent = Date.now();
        this.stats.sent++;
        
        console.log(`✅ [Queue] Сообщение отправлено: chatId=${job.chatId}, priority=${job.priority}, queue=${this.queue.length}`);
        
        // Резолвим Promise
        job.resolve(result);
        
      } catch (error) {
        job.attempts++;
        
        // Специальная обработка 429 (Too Many Requests)
        if (error.response?.error_code === 429) {
          const retryAfter = error.response?.parameters?.retry_after || 1;
          console.log(`⏳ [Queue] Rate limit! Ждем ${retryAfter} секунд. ChatId=${job.chatId}, attempts=${job.attempts}/${job.maxAttempts}`);
          
          // Обновляем lastSent чтобы учесть задержку
          this.lastSent = Date.now() + (retryAfter * 1000);
          
          if (job.attempts < job.maxAttempts) {
            // Возвращаем в начало очереди и ждем
            this.queue.unshift(job);
            this.stats.retried++;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          } else {
            // Превышен лимит попыток
            this.stats.failed++;
            console.error(`❌ [Queue] Превышен лимит попыток для chatId=${job.chatId} после ${job.maxAttempts} попыток`);
            job.reject(new Error(`Rate limit exceeded after ${job.maxAttempts} attempts`));
          }
          
        } else if (error.response?.error_code === 403) {
          // Бот заблокирован пользователем - не ретраим
          this.stats.failed++;
          console.log(`🚫 [Queue] Бот заблокирован пользователем ${job.chatId}`);
          job.reject(error);
          
        } else if (error.response?.error_code === 400) {
          // Некорректный запрос - не ретраим
          this.stats.failed++;
          console.error(`❌ [Queue] Некорректный запрос для chatId=${job.chatId}:`, error.message);
          job.reject(error);
          
        } else {
          // Другие ошибки - ретраим с экспоненциальной задержкой
          if (job.attempts < job.maxAttempts) {
            const delay = Math.min(2000 * Math.pow(2, job.attempts - 1), 30000); // Максимум 30 секунд
            console.log(`🔄 [Queue] Ошибка отправки, повтор через ${delay}ms. ChatId=${job.chatId}, attempts=${job.attempts}/${job.maxAttempts}, error=${error.message}`);
            
            // Возвращаем в очередь с задержкой
            setTimeout(() => {
              this.queue.unshift(job);
              this.stats.retried++;
              if (!this.processing) {
                this.process();
              }
            }, delay);
            
          } else {
            // Превышен лимит попыток
            this.stats.failed++;
            console.error(`❌ [Queue] Превышен лимит попыток для chatId=${job.chatId} после ${job.maxAttempts} попыток:`, error.message);
            job.reject(error);
          }
        }
      }
    }
    
    this.processing = false;
    console.log(`✅ [Queue] Очередь обработана. Статистика: sent=${this.stats.sent}, failed=${this.stats.failed}, retried=${this.stats.retried}`);
  }

  /**
   * Получить статистику очереди
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing
    };
  }

  /**
   * Очистить статистику
   */
  resetStats() {
    this.stats = {
      total: 0,
      sent: 0,
      failed: 0,
      retried: 0
    };
  }
}

module.exports = TelegramMessageQueue;
