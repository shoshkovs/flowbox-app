# Использование Direct Link

## Ваша ссылка:
```
https://t.me/FlowboxBot/flowbox_app
```

## Для корректной работы fullscreen используйте с параметрами:
```
https://t.me/FlowboxBot/flowbox_app?startapp=main&mode=fullscreen
```

**Важно:** Параметр `mode=fullscreen` принудительно включает fullscreen режим.

## Как использовать:

### 1. В сообщениях бота
Отправьте пользователям ссылку с параметрами `?startapp=main&mode=fullscreen`:
```
https://t.me/FlowboxBot/flowbox_app?startapp=main&mode=fullscreen
```

### 2. В inline-кнопке бота
Кнопка уже добавлена в команду `/start`:
```javascript
{
  text: '🔗 Открыть через Direct Link',
  url: 'https://t.me/FlowboxBot/flowbox_app?startapp=main&mode=fullscreen'
}
```

### 3. Прямая отправка ссылки
Просто скопируйте и отправьте ссылку пользователю в чате:
```
https://t.me/FlowboxBot/flowbox_app?startapp=main&mode=fullscreen
```

## Важно:
- ✅ Параметр `?startapp=main&mode=fullscreen` **обязателен** для корректной работы fullscreen
- ✅ Параметр `mode=fullscreen` принудительно включает fullscreen режим
- ✅ Без параметра `mode=fullscreen` Mini App может открыться не в fullscreen режиме
- ✅ Direct Link работает лучше, чем Menu Button для fullscreen

## Проверка работы:
1. Откройте ссылку: `https://t.me/FlowboxBot/flowbox_app?startapp=main&mode=fullscreen`
2. Mini App должен открыться на весь экран
3. В коде уже настроено `Telegram.WebApp.expand()` для включения fullscreen
4. Параметр `mode=fullscreen` в URL принудительно включает fullscreen режим
