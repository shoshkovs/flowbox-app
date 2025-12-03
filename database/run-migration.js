const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Получаем строку подключения из переменной окружения или аргумента командной строки
const connectionString = process.env.DATABASE_URL || process.argv[2];

if (!connectionString) {
  console.error('❌ Ошибка: DATABASE_URL не установлен');
  console.log('💡 Использование: node database/run-migration.js [connection_string]');
  console.log('💡 Или установи переменную DATABASE_URL в .env файле');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString.includes('render.com') || 
       connectionString.includes('supabase') || 
       connectionString.includes('neon')
    ? { rejectUnauthorized: false } 
    : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔌 Подключение к базе данных...');
    
    // Читаем SQL файл миграции
    const sqlFile = path.join(__dirname, 'fix-missing-columns.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📋 Выполнение миграции...');
    console.log('---');
    
    // Выполняем SQL
    await client.query(sql);
    
    console.log('---');
    console.log('✅ Миграция выполнена успешно!');
    
    // Проверяем результат
    console.log('\n🔍 Проверка структуры таблиц:');
    const result = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name IN ('users', 'addresses', 'orders')
        AND column_name = 'updated_at'
      ORDER BY table_name
    `);
    
    if (result.rows.length === 0) {
      console.log('⚠️  Колонка updated_at не найдена ни в одной таблице');
    } else {
      console.log('✅ Найдены колонки updated_at:');
      result.rows.forEach(row => {
        console.log(`   - ${row.table_name}.${row.column_name} (${row.data_type})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка при выполнении миграции:', error.message);
    console.error('Детали:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

