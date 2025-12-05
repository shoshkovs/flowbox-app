import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MessageCircle, Edit } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function CustomerDetail({ customer, onClose, authToken, customerId }) {
  const navigate = useNavigate();
  const [customerData, setCustomerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bonusAdjustment, setBonusAdjustment] = useState('');
  const [managerComment, setManagerComment] = useState('');
  const [isEditingBonuses, setIsEditingBonuses] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isAdjustingBonuses, setIsAdjustingBonuses] = useState(false);
  const [recalculatingBonuses, setRecalculatingBonuses] = useState(false);

  // Определяем ID клиента: либо из customer, либо из customerId (telegram_id)
  const clientId = customer?.id || customerId;

  useEffect(() => {
    if (clientId) {
      loadCustomerDetail();
    }
  }, [clientId]);

  const loadCustomerDetail = async () => {
    try {
      // Если customerId - это telegram_id, используем его напрямую
      const url = customerId 
        ? `${API_BASE}/api/admin/customers/telegram/${customerId}`
        : `${API_BASE}/api/admin/customers/${clientId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCustomerData(data);
        setManagerComment(data.manager_comment || '');
      } else {
        toast.error('Ошибка загрузки данных клиента');
      }
    } catch (error) {
      console.error('Ошибка загрузки клиента:', error);
      toast.error('Ошибка загрузки данных клиента');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateBonuses = async () => {
    if (!confirm('Пересчитать бонусы на основе всех заказов? Текущий баланс будет заменен на сумму всех начислений минус все списания.')) {
      return;
    }

    setRecalculatingBonuses(true);
    try {
      const url = customerId 
        ? `${API_BASE}/api/admin/customers/telegram/${customerId}/recalculate-bonuses`
        : `${API_BASE}/api/admin/customers/${clientId}/recalculate-bonuses`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const message = data.previousBalance !== undefined && Math.abs(data.bonuses - data.previousBalance) > 0.01
          ? `Бонусы пересчитаны. Было: ${data.previousBalance.toLocaleString()} ₽, Стало: ${data.bonuses.toLocaleString()} ₽`
          : `Бонусы пересчитаны. Баланс: ${data.bonuses.toLocaleString()} ₽ (без изменений)`;
        toast.success(message);
        await loadCustomerDetail();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка пересчета бонусов');
      }
    } catch (error) {
      console.error('Ошибка пересчета бонусов:', error);
      toast.error('Ошибка пересчета бонусов');
    } finally {
      setRecalculatingBonuses(false);
    }
  };

  const handleBonusAdjustment = async () => {
    const amount = parseInt(bonusAdjustment);
    if (!amount || amount === 0) {
      toast.error('Введите сумму корректировки');
      return;
    }

    setIsAdjustingBonuses(true);
    try {
      const url = customerId 
        ? `${API_BASE}/api/admin/customers/telegram/${customerId}/bonuses`
        : `${API_BASE}/api/admin/customers/${clientId}/bonuses`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });

      if (response.ok) {
        toast.success('Бонусы успешно скорректированы');
        setBonusAdjustment('');
        setIsEditingBonuses(false);
        await loadCustomerDetail();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка корректировки бонусов');
      }
    } catch (error) {
      console.error('Ошибка корректировки бонусов:', error);
      toast.error('Ошибка корректировки бонусов');
    } finally {
      setIsAdjustingBonuses(false);
    }
  };

  const handleSaveComment = async () => {
    setIsSavingComment(true);
    try {
      const url = customerId 
        ? `${API_BASE}/api/admin/customers/telegram/${customerId}/manager-comment`
        : `${API_BASE}/api/admin/customers/${clientId}/manager-comment`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment: managerComment }),
      });

      if (response.ok) {
        toast.success('Комментарий сохранен');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка сохранения комментария');
      }
    } catch (error) {
      console.error('Ошибка сохранения комментария:', error);
      toast.error('Ошибка сохранения комментария');
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleToggleSubscription = async () => {
    // TODO: Implement subscription toggle
    toast.info('Функция управления подпиской будет реализована позже');
  };

  if (loading || !customerData) {
    return <div className="p-6">Загрузка...</div>;
  }

  const customerName = customerData.first_name || customerData.name || 'Не указано';
  const username = customerData.username ? `@${customerData.username}` : '';
  const telegramId = customerData.telegram_id || '';
  const phone = customerData.phone || '-';
  const email = customerData.email || '-';
  const registeredAt = customerData.registered_at || customerData.created_at;
  const lastOrderDate = customerData.stats?.lastOrderDate || customerData.lastOrderDate;
  const ordersCount = customerData.stats?.ordersCount || customer.ordersCount || 0;
  const totalSpent = customerData.stats?.totalSpent || customer.totalSpent || 0;
  const avgCheck = customerData.stats?.avgCheck || (ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0);
  const bonusBalance = customerData.bonuses || customer.bonuses || 0;
  const orders = customerData.orders || [];
  const addresses = customerData.addresses || [];
  const initialBonusTransaction = customerData.initialBonusTransaction || null;

  // Функции для отображения статусов
  const getStatusLabel = (status) => {
    const labels = {
      UNPAID: 'Не оплачен',
      NEW: 'Новый',
      PROCESSING: 'В обработке',
      PURCHASE: 'Закупка',
      COLLECTING: 'Собирается',
      DELIVERING: 'В пути',
      COMPLETED: 'Доставлен',
      CANCELED: 'Отменён',
      // Старые статусы для обратной совместимости
      new: 'Новый',
      active: 'В обработке',
      paid: 'Оплачен',
      purchase: 'Закупка',
      assembly: 'Сборка',
      delivery: 'В пути',
      completed: 'Доставлен',
      cancelled: 'Отменён',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      UNPAID: 'bg-gray-100 text-gray-800',
      NEW: 'bg-yellow-100 text-yellow-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      PURCHASE: 'bg-orange-100 text-orange-800',
      COLLECTING: 'bg-purple-100 text-purple-800',
      DELIVERING: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-green-100 text-green-800',
      CANCELED: 'bg-red-100 text-red-800',
      // Старые статусы для обратной совместимости
      new: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      paid: 'bg-green-100 text-green-800',
      purchase: 'bg-orange-100 text-orange-800',
      assembly: 'bg-purple-100 text-purple-800',
      delivery: 'bg-blue-100 text-blue-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Форматируем адреса
  const formattedAddresses = addresses.map(addr => {
    const addrData = typeof addr.address_json === 'object' ? addr.address_json : 
                     (addr.address_json ? JSON.parse(addr.address_json) : {});
    const parts = [
      addr.city || addrData.city,
      addr.street || addrData.street,
      addr.house ? `д. ${addr.house}` : addrData.house ? `д. ${addrData.house}` : '',
      addr.apartment ? `кв. ${addr.apartment}` : addrData.apartment ? `кв. ${addrData.apartment}` : ''
    ].filter(Boolean);
    return parts.join(', ');
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">{customerName}</h1>
          {username && <p className="text-gray-600 mt-1">{username}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Контактная информация */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Контактная информация</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                  <p className="mt-1">{customerName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Username</label>
                  <p className="mt-1">{username || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                  <button className="w-full mt-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
                    <Phone className="w-4 h-4" />
                    {phone}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telegram ID</label>
                  <p className="mt-1">{telegramId || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Дата регистрации</label>
                  <p className="mt-1">
                    {registeredAt ? new Date(registeredAt).toLocaleDateString('ru-RU') : '-'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Последний заказ</label>
                  <p className="mt-1">
                    {lastOrderDate ? new Date(lastOrderDate).toLocaleDateString('ru-RU') : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* История заказов */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">История заказов</h2>
            <div className="space-y-4">
              {/* Начальные бонусы - показываем перед первым заказом */}
              {initialBonusTransaction && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-600 font-medium">Регистрация</span>
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        Начисление
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Начислено {parseInt(initialBonusTransaction.amount || 0)} бонусов</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-400">
                        {new Date(initialBonusTransaction.created_at).toLocaleDateString('ru-RU')}
                      </p>
                      <p className="text-xs text-green-600 font-medium">
                        +{parseInt(initialBonusTransaction.amount || 0)} ₽ бонусов
                      </p>
                    </div>
                  </div>
                  <p className="font-medium text-green-600">+{parseInt(initialBonusTransaction.amount || 0)} ₽</p>
                </div>
              )}
              
              {orders.length > 0 ? (
                orders.map((order) => {
                  const itemsText = order.items && Array.isArray(order.items) 
                    ? order.items.map(item => `${item.name} ${item.quantity} шт`).join(', ')
                    : 'Товары не указаны';

                  const bonusEarned = parseInt(order.bonus_earned || 0);
                  
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span 
                            className="text-blue-600 font-medium cursor-pointer hover:text-blue-800 hover:underline"
                            onClick={() => navigate(`/orders/${order.id}`)}
                            title="Открыть детали заказа"
                          >
                            #{order.id}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{itemsText}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-gray-400">
                            {new Date(order.created_at).toLocaleDateString('ru-RU')}
                          </p>
                          {(() => {
                            const bonusUsed = parseInt(order.bonus_used || 0);
                            const bonusEarned = parseInt(order.bonus_earned || 0);
                            return (
                              <>
                                {bonusUsed > 0 && (
                                  <p className="text-xs text-red-600 font-medium">
                                    -{bonusUsed} ₽ бонусов
                                  </p>
                                )}
                                {bonusEarned > 0 && (
                                  <p className="text-xs text-green-600 font-medium">
                                    +{bonusEarned} ₽ бонусов
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <p className="font-medium">{parseInt(order.total || 0).toLocaleString()} ₽</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-8">Нет заказов</p>
              )}
            </div>
          </div>

          {/* Адреса доставки */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Адреса доставки</h2>
            <div className="space-y-3">
              {formattedAddresses.length > 0 ? (
                formattedAddresses.map((address, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg">
                    {address}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">Нет сохраненных адресов</p>
              )}
            </div>
          </div>
        </div>

        {/* Правая колонка */}
        <div className="space-y-6">
          {/* Статистика */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Статистика</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Количество заказов</label>
                <p className="text-2xl mt-1 font-bold">{ordersCount}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сумма покупок</label>
                <p className="text-2xl mt-1 font-bold">{totalSpent.toLocaleString()} ₽</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Средний чек</label>
                <p className="text-2xl mt-1 font-bold">{avgCheck.toLocaleString()} ₽</p>
              </div>
            </div>
          </div>

          {/* Подписка */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Подписка</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <p className="text-2xl mt-1">
                  {customerData.subscription?.active ? (
                    <span className="text-green-600 font-bold">Активна</span>
                  ) : (
                    <span className="text-gray-600 font-bold">Не активна</span>
                  )}
                </p>
              </div>
              {customerData.subscription?.active && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Дата начала</label>
                    <p className="mt-1">
                      {new Date(customerData.subscription.startDate).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Дата окончания</label>
                    <p className="mt-1">
                      {new Date(customerData.subscription.endDate).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                </>
              )}
              <button
                onClick={handleToggleSubscription}
                className={`w-full px-4 py-2 rounded-lg transition-colors ${
                  customerData.subscription?.active
                    ? 'border border-gray-300 hover:bg-gray-50'
                    : 'bg-pink-600 text-white hover:bg-pink-700'
                }`}
              >
                {customerData.subscription?.active ? 'Отменить подписку' : 'Активировать подписку'}
              </button>
            </div>
          </div>

          {/* Бонусы */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Бонусы</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRecalculateBonuses}
                  disabled={recalculatingBonuses}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  title="Пересчитать бонусы на основе истории заказов"
                >
                  {recalculatingBonuses ? 'Пересчет...' : 'Пересчитать'}
                </button>
                <button
                  onClick={() => setIsEditingBonuses(!isEditingBonuses)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Текущий баланс</label>
              <p className="text-2xl mt-1 text-green-600 font-bold">
                {bonusBalance.toLocaleString()} ₽
              </p>
            </div>
            {isEditingBonuses && (
              <div className="mt-4">
                <label htmlFor="bonusAdjust" className="block text-sm font-medium text-gray-700 mb-1">
                  Корректировка
                </label>
                <div className="flex gap-2 mt-2">
                  <input
                    id="bonusAdjust"
                    type="number"
                    value={bonusAdjustment}
                    onChange={(e) => setBonusAdjustment(e.target.value)}
                    placeholder="Сумма"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleBonusAdjustment}
                    disabled={isAdjustingBonuses}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isAdjustingBonuses ? '...' : 'Применить'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Комментарии менеджера */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Комментарии менеджера</h2>
            <textarea
              value={managerComment}
              onChange={(e) => setManagerComment(e.target.value)}
              placeholder="Заметки о клиенте..."
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleSaveComment}
              disabled={isSavingComment}
              className="w-full mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {isSavingComment ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>

          {/* Кнопки действий */}
          <div className="flex gap-3">
            <a
              href={`tel:${phone}`}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Позвонить
            </a>
            {telegramId && (
              <a
                href={`https://t.me/${telegramId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Написать
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
