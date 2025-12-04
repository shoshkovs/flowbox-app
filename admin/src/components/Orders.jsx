import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Phone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Orders({ authToken }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // Храним все заказы для правильного подсчета
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('NEW');

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

  const handleStatusChange = async (orderId, newStatus, e) => {
    e.stopPropagation(); // Предотвращаем переход на страницу заказа
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      if (response.ok) {
        await loadOrders();
        toast.success('Статус заказа обновлен');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка обновления статуса' }));
        toast.error(errorData.error || 'Ошибка обновления статуса');
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      toast.error('Ошибка обновления статуса');
    }
  };

  const loadOrders = async () => {
    try {
      // Всегда загружаем все заказы для правильного подсчета
      const allResponse = await fetch(`${API_BASE}/api/admin/orders`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (allResponse.ok) {
        const allData = await allResponse.json();
        setAllOrders(allData);
        
        // Фильтруем локально
        if (filterStatus === 'all') {
          setOrders(allData);
        } else if (filterStatus === 'processing') {
          // "В обработке" включает только PROCESSING
          const filtered = allData.filter(order => order.status === 'PROCESSING');
          setOrders(filtered);
        } else {
          const filtered = allData.filter(order => order.status === filterStatus);
          setOrders(filtered);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
    } finally {
      setLoading(false);
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
        {[
          { key: 'all', label: 'Все' },
          { key: 'NEW', label: 'Новые' },
          { key: 'processing', label: 'В обработке' },
          { key: 'PURCHASE', label: 'Закупка' },
          { key: 'COLLECTING', label: 'Собирается' },
          { key: 'DELIVERING', label: 'В доставке' },
          { key: 'COMPLETED', label: 'Завершённые' },
          { key: 'CANCELED', label: 'Отменённые' }
        ].map(({ key, label }) => {
          let count = 0;
          if (key === 'all') {
            count = allOrders.length;
          } else if (key === 'processing') {
            count = allOrders.filter(o => o.status === 'PROCESSING').length;
          } else {
            count = allOrders.filter(o => o.status === key).length;
          }
          
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                filterStatus === key
                  ? 'bg-pink-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Состав заказа</th>
                <th className="text-left py-3 px-4">Дата</th>
                <th className="text-left py-3 px-4">Статус</th>
                <th className="text-left py-3 px-4">Клиент</th>
                <th className="text-left py-3 px-4">Сумма</th>
                <th className="text-left py-3 px-4">Доставка</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const orderDate = order.created_at ? new Date(order.created_at) : null;
                const dateStr = orderDate ? orderDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
                const timeStr = orderDate ? orderDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-';
                
                // Формируем список товаров для отображения
                const orderItems = order.items && Array.isArray(order.items) ? order.items : [];
                const displayItems = orderItems.length > 0 ? orderItems.slice(0, 3) : [];
                const hasMoreItems = orderItems.length > 3;
                
                return (
                  <tr 
                    key={order.id} 
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-4">
                      <span className="text-blue-600 font-medium">#{order.id}</span>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {displayItems.length > 0 ? (
                        <div className="text-gray-900 space-y-1">
                          {displayItems.map((item, idx) => (
                            <div key={idx}>{item.name} × {item.quantity}</div>
                          ))}
                          {hasMoreItems && <div className="text-gray-500">...</div>}
                        </div>
                      ) : (
                        <div className="text-gray-500">-</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      <div>{dateStr}</div>
                      <div>{timeStr}</div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={order.status || 'NEW'}
                        onChange={(e) => handleStatusChange(order.id, e.target.value, e)}
                        onClick={(e) => e.stopPropagation()}
                        className={`px-2 py-1 rounded text-xs border-0 ${getStatusColor(order.status)} cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1`}
                        style={{
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 0.5rem center',
                          paddingRight: '1.75rem'
                        }}
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
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <div>{order.customer_name || '-'}</div>
                        <div className="text-sm text-gray-500">{order.customer_phone || '-'}</div>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

