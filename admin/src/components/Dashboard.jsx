import { useState, useEffect } from 'react';
import { TrendingUp, ShoppingCart, Package, Users } from 'lucide-react';

const API_BASE = window.location.origin;

export function Dashboard({ authToken }) {
  const [stats, setStats] = useState({
    revenueToday: 0,
    ordersToday: 0,
    avgOrder: 0,
    totalStock: 0,
    productCount: 0,
    newUsers: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // Загружаем заказы
      const ordersRes = await fetch(`${API_BASE}/api/admin/orders`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      // Загружаем склад
      const warehouseRes = await fetch(`${API_BASE}/api/admin/warehouse`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      // Загружаем клиентов для подсчета новых пользователей
      const customersRes = await fetch(`${API_BASE}/api/admin/customers`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      
      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        
        // Выручка за сегодня: сумма всех заказов за сегодня (независимо от статуса)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        
        const todayOrders = orders.filter(o => {
          if (!o.created_at) return false;
          const orderDate = new Date(o.created_at);
          return orderDate >= today && orderDate <= todayEnd;
        });
        
        // Используем поле total вместо total_amount
        const revenue = todayOrders.reduce((sum, o) => sum + (parseInt(o.total) || 0), 0);
        
        // Новых заказов: все заказы со статусом NEW (нормализуем статус)
        const newOrders = orders.filter(o => {
          const status = (o.status || '').toUpperCase();
          return status === 'NEW';
        });
        
        // Загружаем данные склада
        let totalStock = 0;
        let productCount = 0;
        let lowStockItemsList = [];
        
        if (warehouseRes.ok) {
          const warehouseData = await warehouseRes.json();
          // Сумма всех остатков на складе
          totalStock = warehouseData.reduce((sum, item) => sum + (parseInt(item.stock) || 0), 0);
          // Количество позиций (товаров) на складе
          productCount = warehouseData.length;
          // Низкие остатки: товары с остатком меньше 20
          lowStockItemsList = warehouseData.filter(item => (parseInt(item.stock) || 0) < 20);
        }
        
        // Новых пользователей: пользователи, созданные сегодня (по дате создания аккаунта)
        let newUsersCount = 0;
        if (customersRes.ok) {
          const customers = await customersRes.json();
          const newUsers = customers.filter(c => {
            // Используем registered_at или created_at для определения даты создания аккаунта
            const accountDate = c.registered_at || c.created_at;
            if (!accountDate) return false;
            const userDate = new Date(accountDate);
            return userDate >= today && userDate <= todayEnd;
          });
          newUsersCount = newUsers.length;
        }
        
        setStats({
          revenueToday: revenue,
          ordersToday: newOrders.length,
          avgOrder: todayOrders.length > 0 ? revenue / todayOrders.length : 0,
          totalStock: totalStock,
          productCount: productCount,
          newUsers: newUsersCount,
        });
        
        setLowStockItems(lowStockItemsList);
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
      change: null, // Убрали '+12%'
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Новых заказов',
      value: stats.ordersToday.toString(),
      change: null, // Убрали '+5'
      icon: ShoppingCart,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Позиций на складе',
      value: stats.totalStock.toLocaleString(),
      change: `${stats.productCount} товаров`,
      icon: Package,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Новых пользователей',
      value: stats.newUsers.toString(),
      change: null,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
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
                  {stat.change && (
                    <p className="text-sm text-gray-500 mt-1">{stat.change}</p>
                  )}
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
                        order.status === 'NEW' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'PROCESSING' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'COLLECTING' ? 'bg-purple-100 text-purple-800' :
                        order.status === 'DELIVERING' ? 'bg-indigo-100 text-indigo-800' :
                        order.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        order.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status === 'NEW' ? 'Новый' :
                         order.status === 'PROCESSING' ? 'В обработке' :
                         order.status === 'COLLECTING' ? 'Собирается' :
                         order.status === 'DELIVERING' ? 'В доставке' :
                         order.status === 'COMPLETED' ? 'Доставлен' :
                         order.status === 'CANCELED' ? 'Отменён' :
                         order.status}
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
                    <p className="font-semibold">{(parseInt(order.total) || 0).toLocaleString()} ₽</p>
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
            {lowStockItems.length > 0 ? (
              lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-medium">{item.name || item.product_name || 'Товар'}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Остаток: <span className="font-semibold text-red-600">{item.stock || 0}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Меньше 20</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">Нет товаров с низким остатком</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

