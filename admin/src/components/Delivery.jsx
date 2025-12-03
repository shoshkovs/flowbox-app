import { useState, useEffect } from 'react';
import { Truck, Phone, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Delivery({ authToken }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState({});

  useEffect(() => {
    loadDeliveries();
  }, []);

  const loadDeliveries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/delivery`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDeliveries(data);
      } else {
        toast.error('Ошибка загрузки доставок');
      }
    } catch (error) {
      console.error('Ошибка загрузки доставок:', error);
      toast.error('Ошибка загрузки доставок');
    } finally {
      setLoading(false);
    }
  };

  const updateDeliveryStatus = async (orderId, newStatus) => {
    setUpdatingStatus(prev => ({ ...prev, [orderId]: true }));
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/delivery/${orderId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        // Обновляем локальное состояние
        setDeliveries(prev => prev.map(d => 
          d.order_id === orderId ? { ...d, delivery_status: newStatus } : d
        ));
        toast.success('Статус доставки обновлен');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка обновления статуса');
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      toast.error('Ошибка обновления статуса');
    } finally {
      setUpdatingStatus(prev => {
        const newState = { ...prev };
        delete newState[orderId];
        return newState;
      });
    }
  };

  const formatPhone = (phone) => {
    if (!phone) return '-';
    // Убираем все нецифровые символы кроме +
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned;
  };

  const formatDateTime = (date, time) => {
    if (!date) return '-';
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    return time ? `${formattedDate} ${time}` : formattedDate;
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      'pending': 'Ожидает доставки',
      'in_transit': 'В пути',
      'delivered': 'Доставлено',
      'cancelled': 'Отменено',
      'active': 'Ожидает доставки',
      'delivery': 'В пути',
      'completed': 'Доставлено',
    };
    return statusMap[status] || status || 'Ожидает доставки';
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'in_transit': 'bg-blue-100 text-blue-800',
      'delivered': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
      'active': 'bg-yellow-100 text-yellow-800',
      'delivery': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Доставка</h1>
          <p className="text-gray-600 mt-1">Список доставок по заказам</p>
        </div>
        <button
          onClick={loadDeliveries}
          className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID заказа</th>
                <th className="text-left py-3 px-4">Получатель</th>
                <th className="text-left py-3 px-4">Телефон</th>
                <th className="text-left py-3 px-4">Адрес</th>
                <th className="text-left py-3 px-4">Дата и время</th>
                <th className="text-left py-3 px-4">Связь</th>
                <th className="text-left py-3 px-4">Статус</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => {
                const phone = formatPhone(delivery.recipient_phone);
                const isUpdating = updatingStatus[delivery.order_id];
                
                return (
                  <tr key={delivery.order_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">#{delivery.order_id}</td>
                    <td className="py-3 px-4">{delivery.recipient_name || '-'}</td>
                    <td className="py-3 px-4">
                      {phone !== '-' ? (
                        <a 
                          href={`tel:${phone}`}
                          className="text-pink-600 hover:text-pink-800 flex items-center gap-1"
                        >
                          <Phone className="w-4 h-4" />
                          {delivery.recipient_phone}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="max-w-xs truncate" title={delivery.address_string || delivery.address}>
                        {delivery.address_string || delivery.address || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {formatDateTime(delivery.delivery_date, delivery.delivery_time)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {phone !== '-' && (
                          <a
                            href={`tel:${phone}`}
                            className="p-2 hover:bg-gray-100 rounded text-blue-600"
                            title="Позвонить"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                        {delivery.telegram_id && (
                          <a
                            href={`tg://user?id=${delivery.telegram_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-100 rounded text-blue-600"
                            title="Написать в Telegram"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={getDeliveryStatusFromOrderStatus(delivery.delivery_status || delivery.status)}
                        onChange={(e) => updateDeliveryStatus(delivery.order_id, e.target.value)}
                        disabled={isUpdating}
                        className={`px-3 py-1 rounded text-sm border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                          isUpdating ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <option value="pending">Ожидает доставки</option>
                        <option value="in_transit">В пути</option>
                        <option value="delivered">Доставлено</option>
                        <option value="cancelled">Отменено</option>
                      </select>
                      {isUpdating && (
                        <span className="ml-2 text-xs text-gray-500">Обновление...</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {deliveries.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Пока нет доставок
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
