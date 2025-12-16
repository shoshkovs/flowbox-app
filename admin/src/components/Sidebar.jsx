import { NavLink } from 'react-router-dom';
import { Home, Flower2, Package, FileText, Truck, BarChart3, Users, Settings, X } from 'lucide-react';

export function Sidebar({ isMobileOpen, onMobileClose }) {
  const menuItems = [
    { id: 'dashboard', label: 'Главная', icon: Home, path: '/dashboard' },
    { id: 'products', label: 'Товары', icon: Flower2, path: '/products' },
    { id: 'warehouse', label: 'Склад', icon: Package, path: '/warehouse' },
    { id: 'orders', label: 'Заказы', icon: FileText, path: '/orders' },
    { id: 'delivery', label: 'Доставка', icon: Truck, path: '/delivery' },
    { id: 'analytics', label: 'Аналитика', icon: BarChart3, path: '/analytics' },
    { id: 'customers', label: 'Клиенты', icon: Users, path: '/customers' },
    { id: 'settings', label: 'Настройки', icon: Settings, path: '/settings' },
  ];

  const handleNavClick = () => {
    if (onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <>
      {/* Overlay для мобильных устройств */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      
      {/* Sidebar */}
      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flower2 className="w-8 h-8 text-pink-600" />
            <span className="text-xl font-semibold">FlowBox</span>
          </div>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <nav className="flex-1 p-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                    isActive
                      ? 'bg-pink-50 text-pink-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </>
  );
}
