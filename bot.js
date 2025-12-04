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
          
          return {
            id: row.id,
            name: row.name,
            price: row.price_per_stem || row.price || 0,
            image: row.image_url || 'https://via.placeholder.com/300x300?text=Цветы',
            image_url: row.image_url,
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
      
      // Логируем дубликаты только если их много (не критично)
      if (skippedCount > 0 && skippedCount > 3) {
        console.log(`ℹ️  Пропущено ${skippedCount} дубликатов адресов для пользователя ${userId}`);
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
      
      // Получаем user_id и данные пользователя по telegram_id
      let userId = null;
      let userData = null;
      if (orderData.userId) {
        const userResult = await client.query(
          'SELECT id, first_name, last_name, phone, email FROM users WHERE telegram_id = $1',
          [orderData.userId]
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
        // Формат: "10:00-12:00" или "10:00 - 12:00"
        const timeMatch = orderData.deliveryTime.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          deliveryTimeFrom = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
          deliveryTimeTo = `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`;
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
      
      // Комментарий пользователя (для флориста/доставки)
      const userComment = orderData.userComment || orderData.comment || null;
      
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
      
      // Создаем заказ
      const orderResult = await client.query(
        `INSERT INTO orders 
         (user_id, total, flowers_total, service_fee, delivery_price, bonus_used, bonus_earned,
          client_name, client_phone, client_email,
          recipient_name, recipient_phone, 
          address_id, address_string, address_json, 
          delivery_zone, delivery_date, delivery_time,
          user_comment, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'NEW')
         RETURNING *`,
        [
          userId,
          orderData.total,
          orderData.flowersTotal,
          orderData.serviceFee || 450,
          orderData.deliveryPrice || 0,
          orderData.bonusUsed || 0,
          orderData.bonusEarned || 0,
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
          userComment
        ]
      );
      
      const order = orderResult.rows[0];
      console.log('✅ Заказ создан в БД, order_id:', order.id, 'user_id в заказе:', order.user_id || 'NULL');
      
      // Проверяем остатки перед добавлением позиций
      for (const item of orderData.items || []) {
        const productId = item.id;
        const requestedQty = item.quantity || 0;
        
        // Рассчитываем доступный остаток по движениям
        const stockResult = await client.query(
          `SELECT 
            COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE 0 END), 0) - 
            COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) - 
            COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' THEN quantity ELSE 0 END), 0) as available
          FROM stock_movements
          WHERE product_id = $1`,
          [productId]
        );
        
        const available = parseInt(stockResult.rows[0]?.available || 0);
        
        if (requestedQty > available) {
          await client.query('ROLLBACK');
          const productName = item.name || `товар #${productId}`;
          throw new Error(`Недостаточно товара на складе: ${productName}. Запрошено: ${requestedQty}, доступно: ${available}`);
        }
      }
      
      // Добавляем позиции заказа и создаем движения
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
        
        // Создаем движение типа SALE
        await client.query(
          `INSERT INTO stock_movements (product_id, type, quantity, order_id, comment)
           VALUES ($1, 'SALE', $2, $3, $4)`,
          [productId, quantity, order.id, `Продажа по заказу #${order.id}`]
        );
      }
      console.log('✅ Позиции заказа добавлены и движения созданы, количество:', orderData.items?.length || 0);
      
      // Обновляем бонусы пользователя и создаем транзакции
      if (userId) {
        // Списание бонусов (если использованы)
        if (orderData.bonusUsed > 0) {
          await client.query(
            `INSERT INTO bonus_transactions (user_id, order_id, type, amount, description)
             VALUES ($1, $2, 'redeem', -$3, $4)`,
            [userId, order.id, orderData.bonusUsed, `Списание бонусов за заказ #${order.id}`]
          );
        }
        
        // Начисление бонусов (если начислены)
        if (orderData.bonusEarned > 0) {
          await client.query(
            `INSERT INTO bonus_transactions (user_id, order_id, type, amount, description)
             VALUES ($1, $2, 'accrual', $3, $4)`,
            [userId, order.id, orderData.bonusEarned, `Начисление бонусов за заказ #${order.id}`]
          );
        }
        
        // Обновляем баланс бонусов пользователя
        await client.query(
          `UPDATE users 
           SET bonuses = bonuses - $1 + $2
           WHERE id = $3`,
          [orderData.bonusUsed || 0, orderData.bonusEarned || 0, userId]
        );
        console.log('✅ Бонусы пользователя обновлены, транзакции созданы');
      }
      
      // Создаем запись в order_status_history
      try {
        await client.query(
          `INSERT INTO order_status_history (order_id, status, source, comment)
           VALUES ($1, $2, $3, $4)`,
          [order.id, 'NEW', 'system', 'Заказ создан через мини-апп']
        );
      } catch (historyError) {
        // Игнорируем ошибки истории (таблица может не существовать)
        console.log('⚠️  Не удалось создать запись в истории статусов:', historyError.message);
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
      if (addresses !== undefined && Array.isArray(addresses)) {
        const saved = await saveUserAddresses(user.id, addresses);
        if (saved) {
          console.log(`✅ Сохранено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
        } else {
          console.error(`❌ Ошибка сохранения адресов для пользователя ${userId}`);
        }
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
      console.log(`📦 Загружено адресов для пользователя ${userId} (user_id=${user.id}): ${addresses.length}`);
      // Загружаем активные заказы (NEW, PROCESSING, COLLECTING, DELIVERING, CANCELED)
      // CANCELED тоже показывается в активных, чтобы пользователь видел отмененные заказы
      const activeOrders = await loadUserOrders(user.id, ['NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'CANCELED']);
      // История заказов - только доставленные (COMPLETED)
      const completedOrders = await loadUserOrders(user.id, ['COMPLETED']);
      
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
      
      if (result && result.orderId) {
        console.log(`✅ Заказ создан в БД: ID=${result.orderId}, сумма=${orderData.total}₽`);
        
        // Сохраняем адрес из заказа в таблицу addresses, если он есть
        if (orderData.userId && orderData.addressData) {
          try {
            const user = await getOrCreateUser(orderData.userId);
            if (user && orderData.addressData.street && orderData.addressData.house) {
              // Проверяем, не является ли это дубликатом
              const existingAddresses = await loadUserAddresses(user.id);
              const isDuplicate = existingAddresses.some(existing => {
                const sameCity = (existing.city || '').toLowerCase().trim() === (orderData.addressData.city || '').toLowerCase().trim();
                const sameStreet = (existing.street || '').toLowerCase().trim() === (orderData.addressData.street || '').toLowerCase().trim();
                const sameHouse = (existing.house || '').toLowerCase().trim() === (orderData.addressData.house || '').toLowerCase().trim();
                const sameApartment = (existing.apartment || '').toLowerCase().trim() === (orderData.addressData.apartment || '').toLowerCase().trim();
                return sameCity && sameStreet && sameHouse && sameApartment;
              });
              
              if (!isDuplicate) {
                const addressToSave = [{
                  name: orderData.addressData.name || `${orderData.addressData.street}, ${orderData.addressData.house}`,
                  city: orderData.addressData.city || 'Санкт-Петербург',
                  street: orderData.addressData.street,
                  house: orderData.addressData.house,
                  entrance: orderData.addressData.entrance || '',
                  apartment: orderData.addressData.apartment || '',
                  floor: orderData.addressData.floor || '',
                  intercom: orderData.addressData.intercom || '',
                  comment: orderData.addressData.comment || ''
                }];
                await saveUserAddresses(user.id, addressToSave);
                console.log('✅ Адрес из заказа сохранен в БД');
              } else {
                console.log('ℹ️  Адрес из заказа уже существует, пропускаем');
              }
            }
          } catch (addrError) {
            console.error('⚠️  Ошибка сохранения адреса из заказа:', addrError);
            // Не прерываем создание заказа из-за ошибки сохранения адреса
          }
        }
        
        // Отправляем уведомление в Telegram (если нужно)
        // const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
        // if (ADMIN_CHAT_ID) {
        //   bot.telegram.sendMessage(ADMIN_CHAT_ID, 
        //     `🛍️ Новый заказ #${result.orderId}\n` +
        //     `Сумма: ${orderData.total}₽\n` +
        //     `Адрес: ${orderData.address}`
        //   );
        // }
        
        // Возвращаем явный успешный ответ
        res.status(200).json({ 
          success: true, 
          orderId: result.orderId 
        });
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
    console.error('Детали ошибки:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Ошибка создания заказа' 
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
    features, // Массив строк качеств (TEXT[])
    stem_length_id,
    country_id,
    variety_id,
    tag_ids,
    tags, // Массив строк тегов (TEXT[])
    image_url,
    is_active
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
          is_active
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
    stem_length_id,
    country_id,
    variety_id,
    tag_ids,
    image_url,
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
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(is_active);
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
  const orderId = parseInt(id);
  if (isNaN(orderId)) {
    return res.status(400).json({ error: 'Неверный ID заказа' });
  }
  
  const { status, recipient_name, recipient_phone, delivery_date, delivery_time, user_comment, comment, address_json, internal_comment, courier_comment, status_comment } = req.body;
  
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
      if (status_comment !== undefined) {
        updateQuery += `, status_comment = $${paramIndex}`;
        params.push(status_comment);
        paramIndex++;
      }
      if (address_json !== undefined) {
        updateQuery += `, address_json = $${paramIndex}::jsonb`;
        params.push(typeof address_json === 'object' ? JSON.stringify(address_json) : address_json);
        paramIndex++;
      }
      
      updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
      params.push(orderId);
      
      const result = await client.query(updateQuery, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
      }
      
      // Получаем старый статус для проверки изменений
      const oldOrderResult = await client.query('SELECT status, bonus_used, bonus_earned, user_id FROM orders WHERE id = $1', [orderId]);
      const oldOrder = oldOrderResult.rows[0];
      
      // Записываем в историю статусов, если статус изменился
      if (status !== undefined && status !== oldOrder.status) {
        try {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, source, changed_by_id, comment) VALUES ($1, $2, $3, $4, $5)',
            [orderId, status, 'admin', req.adminUserId || null, status_comment || null]
          );
        } catch (historyError) {
          // Игнорируем ошибку, если таблица не существует
          if (!historyError.message.includes('does not exist')) {
            console.error('Ошибка записи в историю статусов:', historyError);
          }
        }
        
        // Если статус меняется на CANCELED, откатываем бонусы
        if (status === 'CANCELED' && oldOrder.user_id) {
          try {
            // Откатываем бонусы: возвращаем использованные, убираем начисленные
            await client.query(
              `UPDATE users 
               SET bonuses = bonuses + $1 - $2
               WHERE id = $3`,
              [oldOrder.bonus_used || 0, oldOrder.bonus_earned || 0, oldOrder.user_id]
            );
            
            // Создаем транзакции для отката бонусов
            if (oldOrder.bonus_used > 0) {
              await client.query(
                `INSERT INTO bonus_transactions (user_id, order_id, type, amount, description)
                 VALUES ($1, $2, 'adjustment', $3, $4)`,
                [oldOrder.user_id, orderId, oldOrder.bonus_used, `Возврат бонусов при отмене заказа #${orderId}`]
              );
            }
            if (oldOrder.bonus_earned > 0) {
              await client.query(
                `INSERT INTO bonus_transactions (user_id, order_id, type, amount, description)
                 VALUES ($1, $2, 'adjustment', $3, $4)`,
                [oldOrder.user_id, orderId, -oldOrder.bonus_earned, `Списание начисленных бонусов при отмене заказа #${orderId}`]
              );
            }
          } catch (bonusError) {
            console.error('Ошибка отката бонусов:', bonusError);
          }
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
app.get('/api/admin/warehouse', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          p.id,
          p.name,
          p.type,
          p.color,
          p.price_per_stem as price,
          p.image_url,
          20 as min_stock,
          p.is_active,
          COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) as total_supplied,
          COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) as total_sold,
          COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as total_written_off,
          COALESCE(SUM(CASE WHEN sm.type = 'SUPPLY' THEN sm.quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN sm.type = 'SALE' THEN sm.quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN sm.type = 'WRITE_OFF' THEN sm.quantity ELSE 0 END), 0) as stock
        FROM products p
        LEFT JOIN stock_movements sm ON p.id = sm.product_id
        WHERE p.is_active = true
        GROUP BY p.id, p.name, p.type, p.color, p.price_per_stem, p.image_url, p.is_active
        ORDER BY p.name`
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
app.post('/api/admin/warehouse', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { product_id, quantity, purchase_price, delivery_date, comment } = req.body;
  
  if (!product_id || !quantity || !purchase_price || !delivery_date) {
    return res.status(400).json({ error: 'Товар, количество, цена закупки и дата поставки обязательны' });
  }
  
  // Валидация
  const quantityInt = parseInt(quantity);
  // Используем parseFloat и округляем до 2 знаков для DECIMAL(10,2)
  const purchasePriceFloat = parseFloat(purchase_price);
  
  if (!Number.isInteger(quantityInt) || quantityInt <= 0) {
    return res.status(400).json({ error: 'Количество должно быть целым числом больше 0' });
  }
  
  if (isNaN(purchasePriceFloat) || purchasePriceFloat <= 0) {
    return res.status(400).json({ error: 'Цена закупки должна быть числом больше 0' });
  }
  
  // Округляем до 2 знаков после запятой для DECIMAL(10,2)
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
      
      // Создаем поставку
      const supplyResult = await client.query(
        `INSERT INTO supplies (product_id, quantity, unit_purchase_price, delivery_date, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [product_id, quantityInt, purchasePriceRounded, delivery_date, comment || null]
      );
      
      const supply = supplyResult.rows[0];
      
      // Создаем движение типа SUPPLY
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, supply_id, comment)
         VALUES ($1, 'SUPPLY', $2, $3, $4)`,
        [product_id, quantityInt, supply.id, comment || null]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ Поставка создана: ID=${supply.id}, товар=${product_id}, количество=${quantityInt}`);
      
      // Возвращаем поставку с правильным форматом цены
      const finalSupply = supplyResult.rows[0];
      res.json(finalSupply);
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

// Списание товара со склада
app.post('/api/admin/warehouse/write-off', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { product_id, quantity, comment } = req.body;
  
  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'Товар и количество обязательны' });
  }
  
  const quantityInt = parseInt(quantity);
  if (!Number.isInteger(quantityInt) || quantityInt <= 0) {
    return res.status(400).json({ error: 'Количество должно быть целым числом больше 0' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Проверяем доступный остаток товара
      const stockResult = await client.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN type = 'SUPPLY' THEN quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN type = 'SALE' THEN quantity ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' THEN quantity ELSE 0 END), 0) as available
        FROM stock_movements
        WHERE product_id = $1`,
        [product_id]
      );
      
      const available = parseInt(stockResult.rows[0]?.available || 0);
      
      if (quantityInt > available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Недостаточно товара для списания. Доступно: ${available}, запрошено: ${quantityInt}` 
        });
      }
      
      // Создаем движение типа WRITE_OFF
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity, comment)
         VALUES ($1, 'WRITE_OFF', $2, $3)`,
        [product_id, quantityInt, comment || `Списание товара #${product_id}`]
      );
      
      await client.query('COMMIT');
      
      console.log(`✅ Товар списан: product_id=${product_id}, quantity=${quantityInt}`);
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
          u.telegram_id as customer_telegram_id
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
        customer_name: order.customer_name || order.recipient_name,
        customer_last_name: order.customer_last_name || '',
        customer_phone: order.customer_phone || order.recipient_phone,
        customer_email: order.customer_email,
        customer_telegram_username: order.customer_telegram_username,
        customer_telegram_id: order.customer_telegram_id,
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
  const { status, comment } = req.body;
  
  // Расширенные статусы
  const validStatuses = ['UNPAID', 'NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'COMPLETED', 'CANCELED',
                         'new', 'confirmed', 'preparing', 'assigned', 'in_transit', 'delivered', 'cancelled', 'active', 'completed', 'paid', 'assembly', 'delivery'];
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
      
      // Записываем в историю статусов (если таблица существует)
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
      
      // Записываем в историю (если таблица существует)
      try {
        await client.query(
          'INSERT INTO order_status_history (order_id, status, changed_by, comment) VALUES ($1, $2, $3, $4)',
          [id, 'assigned', 'admin', `Назначен курьер ID: ${courier_id}`]
        );
      } catch (historyError) {
        // Игнорируем ошибку, если таблица не существует
        if (!historyError.message.includes('does not exist')) {
          console.error('Ошибка записи в историю статусов:', historyError);
        }
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
// API: Получить список доставок
app.get('/api/admin/delivery', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  try {
    const client = await pool.connect();
    try {
      // Получаем заказы с доставкой (где есть delivery_date или статус delivery)
      const result = await client.query(`
        SELECT 
          o.id as order_id,
          o.recipient_name,
          o.recipient_phone,
          o.address_string,
          o.address_json,
          o.delivery_date,
          o.delivery_time,
          o.status,
          o.comment,
          u.telegram_id,
          u.username
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.delivery_date IS NOT NULL
           OR o.status IN ('DELIVERING', 'NEW', 'PROCESSING', 'COLLECTING')
        ORDER BY 
          CASE 
            WHEN o.delivery_date IS NOT NULL THEN o.delivery_date
            ELSE o.created_at
          END ASC,
          o.delivery_time ASC
      `);
      
      const deliveries = result.rows.map(row => {
        // Формируем адрес из address_string или address_json
        let address = row.address_string;
        if (!address && row.address_json) {
          const addrData = typeof row.address_json === 'object' 
            ? row.address_json 
            : JSON.parse(row.address_json);
          if (addrData) {
            const parts = [];
            if (addrData.city) parts.push(addrData.city);
            if (addrData.street) parts.push(addrData.street);
            if (addrData.house) parts.push(`д. ${addrData.house}`);
            if (addrData.apartment) parts.push(`кв. ${addrData.apartment}`);
            address = parts.join(', ');
          }
        }
        
        return {
          order_id: row.order_id,
          recipient_name: row.recipient_name,
          recipient_phone: row.recipient_phone,
          address_string: address || row.address_string,
          address: address || row.address_string,
          delivery_date: row.delivery_date,
          delivery_time: row.delivery_time,
          delivery_status: row.status, // Используем status заказа как статус доставки
          status: row.status,
          comment: row.comment,
          telegram_id: row.telegram_id, // Используем telegram_id для связи
          telegram_username: row.username // Используем username для связи в Telegram
        };
      });
      
      res.json(deliveries);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения доставок:', error);
    res.status(500).json({ error: 'Ошибка получения доставок' });
  }
});

// API: Обновить статус доставки
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
    'pending': 'NEW',
    'in_transit': 'DELIVERING',
    'delivered': 'COMPLETED',
    'cancelled': 'CANCELED'
  };
  
  const orderStatus = statusMap[status] || status;
  
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [orderStatus, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Заказ не найден' });
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
          'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC',
          [id]
        );
        res.json(result.rows);
      } else {
        // Таблица не существует, возвращаем пустой массив
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

// API: Аналитика
app.get('/api/admin/analytics', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { period = 'month' } = req.query; // today, week, month, 3months, year, custom
  
  try {
    const client = await pool.connect();
    try {
      // Определяем период
      let dateFrom = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      switch (period) {
        case 'today':
          dateFrom = new Date(today);
          break;
        case 'week':
          dateFrom = new Date(today);
          dateFrom.setDate(dateFrom.getDate() - 7);
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
          dateFrom.setMonth(dateFrom.getMonth() - 1);
      }
      
      // Основные метрики
      const metricsResult = await client.query(
        `SELECT 
          COUNT(*) FILTER (WHERE o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')) as total_orders,
          COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')), 0) as total_revenue,
          COUNT(DISTINCT o.user_id) FILTER (WHERE o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')) as unique_customers
        FROM orders o
        WHERE o.created_at >= $1
          AND o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')`,
        [dateFrom]
      );
      
      const metrics = metricsResult.rows[0];
      const avgCheck = metrics.total_orders > 0 ? Math.round(metrics.total_revenue / metrics.total_orders) : 0;
      
      // Заказы по датам
      const ordersByDateResult = await client.query(
        `SELECT 
          DATE(o.created_at) as date,
          COUNT(*) as orders_count,
          COALESCE(SUM(o.total), 0) as revenue
        FROM orders o
        WHERE o.created_at >= $1
          AND o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')
        GROUP BY DATE(o.created_at)
        ORDER BY date DESC`,
        [dateFrom]
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
        WHERE o.created_at >= $1
          AND o.status IN ('NEW','PROCESSING','COLLECTING','DELIVERING','COMPLETED')
        GROUP BY oi.product_id, oi.name
        ORDER BY total_sold DESC
        LIMIT 10`,
        [dateFrom]
      );
      
      res.json({
        period,
        dateFrom: dateFrom.toISOString(),
        metrics: {
          totalRevenue: parseInt(metrics.total_revenue || 0),
          totalOrders: parseInt(metrics.total_orders || 0),
          avgCheck,
          uniqueCustomers: parseInt(metrics.unique_customers || 0)
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
    res.status(500).json({ error: 'Ошибка получения аналитики: ' + error.message });
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
      
      // Получаем историю заказов
      const ordersResult = await client.query(
        `SELECT 
          o.*,
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
        GROUP BY o.id
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
        addresses: addressesResult.rows
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Ошибка получения клиента:', error);
    res.status(500).json({ error: 'Ошибка получения клиента: ' + error.message });
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

// API: Обновить комментарий менеджера
app.put('/api/admin/customers/:id/manager-comment', checkAdminAuth, async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'База данных не подключена' });
  }
  
  const { id } = req.params;
  const userId = parseInt(id);
  const { manager_comment } = req.body;
  
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Неверный ID клиента' });
  }
  
  try {
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE users SET manager_comment = $1 WHERE id = $2',
        [manager_comment || null, userId]
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

