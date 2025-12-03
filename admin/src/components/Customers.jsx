import { useState, useEffect } from 'react';
import { User, Phone, Mail, ShoppingBag, Calendar } from 'lucide-react';

const API_BASE = window.location.origin;

export function Customers({ authToken }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

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
        // Если endpoint не существует, получаем из заказов
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
        // Группируем заказы по пользователям
        const customersMap = {};
        orders.forEach(order => {
          if (order.user_id) {
            if (!customersMap[order.user_id]) {
              customersMap[order.user_id] = {
                id: order.user_id,
                name: order.customer_name || 'Не указано',
                phone: order.customer_phone || '-',
                email: order.customer_email || '-',
                ordersCount: 0,
                totalSpent: 0,
                lastOrderDate: null,
                orders: [],
              };
            }
            customersMap[order.user_id].ordersCount++;
            customersMap[order.user_id].totalSpent += parseFloat(order.total_amount) || 0;
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
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.phone.includes(query) ||
      customer.email.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Клиенты</h1>
        <p className="text-gray-600 mt-1">База клиентов и история покупок</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-6">
          <input
            type="text"
            placeholder="Поиск по имени, телефону или email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Имя</th>
                <th className="text-left py-3 px-4">Телефон</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Заказов</th>
                <th className="text-left py-3 px-4">Потрачено</th>
                <th className="text-left py-3 px-4">Последний заказ</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <td className="py-3 px-4 text-gray-600">#{customer.id}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      {customer.name}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {customer.phone}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      {customer.email}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-gray-400" />
                      {customer.ordersCount}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {customer.totalSpent.toLocaleString()} ₽
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {customer.lastOrderDate
                      ? new Date(customer.lastOrderDate).toLocaleDateString('ru-RU')
                      : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomer(customer);
                      }}
                      className="text-pink-600 hover:text-pink-700 text-sm font-medium"
                    >
                      Подробнее
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredCustomers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {searchQuery ? 'Клиенты не найдены' : 'Нет клиентов'}
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
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{selectedCustomer.email}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Статистика</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Всего заказов</div>
                    <div className="text-2xl font-bold">{selectedCustomer.ordersCount}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Потрачено</div>
                    <div className="text-2xl font-bold">{selectedCustomer.totalSpent.toLocaleString()} ₽</div>
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
                          <span className="font-semibold">{parseFloat(order.total_amount || 0).toLocaleString()} ₽</span>
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
