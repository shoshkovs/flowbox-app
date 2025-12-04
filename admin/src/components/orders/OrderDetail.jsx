import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Clock, MapPin, User, Phone, Package } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function OrderDetail({ authToken, orderId }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusComment, setStatusComment] = useState('');
  const [internalComment, setInternalComment] = useState('');
  const [courierComment, setCourierComment] = useState('');

  useEffect(() => {
    loadOrderDetails();
    loadProducts();
  }, [orderId]);

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

  const loadOrderDetails = async () => {
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

      if (orderRes.ok) {
        const orderData = await orderRes.json();
        setOrder(orderData);
        // Загружаем историю, если endpoint доступен
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setOrderHistory(historyData);
        }
        // Инициализируем комментарии из заказа
        setInternalComment(orderData.internal_comment || '');
        setCourierComment(orderData.courier_comment || '');
      } else if (orderRes.status === 404) {
        setOrder(null);
        toast.error('Заказ не найден');
      } else {
        const errorData = await orderRes.json().catch(() => ({ error: 'Ошибка загрузки заказа' }));
        toast.error(errorData.error || 'Ошибка загрузки заказа');
      }
    } catch (error) {
      console.error('Ошибка загрузки деталей заказа:', error);
      toast.error('Ошибка загрузки заказа');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async () => {
    if (!order) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: order.status,
          recipient_name: order.recipient_name,
          recipient_phone: order.recipient_phone,
          delivery_date: order.delivery_date,
          delivery_time: order.delivery_time,
          comment: order.comment || statusComment || null,
          address_json: order.address_data || order.address_json || null,
          internal_comment: internalComment || null,
          courier_comment: courierComment || null,
        }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        await loadOrderDetails();
        setStatusComment('');
        toast.success('Изменения сохранены');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка сохранения изменений' }));
        console.error('Ошибка сохранения заказа:', errorData);
        // Если статус обновился на сервере, но ответ не OK, все равно перезагружаем данные
        await loadOrderDetails();
        toast.error(errorData.error || 'Ошибка сохранения изменений');
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      toast.error('Ошибка сохранения изменений');
    } finally {
      setSaving(false);
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      UNPAID: 'Не оплачен',
      NEW: 'Новый',
      PROCESSING: 'В обработке',
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

  const getProductImage = (productId) => {
    const product = products.find(p => p.id === productId);
    return product?.image_url || null;
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  if (!order) {
    return <div className="p-6">Заказ не найден</div>;
  }

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой назад */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/orders')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">Заказ #{order.id}</h1>
          <p className="text-gray-600 mt-1">
            Создан {order.created_at ? new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={updateOrderStatus}
            disabled={saving}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить изменения'}
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
                <span className="ml-2 font-medium">#{order.id}</span>
              </div>
              <div>
                <span className="text-gray-600">Дата создания:</span>
                <span className="ml-2">
                  {order.created_at ? new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Текущий статус:</span>
                <select
                  value={order.status || 'NEW'}
                  onChange={(e) => setOrder({ ...order, status: e.target.value })}
                  className="ml-2 px-3 py-1 border border-gray-300 rounded-lg"
                >
                  <option value="UNPAID">Не оплачен</option>
                  <option value="NEW">Новый</option>
                  <option value="PROCESSING">В обработке</option>
                  <option value="COLLECTING">Собирается</option>
                  <option value="DELIVERING">В пути</option>
                  <option value="COMPLETED">Доставлен</option>
                  <option value="CANCELED">Отменён</option>
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
                  <div>{order.customer_name || '-'}</div>
                  <div className="text-sm text-gray-600 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {order.customer_phone || '-'}
                  </div>
                  {order.customer_email && (
                    <div className="text-sm text-gray-600">{order.customer_email}</div>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Получатель</span>
                </div>
                <div className="ml-6">
                  <div>{order.recipient_name || order.customer_name || '-'}</div>
                  {order.recipient_phone && (
                    <div className="text-sm text-gray-600 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${order.recipient_phone}`} className="text-blue-600 hover:underline">
                        {order.recipient_phone}
                      </a>
                    </div>
                  )}
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
                  {formatAddress(order)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Дата и время</span>
                </div>
                <div className="ml-6">
                  <div>
                    {order.delivery_date 
                      ? new Date(order.delivery_date).toLocaleDateString('ru-RU')
                      : '-'}
                  </div>
                  <div className="text-sm text-gray-600">{order.delivery_time || '-'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Комментарии */}
          {(order.user_comment || order.courier_comment || order.status_comment) && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Комментарии</h2>
              <div className="space-y-4">
                {/* Комментарий для флориста (из формы заказа) */}
                {order.user_comment && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-700">Для флориста:</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-700">{order.user_comment}</p>
                    </div>
                  </div>
                )}
                
                {/* Комментарий для курьера */}
                {order.courier_comment && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-700">Инструкции для курьера:</span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-gray-700">{order.courier_comment}</p>
                    </div>
                  </div>
                )}
                
                {/* Комментарий к изменению статуса */}
                {order.status_comment && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-700">Комментарий к изменению статуса:</span>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <p className="text-gray-700">{order.status_comment}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Состав заказа */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Состав заказа</h2>
            <div className="space-y-4">
              {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                order.items.map((item, index) => {
                  const productImage = item.product_image || getProductImage(item.product_id);
                  const itemTotal = (parseFloat(item.price || 0) * parseInt(item.quantity || 1));
                  return (
                    <div key={item.id || index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
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
                          {item.price_per_stem ? `${item.price_per_stem} ₽/шт` : `${item.price} ₽`} × {item.quantity} шт
                        </div>
                      </div>
                      <div className="font-semibold text-lg">
                        {itemTotal.toLocaleString('ru-RU')} ₽
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
                  <span>{parseFloat(order.flowers_total || 0).toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Доставка:</span>
                  <span>{parseFloat(order.delivery_price || 0).toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between text-sm text-pink-600 pt-2 border-t">
                  <span>Начислено бонусов:</span>
                  <span>+{parseFloat(order.bonus_earned || 0).toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between font-semibold text-xl pt-2 border-t">
                  <span>Итого к оплате:</span>
                  <span className="text-pink-600">
                    {parseFloat(order.total || 0).toLocaleString()} ₽
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
                        {historyItem.created_at ? new Date(historyItem.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
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
                  value={internalComment}
                  onChange={(e) => setInternalComment(e.target.value)}
                  placeholder="Заметки для себя..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
                  rows="4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Для курьера</label>
                <textarea
                  value={courierComment}
                  onChange={(e) => setCourierComment(e.target.value)}
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
  );
}

