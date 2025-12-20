const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const TelegramMessageQueue = require('./queue/telegramQueue');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация очереди для Telegram сообщений
let telegramQueue = null;

// Инициализируем очередь после создания бота
if (bot) {
  telegramQueue = new TelegramMessageQueue(bot);
  console.log('✅ Очередь Telegram сообщений инициализирована');
}

/**
 * Безопасная отправка сообщения через очередь
 * @param {number|string} chatId - ID чата
 * @param {string} message - Текст сообщения
 * @param {object} options - Опции для sendMessage
 * @param {number} priority - Приоритет (0 = обычный, 5 = средний, 10 = высокий)
 * @returns {Promise}
 */
async function sendMessageSafe(chatId, message, options = {}, priority = 0) {
  if (!telegramQueue) {
    // Fallback: если очередь не инициализирована, отправляем напрямую
    console.warn('⚠️ Очередь не инициализирована, отправка напрямую');
    return bot.telegram.sendMessage(chatId, message, options);
  }
  
  return telegramQueue.add(chatId, message, options, priority);
}

// Подключение к базе данных (если DATABASE_URL установлен)
let pool = null;

// Диагностика: проверяем наличие DATABASE_URL
console.log('🔍 Проверка DATABASE_URL:', process.env.DATABASE_URL ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН');
if (process.env.DATABASE_URL) {
  console.log('📝 DATABASE_URL начинается с:', process.env.DATABASE_URL.substring(0, 30) + '...');
}

if (process.env.DATABASE_URL) {
  // Определяем, нужен ли SSL (для Render.com, Supabase, Neon и других облачных БД)
  const needsSSL = process.env.DATABASE_URL.includes('render.com') || 
                    process.env.DATABASE_URL.includes('supabase') || 
                    process.env.DATABASE_URL.includes('neon') ||
                    process.env.DATABASE_URL.includes('railway.app');
  
  console.log('🔐 SSL требуется:', needsSSL ? 'Да' : 'Нет');
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: needsSSL ? { rejectUnauthorized: false } : false,
    max: 15, // Оптимальное количество соединений
    idleTimeoutMillis: 30000, // 30 секунд простоя
    connectionTimeoutMillis: 10000, // 10 секунд на подключение (быстрее, чем 30)
    statement_timeout: 15000, // 15 секунд на выполнение запроса
    query_timeout: 15000 // 15 секунд на запрос
  });
  
  pool.on('error', (err) => {
    console.error('❌ Ошибка подключения к БД:', err);
  });
  
  // Тестовое подключение с повторными попытками
  let connectionAttempts = 0;
  const maxAttempts = 3;
  
  function testConnection() {
    connectionAttempts++;
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        if (connectionAttempts < maxAttempts) {
          // Логируем только если это не первая попытка
          if (connectionAttempts > 1) {
            console.log(`⚠️  Повторная попытка подключения к БД ${connectionAttempts}/${maxAttempts}...`);
          }
          setTimeout(testConnection, 2000); // Повтор через 2 секунды
        } else {
          console.error('❌ Ошибка подключения к БД после', maxAttempts, 'попыток:', err.message);
          console.log('💡 БД может быть еще не готова. Приложение продолжит работу, но некоторые функции могут быть недоступны.');
        }
      } else {
        if (connectionAttempts === 1) {
          console.log('✅ Подключение к базе данных установлено');
          // Выполняем критическую миграцию service_fee_percent синхронно при первом подключении
          (async () => {
            try {
              const client = await pool.connect();
              try {
                const columnCheck = await client.query(`
                  SELECT column_name 
                  FROM information_schema.columns 
                  WHERE table_name = 'orders' AND column_name = 'service_fee_percent'
                `);
                
                if (columnCheck.rows.length === 0) {
                  console.log('🔄 Выполняем критическую миграцию: добавление колонки service_fee_percent в таблицу orders...');
                  await client.query(`
                    ALTER TABLE orders 
                    ADD COLUMN service_fee_percent NUMERIC(5,2) DEFAULT 10.00
                  `);
                  
                  // Обновляем существующие заказы
                  await client.query(`
                    UPDATE orders 
                    SET service_fee_percent = CASE 
                        WHEN flowers_total > 0 THEN ROUND((service_fee::NUMERIC / flowers_total::NUMERIC * 100)::NUMERIC, 2)
                        ELSE 10.00
                    END
                    WHERE service_fee_percent IS NULL
                  `);
                  
                  await client.query(`
                    UPDATE orders 
                    SET service_fee_percent = 10.00
                    WHERE service_fee_percent IS NULL
                  `);
                  
                  console.log('✅ Критическая миграция service_fee_percent завершена');
                } else {
                  console.log('✅ Колонка service_fee_percent уже существует');
                }
              } catch (migrationError) {
                if (!migrationError.message.includes('already exists') && !migrationError.message.includes('duplicate')) {
                  console.log('⚠️  Критическая миграция service_fee_percent:', migrationError.message);
                }
              } finally {
                client.release();
              }
            } catch (error) {
              console.log('⚠️  Ошибка при выполнении критической миграции:', error.message);
            }
          })();
        } else {
          console.log(`✅ Подключение к базе данных установлено (попытка ${connectionAttempts})`);
        }
      }
    });
  }
  
  // Запускаем тест подключения
  testConnection();
  
  // Выполняем миграции
  setTimeout(async () => {
    // Миграция min_order_quantity
    try {
      const client = await pool.connect();
      try {
        const columnCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'products' AND column_name = 'min_order_quantity'
        `);
        
        if (columnCheck.rows.length === 0) {
          console.log('🔄 Выполняем миграцию: добавление min_order_quantity...');
          await client.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS min_order_quantity INTEGER DEFAULT 1
          `);
          console.log('✅ Миграция min_order_quantity завершена');
        }
      } catch (migrationError) {
        if (migrationError.code !== '42P16') {
          console.log('⚠️  Миграция min_order_quantity:', migrationError.message);
        }
      } finally {
        client.release();
      }
    } catch (error) {
      // Игнорируем ошибки при миграции
    }
    
    // Миграция image_url_2 и image_url_3 для товаров
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          const columnCheck2 = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'image_url_2'
          `);
          
          if (columnCheck2.rows.length === 0) {
            console.log('🔄 Выполняем миграцию: добавление image_url_2...');
            await client.query(`
              ALTER TABLE products 
              ADD COLUMN IF NOT EXISTS image_url_2 TEXT
            `);
            console.log('✅ Миграция image_url_2 завершена');
          }
          
          const columnCheck3 = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'image_url_3'
          `);
          
          if (columnCheck3.rows.length === 0) {
            console.log('🔄 Выполняем миграцию: добавление image_url_3...');
            await client.query(`
              ALTER TABLE products 
              ADD COLUMN IF NOT EXISTS image_url_3 TEXT
            `);
            console.log('✅ Миграция image_url_3 завершена');
          }
        } catch (migrationError) {
          if (migrationError.code !== '42P16') {
            console.log('⚠️  Миграция image_url_2/image_url_3:', migrationError.message);
          }
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
    }, 2000);
    
    // Миграция справочников товаров
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          const fs = require('fs');
          const path = require('path');
          const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'database', 'create-product-dictionaries.sql'),
            'utf8'
          );
          
          // Выполняем миграцию построчно
          const statements = migrationSQL.split(';').filter(s => s.trim());
          for (const statement of statements) {
            if (statement.trim()) {
              try {
                await client.query(statement);
              } catch (err) {
                // Игнорируем ошибки "уже существует"
                if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
                  console.log('⚠️  Ошибка миграции справочников:', err.message);
                }
              }
            }
          }
          console.log('✅ Миграция справочников товаров завершена');
        } catch (migrationError) {
          console.log('⚠️  Миграция справочников:', migrationError.message);
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
      
      // Миграция структуры поставок
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            const fs = require('fs');
            const path = require('path');
            const migrationSQL = fs.readFileSync(
              path.join(__dirname, 'database', 'migrate-supply-structure.sql'),
              'utf8'
            );
            
            // Выполняем миграцию построчно
            const statements = migrationSQL.split(';').filter(s => s.trim());
            for (const statement of statements) {
              if (statement.trim()) {
                try {
                  await client.query(statement);
                } catch (err) {
                  // Игнорируем ошибки "уже существует"
                  if (!err.message.includes('already exists') && !err.message.includes('duplicate') && !err.message.includes('column') && !err.message.includes('relation')) {
                    console.log('⚠️  Ошибка миграции структуры поставок:', err.message);
                  }
                }
              }
            }
            console.log('✅ Миграция структуры поставок завершена');
          } catch (migrationError) {
            console.log('⚠️  Миграция структуры поставок:', migrationError.message);
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 3200);
      
      // Миграция: проверка и добавление колонки house в таблицу addresses
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            const columnCheck = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'addresses' AND column_name = 'house'
            `);
            
            if (columnCheck.rows.length === 0) {
              console.log('🔄 Выполняем миграцию: добавление колонки house в таблицу addresses...');
              await client.query(`
                ALTER TABLE addresses 
                ADD COLUMN house TEXT NOT NULL DEFAULT ''
              `);
              console.log('✅ Миграция колонки house завершена');
            } else {
              console.log('✅ Колонка house уже существует в таблице addresses');
            }
          } catch (migrationError) {
            if (migrationError.code !== '42P16' && !migrationError.message.includes('already exists')) {
              console.log('⚠️  Миграция колонки house:', migrationError.message);
            }
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 4000);
      
      // Миграция: создание таблицы order_status_history, если её нет
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            const tableCheck = await client.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'order_status_history'
              )
            `);
            
            if (!tableCheck.rows[0].exists) {
              console.log('🔄 Создаем таблицу order_status_history...');
              await client.query(`
                CREATE TABLE order_status_history (
                  id              SERIAL PRIMARY KEY,
                  order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                  status          TEXT NOT NULL,
                  source          TEXT,
                  changed_by      TEXT,
                  changed_by_id   INTEGER,
                  comment         TEXT,
                  created_at      TIMESTAMPTZ DEFAULT now()
                )
              `);
              console.log('✅ Таблица order_status_history создана');
            }
          } catch (migrationError) {
            console.log('⚠️  Миграция order_status_history:', migrationError.message);
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 2500);
      
      // Миграция: создание таблицы suppliers и добавление supplier_id в supplies
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            // Создаем таблицу suppliers, если её нет
            const tableCheck = await client.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'suppliers'
              )
            `);
            
            if (!tableCheck.rows[0].exists) {
              console.log('🔄 Создаем таблицу suppliers...');
              await client.query(`
                CREATE TABLE suppliers (
                  id SERIAL PRIMARY KEY,
                  name TEXT NOT NULL UNIQUE,
                  created_at TIMESTAMPTZ DEFAULT now(),
                  updated_at TIMESTAMPTZ DEFAULT now()
                )
              `);
              console.log('✅ Таблица suppliers создана');
            }
            
            // Добавляем supplier_id в supplies, если его нет
            const columnCheck = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'supplies' AND column_name = 'supplier_id'
            `);
            
            if (columnCheck.rows.length === 0) {
              console.log('🔄 Добавляем поле supplier_id в таблицу supplies...');
              // Сначала удаляем старое поле supplier, если оно есть
              const oldColumnCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'supplies' AND column_name = 'supplier'
              `);
              if (oldColumnCheck.rows.length > 0) {
                await client.query(`ALTER TABLE supplies DROP COLUMN IF EXISTS supplier`);
              }
              // Добавляем новое поле supplier_id
              await client.query(`
                ALTER TABLE supplies 
                ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)
              `);
              console.log('✅ Поле supplier_id добавлено в таблицу supplies');
            }
          } catch (migrationError) {
            console.log('⚠️  Миграция suppliers:', migrationError.message);
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 2800);
      
      // Миграция: добавление статуса PURCHASE в constraint
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            // Проверяем, есть ли constraint
            const constraintCheck = await client.query(`
              SELECT conname 
              FROM pg_constraint 
              WHERE conname = 'orders_status_check' AND conrelid = 'orders'::regclass
            `);
            
            if (constraintCheck.rows.length > 0) {
              console.log('🔄 Обновляем constraint orders_status_check: добавляем PURCHASE...');
              // Удаляем старый constraint
              await client.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check`);
              // Добавляем новый с PURCHASE
              await client.query(`
                ALTER TABLE orders
                ADD CONSTRAINT orders_status_check
                CHECK (status IN ('UNPAID','NEW','PROCESSING','PURCHASE','COLLECTING','DELIVERING','COMPLETED','CANCELED'))
              `);
              console.log('✅ Constraint orders_status_check обновлен (добавлен PURCHASE)');
            }
          } catch (migrationError) {
            console.log('⚠️  Миграция constraint:', migrationError.message);
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 3000);
      
      // Миграция: добавление колонки service_fee_percent в таблицу orders
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            const columnCheck = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'orders' AND column_name = 'service_fee_percent'
            `);
            
            if (columnCheck.rows.length === 0) {
              console.log('🔄 Выполняем миграцию: добавление колонки service_fee_percent в таблицу orders...');
              await client.query(`
                ALTER TABLE orders 
                ADD COLUMN service_fee_percent NUMERIC(5,2) DEFAULT 10.00
              `);
              
              // Обновляем существующие заказы, устанавливая процент по умолчанию
              await client.query(`
                UPDATE orders 
                SET service_fee_percent = CASE 
                    WHEN flowers_total > 0 THEN ROUND((service_fee::NUMERIC / flowers_total::NUMERIC * 100)::NUMERIC, 2)
                    ELSE 10.00
                END
                WHERE service_fee_percent IS NULL
              `);
              
              // Устанавливаем значение по умолчанию для заказов, где не удалось вычислить процент
              await client.query(`
                UPDATE orders 
                SET service_fee_percent = 10.00
                WHERE service_fee_percent IS NULL
              `);
              
              console.log('✅ Миграция колонки service_fee_percent завершена');
            } else {
              console.log('✅ Колонка service_fee_percent уже существует в таблице orders');
            }
          } catch (migrationError) {
            if (!migrationError.message.includes('already exists') && !migrationError.message.includes('duplicate')) {
              console.log('⚠️  Миграция колонки service_fee_percent:', migrationError.message);
            }
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 3500);
    }, 2000);
    
    // Миграция price -> price_per_stem
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          // Проверяем наличие price_per_stem
          const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'price_per_stem'
          `);
          
          if (columnCheck.rows.length === 0) {
            // Создаем price_per_stem как INTEGER
            await client.query(`
              ALTER TABLE products ADD COLUMN price_per_stem INTEGER
            `);
            
            // Копируем данные из price, если существует
            const priceCheck = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'products' AND column_name = 'price'
            `);
            
            if (priceCheck.rows.length > 0) {
              await client.query(`
                UPDATE products SET price_per_stem = price WHERE price IS NOT NULL
              `);
            }
            
            // Делаем price_per_stem NOT NULL с DEFAULT
            await client.query(`
              ALTER TABLE products ALTER COLUMN price_per_stem SET DEFAULT 0
            `);
            await client.query(`
              UPDATE products SET price_per_stem = 0 WHERE price_per_stem IS NULL
            `);
            await client.query(`
              ALTER TABLE products ALTER COLUMN price_per_stem SET NOT NULL
            `);
          } else {
            // Если price_per_stem существует, проверяем тип
            const typeCheck = await client.query(`
              SELECT data_type 
              FROM information_schema.columns 
              WHERE table_name = 'products' AND column_name = 'price_per_stem'
            `);
            
            if (typeCheck.rows.length > 0 && 
                (typeCheck.rows[0].data_type === 'numeric' || typeCheck.rows[0].data_type === 'decimal')) {
              // Конвертируем DECIMAL в INTEGER
              await client.query(`
                ALTER TABLE products ALTER COLUMN price_per_stem TYPE INTEGER USING ROUND(price_per_stem)::INTEGER
              `);
            }
          }
          
          // Делаем старое поле price nullable
          const priceColumnCheck = await client.query(`
            SELECT is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'price' AND is_nullable = 'NO'
          `);
          
          if (priceColumnCheck.rows.length > 0) {
            await client.query(`
              ALTER TABLE products ALTER COLUMN price DROP NOT NULL
            `);
          }
          
          // Делаем description nullable
          const descColumnCheck = await client.query(`
            SELECT is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'description' AND is_nullable = 'NO'
          `);
          
          if (descColumnCheck.rows.length > 0) {
            await client.query(`
              ALTER TABLE products ALTER COLUMN description DROP NOT NULL
            `);
          }
          
          console.log('✅ Миграция price -> price_per_stem завершена');
        } catch (migrationError) {
          console.log('⚠️  Миграция price:', migrationError.message);
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
    }, 3000);
    
    // Миграция комментариев заказов
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          const fs = require('fs');
          const path = require('path');
          const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'database', 'add-order-comments.sql'),
            'utf8'
          );
          
          await client.query(migrationSQL);
          console.log('✅ Миграция комментариев заказов завершена');
        } catch (migrationError) {
          if (!migrationError.message.includes('already exists') && !migrationError.message.includes('duplicate')) {
            console.log('⚠️  Ошибка миграции комментариев:', migrationError.message);
          }
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
    }, 4000);
    
    // Миграция таблиц склада
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          const fs = require('fs');
          const path = require('path');
          const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'database', 'create-warehouse-tables.sql'),
            'utf8'
          );
          
          // Выполняем миграцию построчно
          const statements = migrationSQL.split(';').filter(s => s.trim());
          for (const statement of statements) {
            if (statement.trim()) {
              try {
                await client.query(statement);
              } catch (err) {
                // Игнорируем ошибки "уже существует"
                if (!err.message.includes('already exists') && 
                    !err.message.includes('duplicate')) {
                  console.log('⚠️  Ошибка миграции склада:', err.message);
                }
              }
            }
          }
          console.log('✅ Миграция таблиц склада завершена');
        } catch (migrationError) {
          console.log('⚠️  Миграция склада:', migrationError.message);
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
    }, 4000);
    
    // Миграция features удалена - features должен оставаться TEXT[]
    // Конвертация выполняется в migrate-to-final-structure.sql если нужно
    
    // Миграция структуры БД к согласованному виду
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          const fs = require('fs');
          const path = require('path');
          const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'database', 'migrate-database-structure.sql'),
            'utf8'
          );
          
          // Улучшенная логика разбора SQL: учитываем DO блоки
          const statements = [];
          let currentStatement = '';
          let inDoBlock = false;
          let dollarTag = '';
          let dollarTagDepth = 0;
          
          const lines = migrationSQL.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Пропускаем комментарии
            if (trimmedLine.startsWith('--')) {
              continue;
            }
            
            // Проверяем начало DO блока
            const doMatch = trimmedLine.match(/DO\s+\$(\w*)\$/i);
            if (doMatch) {
              inDoBlock = true;
              dollarTag = '$' + (doMatch[1] || '') + '$';
              dollarTagDepth = 1;
              currentStatement += line + '\n';
              continue;
            }
            
            // Подсчитываем вложенные $$ блоки
            if (inDoBlock) {
              const tagMatches = trimmedLine.match(new RegExp('\\$' + (dollarTag.match(/\$(\w*)\$/) ? dollarTag.match(/\$(\w*)\$/)[1] : '') + '\\$', 'g'));
              if (tagMatches) {
                dollarTagDepth += tagMatches.length;
              }
            }
            
            // Проверяем конец DO блока
            if (inDoBlock && trimmedLine.includes('END ' + dollarTag)) {
              currentStatement += line;
              dollarTagDepth--;
              if (dollarTagDepth === 0 && trimmedLine.endsWith(';')) {
                statements.push(currentStatement.trim());
                currentStatement = '';
                inDoBlock = false;
                dollarTag = '';
                dollarTagDepth = 0;
              }
              continue;
            }
            
            // Добавляем строку к текущему statement
            currentStatement += line + '\n';
            
            // Если не в DO блоке и строка заканчивается на ;, завершаем statement
            if (!inDoBlock && trimmedLine.endsWith(';')) {
              statements.push(currentStatement.trim());
              currentStatement = '';
            }
          }
          
          // Добавляем последний statement если он есть
          if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
          }
          
          // Выполняем statements
          for (const statement of statements) {
            if (statement.trim() && !statement.trim().startsWith('--')) {
              try {
                await client.query(statement);
              } catch (err) {
                // Игнорируем ошибки "уже существует", "не существует" и т.д.
                const ignorableErrors = [
                  'already exists',
                  'duplicate',
                  'constraint',
                  'does not exist',
                  'column',
                  'relation',
                  '42P16', // duplicate_column
                  '42710', // duplicate_object
                  '42704'  // undefined_object
                ];
                
                const shouldIgnore = ignorableErrors.some(msg => 
                  err.message.includes(msg) || err.code === msg
                );
                
                if (!shouldIgnore) {
                  console.log('⚠️  Ошибка миграции структуры БД:', err.message);
                }
              }
            }
          }
          console.log('✅ Миграция структуры БД завершена');
        } catch (migrationError) {
          console.log('⚠️  Миграция структуры БД:', migrationError.message);
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
    }, 6000); // Ждем 6 секунд после подключения
    
    // Миграция к финальной структуре согласно ТЗ
    setTimeout(async () => {
      try {
        const client = await pool.connect();
        try {
          const fs = require('fs');
          const path = require('path');
          const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'database', 'migrate-to-final-structure.sql'),
            'utf8'
          );
          
          // Улучшенная логика разбора SQL: учитываем DO блоки
          const statements = [];
          let currentStatement = '';
          let inDoBlock = false;
          let dollarTag = '';
          
          const lines = migrationSQL.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Пропускаем комментарии
            if (trimmedLine.startsWith('--')) {
              continue;
            }
            
            // Проверяем начало DO блока
            if (trimmedLine.match(/DO\s+\$\$/i)) {
              inDoBlock = true;
              dollarTag = '$$';
              currentStatement += line + '\n';
              continue;
            }
            
            // Проверяем начало DO блока с кастомным тегом
            const doMatch = trimmedLine.match(/DO\s+\$(\w+)\$/i);
            if (doMatch) {
              inDoBlock = true;
              dollarTag = '$' + doMatch[1] + '$';
              currentStatement += line + '\n';
              continue;
            }
            
            // Проверяем конец DO блока
            if (inDoBlock && trimmedLine.includes('END ' + dollarTag)) {
              currentStatement += line;
              if (trimmedLine.endsWith(';')) {
                statements.push(currentStatement.trim());
                currentStatement = '';
                inDoBlock = false;
                dollarTag = '';
              }
              continue;
            }
            
            // Добавляем строку к текущему statement
            currentStatement += line + '\n';
            
            // Если не в DO блоке и строка заканчивается на ;, завершаем statement
            if (!inDoBlock && trimmedLine.endsWith(';')) {
              statements.push(currentStatement.trim());
              currentStatement = '';
            }
          }
          
          // Добавляем последний statement если он есть
          if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
          }
          
          // Выполняем statements
          for (const statement of statements) {
            if (statement.trim() && !statement.trim().startsWith('--')) {
              try {
                await client.query(statement);
              } catch (err) {
                // Игнорируем ошибки "уже существует", "не существует" и т.д.
                const ignorableErrors = [
                  'already exists',
                  'duplicate',
                  'constraint',
                  'does not exist',
                  'column',
                  'relation',
                  '42P16', // duplicate_column
                  '42710', // duplicate_object
                  '42704', // undefined_object
                  '42804'  // datatype_mismatch (для features)
                ];
                
                const shouldIgnore = ignorableErrors.some(msg => 
                  err.message.includes(msg) || err.code === msg
                );
                
                if (!shouldIgnore) {
                  console.log('⚠️  Ошибка финальной миграции БД:', err.message);
                }
              }
            }
          }
          console.log('✅ Финальная миграция структуры БД завершена');
        } catch (migrationError) {
          console.log('⚠️  Финальная миграция структуры БД:', migrationError.message);
        } finally {
          client.release();
        }
      } catch (error) {
        // Игнорируем ошибки при миграции
      }
    }, 7000); // Ждем 7 секунд после подключения
      
      // Миграция: создание таблицы support_topics для системы поддержки (форум-топики)
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            // Проверяем существование таблицы
            const tableCheck = await client.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'support_topics'
              )
            `);
            
            if (!tableCheck.rows[0].exists) {
              console.log('🔄 Создаем таблицу support_topics...');
              await client.query(`
                CREATE TABLE support_topics (
                  id SERIAL PRIMARY KEY,
                  user_id BIGINT NOT NULL,
                  message_thread_id INTEGER NOT NULL,
                  topic_name TEXT,
                  created_at TIMESTAMPTZ DEFAULT now(),
                  updated_at TIMESTAMPTZ DEFAULT now(),
                  UNIQUE(user_id),
                  UNIQUE(message_thread_id)
                )
              `);
              
              // Индексы для быстрого поиска
              await client.query(`
                CREATE INDEX idx_support_topics_user_id ON support_topics(user_id);
                CREATE INDEX idx_support_topics_message_thread_id ON support_topics(message_thread_id);
              `);
              
              console.log('✅ Таблица support_topics создана');
            } else {
              // Проверяем структуру таблицы - есть ли нужные колонки
              const columnsCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'support_topics'
              `);
              
              const columns = columnsCheck.rows.map(r => r.column_name);
              const hasThreadId = columns.includes('message_thread_id');
              const hasTopicName = columns.includes('topic_name');
              const hasUpdatedAt = columns.includes('updated_at');
              
              if (!hasThreadId) {
                console.log('🔄 Добавляем колонку message_thread_id в таблицу support_topics...');
                try {
                  await client.query(`
                    ALTER TABLE support_topics
                    ADD COLUMN IF NOT EXISTS message_thread_id INTEGER
                  `);
                  
                  await client.query(`
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_support_topics_message_thread_id 
                    ON support_topics(message_thread_id)
                    WHERE message_thread_id IS NOT NULL
                  `);
                  
                  console.log('✅ Колонка message_thread_id добавлена');
                } catch (alterError) {
                  console.log('⚠️  Ошибка добавления колонки message_thread_id:', alterError.message);
                }
              }
              
              if (!hasTopicName) {
                console.log('🔄 Добавляем колонку topic_name в таблицу support_topics...');
                try {
                  await client.query(`
                    ALTER TABLE support_topics
                    ADD COLUMN IF NOT EXISTS topic_name TEXT
                  `);
                  
                  console.log('✅ Колонка topic_name добавлена');
                } catch (alterError) {
                  console.log('⚠️  Ошибка добавления колонки topic_name:', alterError.message);
                }
              }
              
              if (!hasUpdatedAt) {
                console.log('🔄 Добавляем колонку updated_at в таблицу support_topics...');
                try {
                  await client.query(`
                    ALTER TABLE support_topics
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()
                  `);
                  
                  console.log('✅ Колонка updated_at добавлена');
                } catch (alterError) {
                  console.log('⚠️  Ошибка добавления колонки updated_at:', alterError.message);
                }
              }
            }
          } catch (migrationError) {
            if (!migrationError.message.includes('already exists') && !migrationError.message.includes('duplicate')) {
              console.log('⚠️  Миграция support_topics:', migrationError.message);
            }
          } finally {
            client.release();
          }
        } catch (error) {
          console.error('❌ Критическая ошибка при миграции support_topics:', error);
        }
      }, 8000);
      
      // Миграция: добавление поля leave_at_door в таблицу orders
      setTimeout(async () => {
        try {
          const client = await pool.connect();
          try {
            // Проверяем, существует ли поле
            const columnCheck = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'orders' AND column_name = 'leave_at_door'
            `);
            
            if (columnCheck.rows.length === 0) {
              console.log('🔄 Добавляем поле leave_at_door в таблицу orders...');
          await client.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS leave_at_door BOOLEAN NOT NULL DEFAULT FALSE
          `);
              console.log('✅ Поле leave_at_door добавлено в таблицу orders');
            }
            
            // Миграция: добавление колонки order_number в таблицу orders
            const orderNumberColumnCheck = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'orders' AND column_name = 'order_number'
            `);
            
            if (orderNumberColumnCheck.rows.length === 0) {
              console.log('🔄 Выполняем миграцию: добавление колонки order_number в таблицу orders...');
              try {
                await client.query(`
                  ALTER TABLE orders 
                  ADD COLUMN order_number BIGINT
                `);
                console.log('✅ Колонка order_number добавлена в таблицу orders');
              } catch (alterError) {
                // Игнорируем ошибки "already exists" и "duplicate"
                if (alterError.message.includes('already exists') || alterError.message.includes('duplicate')) {
                  console.log('✅ Колонка order_number уже существует в таблице orders');
                } 
                // Если достигнут лимит колонок - это не критично, система будет работать без order_number
                else if (alterError.message.includes('1600 columns')) {
                  console.log('⚠️  Достигнут лимит колонок в таблице orders (1600). Колонка order_number не может быть добавлена.');
                  console.log('ℹ️  Система будет работать без order_number, используя только order.id для идентификации заказов.');
                } else {
                  console.log('⚠️  Ошибка при добавлении колонки order_number:', alterError.message);
                }
              }
            } else {
              console.log('✅ Колонка order_number уже существует в таблице orders');
            }
          } catch (migrationError) {
            if (!migrationError.message.includes('already exists') && !migrationError.message.includes('duplicate')) {
              console.log('⚠️  Миграция leave_at_door/order_number:', migrationError.message);
            }
          } finally {
            client.release();
          }
        } catch (error) {
          // Игнорируем ошибки при миграции
        }
      }, 9000);
  }); // Закрываем первый setTimeout
} else {
  console.log('⚠️  DATABASE_URL не установлен, используется файловое хранилище');
  console.log('💡 Для использования БД добавь переменную DATABASE_URL в Environment Render.com');
}

app.use(express.json());

// ВАЖНО: Маршруты админки должны быть ДО статических файлов MiniApp
// Статические файлы для админки (собранная React версия)
const adminBuildPath = path.join(__dirname, 'admin-build');
const adminSourcePath = path.join(__dirname, 'admin');

// Проверка админ-панели
// На Render.com сборка должна выполняться через npm run build перед запуском
// Здесь только проверяем наличие собранной версии
if (!fs.existsSync(adminBuildPath)) {
  console.log('⚠️  admin-build не найден');
  console.log('💡 На Render.com убедитесь, что build команда включает: npm run build');
  console.log('💡 Для локальной разработки выполните: npm run build:admin');
}

if (fs.existsSync(adminBuildPath)) {
  // Используем собранную версию
  // Сначала раздаем статические файлы (assets) - важно до маршрута /admin/*
  app.use('/admin', express.static(adminBuildPath, {
    setHeaders: (res, filePath) => {
      // Кеширование для статических файлов
      if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  
  // Затем обрабатываем все остальные запросы как SPA
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminBuildPath, 'index.html'));
  });
  
  app.get('/admin/*', (req, res) => {
    // Пропускаем запросы к статическим файлам (они уже обработаны выше)
    if (req.path.startsWith('/admin/assets/')) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(adminBuildPath, 'index.html'));
  });
  
  console.log('✅ Админ-панель: React версия из admin-build/');
} else {
  console.log('⚠️  Админ-панель: используем исходники (fallback)');
  // Fallback на старую версию
  app.use('/admin', express.static(adminSourcePath));
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminSourcePath, 'index.html'));
  });
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(adminSourcePath, 'index.html'));
  });
}

// Статические файлы для MiniApp с заголовками против кеширования
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Главная страница MiniApp
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint для получения каталога (использует БД или fallback)
// Публичные API для фильтров (без авторизации)
app.get('/api/categories', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_categories ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

app.get('/api/colors', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_colors ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения цветов:', error);
    res.status(500).json({ error: 'Ошибка получения цветов' });
  }
});

app.get('/api/qualities', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_qualities ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения качеств:', error);
    res.status(500).json({ error: 'Ошибка получения качеств' });
  }
});

