const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());

// Главная страница MiniApp
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint для получения каталога
app.get('/api/products', (req, res) => {
  const products = [
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
  res.json(products);
});

// Путь к файлу для постоянного хранения данных
const DATA_FILE = path.join(__dirname, 'user-data.json');

// Функция загрузки данных из файла
function loadUserData() {
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
function saveUserData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка сохранения данных в файл:', error);
  }
}

// Загружаем данные при старте сервера
const userDataStore = loadUserData();
console.log(`📦 Загружены данные для ${Object.keys(userDataStore).length} пользователей`);

// API endpoint для сохранения данных пользователя
app.post('/api/user-data', (req, res) => {
  const { userId, cart, addresses, profile, activeOrders, completedOrders, bonuses } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }
  
  userDataStore[userId] = {
    cart: cart || [],
    addresses: addresses || [],
    profile: profile || null,
    activeOrders: activeOrders || [],
    completedOrders: completedOrders || [],
    bonuses: bonuses !== undefined ? bonuses : (userDataStore[userId]?.bonuses || 500),
    updatedAt: new Date().toISOString()
  };
  
  // Сохраняем данные в файл для постоянного хранения
  saveUserData(userDataStore);
  
  res.json({ success: true });
});

// API endpoint для загрузки данных пользователя
app.get('/api/user-data/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = userDataStore[userId] || {
    cart: [],
    addresses: [],
    profile: null,
    activeOrders: [],
    completedOrders: [],
    bonuses: 500
  };
  
  res.json(userData);
});

// API endpoint для создания заказа
app.post('/api/orders', (req, res) => {
  const { items, total, address, phone, name, userId } = req.body;
  
  // Здесь можно добавить сохранение в базу данных
  console.log('Новый заказ:', { items, total, address, phone, name, userId });
  
  // Отправляем уведомление в Telegram (опционально)
  // bot.telegram.sendMessage(ADMIN_CHAT_ID, `Новый заказ на сумму ${total}₽`);
  
  res.json({ success: true, orderId: Date.now() });
});

// Запуск Express сервера
const server = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📱 MiniApp доступен по адресу: ${process.env.WEBAPP_URL || `http://localhost:${PORT}`}`);
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
  console.error('Ошибка запуска бота:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

