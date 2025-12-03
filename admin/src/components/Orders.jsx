import { useState, useEffect } from 'react';
import { Eye, Phone, RefreshCw, ArrowLeft, Save, Clock, MapPin, User, Package } from 'lucide-react';

const API_BASE = window.location.origin;

export function Orders({ authToken }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [statusComment, setStatusComment] = useState('');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    loadOrders();
    loadProducts();
  }, [filterStatus]);

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
    }
  };

  const getProductImage = (productId) => {
    const product = products.find(p => p.id === productId);
    return product?.image_url || null;
  };

  const loadOrders = async () => {
    try {
      const url = filterStatus !== 'all' 
        ? `${API_BASE}/api/admin/orders?status=${filterStatus}`
        : `${API_BASE}/api/admin/orders`;
        
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrderDetails = async (orderId) => {
    try {
      const [orderRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/orders/${orderId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        }),
        fetch(`${API_BASE}/api/admin/orders/${orderId}/history`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        })
      ]);

      if (orderRes.ok && historyRes.ok) {
        const orderData = await orderRes.json();
        const historyData = await historyRes.json();
        setSelectedOrder(orderData);
        setOrderHistory(historyData);
      }
    } catch (error) {
      console.error('Ошибка загрузки деталей заказа:', error);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
          comment: statusComment || null,
        }),
      });

      if (response.ok) {
        await loadOrders();
        await loadOrderDetails(orderId);
        setStatusComment('');
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      alert('Ошибка обновления статуса заказа');
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      new: 'Новый',
      active: 'Активный',
      paid: 'Оплачен',
      purchase: 'Закупка',
      assembly: 'Сборка',
      delivery: 'Доставка',
      completed: 'Завершен',
      cancelled: 'Отменен',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
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

  const formatAddress = (order) => {
    if (order.address_string) {
      return order.address_string;
    }
    if (order.address_data && typeof order.address_data === 'object') {
      const addr = order.address_data;
      const parts = [];
      if (addr.city) parts.push(addr.city);
      if (addr.street) parts.push(addr.street);
      if (addr.house) parts.push(`д. ${addr.house}`);
      if (addr.apartment) parts.push(`кв. ${addr.apartment}`);
      if (addr.entrance) parts.push(`парадная ${addr.entrance}`);
      if (addr.floor) parts.push(`этаж ${addr.floor}`);
      if (addr.intercom) parts.push(`домофон ${addr.intercom}`);
      return parts.join(', ') || 'Адрес не указан';
    }
    return 'Адрес не указан';
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      {!selectedOrder ? (
        <>
          <div>
            <h1 className="text-3xl font-bold">Заказы</h1>
            <p className="text-gray-600 mt-1">Управление заказами клиентов</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {['all', 'new', 'paid', 'assembly', 'delivery', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm ${
                  filterStatus === status
                    ? 'bg-pink-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {getStatusLabel(status)} ({orders.filter(o => status === 'all' || o.status === status).length})
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4">ID</th>
                    <th className="text-left py-3 px-4">Дата</th>
                    <th className="text-left py-3 px-4">Статус</th>
                    <th className="text-left py-3 px-4">Клиент</th>
                    <th className="text-left py-3 px-4">Получатель</th>
                    <th className="text-left py-3 px-4">Сумма</th>
                    <th className="text-left py-3 px-4">Доставка</th>
                    <th className="text-right py-3 px-4">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr 
                      key={order.id} 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => loadOrderDetails(order.id)}
                    >
                      <td className="py-3 px-4">
                        <span className="text-blue-600 font-medium">#{order.id}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {order.created_at ? new Date(order.created_at).toLocaleString('ru-RU') : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <div>{order.customer_name || '-'}</div>
                          <div className="text-sm text-gray-500">{order.customer_phone || '-'}</div>
                        </div>
                      </td>
                  <td className="py-3 px-4">
                    <div>
                      <div>{order.recipient_name || order.customer_name || '-'}</div>
                      <div className="text-sm text-gray-500">
                        {order.recipient_phone || order.customer_phone || '-'}
                      </div>
                    </div>
                  </td>
                      <td className="py-3 px-4 font-semibold">
                        {parseFloat(order.total || 0).toLocaleString()} ₽
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          <div>{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('ru-RU') : '-'}</div>
                          <div className="text-gray-500">{order.delivery_time || '-'}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              loadOrderDetails(order.id);
                            }}
                            className="p-2 hover:bg-gray-100 rounded"
                            title="Просмотр"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Заголовок с кнопкой назад */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedOrder(null);
                setOrderHistory([]);
                setStatusComment('');
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold">Заказ #{selectedOrder.id}</h1>
              <p className="text-gray-600 mt-1">
                Создан {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString('ru-RU') : '-'}
              </p>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => updateOrderStatus(selectedOrder.id, selectedOrder.status)}
                className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Сохранить изменения
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Левая колонка */}
            <div className="space-y-6">
              {/* Основная информация */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Основная информация</h2>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600">ID заказа:</span>
                    <span className="ml-2 font-medium">#{selectedOrder.id}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Дата создания:</span>
                    <span className="ml-2">
                      {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString('ru-RU') : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Текущий статус:</span>
                    <select
                      value={selectedOrder.status || 'new'}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, status: e.target.value })}
                      className="ml-2 px-3 py-1 border border-gray-300 rounded-lg"
                    >
                      <option value="new">Новый</option>
                      <option value="paid">Оплачен</option>
                      <option value="assembly">Сборка</option>
                      <option value="delivery">Доставка</option>
                      <option value="completed">Завершен</option>
                      <option value="cancelled">Отменен</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-gray-600">Канал:</span>
                    <span className="ml-2">Мини-апп Telegram</span>
                  </div>
                </div>
              </div>

              {/* Клиент и получатель */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Клиент и получатель</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Клиент</span>
                    </div>
                    <div className="ml-6">
                      <div>{selectedOrder.customer_name || '-'}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedOrder.customer_phone || '-'}
                      </div>
                      {selectedOrder.customer_email && (
                        <div className="text-sm text-gray-600">{selectedOrder.customer_email}</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Получатель</span>
                    </div>
                    <div className="ml-6">
                      <div>{selectedOrder.recipient_name || selectedOrder.customer_name || '-'}</div>
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedOrder.recipient_phone || selectedOrder.customer_phone || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Доставка */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Доставка</h2>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Адрес доставки</span>
                    </div>
                    <div className="ml-6 text-gray-700">
                      {formatAddress(selectedOrder)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">Дата и время</span>
                    </div>
                    <div className="ml-6">
                      <div>
                        {selectedOrder.delivery_date 
                          ? new Date(selectedOrder.delivery_date).toLocaleDateString('ru-RU')
                          : '-'}
                      </div>
                      <div className="text-sm text-gray-600">{selectedOrder.delivery_time || '-'}</div>
                    </div>
                  </div>
                  {selectedOrder.comment && (
                    <div>
                      <span className="font-medium">Комментарий:</span>
                      <div className="mt-1 text-gray-700">{selectedOrder.comment}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Комментарий к доставке */}
              {selectedOrder.comment && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold mb-4">Комментарий к доставке</h2>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-700">{selectedOrder.comment}</p>
                  </div>
                </div>
              )}

              {/* Состав заказа */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Состав заказа</h2>
                <div className="space-y-4">
                  {selectedOrder.items && Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                    selectedOrder.items.map((item, index) => {
                      const productImage = getProductImage(item.product_id);
                      return (
                        <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                          {productImage ? (
                            <img
                              src={productImage}
                              alt={item.name}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {item.price} ₽ × {item.quantity}
                            </div>
                          </div>
                          <div className="font-semibold text-lg">
                            {(parseFloat(item.price || 0) * parseInt(item.quantity || 1)).toLocaleString()} ₽
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gray-500">Товары не найдены</p>
                  )}
                  <div className="border-t pt-4 mt-4 space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Товары:</span>
                      <span>{parseFloat(selectedOrder.flowers_total || 0).toLocaleString()} ₽</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Доставка:</span>
                      <span>{parseFloat(selectedOrder.delivery_price || 0).toLocaleString()} ₽</span>
                    </div>
                    <div className="flex justify-between text-sm text-pink-600 pt-2 border-t">
                      <span>Начислено бонусов:</span>
                      <span>+{parseFloat(selectedOrder.bonus_earned || 0).toLocaleString()} ₽</span>
                    </div>
                    <div className="flex justify-between font-semibold text-xl pt-2 border-t">
                      <span>Итого к оплате:</span>
                      <span className="text-pink-600">
                        {parseFloat(selectedOrder.total || 0).toLocaleString()} ₽
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Правая колонка */}
            <div className="space-y-6">
              {/* История статусов */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">История статусов</h2>
                <div className="space-y-3">
                  {orderHistory.length > 0 ? (
                    orderHistory.map((historyItem, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-2 py-1 rounded text-xs ${getStatusColor(historyItem.status)}`}>
                            {getStatusLabel(historyItem.status)}
                          </span>
                          <span className="text-sm text-gray-600">
                            {historyItem.created_at ? new Date(historyItem.created_at).toLocaleString('ru-RU') : '-'}
                          </span>
                        </div>
                        {historyItem.comment && (
                          <div className="text-sm text-gray-700 mt-1">{historyItem.comment}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          Изменено: {historyItem.changed_by || 'Система'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">История пуста</p>
                  )}
                </div>
              </div>

              {/* Комментарии */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Комментарии</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Внутренний комментарий</label>
                    <textarea
                      placeholder="Заметки для себя..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
                      rows="4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Для курьера</label>
                    <textarea
                      placeholder="Инструкции для курьера..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
                      rows="4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Комментарий к изменению статуса</label>
                    <textarea
                      value={statusComment}
                      onChange={(e) => setStatusComment(e.target.value)}
                      placeholder="Добавить комментарий..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
                      rows="3"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

