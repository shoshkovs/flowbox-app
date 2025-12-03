import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './app/layout';
import HomePage from './app/page';
import DashboardPage from './app/dashboard/page';
import ProductsPage from './app/products/page';
import NewProductPage from './app/products/new/page';
import EditProductPage from './app/products/[id]/page';
import WarehousePage from './app/warehouse/page';
import NewWarehousePage from './app/warehouse/new/page';
import OrdersPage from './app/orders/page';
import OrderDetailPage from './app/orders/[id]/page';
import DeliveryPage from './app/delivery/page';
import AnalyticsPage from './app/analytics/page';
import CustomersPage from './app/customers/page';
import CustomerDetailPage from './app/customers/[id]/page';
import SettingsPage from './app/settings/page';

const API_BASE = window.location.origin;
const ADMIN_PASSWORD = 'admin123';

function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
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

function ProtectedRoute({ children }) {
  const [authToken, setAuthToken] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    setAuthToken(token);
    setChecking(false);
  }, []);

  if (checking) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>;
  }

  if (!authToken) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setAuthToken(token);
    }
    setChecking(false);
  }, []);

  if (checking) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>;
  }

  return (
    <BrowserRouter basename="/admin">
      <Toaster position="top-right" />
      {!authToken ? (
        <LoginScreen onLogin={setAuthToken} />
      ) : (
        <ProtectedRoute>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/new" element={<NewProductPage />} />
              <Route path="products/:id" element={<EditProductPage />} />
              <Route path="warehouse" element={<WarehousePage />} />
              <Route path="warehouse/new" element={<NewWarehousePage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="delivery" element={<DeliveryPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </ProtectedRoute>
      )}
    </BrowserRouter>
  );
}
