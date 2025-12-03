import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function WarehouseForm({ authToken }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [deliveryForm, setDeliveryForm] = useState({
    product_id: '',
    quantity: '',
    purchase_price: '',
    delivery_date: new Date().toISOString().split('T')[0],
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
    }
  };

  const handleSaveDelivery = async () => {
    if (!deliveryForm.product_id || !deliveryForm.quantity) {
      toast.error('Заполните обязательные поля');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/warehouse`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: parseInt(deliveryForm.product_id),
          quantity: parseInt(deliveryForm.quantity),
          purchase_price: deliveryForm.purchase_price ? parseFloat(deliveryForm.purchase_price) : null,
          delivery_date: deliveryForm.delivery_date || null,
          supplier: deliveryForm.supplier || null,
          invoice_number: deliveryForm.invoice_number || null,
          comment: deliveryForm.comment || null,
        }),
      });

      if (response.ok) {
        toast.success('Поставка успешно добавлена');
        navigate('/warehouse');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка сохранения поставки');
      }
    } catch (error) {
      console.error('Ошибка сохранения поставки:', error);
      toast.error('Ошибка сохранения поставки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой назад */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/warehouse')}
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
          onClick={() => navigate('/warehouse')}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={loading}
        >
          Отменить
        </button>
        <button
          onClick={handleSaveDelivery}
          disabled={loading}
          className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : 'Сохранить поставку'}
        </button>
      </div>
    </div>
  );
}

