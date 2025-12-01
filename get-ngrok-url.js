// Скрипт для получения URL от ngrok
const http = require('http');

function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.tunnels && json.tunnels.length > 0) {
            const httpsUrl = json.tunnels.find(t => t.proto === 'https');
            if (httpsUrl) {
              resolve(httpsUrl.public_url);
            } else {
              resolve(json.tunnels[0].public_url);
            }
          } else {
            reject('Туннели не найдены');
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject('Таймаут запроса');
    });
  });
}

// Попытка получить URL с задержками
async function tryGetUrl() {
  for (let i = 0; i < 10; i++) {
    try {
      const url = await getNgrokUrl();
      console.log('\n✅ Ngrok URL получен:');
      console.log('🌐', url);
      console.log('\n📋 Скопируйте этот URL и используйте его в настройках MiniApp в @BotFather');
      process.exit(0);
    } catch (err) {
      if (i < 9) {
        process.stdout.write(`\r⏳ Ожидание запуска ngrok... (${i + 1}/10)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('\n❌ Не удалось получить URL от ngrok');
        console.log('Убедитесь, что ngrok запущен: npx ngrok http 3000');
        process.exit(1);
      }
    }
  }
}

tryGetUrl();

