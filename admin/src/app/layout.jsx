import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { useState, useEffect } from 'react';

export function Layout() {
  const [authToken, setAuthToken] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Закрываем мобильное меню при изменении размера окна (если перешли на десктоп)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!authToken) {
    return null; // Login будет обработан в App.jsx
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar isMobileOpen={isMobileMenuOpen} onMobileClose={closeMobileMenu} />
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        <Header onLogout={handleLogout} onMenuClick={toggleMobileMenu} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

