import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Phone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Orders({ authToken }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadOrders();
  }, [filterStatus]);

  const handleRefreshOrders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (response.ok) {
        await loadOrders();
        toast.success('Список заказов обновлен');
      } else {
        // Если refresh не работает, просто перезагружаем
        await loadOrders();
      }
    } catch (error) {
      console.error('Ошибка обновления заказов:', error);
      // В случае ошибки просто перезагружаем список
      await loadOrders();
    }
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

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
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
                  onClick={() => navigate(`/orders/${order.id}`)}
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
                          navigate(`/orders/${order.id}`);
                        }}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Просмотр"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {order.customer_phone && (
                        <a
                          href={`tel:${order.customer_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 hover:bg-gray-100 rounded"
                          title="Позвонить"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefreshOrders();
                        }}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Обновить"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

