import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { useState, useEffect } from 'react';

export function Layout() {
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setAuthToken(token);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setAuthToken(null);
    window.location.href = '/admin/';
  };

  if (!authToken) {
    return null; // Login будет обработан в App.jsx
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

