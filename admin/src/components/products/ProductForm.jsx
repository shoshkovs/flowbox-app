import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { CreatableSelect } from '../CreatableSelect';
import { MultiSelect } from '../MultiSelect';

const API_BASE = window.location.origin;

export function ProductForm({ authToken, productId, onClose, onSave }) {
  const navigate = useNavigate();
  const isEditMode = !!productId;
  
  const [productForm, setProductForm] = useState({
    name: '',
    category_id: null,
    color_id: null,
    price_per_stem: '',
    min_stem_quantity: 1,
    quality_ids: [],
    stem_length_id: null,
    country_id: null,
    variety_id: null,
    tag_ids: [],
    image_url: '',
    is_active: true,
  });

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  
  // Справочники
  const [categories, setCategories] = useState([]);
  const [colors, setColors] = useState([]);
  const [qualities, setQualities] = useState([]);
  const [stemLengths, setStemLengths] = useState([]);
  const [countries, setCountries] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [tags, setTags] = useState([]);

  useEffect(() => {
    loadDictionaries();
    if (isEditMode && productId) {
      loadProduct();
    } else {
      setLoadingData(false);
    }
  }, [productId, isEditMode]);

  const loadDictionaries = async () => {
    try {
      const [categoriesRes, colorsRes, qualitiesRes, stemLengthsRes, countriesRes, varietiesRes, tagsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/product-categories`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${API_BASE}/api/admin/colors`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${API_BASE}/api/admin/product-qualities`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${API_BASE}/api/admin/stem-lengths`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${API_BASE}/api/admin/countries`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${API_BASE}/api/admin/varieties`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch(`${API_BASE}/api/admin/product-tags`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
      ]);

      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (colorsRes.ok) setColors(await colorsRes.json());
      if (qualitiesRes.ok) setQualities(await qualitiesRes.json());
      if (stemLengthsRes.ok) setStemLengths(await stemLengthsRes.json());
      if (countriesRes.ok) setCountries(await countriesRes.json());
      if (varietiesRes.ok) setVarieties(await varietiesRes.json());
      if (tagsRes.ok) setTags(await tagsRes.json());
    } catch (error) {
      console.error('Ошибка загрузки справочников:', error);
      toast.error('Ошибка загрузки справочников');
    }
  };

  const loadProduct = async () => {
    setLoadingData(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/products/${productId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      if (response.ok) {
        const product = await response.json();
        setProductForm({
          name: product.name || '',
          category_id: product.category_id || null,
          color_id: product.color_id || null,
          price_per_stem: product.price_per_stem || product.price || '',
          min_stem_quantity: product.min_stem_quantity || product.min_order_quantity || 1,
          quality_ids: product.quality_ids || (product.qualities ? product.qualities.map(q => q.id) : []),
          stem_length_id: product.stem_length_id || null,
          country_id: product.country_id || null,
          variety_id: product.variety_id || null,
          tag_ids: product.tag_ids || (product.tags ? product.tags.map(t => t.id) : []),
          image_url: product.image_url || '',
          is_active: product.is_active !== false,
        });
      } else {
        toast.error('Ошибка загрузки товара');
      }
    } catch (error) {
      console.error('Ошибка загрузки товара:', error);
      toast.error('Ошибка загрузки товара');
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateCategory = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/product-categories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newCategory = await response.json();
      setCategories([...categories, newCategory]);
      return newCategory;
    }
    throw new Error('Ошибка создания категории');
  };

  const handleCreateColor = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/colors`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newColor = await response.json();
      setColors([...colors, newColor]);
      return newColor;
    }
    throw new Error('Ошибка создания цвета');
  };

  const handleCreateQuality = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/product-qualities`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newQuality = await response.json();
      setQualities([...qualities, newQuality]);
      return newQuality;
    }
    throw new Error('Ошибка создания качества');
  };

  const handleCreateStemLength = async (value) => {
    const response = await fetch(`${API_BASE}/api/admin/stem-lengths`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });
    if (response.ok) {
      const newLength = await response.json();
      setStemLengths([...stemLengths, newLength]);
      return newLength;
    }
    throw new Error('Ошибка создания длины стебля');
  };

  const handleCreateCountry = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/countries`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newCountry = await response.json();
      setCountries([...countries, newCountry]);
      return newCountry;
    }
    throw new Error('Ошибка создания страны');
  };

  const handleCreateVariety = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/varieties`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newVariety = await response.json();
      setVarieties([...varieties, newVariety]);
      return newVariety;
    }
    throw new Error('Ошибка создания сорта');
  };

  const handleCreateTag = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/product-tags`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newTag = await response.json();
      setTags([...tags, newTag]);
      return newTag;
    }
    throw new Error('Ошибка создания тега');
  };

  const handleSaveProduct = async () => {
    // Валидация
    if (!productForm.name) {
      toast.error('Заполните название товара');
      return;
    }
    if (!productForm.category_id) {
      toast.error('Выберите категорию');
      return;
    }
    if (!productForm.color_id) {
      toast.error('Выберите цвет');
      return;
    }
    
    // Валидация цены: должно быть целым числом >= 1
    const pricePerStemInt = parseInt(productForm.price_per_stem);
    if (!productForm.price_per_stem || !Number.isInteger(pricePerStemInt) || pricePerStemInt < 1) {
      toast.error('Цена за стебель должна быть целым числом не менее 1 рубля');
      return;
    }
    
    // Валидация минимального количества: должно быть целым числом >= 1
    const minStemQtyInt = parseInt(productForm.min_stem_quantity);
    if (!productForm.min_stem_quantity || !Number.isInteger(minStemQtyInt) || minStemQtyInt < 1) {
      toast.error('Минимальное количество стеблей должно быть целым числом не менее 1');
      return;
    }
    
    if (!productForm.quality_ids || productForm.quality_ids.length === 0) {
      toast.error('Выберите хотя бы одно отличительное качество');
      return;
    }

    setLoading(true);
    try {
      const productData = {
        name: productForm.name,
        category_id: productForm.category_id,
        color_id: productForm.color_id,
        price_per_stem: pricePerStemInt, // Используем проверенное целое число
        min_stem_quantity: minStemQtyInt, // Используем проверенное целое число
        quality_ids: productForm.quality_ids,
        stem_length_id: productForm.stem_length_id,
        country_id: productForm.country_id,
        variety_id: productForm.variety_id,
        tag_ids: productForm.tag_ids,
        image_url: productForm.image_url || null,
        is_active: productForm.is_active,
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
        if (onSave) {
          onSave();
        } else {
          navigate('/products');
        }
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

  if (loadingData) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            if (onClose) {
              onClose();
            } else {
              navigate('/products');
            }
          }}
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

              <CreatableSelect
                value={productForm.category_id}
                onChange={(id) => setProductForm({ ...productForm, category_id: id })}
                options={categories}
                onCreate={handleCreateCategory}
                placeholder="Выберите категорию"
                label="Категория"
                required
              />

              <CreatableSelect
                value={productForm.color_id}
                onChange={(id) => setProductForm({ ...productForm, color_id: id })}
                options={colors}
                onCreate={handleCreateColor}
                placeholder="Выберите цвет"
                label="Цвет"
                required
              />

              <MultiSelect
                values={productForm.quality_ids}
                onChange={(ids) => setProductForm({ ...productForm, quality_ids: ids })}
                options={qualities}
                onCreate={handleCreateQuality}
                placeholder="Выберите отличительные качества"
                label="Отличительное качество"
                required
              />

              <div>
                <label className="block text-sm font-medium mb-1">
                  Цена за стебель (₽) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={productForm.price_per_stem}
                  onChange={(e) => {
                    // Разрешаем только целые числа
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    if (value === '' || (parseInt(value) >= 1)) {
                      setProductForm({ ...productForm, price_per_stem: value });
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="250"
                />
                <p className="text-xs text-gray-500 mt-1">Только целые числа в рублях (без копеек)</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Минимальное количество стеблей для покупки <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={productForm.min_stem_quantity}
                  onChange={(e) => setProductForm({ ...productForm, min_stem_quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="1"
                />
                <p className="text-xs text-gray-500 mt-1">Минимальное количество стеблей, которое можно заказать</p>
              </div>
            </div>
          </div>

          {/* Характеристики для сотрудника */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">Характеристики (для сотрудника)</h2>
            <div className="space-y-4">
              <CreatableSelect
                value={productForm.stem_length_id}
                onChange={(id) => setProductForm({ ...productForm, stem_length_id: id })}
                options={stemLengths.map(sl => ({ id: sl.id, name: sl.value }))}
                onCreate={handleCreateStemLength}
                placeholder="Выберите длину стебля"
                label="Длина стебля"
                required={false}
              />

              <CreatableSelect
                value={productForm.country_id}
                onChange={(id) => setProductForm({ ...productForm, country_id: id })}
                options={countries}
                onCreate={handleCreateCountry}
                placeholder="Выберите страну"
                label="Страна"
                required={false}
              />

              <CreatableSelect
                value={productForm.variety_id}
                onChange={(id) => setProductForm({ ...productForm, variety_id: id })}
                options={varieties}
                onCreate={handleCreateVariety}
                placeholder="Выберите сорт"
                label="Сорт"
                required={false}
              />

              <MultiSelect
                values={productForm.tag_ids}
                onChange={(ids) => setProductForm({ ...productForm, tag_ids: ids })}
                options={tags}
                onCreate={handleCreateTag}
                placeholder="Выберите теги"
                label="Теги"
                required={false}
              />
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
                  checked={productForm.is_active}
                  onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })}
                  className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
                />
                <span>Активен (показывать в каталоге)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-end gap-4">
        <button
          onClick={() => {
            if (onClose) {
              onClose();
            } else {
              navigate('/products');
            }
          }}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={loading}
        >
          Отменить
        </button>
        <button
          onClick={handleSaveProduct}
          disabled={loading}
          className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
