import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Bell, CreditCard, Globe, Shield } from 'lucide-react';

const API_BASE = window.location.origin;

export function Settings({ authToken }) {
  const [settings, setSettings] = useState({
    serviceFee: 450,
    bonusPercent: 1,
    minOrderAmount: 0,
    deliveryEnabled: true,
    notificationsEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/settings`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings({ ...settings, ...data });
      } else if (response.status === 404) {
        // Если endpoint не существует, используем значения по умолчанию
        console.log('Используются настройки по умолчанию');
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        alert('Настройки сохранены');
      } else {
        alert('Ошибка сохранения настроек');
      }
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      alert('Ошибка сохранения настроек');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки</h1>
        <p className="text-gray-600 mt-1">Общие настройки системы</p>
      </div>

      {/* Табы */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'general'
              ? 'border-b-2 border-pink-600 text-pink-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Общие
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'payments'
              ? 'border-b-2 border-pink-600 text-pink-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Платежи
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'notifications'
              ? 'border-b-2 border-pink-600 text-pink-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Уведомления
        </button>
      </div>

      {/* Контент */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Общие настройки
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Минимальная сумма заказа (₽)
                  </label>
                  <input
                    type="number"
                    value={settings.minOrderAmount}
                    onChange={(e) => setSettings({ ...settings, minOrderAmount: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.deliveryEnabled}
                      onChange={(e) => setSettings({ ...settings, deliveryEnabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span>Доставка включена</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Настройки платежей и бонусов
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Сервисный сбор (₽)
                  </label>
                  <input
                    type="number"
                    value={settings.serviceFee}
                    onChange={(e) => setSettings({ ...settings, serviceFee: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Сбор включает: сборку, упаковку, налоги
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Процент бонусов (%)
                  </label>
                  <input
                    type="number"
                    value={settings.bonusPercent}
                    onChange={(e) => setSettings({ ...settings, bonusPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Процент от суммы заказа, который начисляется в виде бонусов
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Уведомления
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notificationsEnabled}
                      onChange={(e) => setSettings({ ...settings, notificationsEnabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span>Включить уведомления о новых заказах</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="bg-pink-600 text-white px-6 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>
      </div>
    </div>
  );
}
