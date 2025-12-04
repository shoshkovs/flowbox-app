import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Clock, MapPin, User, Phone, Package, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function OrderDetail({ authToken, orderId }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [internalComment, setInternalComment] = useState('');
  const [courierComment, setCourierComment] = useState('');
  const [userComment, setUserComment] = useState('');

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
        setUserComment(orderData.user_comment || '');
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
          address_json: order.address_data || order.address_json || null,
          internal_comment: internalComment || null,
          courier_comment: courierComment || null,
          user_comment: userComment || null,
        }),
      });

      if (response.ok) {
        const updatedOrder = await response.json();
        setOrder(updatedOrder);
        await loadOrderDetails();
        toast.success('Изменения сохранены');
        // Автоматически возвращаемся на страницу заказов
        setTimeout(() => {
          navigate('/orders');
        }, 500);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка сохранения изменений' }));
        console.error('Ошибка сохранения заказа:', errorData);
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

  const formatAddressDetails = (order) => {
    if (order.address_data && typeof order.address_data === 'object') {
      const addr = order.address_data;
      const details = [];
      if (addr.entrance) details.push(`парадная ${addr.entrance}`);
      if (addr.floor) details.push(`этаж ${addr.floor}`);
      if (addr.intercom) details.push(`домофон ${addr.intercom}`);
      if (details.length === 0 && addr.intercom === 'нет') {
        details.push('домофон нет');
      }
      return details.join(', ');
    }
    return '';
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

  const subtotal = parseFloat(order.flowers_total || 0);
  const delivery = parseFloat(order.delivery_price || 0);
  const serviceFee = parseFloat(order.service_fee || 0);
  const bonusUsed = parseFloat(order.bonus_used || 0);
  const bonusEarned = parseFloat(order.bonus_earned || 0);
  const total = parseFloat(order.total || 0);

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой назад */}
      <div className="flex items-center justify-between">
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
        </div>
        <button
          onClick={updateOrderStatus}
          disabled={saving}
          className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая колонка (2/3 ширины) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Основная информация */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Основная информация</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">ID заказа</label>
                  <p className="text-gray-900">#{order.id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Текущий статус</label>
                  <select
                    value={order.status || 'NEW'}
                    onChange={(e) => setOrder({ ...order, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  >
                    <option value="UNPAID">Не оплачен</option>
                    <option value="NEW">Новый</option>
                    <option value="PROCESSING">В обработке</option>
                    <option value="PURCHASE">Закупка</option>
                    <option value="COLLECTING">Собирается</option>
                    <option value="DELIVERING">В пути</option>
                    <option value="COMPLETED">Доставлен</option>
                    <option value="CANCELED">Отменён</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Дата создания</label>
                  <p className="text-gray-900">
                    {order.created_at ? new Date(order.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Канал</label>
                  <p className="text-gray-900">Мини-апп Telegram</p>
                </div>
              </div>
            </div>
          </div>

          {/* Состав заказа */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Состав заказа</h2>
            <div className="space-y-4">
              {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                order.items.map((item, index) => {
                  const productImage = item.product_image || getProductImage(item.product_id);
                  const itemTotal = (parseFloat(item.price || 0) * parseInt(item.quantity || 1));
                  return (
                    <div key={item.id || index} className="flex items-center gap-4 pb-4 border-b last:border-0">
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
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {item.price_per_stem ? `${item.price_per_stem} ₽` : `${item.price} ₽`} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium text-gray-900">
                        {itemTotal.toLocaleString('ru-RU')} ₽
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500">Товары не найдены</p>
              )}
              <div className="pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Товары</span>
                  <span className="text-gray-900">{subtotal.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Доставка</span>
                  <span className="text-gray-900">{delivery.toLocaleString('ru-RU')} ₽</span>
                </div>
                {bonusUsed > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Использовано бонусов</span>
                    <span>-{bonusUsed.toLocaleString('ru-RU')} ₽</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-blue-600">
                  <span>Начислено бонусов</span>
                  <span>+{bonusEarned.toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Итого к оплате</span>
                  <span className="text-xl font-semibold text-pink-600">
                    {total.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Клиент и получатель */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Клиент и получатель</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-3">Клиент</h3>
                  <div className="space-y-2">
                    <p className="text-gray-900">{order.customer_name || '-'}</p>
                    <button className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
                      <Phone className="w-4 h-4" />
                      {order.customer_phone || order.client_phone || '-'}
                    </button>
                    {(order.customer_email || order.client_email) && (
                      <p className="text-sm text-gray-600">{order.customer_email || order.client_email}</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-3">Получатель</h3>
                  <div className="space-y-2">
                    <p className="text-gray-900">{order.recipient_name || order.customer_name || '-'}</p>
                    {order.recipient_phone && (
                      <button className="w-full px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 text-sm">
                        <Phone className="w-4 h-4" />
                        {order.recipient_phone}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Доставка */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Доставка</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-600 mb-1">Адрес доставки</p>
                  <p className="text-gray-900">{formatAddress(order)}</p>
                  {formatAddressDetails(order) && (
                    <p className="text-sm text-gray-500 mt-1">{formatAddressDetails(order)}</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-600 mb-1">Время доставки</p>
                  <p className="text-gray-900">
                    {order.delivery_date 
                      ? `${new Date(order.delivery_date).toLocaleDateString('ru-RU')} • ${order.delivery_time || ''}`
                      : '-'}
                  </p>
                </div>
              </div>
              {order.courier_comment && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Комментарий к доставке</p>
                    <p className="text-gray-700">{order.courier_comment}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Правая колонка (1/3 ширины) */}
        <div className="space-y-6">
          {/* История статусов */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">История статусов</h2>
            <div className="space-y-2">
              {orderHistory.length > 0 ? (
                orderHistory.map((item, index) => {
                  const dateTime = item.created_at 
                    ? new Date(item.created_at).toLocaleString('ru-RU', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })
                    : '-';
                  
                  return (
                    <div key={index} className="flex items-center gap-2 py-1">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                        {getStatusLabel(item.status)}
                      </span>
                      <span className="text-sm text-gray-600">
                        {dateTime}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-sm">История пуста</p>
              )}
            </div>
          </div>

          {/* Комментарии */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Комментарии</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="internalComment" className="block text-sm font-medium mb-2">
                  Внутренний комментарий
                </label>
                <textarea
                  id="internalComment"
                  value={internalComment}
                  onChange={(e) => setInternalComment(e.target.value)}
                  placeholder="Заметки для себя..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="courierComment" className="block text-sm font-medium mb-2">
                  Для курьера
                </label>
                <textarea
                  id="courierComment"
                  value={courierComment}
                  onChange={(e) => setCourierComment(e.target.value)}
                  placeholder="Инструкции для курьера..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="userComment" className="block text-sm font-medium mb-2">
                  Особые пожелания к заказу
                </label>
                <textarea
                  id="userComment"
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  placeholder="Особые пожелания к заказу..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
