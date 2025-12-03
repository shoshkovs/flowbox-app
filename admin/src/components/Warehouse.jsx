import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TrendingDown, TrendingUp, AlertTriangle, Plus, Edit } from 'lucide-react';

const API_BASE = window.location.origin;

export function Warehouse({ authToken }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/warehouse`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        // Fallback на products API
        const fallbackResponse = await fetch(`${API_BASE}/api/admin/products`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          setProducts(data);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStock = async (productId, newStock) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stock: newStock }),
      });

      if (response.ok) {
        await loadProducts();
      }
    } catch (error) {
      console.error('Ошибка обновления остатка:', error);
      alert('Ошибка обновления остатка');
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = !filterLowStock || (product.stock !== null && product.stock < (product.min_stock || 10));
    return matchesSearch && matchesFilter;
  });

  const lowStockCount = products.filter(p => p.stock !== null && p.stock < (p.min_stock || 10)).length;
  const totalStockValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Склад</h1>
          <p className="text-gray-600 mt-1">Учет наличия и движения товаров</p>
        </div>
        <button
          onClick={() => navigate('/warehouse/new')}
          className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Добавить поставку
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Всего позиций</p>
              <p className="text-2xl font-bold mt-2">{products.length}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Низкий остаток</p>
              <p className="text-2xl font-bold mt-2">{lowStockCount}</p>
              {lowStockCount > 0 && (
                <p className="text-sm text-orange-600 mt-1">Требует внимания</p>
              )}
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600">Стоимость склада</p>
              <p className="text-2xl font-bold mt-2">{totalStockValue.toLocaleString()} ₽</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
          />
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={filterLowStock}
              onChange={(e) => setFilterLowStock(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Только низкий остаток</span>
          </label>
        </div>

        {/* Таблица товаров */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Товар</th>
                <th className="text-left py-3 px-4">Остаток</th>
                <th className="text-left py-3 px-4">Мин. остаток</th>
                <th className="text-left py-3 px-4">Цена</th>
                <th className="text-left py-3 px-4">Статус</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const stock = product.stock !== null ? product.stock : 'Не указан';
                const minStock = product.min_stock || 10;
                const isLowStock = product.stock !== null && product.stock < minStock;

                return (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">#{product.id}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {product.image_url && (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        )}
                        <span>{product.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={isLowStock ? 'text-orange-600 font-semibold' : ''}>
                          {stock}
                        </span>
                        {isLowStock && <AlertTriangle className="w-4 h-4 text-orange-600" />}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{minStock}</td>
                    <td className="py-3 px-4">{product.price} ₽</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        product.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {product.is_active ? 'Активен' : 'Скрыт'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            const newStock = prompt(`Текущий остаток: ${stock}\nВведите новое значение:`, stock);
                            if (newStock !== null && !isNaN(newStock)) {
                              updateStock(product.id, parseInt(newStock));
                            }
                          }}
                          className="p-2 hover:bg-gray-100 rounded text-blue-600"
                          title="Изменить остаток"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {searchQuery || filterLowStock ? 'Товары не найдены' : 'Нет товаров на складе'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