app.get('/api/products', async (req, res) => {
  if (pool) {
    // Используем БД
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC'
        );
        
        // Преобразуем в формат для фронтенда
        const products = await Promise.all(result.rows.map(async (row) => {
          // Получаем связанные данные
          const categoryResult = row.category_id ? await client.query('SELECT name FROM product_categories WHERE id = $1', [row.category_id]) : { rows: [] };
          const colorResult = row.color_id ? await client.query('SELECT name FROM product_colors WHERE id = $1', [row.color_id]) : { rows: [] };
          const qualitiesResult = await client.query(`
            SELECT pq.name 
            FROM product_qualities pq
            JOIN product_qualities_map pqm ON pq.id = pqm.quality_id
            WHERE pqm.product_id = $1
          `, [row.id]);
          
          // Формируем массив качеств из features (TEXT[]) или из связей
          let features = [];
          if (row.features && Array.isArray(row.features)) {
            features = row.features;
          } else if (row.features) {
            // Если features в другом формате, пытаемся преобразовать
            try {
              features = typeof row.features === 'string' ? JSON.parse(row.features) : row.features;
            } catch (e) {
              features = qualitiesResult.rows.map(r => r.name);
            }
          } else {
            features = qualitiesResult.rows.map(r => r.name);
          }
          
          // Формируем массив изображений
          const images = [];
          if (row.image_url) images.push(row.image_url);
          if (row.image_url_2) images.push(row.image_url_2);
          if (row.image_url_3) images.push(row.image_url_3);
          
          return {
            id: row.id,
            name: row.name,
            price: row.price_per_stem || row.price || 0,
            image: row.image_url || 'https://via.placeholder.com/300x300?text=Цветы',
            image_url: row.image_url,
            image_url_2: row.image_url_2 || null,
            image_url_3: row.image_url_3 || null,
            images: images.length > 0 ? images : [row.image_url || 'https://via.placeholder.com/300x300?text=Цветы'],
            type: categoryResult.rows[0]?.name || row.type || '',
            category: categoryResult.rows[0]?.name || row.type || '',
            color: colorResult.rows[0]?.name || row.color || '',
            features: features,
            is_active: row.is_active !== false,
            min_order_quantity: row.min_stem_quantity || row.min_order_quantity || 1,
            pricePerStem: row.price_per_stem || row.price || 0,
            minStemQuantity: row.min_stem_quantity || row.min_order_quantity || 1
          };
        }));
        
        res.json(products);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Ошибка получения товаров из БД:', error);
      // Fallback на хардкод при ошибке БД
      res.json(getDefaultProducts());
    }
  } else {
    // Fallback на хардкод если БД не подключена
    res.json(getDefaultProducts());
  }
});

// Функция с дефолтными товарами (fallback)
function getDefaultProducts() {
  return [
    {
      id: 1,
      name: 'Розы красные',
      description: 'Красные розы, 11 штук',
      price: 2500,
      image: 'https://via.placeholder.com/300x300?text=Розы',
      type: 'roses',
      color: 'red',
      features: ['aromatic', 'durable']
    },
    {
      id: 2,
      name: 'Тюльпаны розовые',
      description: 'Яркие тюльпаны, 15 штук',
      price: 1800,
      image: 'https://via.placeholder.com/300x300?text=Тюльпаны',
      type: 'tulips',
      color: 'pink',
      features: ['durable']
    },
    {
      id: 3,
      name: 'Хризантемы розовые',
      description: 'Розовые хризантемы',
      price: 2200,
      image: 'https://via.placeholder.com/300x300?text=Хризантемы',
      type: 'chrysanthemums',
      color: 'pink',
      features: ['durable', 'tall']
    },
    {
      id: 4,
      name: 'Хризантемы белые',
      description: 'Белые хризантемы, 9 штук',
      price: 1500,
      image: 'https://via.placeholder.com/300x300?text=Хризантемы',
      type: 'chrysanthemums',
      color: 'white',
      features: ['durable']
    },
    {
      id: 5,
      name: 'Розы пионовидные',
      description: 'Розы и пионы',
      price: 3500,
      image: 'https://via.placeholder.com/300x300?text=Романтика',
      type: 'roses',
      color: 'pink',
      features: ['aromatic', 'peony']
    },
    {
      id: 6,
      name: 'Ранункулюсы белые',
      description: 'Белые ранункулюсы, 7 штук',
      price: 2800,
      image: 'https://via.placeholder.com/300x300?text=Ранункулюсы',
      type: 'ranunculus',
      color: 'white',
      features: ['aromatic']
    },
    {
      id: 7,
      name: 'Кустовые розы красные',
      description: 'Красные кустовые розы',
      price: 3200,
      image: 'https://via.placeholder.com/300x300?text=Кустовые',
      type: 'bush-roses',
      color: 'red',
      features: ['aromatic', 'durable', 'tall']
    },
    {
      id: 8,
      name: 'Гвоздики розовые',
      description: 'Розовые гвоздики',
      price: 1200,
      image: 'https://via.placeholder.com/300x300?text=Гвоздики',
      type: 'carnations',
      color: 'pink',
      features: ['durable']
    },
    {
      id: 9,
      name: 'Экзотика оранжевая',
      description: 'Экзотические цветы',
      price: 4500,
      image: 'https://via.placeholder.com/300x300?text=Экзотика',
      type: 'exotic',
      color: 'orange',
      features: ['tall']
    },
    {
      id: 10,
      name: 'Зелень',
      description: 'Декоративная зелень',
      price: 800,
      image: 'https://via.placeholder.com/300x300?text=Зелень',
      type: 'greenery',
      color: 'green',
      features: ['durable']
    }
  ];
}

// ==================== РАБОТА С БАЗОЙ ДАННЫХ ====================

// Получить баланс бонусов пользователя из транзакций (единственный источник правды)
async function getUserBonusBalance(userId) {
  if (!pool) {
    console.log('⚠️ getUserBonusBalance: pool не подключен');
    return 0;
  }
  
  if (!userId) {
    console.log('⚠️ getUserBonusBalance: userId не передан');
    return 0;
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем все транзакции для отладки
      const allTransactions = await client.query(
        `SELECT id, type, amount, description, order_id, created_at
         FROM bonus_transactions
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      
      // Суммируем баланс
      const result = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS balance
         FROM bonus_transactions
         WHERE user_id = $1`,
        [userId]
      );
      const balance = parseFloat(result.rows[0]?.balance || 0);
      
      // Логируем все транзакции для отладки
      console.log(`💰 getUserBonusBalance для user_id=${userId}:`);
      console.log(`   Всего транзакций: ${allTransactions.rows.length}`);
      console.log(`   Рассчитанный баланс: ${balance}`);
      if (allTransactions.rows.length > 0) {
        console.log(`   Детали транзакций:`);
        allTransactions.rows.forEach((tx, idx) => {
          console.log(`     ${idx + 1}. ID=${tx.id}, type=${tx.type}, amount=${tx.amount}, desc="${tx.description}", order_id=${tx.order_id || 'NULL'}, date=${tx.created_at}`);
        });
        const sum = allTransactions.rows.reduce((acc, tx) => acc + parseFloat(tx.amount || 0), 0);
        console.log(`   Сумма вручную: ${sum}`);
      }
      
      return balance;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`❌ Ошибка получения баланса бонусов для user_id=${userId}:`, error);
    return 0;
  }
}

// Обновить кэш баланса бонусов в users.bonuses
async function updateUserBonusCache(userId) {
  if (!pool) return;
  
  try {
    const balance = await getUserBonusBalance(userId);
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE users SET bonuses = $1 WHERE id = $2',
        [balance, userId]
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления кэша бонусов:', error);
  }
}

// Получить или создать пользователя в БД
async function getOrCreateUser(telegramId, telegramUser = null, profile = null) {
  if (!pool) return null;
  
  // Приводим telegramId к числу, так как в БД это BIGINT
  const telegramIdNum = typeof telegramId === 'string' ? parseInt(telegramId, 10) : Number(telegramId);
  
  if (isNaN(telegramIdNum)) {
    console.error('Ошибка getOrCreateUser: неверный telegramId:', telegramId);
    return null;
  }
  
  try {
    const client = await pool.connect();
    try {
      // Ищем пользователя (telegram_id имеет тип BIGINT в БД)
      let result = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1::bigint',
        [telegramIdNum]
      );
      
      if (result.rows.length === 0) {
        // Создаем нового пользователя БЕЗ bonuses (он будет рассчитан из транзакций)
        result = await client.query(
          `INSERT INTO users (telegram_id, username, first_name, last_name, phone, email)
           VALUES ($1::bigint, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            telegramIdNum,
            telegramUser?.username || profile?.username || null,
            telegramUser?.first_name || profile?.name || null,
            telegramUser?.last_name || null,
            // Приоритет: номер из профиля > номер из Telegram > null
            profile?.phone || telegramUser?.phone_number || null,
            profile?.email || null
          ]
        );
        
        const newUser = result.rows[0];
      } else {
        // Обновляем данные пользователя, если они изменились или если username отсутствует
        const user = result.rows[0];
        const newUsername = telegramUser?.username || profile?.username || null;
        const newFirstName = telegramUser?.first_name || profile?.name || null;
        const newLastName = telegramUser?.last_name || null;
        // Приоритет: номер из профиля > номер из Telegram > текущий номер
        const newPhone = profile?.phone || telegramUser?.phone_number || null;
        const newEmail = profile?.email || null;
        
        // Обновляем username, если:
        // 1. Передан новый username и он отличается от текущего
        // 2. Или текущий username отсутствует и мы можем его получить
        const shouldUpdateUsername = newUsername && (newUsername !== user.username || !user.username);
        // Обновляем другие поля, если переданы новые данные
        const shouldUpdateOther = (telegramUser || profile) && (
          (newFirstName && newFirstName !== user.first_name) ||
          (newLastName && newLastName !== user.last_name) ||
          (newPhone && newPhone !== user.phone) ||
          (newEmail && newEmail !== user.email)
        );
        
        if (shouldUpdateUsername || shouldUpdateOther) {
          // Формируем динамический запрос для обновления только нужных полей
          const updateFields = [];
          const updateValues = [];
          let paramIndex = 1;
          
          if (shouldUpdateUsername && newUsername) {
            updateFields.push(`username = $${paramIndex}`);
            updateValues.push(newUsername);
            paramIndex++;
          }
          
          if (newFirstName) {
            updateFields.push(`first_name = $${paramIndex}`);
            updateValues.push(newFirstName);
            paramIndex++;
          }
          
          if (newLastName !== null) {
            updateFields.push(`last_name = $${paramIndex}`);
            updateValues.push(newLastName);
            paramIndex++;
          }
          
          if (newPhone) {
            updateFields.push(`phone = $${paramIndex}`);
            updateValues.push(newPhone);
            paramIndex++;
          }
          
          if (newEmail !== null) {
            updateFields.push(`email = $${paramIndex}`);
            updateValues.push(newEmail);
            paramIndex++;
          }
          
          if (updateFields.length > 0) {
            updateFields.push(`updated_at = now()`);
            updateValues.push(telegramIdNum);
            
            result = await client.query(
              `UPDATE users 
               SET ${updateFields.join(', ')}
               WHERE telegram_id = $${paramIndex}::bigint
               RETURNING *`,
              updateValues
            );
          }
        }
      }
      
      return result.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка getOrCreateUser:', error);
    return null;
  }
}

// Унифицированная функция для извлечения house из street
function parseStreetAndHouse(streetValue) {
  if (!streetValue || typeof streetValue !== 'string') {
    return { street: streetValue || '', house: '' };
  }
  
  // Улучшенный regex: ищем номер дома в конце строки после пробела
  // Примеры: "Невский проспект 10" -> {street: "Невский проспект", house: "10"}
  //          "Кемская 7" -> {street: "Кемская", house: "7"}
  //          "Невский проспект 10к2" -> {street: "Невский проспект", house: "10к2"}
  const trimmed = streetValue.trim();
  // Паттерн: пробел + одна или более цифр + опционально буквы/корпус
  const houseMatch = trimmed.match(/\s+(\d+[а-яА-Яa-zA-ZкК\s]*?)$/);
  
  if (houseMatch && houseMatch[1]) {
    const house = houseMatch[1].trim();
    const street = trimmed.replace(/\s+\d+[а-яА-Яa-zA-ZкК\s]*?$/, '').trim();
    return { street, house };
  }
  
  return { street: trimmed, house: '' };
}

// Унифицированная функция для проверки дубликатов адресов
function isAddressDuplicate(newAddr, existingAddr) {
  const normalize = (str) => (str || '').toLowerCase().trim();
  
  const newCity = normalize(newAddr.city);
  const newStreet = normalize(newAddr.street);
  const newHouse = normalize(newAddr.house);
  const newApartment = normalize(newAddr.apartment);
        
  const existingCity = normalize(existingAddr.city);
  const existingStreet = normalize(existingAddr.street);
  const existingHouse = normalize(existingAddr.house);
  const existingApartment = normalize(existingAddr.apartment);
  
  // Проверяем совпадение по city, street, apartment
  // house учитываем только если оба не пустые (если оба пустые - считаем совпадением)
  const cityMatch = newCity === existingCity;
  const streetMatch = newStreet === existingStreet;
  const apartmentMatch = newApartment === existingApartment;
  
  // house: совпадает если оба пустые ИЛИ оба не пустые и равны
  // ВАЖНО: Если street совпадает, но один адрес имеет house, а другой нет - это дубликат
  // (например, "Кемская" и "Кемская 7" - это один адрес, если apartment совпадает)
  const houseMatch = (!newHouse && !existingHouse) || 
                     (newHouse && existingHouse && newHouse === existingHouse);
  
  // Если city, street и apartment совпадают, это дубликат независимо от house
  // (адрес "Кемская, кв 57" и "Кемская 7, кв 57" - это один адрес)
  if (cityMatch && streetMatch && apartmentMatch) {
    // Если house совпадает - точно дубликат
    if (houseMatch) {
      return true;
    }
    // Если один адрес имеет house, а другой нет - тоже дубликат
    // (номер дома был добавлен или удален, но это тот же адрес)
    if ((newHouse && !existingHouse) || (!newHouse && existingHouse)) {
      return true;
    }
  }
  
  return false;
}

// Безопасное добавление одного адреса (не удаляет существующие)
async function addUserAddress(userId, address) {
  if (!pool || !address) return false;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Загружаем существующие адреса
      const existingAddresses = await loadUserAddresses(userId);
      
      // Проверяем дубликаты
      const isDuplicate = existingAddresses.some(existing => isAddressDuplicate(address, existing));
      
      if (isDuplicate) {
        console.log(`ℹ️  Адрес является дубликатом для user_id=${userId}, пропускаем`);
        await client.query('COMMIT');
        return true; // Возвращаем true, так как адрес уже существует
      }
      
      // Парсим street и house если нужно
      let streetValue = address.street || '';
      let houseValue = address.house || '';
        
      // Если house пустое, пытаемся извлечь из street
      if (!houseValue && streetValue) {
        const parsed = parseStreetAndHouse(streetValue);
        streetValue = parsed.street;
        houseValue = parsed.house;
      }
      
      // Вставляем новый адрес
          await client.query(
            `INSERT INTO addresses 
             (user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              userId,
          address.name || streetValue || 'Новый адрес',
          address.city || '',
          streetValue,
          houseValue,
          address.entrance || null,
          address.apartment || null,
          address.floor || null,
          address.intercom || null,
          address.comment || null,
          address.isDefault || false
            ]
          );
      
      console.log(`✅ addUserAddress: добавлен адрес для user_id=${userId}, street=${streetValue}, house=${houseValue}`);
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка addUserAddress:', error);
    return false;
        }
      }
      
// Сохранение адресов пользователя (полная замена списка)
// Всегда работает с user_id (внутренний id из таблицы users)
async function saveUserAddresses(user_id, addresses) {
  if (!pool) return false;

  console.log('[saveUserAddresses] 🚀 user_id =', user_id, 'addresses length =', Array.isArray(addresses) ? addresses.length : 'not array');

  if (!user_id) {
    console.error('[saveUserAddresses] ❌ user_id is null/undefined, не можем сохранить адреса');
    return false;
  }

  // Гарантируем, что у нас массив
  if (!Array.isArray(addresses)) {
    addresses = [];
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Если список пустой — просто удаляем все адреса пользователя
      if (addresses.length === 0) {
        console.log('[saveUserAddresses] 🧹 Пустой список адресов — удаляем все адреса пользователя из БД для user_id =', user_id);
        await client.query('DELETE FROM addresses WHERE user_id = $1', [user_id]);
      await client.query('COMMIT');
        console.log('[saveUserAddresses] ✅ Все адреса для user_id =', user_id, 'удалены');
        return true;
      }

      // 1) Нормализуем и дедупим адреса
      const normalized = [];

      console.log('[saveUserAddresses] 📥 Входящие адреса:', JSON.stringify(addresses, null, 2));

      for (const addr of addresses) {
        if (!addr) {
          console.warn('[saveUserAddresses] ⚠️ Пропущен null/undefined адрес');
          continue;
        }

        console.log('[saveUserAddresses] 🔍 Обработка адреса:', JSON.stringify(addr, null, 2));

        // Парсим street/house, если нужно
        let streetValue = addr.street || '';
        let houseValue = addr.house || '';

        if (!houseValue && streetValue) {
          const parsed = parseStreetAndHouse(streetValue);
          streetValue = parsed.street;
          houseValue = parsed.house;
          console.log('[saveUserAddresses] 📍 Парсинг street/house:', { original: addr.street, street: streetValue, house: houseValue });
        }

        const normalizedAddr = {
          name: addr.name || streetValue || 'Новый адрес',
          city: addr.city || '',
          street: streetValue,
          house: houseValue,
          entrance: addr.entrance || null,
          apartment: addr.apartment || null,
          floor: addr.floor || null,
          intercom: addr.intercom || null,
          comment: addr.comment || null,
          isDefault: addr.isDefault || false,
        };

        console.log('[saveUserAddresses] ✅ Нормализованный адрес:', JSON.stringify(normalizedAddr, null, 2));

        // Пропускаем полностью пустые адреса
        if (!normalizedAddr.city && !normalizedAddr.street && !normalizedAddr.house) {
          console.warn('[saveUserAddresses] ⚠️ Пропущен пустой адрес:', normalizedAddr);
          continue;
        }

        // Дедупликация по логике isAddressDuplicate
        const isDup = normalized.some((existing) => isAddressDuplicate(normalizedAddr, existing));
        if (isDup) {
          console.log('[saveUserAddresses] ⚠️ Пропущен дубликат при сохранении:', normalizedAddr.city, normalizedAddr.street, normalizedAddr.house, normalizedAddr.apartment);
          continue;
        }

        normalized.push(normalizedAddr);
        console.log('[saveUserAddresses] ✅ Адрес добавлен в normalized, всего:', normalized.length);
      }

      console.log('[saveUserAddresses] 📦 После нормализации и дедупликации адресов:', normalized.length);

      // 2) Полностью очищаем адреса пользователя
      await client.query('DELETE FROM addresses WHERE user_id = $1', [user_id]);

      // 3) Вставляем новые адреса
      let insertedCount = 0;

      for (const addr of normalized) {
        console.log('[saveUserAddresses] 💾 Вставка адреса в БД:', JSON.stringify(addr, null, 2));
        try {
          const result = await client.query(
            `INSERT INTO addresses 
              (user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              user_id,
              addr.name,
              addr.city,
              addr.street,
              addr.house,
              addr.entrance,
              addr.apartment,
              addr.floor,
              addr.intercom,
              addr.comment,
              addr.isDefault,
            ]
          );
          insertedCount++;
          console.log('[saveUserAddresses] ✅ Адрес вставлен в БД, ID:', result.rows[0]?.id);
        } catch (insertError) {
          console.error('[saveUserAddresses] ❌ Ошибка вставки адреса:', insertError);
          throw insertError;
        }
      }

      await client.query('COMMIT');
      console.log('[saveUserAddresses] ✅ Сохранено адресов для user_id =', user_id, ':', insertedCount);

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка внутри транзакции saveUserAddresses:', error);
      return false;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка saveUserAddresses:', error);
    return false;
  }
}

// Загрузка адресов пользователя
async function loadUserAddresses(userId) {
  if (!pool) return [];
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        city: row.city,
        street: row.street,
        house: row.house,
        entrance: row.entrance,
        apartment: row.apartment,
        floor: row.floor,
        intercom: row.intercom,
        comment: row.comment,
        isDefault: row.is_default
      }));
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка loadUserAddresses:', error);
    return [];
  }
}

// Сохранение заказа в БД
async function createOrderInDb(orderData) {
  if (!pool) {
    console.log('⚠️  pool не инициализирован, проверь DATABASE_URL');
    return null;
  }
  
  try {
    console.log('📦 Создание заказа в БД:', {
      userId: orderData.userId,
      total: orderData.total,
      itemsCount: orderData.items?.length || 0
    });
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Получаем user_id и данные пользователя по telegram_id
      // Также обновляем username, если он передан в orderData
      let userId = null;
      let userData = null;

      console.log('orderData.userId', orderData.userId);
      console.log('orderData.userId', orderData.userId);
      console.log('orderData.userId', orderData.userId);
      

      if (orderData.userId) {
        // Если передан username, обновляем его в БД
        // Приводим userId к числу для работы с BIGINT
        const userIdNum = typeof orderData.userId === 'string' ? parseInt(orderData.userId, 10) : Number(orderData.userId);
        
        if (orderData.username && !isNaN(userIdNum)) {
          await client.query(
            `UPDATE users 
             SET username = $1, updated_at = now()
             WHERE telegram_id = $2::bigint AND (username IS NULL OR username != $1)`,
            [orderData.username, userIdNum]
          );
        }
        
        // Если передан phone_number, обновляем его в БД
        if (orderData.phone_number && !isNaN(userIdNum)) {
          await client.query(
            `UPDATE users 
             SET phone = $1, updated_at = now()
             WHERE telegram_id = $2::bigint AND (phone IS NULL OR phone != $1)`,
            [orderData.phone_number, userIdNum]
          );
        }
        
        const userResult = await client.query(
          'SELECT id, first_name, last_name, phone, email FROM users WHERE telegram_id = $1::bigint',
          [!isNaN(userIdNum) ? userIdNum : orderData.userId]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
          userData = userResult.rows[0];
          console.log('✅ Найден пользователь в БД, user_id:', userId);
        } else {
          console.log('⚠️  Пользователь не найден в БД, создаем заказ без user_id');
        }
      }
      
      // Определяем address_id, если выбран сохраненный адрес
      let addressId = null;
      if (orderData.addressId && userId) {
        // Проверяем, что адрес принадлежит пользователю
        const addressCheck = await client.query(
          'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
          [orderData.addressId, userId]
        );
        if (addressCheck.rows.length > 0) {
          addressId = orderData.addressId;
        }
      }
      
      // Парсим время доставки для delivery_time_from/to
      let deliveryTimeFrom = null;
      let deliveryTimeTo = null;
      if (orderData.deliveryTime) {
        // Формат: "10:00-12:00" или "10:00 - 12:00" или "14-16" (без минут)
        const timeMatch = orderData.deliveryTime.match(/(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/);
        if (timeMatch) {
          const fromHour = timeMatch[1].padStart(2, '0');
          const fromMin = timeMatch[2] || '00';
          const toHour = timeMatch[3].padStart(2, '0');
          const toMin = timeMatch[4] || '00';
          deliveryTimeFrom = `${fromHour}:${fromMin}`;
          deliveryTimeTo = `${toHour}:${toMin}`;
        }
      }
      
      // Определяем delivery_type из deliveryPrice или orderData
      let deliveryType = null;
      if (orderData.deliveryType) {
        deliveryType = orderData.deliveryType;
      } else if (orderData.deliveryPrice === 0) {
        deliveryType = 'PICKUP';
      } else if (orderData.deliveryPrice === 500) {
        deliveryType = 'INSIDE_KAD';
      } else if (orderData.deliveryPrice === 900) {
        deliveryType = 'OUTSIDE_KAD_10';
      } else if (orderData.deliveryPrice === 1300) {
        deliveryType = 'OUTSIDE_KAD_20';
      }
      
      // Данные клиента на момент заказа (из профиля или из формы)
      const clientName = orderData.name || (userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : null);
      const clientPhone = orderData.phone || userData?.phone || null;
      const clientEmail = orderData.email || userData?.email || null;
      
      // Комментарий пользователя (особые пожелания к заказу)
      // Комментарий пользователя - проверяем все возможные варианты имен полей
      const userComment = orderData.userComment || orderData.comment || orderData.orderComment || null;
      
      // Комментарий для курьера (из поля адреса)
      const courierComment = orderData.courierComment || null;
      
      // Определяем delivery_zone из deliveryPrice
      let deliveryZone = null;
      if (orderData.deliveryPrice === 0) {
        deliveryZone = 'Самовывоз';
      } else if (orderData.deliveryPrice === 500) {
        deliveryZone = 'В пределах КАД';
      } else if (orderData.deliveryPrice === 900) {
        deliveryZone = 'До 10 км от КАД';
      } else if (orderData.deliveryPrice === 1300) {
        deliveryZone = 'До 20 км от КАД';
      }
      
      // Получаем процент сервисного сбора из orderData или используем 10% по умолчанию
      const serviceFeePercent = orderData.serviceFeePercent || 10.00;
      
      // Пересчитываем serviceFee, если передан процент или если нужно использовать процент по умолчанию
      let calculatedServiceFee = orderData.serviceFee;
      if (!calculatedServiceFee && orderData.flowersTotal) {
        calculatedServiceFee = Math.round(orderData.flowersTotal * (serviceFeePercent / 100));
      }
      if (!calculatedServiceFee) {
        calculatedServiceFee = 450; // Fallback
      }
      
      // Итоговая сумма заказа
      const finalTotal = orderData.flowersTotal + calculatedServiceFee + (orderData.deliveryPrice || 0);
      
      // Получаем значение leave_at_door из orderData (явное приведение к boolean)
      const leaveAtDoor = !!(orderData.leaveAtDoor || false);
      
      // Генерируем номер заказа: telegram_id + номер заказа пользователя (с ведущими нулями до 3 цифр)
      let orderNumber = null;
      let userOrderNumber = null;
      
      // Используем telegram_id из orderData.userId (это telegram_id пользователя)
      const telegramId = orderData.userId ? (typeof orderData.userId === 'string' ? parseInt(orderData.userId, 10) : Number(orderData.userId)) : null;
      
      if (!isNaN(telegramId)) {
        // Если есть userId, считаем заказы по user_id
        if (userId) {
          const userOrdersCountResult = await client.query(
            'SELECT COUNT(*) as count FROM orders WHERE user_id = $1',
            [userId]
          );
          userOrderNumber = parseInt(userOrdersCountResult.rows[0].count, 10) + 1; // +1 потому что это будет новый заказ
        } else {
          // Если userId нет, но есть telegramId, считаем заказы по telegram_id через JOIN
          const telegramOrdersCountResult = await client.query(
            `SELECT COUNT(*) as count 
             FROM orders o 
             JOIN users u ON o.user_id = u.id 
             WHERE u.telegram_id = $1::bigint`,
            [telegramId]
          );
          userOrderNumber = parseInt(telegramOrdersCountResult.rows[0].count, 10) + 1;
        }
        
        // Формируем номер заказа: telegramId + номер заказа пользователя (с ведущими нулями до 3 цифр)
        // Например: telegramId=1059138125, userOrderNumber=1 → orderNumber=1059138125001
        const telegramIdStr = String(telegramId);
        const orderNumberStr = String(userOrderNumber).padStart(3, '0');
        orderNumber = parseInt(telegramIdStr + orderNumberStr, 10);
        
        console.log(`📝 Сгенерирован номер заказа: ${orderNumber} (telegramId: ${telegramIdStr}, номер заказа пользователя: ${userOrderNumber}, user_id в БД: ${userId || 'не найден'})`);
        
        // Сохраняем номер заказа пользователя для возврата в ответе
        orderData.userOrderNumber = userOrderNumber;
      } else {
        console.warn(`⚠️  Не удалось сгенерировать order_number: userId=${userId}, telegramId=${telegramId}`);
      }
      
      // Создаем заказ (без service_fee_percent - эта колонка не критична, процент можно вычислить из service_fee и flowers_total)
      // Проверяем наличие колонки order_number перед вставкой
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'order_number'
      `);
      const hasOrderNumberColumn = columnCheck.rows.length > 0;
      
      let orderResult;
      if (hasOrderNumberColumn) {
        orderResult = await client.query(
          `INSERT INTO orders 
           (user_id, total, flowers_total, service_fee, delivery_price, bonus_used, bonus_earned,
            client_name, client_phone, client_email,
            recipient_name, recipient_phone, 
            address_id, address_string, address_json, 
            delivery_zone, delivery_date, delivery_time,
            user_comment, courier_comment, leave_at_door, status, order_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'NEW', $22)
           RETURNING *`,
        [
          userId,
          finalTotal,
          orderData.flowersTotal,
          calculatedServiceFee,
          orderData.deliveryPrice || 0,
          0, // bonus_used
          0, // bonus_earned
          clientName,
          clientPhone,
          clientEmail,
          orderData.recipientName || null,
          orderData.recipientPhone || null,
          addressId,
          orderData.address,
          JSON.stringify(orderData.addressData || {}),
          deliveryZone,
          orderData.deliveryDate || null,
          orderData.deliveryTime || null,
          userComment,
          courierComment,
          leaveAtDoor,
          orderNumber
        ]
        );
      } else {
        // Если колонки нет, создаем заказ без order_number
        console.log('⚠️  Колонка order_number не найдена, создаем заказ без номера');
        orderResult = await client.query(
          `INSERT INTO orders 
           (user_id, total, flowers_total, service_fee, delivery_price, bonus_used, bonus_earned,
            client_name, client_phone, client_email,
            recipient_name, recipient_phone, 
            address_id, address_string, address_json, 
            delivery_zone, delivery_date, delivery_time,
            user_comment, courier_comment, leave_at_door, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'NEW')
           RETURNING *`,
          [
            userId,
            finalTotal,
            orderData.flowersTotal,
            calculatedServiceFee,
            orderData.deliveryPrice || 0,
            0, // bonus_used
            0, // bonus_earned
            clientName,
            clientPhone,
            clientEmail,
            orderData.recipientName || null,
            orderData.recipientPhone || null,
            addressId,
            orderData.address,
            JSON.stringify(orderData.addressData || {}),
            deliveryZone,
            orderData.deliveryDate || null,
            orderData.deliveryTime || null,
            userComment,
            courierComment,
            leaveAtDoor
          ]
        );
        
        // После создания заказа обновляем его с order_number, если колонка существует
        // Используем SAVEPOINT для изоляции операции, чтобы ошибка не прервала всю транзакцию
        if (orderNumber) {
          try {
            // Создаем точку сохранения для изоляции операции обновления
            await client.query('SAVEPOINT update_order_number');
            
            // Проверяем наличие колонки перед обновлением
            const columnCheckUpdate = await client.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'orders' AND column_name = 'order_number'
            `);
            
            if (columnCheckUpdate.rows.length > 0) {
              await client.query(
                'UPDATE orders SET order_number = $1 WHERE id = $2',
                [orderNumber, orderResult.rows[0].id]
              );
              orderResult.rows[0].order_number = orderNumber;
              console.log('✅ Номер заказа обновлен после создания:', orderNumber);
            } else {
              console.log('⚠️  Колонка order_number не существует, пропускаем обновление');
            }
            
            // Освобождаем точку сохранения при успехе
            await client.query('RELEASE SAVEPOINT update_order_number');
          } catch (updateError) {
            // Откатываемся к точке сохранения, чтобы не прервать всю транзакцию
            try {
              await client.query('ROLLBACK TO SAVEPOINT update_order_number');
              console.log('⚠️  Не удалось обновить order_number, откат к точке сохранения:', updateError.message);
            } catch (rollbackError) {
              // Если не удалось откатиться к точке сохранения, значит транзакция уже прервана
              console.log('⚠️  Не удалось откатиться к точке сохранения, транзакция прервана:', rollbackError.message);
              // Не выбрасываем ошибку дальше, чтобы не прервать создание заказа
            }
          }
        }
      }
      
      const order = orderResult.rows[0];
      console.log('✅ Заказ создан в БД, order_id:', order.id, 'order_number:', order.order_number || orderNumber || 'NULL', 'user_id в заказе:', order.user_id || 'NULL');
      
      // Сохраняем телефон и почту из формы заказа в профиль пользователя, если они были заполнены
      if (userId && (orderData.phone || orderData.email)) {
        try {
          const updateFields = [];
          const updateValues = [];
          let paramIndex = 1;
          
          if (orderData.phone) {
            updateFields.push(`phone = $${paramIndex}`);
            updateValues.push(orderData.phone);
            paramIndex++;
          }
          
          if (orderData.email) {
            updateFields.push(`email = $${paramIndex}`);
            updateValues.push(orderData.email);
            paramIndex++;
          }
          
          if (updateFields.length > 0) {
            updateValues.push(userId);
            await client.query(
              `UPDATE users 
               SET ${updateFields.join(', ')}, updated_at = now()
               WHERE id = $${paramIndex}`,
              updateValues
            );
            console.log('✅ Обновлен профиль пользователя: телефон и/или почта сохранены из формы заказа');
          }
        } catch (profileError) {
          // Не критично, если не удалось обновить профиль
          console.log('⚠️  Не удалось обновить профиль пользователя:', profileError.message);
        }
      }
      
      // Проверяем остатки перед добавлением позиций
      for (const item of orderData.items || []) {
        const productId = item.id;
        const requestedQty = item.quantity || 0;
        
        // Рассчитываем доступный остаток: используем ту же логику, что и в GET /api/admin/warehouse
        // Считаем по каждой поставке отдельно, затем суммируем
        const suppliesResult = await client.query(
          `SELECT 
            s.id,
            COALESCE(
              (SELECT SUM(quantity) FROM stock_movements WHERE supply_id = s.id AND type = 'SUPPLY'),
              s.quantity
            ) as initial_quantity,
            COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as sold,
            COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as written_off
          FROM supplies s
          LEFT JOIN stock_movements sm ON s.id = sm.supply_id
          WHERE s.product_id = $1
          GROUP BY s.id, s.quantity`,
          [productId]
        );
        
        // Суммируем остатки по всем поставкам
        let totalAvailable = 0;
        for (const supply of suppliesResult.rows) {
          const initialQty = parseInt(supply.initial_quantity || 0);
          const sold = parseInt(supply.sold || 0);
          const writtenOff = parseInt(supply.written_off || 0);
          const remaining = Math.max(0, initialQty - sold - writtenOff);
          totalAvailable += remaining;
        }
        
        const available = totalAvailable;
        
        if (requestedQty > available) {
          await client.query('ROLLBACK');
          const productName = item.name || `товар #${productId}`;
          throw new Error(`Недостаточно товара на складе: ${productName}. Запрошено: ${requestedQty}, доступно: ${available}`);
        }
      }
      
      // Добавляем позиции заказа и создаем движения с FIFO логикой
      for (const item of orderData.items || []) {
        const productId = item.id;
        const quantity = item.quantity || 0;
        
        // Добавляем позицию заказа с total_price
        const totalPrice = item.price * quantity;
        await client.query(
          `INSERT INTO order_items (order_id, product_id, name, price, quantity, total_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, productId, item.name, item.price, quantity, totalPrice]
        );
        
        // FIFO логика: получаем все поставки с остатками, отсортированные по дате (старые первые)
        // Используем SUPPLY движения для получения начального количества, если они есть
        const suppliesResult = await client.query(`
          SELECT 
            s.id as supply_id,
            COALESCE(
              (SELECT SUM(quantity) FROM stock_movements WHERE supply_id = s.id AND type = 'SUPPLY'),
              s.quantity
            ) as initial_quantity,
            s.delivery_date,
            COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as sold,
            COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as written_off
          FROM supplies s
          LEFT JOIN stock_movements sm ON s.id = sm.supply_id
          WHERE s.product_id = $1
          GROUP BY s.id, s.quantity, s.delivery_date
          HAVING (
            COALESCE(
              (SELECT SUM(quantity) FROM stock_movements WHERE supply_id = s.id AND type = 'SUPPLY'),
              s.quantity
            ) - 
            COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
            COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0)
          ) > 0
          ORDER BY s.delivery_date ASC, s.id ASC
        `, [productId]);
        
        let remainingToSell = quantity;
        
        // Списываем с самых ранних поставок
        for (const supply of suppliesResult.rows) {
          if (remainingToSell <= 0) break;
          
          const available = supply.initial_quantity - supply.sold - supply.written_off;
          const toSell = Math.min(remainingToSell, available);
          
          if (toSell > 0) {
            // Создаем движение типа SALE с привязкой к поставке
            await client.query(
              `INSERT INTO stock_movements (product_id, type, quantity, order_id, supply_id, comment)
               VALUES ($1, 'SALE', $2, $3, $4, $5)`,
              [productId, toSell, order.id, supply.supply_id, `Продажа по заказу #${order.id} (партия #${supply.supply_id})`]
            );
            
            remainingToSell -= toSell;
          }
        }
        
        // Если не хватило товара на складе, это должно было быть проверено ранее, но на всякий случай
        if (remainingToSell > 0) {
          console.warn(`⚠️ Недостаточно товара для полного списания: product_id=${productId}, осталось списать=${remainingToSell}`);
        }
      }
      console.log('✅ Позиции заказа добавлены и движения созданы, количество:', orderData.items?.length || 0);
      
      // Создаем запись в order_status_history
      try {
        await client.query(
          `INSERT INTO order_status_history (order_id, status, source, comment)
           VALUES ($1, $2, $3, $4)`,
          [order.id, 'NEW', 'system', 'Заказ создан через мини-апп']
        );
        console.log(`✅ Создана запись в истории статусов для заказа #${order.id}`);
      } catch (historyError) {
        // Игнорируем ошибки истории (таблица может не существовать)
        console.log('⚠️  Не удалось создать запись в истории статусов:', historyError.message);
      }
      
      await client.query('COMMIT');
      console.log('✅ Транзакция завершена успешно');
      
      // Извлекаем номер заказа пользователя из order_number (последние 3 цифры), если он еще не был установлен
      // userOrderNumber уже объявлена выше (строка 2058), поэтому просто проверяем и обновляем при необходимости
      if (!userOrderNumber && (order.order_number || orderNumber)) {
        const fullOrderNumber = String(order.order_number || orderNumber);
        // Берем последние 3 цифры как номер заказа пользователя
        userOrderNumber = fullOrderNumber.slice(-3);
        console.log(`📝 Извлечен userOrderNumber из order_number: ${userOrderNumber}`);
      }
      
      return {
        orderId: order.id,
        order_number: order.order_number || orderNumber || null,
        userOrderNumber: userOrderNumber || orderData.userOrderNumber || null,
        telegramOrderId: Date.now() // Для совместимости с фронтендом
      };
    } catch (error) {
      // Проверяем, не прервана ли уже транзакция
      if (error.code === '25P02') {
        // Транзакция уже прервана, пытаемся сделать ROLLBACK
        try {
          await client.query('ROLLBACK');
          console.error('❌ Транзакция была прервана, выполнен откат');
        } catch (rollbackError) {
          // Если ROLLBACK тоже не работает, просто логируем
          console.error('❌ Не удалось выполнить ROLLBACK после прерванной транзакции:', rollbackError.message);
        }
      } else {
        // Обычная ошибка, делаем ROLLBACK
        try {
          await client.query('ROLLBACK');
          console.error('❌ Ошибка в транзакции, откат:', error);
        } catch (rollbackError) {
          console.error('❌ Не удалось выполнить ROLLBACK:', rollbackError.message);
        }
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Ошибка createOrderInDb:', error.message);
    console.error('Детали ошибки:', error);
    return null;
  }
}

// Нормализация статуса: преобразует старые форматы в единый enum
function normalizeOrderStatus(status) {
  if (!status) return null;
  
  const statusUpper = status.toUpperCase();
  
  // Маппинг старых статусов на новые
  const statusMap = {
    'NEW': 'NEW',
    'PROCESSING': 'PROCESSING',
    'PURCHASE': 'PURCHASE', // Внутренний статус для админки
    'COLLECTING': 'COLLECTING',
    'DELIVERING': 'DELIVERING',
    'COMPLETED': 'COMPLETED',
    'CANCELED': 'CANCELED',
    'CANCELLED': 'CANCELED', // Британский вариант
    'UNPAID': 'UNPAID',
    // Старые форматы
    'ACTIVE': 'NEW',
    'PAID': 'NEW',
    'CONFIRMED': 'PROCESSING',
    'PREPARING': 'PROCESSING',
    'ASSEMBLY': 'COLLECTING',
    'IN_TRANSIT': 'IN_TRANSIT', // Статус "В пути" для доставки
    'DELIVERED': 'COMPLETED',
    'CANCELLED': 'CANCELED'
  };
  
  return statusMap[statusUpper] || statusUpper;
}

// Функция для получения статуса для пользователя (мини-апп)
// Маппит внутренние статусы админки в статусы, видимые пользователю
function getStatusForUser(status) {
  if (!status) return null;
  
  const normalized = normalizeOrderStatus(status);
  
  // Маппинг: PURCHASE (внутренний статус) → COLLECTING (для пользователя)
  if (normalized === 'PURCHASE') {
    return 'COLLECTING';
  }
  
  // Все остальные статусы возвращаем как есть
  return normalized;
}

// Функция для получения текстового описания статуса для пользователя
function getStatusText(status) {
  const statusMap = {
    'UNPAID': 'Не оплачен',
    'NEW': 'Новый',
    'PROCESSING': 'В обработке',
    'PURCHASE': 'Закупка',
    'COLLECTING': 'Собирается',
    'DELIVERING': 'В пути',
    'IN_TRANSIT': 'В пути',
    'COMPLETED': 'Доставлен',
    'CANCELED': 'Отменён',
    'CANCELLED': 'Отменён'
  };
  
  const normalized = normalizeOrderStatus(status);
  return statusMap[normalized] || status;
}

// Единая функция форматирования номера заказа для отображения
function formatOrderNumberForDisplay({ orderId, userId, userOrderNumber, orderNumber }) {
  // userOrderNumber может быть "16" или 16 — приводим к 3 цифрам
  if (userId && userOrderNumber != null) {
    const n = String(userOrderNumber).padStart(3, '0');
    return `#${userId}${n}`;
  }

  // если есть order_number, берем последние 3 цифры
  if (userId && orderNumber != null) {
    const n = String(orderNumber).slice(-3).padStart(3, '0');
    return `#${userId}${n}`;
  }

  // fallback
  return `#${orderId}`;
}

// Функция для отправки уведомления о смене статуса заказа через Telegram бота
async function sendOrderStatusNotification(orderId, newStatus, oldStatus = null, comment = null) {
  if (!pool || !bot) {
    return;
  }
  
  // Если статус не изменился, не отправляем уведомление
  if (oldStatus && normalizeOrderStatus(oldStatus) === normalizeOrderStatus(newStatus)) {
    return;
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем информацию о заказе и пользователе (включая order_number)
      const orderResult = await client.query(
        'SELECT user_id, total, order_number FROM orders WHERE id = $1',
        [orderId]
      );
      
      if (orderResult.rows.length === 0 || !orderResult.rows[0].user_id) {
        // Заказ не найден или у заказа нет user_id (гостевой заказ)
        return;
      }
      
      const userId = orderResult.rows[0].user_id;
      const orderTotal = orderResult.rows[0].total;
      const orderNumber = orderResult.rows[0].order_number || null;
      
      // Получаем telegram_id пользователя
      const userResult = await client.query(
        'SELECT telegram_id, first_name FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0 || !userResult.rows[0].telegram_id) {
        // Пользователь не найден или у него нет telegram_id
        return;
      }
      
      const telegramId = userResult.rows[0].telegram_id;
      const userName = userResult.rows[0].first_name || 'Клиент';
      
      // Формируем номер заказа для отображения
      const orderNumberDisplay = formatOrderNumberForDisplay({
        orderId,
        userId: userId || telegramId,
        userOrderNumber: null,
        orderNumber: orderNumber
      });
      
      // Формируем сообщение
      const statusText = getStatusText(newStatus);
      let message = `📦 Заказ ${orderNumberDisplay}\n\n`;
      message += `Статус заказа изменён: ${statusText}\n`;
      message += `Сумма заказа: ${parseFloat(orderTotal).toLocaleString('ru-RU')} ₽`;
      
      if (comment) {
        message += `\n\n💬 Комментарий: ${comment}`;
      }
      
      // Отправляем сообщение через очередь
      await sendMessageSafe(telegramId, message, {}, 5); // Приоритет 5 - средний
      
      console.log(`✅ Уведомление о смене статуса добавлено в очередь для пользователя ${telegramId} (заказ ${orderNumberDisplay})`);
    } finally {
      client.release();
    }
  } catch (error) {
    // Не прерываем выполнение, если не удалось отправить уведомление
    console.error(`⚠️  Ошибка отправки уведомления о смене статуса заказа #${orderId}:`, error.message);
  }
}

// Функция для отправки подтверждения заказа с информацией и кнопкой оплаты
// Функция для отправки уведомления о новом заказе в группу с темой
async function sendOrderNotificationToGroup(orderId, orderData) {
  console.log(`🔍 sendOrderNotificationToGroup вызвана для заказа #${orderId}`);
  console.log(`🔍 Проверка условий: bot=${!!bot}, ORDERS_GROUP_ID=${ORDERS_GROUP_ID}, ORDERS_TOPIC_ID=${ORDERS_TOPIC_ID}`);
  
  if (!bot || !ORDERS_GROUP_ID || !ORDERS_TOPIC_ID) {
    if (!bot) {
      console.log('⚠️ Бот не инициализирован, пропускаем отправку в группу');
    }
    if (!ORDERS_GROUP_ID) {
      console.log('⚠️ ORDERS_GROUP_ID не установлен, пропускаем отправку в группу');
    }
    if (!ORDERS_TOPIC_ID) {
      console.log('⚠️ ORDERS_TOPIC_ID не установлен, пропускаем отправку в группу');
    }
    return;
  }
  
  try {
    console.log(`📤 Отправка уведомления о заказе #${orderId} в группу ${ORDERS_GROUP_ID}, тема ${ORDERS_TOPIC_ID}`);
    
    // Формируем номер заказа для отображения
    const orderNumberDisplay = formatOrderNumberForDisplay({
      orderId,
      userId: orderData.userId,
      userOrderNumber: orderData.userOrderNumber,
      orderNumber: orderData.order_number
    });
    
    // Формируем информацию о заказе
    let message = `🆕 <b>Новый заказ ${orderNumberDisplay}</b>\n\n`;
    
    // Информация о клиенте
    if (orderData.clientName) {
      message += `👤 <b>Клиент:</b> ${orderData.clientName}\n`;
    }
    if (orderData.clientPhone) {
      message += `📞 <b>Телефон:</b> ${orderData.clientPhone}\n`;
    }
    if (orderData.recipientName && orderData.recipientName !== orderData.clientName) {
      message += `👥 <b>Получатель:</b> ${orderData.recipientName}\n`;
    }
    if (orderData.recipientPhone && orderData.recipientPhone !== orderData.clientPhone) {
      message += `📱 <b>Телефон получателя:</b> ${orderData.recipientPhone}\n`;
    }
    message += `\n`;
    
    // Состав заказа
    if (orderData.items && orderData.items.length > 0) {
      message += `🛍️ <b>Состав заказа:</b>\n`;
      orderData.items.forEach((item, index) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        message += `${index + 1}. ${item.name} × ${item.quantity} = ${itemTotal.toLocaleString('ru-RU')} ₽\n`;
      });
      message += `\n`;
    }
    
    // Суммы
    message += `💰 <b>Итого:</b>\n`;
    if (orderData.flowersTotal) {
      message += `Товары: ${parseFloat(orderData.flowersTotal).toLocaleString('ru-RU')} ₽\n`;
    }
    if (orderData.serviceFee) {
      message += `Сервисный сбор: ${parseFloat(orderData.serviceFee).toLocaleString('ru-RU')} ₽\n`;
    }
    if (orderData.deliveryPrice) {
      message += `Доставка: ${parseFloat(orderData.deliveryPrice).toLocaleString('ru-RU')} ₽\n`;
    }
    message += `\n<b>К оплате: ${parseFloat(orderData.total).toLocaleString('ru-RU')} ₽</b>\n\n`;
    
    // Адрес доставки
    if (orderData.address) {
      message += `📍 <b>Адрес доставки:</b>\n${orderData.address}\n\n`;
    }
    
    // Дата и время доставки
    if (orderData.deliveryDate) {
      const deliveryDate = new Date(orderData.deliveryDate).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      message += `📅 <b>Дата доставки:</b> ${deliveryDate}\n`;
    }
    if (orderData.deliveryTime) {
      message += `🕐 <b>Время доставки:</b> ${orderData.deliveryTime}\n\n`;
    }
    
    // Комментарий
    if (orderData.comment || orderData.userComment) {
      message += `💬 <b>Комментарий:</b> ${orderData.comment || orderData.userComment}\n\n`;
    }
    
    // Комментарий для курьера
    if (orderData.courierComment) {
      message += `🚚 <b>Комментарий для курьера:</b> ${orderData.courierComment}\n\n`;
    }
    
    // Оставить у двери
    if (orderData.leaveAtDoor) {
      message += `🚪 <b>Оставить у двери</b>\n\n`;
    }
    
    message += `Статус: <b>Новый</b>\n\n`;
    
    // Добавляем ссылку на заказ в админке
    const adminUrl = process.env.WEBAPP_URL || process.env.APP_URL || `http://localhost:${PORT}`;
    const orderUrl = `${adminUrl}/admin/orders/${orderId}`;
    message += `🔗 <a href="${orderUrl}">Открыть заказ в админке</a>`;
    
    console.log(`📝 Сформировано сообщение для отправки (длина: ${message.length} символов)`);
    console.log(`📝 Первые 200 символов: ${message.substring(0, 200)}...`);
    console.log(`🔗 Ссылка на заказ в админке: ${orderUrl}`);
    
    // Отправляем сообщение в группу через очередь
    console.log(`📤 Добавляем сообщение в очередь с параметрами:`);
    console.log(`   - chat_id: ${ORDERS_GROUP_ID}`);
    console.log(`   - message_thread_id: ${ORDERS_TOPIC_ID}`);
    console.log(`   - parse_mode: HTML`);
    
    await sendMessageSafe(ORDERS_GROUP_ID, message, {
      parse_mode: 'HTML',
      message_thread_id: ORDERS_TOPIC_ID,
      disable_web_page_preview: false // Разрешаем превью ссылки
    }, 3); // Приоритет 3 - для группы средний
    
    console.log(`✅ Уведомление о заказе #${orderId} добавлено в очередь для группы`);
  } catch (error) {
    console.error(`❌ Ошибка отправки уведомления о заказе #${orderId} в группу:`);
    console.error(`   Сообщение об ошибке: ${error.message}`);
    console.error(`   Код ошибки: ${error.response?.error_code || 'N/A'}`);
    console.error(`   Описание ошибки: ${error.response?.description || 'N/A'}`);
    console.error(`   Параметры запроса:`, JSON.stringify(error.response?.parameters || {}, null, 2));
    console.error('Stack trace:', error.stack);
    
    // Дополнительная информация об ошибке
    if (error.response) {
      console.error('Полный ответ от Telegram API:', JSON.stringify(error.response, null, 2));
    }
  }
}

