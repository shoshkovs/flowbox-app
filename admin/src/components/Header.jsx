import { User, LogOut, Key, Menu } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Header({ onLogout, onMenuClick }) {
  const [showDropdown, setShowDropdown] = useState(false);

  // Закрываем dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.dropdown-container')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDropdown]);

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {/* Кнопка меню для мобильных устройств */}
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Открыть меню"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="relative dropdown-container">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Меню пользователя"
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

