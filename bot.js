const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// Статические файлы для MiniApp
app.use(express.static(path.join(__dirname, 'public')));
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
      name: 'Букет роз',
      description: 'Красные розы, 11 штук',
      price: 2500,
      image: 'https://via.placeholder.com/300x300?text=Розы'
    },
    {
      id: 2,
      name: 'Букет тюльпанов',
      description: 'Яркие тюльпаны, 15 штук',
      price: 1800,
      image: 'https://via.placeholder.com/300x300?text=Тюльпаны'
    },
    {
      id: 3,
      name: 'Смешанный букет',
      description: 'Разноцветные цветы',
      price: 2200,
      image: 'https://via.placeholder.com/300x300?text=Смешанный'
    },
    {
      id: 4,
      name: 'Букет хризантем',
      description: 'Белые хризантемы, 9 штук',
      price: 1500,
      image: 'https://via.placeholder.com/300x300?text=Хризантемы'
    },
    {
      id: 5,
      name: 'Романтический букет',
      description: 'Розы и пионы',
      price: 3500,
      image: 'https://via.placeholder.com/300x300?text=Романтика'
    },
    {
      id: 6,
      name: 'Букет лилий',
      description: 'Белые лилии, 7 штук',
      price: 2800,
      image: 'https://via.placeholder.com/300x300?text=Лилии'
    }
  ];
  res.json(products);
});

// API endpoint для создания заказа
app.post('/api/orders', (req, res) => {
  const { items, total, address, phone, name } = req.body;
  
  // Здесь можно добавить сохранение в базу данных
  console.log('Новый заказ:', { items, total, address, phone, name });
  
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

