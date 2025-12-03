import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Eye, EyeOff, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Products({ authToken }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadProducts();
  }, [filterType, filterStatus]);

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        let filtered = data;

        if (filterType !== 'all') {
          filtered = filtered.filter(p => p.type === filterType);
        }
        if (filterStatus !== 'all') {
          if (filterStatus === 'active') {
            filtered = filtered.filter(p => p.is_active);
          } else if (filterStatus === 'hidden') {
            filtered = filtered.filter(p => !p.is_active);
          }
        }
        if (searchQuery) {
          filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }

        setProducts(filtered);
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshProduct = async (productId) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${productId}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        await loadProducts();
        toast.success('Информация о товаре обновлена');
      } else {
        toast.error('Ошибка обновления товара');
      }
    } catch (error) {
      console.error('Ошибка обновления товара:', error);
      toast.error('Ошибка обновления товара');
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        await loadProducts();
        toast.success('Товар удален');
      } else {
        toast.error('Ошибка удаления товара');
      }
    } catch (error) {
      console.error('Ошибка удаления товара:', error);
      toast.error('Ошибка удаления товара');
    }
  };

  const handleToggleActive = async (product) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !product.is_active }),
      });

      if (response.ok) {
        await loadProducts();
      }
    } catch (error) {
      console.error('Ошибка изменения статуса:', error);
    }
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Товары</h1>
          <p className="text-gray-600 mt-1">Управление каталогом цветов</p>
        </div>
        <button
          onClick={() => navigate('/products/new')}
          className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Добавить товар
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex gap-4 mb-6">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Все типы</option>
            <option value="roses">Розы</option>
            <option value="tulips">Тюльпаны</option>
            <option value="chrysanthemums">Хризантемы</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Все статусы</option>
            <option value="active">Активен</option>
            <option value="hidden">Скрыт</option>
          </select>
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Товар</th>
                <th className="text-left py-3 px-4">Тип</th>
                <th className="text-left py-3 px-4">Цвет</th>
                <th className="text-left py-3 px-4">Цена</th>
                <th className="text-left py-3 px-4">Статус</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
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
                  <td className="py-3 px-4">{product.type || '-'}</td>
                  <td className="py-3 px-4">{product.color || '-'}</td>
                  <td className="py-3 px-4">{product.price} ₽</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {product.is_active ? 'Активен' : 'Скрыт'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/products/${product.id}`)}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRefreshProduct(product.id)}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Обновить информацию"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(product)}
                        className="p-2 hover:bg-gray-100 rounded"
                        title={product.is_active ? 'Скрыть' : 'Показать'}
                      >
                        {product.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-2 hover:bg-gray-100 rounded text-red-600"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
