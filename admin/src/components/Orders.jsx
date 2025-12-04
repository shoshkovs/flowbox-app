import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, Phone, RefreshCw, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

// Функция для форматирования дат в человеко-понятный формат
function formatHumanDate(dateInput) {
  console.log('🔧 formatHumanDate called with:', dateInput, 'type:', typeof dateInput);
  
  if (!dateInput) {
    console.log('⚠️ formatHumanDate: dateInput is empty');
    return '';
  }
  
  // Преобразуем входную дату в Date объект
  let date;
  if (dateInput instanceof Date) {
    date = dateInput;
    console.log('📅 formatHumanDate: dateInput is Date object');
  } else if (typeof dateInput === 'string') {
    // Если это ISO строка с временем (YYYY-MM-DDTHH:mm:ss.sssZ), используем стандартный парсер
    if (dateInput.includes('T') || dateInput.includes('Z')) {
      date = new Date(dateInput);
      console.log('📅 formatHumanDate: parsed ISO string with time', date);
    } else if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Если это только дата без времени (YYYY-MM-DD), парсим вручную
      const [year, month, day] = dateInput.split('-').map(Number);
      date = new Date(year, month - 1, day);
      console.log('📅 formatHumanDate: parsed date-only string', { year, month, day, date });
    } else {
      date = new Date(dateInput);
      console.log('📅 formatHumanDate: parsed string as Date', date);
    }
  } else {
    date = new Date(dateInput);
    console.log('📅 formatHumanDate: converted to Date', date);
  }
  
  // Проверяем валидность даты
  if (isNaN(date.getTime())) {
    console.log('❌ formatHumanDate: invalid date');
    return '';
  }
  
  console.log('✅ formatHumanDate: valid date', date);
  
  // Нормализуем даты (убираем время, оставляем только дату)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  // Вычисляем разницу в днях
  const diffTime = targetDate - today;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Определяем, нужно ли показывать год
  const currentYear = today.getFullYear();
  const targetYear = targetDate.getFullYear();
  const showYear = targetYear !== currentYear;
  
  // Дни недели на русском (с заглавной буквы)
  const weekdaysShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  
  // Месяцы на русском
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  
  const monthsShort = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июня',
    'июля', 'авг', 'сен', 'окт', 'ноя', 'дек'
  ];
  
  const day = targetDate.getDate();
  const month = monthsShort[targetDate.getMonth()];
  const weekday = weekdaysShort[targetDate.getDay()];
  const year = targetDate.getFullYear();
  
  // Специальные случаи для близких дат
  if (diffDays === 0) {
    return 'Сегодня';
  }
  
  if (diffDays === -1) {
    return 'Вчера';
  }
  
  if (diffDays === 1) {
    return 'Завтра';
  }
  
  // Для остальных дат формируем строку: "30 дек" или "30 дек 2025"
  let result = `${day} ${month}`;
  
  if (showYear) {
    result += ` ${year}`;
  }
  
  return result;
}

// Функция для форматирования времени доставки (12-14 -> 12:00-14:00)
function formatDeliveryTime(timeStr) {
  if (!timeStr || timeStr === '-') return '-';
  
  // Если уже есть двоеточие, возвращаем как есть
  if (timeStr.includes(':')) {
    return timeStr;
  }
  
  // Если формат "12-14", преобразуем в "12:00-14:00"
  if (timeStr.includes('-')) {
    const parts = timeStr.split('-').map(part => {
      const trimmed = part.trim();
      // Если уже есть двоеточие, оставляем как есть
      if (trimmed.includes(':')) {
        return trimmed;
      }
      // Иначе добавляем ":00"
      return trimmed + ':00';
    });
    return parts.join('-');
  }
  
  // Если одно время без дефиса, добавляем ":00"
  return timeStr.trim() + ':00';
}

