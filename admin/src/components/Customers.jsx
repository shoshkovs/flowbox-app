import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Mail, ShoppingBag, Calendar, Eye, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CustomerDetail } from './customers/CustomerDetail';

const API_BASE = window.location.origin;

export function Customers({ authToken }) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubscription, setFilterSubscription] = useState('all');
  const [sortByOrders, setSortByOrders] = useState('none');
  const [sortByTotalSpent, setSortByTotalSpent] = useState('none');
  const [sortByAvgCheck, setSortByAvgCheck] = useState('none');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

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

  const handleRefreshCustomer = async (customerId) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/customers/${customerId}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        await loadCustomers();
        toast.success('Информация о клиенте обновлена');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка обновления клиента');
      }
    } catch (error) {
      console.error('Ошибка обновления клиента:', error);
      toast.error('Ошибка обновления клиента');
    }
  };

  const filteredCustomers = customers.filter(customer => {
    // Если поисковый запрос пустой, показываем всех клиентов
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = query === '' || 
      (customer.name && customer.name.toLowerCase().includes(query)) ||
      (customer.phone && customer.phone.includes(query)) ||
      (customer.email && customer.email.toLowerCase().includes(query)) ||
      (customer.id && customer.id.toString().includes(query));
    
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
    // Считаем по дате создания аккаунта (registered_at или created_at)
    const accountDate = c.registered_at || c.created_at;
    if (!accountDate) return false;
    const userDate = new Date(accountDate);
    const now = new Date();
    return userDate.getMonth() === now.getMonth() && userDate.getFullYear() === now.getFullYear();
  }).length;

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  // Если выбран клиент, показываем детальный вид
  if (selectedCustomer) {
    return (
      <CustomerDetail
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        authToken={authToken}
      />
    );
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
        <div className="flex gap-4 mb-6 items-center">
          <select
            value={filterSubscription}
            onChange={(e) => setFilterSubscription(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="all">Все клиенты</option>
            <option value="subscribed">На подписке</option>
            <option value="not_subscribed">Без подписки</option>
          </select>
          <select
            value={sortByOrders}
            onChange={(e) => setSortByOrders(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="none">По заказам</option>
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
          <select
            value={sortByTotalSpent}
            onChange={(e) => setSortByTotalSpent(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="none">По сумме покупок</option>
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
          <select
            value={sortByAvgCheck}
            onChange={(e) => setSortByAvgCheck(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="none">По среднему чеку</option>
            <option value="asc">По возрастанию</option>
            <option value="desc">По убыванию</option>
          </select>
          <div className="flex-1"></div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени или телефону..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
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
                <th className="text-left py-3 px-4">Средний чек</th>
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
                    <div className="font-medium">{customer.name || 'Не указано'}</div>
                    {customer.telegram_id && (
                      <div className="text-sm text-gray-500">@{customer.telegram_id}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {customer.phone || '-'}
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
                    {customer.ordersCount && customer.ordersCount > 0 
                      ? Math.round((customer.totalSpent || 0) / customer.ordersCount).toLocaleString() + ' ₽'
                      : '0 ₽'}
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
                        onClick={() => {
                          if (customer.id) {
                            navigate(`/customers/${customer.id}`);
                          } else {
                            setSelectedCustomer(customer);
                          }
                        }}
                        className="p-2 hover:bg-gray-100 rounded text-gray-600"
                        title="Просмотреть детали"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {customer.telegram_id && (
                        <a
                          href={`tg://resolve?domain=${customer.telegram_id}`}
                          className="p-2 hover:bg-gray-100 rounded text-gray-600"
                          title="Telegram"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleRefreshCustomer(customer.id)}
                        className="p-2 hover:bg-gray-100 rounded text-gray-600"
                        title="Обновить информацию"
                      >
                        <RefreshCw className="w-4 h-4" />
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
    </div>
  );
}