async function sendOrderConfirmation(orderId, telegramId, orderData) {
  if (!bot || !telegramId) {
    console.warn(`⚠️ sendOrderConfirmation: bot=${!!bot}, telegramId=${telegramId}`);
    return;
  }
  
  // Приводим telegramId к числу, если это строка
  const telegramIdNum = typeof telegramId === 'string' ? parseInt(telegramId, 10) : Number(telegramId);
  
  if (isNaN(telegramIdNum)) {
    console.error(`⚠️ sendOrderConfirmation: неверный telegramId=${telegramId}`);
    return;
  }
  
  console.log(`📤 Отправка подтверждения заказа #${orderId} пользователю ${telegramIdNum}`);
  
  try {
    // Формируем номер заказа для отображения
    const orderNumberDisplay = formatOrderNumberForDisplay({
      orderId,
      userId: telegramId, // у нас telegramId = userId
      userOrderNumber: orderData.userOrderNumber,
      orderNumber: orderData.order_number
    });
    
    // Формируем информацию о заказе
    let message = `📦 <b>Ваш заказ ${orderNumberDisplay}</b>\n\n`;
    
    // Состав заказа
    if (orderData.items && orderData.items.length > 0) {
      message += `🛍️ <b>Состав заказа:</b>\n`;
      orderData.items.forEach((item, index) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        message += `${index + 1}. ${item.name} × ${item.quantity} = ${itemTotal.toLocaleString('ru-RU')} ₽\n`;
      });
      message += `\n`;
    }
    
    // Суммы
    message += `💰 <b>Итого:</b>\n`;
    if (orderData.flowersTotal) {
      message += `Товары: ${parseFloat(orderData.flowersTotal).toLocaleString('ru-RU')} ₽\n`;
    }
    if (orderData.serviceFee) {
      message += `Сервисный сбор: ${parseFloat(orderData.serviceFee).toLocaleString('ru-RU')} ₽\n`;
    }
    if (orderData.deliveryPrice) {
      message += `Доставка: ${parseFloat(orderData.deliveryPrice).toLocaleString('ru-RU')} ₽\n`;
    }
    message += `\n<b>К оплате: ${parseFloat(orderData.total).toLocaleString('ru-RU')} ₽</b>\n\n`;
    
    // Адрес доставки
    if (orderData.address) {
      message += `📍 <b>Адрес доставки:</b>\n${orderData.address}\n\n`;
    }
    
    // Дата и время доставки
    if (orderData.deliveryDate) {
      const deliveryDate = new Date(orderData.deliveryDate).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      message += `📅 <b>Дата доставки:</b> ${deliveryDate}\n`;
    }
    if (orderData.deliveryTime) {
      message += `🕐 <b>Время доставки:</b> ${orderData.deliveryTime}\n\n`;
    }
    
    // Комментарий
    if (orderData.comment || orderData.userComment) {
      message += `💬 <b>Комментарий:</b> ${orderData.comment || orderData.userComment}\n\n`;
    }
    
    message += `Статус: <b>Новый</b>\n\n`;
    message += `Для оплаты заказа нажмите кнопку ниже 👇`;
    
    // Создаем inline-кнопку для оплаты
    // Используем WEBAPP_URL или APP_URL для формирования правильного URL
    const appUrl = process.env.WEBAPP_URL || process.env.APP_URL || process.env.PAYMENT_URL || 'https://your-app.onrender.com';
    const paymentUrl = `${appUrl}/payment/${orderId}`;
    
    console.log(`🔗 URL для оплаты заказа #${orderId}: ${paymentUrl}`);
    
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '💳 Оплатить заказ',
            url: paymentUrl
          }
        ]
      ]
    };
    
    // Отправляем сообщение через очередь с высоким приоритетом
    await sendMessageSafe(telegramIdNum, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    }, 10); // Приоритет 10 - высокий, подтверждения заказов важны
    
    console.log(`✅ Подтверждение заказа добавлено в очередь для пользователя ${telegramIdNum} (заказ #${orderId})`);
  } catch (error) {
    // Не прерываем выполнение, если не удалось отправить сообщение
    console.error(`⚠️  Ошибка отправки подтверждения заказа #${orderId}:`, error.message);
  }
}

// Загрузка заказов пользователя
async function loadUserOrders(userId, status = null) {
  if (!pool) return [];
  
  try {
    const client = await pool.connect();
    try {
      let query = `
        SELECT o.*, 
               json_agg(json_build_object(
                 'id', oi.product_id,
                 'name', oi.name,
                 'price', oi.price,
                 'quantity', oi.quantity
               )) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
      `;
      
      const params = [userId];
      if (status) {
        // Поддерживаем как массив статусов, так и один статус
        if (Array.isArray(status)) {
          query += ' AND o.status = ANY($2::text[])';
          params.push(status);
        } else {
          query += ' AND o.status = $2';
          params.push(status);
        }
      }
      
      query += ' GROUP BY o.id ORDER BY o.created_at DESC';
      
      const result = await client.query(query, params);
      
      console.log(`📦 loadUserOrders: найдено ${result.rows.length} заказов для user_id=${userId}, статусы=${JSON.stringify(status)}`);
      if (result.rows.length > 0) {
        console.log(`📦 loadUserOrders: ID заказов: ${result.rows.map(r => r.id).join(', ')}`);
      }
      
      return result.rows.map(row => {
        // Извлекаем userOrderNumber из order_number (последние 3 цифры)
        let userOrderNumber = null;
        if (row.order_number) {
          const fullOrderNumber = String(row.order_number);
          userOrderNumber = parseInt(fullOrderNumber.slice(-3), 10);
        }
        
        return {
          id: row.id,
          user_id: row.user_id, // Добавляем user_id для форматирования номера
          order_number: row.order_number || null, // Добавляем order_number
          userOrderNumber: userOrderNumber, // Добавляем userOrderNumber
          date: new Date(row.created_at).toLocaleDateString('ru-RU'),
          items: row.items.filter(item => item.id !== null),
          total: row.total,
          address: row.address_string,
          deliveryDate: row.delivery_date ? new Date(row.delivery_date).toISOString().split('T')[0] : null,
          deliveryTime: row.delivery_time,
          status: getStatusForUser(row.status), // Маппим статус для пользователя (PURCHASE → COLLECTING)
          createdAt: row.created_at
        };
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка loadUserOrders:', error);
    return [];
  }
}

// ==================== FALLBACK: ФАЙЛОВОЕ ХРАНИЛИЩЕ ====================

// Путь к файлу для постоянного хранения данных (fallback)
const DATA_FILE = path.join(__dirname, 'user-data.json');

// Функция загрузки данных из файла
function loadUserDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Ошибка загрузки данных из файла:', error);
  }
  return {};
}

// Функция сохранения данных в файл
function saveUserDataToFile(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка сохранения данных в файл:', error);
  }
}

// Загружаем данные при старте сервера (только для fallback)
const userDataStore = pool ? {} : loadUserDataFromFile();
if (!pool) {
  console.log(`📦 Загружены данные для ${Object.keys(userDataStore).length} пользователей (файловое хранилище)`);
}

// API endpoint для сохранения данных пользователя
app.post('/api/user-data', async (req, res) => {
  const { userId, cart, addresses, profile, activeOrders, completedOrders, bonuses } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  try {
    if (pool) {
      // Работа с БД
      const user = await getOrCreateUser(userId, null, profile);
      if (!user) {
        return res.status(500).json({ error: 'Не удалось создать/найти пользователя' });
      }
      
      // Сохраняем адреса (включая пустой массив - разрешаем удаление всех адресов)
      if (addresses !== undefined && Array.isArray(addresses)) {
        console.log('[POST /api/user-data] 📥 Пришло адресов из фронта:', addresses.length);
          const saved = await saveUserAddresses(user.id, addresses);
        if (!saved) {
          console.error('[POST /api/user-data] ❌ Ошибка сохранения адресов для user_id =', user.id);
        }
          } else {
        console.log('[POST /api/user-data] ℹ️ addresses не массив или undefined:', addresses);
      }
      
      // После всех сохранений — ПЕРЕЧИТЫВАЕМ адреса из БД
      const updatedAddresses = await loadUserAddresses(user.id);
      console.log('[POST /api/user-data] 📦 Адресов после сохранения в БД:', updatedAddresses.length);
      
      // Логируем только при значительных изменениях (новые адреса, заказы)
      const hasSignificantChanges = 
        (addresses !== undefined && addresses.length > 0) ||
        (activeOrders !== undefined && activeOrders.length > 0);
      
      if (hasSignificantChanges) {
        console.log(`💾 Сохранены данные для пользователя ${userId} (БД): адресов=${addresses?.length || 0}, заказов=${activeOrders?.length || 0}`);
      }
      
      // Возвращаем обновлённые адреса из БД
      res.json({ success: true, addresses: updatedAddresses });
    } else {
      // Fallback: файловое хранилище
      const existingData = userDataStore[userId] || {};
      
      userDataStore[userId] = {
        cart: cart !== undefined ? cart : (existingData.cart || []),
        addresses: addresses !== undefined ? addresses : (existingData.addresses || []),
        profile: profile !== undefined ? profile : (existingData.profile || null),
        activeOrders: activeOrders !== undefined ? activeOrders : (existingData.activeOrders || []),
        completedOrders: completedOrders !== undefined ? completedOrders : (existingData.completedOrders || []),
        bonuses: bonuses !== undefined ? bonuses : (existingData.bonuses !== undefined ? existingData.bonuses : 0),
        updatedAt: new Date().toISOString()
      };
      
      saveUserDataToFile(userDataStore);
      
      console.log(`💾 Сохранены данные для пользователя ${userId} (файл): адресов=${userDataStore[userId].addresses.length}, заказов=${userDataStore[userId].activeOrders.length}`);
    
      // Возвращаем адреса из файлового хранилища
      res.json({ success: true, addresses: userDataStore[userId].addresses || [] });
    }
  } catch (error) {
    console.error('Ошибка сохранения данных:', error);
    res.status(500).json({ error: 'Ошибка сохранения данных' });
  }
});

