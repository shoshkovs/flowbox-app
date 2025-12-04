import { useState, useEffect } from 'react';
import { Truck, Phone, MapPin, Eye, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API_BASE = window.location.origin;

// Форматирование даты для datepicker (YYYY-MM-DD)
const formatDateForInput = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Форматирование даты для отображения (DD.MM.YYYY)
const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
};

// Форматирование времени для отображения (10-12 -> 10:00–12:00)
const formatTimeForDisplay = (timeString) => {
  if (!timeString) return '';
  // Формат может быть "10-12" или "10:00-12:00"
  if (timeString.includes(':')) {
    // Уже в формате с часами и минутами
    return timeString.replace('-', '–');
  }
  // Формат "10-12" -> "10:00–12:00"
  const parts = timeString.split('-');
  if (parts.length === 2) {
    return `${parts[0]}:00–${parts[1]}:00`;
  }
  return timeString;
};

// Форматирование суммы в рубли
const formatPrice = (amount) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export function Delivery({ authToken }) {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [stats, setStats] = useState({
    total: 0,
    waiting: 0,
    inTransit: 0,
    delivered: 0
  });
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState({});

  useEffect(() => {
    loadDeliveries();
  }, [selectedDate]);

  const loadDeliveries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/delivery?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || { total: 0, waiting: 0, inTransit: 0, delivered: 0 });
        setDeliveries(data.deliveries || []);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка загрузки доставок');
      }
    } catch (error) {
      console.error('Ошибка загрузки доставок:', error);
      toast.error('Ошибка загрузки доставок');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdatingStatus(prev => ({ ...prev, [orderId]: true }));
    
    // Оптимистичное обновление
    const oldDelivery = deliveries.find(d => d.orderId === orderId);
    const oldStatus = oldDelivery?.status;
    
    setDeliveries(prev => prev.map(d => 
      d.orderId === orderId ? { ...d, status: newStatus } : d
    ));
    
    // Пересчитываем статистику локально
    updateStatsLocally(oldStatus, newStatus);
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        toast.success('Статус заказа обновлен');
        // Перезагружаем данные для синхронизации
        await loadDeliveries();
      } else {
        // Откатываем изменения при ошибке
        setDeliveries(prev => prev.map(d => 
          d.orderId === orderId ? { ...d, status: oldStatus } : d
        ));
        updateStatsLocally(newStatus, oldStatus);
        
        const error = await response.json();
        toast.error(error.error || 'Ошибка обновления статуса');
      }
    } catch (error) {
      // Откатываем изменения при ошибке
      setDeliveries(prev => prev.map(d => 
        d.orderId === orderId ? { ...d, status: oldStatus } : d
      ));
      updateStatsLocally(newStatus, oldStatus);
      
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

  const updateStatsLocally = (oldStatus, newStatus) => {
    setStats(prev => {
      const newStats = { ...prev };
      
      // Убираем из старого статуса
      if (oldStatus === 'DELIVERING') newStats.waiting = Math.max(0, newStats.waiting - 1);
      else if (oldStatus === 'IN_TRANSIT') newStats.inTransit = Math.max(0, newStats.inTransit - 1);
      else if (oldStatus === 'COMPLETED') newStats.delivered = Math.max(0, newStats.delivered - 1);
      
      // Добавляем в новый статус
      if (newStatus === 'DELIVERING') newStats.waiting++;
      else if (newStatus === 'IN_TRANSIT') newStats.inTransit++;
      else if (newStatus === 'COMPLETED') newStats.delivered++;
      
      return newStats;
    });
  };

  // Группируем доставки по времени
  const deliveriesByTime = deliveries.reduce((acc, delivery) => {
    const time = delivery.deliveryTime || 'Без времени';
    if (!acc[time]) {
      acc[time] = [];
    }
    acc[time].push(delivery);
    return acc;
  }, {});

  // Сортируем временные слоты
  const sortedTimeSlots = Object.keys(deliveriesByTime).sort((a, b) => {
    if (a === 'Без времени') return 1;
    if (b === 'Без времени') return -1;
    return a.localeCompare(b);
  });

  const getStatusLabel = (status) => {
    const labels = {
      'DELIVERING': 'Ожидает',
      'IN_TRANSIT': 'В пути',
      'COMPLETED': 'Доставлено'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'DELIVERING': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'IN_TRANSIT': 'bg-blue-100 text-blue-800 border-blue-300',
      'COMPLETED': 'bg-green-100 text-green-800 border-green-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };
  
  // Функция для получения относительной даты
  const getRelativeDate = (dateString) => {
    if (!dateString) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const targetDate = new Date(dateString);
    targetDate.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Завтра';
    if (diffDays === -1) return 'Вчера';
    if (diffDays === 2) return 'Послезавтра';
    if (diffDays === -2) return 'Позавчера';
    
    // Если больше 2 дней, показываем дату
    return formatDateForDisplay(dateString);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-pink-600" />
          <p className="text-gray-600">Загрузка доставок...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Заголовок и датапикер */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Доставка</h1>
          <p className="text-gray-600 mt-1">Управление доставками</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={loadDeliveries}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
        </div>
      </div>

      {/* Статистика (KPI карточки) */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-2">Всего доставок</div>
          <div className="text-3xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-2">Ожидают доставки</div>
          <div className="text-3xl font-bold text-yellow-600">{stats.waiting}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-2">В пути</div>
          <div className="text-3xl font-bold text-blue-600">{stats.inTransit}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-600 mb-2">Доставлено</div>
          <div className="text-3xl font-bold text-green-600">{stats.delivered}</div>
        </div>
      </div>

      {/* Список доставок */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Доставки на {getRelativeDate(selectedDate)}
          </h2>
        </div>

        {sortedTimeSlots.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Truck className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Нет доставок на выбранную дату</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedTimeSlots.map((timeSlot) => (
              <div key={timeSlot} className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Время: {formatTimeForDisplay(timeSlot)}
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {deliveriesByTime[timeSlot].map((delivery) => (
                    <div
                      key={delivery.orderId}
                      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                    >
                      <div className="grid grid-cols-11 gap-4">
                        {/* Время и ID заказа */}
                        <div className="col-span-2">
                          <div className="text-sm text-gray-600 mb-1">Время</div>
                          <div className="font-semibold">{formatTimeForDisplay(delivery.deliveryTime)}</div>
                          <a
                            href={`/admin/orders/${delivery.orderId}`}
                            className="text-pink-600 hover:text-pink-800 text-sm font-medium"
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/admin/orders/${delivery.orderId}`);
                            }}
                          >
                            #{delivery.orderId}
                          </a>
                        </div>

                        {/* Адрес */}
                        <div className="col-span-3">
                          <div className="text-sm text-gray-600 mb-1">Адрес</div>
                          <div className="font-medium mb-2">{delivery.address || '-'}</div>
                          <a
                            href="#"
                            className="text-pink-600 hover:text-pink-800 text-sm flex items-center gap-1"
                            onClick={(e) => {
                              e.preventDefault();
                              // TODO: Открыть карту
                              toast.info('Функция открытия карты будет добавлена позже');
                            }}
                          >
                            <MapPin className="w-4 h-4" />
                            Открыть на карте
                          </a>
                        </div>

                        {/* Получатель */}
                        <div className="col-span-2">
                          <div className="text-sm text-gray-600 mb-1">Получатель</div>
                          <div className="font-medium">{delivery.recipientName || '-'}</div>
                          {delivery.recipientPhone && (
                            <a
                              href={`tel:${delivery.recipientPhone.replace(/\D/g, '')}`}
                              className="text-pink-600 hover:text-pink-800 text-sm flex items-center gap-1 mt-1"
                            >
                              <Phone className="w-4 h-4" />
                              {delivery.recipientPhone}
                            </a>
                          )}
                        </div>

                        {/* Состав */}
                        <div className="col-span-2">
                          <div className="text-sm text-gray-600 mb-1">Состав</div>
                          <div className="text-sm">{delivery.itemsSummary || '-'}</div>
                        </div>

                        {/* Сумма */}
                        <div className="col-span-1">
                          <div className="text-sm text-gray-600 mb-1">Сумма</div>
                          <div className="font-semibold">{formatPrice(delivery.total)}</div>
                        </div>

                        {/* Статус */}
                        <div className="col-span-1">
                          <div className="text-sm text-gray-600 mb-1">Статус</div>
                          <select
                            value={delivery.status}
                            onChange={(e) => updateOrderStatus(delivery.orderId, e.target.value)}
                            disabled={updatingStatus[delivery.orderId]}
                            className={`w-full px-2 py-1 text-xs border rounded font-medium ${
                              updatingStatus[delivery.orderId] 
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'cursor-pointer'
                            } ${getStatusColor(delivery.status)}`}
                            style={{ 
                              appearance: 'none',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23374151' d='M5 7L1 3h8z'/%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 0.25rem center',
                              paddingRight: '1.5rem'
                            }}
                          >
                            <option value="DELIVERING">Ожидает</option>
                            <option value="IN_TRANSIT">В пути</option>
                            <option value="COMPLETED">Доставлено</option>
                          </select>
                        </div>
                      </div>

                      {/* Кнопка Детали */}
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => navigate(`/admin/orders/${delivery.orderId}`)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-pink-600 hover:text-pink-800 hover:bg-pink-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          Детали
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
