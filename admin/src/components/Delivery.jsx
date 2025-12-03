import { useState, useEffect } from 'react';
import { Truck, MapPin, Plus, Edit, Trash2, User } from 'lucide-react';

const API_BASE = window.location.origin;

export function Delivery({ authToken }) {
  const [activeTab, setActiveTab] = useState('couriers');
  const [couriers, setCouriers] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'couriers') {
        const response = await fetch(`${API_BASE}/api/admin/couriers`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setCouriers(data);
        }
      } else if (activeTab === 'zones') {
        const response = await fetch(`${API_BASE}/api/admin/delivery/zones`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setZones(data);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const createCourier = async () => {
    const name = prompt('Имя курьера:');
    if (!name) return;
    
    const phone = prompt('Телефон:');
    if (!phone) return;
    
    const pinCode = prompt('PIN-код (4 цифры):');
    if (!pinCode || pinCode.length !== 4) {
      alert('PIN-код должен состоять из 4 цифр');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/couriers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          phone,
          pin_code: pinCode,
          is_active: true,
        }),
      });

      if (response.ok) {
        await loadData();
      } else {
        const error = await response.json();
        alert(error.error || 'Ошибка создания курьера');
      }
    } catch (error) {
      console.error('Ошибка создания курьера:', error);
      alert('Ошибка создания курьера');
    }
  };

  const toggleCourierStatus = async (courierId, currentStatus) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/couriers/${courierId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !currentStatus,
        }),
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
    }
  };

  const deleteCourier = async (courierId) => {
    if (!confirm('Удалить курьера?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/couriers/${courierId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Ошибка удаления курьера:', error);
    }
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Доставка</h1>
        <p className="text-gray-600 mt-1">Управление курьерами и зонами доставки</p>
      </div>

      {/* Табы */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('couriers')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'couriers'
              ? 'border-b-2 border-pink-600 text-pink-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Курьеры
        </button>
        <button
          onClick={() => setActiveTab('zones')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'zones'
              ? 'border-b-2 border-pink-600 text-pink-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Зоны доставки
        </button>
      </div>

      {/* Контент */}
      {activeTab === 'couriers' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Список курьеров</h2>
            <button
              onClick={createCourier}
              className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Добавить курьера
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Имя</th>
                  <th className="text-left py-3 px-4">Телефон</th>
                  <th className="text-left py-3 px-4">PIN-код</th>
                  <th className="text-left py-3 px-4">Зона</th>
                  <th className="text-left py-3 px-4">Статус</th>
                  <th className="text-right py-3 px-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {couriers.map((courier) => (
                  <tr key={courier.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">#{courier.id}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        {courier.name}
                      </div>
                    </td>
                    <td className="py-3 px-4">{courier.phone}</td>
                    <td className="py-3 px-4 font-mono">{courier.pin_code}</td>
                    <td className="py-3 px-4">{courier.zone_name || '-'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        courier.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {courier.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleCourierStatus(courier.id, courier.is_active)}
                          className="p-2 hover:bg-gray-100 rounded"
                          title={courier.is_active ? 'Деактивировать' : 'Активировать'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteCourier(courier.id)}
                          className="p-2 hover:bg-gray-100 rounded text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {couriers.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                Нет курьеров. Добавьте первого курьера.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'zones' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Зоны доставки</h2>
            <button
              onClick={() => alert('Функция добавления зон будет реализована')}
              className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Добавить зону
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-pink-600" />
                    <h3 className="font-semibold">{zone.name}</h3>
                  </div>
                </div>
                <p className="text-gray-600 text-sm mb-2">{zone.description || 'Без описания'}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-lg font-bold text-pink-600">{zone.price} ₽</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    zone.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {zone.is_active ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {zones.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Нет зон доставки. Добавьте первую зону.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