// API endpoint для загрузки данных пользователя (POST - с данными из Telegram)
app.post('/api/user-data/:userId', async (req, res) => {
  const { userId } = req.params;
  const { telegramUser } = req.body;
  
  try {
    if (pool) {
      // Работа с БД - передаем данные пользователя из Telegram для создания/обновления
      const user = await getOrCreateUser(userId, telegramUser || null);
      if (!user) {
        return res.json({
          cart: [],
          addresses: [],
          profile: null,
          activeOrders: [],
          completedOrders: [],
          bonuses: 0
        });
      }
      
      const addresses = await loadUserAddresses(user.id);
      console.log(`📦 Загружено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
      // Загружаем активные заказы (NEW, PROCESSING, PURCHASE, COLLECTING, DELIVERING, COMPLETED, CANCELED)
      // COMPLETED и CANCELED включаем в активные, чтобы пользователь увидел изменение статуса
      // При следующем открытии бота они будут перемещены в историю на фронтенде
      const activeOrders = await loadUserOrders(user.id, ['NEW', 'PROCESSING', 'PURCHASE', 'COLLECTING', 'DELIVERING', 'COMPLETED', 'CANCELED']);
      // История заказов - только доставленные (COMPLETED) и отмененные (CANCELED)
      // На фронтенде они будут добавлены в историю из активных при следующей загрузке
      const completedOrders = await loadUserOrders(user.id, ['COMPLETED', 'CANCELED']);
      
      console.log(`📥 Загружено заказов для пользователя ${userId} (user_id=${user.id}): активных=${activeOrders.length}, завершенных=${completedOrders.length}`);
      if (activeOrders.length > 0) {
        console.log('📥 ID активных заказов:', activeOrders.map(o => o.id).join(', '));
      }
      
      const userData = {
        cart: [], // Корзина хранится на клиенте
        addresses: addresses,
        profile: {
          name: user.first_name || '',
          phone: user.phone || '',
          email: user.email || ''
        },
        activeOrders: activeOrders,
        completedOrders: completedOrders,
        // Баланс из транзакций (единственный источник правды)
        bonuses: await getUserBonusBalance(user.id)
      };
      
      // Логируем загрузку данных только если есть что загружать
      if (addresses.length > 0 || activeOrders.length > 0) {
        console.log(`📥 Загружены данные для пользователя ${userId} (БД): адресов=${addresses.length}, активных заказов=${activeOrders.length}`);
      }
      
      res.json(userData);
    } else {
      // Fallback на файловое хранилище
      const userData = userDataStore[userId] || {
        cart: [],
        addresses: [],
        profile: null,
        activeOrders: [],
        completedOrders: [],
        bonuses: 0
      };
      res.json(userData);
    }
  } catch (error) {
    console.error('Ошибка загрузки данных пользователя:', error);
    res.status(500).json({ error: 'Ошибка загрузки данных' });
  }
});

// API endpoint для загрузки данных пользователя (GET - для обратной совместимости)
// Пытаемся получить данные пользователя из заголовков, если они есть
app.get('/api/user-data/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    if (pool) {
      // Пытаемся получить данные пользователя из заголовков (если переданы)
      // В большинстве случаев это не сработает, но на всякий случай проверяем
      let telegramUser = null;
      const initData = req.headers['x-telegram-init-data'] || req.query.initData;
      // Если initData не передан, просто используем userId
      
      // Работа с БД
      const user = await getOrCreateUser(userId, telegramUser);
      if (!user) {
        return res.json({
          cart: [],
          addresses: [],
          profile: null,
          activeOrders: [],
          completedOrders: [],
          bonuses: 0
        });
      }
      
      const addresses = await loadUserAddresses(user.id);
      console.log(`📦 Загружено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
      // Загружаем активные заказы (NEW, PROCESSING, PURCHASE, COLLECTING, DELIVERING, COMPLETED, CANCELED)
      // COMPLETED и CANCELED включаем в активные, чтобы пользователь увидел изменение статуса
      // При следующем открытии бота они будут перемещены в историю на фронтенде
      const activeOrders = await loadUserOrders(user.id, ['NEW', 'PROCESSING', 'PURCHASE', 'COLLECTING', 'DELIVERING', 'COMPLETED', 'CANCELED']);
      // История заказов - только доставленные (COMPLETED) и отмененные (CANCELED)
      // На фронтенде они будут добавлены в историю из активных при следующей загрузке
      const completedOrders = await loadUserOrders(user.id, ['COMPLETED', 'CANCELED']);
      
      console.log(`📥 Загружено заказов для пользователя ${userId} (user_id=${user.id}): активных=${activeOrders.length}, завершенных=${completedOrders.length}`);
      if (activeOrders.length > 0) {
        console.log('📥 ID активных заказов:', activeOrders.map(o => o.id).join(', '));
      }
      
      const userData = {
        cart: [], // Корзина хранится на клиенте
        addresses: addresses,
        profile: {
          name: user.first_name || '',
          phone: user.phone || '',
          email: user.email || ''
        },
        activeOrders: activeOrders,
        completedOrders: completedOrders
      };
      
      // Логируем загрузку данных
      console.log(`📥 Загружены данные для пользователя ${userId} (user_id=${user.id}) в GET: адресов=${addresses.length}, активных заказов=${activeOrders.length}`);
      
      res.json(userData);
    } else {
      // Fallback: файловое хранилище
      const userData = userDataStore[userId] || {
        cart: [],
        addresses: [],
        profile: null,
        activeOrders: [],
        completedOrders: [],
      };
      
      console.log(`📥 Загружены данные для пользователя ${userId} (файл): адресов=${userData.addresses.length}, заказов=${userData.activeOrders.length}`);
      
      res.json(userData);
    }
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
    res.status(500).json({ error: 'Ошибка загрузки данных' });
  }
});

// API endpoint для получения деталей заказа
app.get('/api/orders/:orderId', async (req, res) => {
  const { orderId } = req.params;
  let userId = req.query.userId || req.headers['x-user-id'];
  
  console.log(`[GET /api/orders/${orderId}] Запрос деталей заказа. userId из query: ${req.query.userId}, из headers: ${req.headers['x-user-id']}`);
  
  // Если userId не передан, пробуем получить из initData
  if (!userId && req.query.initData) {
    try {
      const initData = parseInitData(req.query.initData);
      if (initData && initData.user) {
        userId = initData.user.id;
        console.log(`[GET /api/orders/${orderId}] userId получен из initData: ${userId}`);
      }
    } catch (e) {
      console.warn(`[GET /api/orders/${orderId}] Не удалось распарсить initData:`, e.message);
    }
  }
  
  if (!userId) {
    console.error(`[GET /api/orders/${orderId}] userId не указан`);
    return res.status(401).json({ error: 'Не указан userId' });
  }
  
  // Преобразуем userId в число, если это строка
  userId = parseInt(userId, 10);
  if (isNaN(userId)) {
    console.error(`[GET /api/orders/${orderId}] userId не является числом: ${req.query.userId}`);
    return res.status(400).json({ error: 'Некорректный userId' });
  }
  
  try {
    if (!pool) {
      console.error(`[GET /api/orders/${orderId}] База данных не доступна`);
      return res.status(500).json({ error: 'База данных не доступна' });
    }
    
    const client = await pool.connect();
    try {
      // Сначала проверяем, существует ли пользователь с таким telegram_id
      const userCheckQuery = 'SELECT id FROM users WHERE telegram_id = $1';
      const userCheckResult = await client.query(userCheckQuery, [userId]);
      
      if (userCheckResult.rows.length === 0) {
        console.warn(`[GET /api/orders/${orderId}] Пользователь с telegram_id=${userId} не найден`);
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      const dbUserId = userCheckResult.rows[0].id;
      console.log(`[GET /api/orders/${orderId}] Найден пользователь: telegram_id=${userId}, user_id=${dbUserId}`);
      
      // Проверяем наличие колонки order_number
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'order_number'
      `);
      const hasOrderNumber = columnCheck.rows.length > 0;
      
      // Получаем заказ с товарами
      // Используем условный SELECT в зависимости от наличия колонки order_number
      const orderQuery = hasOrderNumber ? `
        SELECT o.*, o.order_number,
               json_agg(json_build_object(
                 'id', oi.product_id,
                 'name', oi.name,
                 'price', oi.price,
                 'quantity', oi.quantity,
                 'total_price', oi.total_price,
                 'image_url', p.image_url,
                 'min_order_quantity', COALESCE(p.min_order_quantity, 1)
               )) FILTER (WHERE oi.id IS NOT NULL) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE o.id = $1 AND o.user_id = $2
        GROUP BY o.id
      ` : `
        SELECT o.*,
               json_agg(json_build_object(
                 'id', oi.product_id,
                 'name', oi.name,
                 'price', oi.price,
                 'quantity', oi.quantity,
                 'total_price', oi.total_price,
                 'image_url', p.image_url,
                 'min_order_quantity', COALESCE(p.min_order_quantity, 1)
               )) FILTER (WHERE oi.id IS NOT NULL) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE o.id = $1 AND o.user_id = $2
        GROUP BY o.id
      `;
      
      // Преобразуем orderId в число
      const orderIdNum = parseInt(orderId, 10);
      if (isNaN(orderIdNum)) {
        console.error(`[GET /api/orders/${orderId}] orderId не является числом: ${orderId}`);
        return res.status(400).json({ error: 'Некорректный ID заказа' });
      }
      
      console.log(`[GET /api/orders/${orderId}] Выполняем запрос с orderId=${orderIdNum}, user_id=${dbUserId}`);
      
      // Сначала проверяем, существует ли заказ вообще
      const orderExistsQuery = 'SELECT id, user_id FROM orders WHERE id = $1';
      const orderExistsResult = await client.query(orderExistsQuery, [orderIdNum]);
      
      if (orderExistsResult.rows.length === 0) {
        console.warn(`[GET /api/orders/${orderId}] Заказ с ID=${orderIdNum} не существует в БД`);
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      const orderOwnerId = orderExistsResult.rows[0].user_id;
      if (orderOwnerId !== dbUserId) {
        console.warn(`[GET /api/orders/${orderId}] Заказ принадлежит другому пользователю. Заказ user_id=${orderOwnerId}, запрашивающий user_id=${dbUserId}`);
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
      
      // Теперь получаем заказ с товарами
      const result = await client.query(orderQuery, [orderIdNum, dbUserId]);
      
      if (result.rows.length === 0) {
        console.error(`[GET /api/orders/${orderId}] Заказ найден, но не удалось загрузить данные с товарами`);
        return res.status(500).json({ error: 'Ошибка загрузки данных заказа' });
      }
      
      const row = result.rows[0];
      
      // Форматируем дату доставки
      let deliveryDateFormatted = '';
      if (row.delivery_date) {
        const deliveryDate = new Date(row.delivery_date);
        deliveryDateFormatted = deliveryDate.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
      
      // Форматируем время доставки
      let deliveryTimeFormatted = row.delivery_time || '';
      if (deliveryTimeFormatted && !deliveryTimeFormatted.includes(':')) {
        const timeParts = deliveryTimeFormatted.split('-');
        if (timeParts.length === 2) {
          deliveryTimeFormatted = `${timeParts[0]}:00–${timeParts[1]}:00`;
        }
      }
      
      // Формируем адрес доставки
      let deliveryAddress = '';
      if (row.address_json) {
        try {
          const address = typeof row.address_json === 'string' 
            ? JSON.parse(row.address_json) 
            : row.address_json;
          
          const addressParts = [];
          if (address.city) addressParts.push(address.city);
          if (address.street) addressParts.push(address.street);
          if (address.house) addressParts.push(address.house);
          if (address.apartment) addressParts.push(`кв. ${address.apartment}`);
          
          deliveryAddress = addressParts.join(', ');
        } catch (e) {
          deliveryAddress = row.address_string || '';
        }
      } else {
        deliveryAddress = row.address_string || '';
      }
      
      // Маппим статус для пользователя (для отображения текста)
      const statusTextMap = {
        'NEW': 'В обработке',
        'PROCESSING': 'В обработке',
        'PURCHASE': 'Принят',
        'COLLECTING': 'Собирается',
        'DELIVERING': 'В пути',
        'DELIVERED': 'Доставлен',
        'COMPLETED': 'Доставлен',
        'CANCELED': 'Отменен'
      };
      
      const userStatus = statusTextMap[row.status] || row.status;
      
      // Загружаем историю статусов
      let statusHistory = [];
      try {
        const historyQuery = `
          SELECT status, created_at, changed_by, comment
          FROM order_status_history
          WHERE order_id = $1
          ORDER BY created_at ASC
        `;
        const historyResult = await client.query(historyQuery, [orderIdNum]);
        console.log(`[GET /api/orders/${orderId}] Найдено записей в истории: ${historyResult.rows.length}`);
        
        // Маппинг статусов для отображения (совпадает с админкой)
        const statusDisplayMap = {
          'NEW': 'В обработке',
          'PROCESSING': 'В обработке',
          'PURCHASE': 'Принят',
          'COLLECTING': 'Собирается',
          'DELIVERING': 'В пути',
          'DELIVERED': 'Доставлен',
          'COMPLETED': 'Доставлен',
          'CANCELED': 'Отменен'
        };
        
        statusHistory = historyResult.rows.map(h => ({
          status: statusDisplayMap[h.status] || h.status,
          statusRaw: h.status,
          date: new Date(h.created_at).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
          }),
          time: new Date(h.created_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          changedBy: h.changed_by || 'Система',
          comment: h.comment || null,
          createdAt: h.created_at
        }));
        console.log(`[GET /api/orders/${orderId}] История статусов сформирована:`, statusHistory.length, 'записей');
      } catch (historyError) {
        console.warn(`[GET /api/orders/${orderId}] Не удалось загрузить историю статусов:`, historyError.message);
        console.warn(`[GET /api/orders/${orderId}] Stack:`, historyError.stack);
      }
      
      // Извлекаем номер заказа пользователя из order_number (последние 3 цифры)
      let userOrderNumber = null;
      if (row.order_number) {
        const fullOrderNumber = String(row.order_number);
        userOrderNumber = fullOrderNumber.slice(-3);
      }
      
      const orderData = {
        id: row.id,
        total: row.total,
        createdAt: new Date(row.created_at).toLocaleDateString('ru-RU'),
        status: userStatus,
        statusRaw: row.status, // Сохраняем оригинальный статус для маппинга в степпер
        recipient_name: row.recipient_name || null,
        recipient_phone: row.recipient_phone || null,
        order_number: row.order_number || null,
        userOrderNumber: userOrderNumber,
        delivery: {
          address: deliveryAddress,
          date: deliveryDateFormatted,
          timeSlot: deliveryTimeFormatted
        },
        items: (row.items || []).filter(item => item.id !== null).map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.total_price,
          imageUrl: item.image_url || ''
        })),
        statusHistory: statusHistory
      };
      
      res.json(orderData);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения деталей заказа:', error);
    res.status(500).json({ error: 'Ошибка получения деталей заказа' });
  }
});

// API endpoint для создания заказа
app.post('/api/orders', async (req, res) => {
  const orderData = req.body;
  
  try {
    if (pool) {
      // Сохраняем заказ в БД
      const result = await createOrderInDb(orderData);
      
      if (result && result.orderId) {
        console.log(`✅ Заказ создан в БД: ID=${result.orderId}, сумма=${orderData.total}₽`);
        
        // Сохраняем адрес из заказа в таблицу addresses, если он есть
        // Также обновляем username пользователя, если он передан в orderData
        if (orderData.userId && orderData.addressData) {
          try {
            // Передаем данные пользователя из Telegram для обновления username и phone_number
            const telegramUser = (orderData.username || orderData.phone_number) ? {
              id: orderData.userId,
              username: orderData.username || null,
              phone_number: orderData.phone_number || null
            } : null;
            const user = await getOrCreateUser(orderData.userId, telegramUser);
            if (user && orderData.addressData && orderData.addressData.street) {
              // Используем безопасную функцию addUserAddress вместо saveUserAddresses
              // Это не затирает существующие адреса пользователя
              const addressToAdd = {
                name: orderData.addressData.name || orderData.addressData.street || 'Новый адрес',
                  city: orderData.addressData.city || 'Санкт-Петербург',
                  street: orderData.addressData.street,
                house: orderData.addressData.house || '',
                  entrance: orderData.addressData.entrance || '',
                  apartment: orderData.addressData.apartment || '',
                  floor: orderData.addressData.floor || '',
                  intercom: orderData.addressData.intercom || '',
                  comment: orderData.addressData.comment || ''
              };
              
              const added = await addUserAddress(user.id, addressToAdd);
              if (added) {
                console.log('✅ Адрес из заказа сохранен в БД (или уже существует)');
              } else {
                console.log('⚠️  Не удалось сохранить адрес из заказа');
              }
            }
          } catch (addrError) {
            console.error('⚠️  Ошибка сохранения адреса из заказа:', addrError);
            // Не прерываем создание заказа из-за ошибки сохранения адреса
          }
        }
        
        // Отправляем подтверждение заказа пользователю в Telegram (асинхронно, не блокируем ответ)
        if (orderData.userId && bot) {
          // Выполняем отправку уведомления асинхронно, не блокируя ответ сервера
          setImmediate(async () => {
            try {
              console.log(`📤 Начинаем отправку подтверждения заказа #${result.orderId} пользователю ${orderData.userId}`);
              
              // Используем данные из orderData, которые уже есть
              const orderDataForMessage = {
                items: orderData.items || [],
                total: parseFloat(orderData.total),
                flowersTotal: parseFloat(orderData.flowersTotal || 0),
                serviceFee: parseFloat(orderData.serviceFee || 450),
                deliveryPrice: parseFloat(orderData.deliveryPrice || 0),
                address: orderData.address || '',
                deliveryDate: orderData.deliveryDate || null,
                deliveryTime: orderData.deliveryTime || null,
                comment: orderData.comment || orderData.userComment || null,
                clientName: orderData.name || null,
                clientPhone: orderData.phone || null,
                recipientName: orderData.recipientName || null,
                recipientPhone: orderData.recipientPhone || null,
                courierComment: orderData.courierComment || null,
                leaveAtDoor: orderData.leaveAtDoor || false,
                userOrderNumber: result.userOrderNumber || null,
                order_number: result.order_number || null,
                userId: orderData.userId
              };
              
              // Отправляем сообщение с подтверждением заказа
              await sendOrderConfirmation(result.orderId, orderData.userId, orderDataForMessage);
              console.log(`✅ Подтверждение заказа #${result.orderId} успешно отправлено`);
            } catch (notificationError) {
              // Не прерываем выполнение, если не удалось отправить уведомление
              console.error('⚠️  Ошибка отправки подтверждения заказа:', notificationError.message);
              console.error('Stack trace:', notificationError.stack);
            }
          });
        } else {
          console.warn(`⚠️ Не отправляем подтверждение: userId=${orderData.userId}, bot=${!!bot}`);
        }
        
        // Отправляем уведомление о новом заказе в группу с темой (асинхронно, не блокируем ответ)
        console.log(`🔍 Проверка настроек для отправки в группу: bot=${!!bot}, ORDERS_GROUP_ID=${ORDERS_GROUP_ID}, ORDERS_TOPIC_ID=${ORDERS_TOPIC_ID}`);
        if (bot && ORDERS_GROUP_ID && ORDERS_TOPIC_ID) {
          console.log(`✅ Все условия выполнены, планируем отправку уведомления о заказе #${result.orderId} в группу`);
          setImmediate(async () => {
            try {
              console.log(`📤 Начинаем отправку уведомления о заказе #${result.orderId} в группу ${ORDERS_GROUP_ID}, тема ${ORDERS_TOPIC_ID}`);
              
              // Формируем данные для уведомления в группу
              const orderDataForGroup = {
                items: orderData.items || [],
                total: parseFloat(orderData.total),
                flowersTotal: parseFloat(orderData.flowersTotal || 0),
                serviceFee: parseFloat(orderData.serviceFee || 450),
                deliveryPrice: parseFloat(orderData.deliveryPrice || 0),
                address: orderData.address || '',
                deliveryDate: orderData.deliveryDate || null,
                deliveryTime: orderData.deliveryTime || null,
                comment: orderData.comment || orderData.userComment || null,
                clientName: orderData.name || null,
                clientPhone: orderData.phone || null,
                recipientName: orderData.recipientName || null,
                recipientPhone: orderData.recipientPhone || null,
                courierComment: orderData.courierComment || null,
                leaveAtDoor: orderData.leaveAtDoor || false,
                userOrderNumber: result.userOrderNumber || null,
                order_number: result.order_number || null,
                userId: orderData.userId
              };
              
              console.log(`📋 Данные для отправки в группу:`, JSON.stringify(orderDataForGroup, null, 2));
              
              // Отправляем уведомление в группу
              await sendOrderNotificationToGroup(result.orderId, orderDataForGroup);
              console.log(`✅ Функция sendOrderNotificationToGroup завершена для заказа #${result.orderId}`);
            } catch (groupNotificationError) {
              // Не прерываем выполнение, если не удалось отправить уведомление в группу
              console.error('❌ Ошибка отправки уведомления о заказе в группу:', groupNotificationError.message);
              console.error('Stack trace:', groupNotificationError.stack);
              console.error('Детали ошибки:', JSON.stringify(groupNotificationError, null, 2));
            }
          });
        } else {
          console.warn(`⚠️ Не отправляем уведомление в группу:`);
          console.warn(`   - bot: ${!!bot}`);
          console.warn(`   - ORDERS_GROUP_ID: ${ORDERS_GROUP_ID} (type: ${typeof ORDERS_GROUP_ID})`);
          console.warn(`   - ORDERS_TOPIC_ID: ${ORDERS_TOPIC_ID} (type: ${typeof ORDERS_TOPIC_ID})`);
        }
        
        // Возвращаем явный успешный ответ
        const responseData = { 
          success: true, 
          orderId: result.orderId,
          order_number: result.order_number || null,
          userOrderNumber: result.userOrderNumber || null
        };
        
        res.status(200).json(responseData);
      } else {
        console.error('❌ createOrderInDb вернул null или не содержит orderId');
        throw new Error('Не удалось создать заказ в БД');
      }
    } else {
      // Fallback: просто логируем
      console.log('📦 Новый заказ (файловое хранилище):', {
        items: orderData.items?.length || 0,
        total: orderData.total,
        address: orderData.address,
        userId: orderData.userId
      });
      
      res.json({ success: true, orderId: Date.now() });
    }
  } catch (error) {
    console.error('❌ Ошибка создания заказа:', error);
    console.error('Детали ошибки:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('Данные заказа:', {
      userId: orderData.userId,
      itemsCount: orderData.items?.length || 0,
      total: orderData.total
    });
    
    // Определяем статус код в зависимости от типа ошибки
    const isStockError = error.message && error.message.includes('Недостаточно товара');
    const statusCode = isStockError ? 400 : 500; // 400 для ошибок нехватки товара, 500 для остальных
    
    res.status(statusCode).json({ 
      success: false,
      error: error.message || 'Ошибка создания заказа',
      errorType: isStockError ? 'stock_insufficient' : 'general_error'
    });
  }
});

// ==================== АДМИНКА ====================

// Простая авторизация для админки (можно улучшить)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'flowbox-admin-secret';

// Middleware для проверки авторизации админа
function checkAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${ADMIN_PASSWORD}`) {
    req.isAdmin = true;
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Функция для безопасного получения клиента из пула с обработкой таймаутов и retry логикой
async function getDbClient(retries = 2) {
  if (!pool) {
    throw new Error('База данных не подключена');
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Пытаемся получить клиента с таймаутом (10 секунд)
      const client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout exceeded when trying to connect')), 10000)
        )
      ]);
      
      // Если успешно получили клиента, возвращаем его
      if (attempt > 0) {
        console.log(`✅ Подключение к БД восстановлено (попытка ${attempt + 1})`);
      }
      return client;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      
      if (error.message.includes('timeout') || error.message.includes('exceeded')) {
        if (isLastAttempt) {
          console.error(`⚠️ Таймаут подключения к БД после ${retries + 1} попыток`);
          throw new Error('База данных временно недоступна. Попробуйте позже.');
        } else {
          // Ждем перед следующей попыткой (экспоненциальная задержка: 500ms, 1000ms)
          const delay = 500 * Math.pow(2, attempt);
          console.log(`⚠️ Таймаут подключения к БД, повтор через ${delay}ms (попытка ${attempt + 1}/${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Для других ошибок сразу выбрасываем
      throw error;
    }
  }
}

// API: Получить категории товаров
app.get('/api/admin/product-categories', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_categories ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// API: Создать категорию
app.post('/api/admin/product-categories', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название категории обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания категории:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// API: Получить цвета
app.get('/api/admin/colors', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_colors ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения цветов:', error);
    res.status(500).json({ error: 'Ошибка получения цветов' });
  }
});

// API: Получить поставщиков
app.get('/api/admin/suppliers', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM suppliers ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения поставщиков:', error);
    res.status(500).json({ error: 'Ошибка получения поставщиков' });
  }
});

// API: Создать поставщика
app.post('/api/admin/suppliers', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название поставщика обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO suppliers (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания поставщика:', error);
    res.status(500).json({ error: 'Ошибка создания поставщика' });
  }
});

// API: Создать цвет
app.post('/api/admin/colors', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название цвета обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO product_colors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания цвета:', error);
    res.status(500).json({ error: 'Ошибка создания цвета' });
  }
});

// API: Получить качества
app.get('/api/admin/product-qualities', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_qualities ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения качеств:', error);
    res.status(500).json({ error: 'Ошибка получения качеств' });
  }
});

// API: Создать качество
app.post('/api/admin/product-qualities', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название качества обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO product_qualities (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания качества:', error);
    res.status(500).json({ error: 'Ошибка создания качества' });
  }
});

// API: Получить длины стеблей
app.get('/api/admin/stem-lengths', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM stem_lengths ORDER BY value');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения длин стеблей:', error);
    res.status(500).json({ error: 'Ошибка получения длин стеблей' });
  }
});

// API: Создать длину стебля
app.post('/api/admin/stem-lengths', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { value } = req.body;
  if (!value) {
    return res.status(400).json({ error: 'Значение длины обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO stem_lengths (value) VALUES ($1) ON CONFLICT (value) DO UPDATE SET value = EXCLUDED.value RETURNING *',
        [value.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания длины стебля:', error);
    res.status(500).json({ error: 'Ошибка создания длины стебля' });
  }
});

// API: Получить страны
app.get('/api/admin/countries', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM countries ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения стран:', error);
    res.status(500).json({ error: 'Ошибка получения стран' });
  }
});

// API: Создать страну
app.post('/api/admin/countries', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название страны обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO countries (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания страны:', error);
    res.status(500).json({ error: 'Ошибка создания страны' });
  }
});

// API: Получить сорта
app.get('/api/admin/varieties', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM varieties ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения сортов:', error);
    res.status(500).json({ error: 'Ошибка получения сортов' });
  }
});

// API: Создать сорт
app.post('/api/admin/varieties', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название сорта обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO varieties (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания сорта:', error);
    res.status(500).json({ error: 'Ошибка создания сорта' });
  }
});

// API: Получить теги
app.get('/api/admin/product-tags', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM product_tags ORDER BY name');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения тегов:', error);
    res.status(500).json({ error: 'Ошибка получения тегов' });
  }
});

// API: Создать тег
app.post('/api/admin/product-tags', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название тега обязательно' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO product_tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [name.trim()]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания тега:', error);
    res.status(500).json({ error: 'Ошибка создания тега' });
  }
});

// API: Получить все товары (для админки)
app.get('/api/admin/products', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          p.*,
          pc.name as category_name,
          pcol.name as color_name,
          sl.value as stem_length_value,
          c.name as country_name,
          v.name as variety_name,
          p.features as features, -- Поле features из таблицы products (TEXT[])
          COALESCE(
            (SELECT json_agg(json_build_object('id', pq.id, 'name', pq.name))
             FROM product_qualities pq
             JOIN product_qualities_map pqm ON pq.id = pqm.quality_id
             WHERE pqm.product_id = p.id),
            '[]'::json
          ) as qualities,
          COALESCE(
            (SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name))
             FROM product_tags pt
             JOIN product_tags_map ptm ON pt.id = ptm.tag_id
             WHERE ptm.product_id = p.id),
            '[]'::json
          ) as tags
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_colors pcol ON p.color_id = pcol.id
        LEFT JOIN stem_lengths sl ON p.stem_length_id = sl.id
        LEFT JOIN countries c ON p.country_id = c.id
        LEFT JOIN varieties v ON p.variety_id = v.id
        ORDER BY p.created_at DESC
      `);
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения товаров:', error);
    res.status(500).json({ error: 'Ошибка получения товаров' });
  }
});

// API: Создать товар
app.post('/api/admin/products', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { 
    name, 
    category_id, 
    color_id, 
    price_per_stem, 
    min_stem_quantity,
    quality_ids,
    features, // Массив строк качеств (TEXT[])
    stem_length_id,
    country_id,
    variety_id,
    tag_ids,
    tags, // Массив строк тегов (TEXT[])
    image_url,
    image_url_2,
    image_url_3,
    is_active,
    stock,
    min_stock
  } = req.body;
  
  if (!name || !category_id || !color_id || !price_per_stem || !min_stem_quantity) {
    return res.status(400).json({ error: 'Название, категория, цвет, цена за стебель и минимальное количество обязательны' });
  }
  
  // Валидация price_per_stem: должно быть целым числом >= 1
  const pricePerStemInt = parseInt(price_per_stem);
  if (!Number.isInteger(pricePerStemInt) || pricePerStemInt < 1) {
    return res.status(400).json({ error: 'Цена за стебель должна быть целым числом не менее 1 рубля' });
  }
  
  // Валидация min_stem_quantity: должно быть целым числом >= 1
  const minStemQtyInt = parseInt(min_stem_quantity);
  if (!Number.isInteger(minStemQtyInt) || minStemQtyInt < 1) {
    return res.status(400).json({ error: 'Минимальное количество стеблей должно быть целым числом не менее 1' });
  }
  
  // Формируем features как TEXT[] из quality_ids или из переданного features
  let featuresArray = [];
  if (features && Array.isArray(features)) {
    featuresArray = features;
  } else if (quality_ids && Array.isArray(quality_ids) && quality_ids.length > 0) {
    // Получаем названия качеств по ID
    const client = await pool.connect();
    try {
      const qualityNames = await client.query(
        'SELECT name FROM product_qualities WHERE id = ANY($1::int[])',
        [quality_ids]
      );
      featuresArray = qualityNames.rows.map(r => r.name);
    } finally {
      client.release();
    }
  }
  
  if (featuresArray.length === 0) {
    return res.status(400).json({ error: 'Необходимо выбрать хотя бы одно отличительное качество' });
  }
  
  // Формируем tags как TEXT[]
  let tagsArray = [];
  if (tags && Array.isArray(tags)) {
    tagsArray = tags;
  } else if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
    const client = await pool.connect();
    try {
      const tagNames = await client.query(
        'SELECT name FROM product_tags WHERE id = ANY($1::int[])',
        [tag_ids]
      );
      tagsArray = tagNames.rows.map(r => r.name);
    } finally {
      client.release();
    }
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Создаем товар с features и tags как TEXT[]
      const result = await client.query(
        `INSERT INTO products (
          name, 
          category_id, 
          color_id, 
          price_per_stem, 
          min_stem_quantity,
          features,
          tags,
          stem_length_id,
          country_id,
          variety_id,
          image_url,
          image_url_2,
          image_url_3,
          is_active
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          name,
          category_id,
          color_id,
          pricePerStemInt,
          minStemQtyInt,
          featuresArray.length > 0 ? featuresArray : null,
          tagsArray.length > 0 ? tagsArray : null,
          stem_length_id || null,
          country_id || null,
          variety_id || null,
          image_url || null,
          image_url_2 || null,
          image_url_3 || null,
          is_active !== false
        ]
      );
      
      const product = result.rows[0];
      
      // Также сохраняем связи для обратной совместимости (опционально)
      if (quality_ids && quality_ids.length > 0) {
        for (const qualityId of quality_ids) {
          await client.query(
            'INSERT INTO product_qualities_map (product_id, quality_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [product.id, qualityId]
          );
        }
      }
      
      if (tag_ids && tag_ids.length > 0) {
        for (const tagId of tag_ids) {
          await client.query(
            'INSERT INTO product_tags_map (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [product.id, tagId]
          );
        }
      }
      
      await client.query('COMMIT');
      res.json(product);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка создания товара:', error);
    res.status(500).json({ error: 'Ошибка создания товара: ' + error.message });
  }
});

// API: Обновить товар
app.put('/api/admin/products/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { 
    name, 
    category_id, 
    color_id, 
    price_per_stem, 
    min_stem_quantity,
    quality_ids,
    features, // Массив строк качеств (TEXT[]) - опционально
    stem_length_id,
    country_id,
    variety_id,
    tag_ids,
    tags, // Массив строк тегов (TEXT[]) - опционально
    image_url,
    image_url_2,
    image_url_3,
    is_active,
    stock,
    min_stock
  } = req.body;
  
  // Валидация price_per_stem, если передано
  let pricePerStemInt = null;
  if (price_per_stem !== undefined) {
    pricePerStemInt = parseInt(price_per_stem);
    if (!Number.isInteger(pricePerStemInt) || pricePerStemInt < 1) {
      return res.status(400).json({ error: 'Цена за стебель должна быть целым числом не менее 1 рубля' });
    }
  }
  
  // Валидация min_stem_quantity, если передано
  let minStemQtyInt = null;
  if (min_stem_quantity !== undefined) {
    minStemQtyInt = parseInt(min_stem_quantity);
    if (!Number.isInteger(minStemQtyInt) || minStemQtyInt < 1) {
      return res.status(400).json({ error: 'Минимальное количество стеблей должно быть целым числом не менее 1' });
    }
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем наличие колонок stock и min_stock
      const columnsCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name IN ('stock', 'min_stock')
      `);
      
      const hasStock = columnsCheck.rows.some(r => r.column_name === 'stock');
      const hasMinStock = columnsCheck.rows.some(r => r.column_name === 'min_stock');
      
      // Строим динамический UPDATE запрос только для переданных полей
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
      }
      if (category_id !== undefined) {
        updates.push(`category_id = $${paramIndex}`);
        params.push(category_id);
        paramIndex++;
      }
      if (color_id !== undefined) {
        updates.push(`color_id = $${paramIndex}`);
        params.push(color_id);
        paramIndex++;
      }
      if (pricePerStemInt !== null) {
        updates.push(`price_per_stem = $${paramIndex}`);
        params.push(pricePerStemInt);
        paramIndex++;
      }
      if (minStemQtyInt !== null) {
        updates.push(`min_stem_quantity = $${paramIndex}`);
        params.push(minStemQtyInt);
        paramIndex++;
      }
      if (stem_length_id !== undefined) {
        updates.push(`stem_length_id = $${paramIndex}`);
        params.push(stem_length_id);
        paramIndex++;
      }
      if (country_id !== undefined) {
        updates.push(`country_id = $${paramIndex}`);
        params.push(country_id);
        paramIndex++;
      }
      if (variety_id !== undefined) {
        updates.push(`variety_id = $${paramIndex}`);
        params.push(variety_id);
        paramIndex++;
      }
      if (image_url !== undefined) {
        updates.push(`image_url = $${paramIndex}`);
        params.push(image_url);
        paramIndex++;
      }
      if (image_url_2 !== undefined) {
        updates.push(`image_url_2 = $${paramIndex}`);
        params.push(image_url_2);
        paramIndex++;
      }
      if (image_url_3 !== undefined) {
        updates.push(`image_url_3 = $${paramIndex}`);
        params.push(image_url_3);
        paramIndex++;
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(is_active);
        paramIndex++;
      }
      
      // Обновляем features, если переданы quality_ids или features
      if (quality_ids !== undefined || features !== undefined) {
        let featuresArray = [];
        if (features !== undefined && Array.isArray(features)) {
          // Если переданы features напрямую, используем их
          featuresArray = features;
        } else if (quality_ids !== undefined) {
          // Если переданы quality_ids, преобразуем их в названия качеств
          if (Array.isArray(quality_ids) && quality_ids.length > 0) {
            // Получаем названия качеств по ID
            const qualityNames = await client.query(
              'SELECT name FROM product_qualities WHERE id = ANY($1::int[])',
              [quality_ids]
            );
            featuresArray = qualityNames.rows.map(r => r.name);
          } else {
            // Если quality_ids пустой массив, features тоже должен быть пустым
            featuresArray = [];
          }
        }
        
        // Обновляем features (даже если массив пустой, чтобы можно было очистить качества)
        updates.push(`features = $${paramIndex}`);
        params.push(featuresArray.length > 0 ? featuresArray : null);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Нет полей для обновления' });
      }
      
      // Добавляем stock и min_stock, если они переданы
      if (hasStock && stock !== undefined) {
        updates.push(`stock = $${paramIndex}`);
        params.push(stock);
        paramIndex++;
      }
      
      if (hasMinStock && min_stock !== undefined) {
        updates.push(`min_stock = $${paramIndex}`);
        params.push(min_stock);
        paramIndex++;
      }
      
      updates.push(`updated_at = now()`);
      
      let updateQuery = `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      params.push(id);
      
      const result = await client.query(updateQuery, params);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Товар не найден' });
      }
      
      // Обновляем связи с качествами
      if (quality_ids !== undefined) {
        // Удаляем старые связи
        await client.query('DELETE FROM product_qualities_map WHERE product_id = $1', [id]);
        // Добавляем новые
        if (Array.isArray(quality_ids) && quality_ids.length > 0) {
          for (const qualityId of quality_ids) {
            await client.query(
              'INSERT INTO product_qualities_map (product_id, quality_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [id, qualityId]
            );
          }
        }
      }
      
      // Обновляем связи с тегами
      if (tag_ids !== undefined) {
        // Удаляем старые связи
        await client.query('DELETE FROM product_tags_map WHERE product_id = $1', [id]);
        // Добавляем новые
        if (Array.isArray(tag_ids) && tag_ids.length > 0) {
          for (const tagId of tag_ids) {
            await client.query(
              'INSERT INTO product_tags_map (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [id, tagId]
            );
          }
        }
      }
      
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления товара:', error);
    res.status(500).json({ error: 'Ошибка обновления товара: ' + error.message });
  }
});