export function Orders({ authToken }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // Храним все заказы для правильного подсчета
  const [loading, setLoading] = useState(true);
  
  // Восстанавливаем фильтр из URL или state
  const getInitialFilter = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const statusFromUrl = urlParams.get('status');
    const statusFromState = location.state?.filterStatus;
    return statusFromUrl || statusFromState || 'all';
  };
  
  const [filterStatus, setFilterStatus] = useState(getInitialFilter()); // По умолчанию "Все"
  const [dateFilter, setDateFilter] = useState('week'); // По умолчанию "Неделя"
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Инициализация дат при загрузке компонента
  useEffect(() => {
    // Используем локальное время для правильного расчета дат
    const today = new Date();
    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const weekAgo = new Date(localToday);
    weekAgo.setDate(localToday.getDate() - 7);
    
    // Форматируем даты в формате YYYY-MM-DD для input type="date"
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    setDateFrom(formatDate(weekAgo));
    setDateTo(formatDate(localToday));
  }, []);

  // Восстанавливаем фильтр при возврате со страницы деталей заказа
  useEffect(() => {
    const statusFromState = location.state?.filterStatus;
    if (statusFromState && statusFromState !== filterStatus) {
      setFilterStatus(statusFromState);
    }
  }, [location.state]);

  useEffect(() => {
    loadOrders();
  }, [filterStatus, dateFrom, dateTo]);

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
      // Формируем URL с параметрами фильтрации по датам
      const params = new URLSearchParams();
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      
      const url = `${API_BASE}/api/admin/orders${params.toString() ? '?' + params.toString() : ''}`;
      
      const allResponse = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (allResponse.ok) {
        const allData = await allResponse.json();
        setAllOrders(allData);
        
        // Фильтруем локально по статусу
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

  const handleDateFilterChange = (period) => {
    setDateFilter(period);
    
    // Используем локальное время для правильного расчета дат
    const today = new Date();
    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    let fromDate = new Date(localToday);
    let toDate = new Date(localToday);
    
    // Функция для форматирования даты в YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    switch (period) {
      case 'today':
        fromDate = new Date(localToday);
        toDate = new Date(localToday);
        break;
      case 'yesterday':
        fromDate = new Date(localToday);
        fromDate.setDate(localToday.getDate() - 1);
        toDate = new Date(localToday);
        toDate.setDate(localToday.getDate() - 1);
        break;
      case 'dayBeforeYesterday':
        fromDate = new Date(localToday);
        fromDate.setDate(localToday.getDate() - 2);
        toDate = new Date(localToday);
        toDate.setDate(localToday.getDate() - 2);
        break;
      case 'week':
        fromDate = new Date(localToday);
        fromDate.setDate(localToday.getDate() - 7);
        toDate = new Date(localToday);
        break;
      case 'month':
        fromDate = new Date(localToday);
        fromDate.setMonth(localToday.getMonth() - 1);
        toDate = new Date(localToday);
        break;
      default:
        // Кастомный период - не меняем даты
        return;
    }
    
    setDateFrom(formatDate(fromDate));
    setDateTo(formatDate(toDate));
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Заказы</h1>
          <p className="text-gray-600 mt-1">Управление заказами клиентов</p>
        </div>
        
        {/* Фильтр по датам */}
        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setDateFilter('custom');
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">по</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setDateFilter('custom');
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
          <select
            value={dateFilter}
            onChange={(e) => handleDateFilterChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white"
          >
            <option value="custom">Кастомный период</option>
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
            <option value="dayBeforeYesterday">Позавчера</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </select>
        </div>
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
                <th className="text-left py-3 px-4 min-w-[140px]">Дата</th>
                <th className="text-left py-3 px-4">Статус</th>
                <th className="text-left py-3 px-4">Клиент</th>
                <th className="text-left py-3 px-4">Сумма</th>
                <th className="text-left py-3 px-4">Доставка</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                // Логирование для отладки
                console.log('🔍 Order data:', {
                  id: order.id,
                  created_at: order.created_at,
                  created_at_type: typeof order.created_at,
                  created_at_value: order.created_at
                });
                
                const orderDate = order.created_at ? new Date(order.created_at) : null;
                console.log('📅 Parsed date:', orderDate, 'isValid:', orderDate && !isNaN(orderDate.getTime()));
                
                const dateStr = orderDate ? formatHumanDate(order.created_at) : '-';
                console.log('📝 Formatted date string:', dateStr, 'length:', dateStr?.length);
                
                const timeStr = orderDate ? orderDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-';
                console.log('⏰ Formatted time string:', timeStr);
                
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
                    <td className="py-3 px-4 text-sm text-gray-600 min-w-[140px] whitespace-nowrap">
                      <div className="font-medium">{dateStr}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{timeStr}</div>
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
                        <div>{order.delivery_date ? formatHumanDate(order.delivery_date) : '-'}</div>
                        <div className="text-gray-500">{formatDeliveryTime(order.delivery_time)}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/orders/${order.id}`, {
                              state: { returnTo: '/orders', filterStatus: filterStatus }
                            });
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

