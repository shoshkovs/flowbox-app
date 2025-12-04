import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Calendar, Search, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { CreatableSelect } from '../CreatableSelect';
import { Button } from '../ui/button';

const API_BASE = window.location.origin;

export function WarehouseForm({ authToken, onClose, onSave }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef(null);
  
  const [deliveryForm, setDeliveryForm] = useState({
    product_id: '',
    quantity: '',
    purchase_price: '',
    delivery_date: new Date().toISOString().split('T')[0],
    supplier_id: null,
  });
  
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    loadProducts();
    loadSuppliers();
  }, []);

  // Закрываем dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) {
        setIsProductDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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

  const loadSuppliers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/suppliers`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSuppliers(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки поставщиков:', error);
    }
  };

  const handleCreateSupplier = async (name) => {
    const response = await fetch(`${API_BASE}/api/admin/suppliers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      const newSupplier = await response.json();
      setSuppliers([...suppliers, newSupplier]);
      return newSupplier;
    }
    throw new Error('Ошибка создания поставщика');
  };

  const handleSaveDelivery = async () => {
    if (!deliveryForm.product_id || !deliveryForm.quantity || !deliveryForm.purchase_price || !deliveryForm.delivery_date) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    // Валидация
    const quantityInt = parseInt(deliveryForm.quantity);
    const purchasePriceFloat = parseFloat(deliveryForm.purchase_price);
    
    if (!Number.isInteger(quantityInt) || quantityInt <= 0) {
      toast.error('Количество должно быть целым числом больше 0');
      return;
    }
    
    if (isNaN(purchasePriceFloat) || purchasePriceFloat <= 0) {
      toast.error('Цена закупки должна быть числом больше 0');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/supplies`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: parseInt(deliveryForm.product_id),
          quantity: quantityInt,
          purchasePrice: purchasePriceFloat,
          deliveryDate: deliveryForm.delivery_date,
          supplier: deliveryForm.supplier_id ? suppliers.find(s => s.id === deliveryForm.supplier_id)?.name : null,
          invoiceNumber: null, // Пока не используется
          comment: null, // Пока не используется
        }),
      });

      if (response.ok) {
        toast.success('Поставка успешно добавлена');
        // Вызываем onSave callback для обновления данных
        if (onSave) {
          onSave({
            productId: parseInt(deliveryForm.product_id),
            quantity: quantityInt,
            purchasePrice: purchasePriceFloat,
            deliveryDate: deliveryForm.delivery_date,
            supplier: deliveryForm.supplier_id,
            invoiceNumber: null,
            comment: null,
          });
        }
        // Закрываем форму
        onClose();
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
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
            <div className="relative" ref={productDropdownRef}>
              <div
                onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent cursor-pointer flex items-center justify-between bg-white"
              >
                <span className={deliveryForm.product_id ? 'text-gray-900' : 'text-gray-500'}>
                  {deliveryForm.product_id
                    ? products.find(p => p.id === parseInt(deliveryForm.product_id))?.name || 'Выберите товар'
                    : 'Выберите товар'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isProductDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              
              {isProductDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-200">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Поиск товара..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {products
                      .filter(product => 
                        product.name.toLowerCase().includes(productSearch.toLowerCase())
                      )
                      .map((product) => (
                        <div
                          key={product.id}
                          onClick={() => {
                            setDeliveryForm({ ...deliveryForm, product_id: product.id.toString() });
                            setProductSearch('');
                            setIsProductDropdownOpen(false);
                          }}
                          className={`px-4 py-2 hover:bg-gray-50 cursor-pointer ${
                            deliveryForm.product_id === product.id.toString() ? 'bg-pink-50' : ''
                          }`}
                        >
                          {product.name}
                        </div>
                      ))}
                    {products.filter(product => 
                      product.name.toLowerCase().includes(productSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-2 text-gray-500 text-sm">Товары не найдены</div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
              type="text"
              inputMode="decimal"
              value={deliveryForm.purchase_price}
              onChange={(e) => {
                // Разрешаем только цифры и одну точку/запятую
                const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                // Убираем лишние точки
                const parts = value.split('.');
                const cleanedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                setDeliveryForm({ ...deliveryForm, purchase_price: cleanedValue });
              }}
              onBlur={(e) => {
                // При потере фокуса округляем до 2 знаков после запятой
                const numValue = parseFloat(e.target.value);
                if (!isNaN(numValue) && numValue > 0) {
                  setDeliveryForm({ ...deliveryForm, purchase_price: numValue.toFixed(2) });
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="180.00"
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
                className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                style={{ WebkitAppearance: 'none' }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  const input = e.target.closest('.relative').querySelector('input[type="date"]');
                  if (input) {
                    input.showPicker?.();
                    input.focus();
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 pointer-events-auto"
              >
                <Calendar className="w-5 h-5" />
              </button>
            </div>
          </div>
          <CreatableSelect
            value={deliveryForm.supplier_id}
            onChange={(id) => setDeliveryForm({ ...deliveryForm, supplier_id: id })}
            options={suppliers}
            onCreate={handleCreateSupplier}
            placeholder="Выберите поставщика"
            label="Поставщик"
            required
          />
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-end gap-4">
        <button
          onClick={onClose}
          variant="outline"
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