// API: Получить статистику товаров (для определения состояния кнопки)
// ВАЖНО: Этот роут должен быть ПЕРЕД /api/admin/products/:id, чтобы не перехватывать запросы к /stats
app.get('/api/admin/products/stats', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await getDbClient();
    try {
      const result = await client.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active, COUNT(*) FILTER (WHERE is_active = false) as hidden FROM products'
      );
      
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения статистики товаров:', error);
    res.status(500).json({ error: 'Ошибка получения статистики: ' + error.message });
  }
});

// API: Получить товар по ID
app.get('/api/admin/products/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  // Проверяем, что id - это число, а не строка "stats"
  if (isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Неверный ID товара' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          p.*,
          pc.name as category_name,
          pcol.name as color_name,
          sl.value as stem_length_value,
          c.name as country_name,
          v.name as variety_name,
          p.features as features, -- Поле features из таблицы products (TEXT[])
          COALESCE(
            (SELECT json_agg(json_build_object('id', pq.id, 'name', pq.name))
             FROM product_qualities pq
             JOIN product_qualities_map pqm ON pq.id = pqm.quality_id
             WHERE pqm.product_id = p.id),
            '[]'::json
          ) as qualities,
          COALESCE(
            (SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name))
             FROM product_tags pt
             JOIN product_tags_map ptm ON pt.id = ptm.tag_id
             WHERE ptm.product_id = p.id),
            '[]'::json
          ) as tags
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_colors pcol ON p.color_id = pcol.id
        LEFT JOIN stem_lengths sl ON p.stem_length_id = sl.id
        LEFT JOIN countries c ON p.country_id = c.id
        LEFT JOIN varieties v ON p.variety_id = v.id
        WHERE p.id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Товар не найден' });
      }
      
      const product = result.rows[0];
      
      res.json({
        ...product,
        quality_ids: product.qualities ? product.qualities.map(q => q.id) : [],
        tag_ids: product.tags ? product.tags.map(t => t.id) : []
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения товара:', error);
    res.status(500).json({ error: 'Ошибка получения товара' });
  }
});

// API: Удалить товар
app.delete('/api/admin/products/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM products WHERE id = $1', [id]);
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    res.status(500).json({ error: 'Ошибка удаления товара' });
  }
});

// API: Обновить информацию о товаре (refresh)
app.post('/api/admin/products/:id/refresh', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      // Просто обновляем updated_at (можно расширить логику позже)
      const result = await client.query(
        'UPDATE products SET updated_at = now() WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Товар не найден' });
      }
      
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления информации о товаре:', error);
    res.status(500).json({ error: 'Ошибка обновления информации' });
  }
});

// API: Скрыть/показать все товары
app.post('/api/admin/products/toggle-all', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { action } = req.body; // 'hide' или 'show'
  
  try {
    const client = await getDbClient();
    try {
      let result;
      if (action === 'hide') {
        result = await client.query(
          'UPDATE products SET is_active = false WHERE is_active = true RETURNING id'
        );
        console.log(`✅ Скрыто товаров: ${result.rows.length}`);
      } else {
        result = await client.query(
          'UPDATE products SET is_active = true WHERE is_active = false RETURNING id'
        );
        console.log(`✅ Показано товаров: ${result.rows.length}`);
      }
      
      res.json({ 
        success: true, 
        count: result.rows.length,
        action: action,
        message: action === 'hide' 
          ? `Скрыто товаров: ${result.rows.length}`
          : `Показано товаров: ${result.rows.length}`
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Ошибка ${action === 'hide' ? 'скрытия' : 'показа'} всех товаров:`, error);
    res.status(500).json({ error: `Ошибка ${action === 'hide' ? 'скрытия' : 'показа'} товаров: ` + error.message });
  }
});


// API: Обновить заказ
app.put('/api/admin/orders/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) {
    return res.status(400).json({ error: 'Неверный ID заказа' });
  }
  
  const { status, recipient_name, recipient_phone, delivery_date, delivery_time, user_comment, comment, address_json, internal_comment, courier_comment, status_comment, leave_at_door } = req.body;
  
  try {
    const client = await pool.connect();
    try {
      let updateQuery = 'UPDATE orders SET updated_at = now()';
      const params = [];
      let paramIndex = 1;
      
      if (status !== undefined) {
        // Нормализуем статус к единому enum перед сохранением
        const normalizedStatus = normalizeOrderStatus(status);
        const validStatuses = ['UNPAID', 'NEW', 'PROCESSING', 'PURCHASE', 'COLLECTING', 'DELIVERING', 'IN_TRANSIT', 'COMPLETED', 'CANCELED'];
        if (!validStatuses.includes(normalizedStatus)) {
          return res.status(400).json({ error: `Неверный статус: ${status}. Допустимые значения: ${validStatuses.join(', ')}` });
        }
        updateQuery += `, status = $${paramIndex}`;
        params.push(normalizedStatus);
        paramIndex++;
      }
      if (recipient_name !== undefined) {
        updateQuery += `, recipient_name = $${paramIndex}`;
        params.push(recipient_name);
        paramIndex++;
      }
      if (recipient_phone !== undefined) {
        updateQuery += `, recipient_phone = $${paramIndex}`;
        params.push(recipient_phone);
        paramIndex++;
      }
      if (delivery_date !== undefined) {
        updateQuery += `, delivery_date = $${paramIndex}`;
        params.push(delivery_date);
        paramIndex++;
      }
      if (delivery_time !== undefined) {
        updateQuery += `, delivery_time = $${paramIndex}`;
        params.push(delivery_time);
        paramIndex++;
      }
      if (user_comment !== undefined) {
        updateQuery += `, user_comment = $${paramIndex}`;
        params.push(user_comment);
        paramIndex++;
      }
      if (comment !== undefined) {
        // Для обратной совместимости
        updateQuery += `, user_comment = $${paramIndex}`;
        params.push(comment);
        paramIndex++;
      }
      if (internal_comment !== undefined) {
        updateQuery += `, internal_comment = $${paramIndex}`;
        params.push(internal_comment);
        paramIndex++;
      }
      if (courier_comment !== undefined) {
        updateQuery += `, courier_comment = $${paramIndex}`;
        params.push(courier_comment);
        paramIndex++;
      }
      if (leave_at_door !== undefined) {
        updateQuery += `, leave_at_door = $${paramIndex}`;
        params.push(leave_at_door);
        paramIndex++;
      }
      if (status_comment !== undefined) {
        updateQuery += `, status_comment = $${paramIndex}`;
        params.push(status_comment);
        paramIndex++;
      }
      if (address_json !== undefined) {
        const addressJsonStr = typeof address_json === 'object' ? JSON.stringify(address_json) : address_json;
        updateQuery += `, address_json = $${paramIndex}::jsonb`;
        params.push(addressJsonStr);
        paramIndex++;
        
        // Обновляем address_string на основе address_json
        if (typeof address_json === 'object' && address_json !== null) {
          const addressParts = [];
          if (address_json.city) addressParts.push(address_json.city);
          if (address_json.street) addressParts.push(address_json.street);
          if (address_json.house) addressParts.push(`д. ${address_json.house}`);
          if (address_json.apartment) addressParts.push(`кв. ${address_json.apartment}`);
          const addressString = addressParts.join(', ');
          if (addressString) {
            updateQuery += `, address_string = $${paramIndex}`;
            params.push(addressString);
            paramIndex++;
          }
        }
      }
      
      // Получаем старый статус ДО обновления для проверки изменений и уведомлений
      const oldOrderResult = await client.query('SELECT status, bonus_used, bonus_earned, user_id FROM orders WHERE id = $1', [orderId]);
      if (oldOrderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      const oldOrder = oldOrderResult.rows[0];
      const oldStatus = oldOrder.status;
      
      updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
      params.push(orderId);
      
      const result = await client.query(updateQuery, params);
      
      // Записываем в историю статусов, если статус изменился
      if (status !== undefined) {
        const normalizedStatus = normalizeOrderStatus(status);
        if (normalizedStatus !== oldStatus) {
          try {
            await client.query(
              'INSERT INTO order_status_history (order_id, status, source, changed_by_id, comment) VALUES ($1, $2, $3, $4, $5)',
              [orderId, normalizedStatus, 'admin', req.adminUserId || null, status_comment || null]
            );
          } catch (historyError) {
            // Игнорируем ошибку, если таблица не существует
            if (!historyError.message.includes('does not exist')) {
              console.error('Ошибка записи в историю статусов:', historyError);
            }
          }
          
          // Отправляем уведомление пользователю о смене статуса
          await sendOrderStatusNotification(orderId, normalizedStatus, oldStatus, status_comment || null);
          
        }
      }
      
      const order = result.rows[0];
      // Загружаем items
      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [orderId]
      );
      
      // Парсим address_json, если он строка
      let addressData = {};
      if (order.address_json) {
        try {
          addressData = typeof order.address_json === 'string' 
            ? JSON.parse(order.address_json) 
            : order.address_json;
        } catch (e) {
          console.error('Ошибка парсинга address_json:', e);
          addressData = {};
        }
      }
      
      res.json({
        ...order,
        items: itemsResult.rows,
        address_data: addressData
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления заказа:', error);
    res.status(500).json({ error: 'Ошибка обновления заказа' });
  }
});

// API: Обновить список заказов (refresh)
app.post('/api/admin/orders/refresh', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { status } = req.query;
  
  try {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          o.*,
          u.first_name as customer_name,
          u.phone as customer_phone,
          u.email as customer_email,
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity
            )
          ) FILTER (WHERE oi.id IS NOT NULL) as items
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
      `;
      
      const params = [];
      if (status) {
        query += ' WHERE o.status = $1';
        params.push(status);
      }
      
      query += ' GROUP BY o.id, u.id ORDER BY o.created_at DESC';
      
      const result = await client.query(query, params);
      
      const orders = result.rows.map(row => ({
        ...row,
        total: row.total || 0,
        address_data: typeof row.address_json === 'object' ? row.address_json : (row.address_json ? JSON.parse(row.address_json) : {})
      }));
      
      res.json(orders);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// API: Получить склад (остатки товаров с расчетом по движениям)
// Новый endpoint для партийного учёта
app.get('/api/admin/warehouse', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем все товары с категориями и цветами
      const productsResult = await client.query(`
        SELECT 
          p.id,
          p.name,
          p.image_url,
          p.min_order_quantity,
          pc.name as category_name,
          c.name as color_name
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_colors c ON p.color_id = c.id
        WHERE p.is_active = true
        ORDER BY p.name
      `);
      
      // Получаем все движения по складу
      const movementsResult = await client.query(`
        SELECT 
          sm.supply_id,
          sm.product_id,
          sm.type,
          SUM(sm.quantity) as quantity
        FROM stock_movements sm
        WHERE sm.supply_id IS NOT NULL
        GROUP BY sm.supply_id, sm.product_id, sm.type
      `);
      
      // Определяем актуальные поставки: те, у которых есть движение типа SUPPLY
      // Это означает, что поставка была активирована и является актуальной (не удалена, не в архиве)
      const activeSupplyIds = new Set();
      movementsResult.rows.forEach(m => {
        if (m.type === 'SUPPLY') {
          activeSupplyIds.add(m.supply_id);
        }
      });
      
      // Получаем поставки с поставщиками
      // Фильтруем только актуальные: те, у которых есть движение SUPPLY (активированы)
      // Если activeSupplyIds пуст, возвращаем пустой результат (нет актуальных поставок)
      const suppliesResult = activeSupplyIds.size > 0 ? await client.query(`
        SELECT 
          s.id,
          s.product_id,
          s.quantity as initial_quantity,
          s.unit_purchase_price,
          s.delivery_date,
          s.supplier_id,
          s.parent_supply_id,
          sup.name as supplier_name
        FROM supplies s
        LEFT JOIN suppliers sup ON s.supplier_id = sup.id
        WHERE s.product_id IS NOT NULL
        AND s.id = ANY($1::int[])
        ORDER BY s.delivery_date DESC, s.id DESC
      `, [Array.from(activeSupplyIds)]) : { rows: [] };
      
      // Создаём мапу движений по supply_id
      const movementsBySupply = {};
      movementsResult.rows.forEach(m => {
        const key = `${m.supply_id}_${m.type}`;
        if (!movementsBySupply[key]) {
          movementsBySupply[key] = 0;
        }
        movementsBySupply[key] += parseInt(m.quantity || 0);
      });
      
      // Группируем поставки по товарам
      const suppliesByProduct = {};
      suppliesResult.rows.forEach(supply => {
        if (!suppliesByProduct[supply.product_id]) {
          suppliesByProduct[supply.product_id] = [];
        }
        suppliesByProduct[supply.product_id].push(supply);
      });
      
      // Формируем результат
      const warehouseProducts = productsResult.rows.map(product => {
        const supplies = suppliesByProduct[product.id] || [];
        
        // Формируем партии
        const batches = supplies.map(supply => {
          // Используем SUPPLY движения для получения начального количества
          const supplied = movementsBySupply[`${supply.id}_SUPPLY`] || supply.initial_quantity;
          const sold = movementsBySupply[`${supply.id}_SALE`] || 0;
          const writeOff = movementsBySupply[`${supply.id}_WRITE_OFF`] || 0;
          const remaining = Math.max(0, supplied - sold - writeOff); // Не допускаем отрицательные остатки
          
          // Используем parent_supply_id если есть, иначе id (для старых записей)
          const displaySupplyId = supply.parent_supply_id || supply.id;
          
          return {
            id: supply.id.toString(),
            supplyId: displaySupplyId.toString(), // ID основной поставки для отображения
            batchNumber: `#${supply.id}`,
            deliveryDate: supply.delivery_date,
            initialQuantity: supply.initial_quantity,
            sold: sold,
            writeOff: writeOff,
            remaining: remaining,
            purchasePrice: parseFloat(supply.unit_purchase_price),
            supplier: supply.supplier_name || 'Не указан'
          };
        });
        
        // Считаем общий остаток
        const totalRemaining = batches.reduce((sum, batch) => sum + batch.remaining, 0);
        
        return {
          id: product.id.toString(),
          productId: product.id.toString(),
          productName: product.name,
          category: product.category_name || 'Без категории',
          color: product.color_name || 'Без цвета',
          image: product.image_url || '',
          minOrderQuantity: product.min_order_quantity || null, // Не используем значение по умолчанию, чтобы фронтенд мог правильно рассчитать доступные заказы
          totalRemaining: totalRemaining,
          batches: batches
        };
      }).filter(product => product.batches.length > 0); // Показываем только товары с поставками
      
      res.json(warehouseProducts);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения данных склада:', error);
    res.status(500).json({ error: 'Ошибка получения данных склада' });
  }
});

// API: Получить все поставки с товарами
app.get('/api/admin/supplies', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем все поставки (новой структуры - с total_amount)
      const suppliesResult = await client.query(`
        SELECT 
          s.id,
          s.delivery_date,
          s.total_amount,
          s.delivery_price,
          s.comment,
          s.supplier_id,
          sup.name as supplier_name
        FROM supplies s
        LEFT JOIN suppliers sup ON s.supplier_id = sup.id
        WHERE s.total_amount IS NOT NULL
        ORDER BY s.delivery_date DESC, s.id DESC
      `);
      
      // Получаем все товары в поставках
      const itemsResult = await client.query(`
        SELECT 
          si.id,
          si.supply_id,
          si.product_id,
          si.batch_count,
          si.pieces_per_batch,
          si.batch_price,
          si.unit_price,
          si.total_pieces,
          p.name as product_name
        FROM supply_items si
        LEFT JOIN products p ON si.product_id = p.id
        ORDER BY si.supply_id, si.id
      `);
      
      // Получаем движения по складу для расчета продано/списано/остаток
      // Для товаров в поставке нужно суммировать все движения по этому товару из всех партий этой поставки
      const movementsResult = await client.query(`
        SELECT 
          sm.supply_id,
          sm.product_id,
          sm.type,
          SUM(sm.quantity) as quantity
        FROM stock_movements sm
        WHERE sm.supply_id IS NOT NULL
        GROUP BY sm.supply_id, sm.product_id, sm.type
      `);
      
      // Получаем все поставки (партии) для товаров из supply_items
      // Находим только те supplies, у которых parent_supply_id соответствует поставке
      const supplyItemsSuppliesResult = await client.query(`
        SELECT 
          s.id as supply_id,
          s.product_id,
          s.parent_supply_id
        FROM supplies s
        WHERE s.parent_supply_id IS NOT NULL
        AND s.parent_supply_id IN (SELECT id FROM supplies WHERE total_amount IS NOT NULL)
      `);
      
      // Создаём мапу: parent_supply_id -> product_id -> [supply_ids]
      const suppliesByParentAndProduct = {};
      supplyItemsSuppliesResult.rows.forEach(row => {
        const key = `${row.parent_supply_id}_${row.product_id}`;
        if (!suppliesByParentAndProduct[key]) {
          suppliesByParentAndProduct[key] = [];
        }
        suppliesByParentAndProduct[key].push(row.supply_id);
      });
      
      // Создаём мапу движений по supply_id и product_id
      const movementsBySupplyProduct = {};
      movementsResult.rows.forEach(m => {
        const key = `${m.supply_id}_${m.product_id}_${m.type}`;
        movementsBySupplyProduct[key] = parseInt(m.quantity || 0);
      });
      
      // Группируем товары по поставкам
      const itemsBySupply = {};
      itemsResult.rows.forEach(item => {
        if (!itemsBySupply[item.supply_id]) {
          itemsBySupply[item.supply_id] = [];
        }
        
        // Находим все поставки (партии) для этого товара из ЭТОЙ конкретной поставки
        // Используем только партии с parent_supply_id = item.supply_id
        const relatedSupplyIds = suppliesByParentAndProduct[`${item.supply_id}_${item.product_id}`] || [];
        
        // Суммируем продано и списано только по партиям ЭТОЙ поставки
        let sold = 0;
        let writeOff = 0;
        
        relatedSupplyIds.forEach(supplyId => {
          sold += movementsBySupplyProduct[`${supplyId}_${item.product_id}_SALE`] || 0;
          writeOff += movementsBySupplyProduct[`${supplyId}_${item.product_id}_WRITE_OFF`] || 0;
        });
        
        const remaining = item.total_pieces - sold - writeOff;
        const totalPrice = item.total_pieces * item.unit_price;
        
        itemsBySupply[item.supply_id].push({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name || 'Неизвестный товар',
          batchCount: item.batch_count,
          piecesPerBatch: item.pieces_per_batch,
          batchPrice: parseFloat(item.batch_price),
          unitPrice: parseFloat(item.unit_price),
          totalPieces: item.total_pieces,
          sold: sold,
          writeOff: writeOff,
          remaining: remaining,
          totalPrice: totalPrice
        });
      });
      
      // Формируем результат
      const supplies = suppliesResult.rows.map(supply => ({
        id: supply.id,
        deliveryDate: supply.delivery_date,
        supplierName: supply.supplier_name || 'Не указан',
        totalAmount: parseFloat(supply.total_amount) || 0,
        deliveryPrice: parseFloat(supply.delivery_price) || 0,
        comment: supply.comment,
        items: itemsBySupply[supply.id] || []
      }));
      
      res.json(supplies);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения поставок:', error);
    res.status(500).json({ error: 'Ошибка получения поставок' });
  }
});

// API: Получить поставку по ID
app.get('/api/admin/warehouse/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT s.*, p.name as product_name
         FROM supplies s
         JOIN products p ON s.product_id = p.id
         WHERE s.id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Поставка не найдена' });
      }
      
      // Рассчитываем доступный остаток для этой поставки
      const stockResult = await client.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' AND sm.supply_id = $1 THEN sm.quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' AND sm.supply_id = $1 THEN sm.quantity ELSE 0 END), 0) as available
        FROM stock_movements sm
        WHERE sm.supply_id = $1`,
        [id]
      );
      
      const supply = result.rows[0];
      supply.available_quantity = parseInt(stockResult.rows[0]?.available || supply.quantity);
      
      res.json(supply);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения поставки:', error);
    res.status(500).json({ error: 'Ошибка получения поставки' });
  }
});

// API: Обновить поставку (с возможностью списания)
app.put('/api/admin/warehouse/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { product_id, quantity, purchase_price, delivery_date, comment, write_off_qty } = req.body;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем существование поставки
      const supplyResult = await client.query('SELECT * FROM supplies WHERE id = $1', [id]);
      if (supplyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Поставка не найдена' });
      }
      
      const currentSupply = supplyResult.rows[0];
      
      // Обновляем поля поставки, если переданы
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (product_id !== undefined) {
        updates.push(`product_id = $${paramIndex}`);
        params.push(product_id);
        paramIndex++;
      }
      if (quantity !== undefined) {
        updates.push(`quantity = $${paramIndex}`);
        params.push(quantity);
        paramIndex++;
      }
      if (purchase_price !== undefined) {
        const purchasePriceFloat = parseFloat(purchase_price);
        if (isNaN(purchasePriceFloat) || purchasePriceFloat <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Цена закупки должна быть числом больше 0' });
        }
        // Округляем до 2 знаков после запятой для DECIMAL(10,2)
        const purchasePriceRounded = Math.round(purchasePriceFloat * 100) / 100;
        updates.push(`unit_purchase_price = $${paramIndex}`);
        params.push(purchasePriceRounded);
        paramIndex++;
      }
      if (delivery_date !== undefined) {
        updates.push(`delivery_date = $${paramIndex}`);
        params.push(delivery_date);
        paramIndex++;
      }
      if (comment !== undefined) {
        updates.push(`comment = $${paramIndex}`);
        params.push(comment);
        paramIndex++;
      }
      
      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        await client.query(
          `UPDATE supplies SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          [...params, id]
        );
      }
      
      // Обработка списания
      if (write_off_qty !== undefined && write_off_qty > 0) {
        const writeOffQtyInt = parseInt(write_off_qty);
        
        if (!Number.isInteger(writeOffQtyInt) || writeOffQtyInt <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Количество списания должно быть целым числом больше 0' });
        }
        
        // Рассчитываем доступный остаток для этой поставки
        const stockResult = await client.query(
          `SELECT 
            COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' AND sm.supply_id = $1 THEN sm.quantity ELSE 0 END), 0) - 
            COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' AND sm.supply_id = $1 THEN sm.quantity ELSE 0 END), 0) as available
          FROM stock_movements sm
          WHERE sm.supply_id = $1`,
          [id]
        );
        
        const available = parseInt(stockResult.rows[0]?.available || currentSupply.quantity);
        
        if (writeOffQtyInt > available) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: `Недостаточно товара для списания. Доступно: ${available}, запрошено: ${writeOffQtyInt}` 
          });
        }
        
        // Создаем движение типа WRITE_OFF
        await client.query(
          `INSERT INTO stock_movements (product_id, type, quantity, supply_id, comment)
           VALUES ($1, 'WRITE_OFF', $2, $3, $4)`,
          [currentSupply.product_id, writeOffQtyInt, id, comment || `Списание по поставке #${id}`]
        );
      }
      
      await client.query('COMMIT');
      
      // Возвращаем обновленную поставку
      const updatedResult = await client.query(
        `SELECT s.*, p.name as product_name
         FROM supplies s
         JOIN products p ON s.product_id = p.id
         WHERE s.id = $1`,
        [id]
      );
      
      res.json(updatedResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления поставки:', error);
    res.status(500).json({ error: 'Ошибка обновления поставки: ' + error.message });
  }
});

