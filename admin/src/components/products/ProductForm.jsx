import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function ProductForm({ authToken, productId }) {
  const navigate = useNavigate();
  const isEditMode = !!productId;
  
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

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEditMode && productId) {
      loadProduct();
    }
  }, [productId, isEditMode]);

  const loadProduct = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${productId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const product = await response.json();
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
      } else {
        toast.error('Ошибка загрузки товара');
      }
    } catch (error) {
      console.error('Ошибка загрузки товара:', error);
      toast.error('Ошибка загрузки товара');
    }
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.price) {
      toast.error('Заполните обязательные поля');
      return;
    }

    setLoading(true);
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

      const url = isEditMode
        ? `${API_BASE}/api/admin/products/${productId}`
        : `${API_BASE}/api/admin/products`;
      
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(productData),
      });

      if (response.ok) {
        toast.success(isEditMode ? 'Товар обновлен' : 'Товар создан');
        navigate('/products');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка сохранения товара');
      }
    } catch (error) {
      console.error('Ошибка сохранения товара:', error);
      toast.error('Ошибка сохранения товара');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой назад */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/products')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Редактировать товар' : 'Добавить товар'}
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
          onClick={() => navigate('/products')}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={loading}
        >
          Отменить
        </button>
        <button
          onClick={handleSaveProduct}
          disabled={loading}
          className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

