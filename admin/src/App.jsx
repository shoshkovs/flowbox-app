import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { Products } from './components/Products';
import { Warehouse } from './components/Warehouse';
import { Orders } from './components/Orders';
import { Delivery } from './components/Delivery';
import { Analytics } from './components/Analytics';
import { Customers } from './components/Customers';
import { Settings } from './components/Settings';

const API_BASE = window.location.origin;
const ADMIN_PASSWORD = 'admin123';

// Проверка загрузки
console.log('🚀 React App загружается...');
console.log('📍 API_BASE:', API_BASE);

function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      // Сохраняем пароль для использования в Authorization header
      localStorage.setItem('admin_token', ADMIN_PASSWORD);
      onLogin(ADMIN_PASSWORD);
    } else {
      setError('Неверный пароль');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-100 to-pink-500">
      <div className="bg-white p-10 rounded-xl shadow-xl w-full max-w-md">
        <h1 className="text-4xl text-center text-pink-600 mb-2">🌸 FlowBox</h1>
        <h2 className="text-xl text-center text-gray-700 mb-8">Админ-панель</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Введите пароль"
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
          <button
            type="submit"
            className="w-full bg-pink-600 text-white py-2 px-4 rounded-lg hover:bg-pink-700 transition-colors"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCity, setSelectedCity] = useState('spb');

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setAuthToken(token);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setAuthToken(null);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard authToken={authToken} />;
      case 'products':
        return <Products authToken={authToken} />;
      case 'warehouse':
        return <Warehouse authToken={authToken} />;
      case 'orders':
        return <Orders authToken={authToken} />;
      case 'delivery':
        return <Delivery authToken={authToken} />;
      case 'analytics':
        return <Analytics authToken={authToken} />;
      case 'customers':
        return <Customers authToken={authToken} />;
      case 'settings':
        return <Settings authToken={authToken} />;
      default:
        return <Dashboard authToken={authToken} />;
    }
  };

  if (!authToken) {
    return <LoginScreen onLogin={setAuthToken} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header selectedCity={selectedCity} onCityChange={setSelectedCity} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// Добавляем обработку ошибок для отладки
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('React Error:', event.error);
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
  });
}