// API: Получить остатки по складу (детальная статистика)
app.get('/api/admin/warehouse/stock', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          p.id as product_id,
          p.name as product_name,
          p.image_url,
          p.price_per_stem,
          COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) as total_supplied,
          COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as total_sold,
          COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as total_written_off,
          COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as stock,
          CASE 
            WHEN COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) - 
                 COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
                 COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) <= 0 THEN 'out_of_stock'
            ELSE 'sufficient'
          END as status
        FROM products p
        LEFT JOIN stock_movements sm ON p.id = sm.product_id
        WHERE p.is_active = true
          AND (
            EXISTS (SELECT 1 FROM stock_movements sm2 WHERE sm2.product_id = p.id)
            OR EXISTS (SELECT 1 FROM supplies s WHERE s.product_id = p.id)
          )
        GROUP BY p.id, p.name, p.image_url, p.price_per_stem
        ORDER BY p.name`
      );
      
      console.log(`📦 Получено товаров со склада: ${result.rows.length}`);
      if (result.rows.length > 0) {
        console.log('📦 Пример товара:', {
          id: result.rows[0].product_id,
          name: result.rows[0].product_name,
          stock: result.rows[0].stock,
          total_supplied: result.rows[0].total_supplied
        });
      }
      
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения остатков:', error);
    console.error('Детали ошибки:', error.message, error.stack);
    res.status(500).json({ error: 'Ошибка получения остатков: ' + error.message });
  }
});

// API: Добавить поставку
// Создание новой поставки с множественными товарами (партийный учёт)
app.post('/api/admin/supplies', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  // Новая структура: множественные товары через items
  const { deliveryDate, supplierId, totalAmount, deliveryPrice, comment, items } = req.body;
  
  // Обратная совместимость со старой структурой
  const delivery_date = deliveryDate || req.body.delivery_date;
  let supplier_id = supplierId || req.body.supplier_id;
  const total_amount = totalAmount !== undefined ? parseFloat(totalAmount) : null;
  const delivery_price = deliveryPrice !== undefined ? parseFloat(deliveryPrice) : 0;
  const supply_comment = comment || req.body.comment || null;
  
  // Если используется старая структура (один товар)
  if (!items && req.body.productId) {
    const { productId, quantity, purchasePrice, supplier } = req.body;
    const product_id = productId || req.body.product_id;
    const purchase_price = purchasePrice || req.body.purchase_price;
    
    if (!product_id || !quantity || !purchase_price || !delivery_date) {
      return res.status(400).json({ error: 'Товар, количество, цена закупки и дата поставки обязательны' });
    }
    
    // Валидация
    const quantityInt = parseInt(quantity);
    const purchasePriceFloat = parseFloat(purchase_price);
    
    if (!Number.isInteger(quantityInt) || quantityInt <= 0) {
      return res.status(400).json({ error: 'Количество должно быть целым числом больше 0' });
    }
    
    if (isNaN(purchasePriceFloat) || purchasePriceFloat <= 0) {
      return res.status(400).json({ error: 'Цена закупки должна быть числом больше 0' });
    }
    
    const purchasePriceRounded = Math.round(purchasePriceFloat * 100) / 100;
    
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Проверяем существование товара
        const productResult = await client.query(
          'SELECT id FROM products WHERE id = $1',
          [product_id]
        );
        
        if (productResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Товар не найден' });
        }
        
        // Если supplier передан как строка (имя), создаём или находим поставщика
        if (supplier && typeof supplier === 'string' && !supplier_id) {
          const existingSupplier = await client.query(
            'SELECT id FROM suppliers WHERE name = $1',
            [supplier]
          );
          
          if (existingSupplier.rows.length > 0) {
            supplier_id = existingSupplier.rows[0].id;
          } else {
            const newSupplierResult = await client.query(
              'INSERT INTO suppliers (name) VALUES ($1) RETURNING id',
              [supplier]
            );
            supplier_id = newSupplierResult.rows[0].id;
          }
        }
        
        // Создаем поставку (старая структура - без total_amount, delivery_price, comment)
        const supplyResult = await client.query(
          `INSERT INTO supplies (product_id, quantity, unit_purchase_price, delivery_date, supplier_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [product_id, quantityInt, purchasePriceRounded, delivery_date, supplier_id]
        );
        
        const supply = supplyResult.rows[0];
        
        // Создаем движение типа SUPPLY
        await client.query(
          `INSERT INTO stock_movements (product_id, type, quantity, supply_id, comment)
           VALUES ($1, 'SUPPLY', $2, $3, $4)`,
          [product_id, quantityInt, supply.id, supply_comment]
        );
        
        await client.query('COMMIT');
        
        console.log(`✅ Поставка создана (старая структура): ID=${supply.id}, товар=${product_id}, количество=${quantityInt}`);
        
        res.json({ success: true, supply: supplyResult.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка создания поставки:', error);
        res.status(500).json({ error: error.message || 'Ошибка создания поставки' });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Ошибка подключения к БД:', error);
      res.status(500).json({ error: 'Ошибка подключения к базе данных' });
    }
    return;
  }
  
  // Новая структура: множественные товары
  if (!delivery_date || !supplier_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Дата поставки, поставщик и хотя бы один товар обязательны' });
  }
  
  // Валидация товаров
  for (const item of items) {
    const { productId, batchCount, piecesPerBatch, batchPrice, unitPrice, totalPieces } = item;
    
    if (!productId || !batchCount || !piecesPerBatch || !batchPrice) {
      return res.status(400).json({ error: 'Все поля товара обязательны: productId, batchCount, piecesPerBatch, batchPrice' });
    }
    
    const batchCountInt = parseInt(batchCount);
    const piecesPerBatchInt = parseInt(piecesPerBatch);
    const batchPriceFloat = parseFloat(batchPrice);
    const unitPriceFloat = unitPrice !== undefined ? parseFloat(unitPrice) : (batchPriceFloat / piecesPerBatchInt);
    const totalPiecesInt = totalPieces !== undefined ? parseInt(totalPieces) : (batchCountInt * piecesPerBatchInt);
    
    if (!Number.isInteger(batchCountInt) || batchCountInt <= 0) {
      return res.status(400).json({ error: 'Количество банчей должно быть целым числом больше 0' });
    }
    
    if (!Number.isInteger(piecesPerBatchInt) || piecesPerBatchInt <= 0) {
      return res.status(400).json({ error: 'Количество штук в банче должно быть целым числом больше 0' });
    }
    
    if (isNaN(batchPriceFloat) || batchPriceFloat <= 0) {
      return res.status(400).json({ error: 'Цена банча должна быть числом больше 0' });
    }
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем существование поставщика
      const supplierResult = await client.query(
        'SELECT id FROM suppliers WHERE id = $1',
        [supplier_id]
      );
      
      if (supplierResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Поставщик не найден' });
      }
      
      // Используем введенную пользователем общую сумму, если указана, иначе вычисляем автоматически
      const finalTotalAmount = total_amount !== null && total_amount !== undefined ? total_amount : items.reduce((sum, item) => {
        const batchCount = parseInt(item.batchCount);
        const batchPrice = parseFloat(item.batchPrice);
        return sum + (batchCount * batchPrice);
      }, 0);
      
      // Создаем поставку (без product_id и quantity - они теперь в supply_items)
      const supplyResult = await client.query(
        `INSERT INTO supplies (delivery_date, supplier_id, total_amount, delivery_price, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [delivery_date, supplier_id, finalTotalAmount, delivery_price || 0, supply_comment]
      );
      
      const supply = supplyResult.rows[0];
      
      // Создаем товары в поставке и движения по складу
      for (const item of items) {
        const { productId, batchCount, piecesPerBatch, batchPrice, unitPrice, totalPieces } = item;
        
        // Проверяем существование товара
        const productResult = await client.query(
          'SELECT id FROM products WHERE id = $1',
          [productId]
        );
        
        if (productResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Товар с ID ${productId} не найден` });
        }
        
        const batchCountInt = parseInt(batchCount);
        const piecesPerBatchInt = parseInt(piecesPerBatch);
        const batchPriceFloat = parseFloat(batchPrice);
        const unitPriceFloat = unitPrice !== undefined ? parseFloat(unitPrice) : (batchPriceFloat / piecesPerBatchInt);
        const totalPiecesInt = totalPieces !== undefined ? parseInt(totalPieces) : (batchCountInt * piecesPerBatchInt);
        
        // Создаем запись товара в поставке
        await client.query(
          `INSERT INTO supply_items (supply_id, product_id, batch_count, pieces_per_batch, batch_price, unit_price, total_pieces)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [supply.id, productId, batchCountInt, piecesPerBatchInt, batchPriceFloat, unitPriceFloat, totalPiecesInt]
        );
        
        // Создаем ОДНУ запись в supplies для товара с общим количеством (не для каждого банча)
        // Связываем с основной поставкой через parent_supply_id
        const supplyItemResult = await client.query(
          `INSERT INTO supplies (product_id, quantity, unit_purchase_price, delivery_date, supplier_id, parent_supply_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [productId, totalPiecesInt, unitPriceFloat, delivery_date, supplier_id, supply.id]
        );
        
        const supplyItem = supplyItemResult.rows[0];
        
        // Создаем движение типа SUPPLY с общим количеством
        await client.query(
          `INSERT INTO stock_movements (product_id, type, quantity, supply_id, comment)
           VALUES ($1, 'SUPPLY', $2, $3, $4)`,
          [productId, totalPiecesInt, supplyItem.id, supply_comment]
        );
      }
      
      await client.query('COMMIT');
      
      console.log(`✅ Поставка создана (новая структура): ID=${supply.id}, товаров=${items.length}`);
      
      res.json({ success: true, supply: supplyResult.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка создания поставки:', error);
      res.status(500).json({ error: error.message || 'Ошибка создания поставки' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    res.status(500).json({ error: 'Ошибка подключения к базе данных' });
  }
});

// Удаление поставки (партии)
app.delete('/api/admin/supplies/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем существование поставки
      const supplyResult = await client.query(
        'SELECT id, product_id FROM supplies WHERE id = $1',
        [id]
      );
      
      if (supplyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Поставка не найдена' });
      }
      
      // Проверяем, есть ли движения по этой поставке (кроме SUPPLY, который создается автоматически)
      // Разрешаем удаление только если есть только движение SUPPLY (т.е. поставка только что создана)
      const movementsResult = await client.query(
        `SELECT type, COUNT(*) as count 
         FROM stock_movements 
         WHERE supply_id = $1
         GROUP BY type`,
        [id]
      );
      
      // Проверяем, есть ли движения типа SALE или WRITE_OFF
      const hasSalesOrWriteOffs = movementsResult.rows.some(
        row => row.type === 'SALE' || row.type === 'WRITE_OFF'
      );
      
      if (hasSalesOrWriteOffs) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Невозможно удалить поставку, так как по ней уже есть движения (продажи или списания)' 
        });
      }
      
      // Удаляем все движения по этой поставке (включая SUPPLY, SALE, WRITE_OFF)
      // Важно: удаляем движения ПЕРЕД удалением поставки, чтобы не было каскадных проблем
      await client.query('DELETE FROM stock_movements WHERE supply_id = $1', [id]);
      
      // Удаляем поставку
      await client.query('DELETE FROM supplies WHERE id = $1', [id]);
      
      await client.query('COMMIT');
      
      console.log(`✅ Поставка удалена: ID=${id}`);
      res.json({ success: true, message: 'Поставка успешно удалена' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка удаления поставки:', error);
      res.status(500).json({ error: error.message || 'Ошибка удаления поставки' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    res.status(500).json({ error: 'Ошибка подключения к базе данных' });
  }
});

// Исправление отрицательных остатков
app.post('/api/admin/warehouse/fix-negative-stock', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Находим все товары с отрицательными остатками
      const productsResult = await client.query(`
        SELECT DISTINCT product_id 
        FROM stock_movements 
        WHERE product_id IS NOT NULL
      `);
      
      let fixedCount = 0;
      
      for (const row of productsResult.rows) {
        const productId = row.product_id;
        
        // Считаем общие движения
        const movementsResult = await client.query(
          `SELECT 
            COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE 0 END), 0) as supplied,
            COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) as sold,
            COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' THEN quantity ELSE 0 END), 0) as written_off
          FROM stock_movements
          WHERE product_id = $1`,
          [productId]
        );
        
        let supplied = parseInt(movementsResult.rows[0]?.supplied || 0);
        const sold = parseInt(movementsResult.rows[0]?.sold || 0);
        let writtenOff = parseInt(movementsResult.rows[0]?.written_off || 0);
        
        // Если нет SUPPLY движений, используем supplies.quantity
        if (supplied === 0) {
          const suppliesResult = await client.query(
            'SELECT COALESCE(SUM(quantity), 0) as total FROM supplies WHERE product_id = $1',
            [productId]
          );
          supplied = parseInt(suppliesResult.rows[0]?.total || 0);
        }
        
        const currentStock = supplied - sold - writtenOff;
        
        // Если остаток отрицательный, удаляем лишние WRITE_OFF движения
        if (currentStock < 0) {
          const excessWriteOff = Math.abs(currentStock);
          
          // Удаляем избыточные WRITE_OFF движения (самые последние, без привязки к поставкам)
          await client.query(
            `DELETE FROM stock_movements
             WHERE id IN (
               SELECT id
               FROM stock_movements
               WHERE product_id = $1
                 AND type = 'WRITE_OFF'
                 AND supply_id IS NULL
               ORDER BY created_at DESC
               LIMIT $2
             )`,
            [productId, excessWriteOff]
          );
          
          fixedCount++;
          console.log(`✅ Исправлен отрицательный остаток для товара ID=${productId}, удалено ${excessWriteOff} лишних списаний`);
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: `Исправлено ${fixedCount} товаров с отрицательными остатками`,
        fixed: fixedCount
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка исправления остатков:', error);
      res.status(500).json({ error: error.message || 'Ошибка исправления остатков' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    res.status(500).json({ error: 'Ошибка подключения к базе данных' });
  }
});

// Удаление всех данных по гортензиям
app.post('/api/admin/warehouse/delete-hydrangeas', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Находим все ID гортензий
      const productsResult = await client.query(
        `SELECT id FROM products 
         WHERE LOWER(name) LIKE '%гортензия%' OR LOWER(name) LIKE '%hydrangea%'`
      );
      
      if (productsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json({ success: true, message: 'Гортензии не найдены', deleted: 0 });
      }
      
      const hydrangeaIds = productsResult.rows.map(row => row.id);
      
      // Удаляем движения по складу
      await client.query(
        'DELETE FROM stock_movements WHERE product_id = ANY($1)',
        [hydrangeaIds]
      );
      
      // Удаляем товары из заказов
      await client.query(
        'DELETE FROM order_items WHERE product_id = ANY($1)',
        [hydrangeaIds]
      );
      
      // Удаляем товары из supply_items
      await client.query(
        'DELETE FROM supply_items WHERE product_id = ANY($1)',
        [hydrangeaIds]
      );
      
      // Удаляем поставки
      await client.query(
        'DELETE FROM supplies WHERE product_id = ANY($1)',
        [hydrangeaIds]
      );
      
      // Удаляем сами товары
      await client.query(
        'DELETE FROM products WHERE id = ANY($1)',
        [hydrangeaIds]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ Удалены гортензии: ${hydrangeaIds.length} товаров`);
      res.json({ 
        success: true, 
        message: `Успешно удалено ${hydrangeaIds.length} гортензий и все связанные данные`,
        deleted: hydrangeaIds.length
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка удаления гортензий:', error);
      res.status(500).json({ error: error.message || 'Ошибка удаления гортензий' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    res.status(500).json({ error: 'Ошибка подключения к базе данных' });
  }
});

// Очистка всех поставок и активных заказов (для тестирования)
app.post('/api/admin/warehouse/clear-all', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Удаляем все движения по складу
      await client.query('DELETE FROM stock_movements');
      
      // Удаляем все позиции заказов
      await client.query('DELETE FROM order_items');
      
      // Удаляем историю статусов заказов
      await client.query('DELETE FROM order_status_history');
      
      // Удаляем транзакции бонусов, связанные с заказами
      await client.query('DELETE FROM bonus_transactions WHERE order_id IS NOT NULL');
      
      // Удаляем все заказы
      await client.query('DELETE FROM orders');
      
      // Удаляем все поставки
      await client.query('DELETE FROM supplies');
      
      await client.query('COMMIT');
      
      // Проверка
      const suppliesResult = await client.query('SELECT COUNT(*) as count FROM supplies');
      const ordersResult = await client.query('SELECT COUNT(*) as count FROM orders');
      const movementsResult = await client.query('SELECT COUNT(*) as count FROM stock_movements');
      
      res.json({ 
        success: true, 
        message: 'Все поставки и заказы успешно удалены',
        stats: {
          supplies: parseInt(suppliesResult.rows[0]?.count || 0),
          orders: parseInt(ordersResult.rows[0]?.count || 0),
          movements: parseInt(movementsResult.rows[0]?.count || 0)
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка очистки базы:', error);
      res.status(500).json({ error: error.message || 'Ошибка очистки базы данных' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    res.status(500).json({ error: 'Ошибка подключения к базе данных' });
  }
});

// Списание товара со склада (партийный учёт)
app.post('/api/admin/stock-movements/write-off', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { productId, supplyId, quantity, comment } = req.body;
  
  if (!productId || !supplyId || !quantity) {
    return res.status(400).json({ error: 'Товар, партия и количество обязательны' });
  }
  
  const quantityInt = parseInt(quantity);
  if (!Number.isInteger(quantityInt) || quantityInt <= 0) {
    return res.status(400).json({ error: 'Количество должно быть целым числом больше 0' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем поставку
      const supplyResult = await client.query(
        'SELECT id, product_id, quantity FROM supplies WHERE id = $1',
        [supplyId]
      );
      
      if (supplyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Поставка не найдена' });
      }
      
      const supply = supplyResult.rows[0];
      
      if (parseInt(supply.product_id) !== parseInt(productId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Товар не соответствует поставке' });
      }
      
      // Считаем доступный остаток для этой партии
      // Используем SUPPLY движения для получения начального количества
      const supplyMovementsResult = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) as supplied
         FROM stock_movements
         WHERE supply_id = $1 AND type = 'SUPPLY'`,
        [supplyId]
      );
      
      const movementsResult = await client.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) as sold,
          COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' THEN quantity ELSE 0 END), 0) as written_off
        FROM stock_movements
        WHERE supply_id = $1`,
        [supplyId]
      );
      
      const supplied = parseInt(supplyMovementsResult.rows[0]?.supplied || supply.quantity);
      const sold = parseInt(movementsResult.rows[0]?.sold || 0);
      const writtenOff = parseInt(movementsResult.rows[0]?.written_off || 0);
      const available = supplied - sold - writtenOff;
      
      if (quantityInt > available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Недостаточно товара для списания. Доступно: ${available}, запрошено: ${quantityInt}` 
        });
      }
      
      // Создаем движение типа WRITE_OFF с привязкой к партии
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, supply_id, comment)
         VALUES ($1, 'WRITE_OFF', $2, $3, $4)`,
        [productId, quantityInt, supplyId, comment || `Списание по партии #${supplyId}`]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ Товар списан: product_id=${productId}, supply_id=${supplyId}, quantity=${quantityInt}`);
      res.json({ success: true, message: 'Товар успешно списан' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка списания товара:', error);
      res.status(500).json({ error: error.message || 'Ошибка списания товара' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка подключения к БД:', error);
    res.status(500).json({ error: 'Ошибка подключения к базе данных' });
  }
});

// API: Получить все заказы (для админки)
app.get('/api/admin/orders', checkAdminAuth, async (req, res) => {
  const { status, dateFrom, dateTo } = req.query; // Опциональные фильтры
  
  try {
    const client = await getDbClient();
    try {
      let query = `
        SELECT 
          o.*,
          u.first_name as customer_name,
          u.phone as customer_phone,
          u.email as customer_email,
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity
            )
          ) FILTER (WHERE oi.id IS NOT NULL) as items
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
      `;
      
      const params = [];
      const conditions = [];
      let paramIndex = 1;
      
      if (status) {
        conditions.push(`o.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }
      
      // Фильтруем по дате доставки (delivery_date) вместо created_at
      if (dateFrom) {
        conditions.push(`DATE(o.delivery_date) >= $${paramIndex}`);
        params.push(dateFrom);
        paramIndex++;
      }
      
      if (dateTo) {
        conditions.push(`DATE(o.delivery_date) <= $${paramIndex}`);
        params.push(dateTo);
        paramIndex++;
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Сортировка: по delivery_date (раньше → выше), затем по delivery_time, затем по created_at
      query += ` GROUP BY o.id, u.id 
                 ORDER BY 
                   COALESCE(o.delivery_date, '9999-12-31'::date) ASC,
                   COALESCE(o.delivery_time::text, '00:00:00') ASC,
                   o.created_at DESC`;
      
      const result = await client.query(query, params);
      
      // Преобразуем address_json из JSONB в объект и исправляем поле total
      // Также вычисляем userOrderNumber из order_number для правильного форматирования
      const orders = result.rows.map(row => {
        // Извлекаем userOrderNumber из order_number (последние 3 цифры)
        let userOrderNumber = null;
        if (row.order_number) {
          const fullOrderNumber = String(row.order_number);
          // Если order_number начинается с user_id, извлекаем часть после user_id
          if (row.user_id) {
            const userIdStr = String(row.user_id);
            if (fullOrderNumber.startsWith(userIdStr)) {
              userOrderNumber = parseInt(fullOrderNumber.slice(userIdStr.length), 10);
            } else {
              // Иначе берем последние 3 цифры
              userOrderNumber = parseInt(fullOrderNumber.slice(-3), 10);
            }
          } else {
            // Если user_id нет, берем последние 3 цифры
            userOrderNumber = parseInt(fullOrderNumber.slice(-3), 10);
          }
        }
        
        return {
          ...row,
          total: row.total || 0, // Используем total вместо total_amount
          address_data: typeof row.address_json === 'object' ? row.address_json : (row.address_json ? JSON.parse(row.address_json) : {}),
          userOrderNumber: userOrderNumber // Добавляем userOrderNumber для форматирования
        };
      });
      
      res.json(orders);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// API: Получить один заказ по ID
app.get('/api/admin/orders/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const orderId = parseInt(id);
  
  if (isNaN(orderId)) {
    return res.status(400).json({ error: 'Неверный ID заказа' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем основной заказ с информацией о клиенте
      const orderResult = await client.query(
        `        SELECT 
          o.*,
          o.client_name,
          o.client_phone,
          o.client_email,
          o.recipient_name,
          o.recipient_phone,
          o.delivery_zone,
          o.user_comment,
          o.internal_comment,
          o.courier_comment,
          o.status_comment,
          u.username as customer_telegram_username,
          u.telegram_id as customer_telegram_id,
          u.first_name as customer_telegram_first_name,
          u.phone as customer_telegram_phone
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = $1`,
        [orderId]
      );
      
      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      const order = orderResult.rows[0];
      
      // Получаем позиции заказа с информацией о продуктах
      const itemsResult = await client.query(
        `SELECT 
          oi.id,
          oi.product_id,
          oi.name,
          oi.price,
          oi.quantity,
          p.image_url as product_image,
          p.price_per_stem
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
        ORDER BY oi.id`,
        [orderId]
      );
      
      // Парсим address_json если он есть
      let addressData = {};
      if (order.address_json) {
        try {
          addressData = typeof order.address_json === 'object' 
            ? order.address_json 
            : JSON.parse(order.address_json);
        } catch (e) {
          console.error('Ошибка парсинга address_json:', e);
        }
      }
      
      // Формируем ответ
      const response = {
        id: order.id,
        status: order.status,
        total: parseFloat(order.total || 0),
        flowers_total: parseFloat(order.flowers_total || 0),
        delivery_price: parseFloat(order.delivery_price || 0),
        service_fee: parseFloat(order.service_fee || 0),
        bonus_earned: parseFloat(order.bonus_earned || 0),
        bonus_used: parseFloat(order.bonus_used || 0),
        created_at: order.created_at,
        updated_at: order.updated_at,
        delivery_date: order.delivery_date,
        delivery_time: order.delivery_time,
        comment: order.comment,
        internal_comment: order.internal_comment || null,
        courier_comment: order.courier_comment || null,
        address_string: order.address_string,
        address_json: addressData,
        address_data: addressData, // Для обратной совместимости
        recipient_name: order.recipient_name,
        recipient_phone: order.recipient_phone,
        // Имя клиента - из профиля Telegram (first_name)
        customer_name: order.customer_telegram_first_name || order.client_name || order.customer_name || '',
        customer_last_name: order.customer_last_name || '',
        // Телефон клиента - из профиля Telegram (только если указан)
        customer_phone: order.customer_telegram_phone || null,
        customer_email: order.client_email || order.customer_email,
        user_comment: order.user_comment || null,
        status_comment: order.status_comment || null,
        leave_at_door: order.leave_at_door || false,
        customer_telegram_username: order.customer_telegram_username,
        customer_telegram_id: order.customer_telegram_id,
        user_id: order.user_id || null, // ID клиента из базы данных
        items: itemsResult.rows.map(row => ({
          id: row.id,
          product_id: row.product_id,
          name: row.name,
          price: parseFloat(row.price || 0),
          quantity: parseInt(row.quantity || 0),
          product_image: row.product_image,
          price_per_stem: row.price_per_stem ? parseFloat(row.price_per_stem) : null
        }))
      };
      
      res.json(response);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения заказа:', error);
    res.status(500).json({ error: 'Ошибка получения заказа: ' + error.message });
  }
});

// API: Обновить статус заказа (расширенный)
app.put('/api/admin/orders/:id/status', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  let { status, comment } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Статус обязателен' });
  }
  
  // Нормализуем статус к единому enum
  status = normalizeOrderStatus(status);
  
  // Валидация: только правильные статусы
  const validStatuses = ['UNPAID', 'NEW', 'PROCESSING', 'PURCHASE', 'COLLECTING', 'DELIVERING', 'IN_TRANSIT', 'COMPLETED', 'CANCELED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Неверный статус. Допустимые значения: ${validStatuses.join(', ')}` });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем старый статус ДО обновления
      const oldOrderResult = await client.query('SELECT status FROM orders WHERE id = $1', [id]);
      if (oldOrderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      const oldStatus = oldOrderResult.rows[0].status;
      
      // Обновляем статус заказа
      const result = await client.query(
        'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [status, id]
      );
      
      // Записываем в историю статусов (если таблица существует)
      if (oldStatus !== status) {
        try {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
            [id, status, 'admin', comment || null]
          );
        } catch (historyError) {
          // Игнорируем ошибку, если таблица не существует
          if (!historyError.message.includes('does not exist')) {
            console.error('Ошибка записи в историю статусов:', historyError);
          }
        }
        
        // Отправляем уведомление пользователю о смене статуса
        await sendOrderStatusNotification(id, status, oldStatus, comment || null);
      }
      
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления статуса заказа:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса заказа' });
  }
});

// API: Назначить курьера на заказ
app.post('/api/admin/orders/:id/assign-courier', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { courier_id } = req.body;
  
  if (!courier_id) {
    return res.status(400).json({ error: 'courier_id обязателен' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Проверяем существование курьера
      const courierCheck = await client.query('SELECT id, is_active FROM couriers WHERE id = $1', [courier_id]);
      if (courierCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Курьер не найден' });
      }
      if (!courierCheck.rows[0].is_active) {
        return res.status(400).json({ error: 'Курьер неактивен' });
      }
      
      // Получаем старый статус ДО обновления
      const oldOrderResult = await client.query('SELECT status FROM orders WHERE id = $1', [id]);
      if (oldOrderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      const oldStatus = oldOrderResult.rows[0].status;
      
      // Назначаем курьера и меняем статус (используем DELIVERING вместо assigned)
      const newStatus = 'DELIVERING';
      const result = await client.query(
        'UPDATE orders SET courier_id = $1, status = $2, updated_at = now() WHERE id = $3 RETURNING *',
        [courier_id, newStatus, id]
      );
      
      // Записываем в историю (если таблица существует)
      if (oldStatus !== newStatus) {
        try {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
            [id, newStatus, 'admin', `Назначен курьер ID: ${courier_id}`]
          );
        } catch (historyError) {
          // Игнорируем ошибку, если таблица не существует
          if (!historyError.message.includes('does not exist')) {
            console.error('Ошибка записи в историю статусов:', historyError);
          }
        }
        
        // Отправляем уведомление пользователю о смене статуса
        await sendOrderStatusNotification(id, newStatus, oldStatus, `Назначен курьер`);
      }
      
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка назначения курьера:', error);
    res.status(500).json({ error: 'Ошибка назначения курьера' });
  }
});

// API: Получить всех курьеров
app.get('/api/admin/couriers', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT c.*, dz.name as zone_name
        FROM couriers c
        LEFT JOIN delivery_zones dz ON c.zone_id = dz.id
        ORDER BY c.created_at DESC
      `);
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения курьеров:', error);
    res.status(500).json({ error: 'Ошибка получения курьеров' });
  }
});

// API: Создать курьера
app.post('/api/admin/couriers', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { name, phone, pin_code, zone_id, is_active } = req.body;
  
  if (!name || !phone || !pin_code) {
    return res.status(400).json({ error: 'Имя, телефон и PIN-код обязательны' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO couriers (name, phone, pin_code, zone_id, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, phone, pin_code, zone_id || null, is_active !== undefined ? is_active : true]
      );
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Курьер с таким телефоном уже существует' });
    }
    console.error('Ошибка создания курьера:', error);
    res.status(500).json({ error: 'Ошибка создания курьера' });
  }
});

// API: Обновить курьера
app.put('/api/admin/couriers/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { name, phone, pin_code, zone_id, is_active } = req.body;
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE couriers 
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             pin_code = COALESCE($3, pin_code),
             zone_id = $4,
             is_active = COALESCE($5, is_active),
             updated_at = now()
         WHERE id = $6
         RETURNING *`,
        [name, phone, pin_code, zone_id, is_active, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Курьер не найден' });
      }
      
      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления курьера:', error);
    res.status(500).json({ error: 'Ошибка обновления курьера' });
  }
});

// API: Удалить курьера
app.delete('/api/admin/couriers/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM couriers WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Курьер не найден' });
      }
      
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка удаления курьера:', error);
    res.status(500).json({ error: 'Ошибка удаления курьера' });
  }
});

