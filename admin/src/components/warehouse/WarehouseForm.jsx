import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Calendar, Search, ChevronDown, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CreatableSelect } from '../CreatableSelect';

const API_BASE = window.location.origin;

export function WarehouseForm({ authToken, onClose, onSave }) {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Основные поля поставки
  const [supplyForm, setSupplyForm] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    supplier_id: null,
    total_amount: '', // Пользователь вводит сам
    delivery_price: '',
    comment: '',
  });
  
  // Товары в поставке
  const [supplyItems, setSupplyItems] = useState([
    {
      id: 1,
      product_id: '',
      batch_count: '',
      pieces_per_batch: '',
      batch_price: '',
      unit_price: '',
      total_pieces: '',
    }
  ]);
  
  // Поиск товаров
  const [productSearch, setProductSearch] = useState({});
  const [isProductDropdownOpen, setProductDropdownOpen] = useState({});
  const productDropdownRefs = useRef({});

  useEffect(() => {
    loadProducts();
    loadSuppliers();
  }, []);

  // Закрываем dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(productDropdownRefs.current).forEach(itemId => {
        const ref = productDropdownRefs.current[itemId];
        if (ref && !ref.contains(event.target)) {
          setProductDropdownOpen(prev => ({ ...prev, [itemId]: false }));
        }
      });
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

  // Добавить новый товар в поставку
  const addSupplyItem = () => {
    const newId = Math.max(...supplyItems.map(item => item.id), 0) + 1;
    setSupplyItems([
      ...supplyItems,
      {
        id: newId,
        product_id: '',
        batch_count: '',
        pieces_per_batch: '',
        batch_price: '',
        unit_price: '',
        total_pieces: '',
      }
    ]);
  };

  // Удалить товар из поставки
  const removeSupplyItem = (itemId) => {
    if (supplyItems.length === 1) {
      toast.error('Должен быть хотя бы один товар в поставке');
      return;
    }
    setSupplyItems(supplyItems.filter(item => item.id !== itemId));
    // Очищаем refs и состояние поиска
    delete productDropdownRefs.current[itemId];
    setProductSearch(prev => {
      const newSearch = { ...prev };
      delete newSearch[itemId];
      return newSearch;
    });
    setProductDropdownOpen(prev => {
      const newOpen = { ...prev };
      delete newOpen[itemId];
      return newOpen;
    });
  };

  // Обновить товар в поставке
  const updateSupplyItem = (itemId, field, value) => {
    setSupplyItems(supplyItems.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        
        // Автоматический расчет цены за штуку
        if (field === 'batch_price' || field === 'pieces_per_batch') {
          const batchPrice = parseFloat(updated.batch_price) || 0;
          const piecesPerBatch = parseInt(updated.pieces_per_batch) || 0;
          if (piecesPerBatch > 0) {
            updated.unit_price = (batchPrice / piecesPerBatch).toFixed(2);
          } else {
            updated.unit_price = '';
          }
        }
        
        // Автоматический расчет количества штук
        if (field === 'batch_count' || field === 'pieces_per_batch') {
          const batchCount = parseInt(updated.batch_count) || 0;
          const piecesPerBatch = parseInt(updated.pieces_per_batch) || 0;
          updated.total_pieces = (batchCount * piecesPerBatch).toString();
        }
        
        return updated;
      }
      return item;
    }));
  };

  // Вычислить общую сумму поставки
  const calculateTotalAmount = () => {
    return supplyItems.reduce((sum, item) => {
      const batchCount = parseInt(item.batch_count) || 0;
      const batchPrice = parseFloat(item.batch_price) || 0;
      return sum + (batchCount * batchPrice);
    }, 0);
  };

  const handleSaveSupply = async () => {
    // Валидация основных полей
    if (!supplyForm.delivery_date || !supplyForm.supplier_id) {
      toast.error('Заполните дату поставки и выберите поставщика');
      return;
    }

    // Валидация товаров
    const validItems = supplyItems.filter(item => 
      item.product_id && 
      item.batch_count && 
      item.pieces_per_batch && 
      item.batch_price
    );

    if (validItems.length === 0) {
      toast.error('Добавьте хотя бы один товар с заполненными полями');
      return;
    }

    // Проверка всех товаров
    for (const item of validItems) {
      const batchCount = parseInt(item.batch_count);
      const piecesPerBatch = parseInt(item.pieces_per_batch);
      const batchPrice = parseFloat(item.batch_price);

      if (!Number.isInteger(batchCount) || batchCount <= 0) {
        toast.error('Количество банчей должно быть целым числом больше 0');
        return;
      }

      if (!Number.isInteger(piecesPerBatch) || piecesPerBatch <= 0) {
        toast.error('Количество штук в банче должно быть целым числом больше 0');
        return;
      }

      if (isNaN(batchPrice) || batchPrice <= 0) {
        toast.error('Цена банча должна быть числом больше 0');
        return;
      }
    }

    // Используем введенную пользователем общую сумму, если она указана
    const totalAmount = supplyForm.total_amount ? parseFloat(supplyForm.total_amount) : calculateTotalAmount();
    const deliveryPrice = parseFloat(supplyForm.delivery_price) || 0;

    if (isNaN(totalAmount) || totalAmount < 0) {
      toast.error('Общая сумма должна быть числом больше или равным 0');
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
          deliveryDate: supplyForm.delivery_date,
          supplierId: supplyForm.supplier_id,
          totalAmount: totalAmount,
          deliveryPrice: deliveryPrice,
          comment: supplyForm.comment || null,
          items: validItems.map(item => ({
            productId: parseInt(item.product_id),
            batchCount: parseInt(item.batch_count),
            piecesPerBatch: parseInt(item.pieces_per_batch),
            batchPrice: parseFloat(item.batch_price),
            unitPrice: parseFloat(item.unit_price) || (parseFloat(item.batch_price) / parseInt(item.pieces_per_batch)),
            totalPieces: parseInt(item.total_pieces) || (parseInt(item.batch_count) * parseInt(item.pieces_per_batch)),
          })),
        }),
      });

      if (response.ok) {
        toast.success('Поставка успешно добавлена');
        if (onSave) {
          onSave();
        }
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
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">Добавить поставку</h1>
          <p className="text-gray-600 mt-1">Регистрация новой поставки товара</p>
        </div>
      </div>

      {/* Основная информация о поставке */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Информация о поставке</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Дата поставки <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={supplyForm.delivery_date}
                onChange={(e) => setSupplyForm({ ...supplyForm, delivery_date: e.target.value })}
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
          <div>
            <CreatableSelect
              value={supplyForm.supplier_id}
              onChange={(id) => setSupplyForm({ ...supplyForm, supplier_id: id })}
              options={suppliers}
              onCreate={handleCreateSupplier}
              placeholder="Выберите поставщика"
              label="Поставщик"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Общая сумма (₽)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={supplyForm.total_amount}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                const parts = value.split('.');
                const cleanedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                setSupplyForm({ ...supplyForm, total_amount: cleanedValue });
              }}
              onBlur={(e) => {
                const numValue = parseFloat(e.target.value);
                if (!isNaN(numValue) && numValue >= 0) {
                  setSupplyForm({ ...supplyForm, total_amount: numValue.toFixed(2) });
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Цена доставки (₽)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={supplyForm.delivery_price}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                const parts = value.split('.');
                const cleanedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                setSupplyForm({ ...supplyForm, delivery_price: cleanedValue });
              }}
              onBlur={(e) => {
                const numValue = parseFloat(e.target.value);
                if (!isNaN(numValue) && numValue >= 0) {
                  setSupplyForm({ ...supplyForm, delivery_price: numValue.toFixed(2) });
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="0.00"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Комментарий
            </label>
            <textarea
              value={supplyForm.comment}
              onChange={(e) => setSupplyForm({ ...supplyForm, comment: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              rows={3}
              placeholder="Введите комментарий..."
            />
          </div>
        </div>
      </div>

      {/* Товары в поставке */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Товары в поставке</h2>
        </div>

        <div className="space-y-6">
          {supplyItems.map((item, index) => (
            <div key={item.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-lg">Товар {index + 1}</h3>
                {supplyItems.length > 1 && (
                  <button
                    onClick={() => removeSupplyItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Удалить товар"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Товар <span className="text-red-500">*</span>
                  </label>
                  <div className="relative" ref={el => productDropdownRefs.current[item.id] = el}>
                    <div
                      onClick={() => setProductDropdownOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent cursor-pointer flex items-center justify-between bg-white"
                    >
                      <span className={item.product_id ? 'text-gray-900' : 'text-gray-500'}>
                        {item.product_id
                          ? products.find(p => p.id === parseInt(item.product_id))?.name || 'Выберите товар'
                          : 'Выберите товар'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isProductDropdownOpen[item.id] ? 'rotate-180' : ''}`} />
                    </div>
                    
                    {isProductDropdownOpen[item.id] && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-gray-200">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={productSearch[item.id] || ''}
                              onChange={(e) => setProductSearch(prev => ({ ...prev, [item.id]: e.target.value }))}
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
                              (productSearch[item.id] || '').toLowerCase() === '' ||
                              product.name.toLowerCase().includes((productSearch[item.id] || '').toLowerCase())
                            )
                            .map((product) => (
                              <div
                                key={product.id}
                                onClick={() => {
                                  updateSupplyItem(item.id, 'product_id', product.id.toString());
                                  setProductSearch(prev => ({ ...prev, [item.id]: '' }));
                                  setProductDropdownOpen(prev => ({ ...prev, [item.id]: false }));
                                }}
                                className={`px-4 py-2 hover:bg-gray-50 cursor-pointer ${
                                  item.product_id === product.id.toString() ? 'bg-pink-50' : ''
                                }`}
                              >
                                {product.name}
                              </div>
                            ))}
                          {products.filter(product => 
                            (productSearch[item.id] || '').toLowerCase() === '' ||
                            product.name.toLowerCase().includes((productSearch[item.id] || '').toLowerCase())
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
                    Количество банчей <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={item.batch_count}
                    onChange={(e) => updateSupplyItem(item.id, 'batch_count', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="10"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Штук в банче <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={item.pieces_per_batch}
                    onChange={(e) => updateSupplyItem(item.id, 'pieces_per_batch', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Цена банча (₽) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.batch_price}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                      const parts = value.split('.');
                      const cleanedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                      updateSupplyItem(item.id, 'batch_price', cleanedValue);
                    }}
                    onBlur={(e) => {
                      const numValue = parseFloat(e.target.value);
                      if (!isNaN(numValue) && numValue > 0) {
                        updateSupplyItem(item.id, 'batch_price', numValue.toFixed(2));
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="1800.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Цена за штуку (₽)
                  </label>
                  <input
                    type="text"
                    value={item.unit_price || ''}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Количество штук
                  </label>
                  <input
                    type="text"
                    value={item.total_pieces || ''}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Кнопка добавить товар внизу */}
        <div className="mt-6">
          <button
            onClick={addSupplyItem}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить товар
          </button>
        </div>
        
        {/* Итоговые суммы */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Ваша сумма
              </label>
              <p className="text-2xl font-bold">
                {(calculateTotalAmount() + (parseFloat(supplyForm.delivery_price) || 0)).toFixed(2)} ₽
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Количество всех банчей × цена банча + доставка
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Сумма по чеку
              </label>
              <p className="text-2xl font-bold">
                {((parseFloat(supplyForm.total_amount) || 0) + (parseFloat(supplyForm.delivery_price) || 0)).toFixed(2)} ₽
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Общая сумма (введенная) + доставка
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-end gap-4">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Отменить
        </button>
        <button
          onClick={handleSaveSupply}
          disabled={loading}
          className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : 'Сохранить поставку'}
        </button>
      </div>
    </div>
  );
}
