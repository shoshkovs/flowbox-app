# Структура БД для данных пользователей

## Таблица `users`
Хранит основную информацию о пользователе:
- `id` - внутренний ID пользователя
- `telegram_id` - ID пользователя Telegram (уникальный)
- `username` - Telegram username (@username)
- `first_name` - Имя пользователя
- `last_name` - Фамилия пользователя
- `phone` - Телефон пользователя
- `email` - Email пользователя
- `bonuses` - Бонусные баллы (по умолчанию 500)

## Таблица `addresses`
Хранит сохраненные адреса пользователя:
- `id` - ID адреса
- `user_id` - Связь с пользователем (FK -> users.id)
- `name` - Название адреса ("Мой дом", "Дом мамы")
- `city`, `street`, `house`, `entrance`, `apartment`, `floor`, `intercom`, `comment`
- `is_default` - Адрес по умолчанию

## Таблица `orders`
Хранит все заказы пользователя:
- `id` - ID заказа
- `user_id` - Связь с пользователем (FK -> users.id)
- `status` - Статус заказа:
  - `NEW` - Новый заказ (после оплаты)
  - `PROCESSING` - В обработке
  - `COLLECTING` - Собирается
  - `DELIVERING` - В пути
  - `COMPLETED` - Доставлен (история)
  - `CANCELED` - Отменён
- `total`, `flowers_total`, `service_fee`, `delivery_price`
- `bonus_used`, `bonus_earned`
- `recipient_name`, `recipient_phone` - Данные получателя (могут отличаться от данных клиента)
- `address_string`, `address_json` - Адрес доставки
- `delivery_date`, `delivery_time`
- `comment`

## Логика статусов:

### Активные заказы (в профиле пользователя):
- `NEW` - Новый заказ
- `PROCESSING` - В обработке
- `COLLECTING` - Собирается
- `DELIVERING` - В пути
- `CANCELED` - Отменён (тоже показывается в активных)

### История заказов (завершенные):
- `COMPLETED` - Доставлен

## Связи:
- `users` <-- `addresses` (один ко многим)
- `users` <-- `orders` (один ко многим)
- `orders` <-- `order_items` (один ко многим)

## Получение данных пользователя:
1. **Имя, Телефон, Почта** - из таблицы `users` (first_name, phone, email)
2. **Сохраненные адреса** - из таблицы `addresses` WHERE user_id = ?
3. **Активные заказы** - из таблицы `orders` WHERE user_id = ? AND status IN ('NEW', 'PROCESSING', 'COLLECTING', 'DELIVERING', 'CANCELED')
4. **История заказов** - из таблицы `orders` WHERE user_id = ? AND status = 'COMPLETED'
