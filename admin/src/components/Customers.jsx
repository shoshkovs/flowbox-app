import { useState, useEffect } from 'react';
import { User, Phone, Mail, ShoppingBag, Calendar, Eye, Search } from 'lucide-react';

const API_BASE = window.location.origin;

export function Customers({ authToken }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubscription, setFilterSubscription] = useState('all');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/customers`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      } else if (response.status === 404) {
        await loadCustomersFromOrders();
      }
    } catch (error) {
      console.error('Ошибка загрузки клиентов:', error);
      await loadCustomersFromOrders();
    } finally {
      setLoading(false);
    }
  };

  const loadCustomersFromOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const orders = await response.json();
        const customersMap = {};
        orders.forEach(order => {
          if (order.user_id) {
            if (!customersMap[order.user_id]) {
              customersMap[order.user_id] = {
                id: order.user_id,
                name: order.customer_name || 'Не указано',
                phone: order.customer_phone || '-',
                email: order.customer_email || '-',
                telegram_id: order.user_id,
                ordersCount: 0,
                totalSpent: 0,
                bonuses: 0,
                lastOrderDate: null,
                orders: [],
                subscription: false, // По умолчанию нет подписки
              };
            }
            customersMap[order.user_id].ordersCount++;
            customersMap[order.user_id].totalSpent += parseFloat(order.total || 0);
            const orderDate = new Date(order.created_at);
            if (!customersMap[order.user_id].lastOrderDate || orderDate > customersMap[order.user_id].lastOrderDate) {
              customersMap[order.user_id].lastOrderDate = orderDate;
            }
            customersMap[order.user_id].orders.push(order);
          }
        });
        setCustomers(Object.values(customersMap));
      }
    } catch (error) {
      console.error('Ошибка загрузки клиентов из заказов:', error);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      customer.name?.toLowerCase().includes(query) ||
      customer.phone?.includes(query) ||
      customer.email?.toLowerCase().includes(query);
    
    const matchesFilter = filterSubscription === 'all' || 
      (filterSubscription === 'subscribed' && customer.subscription) ||
      (filterSubscription === 'not_subscribed' && !customer.subscription);
    
    return matchesSearch && matchesFilter;
  });

  // Статистика
  const totalCustomers = customers.length;
  const subscribedCount = customers.filter(c => c.subscription).length;
  const avgCheck = customers.length > 0 
    ? customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / customers.length 
    : 0;
  const newThisMonth = customers.filter(c => {
    if (!c.lastOrderDate) return false;
    const orderDate = new Date(c.lastOrderDate);
    const now = new Date();
    return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
  }).length;

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Клиенты</h1>
        <p className="text-gray-600 mt-1">База клиентов и история покупок</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Всего клиентов</p>
          <p className="text-2xl font-bold mt-2">{totalCustomers}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-600">На подписке</p>
          <p className="text-2xl font-bold mt-2">{subscribedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Средний чек</p>
          <p className="text-2xl font-bold mt-2">{avgCheck.toLocaleString(undefined, { maximumFractionDigits: 0 })} ₽</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Новых за месяц</p>
          <p className="text-2xl font-bold mt-2">{newThisMonth}</p>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex gap-4 mb-6">
          <select
            value={filterSubscription}
            onChange={(e) => setFilterSubscription(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Все клиенты</option>
            <option value="subscribed">На подписке</option>
            <option value="not_subscribed">Без подписки</option>
          </select>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени или телефону..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {/* Таблица клиентов */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">Клиент</th>
                <th className="text-left py-3 px-4">Контакты</th>
                <th className="text-left py-3 px-4">Заказов</th>
                <th className="text-left py-3 px-4">Сумма покупок</th>
                <th className="text-left py-3 px-4">Бонусы</th>
                <th className="text-left py-3 px-4">Последний заказ</th>
                <th className="text-left py-3 px-4">Подписка</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-3 px-4">
                    <div className="font-medium">{customer.name}</div>
                    {customer.telegram_id && (
                      <div className="text-sm text-gray-500">@{customer.telegram_id}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {customer.phone}
                      </div>
                      {customer.email && customer.email !== '-' && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-3 h-3 text-gray-400" />
                          {customer.email}
                        </div>
                      )}
                      {customer.id && (
                        <div className="text-xs text-gray-500">ID: {customer.id}</div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-gray-400" />
                      {customer.ordersCount || 0}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {(customer.totalSpent || 0).toLocaleString()} ₽
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-pink-600 font-medium">
                      {(customer.bonuses || 0).toLocaleString()} ₽
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {customer.lastOrderDate
                      ? new Date(customer.lastOrderDate).toLocaleDateString('ru-RU')
                      : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      customer.subscription 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {customer.subscription ? 'Активна' : 'Нет'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedCustomer(customer)}
                        className="p-2 hover:bg-gray-100 rounded text-gray-600"
                        title="Просмотр"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => window.open(`tel:${customer.phone}`)}
                        className="p-2 hover:bg-gray-100 rounded text-gray-600"
                        title="Позвонить"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredCustomers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {searchQuery || filterSubscription !== 'all' ? 'Клиенты не найдены' : 'Нет клиентов'}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно с деталями клиента */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Детали клиента</h2>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Информация</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>{selectedCustomer.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{selectedCustomer.phone}</span>
                  </div>
                  {selectedCustomer.email && selectedCustomer.email !== '-' && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span>{selectedCustomer.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Статистика</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Всего заказов</div>
                    <div className="text-2xl font-bold">{selectedCustomer.ordersCount || 0}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Потрачено</div>
                    <div className="text-2xl font-bold">{(selectedCustomer.totalSpent || 0).toLocaleString()} ₽</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Бонусы</div>
                    <div className="text-2xl font-bold text-pink-600">{(selectedCustomer.bonuses || 0).toLocaleString()} ₽</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4">История заказов</h3>
                <div className="space-y-3">
                  {selectedCustomer.orders && selectedCustomer.orders.length > 0 ? (
                    selectedCustomer.orders.slice(0, 10).map((order) => (
                      <div
                        key={order.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">Заказ #{order.id}</span>
                            <span className={`px-2 py-1 rounded text-xs ${
                              order.status === 'completed' ? 'bg-green-100 text-green-800' :
                              order.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {order.status === 'completed' ? 'Завершен' :
                               order.status === 'paid' ? 'Оплачен' : order.status}
                            </span>
                          </div>
                          <span className="font-semibold">{parseFloat(order.total || 0).toLocaleString()} ₽</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {new Date(order.created_at).toLocaleString('ru-RU')}
                        </div>
                        {order.address_string && (
                          <div className="text-sm text-gray-600 mt-1">
                            Адрес: {order.address_string}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">Нет заказов</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
