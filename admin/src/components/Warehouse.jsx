import { useState, useEffect } from 'react';
import { Package, TrendingDown, TrendingUp, AlertTriangle, Plus, Edit, ArrowLeft, Calendar } from 'lucide-react';

const API_BASE = window.location.origin;

export function Warehouse({ authToken }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  
  const [deliveryForm, setDeliveryForm] = useState({
    product_id: '',
    quantity: '',
    purchase_price: '',
    delivery_date: '',
    supplier: '',
    invoice_number: '',
    comment: '',
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/products`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDelivery = () => {
    setDeliveryForm({
      product_id: '',
      quantity: '',
      purchase_price: '',
      delivery_date: new Date().toISOString().split('T')[0],
      supplier: '',
      invoice_number: '',
      comment: '',
    });
    setShowDeliveryForm(true);
  };

  const handleSaveDelivery = async () => {
    try {
      // Здесь должна быть логика сохранения поставки
      // Пока что просто обновляем остаток товара
      if (deliveryForm.product_id && deliveryForm.quantity) {
        const product = products.find(p => p.id === parseInt(deliveryForm.product_id));
        if (product) {
          const newStock = (product.stock || 0) + parseInt(deliveryForm.quantity);
          const response = await fetch(`${API_BASE}/api/admin/products/${product.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ stock: newStock }),
          });

          if (response.ok) {
            await loadProducts();
            setShowDeliveryForm(false);
            alert('Поставка успешно добавлена');
          } else {
            alert('Ошибка сохранения поставки');
          }
        }
      } else {
        alert('Заполните обязательные поля');
      }
    } catch (error) {
      console.error('Ошибка сохранения поставки:', error);
      alert('Ошибка сохранения поставки');
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

  if (showDeliveryForm) {
    return (
      <div className="space-y-6">
        {/* Заголовок с кнопкой назад */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowDeliveryForm(false)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">Добавить поставку</h1>
            <p className="text-gray-600 mt-1">Регистрация новой поставки товара</p>
          </div>
        </div>

        {/* Форма поставки */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-6">Информация о поставке</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Товар <span className="text-red-500">*</span>
              </label>
              <select
                value={deliveryForm.product_id}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, product_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              >
                <option value="">Выберите товар</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Количество (шт) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={deliveryForm.quantity}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, quantity: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Цена закупки за шт (₽) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={deliveryForm.purchase_price}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, purchase_price: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="180"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Дата поставки <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={deliveryForm.delivery_date}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Поставщик</label>
              <input
                type="text"
                value={deliveryForm.supplier}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="Название компании"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Номер накладной</label>
              <input
                type="text"
                value={deliveryForm.invoice_number}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, invoice_number: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="INV-2024-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Комментарий</label>
              <textarea
                value={deliveryForm.comment}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, comment: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                rows="4"
                placeholder="Дополнительная информация о поставке..."
              />
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => setShowDeliveryForm(false)}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Отменить
          </button>
          <button
            onClick={handleSaveDelivery}
            className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
          >
            Сохранить поставку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Склад</h1>
          <p className="text-gray-600 mt-1">Учет наличия и движения товаров</p>
        </div>
        <button
          onClick={handleAddDelivery}
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
