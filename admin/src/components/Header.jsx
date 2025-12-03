import { Search, MapPin, User, LogOut, Key } from 'lucide-react';
import { useState } from 'react';

export function Header({ selectedCity, onCityChange, onLogout }) {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={selectedCity}
              onChange={(e) => onCityChange(e.target.value)}
              className="w-48 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="spb">Санкт-Петербург</option>
              <option value="moscow">Москва</option>
              <option value="kazan">Казань</option>
            </select>
          </div>
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по ID заказа, имени или телефону..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <User className="w-5 h-5" />
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-4 py-2 border-b border-gray-200">
                <div className="font-medium">Администратор</div>
                <div className="text-sm text-gray-500">admin@flowbox.ru</div>
              </div>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  // Смена пароля
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"
              >
                <Key className="w-4 h-4" />
                Сменить пароль
              </button>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onLogout();
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-red-600"
              >
                <LogOut className="w-4 h-4" />
                Выход
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

