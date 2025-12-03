import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, Users, Calendar } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Загружаем заказы
      const ordersRes = await fetch(`${API_BASE}/api/admin/orders`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        
        // Фильтруем по дате
        const now = new Date();
        const filterDate = new Date();
        if (dateRange === 'week') {
          filterDate.setDate(now.getDate() - 7);
        } else if (dateRange === 'month') {
          filterDate.setMonth(now.getMonth() - 1);
        } else if (dateRange === 'year') {
          filterDate.setFullYear(now.getFullYear() - 1);
        }

        const filteredOrders = orders.filter(order => {
          const orderDate = new Date(order.created_at);
          return orderDate >= filterDate;
        });

        // Вычисляем статистику
        const revenue = filteredOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
        const avgOrder = filteredOrders.length > 0 ? revenue / filteredOrders.length : 0;
        
        // Уникальные клиенты
        const uniqueCustomers = new Set(filteredOrders.map(o => o.user_id).filter(Boolean));
        
        setStats({
          totalRevenue: revenue,
          totalOrders: filteredOrders.length,
          avgOrderValue: avgOrder,
          totalCustomers: uniqueCustomers.size,
        });

        // Группируем заказы по дате
        const ordersByDateMap = {};
        filteredOrders.forEach(order => {
          const date = new Date(order.created_at).toLocaleDateString('ru-RU');
          if (!ordersByDateMap[date]) {
            ordersByDateMap[date] = { date, count: 0, revenue: 0 };
          }
          ordersByDateMap[date].count++;
          ordersByDateMap[date].revenue += parseFloat(order.total_amount) || 0;
        });
        setOrdersByDate(Object.values(ordersByDateMap).sort((a, b) => 
          new Date(a.date.split('.').reverse().join('-')) - new Date(b.date.split('.').reverse().join('-'))
        ));

        // Топ товаров (упрощенная версия)
        const productCounts = {};
        filteredOrders.forEach(order => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (!productCounts[item.name]) {
                productCounts[item.name] = { name: item.name, count: 0, revenue: 0 };
              }
              productCounts[item.name].count += item.quantity || 0;
              productCounts[item.name].revenue += (item.price || 0) * (item.quantity || 0);
            });
          }
        });
        setTopProducts(Object.values(productCounts)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5));
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
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="week">Последняя неделя</option>
          <option value="month">Последний месяц</option>
          <option value="year">Последний год</option>
        </select>
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
              <DollarSign className="w-6 h-6 text-green-600" />
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
