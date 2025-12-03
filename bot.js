const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

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
    max: 10, // Максимум соединений в пуле
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
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
    }, 2000);
    
    // Выполняем миграцию features в JSONB (если нужно)
    setTimeout(async () => {
    try {
      const client = await pool.connect();
      try {
        // Проверяем тип колонки features
        const columnInfo = await client.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'products' AND column_name = 'features'
        `);
        
        if (columnInfo.rows.length > 0 && columnInfo.rows[0].data_type === 'ARRAY') {
          console.log('🔄 Выполняем миграцию features: TEXT[] → JSONB...');
          
          // Выполняем миграцию
          await client.query(`
            DO $$
            BEGIN
              -- Конвертируем существующие данные
              UPDATE products 
              SET features = CASE 
                  WHEN features IS NULL THEN NULL::jsonb
                  WHEN pg_typeof(features) = 'text[]'::regtype THEN 
                      jsonb_build_array(features)
                  ELSE features::jsonb
              END
              WHERE features IS NOT NULL;
            END $$;
          `);
          
          await client.query(`
            ALTER TABLE products 
            ALTER COLUMN features TYPE JSONB 
            USING CASE 
                WHEN features IS NULL THEN NULL::jsonb
                WHEN pg_typeof(features) = 'text[]'::regtype THEN 
                    jsonb_build_array(features)
                ELSE features::jsonb
            END;
          `);
          
          console.log('✅ Миграция features завершена');
        }
      } catch (migrationError) {
        // Игнорируем ошибки миграции (возможно, уже выполнена)
        if (migrationError.code !== '42804' && migrationError.code !== '42P16') {
          console.log('⚠️  Миграция features:', migrationError.message);
        }
      } finally {
        client.release();
      }
    } catch (error) {
      // Игнорируем ошибки при миграции
    }
  }, 5000); // Ждем 5 секунд после подключения
} else {
  console.log('⚠️  DATABASE_URL не установлен, используется файловое хранилище');
  console.log('💡 Для использования БД добавь переменную DATABASE_URL в Environment Render.com');
}

app.use(express.json());

// ВАЖНО: Маршруты админки должны быть ДО статических файлов MiniApp
// Статические файлы для админки (собранная React версия)
const adminBuildPath = path.join(__dirname, 'admin-build');
const adminSourcePath = path.join(__dirname, 'admin');

// Проверка и сборка админ-панели
if (!fs.existsSync(adminBuildPath) && fs.existsSync(adminSourcePath)) {
  console.log('⚠️  admin-build не найден, выполняем сборку...');
  try {
    const { execSync } = require('child_process');
    const adminDir = path.join(__dirname, 'admin');
    if (fs.existsSync(path.join(adminDir, 'package.json'))) {
      execSync('cd admin && npm install --production=false && npx vite build', { 
        cwd: __dirname,
        stdio: 'inherit',
        timeout: 180000, // 3 минуты
        env: { ...process.env, PATH: process.env.PATH }
      });
      console.log('✅ Админ-панель собрана успешно');
    }
  } catch (buildError) {
    console.error('❌ Ошибка сборки админ-панели:', buildError.message);
    console.log('⚠️  Используем исходники как fallback');
  }
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
          // Обрабатываем features: может быть JSONB объект, массив или null
          let features = {};
          if (row.features_json) {
            try {
              features = JSON.parse(row.features_json);
            } catch (e) {
              features = {};
            }
          } else if (row.features) {
            // Fallback для старого формата
            if (typeof row.features === 'string') {
              try {
                features = JSON.parse(row.features);
              } catch (e) {
                features = {};
              }
            } else if (Array.isArray(row.features)) {
              features = row.features;
            } else {
              features = row.features;
            }
          }
          
          return {
            id: row.id,
            name: row.name,
            description: row.description || '',
            price: row.price,
            image: row.image_url || 'https://via.placeholder.com/300x300?text=Цветы',
            image_url: row.image_url,
            type: row.type || '',
            color: row.color || '',
            features: features,
            is_active: row.is_active !== false,
            stock: row.stock,
            min_stock: row.min_stock
          };
        });
        
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

// Получить или создать пользователя в БД
async function getOrCreateUser(telegramId, telegramUser = null, profile = null) {
  if (!pool) return null;
  
  try {
    const client = await pool.connect();
    try {
      // Ищем пользователя
      let result = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId]
      );
      
      if (result.rows.length === 0) {
        // Создаем нового пользователя
        result = await client.query(
          `INSERT INTO users (telegram_id, username, first_name, last_name, phone, email, bonuses)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            telegramId,
            telegramUser?.username || profile?.username || null,
            telegramUser?.first_name || profile?.name || null,
            telegramUser?.last_name || null,
            profile?.phone || null,
            profile?.email || null,
            500 // Начальные бонусы
          ]
        );
      } else {
        // Обновляем данные пользователя, если они изменились
        const user = result.rows[0];
        if (telegramUser || profile) {
          result = await client.query(
            `UPDATE users 
             SET username = COALESCE($1, username),
                 first_name = COALESCE($2, first_name),
                 last_name = COALESCE($3, last_name),
                 phone = COALESCE($4, phone),
                 email = COALESCE($5, email),
                 updated_at = now()
             WHERE telegram_id = $6
             RETURNING *`,
            [
              telegramUser?.username || profile?.username || null,
              telegramUser?.first_name || profile?.name || null,
              telegramUser?.last_name || null,
              profile?.phone || null,
              profile?.email || null,
              telegramId
            ]
          );
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

// Сохранение адресов пользователя
async function saveUserAddresses(userId, addresses) {
  if (!pool) return false;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Получаем существующие адреса для проверки дубликатов
      const existingAddresses = await client.query(
        'SELECT city, street, house, apartment FROM addresses WHERE user_id = $1',
        [userId]
      );
      
      // Функция для проверки дубликата
      const isDuplicate = (newAddr) => {
        return existingAddresses.rows.some(existing => {
          const newCity = (newAddr.city || '').toLowerCase().trim();
          const newStreet = (newAddr.street || '').toLowerCase().trim();
          const newHouse = (newAddr.house || '').toLowerCase().trim();
          const newApartment = (newAddr.apartment || '').toLowerCase().trim();
          
          const existingCity = (existing.city || '').toLowerCase().trim();
          const existingStreet = (existing.street || '').toLowerCase().trim();
          const existingHouse = (existing.house || '').toLowerCase().trim();
          const existingApartment = (existing.apartment || '').toLowerCase().trim();
          
          return newCity === existingCity &&
                 newStreet === existingStreet &&
                 newHouse === existingHouse &&
                 newApartment === existingApartment;
        });
      };
      
      // Удаляем старые адреса
      await client.query('DELETE FROM addresses WHERE user_id = $1', [userId]);
      
      // Добавляем новые адреса, пропуская дубликаты
      let addedCount = 0;
      let skippedCount = 0;
      
      for (const addr of addresses || []) {
        // Проверяем на дубликат перед добавлением
        if (!isDuplicate(addr)) {
          await client.query(
            `INSERT INTO addresses 
             (user_id, name, city, street, house, entrance, apartment, floor, intercom, comment, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              userId,
              addr.name || 'Новый адрес',
              addr.city || '',
              addr.street || '',
              addr.house || '',
              addr.entrance || null,
              addr.apartment || null,
              addr.floor || null,
              addr.intercom || null,
              addr.comment || null,
              addr.isDefault || false
            ]
          );
          addedCount++;
        } else {
          skippedCount++;
        }
      }
      
      if (skippedCount > 0) {
        console.log(`⚠️  Пропущено ${skippedCount} дубликатов адресов для пользователя ${userId}`);
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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
      
      // Получаем user_id по telegram_id
      let userId = null;
      if (orderData.userId) {
        const userResult = await client.query(
          'SELECT id FROM users WHERE telegram_id = $1',
          [orderData.userId]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
          console.log('✅ Найден пользователь в БД, user_id:', userId);
        } else {
          console.log('⚠️  Пользователь не найден в БД, создаем заказ без user_id');
        }
      }
      
      // Создаем заказ
      const orderResult = await client.query(
        `INSERT INTO orders 
         (user_id, total, flowers_total, service_fee, delivery_price, bonus_used, bonus_earned,
          recipient_name, recipient_phone, address_string, address_json, delivery_date, delivery_time, comment, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active')
         RETURNING *`,
        [
          userId,
          orderData.total,
          orderData.flowersTotal,
          orderData.serviceFee || 450,
          orderData.deliveryPrice || 0,
          orderData.bonusUsed || 0,
          orderData.bonusEarned || 0,
          orderData.recipientName || null,
          orderData.recipientPhone || null,
          orderData.address,
          JSON.stringify(orderData.addressData || {}),
          orderData.deliveryDate || null,
          orderData.deliveryTime || null,
          orderData.comment || null
        ]
      );
      
      const order = orderResult.rows[0];
      console.log('✅ Заказ создан в БД, order_id:', order.id);
      
      // Добавляем позиции заказа
      for (const item of orderData.items || []) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, name, price, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, item.id, item.name, item.price, item.quantity]
        );
      }
      console.log('✅ Позиции заказа добавлены, количество:', orderData.items?.length || 0);
      
      // Обновляем бонусы пользователя
      if (userId) {
        await client.query(
          `UPDATE users 
           SET bonuses = bonuses - $1 + $2
           WHERE id = $3`,
          [orderData.bonusUsed || 0, orderData.bonusEarned || 0, userId]
        );
        console.log('✅ Бонусы пользователя обновлены');
      }
      
      await client.query('COMMIT');
      console.log('✅ Транзакция завершена успешно');
      
      return {
        orderId: order.id,
        telegramOrderId: Date.now() // Для совместимости с фронтендом
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Ошибка в транзакции, откат:', error);
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
        query += ' AND o.status = $2';
        params.push(status);
      }
      
      query += ' GROUP BY o.id ORDER BY o.created_at DESC';
      
      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        date: new Date(row.created_at).toLocaleDateString('ru-RU'),
        items: row.items.filter(item => item.id !== null),
        total: row.total,
        address: row.address_string,
        deliveryDate: row.delivery_date ? new Date(row.delivery_date).toISOString().split('T')[0] : null,
        deliveryTime: row.delivery_time,
        status: row.status,
        createdAt: row.created_at
      }));
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
      
      // Сохраняем адреса
      if (addresses !== undefined) {
        await saveUserAddresses(user.id, addresses);
      }
      
      // Обновляем бонусы ТОЛЬКО если они явно переданы и не равны undefined
      // Это предотвращает перезапись реальных бонусов из БД значениями по умолчанию
      if (bonuses !== undefined && bonuses !== null) {
        const client = await pool.connect();
        try {
          // Проверяем текущие бонусы в БД перед обновлением
          const currentBonuses = await client.query(
            'SELECT bonuses FROM users WHERE id = $1',
            [user.id]
          );
          
          // Обновляем только если переданное значение отличается от текущего
          // или если текущее значение NULL (первая инициализация)
          const currentBonusValue = currentBonuses.rows[0]?.bonuses;
          if (currentBonusValue === null || currentBonusValue === undefined || currentBonusValue !== bonuses) {
            await client.query(
              'UPDATE users SET bonuses = $1 WHERE id = $2',
              [bonuses, user.id]
            );
          }
        } finally {
          client.release();
        }
      }
      
      // Логируем только при значительных изменениях (новые адреса, заказы, изменения бонусов)
      const hasSignificantChanges = 
        (addresses !== undefined && addresses.length > 0) ||
        (activeOrders !== undefined && activeOrders.length > 0) ||
        (bonuses !== undefined);
      
      if (hasSignificantChanges) {
        console.log(`💾 Сохранены данные для пользователя ${userId} (БД): адресов=${addresses?.length || 0}, заказов=${activeOrders?.length || 0}, бонусов=${bonuses || 0}`);
      }
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
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка сохранения данных:', error);
    res.status(500).json({ error: 'Ошибка сохранения данных' });
  }
});

// API endpoint для загрузки данных пользователя
app.get('/api/user-data/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    if (pool) {
      // Работа с БД
      const user = await getOrCreateUser(userId);
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
      const activeOrders = await loadUserOrders(user.id, 'active');
      const completedOrders = await loadUserOrders(user.id, 'completed');
      
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
        // Используем реальные бонусы из БД, если они есть, иначе 0 (не 500!)
        bonuses: user.bonuses !== null && user.bonuses !== undefined ? user.bonuses : 0
      };
      
      // Логируем загрузку данных только если есть что загружать
      if (addresses.length > 0 || activeOrders.length > 0) {
        console.log(`📥 Загружены данные для пользователя ${userId} (БД): адресов=${addresses.length}, активных заказов=${activeOrders.length}`);
      }
      
      res.json(userData);
    } else {
      // Fallback: файловое хранилище
      const userData = userDataStore[userId] || {
        cart: [],
        addresses: [],
        profile: null,
        activeOrders: [],
        completedOrders: [],
        bonuses: 0 // Не 500, чтобы не начислять бонусы при каждом деплое
      };
      
      console.log(`📥 Загружены данные для пользователя ${userId} (файл): адресов=${userData.addresses.length}, заказов=${userData.activeOrders.length}`);
      
      res.json(userData);
    }
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
    res.status(500).json({ error: 'Ошибка загрузки данных' });
  }
});

// API endpoint для создания заказа
app.post('/api/orders', async (req, res) => {
  const orderData = req.body;
  
  try {
    if (pool) {
      // Сохраняем заказ в БД
      const result = await createOrderInDb(orderData);
      
      if (result) {
        console.log(`✅ Заказ создан в БД: ID=${result.orderId}, сумма=${orderData.total}₽`);
        
        // Отправляем уведомление в Telegram (если нужно)
        // const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
        // if (ADMIN_CHAT_ID) {
        //   bot.telegram.sendMessage(ADMIN_CHAT_ID, 
        //     `🛍️ Новый заказ #${result.orderId}\n` +
        //     `Сумма: ${orderData.total}₽\n` +
        //     `Адрес: ${orderData.address}`
        //   );
        // }
        
        res.json({ success: true, orderId: result.telegramOrderId });
      } else {
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
    console.error('Ошибка создания заказа:', error);
    res.status(500).json({ error: 'Ошибка создания заказа', success: false });
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
    stem_length_id,
    country_id,
    variety_id,
    tag_ids,
    image_url,
    is_active
  } = req.body;
  
  if (!name || !category_id || !color_id || !price_per_stem || !min_stem_quantity) {
    return res.status(400).json({ error: 'Название, категория, цвет, цена за стебель и минимальное количество обязательны' });
  }
  
  if (!quality_ids || !Array.isArray(quality_ids) || quality_ids.length === 0) {
    return res.status(400).json({ error: 'Необходимо выбрать хотя бы одно отличительное качество' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Создаем товар
      const result = await client.query(
        `INSERT INTO products (
          name, 
          category_id, 
          color_id, 
          price_per_stem, 
          min_stem_quantity,
          stem_length_id,
          country_id,
          variety_id,
          image_url,
          is_active
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          name,
          category_id,
          color_id,
          price_per_stem,
          min_stem_quantity,
          stem_length_id || null,
          country_id || null,
          variety_id || null,
          image_url || null,
          is_active !== false
        ]
      );
      
      const product = result.rows[0];
      
      // Связываем качества
      if (quality_ids && quality_ids.length > 0) {
        for (const qualityId of quality_ids) {
          await client.query(
            'INSERT INTO product_qualities_map (product_id, quality_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [product.id, qualityId]
          );
        }
      }
      
      // Связываем теги
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
    stem_length_id,
    country_id,
    variety_id,
    tag_ids,
    image_url,
    is_active,
    stock,
    min_stock
  } = req.body;
  
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
      
      let updateQuery = `
        UPDATE products 
        SET name = COALESCE($1, name),
            category_id = COALESCE($2, category_id),
            color_id = COALESCE($3, color_id),
            price_per_stem = COALESCE($4, price_per_stem),
            min_stem_quantity = COALESCE($5, min_stem_quantity),
            stem_length_id = COALESCE($6, stem_length_id),
            country_id = COALESCE($7, country_id),
            variety_id = COALESCE($8, variety_id),
            image_url = COALESCE($9, image_url),
            is_active = COALESCE($10, is_active),
            updated_at = now()
      `;
      
      const params = [
        name, 
        category_id, 
        color_id, 
        price_per_stem, 
        min_stem_quantity,
        stem_length_id,
        country_id,
        variety_id,
        image_url,
        is_active
      ];
      let paramIndex = 11;
      
      if (hasStock && stock !== undefined) {
        updateQuery += `, stock = $${paramIndex}`;
        params.push(stock);
        paramIndex++;
      }
      
      if (hasMinStock && min_stock !== undefined) {
        updateQuery += `, min_stock = $${paramIndex}`;
        params.push(min_stock);
        paramIndex++;
      }
      
      updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
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

// API: Получить товар по ID
app.get('/api/admin/products/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
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

// API: Обновить заказ
app.put('/api/admin/orders/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { status, recipient_name, recipient_phone, delivery_date, delivery_time, comment, address_json } = req.body;
  
  try {
    const client = await pool.connect();
    try {
      let updateQuery = 'UPDATE orders SET updated_at = now()';
      const params = [];
      let paramIndex = 1;
      
      if (status !== undefined) {
        updateQuery += `, status = $${paramIndex}`;
        params.push(status);
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
      if (comment !== undefined) {
        updateQuery += `, comment = $${paramIndex}`;
        params.push(comment);
        paramIndex++;
      }
      if (address_json !== undefined) {
        updateQuery += `, address_json = $${paramIndex}::jsonb`;
        params.push(JSON.stringify(address_json));
        paramIndex++;
      }
      
      updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
      params.push(id);
      
      const result = await client.query(updateQuery, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      const order = result.rows[0];
      // Загружаем items
      const itemsResult = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [id]
      );
      
      res.json({
        ...order,
        items: itemsResult.rows,
        address_data: order.address_json ? JSON.parse(order.address_json) : {}
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

// API: Получить склад (остатки товаров)
app.get('/api/admin/warehouse', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          id, name, type, color, price, image_url,
          COALESCE(stock, 0) as stock,
          COALESCE(min_stock, 0) as min_stock,
          is_active
        FROM products 
        ORDER BY name`
      );
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения данных склада:', error);
    res.status(500).json({ error: 'Ошибка получения данных склада' });
  }
});

// API: Добавить поставку
app.post('/api/admin/warehouse', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { product_id, quantity, purchase_price, delivery_date, supplier, invoice_number, comment } = req.body;
  
  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'Товар и количество обязательны' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Обновляем остаток товара
      const productResult = await client.query(
        'SELECT stock FROM products WHERE id = $1',
        [product_id]
      );
      
      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Товар не найден' });
      }
      
      const currentStock = productResult.rows[0].stock || 0;
      const newStock = currentStock + parseInt(quantity);
      
      await client.query(
        'UPDATE products SET stock = $1, updated_at = now() WHERE id = $2',
        [newStock, product_id]
      );
      
      // Здесь можно добавить таблицу поставок (deliveries) для истории
      // Пока просто обновляем остаток
      
      await client.query('COMMIT');
      res.json({ success: true, newStock });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка добавления поставки:', error);
    res.status(500).json({ error: 'Ошибка добавления поставки' });
  }
});

// API: Получить все заказы (для админки)
app.get('/api/admin/orders', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { status } = req.query; // Опциональный фильтр по статусу
  
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
      
      // Преобразуем address_json из JSONB в объект и исправляем поле total
      const orders = result.rows.map(row => ({
        ...row,
        total: row.total || 0, // Используем total вместо total_amount
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

// API: Получить один заказ по ID
app.get('/api/admin/orders/:id', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          o.*,
          u.first_name as customer_name,
          u.last_name as customer_last_name,
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
        WHERE o.id = $1
        GROUP BY o.id, u.id`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      const order = result.rows[0];
      res.json({
        ...order,
        total: order.total || 0, // Используем total вместо total_amount
        address_data: typeof order.address_json === 'object' ? order.address_json : (order.address_json ? JSON.parse(order.address_json) : {})
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения заказа:', error);
    res.status(500).json({ error: 'Ошибка получения заказа' });
  }
});

// API: Обновить статус заказа (расширенный)
app.put('/api/admin/orders/:id/status', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const { status, comment } = req.body;
  
  // Расширенные статусы
  const validStatuses = ['new', 'confirmed', 'preparing', 'assigned', 'in_transit', 'delivered', 'cancelled', 'active', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Неверный статус' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Обновляем статус заказа
      const result = await client.query(
        'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [status, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      // Записываем в историю статусов
      await client.query(
        'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
        [id, status, 'admin', comment || null]
      );
      
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
      
      // Назначаем курьера и меняем статус
      const result = await client.query(
        'UPDATE orders SET courier_id = $1, status = $2, updated_at = now() WHERE id = $3 RETURNING *',
        [courier_id, 'assigned', id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      // Записываем в историю
      await client.query(
        'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
        [id, 'assigned', 'admin', `Назначен курьер ID: ${courier_id}`]
      );
      
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
      const result = await client.query(
        'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC',
        [id]
      );
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения истории заказа:', error);
    res.status(500).json({ error: 'Ошибка получения истории заказа' });
  }
});

// API: Получить всех клиентов
app.get('/api/admin/customers', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          u.id,
          u.first_name as name,
          u.phone,
          u.email,
          u.bonuses,
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
          ...customer,
          orders: ordersResult.rows,
        };
      }));
      
      res.json(customers);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения клиентов:', error);
    res.status(500).json({ error: 'Ошибка получения клиентов' });
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
bot.command('start', (ctx) => {
  const webAppUrl = process.env.WEBAPP_URL || `http://localhost:${PORT}`;
  
  ctx.reply(
    '🌸 Добро пожаловать в FlowBox!\n\nВыберите действие:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🛍️ Открыть магазин',
              web_app: { url: webAppUrl }
            }
          ]
        ]
      }
    }
  );
});

// Обработка данных из MiniApp
bot.on('web_app_data', (ctx) => {
  const data = JSON.parse(ctx.webAppData.data);
  console.log('Данные из MiniApp:', data);
  ctx.reply('✅ Заказ принят! Мы свяжемся с вами в ближайшее время.');
});

// Запуск бота
bot.launch().then(() => {
  console.log('🤖 Бот запущен!');
}).catch((err) => {
  // Ошибка 409 означает, что где-то еще запущен другой экземпляр бота
  if (err.response?.error_code === 409) {
    console.warn('⚠️  Бот уже запущен в другом месте. Это нормально, если запущен локально или в другом деплое.');
    console.warn('💡 MiniApp будет работать, но команды бота могут не отвечать.');
  } else {
    console.error('❌ Ошибка запуска бота:', err);
  }
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