// API: Получить зоны доставки
// API: Получить список доставок по дате с статистикой
app.get('/api/admin/delivery', checkAdminAuth, async (req, res) => {
  const { date } = req.query; // Формат: YYYY-MM-DD
  const deliveryDate = date || new Date().toISOString().split('T')[0]; // По умолчанию сегодня
  
  try {
    const client = await getDbClient();
    try {
        // Получаем заказы с доставкой на указанную дату
        // Показываем заказы со статусами DELIVERING (ожидает), IN_TRANSIT (в пути), COMPLETED (доставлено)
      const result = await client.query(
        `SELECT 
          o.id as order_id,
          o.status,
          o.recipient_name,
          o.recipient_phone,
          o.address_string,
          o.delivery_date,
          o.delivery_time,
          o.total,
          STRING_AGG(oi.name || ' x ' || oi.quantity, ', ' ORDER BY oi.id) as items_summary
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.delivery_date = $1
          AND o.status IN ('DELIVERING', 'IN_TRANSIT', 'COMPLETED')
        GROUP BY o.id, o.status, o.recipient_name, o.recipient_phone, o.address_string, 
                 o.delivery_date, o.delivery_time, o.total
        ORDER BY o.delivery_time ASC, o.id ASC`,
        [deliveryDate]
      );
      
      // Подсчитываем статистику
      const stats = {
        total: 0,
        waiting: 0,    // DELIVERING (ожидает доставки)
        inTransit: 0,  // IN_TRANSIT (в пути)
        delivered: 0   // COMPLETED (доставлено)
      };
      
      const deliveries = result.rows.map(row => {
        // Обновляем статистику
        stats.total++;
        if (row.status === 'DELIVERING') {
          stats.waiting++;
        } else if (row.status === 'IN_TRANSIT') {
          stats.inTransit++;
        } else if (row.status === 'COMPLETED') {
          stats.delivered++;
        }
        
        return {
          orderId: parseInt(row.order_id),
          status: row.status,
          recipientName: row.recipient_name || '',
          recipientPhone: row.recipient_phone || '',
          address: row.address_string || '',
          deliveryDate: row.delivery_date,
          deliveryTime: row.delivery_time || '',
          total: parseInt(row.total || 0),
          itemsSummary: row.items_summary || ''
        };
      });
      
      res.json({
        stats,
        deliveries
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения доставок:', error);
    const errorMessage = error.message.includes('timeout') || error.message.includes('недоступна')
      ? 'База данных временно недоступна. Попробуйте позже.'
      : 'Ошибка получения доставок: ' + error.message;
    res.status(500).json({ error: errorMessage });
  }
});

// API: Обновить статус заказа (PATCH для Delivery страницы)
app.patch('/api/admin/orders/:orderId/status', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { orderId } = req.params;
  const { status, comment } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Статус обязателен' });
  }
  
  // Валидация статуса
  const validStatuses = ['PROCESSING', 'DELIVERING', 'IN_TRANSIT', 'COMPLETED', 'CANCELED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Неверный статус' });
  }
  
  const orderIdInt = parseInt(orderId);
  if (isNaN(orderIdInt)) {
    return res.status(400).json({ error: 'Неверный ID заказа' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Получаем старый статус
      const oldOrderResult = await client.query('SELECT status FROM orders WHERE id = $1', [orderIdInt]);
      if (oldOrderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      const oldStatus = oldOrderResult.rows[0].status;
      
      // Обновляем статус заказа
      const result = await client.query(
        'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [status, orderIdInt]
      );
      
      // Записываем в историю статусов, если статус изменился
      if (oldStatus !== status) {
        try {
          await client.query(
            `INSERT INTO order_status_history (order_id, status, source, changed_by_id, comment)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderIdInt, status, 'admin', req.adminUserId || null, comment || null]
          );
        } catch (historyError) {
          // Игнорируем ошибки истории (таблица может не существовать)
          console.log('⚠️  Не удалось создать запись в истории статусов:', historyError.message);
        }
        
        // Отправляем уведомление пользователю о смене статуса
        await sendOrderStatusNotification(orderIdInt, status, oldStatus, comment || null);
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true,
        orderId: orderIdInt,
        status: status
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления статуса заказа:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса заказа: ' + error.message });
  }
});

// API: Обновить статус доставки (старый endpoint для обратной совместимости)
app.put('/api/admin/delivery/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Статус обязателен' });
  }
  
  // Маппинг статусов доставки на статусы заказа
  const statusMap = {
    'pending': 'PROCESSING',
    'in_transit': 'DELIVERING',
    'delivered': 'COMPLETED',
    'cancelled': 'CANCELED'
  };
  
  const orderStatus = statusMap[status] || status;
  
  try {
    const client = await pool.connect();
    try {
      // Получаем старый статус ДО обновления
      const oldOrderResult = await client.query('SELECT status FROM orders WHERE id = $1', [id]);
      if (oldOrderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      const oldStatus = oldOrderResult.rows[0].status;
      
      const result = await client.query(
        'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [orderStatus, id]
      );
      
      // Отправляем уведомление пользователю о смене статуса, если статус изменился
      if (oldStatus !== orderStatus) {
        await sendOrderStatusNotification(id, orderStatus, oldStatus, null);
      }
      
      res.json({ 
        success: true,
        order_id: result.rows[0].id,
        status: result.rows[0].status,
        delivery_status: status
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления статуса доставки:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса доставки' });
  }
});

app.get('/api/admin/delivery/zones', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM delivery_zones ORDER BY price ASC');
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения зон доставки:', error);
    res.status(500).json({ error: 'Ошибка получения зон доставки' });
  }
});

// API: Получить историю статусов заказа
app.get('/api/admin/orders/:id/history', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      // Проверяем существование таблицы
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'order_status_history'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        const result = await client.query(
          'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
          [id]
        );
        console.log(`📋 История статусов для заказа #${id}: найдено ${result.rows.length} записей`);
        
        // Если история пуста, но заказ существует, создаем начальную запись
        if (result.rows.length === 0) {
          const orderCheck = await client.query('SELECT id, status, created_at FROM orders WHERE id = $1', [id]);
          if (orderCheck.rows.length > 0) {
            const order = orderCheck.rows[0];
            try {
              await client.query(
                'INSERT INTO order_status_history (order_id, status, source, comment) VALUES ($1, $2, $3, $4)',
                [order.id, order.status, 'system', 'Заказ создан']
              );
              console.log(`✅ Создана начальная запись в истории для заказа #${id}`);
              // Перезагружаем историю
              const newResult = await client.query(
                'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
                [id]
              );
              res.json(newResult.rows);
            } catch (initError) {
              console.log('⚠️  Не удалось создать начальную запись:', initError.message);
              res.json([]);
            }
          } else {
            res.json([]);
          }
        } else {
          res.json(result.rows);
        }
      } else {
        // Таблица не существует, возвращаем пустой массив
        console.log('⚠️  Таблица order_status_history не существует');
        res.json([]);
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения истории заказа:', error);
    // В случае ошибки возвращаем пустой массив вместо ошибки
    res.json([]);
  }
});

// API: Получить всех клиентов
app.get('/api/admin/customers', checkAdminAuth, async (req, res) => {
  try {
    const client = await getDbClient();
    try {
      const result = await client.query(`
        SELECT 
          u.id,
          COALESCE(u.first_name, '') as name,
          COALESCE(u.phone, '') as phone,
          COALESCE(u.email, '') as email,
          COALESCE(u.bonuses, 0) as bonuses,
          COUNT(DISTINCT o.id) as orders_count,
          COALESCE(SUM(o.total), 0) as total_spent,
          MAX(o.created_at) as last_order_date
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        GROUP BY u.id
        ORDER BY last_order_date DESC NULLS LAST
      `);
      
      // Получаем заказы для каждого клиента
      const customers = await Promise.all(result.rows.map(async (customer) => {
        const ordersResult = await client.query(
          'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
          [customer.id]
        );
        
        return {
          id: customer.id,
          name: customer.name || null,
          phone: customer.phone || null,
          email: customer.email || null,
          bonuses: parseInt(customer.bonuses) || 0, // Используем значение из поля users.bonuses
          ordersCount: parseInt(customer.orders_count) || 0,
          totalSpent: parseInt(customer.total_spent) || 0,
          lastOrderDate: customer.last_order_date || null,
          orders: ordersResult.rows,
          subscription: false // TODO: добавить проверку подписки из таблицы subscriptions
        };
      }));
      
      res.json(customers);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения клиентов:', error);
    const errorMessage = error.message.includes('timeout') || error.message.includes('недоступна')
      ? 'База данных временно недоступна. Попробуйте позже.'
      : 'Ошибка получения клиентов: ' + error.message;
    res.status(500).json({ error: errorMessage });
  }
});

// API: Получить настройки
app.get('/api/admin/settings', checkAdminAuth, async (req, res) => {
  if (!pool) {
    // Возвращаем настройки по умолчанию
    return res.json({
      serviceFee: 450,
      bonusPercent: 1,
      minOrderAmount: 0,
      deliveryEnabled: true,
      notificationsEnabled: true,
    });
  }
  
  try {
    const client = await getDbClient();
    try {
      // Проверяем существование таблицы settings
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'settings'
        )
      `);
      
      if (!tableCheck.rows[0].exists) {
        // Таблица не существует, возвращаем настройки по умолчанию
        return res.json({
          serviceFee: 450,
          bonusPercent: 1,
          minOrderAmount: 0,
          deliveryEnabled: true,
          notificationsEnabled: true,
        });
      }
      
      const result = await client.query('SELECT * FROM settings LIMIT 1');
      if (result.rows.length > 0) {
        res.json(result.rows[0]);
      } else {
        res.json({
          serviceFee: 450,
          bonusPercent: 1,
          minOrderAmount: 0,
          deliveryEnabled: true,
          notificationsEnabled: true,
        });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения настроек:', error);
    // Возвращаем настройки по умолчанию при ошибке
    res.json({
      serviceFee: 450,
      bonusPercent: 1,
      minOrderAmount: 0,
      deliveryEnabled: true,
      notificationsEnabled: true,
    });
  }
});

// API: Сохранить настройки
app.post('/api/admin/settings', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { serviceFee, bonusPercent, minOrderAmount, deliveryEnabled, notificationsEnabled } = req.body;
  
  try {
    const client = await pool.connect();
    try {
      // Проверяем существование таблицы settings
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'settings'
        )
      `);
      
      if (!tableCheck.rows[0].exists) {
        // Создаем таблицу settings если её нет
        await client.query(`
          CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            service_fee INTEGER DEFAULT 450,
            bonus_percent DECIMAL(5,2) DEFAULT 1,
            min_order_amount INTEGER DEFAULT 0,
            delivery_enabled BOOLEAN DEFAULT true,
            notifications_enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
      }
      
      // Обновляем или создаем настройки
      const existing = await client.query('SELECT id FROM settings LIMIT 1');
      if (existing.rows.length > 0) {
        await client.query(`
          UPDATE settings 
          SET service_fee = $1,
              bonus_percent = $2,
              min_order_amount = $3,
              delivery_enabled = $4,
              notifications_enabled = $5,
              updated_at = NOW()
          WHERE id = $6
        `, [
          serviceFee || 450,
          bonusPercent || 1,
          minOrderAmount || 0,
          deliveryEnabled !== undefined ? deliveryEnabled : true,
          notificationsEnabled !== undefined ? notificationsEnabled : true,
          existing.rows[0].id
        ]);
      } else {
        await client.query(`
          INSERT INTO settings (service_fee, bonus_percent, min_order_amount, delivery_enabled, notifications_enabled)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          serviceFee || 450,
          bonusPercent || 1,
          minOrderAmount || 0,
          deliveryEnabled !== undefined ? deliveryEnabled : true,
          notificationsEnabled !== undefined ? notificationsEnabled : true,
        ]);
      }
      
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

// API: Аналитика
app.get('/api/admin/analytics', checkAdminAuth, async (req, res) => {
  const { period = 'week', dateFrom: customDateFrom, dateTo: customDateTo } = req.query;
  
  try {
    const client = await getDbClient();
    try {
      // Определяем период
      let dateFrom = new Date();
      let dateTo = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateTo.setHours(23, 59, 59, 999);
      
      if (period === 'custom' && customDateFrom && customDateTo) {
        dateFrom = new Date(customDateFrom);
        dateFrom.setHours(0, 0, 0, 0);
        dateTo = new Date(customDateTo);
        dateTo.setHours(23, 59, 59, 999);
      } else {
        switch (period) {
          case 'week':
            dateFrom = new Date(today);
            dateFrom.setDate(dateFrom.getDate() - 7);
            break;
          case '2weeks':
            dateFrom = new Date(today);
            dateFrom.setDate(dateFrom.getDate() - 14);
            break;
          case 'month':
            dateFrom = new Date(today);
            dateFrom.setMonth(dateFrom.getMonth() - 1);
            break;
          case '3months':
            dateFrom = new Date(today);
            dateFrom.setMonth(dateFrom.getMonth() - 3);
            break;
          case 'year':
            dateFrom = new Date(today);
            dateFrom.setFullYear(dateFrom.getFullYear() - 1);
            break;
          default:
            dateFrom = new Date(today);
            dateFrom.setDate(dateFrom.getDate() - 7);
        }
      }
      
      // Основные метрики
      const metricsResult = await client.query(
        `SELECT 
          COUNT(*) FILTER (WHERE o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')) as total_orders,
          COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')), 0) as total_revenue,
          COUNT(DISTINCT o.user_id) FILTER (WHERE o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')) as unique_customers
        FROM orders o
        WHERE o.created_at >= $1 AND o.created_at <= $2
          AND o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')`,
        [dateFrom, dateTo]
      );
      
      // Считаем новых пользователей за период (по дате регистрации)
      const newUsersResult = await client.query(
        `SELECT COUNT(*) as new_users_count
        FROM users
        WHERE (registered_at >= $1 AND registered_at <= $2)
           OR (registered_at IS NULL AND created_at >= $1 AND created_at <= $2)`,
        [dateFrom, dateTo]
      );
      
      const metrics = metricsResult.rows[0];
      const newUsersCount = parseInt(newUsersResult.rows[0]?.new_users_count || 0);
      const avgCheck = metrics.total_orders > 0 ? Math.round(metrics.total_revenue / metrics.total_orders) : 0;
      
      // Заказы по датам
      const ordersByDateResult = await client.query(
        `SELECT 
          DATE(o.created_at) as date,
          COUNT(*) as orders_count,
          COALESCE(SUM(o.total), 0) as revenue
        FROM orders o
        WHERE o.created_at >= $1 AND o.created_at <= $2
          AND o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')
        GROUP BY DATE(o.created_at)
        ORDER BY date DESC`,
        [dateFrom, dateTo]
      );
      
      // Топ товаров
      const topProductsResult = await client.query(
        `SELECT 
          oi.product_id,
          oi.name as product_name,
          SUM(oi.quantity) as total_sold,
          SUM(oi.price * oi.quantity) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= $1 AND o.created_at <= $2
          AND o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')
        GROUP BY oi.product_id, oi.name
        ORDER BY total_sold DESC
        LIMIT 10`,
        [dateFrom, dateTo]
      );
      
      res.json({
        period,
        dateFrom: dateFrom.toISOString(),
        metrics: {
          totalRevenue: parseInt(metrics.total_revenue || 0),
          totalOrders: parseInt(metrics.total_orders || 0),
          avgCheck,
          uniqueCustomers: newUsersCount // Новые пользователи за период по дате регистрации
        },
        ordersByDate: ordersByDateResult.rows.map(row => ({
          date: row.date,
          ordersCount: parseInt(row.orders_count),
          revenue: parseInt(row.revenue)
        })),
        topProducts: topProductsResult.rows.map(row => ({
          productId: row.product_id,
          productName: row.product_name,
          totalSold: parseInt(row.total_sold),
          revenue: parseInt(row.revenue)
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения аналитики:', error);
    const errorMessage = error.message.includes('timeout') || error.message.includes('недоступна')
      ? 'База данных временно недоступна. Попробуйте позже.'
      : 'Ошибка получения аналитики: ' + error.message;
    res.status(500).json({ error: errorMessage });
  }
});

// API: Получить клиента по telegram_id
app.get('/api/admin/customers/telegram/:telegramId', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { telegramId } = req.params;
  // Приводим telegramId к числу для работы с BIGINT
  const telegramIdNum = parseInt(telegramId, 10);
  
  if (isNaN(telegramIdNum)) {
    return res.status(400).json({ error: 'Неверный telegram_id' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем данные клиента по telegram_id
      const userResult = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1::bigint',
        [telegramIdNum]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Клиент не найден' });
      }
      
      const user = userResult.rows[0];
      const userId = user.id;
      
      // Получаем статистику по заказам
      const ordersStatsResult = await client.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status != 'CANCELED') as orders_count,
          COALESCE(SUM(total) FILTER (WHERE status != 'CANCELED'), 0) as total_spent,
          MAX(created_at) FILTER (WHERE status != 'CANCELED') as last_order_date
        FROM orders
        WHERE user_id = $1`,
        [userId]
      );
      
      const stats = ordersStatsResult.rows[0];
      const avgCheck = stats.orders_count > 0 ? Math.round(stats.total_spent / stats.orders_count) : 0;
      
      // Получаем начальную транзакцию бонусов (500)
      const initialBonusResult = await client.query(
        `SELECT id, amount, created_at, description
         FROM bonus_transactions
         WHERE user_id = $1 
         AND type = 'accrual'
         AND (description LIKE '%Начальные бонусы при регистрации%' OR (amount = 500 AND description IS NULL))
         ORDER BY created_at ASC
         LIMIT 1`,
        [userId]
      );
      const initialBonusTransaction = initialBonusResult.rows[0] || null;

      // Получаем историю заказов
      const ordersResult = await client.query(
        `SELECT 
          o.id,
          o.status,
          o.total,
          o.bonus_earned,
          o.bonus_used,
          o.created_at,
          json_agg(
            json_build_object(
              'id', oi.id,
              'name', oi.name,
              'quantity', oi.quantity,
              'price', oi.price
            )
          ) FILTER (WHERE oi.id IS NOT NULL) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
        GROUP BY o.id, o.status, o.total, o.bonus_earned, o.bonus_used, o.created_at
        ORDER BY o.created_at DESC`,
        [userId]
      );
      
      // Получаем адреса
      const addressesResult = await client.query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      
      res.json({
        ...user,
        stats: {
          ordersCount: parseInt(stats.orders_count || 0),
          totalSpent: parseInt(stats.total_spent || 0),
          avgCheck,
          lastOrderDate: stats.last_order_date
        },
        orders: ordersResult.rows,
        addresses: addressesResult.rows,
        initialBonusTransaction: initialBonusTransaction
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения клиента:', error);
    res.status(500).json({ error: 'Ошибка получения клиента: ' + error.message });
  }
});

// API: Получить клиента по ID
app.get('/api/admin/customers/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const userId = parseInt(id);
  
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Неверный ID клиента' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем данные клиента
      const userResult = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Клиент не найден' });
      }
      
      const user = userResult.rows[0];
      
      // Получаем статистику по заказам
      const ordersStatsResult = await client.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status != 'CANCELED') as orders_count,
          COALESCE(SUM(total) FILTER (WHERE status != 'CANCELED'), 0) as total_spent,
          MAX(created_at) FILTER (WHERE status != 'CANCELED') as last_order_date
        FROM orders
        WHERE user_id = $1`,
        [userId]
      );
      
      const stats = ordersStatsResult.rows[0];
      const avgCheck = stats.orders_count > 0 ? Math.round(stats.total_spent / stats.orders_count) : 0;
      
      // Получаем начальную транзакцию бонусов (500)
      const initialBonusResult = await client.query(
        `SELECT id, amount, created_at, description
         FROM bonus_transactions
         WHERE user_id = $1 
         AND type = 'accrual'
         AND (description LIKE '%Начальные бонусы при регистрации%' OR (amount = 500 AND description IS NULL))
         ORDER BY created_at ASC
         LIMIT 1`,
        [userId]
      );
      const initialBonusTransaction = initialBonusResult.rows[0] || null;

      // Получаем историю заказов
      const ordersResult = await client.query(
        `SELECT 
          o.id,
          o.status,
          o.total,
          o.bonus_earned,
          o.bonus_used,
          o.created_at,
          json_agg(
            json_build_object(
              'id', oi.id,
              'name', oi.name,
              'quantity', oi.quantity,
              'price', oi.price
            )
          ) FILTER (WHERE oi.id IS NOT NULL) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
        GROUP BY o.id, o.status, o.total, o.bonus_earned, o.bonus_used, o.created_at
        ORDER BY o.created_at DESC`,
        [userId]
      );
      
      // Получаем адреса
      const addressesResult = await client.query(
        'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      
      res.json({
        ...user,
        stats: {
          ordersCount: parseInt(stats.orders_count || 0),
          totalSpent: parseInt(stats.total_spent || 0),
          avgCheck,
          lastOrderDate: stats.last_order_date
        },
        orders: ordersResult.rows,
        addresses: addressesResult.rows,
        initialBonusTransaction: initialBonusTransaction
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения клиента:', error);
    res.status(500).json({ error: 'Ошибка получения клиента: ' + error.message });
  }
});

// API: Обновить бонусы клиента по telegram_id
app.put('/api/admin/customers/telegram/:telegramId/bonuses', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { telegramId } = req.params;
  const { amount, description } = req.body;
  
  // Приводим telegramId к числу для работы с BIGINT
  const telegramIdNum = parseInt(telegramId, 10);
  
  if (isNaN(telegramIdNum) || amount === undefined) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Находим пользователя по telegram_id
      const userResult = await client.query(
        'SELECT id FROM users WHERE telegram_id = $1::bigint',
        [telegramIdNum]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Клиент не найден' });
      }
      
      const userId = userResult.rows[0].id;
      
      await client.query('BEGIN');
      
      // Обновляем бонусы
      await client.query(
        'UPDATE users SET bonuses = bonuses + $1 WHERE id = $2',
        [amount, userId]
      );
      
      // Создаем транзакцию
      await client.query(
        `INSERT INTO bonus_transactions (user_id, type, amount, description)
         VALUES ($1, 'adjustment', $2, $3)`,
        [userId, amount, description || `Корректировка бонусов администратором`]
      );
      
      await client.query('COMMIT');
      
      // Получаем обновленные данные
      const updatedUserResult = await client.query('SELECT bonuses FROM users WHERE id = $1', [userId]);
      res.json({ success: true, bonuses: updatedUserResult.rows[0].bonuses });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления бонусов:', error);
    res.status(500).json({ error: 'Ошибка обновления бонусов: ' + error.message });
  }
});

// API: Обновить бонусы клиента
app.put('/api/admin/customers/:id/bonuses', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const userId = parseInt(id);
  const { amount, description } = req.body;
  
  if (isNaN(userId) || amount === undefined) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Обновляем бонусы
      await client.query(
        'UPDATE users SET bonuses = bonuses + $1 WHERE id = $2',
        [amount, userId]
      );
      
      // Создаем транзакцию
      await client.query(
        `INSERT INTO bonus_transactions (user_id, type, amount, description)
         VALUES ($1, 'adjustment', $2, $3)`,
        [userId, amount, description || `Корректировка бонусов администратором`]
      );
      
      await client.query('COMMIT');
      
      // Получаем обновленные данные
      const userResult = await client.query('SELECT bonuses FROM users WHERE id = $1', [userId]);
      res.json({ success: true, bonuses: userResult.rows[0].bonuses });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления бонусов:', error);
    res.status(500).json({ error: 'Ошибка обновления бонусов: ' + error.message });
  }
});

// API: Пересчитать бонусы по telegram_id
app.post('/api/admin/customers/telegram/:telegramId/recalculate-bonuses', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { telegramId } = req.params;
  
  // Приводим telegramId к числу для работы с BIGINT
  const telegramIdNum = parseInt(telegramId, 10);
  
  if (isNaN(telegramIdNum)) {
    return res.status(400).json({ error: 'Неверный telegram_id' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Находим пользователя по telegram_id
      const userResult = await client.query(
        'SELECT id FROM users WHERE telegram_id = $1::bigint',
        [telegramIdNum]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Клиент не найден' });
      }
      
      const userId = userResult.rows[0].id;
      
      await client.query('BEGIN');
      
      // Получаем все транзакции бонусов (исключая транзакции пересчета)
      const transactionsResult = await client.query(
        `SELECT type, amount, description FROM bonus_transactions 
         WHERE user_id = $1 
         AND (description IS NULL OR description NOT LIKE '%Пересчет бонусов%')`,
        [userId]
      );
      
      // Суммируем все транзакции
      let totalBalance = 0;
      transactionsResult.rows.forEach(transaction => {
        const amount = parseFloat(transaction.amount || 0);
        totalBalance += amount;
      });
      
      // Обновляем баланс в users (кэш)
      await client.query(
        'UPDATE users SET bonuses = $1 WHERE id = $2',
        [totalBalance, userId]
      );
      
      await client.query('COMMIT');
      
      // Получаем обновленный баланс
      const updatedUserResult = await client.query('SELECT bonuses FROM users WHERE id = $1', [userId]);
      const finalBalance = parseFloat(updatedUserResult.rows[0].bonuses || 0);
      
      res.json({ success: true, bonuses: finalBalance });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка пересчета бонусов:', error);
    res.status(500).json({ error: 'Ошибка пересчета бонусов: ' + error.message });
  }
});

// API: Пересчитать бонусы на основе истории заказов и транзакций
app.post('/api/admin/customers/:id/recalculate-bonuses', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const userId = parseInt(id);
  
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Неверный ID пользователя' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Получаем все транзакции бонусов (исключая транзакции пересчета, чтобы избежать двойного учета)
      const transactionsResult = await client.query(
        `SELECT type, amount, description FROM bonus_transactions 
         WHERE user_id = $1 
         AND (description IS NULL OR description NOT LIKE '%Пересчет бонусов%')`,
        [userId]
      );
      
      // Получаем все заказы пользователя (для информации)
      const ordersResult = await client.query(
        'SELECT bonus_earned, bonus_used FROM orders WHERE user_id = $1',
        [userId]
      );
      
      // Получаем текущий баланс из users
      const currentUserResult = await client.query('SELECT bonuses FROM users WHERE id = $1', [userId]);
      const currentBalance = parseFloat(currentUserResult.rows[0]?.bonuses || 0);
      
      // Суммируем все транзакции
      let totalBalance = 0;
      let totalEarned = 0;
      let totalUsed = 0;
      let totalAdjustments = 0;
      let initialBonus = 0;
      
      transactionsResult.rows.forEach(transaction => {
        const amount = parseFloat(transaction.amount || 0);
        totalBalance += amount;
        
        if (transaction.type === 'accrual') {
          totalEarned += amount;
          // Проверяем, является ли это начальными бонусами (по описанию или по сумме 500)
          const description = transaction.description || '';
          if (description.includes('Начальные бонусы при регистрации') || (amount === 500 && initialBonus === 0)) {
            initialBonus = amount;
          }
        } else if (transaction.type === 'redeem') {
          totalUsed += Math.abs(amount);
        } else if (transaction.type === 'adjustment') {
          // Корректировки менеджера учитываем как есть
          totalAdjustments += amount;
        }
      });
      
      // Также суммируем из заказов для информации
      let ordersEarned = 0;
      let ordersUsed = 0;
      ordersResult.rows.forEach(order => {
        ordersEarned += parseFloat(order.bonus_earned || 0);
        ordersUsed += parseFloat(order.bonus_used || 0);
      });
      
      // Обновляем баланс в users (кэш) из рассчитанного баланса транзакций
      // НЕ создаем транзакцию пересчета, чтобы избежать бесконечного роста при повторных пересчетах
      await client.query(
        'UPDATE users SET bonuses = $1 WHERE id = $2',
        [totalBalance, userId]
      );
      
      await client.query('COMMIT');
      
      // Получаем обновленный баланс
      const userResult = await client.query('SELECT bonuses FROM users WHERE id = $1', [userId]);
      const finalBalance = parseFloat(userResult.rows[0].bonuses || 0);
      
      res.json({ 
        success: true, 
        bonuses: finalBalance,
        totalEarned: totalEarned,
        totalUsed: totalUsed,
        totalAdjustments: totalAdjustments,
        initialBonus: initialBonus,
        ordersEarned: ordersEarned,
        ordersUsed: ordersUsed,
        calculatedBalance: totalBalance,
        previousBalance: currentBalance
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка пересчета бонусов:', error);
    res.status(500).json({ error: 'Ошибка пересчета бонусов: ' + error.message });
  }
});

// API: Обновить комментарий менеджера по telegram_id
app.put('/api/admin/customers/telegram/:telegramId/manager-comment', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { telegramId } = req.params;
  const { comment, manager_comment } = req.body;
  const commentText = comment || manager_comment || null;
  
  // Приводим telegramId к числу для работы с BIGINT
  const telegramIdNum = parseInt(telegramId, 10);
  
  if (isNaN(telegramIdNum)) {
    return res.status(400).json({ error: 'Неверный telegram_id' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Находим пользователя по telegram_id
      const userResult = await client.query(
        'SELECT id FROM users WHERE telegram_id = $1::bigint',
        [telegramIdNum]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Клиент не найден' });
      }
      
      const userId = userResult.rows[0].id;
      
      await client.query(
        'UPDATE users SET manager_comment = $1 WHERE id = $2',
        [commentText || null, userId]
      );
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления комментария:', error);
    res.status(500).json({ error: 'Ошибка обновления комментария: ' + error.message });
  }
});

// API: Обновить комментарий менеджера
app.put('/api/admin/customers/:id/manager-comment', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const userId = parseInt(id);
  const { comment, manager_comment } = req.body;
  const commentText = comment || manager_comment || null;
  
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Неверный ID клиента' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE users SET manager_comment = $1 WHERE id = $2',
        [commentText || null, userId]
      );
      res.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка обновления комментария:', error);
    res.status(500).json({ error: 'Ошибка обновления комментария: ' + error.message });
  }
});

// Запуск Express сервера
const server = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📱 MiniApp доступен по адресу: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}`);
  console.log(`🔐 Админка доступна по адресу: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}/admin`);
});

// Для Render.com и других платформ
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Команда /start
// Настройка постоянного меню (Reply Keyboard)
const setupReplyKeyboard = () => {
  const keyboard = {
    keyboard: [
      [
        {
          text: '💬 Поддержка'
        }
      ],
      [
        {
          text: '📱 QR пополнение депозита'
        }
      ]
    ],
    resize_keyboard: true,
    persistent: true // Постоянное меню
  };
  
  return keyboard;
};

// ID чата поддержки (должен быть форум-чатом с включенными Topics)
// Получить ID: добавь бота в группу, отправь любое сообщение, в логах будет ctx.chat.id
// Валидация и приведение SUPPORT_CHAT_ID к числу
const SUPPORT_CHAT_ID_RAW = process.env.SUPPORT_CHAT_ID;
const SUPPORT_CHAT_ID = SUPPORT_CHAT_ID_RAW ? Number(String(SUPPORT_CHAT_ID_RAW).trim()) : null;

// Валидация и приведение ORDERS_GROUP_ID и ORDERS_TOPIC_ID к числу
const ORDERS_GROUP_ID_RAW = process.env.ORDERS_GROUP_ID;
const ORDERS_GROUP_ID = ORDERS_GROUP_ID_RAW ? Number(String(ORDERS_GROUP_ID_RAW).trim()) : null;

const ORDERS_TOPIC_ID_RAW = process.env.ORDERS_TOPIC_ID;
const ORDERS_TOPIC_ID = ORDERS_TOPIC_ID_RAW ? Number(String(ORDERS_TOPIC_ID_RAW).trim()) : null;

if (ORDERS_GROUP_ID_RAW) {
  console.log(`🔍 ORDERS_GROUP_ID (raw): "${ORDERS_GROUP_ID_RAW}" (type: ${typeof ORDERS_GROUP_ID_RAW})`);
  console.log(`🔍 ORDERS_GROUP_ID (parsed): ${ORDERS_GROUP_ID} (type: ${typeof ORDERS_GROUP_ID})`);
  
  if (isNaN(ORDERS_GROUP_ID)) {
    console.error('❌ ORDERS_GROUP_ID не является валидным числом!');
  }
}

if (ORDERS_TOPIC_ID_RAW) {
  console.log(`🔍 ORDERS_TOPIC_ID (raw): "${ORDERS_TOPIC_ID_RAW}" (type: ${typeof ORDERS_TOPIC_ID_RAW})`);
  console.log(`🔍 ORDERS_TOPIC_ID (parsed): ${ORDERS_TOPIC_ID} (type: ${typeof ORDERS_TOPIC_ID})`);
  
  if (isNaN(ORDERS_TOPIC_ID)) {
    console.error('❌ ORDERS_TOPIC_ID не является валидным числом!');
  }
}

if (ORDERS_GROUP_ID && ORDERS_TOPIC_ID) {
  console.log(`✅ Группа заказов настроена: ${ORDERS_GROUP_ID}, тема: ${ORDERS_TOPIC_ID}`);
  console.log('💡 Убедитесь, что:');
  console.log('   1. Группа является форумом (Topics включены)');
  console.log('   2. Бот имеет права администратора');
  console.log('   3. У бота есть права "Manage Topics" и "Send messages"');
  console.log('   4. Тема "Заказы" создана в группе');
} else {
  console.log('⚠️  ORDERS_GROUP_ID или ORDERS_TOPIC_ID не установлены. Уведомления о заказах не будут отправляться в группу.');
  console.log('💡 Для настройки:');
  console.log('   1. Создай супергруппу в Telegram');
  console.log('   2. Включи режим "Topics" (Форум) в настройках чата');
  console.log('   3. Создай тему "Заказы"');
  console.log('   4. Добавь туда бота и дай ему права администратора с "Manage Topics"');
  console.log('   5. Отправь любое сообщение в тему "Заказы"');
  console.log('   6. В логах найди chat.id (будет отрицательное число) и message_thread_id (ID темы)');
  console.log('   7. Добавь ORDERS_GROUP_ID=<chat_id> и ORDERS_TOPIC_ID=<topic_id> в переменные окружения');
}

if (SUPPORT_CHAT_ID_RAW) {
  console.log(`🔍 SUPPORT_CHAT_ID (raw): "${SUPPORT_CHAT_ID_RAW}" (type: ${typeof SUPPORT_CHAT_ID_RAW})`);
  console.log(`🔍 SUPPORT_CHAT_ID (parsed): ${SUPPORT_CHAT_ID} (type: ${typeof SUPPORT_CHAT_ID})`);
  
  if (isNaN(SUPPORT_CHAT_ID)) {
    console.error('❌ SUPPORT_CHAT_ID не является валидным числом!');
  }
}

if (SUPPORT_CHAT_ID) {
  console.log(`✅ Чат поддержки настроен: ${SUPPORT_CHAT_ID}`);
  console.log('💡 Убедитесь, что:');
  console.log('   1. Чат является форумом (Topics включены)');
  console.log('   2. Бот имеет права администратора');
  console.log('   3. У бота есть права "Manage Topics" и "Send messages"');
} else {
  console.log('⚠️  SUPPORT_CHAT_ID не установлен. Система поддержки будет недоступна.');
  console.log('💡 Для настройки:');
  console.log('   1. Создай супергруппу в Telegram');
  console.log('   2. Включи режим "Topics" (Форум) в настройках чата');
  console.log('   3. Добавь туда бота и дай ему права администратора с "Manage Topics"');
  console.log('   4. Отправь любое сообщение в группу');
  console.log('   5. В логах найди chat.id (будет отрицательное число)');
  console.log('   6. Добавь SUPPORT_CHAT_ID=<chat_id> в переменные окружения');
}

// Функция для получения или создания форум-топика для пользователя
async function getOrCreateSupportTopic(userId, userName, username, forceCreate = false) {
  if (!pool || !SUPPORT_CHAT_ID) {
    return null;
  }
  
  try {
    const client = await pool.connect();
    try {
      // Если forceCreate = true, пропускаем проверку существующего топика
      if (!forceCreate) {
        // Проверяем, есть ли уже топик для этого пользователя
        // Сначала проверяем, какие колонки есть в таблице
        const columnsCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'support_topics' AND column_name IN ('message_thread_id', 'topic_name')
        `);
        const availableColumns = columnsCheck.rows.map(r => r.column_name);
        
        let selectColumns = ['message_thread_id'];
        if (availableColumns.includes('topic_name')) {
          selectColumns.push('topic_name');
        }
        
        const existingTopic = await client.query(
          `SELECT ${selectColumns.join(', ')} FROM support_topics WHERE user_id = $1::bigint`,
          [userId]
        );
        
        if (existingTopic.rows.length > 0) {
          console.log(`[support] Найден существующий топик для пользователя ${userId}: ${existingTopic.rows[0].message_thread_id}`);
          return existingTopic.rows[0].message_thread_id;
        }
      } else {
        console.log(`[support] Принудительное создание нового топика для пользователя ${userId}`);
      }
      
      // Создаем новый топик
      console.log(`[support] Создаем новый топик для пользователя ${userId}`);
      // Убираем "@" из начала username, если он там есть, чтобы избежать двойного "@@"
      const cleanUsername = username ? (username.startsWith('@') ? username.substring(1) : username) : null;
      const safeUsername = cleanUsername ? `@${cleanUsername}` : (userName || 'клиент');
      const topicName = `Обращение ${safeUsername} (${userId})`;
      
      if (!SUPPORT_CHAT_ID || isNaN(SUPPORT_CHAT_ID)) {
        throw new Error(`SUPPORT_CHAT_ID не валиден: ${SUPPORT_CHAT_ID}`);
      }
      
      const topic = await bot.telegram.callApi('createForumTopic', {
        chat_id: SUPPORT_CHAT_ID,
        name: topicName
      });
      
      const messageThreadId = topic.message_thread_id;
      console.log(`[support] ✅ Создан топик ${messageThreadId} для пользователя ${userId}`);
      
      // Сохраняем топик в БД
      // Проверяем, какие колонки доступны
      const columnsCheckSave = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'support_topics' AND column_name IN ('message_thread_id', 'topic_name', 'updated_at')
      `);
      const availableColumnsSave = columnsCheckSave.rows.map(r => r.column_name);
      const hasTopicNameColumn = availableColumnsSave.includes('topic_name');
      const hasUpdatedAtColumn = availableColumnsSave.includes('updated_at');
      
      // Сохраняем связь в БД
      // ВАЖНО: PostgreSQL не поддерживает два ON CONFLICT в одном INSERT
      // Используем стратегию: сначала пытаемся INSERT с ON CONFLICT по user_id,
      // затем отдельным запросом обрабатываем конфликт по message_thread_id
      
      // Шаг 1: Пытаемся вставить/обновить по user_id
      try {
        if (hasTopicNameColumn && hasUpdatedAtColumn) {
          await client.query(
            `INSERT INTO support_topics (user_id, message_thread_id, topic_name, updated_at)
             VALUES ($1::bigint, $2::integer, $3::text, now())
             ON CONFLICT (user_id) DO UPDATE SET
               message_thread_id = EXCLUDED.message_thread_id,
               topic_name = EXCLUDED.topic_name,
               updated_at = now()`,
            [userId, messageThreadId, topicName]
          );
          console.log(`[support] ✅ Связь сохранена через INSERT ON CONFLICT (user_id) - user_id=${userId}, thread_id=${messageThreadId}`);
        } else if (hasUpdatedAtColumn) {
          await client.query(
            `INSERT INTO support_topics (user_id, message_thread_id, updated_at)
             VALUES ($1::bigint, $2::integer, now())
             ON CONFLICT (user_id) DO UPDATE SET
               message_thread_id = EXCLUDED.message_thread_id,
               updated_at = now()`,
            [userId, messageThreadId]
          );
          console.log(`[support] ✅ Связь сохранена через INSERT ON CONFLICT (user_id) - user_id=${userId}, thread_id=${messageThreadId}`);
        } else if (hasTopicNameColumn) {
          await client.query(
            `INSERT INTO support_topics (user_id, message_thread_id, topic_name)
             VALUES ($1::bigint, $2::integer, $3::text)
             ON CONFLICT (user_id) DO UPDATE SET
               message_thread_id = EXCLUDED.message_thread_id,
               topic_name = EXCLUDED.topic_name`,
            [userId, messageThreadId, topicName]
          );
          console.log(`[support] ✅ Связь сохранена через INSERT ON CONFLICT (user_id) - user_id=${userId}, thread_id=${messageThreadId}`);
        } else {
          await client.query(
            `INSERT INTO support_topics (user_id, message_thread_id)
             VALUES ($1::bigint, $2::integer)
             ON CONFLICT (user_id) DO UPDATE SET
               message_thread_id = EXCLUDED.message_thread_id`,
            [userId, messageThreadId]
          );
          console.log(`[support] ✅ Связь сохранена через INSERT ON CONFLICT (user_id) - user_id=${userId}, thread_id=${messageThreadId}`);
        }
      } catch (insertError) {
        console.error(`[support] ❌ Ошибка при INSERT по user_id:`, insertError.message);
      }
      
      // Шаг 2: Отдельно обрабатываем случай, когда message_thread_id уже существует (конфликт по другому UNIQUE)
      // Это может быть, если топик был создан ранее, но без связи с user_id
      try {
        // Сначала проверяем, существует ли запись с таким message_thread_id
        const existingByThread = await client.query(
          'SELECT user_id FROM support_topics WHERE message_thread_id = $1::integer',
          [messageThreadId]
        );
        
        if (existingByThread.rows.length > 0) {
          const existingUserId = existingByThread.rows[0].user_id;
          if (existingUserId !== userId) {
            // Обновляем существующую запись
            if (hasTopicNameColumn && hasUpdatedAtColumn) {
              await client.query(
                `UPDATE support_topics 
                 SET user_id = $1::bigint, topic_name = $3::text, updated_at = now()
                 WHERE message_thread_id = $2::integer`,
                [userId, messageThreadId, topicName]
              );
            } else if (hasUpdatedAtColumn) {
              await client.query(
                `UPDATE support_topics 
                 SET user_id = $1::bigint, updated_at = now()
                 WHERE message_thread_id = $2::integer`,
                [userId, messageThreadId]
              );
            } else if (hasTopicNameColumn) {
              await client.query(
                `UPDATE support_topics 
                 SET user_id = $1::bigint, topic_name = $3::text
                 WHERE message_thread_id = $2::integer`,
                [userId, messageThreadId, topicName]
              );
            } else {
              await client.query(
                `UPDATE support_topics 
                 SET user_id = $1::bigint
                 WHERE message_thread_id = $2::integer`,
                [userId, messageThreadId]
              );
            }
            console.log(`[support] ✅ Обновлена связь через UPDATE по message_thread_id - user_id=${userId}, thread_id=${messageThreadId}`);
          }
        } else {
          // Если записи нет, пытаемся вставить еще раз (на случай, если первый INSERT не сработал из-за конфликта по message_thread_id)
          // Используем INSERT с ON CONFLICT по message_thread_id
          try {
            if (hasTopicNameColumn && hasUpdatedAtColumn) {
              await client.query(
                `INSERT INTO support_topics (user_id, message_thread_id, topic_name, updated_at)
                 VALUES ($1::bigint, $2::integer, $3::text, now())
                 ON CONFLICT (message_thread_id) DO UPDATE SET
                   user_id = EXCLUDED.user_id,
                   topic_name = EXCLUDED.topic_name,
                   updated_at = now()`,
                [userId, messageThreadId, topicName]
              );
            } else if (hasUpdatedAtColumn) {
              await client.query(
                `INSERT INTO support_topics (user_id, message_thread_id, updated_at)
                 VALUES ($1::bigint, $2::integer, now())
                 ON CONFLICT (message_thread_id) DO UPDATE SET
                   user_id = EXCLUDED.user_id,
                   updated_at = now()`,
                [userId, messageThreadId]
              );
            } else if (hasTopicNameColumn) {
              await client.query(
                `INSERT INTO support_topics (user_id, message_thread_id, topic_name)
                 VALUES ($1::bigint, $2::integer, $3::text)
                 ON CONFLICT (message_thread_id) DO UPDATE SET
                   user_id = EXCLUDED.user_id,
                   topic_name = EXCLUDED.topic_name`,
                [userId, messageThreadId, topicName]
              );
            } else {
              await client.query(
                `INSERT INTO support_topics (user_id, message_thread_id)
                 VALUES ($1::bigint, $2::integer)
                 ON CONFLICT (message_thread_id) DO UPDATE SET
                   user_id = EXCLUDED.user_id`,
                [userId, messageThreadId]
              );
            }
            console.log(`[support] ✅ Связь сохранена через INSERT ON CONFLICT (message_thread_id) - user_id=${userId}, thread_id=${messageThreadId}`);
          } catch (insertThreadError) {
            console.error(`[support] ❌ Ошибка при INSERT по message_thread_id:`, insertThreadError.message);
          }
        }
      } catch (updateError) {
        console.error(`[support] ❌ Ошибка при UPDATE по message_thread_id:`, updateError.message);
      }
      
      // Финальная проверка: убеждаемся, что связь сохранена
      const verifyResult = await client.query(
        'SELECT user_id FROM support_topics WHERE message_thread_id = $1::integer',
        [messageThreadId]
      );
      
      if (verifyResult.rows.length > 0 && verifyResult.rows[0].user_id === userId) {
        console.log(`[support] ✅ Подтверждено: связь user_id=${userId} ↔ thread_id=${messageThreadId} сохранена в БД`);
      } else {
        console.error(`[support] ❌ ВНИМАНИЕ: связь НЕ сохранена! Проверка показала:`, verifyResult.rows);
      }
      
      
      console.log(`[support] ✅ Топик создан: ${messageThreadId} для пользователя ${userId}`);
      return messageThreadId;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Ошибка создания/получения топика:', error);
    // Если ошибка связана с тем, что чат не форум, выводим понятное сообщение
    if (error.description && error.description.includes('FORUM')) {
      console.error('⚠️  ВАЖНО: Чат поддержки должен быть форумом с включенными Topics!');
      console.error('   Проверьте настройки чата: Профиль чата → Edit → Topics → Enable');
    }
    if (error.description && error.description.includes('ADMIN')) {
      console.error('⚠️  ВАЖНО: Бот должен быть администратором с правами "Manage Topics"!');
    }
    return null;
  }
}

// Функция для получения userId по message_thread_id
async function getUserIdByThreadId(messageThreadId) {
  if (!pool) {
    return null;
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT user_id FROM support_topics WHERE message_thread_id = $1::integer',
        [messageThreadId]
      );
      return result.rows.length > 0 ? result.rows[0].user_id : null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения userId по message_thread_id:', error);
    return null;
  }
}

bot.command('start', async (ctx) => {
  const webAppUrl = process.env.WEBAPP_URL || `http://localhost:${PORT}`;
  const startParam = ctx.message?.text?.split(' ')[1]; // Параметр после /start
  
  // Если передан параметр support, вызываем поддержку
  if (startParam === 'support') {
    await handleSupportRequest(ctx);
    return;
  }
  
  // Если передан параметр PRODUCT_<id>, отправляем информацию о товаре
  if (startParam && startParam.startsWith('PRODUCT_')) {
    const productId = startParam.replace('PRODUCT_', '');
    await handleProductShare(ctx, productId);
    return;
  }
  
  // Используем Direct Link для обеих кнопок, так как web_app не всегда открывает в fullscreen
  // Direct Link с параметром mode=fullscreen гарантирует корректную работу fullscreen
  const directLinkUrl = 'https://t.me/FlowboxBot/flowbox_app?startapp=main&mode=fullscreen';
  
  ctx.reply(
    '🌸 Добро пожаловать в FlowBox!\n\nВыберите действие:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🛍️ Открыть магазин',
              url: directLinkUrl  // Используем Direct Link вместо web_app для гарантированного fullscreen
            }
          ]
        ]
      }
    }
  );
  
  // Примечание: Кнопка web_app не всегда открывает Mini App в fullscreen режиме
  // Поэтому используем Direct Link с параметром mode=fullscreen для обеих кнопок
  // Direct Link гарантирует корректную работу fullscreen
  
  // Устанавливаем постоянное меню после команды /start
  ctx.reply(
    'Используйте меню ниже для навигации:',
    {
      reply_markup: setupReplyKeyboard()
    }
  );
});

