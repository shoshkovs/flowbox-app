import { Home, Flower2, Package, FileText, Truck, BarChart3, Users, Settings } from 'lucide-react';

export function Sidebar({ activeTab, onTabChange }) {
  const menuItems = [
    { id: 'dashboard', label: 'Главная', icon: Home },
    { id: 'products', label: 'Товары', icon: Flower2 },
    { id: 'warehouse', label: 'Склад', icon: Package },
    { id: 'orders', label: 'Заказы', icon: FileText },
    { id: 'delivery', label: 'Доставка', icon: Truck },
    { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
    { id: 'customers', label: 'Клиенты', icon: Users },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Flower2 className="w-8 h-8 text-pink-600" />
          <span className="text-xl font-semibold">FlowBox</span>
        </div>
      </div>
      <nav className="flex-1 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                activeTab === item.id
                  ? 'bg-pink-50 text-pink-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

