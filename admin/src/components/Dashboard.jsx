import { useState, useEffect } from 'react';
import { TrendingUp, ShoppingCart, Package, AlertTriangle } from 'lucide-react';

const API_BASE = window.location.origin;

export function Dashboard({ authToken }) {
  const [stats, setStats] = useState({
    revenueToday: 0,
    ordersToday: 0,
    avgOrder: 0,
    lowStock: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // Загружаем статистику
      const ordersRes = await fetch(`${API_BASE}/api/admin/orders`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = orders.filter(o => o.created_at?.startsWith(today));
        
        const revenue = todayOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
        const avgOrder = todayOrders.length > 0 ? revenue / todayOrders.length : 0;
        
        setStats({
          revenueToday: revenue,
          ordersToday: todayOrders.length,
          avgOrder: avgOrder,
          lowStock: 0, // TODO: загрузить из API склада
        });
        
        setRecentOrders(orders.slice(0, 5));
      }
    } catch (error) {
      console.error('Ошибка загрузки дашборда:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Выручка за сегодня',
      value: `${stats.revenueToday.toLocaleString()} ₽`,
      change: '+12%',
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Новых заказов',
      value: stats.ordersToday.toString(),
      change: '+5',
      icon: ShoppingCart,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'На складе позиций',
      value: '48',
      change: '12 товаров',
      icon: Package,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Требует внимания',
      value: stats.lowStock.toString(),
      change: 'Низкий остаток',
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Главная</h1>
        <p className="text-gray-600 mt-1">Обзор вашего цветочного магазина</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold mt-2">{stat.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{stat.change}</p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Последние заказы</h2>
          <div className="space-y-4">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-medium">#{order.id}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        order.status === 'new' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'paid' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status === 'new' ? 'Новый' : order.status === 'paid' ? 'Оплачен' : order.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {order.customer_name || 'Клиент'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {order.created_at ? new Date(order.created_at).toLocaleString('ru-RU') : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{parseFloat(order.total_amount || 0).toLocaleString()} ₽</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">Нет заказов</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Низкие остатки на складе</h2>
          <div className="space-y-4">
            <p className="text-gray-500 text-center py-8">Данные будут загружены из модуля склада</p>
          </div>
        </div>
      </div>
    </div>
  );
}