// Обработка шаринга товара
const handleProductShare = async (ctx, productId) => {
  if (!pool) {
    await ctx.reply('❌ База данных недоступна. Попробуйте позже.');
    return;
  }
  
  const webAppUrl = process.env.WEBAPP_URL || `http://localhost:${PORT}`;
  
  try {
    const client = await pool.connect();
    try {
      // Получаем товар из БД со всеми изображениями
      const productResult = await client.query(
        'SELECT id, name, price, price_per_stem, min_order_quantity, min_stem_quantity, image_url, image_url_2, image_url_3 FROM products WHERE id = $1',
        [parseInt(productId)]
      );
      
      if (productResult.rows.length === 0) {
        await ctx.reply('❌ Товар не найден.');
        return;
      }
      
      const product = productResult.rows[0];
      const minQty = product.min_stem_quantity || product.min_order_quantity || 1;
      const pricePerStem = product.price_per_stem || product.price || 0;
      const productPrice = pricePerStem * minQty;
      
      // Собираем все изображения и берем первое
      const images = [];
      if (product.image_url) images.push(product.image_url);
      if (product.image_url_2) images.push(product.image_url_2);
      if (product.image_url_3) images.push(product.image_url_3);
      const firstImage = images.length > 0 ? images[0] : null;
      
      // Формируем сообщение с информацией о товаре в красивом формате:
      // Название | Количество штук | Цена
      let message = `${product.name} | ${minQty}шт | ${productPrice.toLocaleString('ru-RU')}₽`;
      
      // URL для открытия товара в мини-приложении
      const productUrl = `${webAppUrl}?product=${productId}`;
      
      // Если есть изображение, отправляем фото с подписью
      if (firstImage) {
        await ctx.replyWithPhoto(
          firstImage,
          {
            caption: message,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🛍️ Открыть товар',
                    web_app: {
                      url: productUrl
                    }
                  }
                ]
              ]
            }
          }
        );
      } else {
        // Если нет изображения, отправляем текстовое сообщение
        await ctx.reply(
          message,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🛍️ Открыть товар',
                    web_app: {
                      url: productUrl
                    }
                  }
                ]
              ]
            }
          }
        );
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка при обработке шаринга товара:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке товара. Попробуйте позже.');
  }
};

// Обработка запроса поддержки - просто сообщаем пользователю, что он может писать
const handleSupportRequest = async (ctx) => {
  const userName = ctx.from.first_name || 'Пользователь';
  
  await ctx.reply(
    `👋 Здравствуйте, ${userName}!\n\n` +
    `Напишите ваш вопрос одним или несколькими сообщениями. Мы ответим здесь же 💬\n\n` +
    `💡 Просто отправьте ваше сообщение, и оно будет передано менеджеру.`,
    {
      reply_markup: setupReplyKeyboard()
    }
  );
};

// Обработка команды /support
bot.command('support', async (ctx) => {
  await handleSupportRequest(ctx);
});

// Обработка нажатия на кнопку "Поддержка" из Reply Keyboard
bot.hears('💬 Поддержка', async (ctx) => {
  await handleSupportRequest(ctx);
});

// Обработка личных сообщений от пользователей
bot.on('message', async (ctx) => {
  const chat = ctx.chat;
  const from = ctx.from;
  
  // ВРЕМЕННО: Логируем chat.id и message_thread_id для настройки ORDERS_GROUP_ID и ORDERS_TOPIC_ID
  // Это поможет получить ID группы и темы "Заказы"
  if (ctx.message && ctx.chat && ctx.chat.type === 'supergroup') {
    console.log('🔍 ===== ИНФОРМАЦИЯ ДЛЯ НАСТРОЙКИ УВЕДОМЛЕНИЙ О ЗАКАЗАХ =====');
    console.log(`📱 Chat ID: ${ctx.chat.id}`);
    console.log(`📋 Chat Title: ${ctx.chat.title || 'N/A'}`);
    if (ctx.message.message_thread_id) {
      console.log(`🎯 Message Thread ID (ID темы): ${ctx.message.message_thread_id}`);
      console.log(`✅ Используйте эти значения в Render:`);
      console.log(`   ORDERS_GROUP_ID=${ctx.chat.id}`);
      console.log(`   ORDERS_TOPIC_ID=${ctx.message.message_thread_id}`);
    } else {
      console.log(`⚠️  Это сообщение не в топике. Отправьте сообщение в тему "Заказы"`);
    }
    console.log('🔍 ========================================================');
  }
  
  // 1) Личный чат с пользователем - пересылаем в чат поддержки
  if (chat.type === 'private') {
    // Пропускаем команды
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      return;
    }
    
    // Пропускаем сообщения без контента
    if (!ctx.message.text && !ctx.message.photo && !ctx.message.document && !ctx.message.video && !ctx.message.voice) {
      return;
    }
    
    // Проверяем, что чат поддержки настроен
    if (!SUPPORT_CHAT_ID) {
      console.error('⚠️ SUPPORT_CHAT_ID не установлен, невозможно переслать сообщение');
      await ctx.reply('⚠️ Система поддержки временно недоступна. Попробуйте позже.');
      return;
    }
    
    try {
      const userId = from.id;
      const userName = from.first_name || 'Пользователь';
      const lastName = from.last_name || '';
      const username = from.username ? `@${from.username}` : '';
      
      // Получаем или создаем форум-топик для пользователя
      const messageThreadId = await getOrCreateSupportTopic(userId, userName, username);
      
      if (!messageThreadId) {
        console.error('❌ Не удалось получить/создать топик для пользователя', userId);
        await ctx.reply('⚠️ Произошла ошибка при создании обращения в поддержку. Попробуйте позже.');
        return;
      }
  
      // Получаем информацию о пользователе из БД
  let userInfo = '';
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
        const userResult = await client.query(
              'SELECT phone, email FROM users WHERE telegram_id = $1::bigint',
          [!isNaN(userIdNum) ? userIdNum : userId]
        );
        
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
              if (user.phone) userInfo += `\n📱 Телефон: ${user.phone}`;
              if (user.email) userInfo += `\n📧 Email: ${user.email}`;
        }
      } finally {
        client.release();
      }
    } catch (error) {
          console.error('Ошибка получения данных пользователя:', error);
    }
  }
  
      // Формируем шапку с информацией о пользователе (отправляем всегда для первого сообщения)
      // Проверяем, был ли топик только что создан (менее 60 секунд назад)
      let shouldSendHeader = false;
      try {
        const client = await pool.connect();
        try {
          // Проверяем, когда топик был создан
          const topicCheck = await client.query(
            'SELECT created_at, updated_at FROM support_topics WHERE user_id = $1::bigint AND message_thread_id = $2::integer',
            [userId, messageThreadId]
          );
          if (topicCheck.rows.length > 0) {
            const topicCreated = new Date(topicCheck.rows[0].created_at);
            const now = new Date();
            // Если топик был создан менее 60 секунд назад, отправляем шапку
            // (значит, это первое сообщение в новом топике)
            const timeDiff = now - topicCreated;
            shouldSendHeader = timeDiff < 60000; // 60 секунд для надежности
            console.log(`[support] Топик ${messageThreadId} создан ${Math.round(timeDiff / 1000)} секунд назад, shouldSendHeader: ${shouldSendHeader}`);
          } else {
            // Если топика нет в БД с таким message_thread_id, значит он только что создан - отправляем шапку
            shouldSendHeader = true;
            console.log(`[support] Топик ${messageThreadId} не найден в БД для пользователя ${userId}, отправляем шапку`);
          }
        } finally {
          client.release();
        }
      } catch (error) {
        // При ошибке отправляем шапку
        console.error('[support] Ошибка проверки времени создания топика:', error);
        shouldSendHeader = true;
      }
      
      if (shouldSendHeader) {
        const displayName = `${userName}${lastName ? ' ' + lastName : ''}`;
        const header = [
          `👤 <b>Новый запрос в поддержку</b>`,
          ``,
          `👤 <b>Имя:</b> ${displayName}`,
          `🆔 <b>ID:</b> <code>${userId}</code>`,
          username ? `📝 <b>Username:</b> ${username}` : '',
          userInfo
        ].filter(Boolean).join('\n');
        
        // Отправляем шапку в топик
        let headerMessage;
        try {
          headerMessage = await bot.telegram.sendMessage(
            SUPPORT_CHAT_ID,
            header,
            {
              parse_mode: 'HTML',
              message_thread_id: messageThreadId
            }
          );
          
          console.log(`[support] ✅ Шапка отправлена в топик ${messageThreadId}, message_id: ${headerMessage.message_id}`);
          
          // Закрепляем шапку в топике
          try {
            await bot.telegram.pinChatMessage(SUPPORT_CHAT_ID, headerMessage.message_id, {
              disable_notification: true   // чтобы не спамить уведомлениями
            });
            console.log(`[support] 📌 Шапка закреплена в топике ${messageThreadId}`);
          } catch (pinError) {
            console.error(`[support] ❌ Не удалось закрепить сообщение в топике ${messageThreadId}:`, pinError.message);
            // Не критично, продолжаем работу
          }
        } catch (headerError) {
          // Если топик не найден при отправке шапки, создаем новый топик
          if (headerError.response && headerError.response.description && headerError.response.description.includes('message thread not found')) {
            console.log(`[support] ⚠️ Топик ${messageThreadId} не найден при отправке шапки, создаем новый топик`);
            const newMessageThreadId = await getOrCreateSupportTopic(userId, userName, username, true);
            if (newMessageThreadId) {
              // Обновляем messageThreadId для дальнейшего использования
              messageThreadId = newMessageThreadId;
              // Повторяем отправку шапки в новый топик
              headerMessage = await bot.telegram.sendMessage(
                SUPPORT_CHAT_ID,
                header,
        {
          parse_mode: 'HTML',
                  message_thread_id: newMessageThreadId
        }
      );
              
              console.log(`[support] ✅ Шапка отправлена в новый топик ${newMessageThreadId}, message_id: ${headerMessage.message_id}`);
              
              // Закрепляем шапку в новом топике
              try {
                await bot.telegram.pinChatMessage(SUPPORT_CHAT_ID, headerMessage.message_id, {
                  disable_notification: true
                });
                console.log(`[support] 📌 Шапка закреплена в новом топике ${newMessageThreadId}`);
              } catch (pinError) {
                console.error(`[support] ❌ Не удалось закрепить сообщение в новом топике ${newMessageThreadId}:`, pinError.message);
              }
  } else {
              console.error(`[support] ❌ Не удалось создать новый топик для пользователя ${userId}`);
              throw headerError; // Пробрасываем ошибку дальше
            }
          } else {
            throw headerError; // Для других ошибок пробрасываем дальше
          }
        }
      }
      
      // Отправляем само сообщение пользователя в топик
      try {
        // Для текстовых сообщений используем sendMessage
        if (ctx.message.text) {
          try {
            await bot.telegram.sendMessage(
              SUPPORT_CHAT_ID,
        `📨 <b>Сообщение:</b>\n${ctx.message.text}`,
        {
          parse_mode: 'HTML',
                message_thread_id: messageThreadId
              }
            );
          } catch (threadError) {
            // Если топик не найден, создаем новый и повторяем отправку
            if (threadError.response && threadError.response.description && threadError.response.description.includes('message thread not found')) {
              console.log(`[support] ⚠️ Топик ${messageThreadId} не найден, создаем новый топик`);
              const newMessageThreadId = await getOrCreateSupportTopic(userId, userName, username, true);
              if (newMessageThreadId) {
                await bot.telegram.sendMessage(
                  SUPPORT_CHAT_ID,
                  `📨 <b>Сообщение:</b>\n${ctx.message.text}`,
                  {
                    parse_mode: 'HTML',
                    message_thread_id: newMessageThreadId
                  }
                );
                console.log(`[support] ✅ Сообщение отправлено в новый топик ${newMessageThreadId}`);
              } else {
                throw threadError; // Если не удалось создать новый топик, пробрасываем ошибку
              }
            } else {
              throw threadError; // Для других ошибок пробрасываем дальше
    }
  }
        } 
        // Для медиа пытаемся скопировать
        else if (ctx.message.photo || ctx.message.document || ctx.message.video || ctx.message.voice) {
          try {
            await bot.telegram.copyMessage(
              SUPPORT_CHAT_ID,
              userId,
              ctx.message.message_id,
              {
                message_thread_id: messageThreadId
              }
            );
          } catch (copyError) {
            // Если топик не найден, создаем новый и повторяем отправку
            if (copyError.response && copyError.response.description && copyError.response.description.includes('message thread not found')) {
              console.log(`[support] ⚠️ Топик ${messageThreadId} не найден при копировании медиа, создаем новый топик`);
              const newMessageThreadId = await getOrCreateSupportTopic(userId, userName, username, true);
              if (newMessageThreadId) {
                await bot.telegram.copyMessage(
                  SUPPORT_CHAT_ID,
                  userId,
                  ctx.message.message_id,
                  {
                    message_thread_id: newMessageThreadId
                  }
                );
                console.log(`[support] ✅ Медиа отправлено в новый топик ${newMessageThreadId}`);
    } else {
                // Если не удалось создать новый топик, отправляем текстовое описание
                const mediaType = ctx.message.photo ? '📷 Фото' :
                                 ctx.message.document ? '📎 Документ' :
                                 ctx.message.video ? '🎥 Видео' :
                                 ctx.message.voice ? '🎤 Голосовое сообщение' : 'Медиа-файл';
                
                await bot.telegram.sendMessage(
                  SUPPORT_CHAT_ID,
                  `📨 <b>Сообщение:</b>\n${mediaType}${ctx.message.caption ? '\n\n' + ctx.message.caption : ''}`,
                  {
                    parse_mode: 'HTML',
                    message_thread_id: newMessageThreadId
                  }
                );
              }
            } else {
              // Если не удалось скопировать по другой причине, отправляем текстовое описание
              console.error('Ошибка копирования медиа:', copyError);
              const mediaType = ctx.message.photo ? '📷 Фото' :
                               ctx.message.document ? '📎 Документ' :
                               ctx.message.video ? '🎥 Видео' :
                               ctx.message.voice ? '🎤 Голосовое сообщение' : 'Медиа-файл';
              
              await bot.telegram.sendMessage(
                SUPPORT_CHAT_ID,
                `📨 <b>Сообщение:</b>\n${mediaType}${ctx.message.caption ? '\n\n' + ctx.message.caption : ''}`,
                {
                  parse_mode: 'HTML',
                  message_thread_id: messageThreadId
                }
              );
            }
          }
        } else {
          // Неизвестный тип сообщения
          try {
            await bot.telegram.sendMessage(
              SUPPORT_CHAT_ID,
              `📨 <b>Сообщение:</b>\n(тип сообщения не поддерживается)`,
              {
                parse_mode: 'HTML',
                message_thread_id: messageThreadId
              }
            );
          } catch (threadError) {
            // Если топик не найден, создаем новый и повторяем отправку
            if (threadError.response && threadError.response.description && threadError.response.description.includes('message thread not found')) {
              console.log(`[support] ⚠️ Топик ${messageThreadId} не найден, создаем новый топик`);
              const newMessageThreadId = await getOrCreateSupportTopic(userId, userName, username, true);
              if (newMessageThreadId) {
                await bot.telegram.sendMessage(
                  SUPPORT_CHAT_ID,
                  `📨 <b>Сообщение:</b>\n(тип сообщения не поддерживается)`,
                  {
                    parse_mode: 'HTML',
                    message_thread_id: newMessageThreadId
                  }
                );
              }
            } else {
              throw threadError;
            }
          }
        }
      } catch (sendError) {
        console.error('Ошибка отправки сообщения в чат поддержки:', sendError);
        throw sendError; // Пробрасываем ошибку дальше, чтобы показать пользователю
      }
      
      // НЕ отправляем подтверждающее сообщение пользователю (по требованию)
      
      console.log(`📤 Сообщение от пользователя ${userId} (${userName}) отправлено в топик ${messageThreadId}`);
        } catch (error) {
      console.error('⚠️ Ошибка пересылки сообщения в чат поддержки:', error);
      await ctx.reply('⚠️ Произошла ошибка при отправке сообщения в поддержку. Попробуйте позже.');
    }
    return; // Не обрабатываем дальше
  }
  
  // 2) Сообщение в чате поддержки (форум) - обрабатываем ответы менеджеров
  if (SUPPORT_CHAT_ID && chat.id === SUPPORT_CHAT_ID) {
  // ВРЕМЕННО: Логируем chat.id и message_thread_id для настройки ORDERS_GROUP_ID и ORDERS_TOPIC_ID
  if (ctx.message && ctx.chat) {
    console.log('🔍 ===== ИНФОРМАЦИЯ ДЛЯ НАСТРОЙКИ УВЕДОМЛЕНИЙ О ЗАКАЗАХ =====');
    console.log(`📱 Chat ID: ${ctx.chat.id}`);
    console.log(`📋 Chat Title: ${ctx.chat.title || 'N/A'}`);
    if (ctx.message.message_thread_id) {
      console.log(`🎯 Message Thread ID (ID темы): ${ctx.message.message_thread_id}`);
      console.log(`✅ Используйте эти значения:`);
      console.log(`   ORDERS_GROUP_ID=${ctx.chat.id}`);
      console.log(`   ORDERS_TOPIC_ID=${ctx.message.message_thread_id}`);
    } else {
      console.log(`⚠️  Это сообщение не в топике. Отправьте сообщение в тему "Заказы"`);
    }
    console.log('🔍 ========================================================');
  }
  
  // Проверяем, что сообщение находится в топике (message_thread_id присутствует)
  const messageThreadId = ctx.message.message_thread_id;
    
    if (!messageThreadId) {
      // Сообщение не в топике, игнорируем
          return;
        }
    
    try {
      console.log(`[support] 📨 Обработка ответа менеджера в топике ${messageThreadId}`);
      
      // Получаем userId по message_thread_id из БД
      const userId = await getUserIdByThreadId(messageThreadId);
      
      if (!userId) {
        console.log(`[support] ⚠️ Не удалось определить пользователя для топика ${messageThreadId}`);
        await ctx.reply('⚠️ Не удалось определить пользователя для этого топика. Нет записи в support_topics.', {
          reply_to_message_id: ctx.message.message_id
        });
        return;
      }
      
      console.log(`[support] ✅ Отправляем ответ пользователю ${userId}`);
      await sendManagerReplyToUser(ctx, userId);
    } catch (error) {
      console.error('⚠️ Ошибка обработки ответа менеджера:', error);
      try {
        await ctx.reply('⚠️ Произошла ошибка при отправке ответа пользователю.', {
          reply_to_message_id: ctx.message.message_id
        });
      } catch (replyError) {
        console.error('Не удалось отправить сообщение об ошибке:', replyError);
      }
    }
  }
});

// Функция отправки ответа менеджера пользователю
async function sendManagerReplyToUser(ctx, userId) {
  const messageText = ctx.message.text || ctx.message.caption || '';
  
  // Пропускаем команды
  if (messageText.startsWith('/')) {
    return;
  }
  
  if (!messageText && !ctx.message.photo && !ctx.message.document && !ctx.message.video && !ctx.message.voice) {
    return;
  }
  
  try {
    // Если есть медиа, копируем его
    if (ctx.message.photo || ctx.message.document || ctx.message.video || ctx.message.voice) {
      try {
        await bot.telegram.copyMessage(
          userId,
          ctx.chat.id,
          ctx.message.message_id
        );
      } catch (copyError) {
        // Если не удалось скопировать, отправляем текстовое описание
        const mediaType = ctx.message.photo ? '📷 Фото' :
                         ctx.message.document ? '📎 Документ' :
                         ctx.message.video ? '🎥 Видео' :
                         ctx.message.voice ? '🎤 Голосовое сообщение' : 'Медиа-файл';
        
        await bot.telegram.sendMessage(
          userId,
          `💬 <b>Ответ от поддержки:</b>\n\n${mediaType}${messageText ? '\n\n' + messageText : ''}`,
          { parse_mode: 'HTML' }
        );
      }
    } else {
      // Отправляем текстовый ответ
      await bot.telegram.sendMessage(
        userId,
        `💬 <b>Ответ от поддержки:</b>\n\n${messageText}`,
        { parse_mode: 'HTML' }
      );
    }
    
    console.log(`📥 Ответ менеджера отправлен пользователю ${userId}`);
    
    // Подтверждаем менеджеру
    await ctx.reply('✅ Ответ отправлен пользователю', { reply_to_message_id: ctx.message.message_id });
      } catch (error) {
    console.error('⚠️ Ошибка отправки ответа пользователю:', error);
    await ctx.reply('⚠️ Не удалось отправить ответ пользователю. Возможно, он заблокировал бота.', {
      reply_to_message_id: ctx.message.message_id
    });
        }
      }
      
// Обработка ответов менеджера (callback для ответа)
// Старая логика с сессиями удалена - теперь всё работает через чат поддержки

// Обработка нажатия на кнопку "QR пополнение депозита"
bot.hears('📱 QR пополнение депозита', async (ctx) => {
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Пользователь';
  
  // Получаем информацию о пользователе из БД
  let userBalance = 0;
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : Number(userId);
        const userResult = await client.query(
          'SELECT id FROM users WHERE telegram_id = $1::bigint',
          [!isNaN(userIdNum) ? userIdNum : userId]
        );
        
        if (userResult.rows.length > 0) {
          const userId_db = userResult.rows[0].id;
          // Получаем баланс бонусов
          const balanceResult = await client.query(
            'SELECT bonuses FROM users WHERE id = $1',
            [userId_db]
          );
          if (balanceResult.rows.length > 0) {
            userBalance = parseFloat(balanceResult.rows[0].bonuses || 0);
          }
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Ошибка получения данных пользователя:', error);
    }
  }
  
  // Формируем URL для QR пополнения
  const paymentUrl = `${process.env.WEBAPP_URL || `http://localhost:${PORT}`}/payment/deposit?user=${userId}`;
  
  await ctx.reply(
    `💳 <b>Пополнение депозита</b>\n\n` +
    `👤 Пользователь: ${userName}\n` +
    `💰 Текущий баланс: ${userBalance.toLocaleString('ru-RU')} flow-баксов\n\n` +
    `Для пополнения депозита используйте QR-код или перейдите по ссылке.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '💳 Пополнить депозит',
              url: paymentUrl
            }
          ]
        ]
      }
    }
  );
  
  console.log(`📱 Запрос на пополнение депозита от пользователя ${userId} (${userName})`);
});

// Обработка данных из MiniApp
bot.on('web_app_data', (ctx) => {
  const data = JSON.parse(ctx.webAppData.data);
  console.log('Данные из MiniApp:', data);
  ctx.reply('✅ Заказ принят! Мы свяжемся с вами в ближайшее время.');
});

// Сохраняем имя бота для использования в API
let botUsername = process.env.BOT_USERNAME || 'FlowboxBot';

// API endpoint для мониторинга очереди Telegram сообщений
app.get('/api/queue/stats', async (req, res) => {
  if (!telegramQueue) {
    return res.json({
      error: 'Очередь не инициализирована',
      stats: null
    });
  }
  
  const stats = telegramQueue.getStats();
  res.json({
    success: true,
    stats: {
      total: stats.total,
      sent: stats.sent,
      failed: stats.failed,
      retried: stats.retried,
      queueLength: stats.queueLength,
      processing: stats.processing,
      successRate: stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(2) + '%' : '0%'
    }
  });
});

// API endpoint для получения информации о боте
app.get('/api/bot-info', async (req, res) => {
  res.json({ username: botUsername });
});

// Запуск бота с обработкой ошибок
if (process.env.BOT_TOKEN) {
  bot.launch().then(async () => {
    console.log('🤖 Бот запущен!');
    // Получаем информацию о боте для сохранения username
    try {
      const me = await bot.telegram.getMe();
      botUsername = me.username;
      console.log(`✅ Имя бота: @${botUsername}`);
      
      // Настраиваем Menu Button для открытия Mini App
      const webAppUrl = process.env.WEBAPP_URL || `http://localhost:${PORT}`;
      try {
        await bot.telegram.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '🛍️ Открыть магазин',
            web_app: {
              url: webAppUrl
            }
          }
        });
        console.log('✅ Menu Button настроен');
      } catch (menuError) {
        console.warn('⚠️ Не удалось настроить Menu Button:', menuError.message);
        console.warn('💡 Menu Button можно настроить вручную через @BotFather');
      }
    } catch (error) {
      console.warn('⚠️ Не удалось получить информацию о боте:', error.message);
    }
  }).catch((err) => {
    // Ошибка 409 означает, что где-то еще запущен другой экземпляр бота
    if (err.response?.error_code === 409) {
      console.warn('⚠️  Бот уже запущен в другом месте. Это нормально, если запущен локально или в другом деплое.');
      console.warn('💡 MiniApp будет работать, но команды бота могут не отвечать.');
    } else if (err.code === 'ETIMEDOUT' || err.type === 'system') {
      console.warn('⚠️  Таймаут при подключении к Telegram API. Это может быть временная проблема сети.');
      console.warn('💡 Приложение продолжит работу, но бот может быть недоступен.');
      console.warn('💡 MiniApp и API будут работать нормально.');
    } else {
      console.error('❌ Ошибка запуска бота:', err.message || err);
      console.warn('💡 Приложение продолжит работу без бота. MiniApp и API будут доступны.');
    }
  });
} else {
  console.warn('⚠️  BOT_TOKEN не установлен. Бот не будет запущен.');
  console.warn('💡 Приложение продолжит работу. MiniApp и API будут доступны.');
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

