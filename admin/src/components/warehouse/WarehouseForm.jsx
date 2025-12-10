import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Calendar, Search, ChevronDown, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CreatableSelect } from '../CreatableSelect';

const API_BASE = window.location.origin;

export function WarehouseForm({ authToken, onClose, onSave, supplyId }) {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(!!supplyId);
  const isEditMode = !!supplyId;
  
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
    const loadData = async () => {
      await loadProducts();
      await loadSuppliers();
      if (isEditMode && supplyId) {
        await loadSupply();
      }
    };
    loadData();
  }, [supplyId, isEditMode]);

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

  const loadSupply = async () => {
    setLoadingData(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/supplies`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const supplies = await response.json();
        const supply = supplies.find(s => s.id === supplyId);
        if (supply) {
          // Находим supplier_id по имени
          let supplierId = null;
          if (supply.supplierName) {
            const supplier = suppliers.find(s => s.name === supply.supplierName);
            if (supplier) {
              supplierId = supplier.id;
            }
          }
          
          setSupplyForm({
            delivery_date: supply.deliveryDate.split('T')[0],
            supplier_id: supplierId || null,
            total_amount: supply.totalAmount?.toString() || '',
            delivery_price: supply.deliveryPrice?.toString() || '',
            comment: supply.comment || '',
          });
          
          // Преобразуем items в формат формы
          const items = supply.items.map((item, index) => ({
            id: index + 1,
            product_id: item.productId.toString(),
            batch_count: item.batchCount?.toString() || '',
            pieces_per_batch: item.piecesPerBatch?.toString() || '',
            batch_price: item.batchPrice?.toString() || '',
            unit_price: item.unitPrice?.toString() || '',
            total_pieces: item.totalPieces?.toString() || '',
          }));
          setSupplyItems(items.length > 0 ? items : [{
            id: 1,
            product_id: '',
            batch_count: '',
            pieces_per_batch: '',
            batch_price: '',
            unit_price: '',
            total_pieces: '',
          }]);
        }
      } else {
        toast.error('Ошибка загрузки поставки');
      }
    } catch (error) {
      console.error('Ошибка загрузки поставки:', error);
      toast.error('Ошибка загрузки поставки');
    } finally {
      setLoadingData(false);
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
          // Заменяем запятую на точку для корректного парсинга
          const batchPriceStr = updated.batch_price ? updated.batch_price.replace(',', '.') : '';
          const batchPrice = batchPriceStr ? parseFloat(batchPriceStr) : 0;
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
      // Заменяем запятую на точку для корректного парсинга
      const batchPriceStr = item.batch_price ? item.batch_price.replace(',', '.') : '';
      const batchPrice = batchPriceStr ? parseFloat(batchPriceStr) : 0;

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
    // Заменяем запятую на точку для корректного парсинга
    const totalAmountStr = supplyForm.total_amount ? supplyForm.total_amount.replace(',', '.') : '';
    const totalAmount = totalAmountStr ? parseFloat(totalAmountStr) : calculateTotalAmount();
    const deliveryPriceStr = supplyForm.delivery_price ? supplyForm.delivery_price.replace(',', '.') : '';
    const deliveryPrice = deliveryPriceStr ? parseFloat(deliveryPriceStr) : 0;

    if (isNaN(totalAmount) || totalAmount < 0) {
      toast.error('Общая сумма должна быть числом больше или равным 0');
      return;
    }

    // Редактирование поставок пока не поддерживается
    if (isEditMode) {
      toast.error('Редактирование поставок пока не поддерживается. Удалите старую поставку и создайте новую.');
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
          items: validItems.map(item => {
            // Заменяем запятую на точку для корректного парсинга
            const batchPriceStr = item.batch_price ? item.batch_price.replace(',', '.') : '';
            const unitPriceStr = item.unit_price ? item.unit_price.replace(',', '.') : '';
            const batchPrice = batchPriceStr ? parseFloat(batchPriceStr) : 0;
            const piecesPerBatch = parseInt(item.pieces_per_batch) || 0;
            const batchCount = parseInt(item.batch_count) || 0;
            return {
            productId: parseInt(item.product_id),
              batchCount: batchCount,
              piecesPerBatch: piecesPerBatch,
              batchPrice: batchPrice,
              unitPrice: unitPriceStr ? parseFloat(unitPriceStr) : (piecesPerBatch > 0 ? batchPrice / piecesPerBatch : 0),
              totalPieces: parseInt(item.total_pieces) || (batchCount * piecesPerBatch),
            };
          }),
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
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Назад к поставкам
      </button>

      {loadingData && (
        <div className="p-6 text-center text-gray-500">Загрузка данных поставки...</div>
      )}

      {!loadingData && (
        <>
          {/* Основная информация о поставке */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-gray-900 mb-6">Информация о поставке</h2>
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Дата поставки <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={supplyForm.delivery_date}
                      onChange={(e) => setSupplyForm({ ...supplyForm, delivery_date: e.target.value })}
                      className="w-full px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
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
                  <label className="block text-sm text-gray-700 mb-2">Общая сумма</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={supplyForm.total_amount}
                    onChange={(e) => {
                      // Разрешаем только цифры, точку и запятую для десятичных
                      const value = e.target.value.replace(/[^\d.,]/g, '');
                      // Заменяем запятую на точку для парсинга
                      const normalizedValue = value.replace(',', '.');
                      // Сохраняем исходное значение, но проверяем, что оно валидно
                      if (value === '' || /^\d+([.,]\d*)?$/.test(value)) {
                        setSupplyForm({ ...supplyForm, total_amount: value });
                      }
                    }}
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Цена доставки</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={supplyForm.delivery_price}
                    onChange={(e) => {
                      // Разрешаем только цифры, точку и запятую для десятичных
                      const value = e.target.value.replace(/[^\d.,]/g, '');
                      // Сохраняем исходное значение, но проверяем, что оно валидно
                      if (value === '' || /^\d+([.,]\d*)?$/.test(value)) {
                        setSupplyForm({ ...supplyForm, delivery_price: value });
                      }
                    }}
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Комментарий</label>
                  <textarea
                    value={supplyForm.comment}
                    onChange={(e) => setSupplyForm({ ...supplyForm, comment: e.target.value })}
                    placeholder="Дополнительная информация о поставке"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

        {/* Товары в поставке */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-gray-900 mb-6">Товары в поставке</h2>
            <div>
            <div className="space-y-6">
              {supplyItems.map((item, index) => (
                <div key={item.id} className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-sm text-gray-500">Товар {index + 1}</span>
                    {supplyItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSupplyItem(item.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Название товара <span className="text-red-500">*</span>
                      </label>
                  <div className="relative" ref={el => productDropdownRefs.current[item.id] = el}>
                      <div
                        onClick={() => setProductDropdownOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 cursor-pointer flex items-center justify-between bg-white transition-colors hover:border-gray-400"
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
                      <label className="block text-sm text-gray-700 mb-2">Количество банчей</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.batch_count}
                        onChange={(e) => {
                          // Разрешаем только целые числа
                          const value = e.target.value.replace(/[^\d]/g, '');
                          if (value === '' || /^\d+$/.test(value)) {
                            updateSupplyItem(item.id, 'batch_count', value);
                          }
                        }}
                        placeholder="0"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Штук в банче</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.pieces_per_batch}
                        onChange={(e) => {
                          // Разрешаем только целые числа
                          const value = e.target.value.replace(/[^\d]/g, '');
                          if (value === '' || /^\d+$/.test(value)) {
                            updateSupplyItem(item.id, 'pieces_per_batch', value);
                          }
                        }}
                        placeholder="0"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Цена банча</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.batch_price}
                        onChange={(e) => {
                          // Разрешаем только цифры, точку и запятую для десятичных
                          const value = e.target.value.replace(/[^\d.,]/g, '');
                          // Сохраняем исходное значение, но проверяем, что оно валидно
                          if (value === '' || /^\d+([.,]\d*)?$/.test(value)) {
                            updateSupplyItem(item.id, 'batch_price', value);
                          }
                        }}
                        placeholder="0"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Цена за штуку</label>
                      <input
                        type="text"
                        value={item.unit_price || ''}
                        readOnly
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-100 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Количество штук</label>
                      <input
                        type="text"
                        value={item.total_pieces || ''}
                        readOnly
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-100 text-gray-600"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Кнопка добавить товар внизу */}
            <div className="mt-6">
              <button
                type="button"
                onClick={addSupplyItem}
                className="mt-4 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-600 hover:border-pink-300 hover:text-pink-600 hover:bg-pink-50/50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Добавить товар
              </button>
            </div>
            
          </div>
        </div>

        {/* Summary Blocks */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
            <div className="text-sm text-gray-600 mb-2">Ваша сумма</div>
            <div className="text-gray-900 mb-2 text-2xl">
              {(calculateTotalAmount() + (parseFloat((supplyForm.delivery_price || '').replace(',', '.')) || 0)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
            </div>
            <div className="text-xs text-gray-500">Количество всех банчей × цена банча + доставка</div>
          </div>
          <div className="bg-pink-50 rounded-xl p-6 border border-pink-100">
            <div className="text-sm text-pink-900 mb-2">Сумма по чеку</div>
            <div className="text-pink-900 mb-2 text-2xl">
              {((parseFloat((supplyForm.total_amount || '').replace(',', '.')) || 0) + (parseFloat((supplyForm.delivery_price || '').replace(',', '.')) || 0)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
            </div>
            <div className="text-xs text-pink-700">Общая сумма (введенная) + доставка</div>
          </div>
        </div>

          {/* Кнопки действий */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Отменить
            </button>
            <button
              type="button"
              onClick={handleSaveSupply}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить поставку'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
