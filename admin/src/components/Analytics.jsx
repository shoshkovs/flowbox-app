import { useState, useEffect } from 'react';
import { TrendingUp, ShoppingCart, Users, Calendar } from 'lucide-react';

const API_BASE = window.location.origin;

export function Analytics({ authToken }) {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    totalCustomers: 0,
  });
  const [ordersByDate, setOrdersByDate] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [dateRange, setDateRange] = useState('week');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange, customDateFrom, customDateTo]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Формируем параметры запроса
      const params = new URLSearchParams();
      params.append('period', dateRange);
      if (dateRange === 'custom' && customDateFrom && customDateTo) {
        params.append('dateFrom', customDateFrom);
        params.append('dateTo', customDateTo);
      }

      const response = await fetch(`${API_BASE}/api/admin/analytics?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        setStats({
          totalRevenue: data.metrics.totalRevenue || 0,
          totalOrders: data.metrics.totalOrders || 0,
          avgOrderValue: data.metrics.avgCheck || 0,
          totalCustomers: data.metrics.uniqueCustomers || 0,
        });

        // Форматируем даты и сортируем от ближайшего дня вниз
        const formattedOrdersByDate = data.ordersByDate.map(item => {
          const dateObj = new Date(item.date);
          return {
            date: dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
            count: item.ordersCount,
            revenue: item.revenue,
            dateObj: dateObj
          };
        }).sort((a, b) => b.dateObj - a.dateObj); // Сортировка от ближайшего дня вниз
        
        setOrdersByDate(formattedOrdersByDate);
        setTopProducts((data.topProducts || []).map(p => ({
          name: p.productName,
          count: p.totalSold,
          revenue: p.revenue
        })));
      }
    } catch (error) {
      console.error('Ошибка загрузки аналитики:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Аналитика</h1>
          <p className="text-gray-600 mt-1">Статистика и отчеты по продажам</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="week">Неделя</option>
            <option value="2weeks">2 недели</option>
            <option value="month">Месяц</option>
            <option value="3months">3 месяца</option>
            <option value="year">Год</option>
            <option value="custom">Кастомная дата</option>
          </select>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="С"
              />
              <span className="text-gray-600">по</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="По"
              />
            </div>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Общая выручка</p>
              <p className="text-2xl font-bold mt-2">{stats.totalRevenue.toLocaleString()} ₽</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <span className="text-2xl font-bold text-green-600">₽</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Всего заказов</p>
              <p className="text-2xl font-bold mt-2">{stats.totalOrders}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Средний чек</p>
              <p className="text-2xl font-bold mt-2">{Math.round(stats.avgOrderValue).toLocaleString()} ₽</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Клиентов</p>
              <p className="text-2xl font-bold mt-2">{stats.totalCustomers}</p>
            </div>
            <div className="bg-pink-50 p-3 rounded-lg">
              <Users className="w-6 h-6 text-pink-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Заказы по датам</h2>
          <div className="space-y-3">
            {ordersByDate.length > 0 ? (
              ordersByDate.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{item.date}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">{item.count} заказов</span>
                    <span className="font-semibold">{item.revenue.toLocaleString()} ₽</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">Нет данных за выбранный период</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Топ товаров</h2>
          <div className="space-y-3">
            {topProducts.length > 0 ? (
              topProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-600">{product.count} шт. продано</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{product.revenue.toLocaleString()} ₽</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">Нет данных за выбранный период</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
