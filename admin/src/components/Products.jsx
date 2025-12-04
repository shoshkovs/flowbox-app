import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Eye, EyeOff, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Products({ authToken }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterColor, setFilterColor] = useState('all');
  const [filterFeature, setFilterFeature] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [colors, setColors] = useState([]);
  const [features, setFeatures] = useState([]);

  useEffect(() => {
    loadColors();
    loadQualities();
    loadProducts();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [filterType, filterStatus, filterColor, filterFeature, searchQuery, allProducts]);

  const loadColors = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/colors`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setColors(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки цветов:', error);
    }
  };

  const loadQualities = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/product-qualities`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Загружаем качества из API, а не из товаров
        setFeatures(data.map(q => q.name).sort());
      }
    } catch (error) {
      console.error('Ошибка загрузки качеств:', error);
      // Fallback: собираем из товаров, если API недоступен
    }
  };

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAllProducts(data);
        filterProducts(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = (productsToFilter = allProducts) => {
    let filtered = [...productsToFilter];

    if (filterType !== 'all') {
      filtered = filtered.filter(p => 
        (p.category_name || p.category || '').toLowerCase() === filterType.toLowerCase() ||
        (p.type || '').toLowerCase() === filterType.toLowerCase()
      );
    }
    
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') {
        filtered = filtered.filter(p => p.is_active);
      } else if (filterStatus === 'hidden') {
        filtered = filtered.filter(p => !p.is_active);
      }
    }
    
    if (filterColor !== 'all') {
      filtered = filtered.filter(p => {
        const productColor = (p.color_name || p.color || '').toLowerCase();
        return productColor === filterColor.toLowerCase();
      });
    }
    
    if (filterFeature !== 'all') {
      filtered = filtered.filter(p => {
        // Используем features из таблицы products (TEXT[]) - это основной источник качеств
        let productFeatures = [];
        if (p.features && Array.isArray(p.features) && p.features.length > 0) {
          // features - массив строк из поля products.features
          productFeatures = p.features.filter(f => f && f.trim());
        } else if (p.qualities && Array.isArray(p.qualities) && p.qualities.length > 0) {
          // Fallback: если features нет, используем qualities из связной таблицы
          productFeatures = p.qualities.map(q => (typeof q === 'object' ? q.name : q)).filter(f => f && f.trim());
        }
        
        if (productFeatures.length === 0) return false;
        
        // Проверяем, содержит ли товар выбранное качество (без учета регистра)
        return productFeatures.some(f => {
          if (!f) return false;
          const featureLower = String(f).toLowerCase().trim();
          const filterLower = filterFeature.toLowerCase().trim();
          return featureLower === filterLower;
        });
      });
    }
    
    if (searchQuery) {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setProducts(filtered);
  };

  const handleRefreshProduct = async (productId) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${productId}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        await loadProducts();
        toast.success('Информация о товаре обновлена');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка обновления товара');
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
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        await loadProducts();
        toast.success('Товар удален');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка удаления товара');
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
        <div className="flex gap-4 mb-6 items-center">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="all">Все типы</option>
            <option value="roses">Розы</option>
            <option value="tulips">Тюльпаны</option>
            <option value="chrysanthemums">Хризантемы</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="all">Все статусы</option>
            <option value="active">Активен</option>
            <option value="hidden">Скрыт</option>
          </select>
          <select
            value={filterColor}
            onChange={(e) => setFilterColor(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="all">Все цвета</option>
            {colors.map(color => (
              <option key={color.id} value={color.name}>{color.name}</option>
            ))}
          </select>
          <select
            value={filterFeature}
            onChange={(e) => setFilterFeature(e.target.value)}
            className="px-4 py-2 pr-10 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', paddingRight: '2.5rem' }}
          >
            <option value="all">Все качества</option>
            {features.map(feature => (
              <option key={feature} value={feature}>{feature}</option>
            ))}
          </select>
          <div className="flex-1"></div>
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Товар</th>
                <th className="text-left py-3 px-4">Категория</th>
                <th className="text-left py-3 px-4">Цвет</th>
                <th className="text-left py-3 px-4">Качества</th>
                <th className="text-left py-3 px-4">Цена за шт</th>
                <th className="text-left py-3 px-4">Мин заказ</th>
                <th className="text-left py-3 px-4 pl-8">Статус</th>
                <th className="text-right py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
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
                  <td className="py-3 px-4">{product.category_name || product.category || '-'}</td>
                  <td className="py-3 px-4">{product.color_name || product.color || '-'}</td>
                  <td className="py-3 px-4">
                    {(() => {
                      // Используем features из таблицы products (TEXT[]) - это основной источник качеств
                      let productFeatures = [];
                      if (product.features && Array.isArray(product.features) && product.features.length > 0) {
                        // features - массив строк из поля products.features
                        productFeatures = product.features.filter(f => f && f.trim());
                      } else if (product.qualities && Array.isArray(product.qualities) && product.qualities.length > 0) {
                        // Fallback: если features нет, используем qualities из связной таблицы
                        productFeatures = product.qualities.map(q => typeof q === 'object' ? q.name : q).filter(f => f && f.trim());
                      }
                      
                      // Капитализируем первую букву каждого качества
                      const capitalizeFirst = (str) => {
                        if (!str) return str;
                        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
                      };
                      
                      return productFeatures.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {productFeatures.map((feature, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 text-xs bg-pink-100 text-pink-800 rounded-full w-fit"
                            >
                              {capitalizeFirst(feature)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4">{product.price_per_stem || product.pricePerStem || product.price || 0} ₽</td>
                  <td className="py-3 px-4">{product.min_stem_quantity || product.min_order_quantity || product.minStemQuantity || 1}</td>
                  <td className="py-3 px-4 pl-8">
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
