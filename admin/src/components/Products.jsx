import { useState, useEffect } from 'react';
import { Plus, Edit, Eye, EyeOff, Trash2, ArrowLeft, Upload, X } from 'lucide-react';

const API_BASE = window.location.origin;

export function Products({ authToken }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [productForm, setProductForm] = useState({
    name: '',
    category: '',
    color: '',
    type: '',
    price: '',
    description: '',
    stem_length: '',
    variety: '',
    country: '',
    stems_count: '',
    tags: [],
    image_url: '',
    is_active: true,
    is_bestseller: false,
    is_new: false,
  });

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

  const handleAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      category: '',
      color: '',
      type: '',
      price: '',
      description: '',
      stem_length: '',
      variety: '',
      country: '',
      stems_count: '',
      tags: [],
      image_url: '',
      is_active: true,
      is_bestseller: false,
      is_new: false,
    });
    setShowProductForm(true);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || '',
      category: product.type || '',
      color: product.color || '',
      type: product.type || '',
      price: product.price || '',
      description: product.description || '',
      stem_length: product.features?.stem_length || '',
      variety: product.features?.variety || '',
      country: product.features?.country || '',
      stems_count: product.features?.stems_count || '',
      tags: product.features?.tags || [],
      image_url: product.image_url || '',
      is_active: product.is_active !== false,
      is_bestseller: product.features?.is_bestseller || false,
      is_new: product.features?.is_new || false,
    });
    setShowProductForm(true);
  };

  const handleSaveProduct = async () => {
    try {
      const productData = {
        name: productForm.name,
        type: productForm.category || productForm.type,
        color: productForm.color,
        price: parseFloat(productForm.price),
        description: productForm.description,
        image_url: productForm.image_url,
        is_active: productForm.is_active,
        features: {
          stem_length: productForm.stem_length,
          variety: productForm.variety,
          country: productForm.country,
          stems_count: productForm.stems_count,
          tags: productForm.tags,
          is_bestseller: productForm.is_bestseller,
          is_new: productForm.is_new,
        },
      };

      const url = editingProduct 
        ? `${API_BASE}/api/admin/products/${editingProduct.id}`
        : `${API_BASE}/api/admin/products`;
      
      const method = editingProduct ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(productData),
      });

      if (response.ok) {
        await loadProducts();
        setShowProductForm(false);
        setEditingProduct(null);
      } else {
        alert('Ошибка сохранения товара');
      }
    } catch (error) {
      console.error('Ошибка сохранения товара:', error);
      alert('Ошибка сохранения товара');
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
      } else {
        alert('Ошибка удаления товара');
      }
    } catch (error) {
      console.error('Ошибка удаления товара:', error);
      alert('Ошибка удаления товара');
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

  if (showProductForm) {
    return (
      <div className="space-y-6">
        {/* Заголовок с кнопкой назад */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setShowProductForm(false);
              setEditingProduct(null);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">
              {editingProduct ? 'Редактировать товар' : 'Добавить товар'}
            </h1>
            <p className="text-gray-600 mt-1">Заполните информацию о товаре</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка - Основная информация */}
          <div className="lg:col-span-2 space-y-6">
            {/* Основная информация */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Основная информация</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Название <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Красные розы Фридом 60см"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Категория <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Выберите или создайте категорию..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Цвет <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productForm.color}
                    onChange={(e) => setProductForm({ ...productForm, color: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Выберите или создайте цвет..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Тип товара</label>
                  <input
                    type="text"
                    value={productForm.type}
                    onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Выберите или создайте тип..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Цена продажи (₽) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="250"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Описание</label>
                  <textarea
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    rows="4"
                    placeholder="Красивые розы из Эквадора, идеально подходят для букетов..."
                  />
                </div>
              </div>
            </div>

            {/* Характеристики */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Характеристики</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Длина стебля (см)</label>
                  <input
                    type="text"
                    value={productForm.stem_length}
                    onChange={(e) => setProductForm({ ...productForm, stem_length: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Сорт</label>
                  <input
                    type="text"
                    value={productForm.variety}
                    onChange={(e) => setProductForm({ ...productForm, variety: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Фридом"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Страна</label>
                  <input
                    type="text"
                    value={productForm.country}
                    onChange={(e) => setProductForm({ ...productForm, country: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Эквадор"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Кол-во стеблей</label>
                  <input
                    type="text"
                    value={productForm.stems_count}
                    onChange={(e) => setProductForm({ ...productForm, stems_count: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="1 шт / 15 шт"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Теги</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="Добавить тег..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      setProductForm({
                        ...productForm,
                        tags: [...productForm.tags, e.target.value.trim()],
                      });
                      e.target.value = '';
                    }
                  }}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {productForm.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-2"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setProductForm({
                            ...productForm,
                            tags: productForm.tags.filter((_, i) => i !== index),
                          });
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Правая колонка - Изображение и настройки */}
          <div className="space-y-6">
            {/* Изображение */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Изображение</h2>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {productForm.image_url ? (
                  <div className="relative">
                    <img
                      src={productForm.image_url}
                      alt="Preview"
                      className="w-full h-64 object-cover rounded-lg mb-4"
                    />
                    <button
                      onClick={() => setProductForm({ ...productForm, image_url: '' })}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">Загрузить изображение</p>
                    <p className="text-sm text-gray-500">PNG, JPG до 5МВ</p>
                  </>
                )}
                <input
                  type="text"
                  value={productForm.image_url}
                  onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                  className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="URL изображения"
                />
              </div>
            </div>

            {/* Настройки */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Настройки</h2>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!productForm.is_active}
                    onChange={(e) => setProductForm({ ...productForm, is_active: !e.target.checked })}
                    className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
                  />
                  <span>Скрыть из каталога</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.is_bestseller}
                    onChange={(e) => setProductForm({ ...productForm, is_bestseller: e.target.checked })}
                    className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
                  />
                  <span>Хит продаж</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.is_new}
                    onChange={(e) => setProductForm({ ...productForm, is_new: e.target.checked })}
                    className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
                  />
                  <span>Новинка</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              setShowProductForm(false);
              setEditingProduct(null);
            }}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Отменить
          </button>
          <button
            onClick={handleSaveProduct}
            className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
          >
            Сохранить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Товары</h1>
          <p className="text-gray-600 mt-1">Управление каталогом цветов</p>
        </div>
        <button
          onClick={handleAddProduct}
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
                        onClick={() => handleEditProduct(product)}
                        className="p-2 hover:bg-gray-100 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(product)}
                        className="p-2 hover:bg-gray-100 rounded"
                      >
                        {product.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
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
        </div>
      </div>
    </div>
  );
}
