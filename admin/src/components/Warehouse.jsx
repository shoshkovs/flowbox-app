import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronUp, Package as PackageIcon, TrendingDown, AlertCircle, Edit, Minus, Truck, ShoppingCart, DollarSign, XCircle, Search, Calendar, Trash2 } from 'lucide-react';
import { WarehouseForm } from './warehouse/WarehouseForm';
import { WriteOffDialog } from './warehouse/WriteOffDialog';
import { ProductForm } from './products/ProductForm';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Warehouse({ authToken }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('products'); // 'products' или 'supplies'
  const [showForm, setShowForm] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [expandedSupplies, setExpandedSupplies] = useState(new Set());
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [warehouseProducts, setWarehouseProducts] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [writeOffDialog, setWriteOffDialog] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingSupplyId, setEditingSupplyId] = useState(null);
  const [searchId, setSearchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (activeTab === 'products') {
      loadWarehouseData();
    } else {
      loadSupplies();
    }
  }, [activeTab]);

  const loadWarehouseData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/warehouse`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWarehouseProducts(data);
      } else {
        const error = await response.json().catch(() => ({ error: 'Ошибка загрузки данных склада' }));
        toast.error(error.error || 'Ошибка загрузки данных склада');
        setWarehouseProducts([]);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных склада:', error);
      toast.error('Ошибка загрузки данных склада');
      setWarehouseProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSupplies = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/supplies`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSupplies(data);
      } else {
        const error = await response.json().catch(() => ({ error: 'Ошибка загрузки поставок' }));
        toast.error(error.error || 'Ошибка загрузки поставок');
        setSupplies([]);
      }
    } catch (error) {
      console.error('Ошибка загрузки поставок:', error);
      toast.error('Ошибка загрузки поставок');
      setSupplies([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = warehouseProducts.filter((product) => {
    if (showOnlyInStock && product.totalRemaining === 0) return false;
    if (
      searchQuery &&
      !product.productName.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  const totalValue = warehouseProducts.reduce((sum, product) => {
    return (
      sum +
      product.batches.reduce(
        (batchSum, batch) => batchSum + batch.remaining * batch.purchasePrice,
        0
      )
    );
  }, 0);

  const lowStockCount = warehouseProducts.filter(
    (product) => product.totalRemaining > 0 && product.totalRemaining < 20
  ).length;

  const outOfStockCount = warehouseProducts.filter(
    (product) => product.totalRemaining === 0
  ).length;

  const needsOrderingCount = warehouseProducts.filter(
    (product) => product.totalRemaining > 0 && product.totalRemaining < 30
  ).length;

  const filteredSupplies = useMemo(() => {
    return supplies.filter((supply) => {
      // Filter by ID
      if (searchId && !supply.id.toString().includes(searchId)) {
        return false;
      }
      // Filter by date range
      const supplyDate = new Date(supply.deliveryDate);
      if (startDate && supplyDate < new Date(startDate)) {
        return false;
      }
      if (endDate && supplyDate > new Date(endDate)) {
        return false;
      }
      return true;
    });
  }, [supplies, searchId, startDate, endDate]);

  const toggleProduct = (productId) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const toggleSupply = (supplyId) => {
    const newExpanded = new Set(expandedSupplies);
    if (newExpanded.has(supplyId)) {
      newExpanded.delete(supplyId);
    } else {
      newExpanded.add(supplyId);
    }
    setExpandedSupplies(newExpanded);
  };


  const getCurrentBatchId = (batches) => {
    // FIFO logic - find oldest batch with remaining > 0 (sorted by delivery_date ASC)
    const batchesWithStock = batches.filter((batch) => batch.remaining > 0);
    if (batchesWithStock.length === 0) return null;
    
    // Сортируем по дате доставки (старые первые)
    const sortedBatches = [...batchesWithStock].sort((a, b) => {
      const dateA = new Date(a.deliveryDate);
      const dateB = new Date(b.deliveryDate);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      // Если даты одинаковые, сортируем по ID (старые первые)
      return parseInt(a.id) - parseInt(b.id);
    });
    
    return sortedBatches[0]?.id;
  };

  const handleWriteOff = async (productId, batchId, data) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/stock-movements/write-off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          productId,
          supplyId: batchId,
          quantity: data.quantity,
          comment: data.comment || null,
        }),
      });

      if (response.ok) {
        toast.success('Товар успешно списан');
        setWriteOffDialog(null);
        await loadWarehouseData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка списания товара');
      }
    } catch (error) {
      console.error('Ошибка списания:', error);
      toast.error('Ошибка списания товара');
    }
  };

  const handleDeleteBatch = async (productId, batchId) => {
    if (!confirm('Вы уверены, что хотите удалить эту партию? Это действие нельзя отменить.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/supplies/${batchId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        toast.success('Партия успешно удалена');
        await loadWarehouseData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка удаления партии');
      }
    } catch (error) {
      console.error('Ошибка удаления партии:', error);
      toast.error('Ошибка удаления партии');
    }
  };

  const handleDeleteSupply = async (supplyId) => {
    if (!confirm('Вы уверены, что хотите удалить эту поставку? Это действие нельзя отменить.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/admin/supplies/${supplyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        toast.success('Поставка успешно удалена');
        // Обновляем данные склада и поставок
        await loadSupplies();
        if (activeTab === 'products') {
          await loadWarehouseData();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка удаления поставки');
      }
    } catch (error) {
      console.error('Ошибка удаления поставки:', error);
      toast.error('Ошибка удаления поставки');
    }
  };

  const handleSaveSupply = async (data) => {
    await loadSupplies();
    setShowForm(false);
    setEditingSupplyId(null);
  };

  const handleSaveProduct = async () => {
    setEditingProductId(null);
    await loadWarehouseData();
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  if (showForm || editingSupplyId) {
    return (
      <WarehouseForm
        authToken={authToken}
        supplyId={editingSupplyId}
        onClose={() => {
          setShowForm(false);
          setEditingSupplyId(null);
        }}
        onSave={handleSaveSupply}
      />
    );
  }

  if (editingProductId) {
    return (
      <ProductForm
        authToken={authToken}
        productId={editingProductId}
        onClose={() => setEditingProductId(null)}
        onSave={handleSaveProduct}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Складской учёт</h1>
          <p className="text-gray-600 mt-1">Управление остатками и поставками</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="bg-pink-600 text-white px-6 py-3 rounded-lg hover:bg-pink-700 flex items-center gap-2 font-medium text-base"
          >
            <Plus className="w-5 h-5" />
            Добавить поставку
          </button>
        </div>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('products')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'products'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <PackageIcon className={`w-5 h-5 ${activeTab === 'products' ? 'text-pink-600' : 'text-gray-500'}`} />
            Склад
          </button>
          <button
            onClick={() => setActiveTab('supplies')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'supplies'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Truck className={`w-5 h-5 ${activeTab === 'supplies' ? 'text-pink-600' : 'text-gray-500'}`} />
            Поставки
          </button>
        </nav>
      </div>

      {/* KPI карточки (только для вкладки Товары) */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Стоимость склада</p>
                <p className="text-gray-900 mb-1 text-2xl">{totalValue.toLocaleString('ru-RU')} ₽</p>
                <p className="text-xs text-gray-400">По закупочной цене</p>
              </div>
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-pink-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Низкие остатки</p>
                <p className="text-gray-900 mb-1 text-2xl">{lowStockCount}</p>
                <p className="text-xs text-gray-400">Меньше 20 штук</p>
              </div>
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Нулевые остатки</p>
                <p className="text-gray-900 mb-1 text-2xl">{outOfStockCount}</p>
                <p className="text-xs text-gray-400">Товары закончились</p>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Требуют заказа</p>
                <p className="text-gray-900 mb-1 text-2xl">{needsOrderingCount}</p>
                <p className="text-xs text-gray-400">Меньше 30 штук</p>
              </div>
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-pink-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Контент вкладки Товары */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Товары на складе</h2>
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="onlyInStock"
                    checked={showOnlyInStock}
                    onChange={(e) => setShowOnlyInStock(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="onlyInStock" className="cursor-pointer text-sm">
                    Только в наличии
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Поиск по товару..."
                  className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {filteredProducts.map((product) => {
                const isExpanded = expandedProducts.has(product.id);
                const currentBatchId = getCurrentBatchId(product.batches);
                const totalSupplied = product.batches.reduce(
                  (sum, b) => sum + b.initialQuantity,
                  0
                );
                const totalSold = product.batches.reduce((sum, b) => sum + b.sold, 0);
                const totalWriteOff = product.batches.reduce((sum, b) => sum + b.writeOff, 0);
                
                // Находим supply для этого товара (берем первую партию и ищем поставку)
                const firstBatch = product.batches.find(b => b.remaining > 0) || product.batches[0];
                const relatedSupply = firstBatch ? supplies.find(s => {
                  // Проверяем по supplyId из batch или по productId в items
                  return s.id === parseInt(firstBatch.supplyId) || 
                         s.items.some(item => item.productId === product.productId);
                }) : null;

                const stockColor = product.totalRemaining === 0 
                  ? 'text-red-600' 
                  : product.totalRemaining < 20 
                    ? 'text-amber-600' 
                    : 'text-gray-900';
                const availableOrders = (() => {
                  const minOrder = Number(product.minOrderQuantity);
                  const total = Number(product.totalRemaining) || 0;
                  // Если мин заказ не установлен или равен 0, показываем 0 доступных заказов
                  if (!minOrder || minOrder <= 0) {
                    return 0;
                  }
                  // Вычисляем целую часть от деления остатка на мин заказ
                  return Math.floor(total / minOrder);
                })();

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                  >
                    <div
                      className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleProduct(product.id)}
                    >
                      <div className="flex items-center gap-4">
                        {/* Изображение товара */}
                        <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.productName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <PackageIcon className="w-8 h-8 text-gray-400" />
                          )}
                        </div>
                        {/* Название и категория */}
                        <div className="flex-1">
                          <h3 className="text-gray-900 mb-1">{product.productName}</h3>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm text-gray-500">{product.category}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-sm text-gray-500">{product.color}</span>
                          </div>
                          {/* Summary line */}
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>Всего поставлено: <span className="text-gray-700">{totalSupplied} шт</span></span>
                            <span>Продано: <span className="text-gray-700">{totalSold} шт</span></span>
                            <span>Списано: <span className="text-gray-700">{totalWriteOff} шт</span></span>
                            <span>Остаток: <span className={stockColor}>{product.totalRemaining} шт</span></span>
                          </div>
                        </div>
                        {/* Остаток справа */}
                        <div className="text-right">
                          <div className={`mb-1 ${stockColor} text-xl font-semibold`}>{product.totalRemaining} шт</div>
                          <div className="text-sm text-gray-400">доступно {availableOrders} заказов</div>
                        </div>
                        <div className="ml-2">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-white border-b border-gray-100">
                                <th className="px-5 py-3 text-left text-xs text-gray-500">Поставка</th>
                                <th className="px-5 py-3 text-left text-xs text-gray-500">Дата</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Привезено</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Продано</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Списано</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Остаток</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Цена закупки</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Себестоимость</th>
                                <th className="px-5 py-3 text-left text-xs text-gray-500">Поставщик</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Действия</th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.batches
                                .filter(batch => batch.remaining > 0)
                                .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime())
                                .map((batch) => {
                                  const isCurrent = currentBatchId === batch.id;
                                  const totalCost = batch.remaining * batch.purchasePrice;

                                  return (
                                    <tr key={batch.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                      <td className="px-5 py-4">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm text-gray-900">#{batch.supplyId || batch.id}</span>
                                          {isCurrent && (
                                            <span className="px-2 py-0.5 bg-pink-50 text-pink-600 text-xs rounded-md">
                                              Текущая
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-5 py-4 text-sm text-gray-600">
                                        {new Date(batch.deliveryDate).toLocaleDateString('ru-RU')}
                                      </td>
                                      <td className="px-5 py-4 text-sm text-gray-900 text-right">{batch.initialQuantity}</td>
                                      <td className="px-5 py-4 text-sm text-gray-900 text-right">{batch.sold}</td>
                                      <td className="px-5 py-4 text-sm text-gray-900 text-right">{batch.writeOff}</td>
                                      <td className="px-5 py-4 text-sm text-right">
                                        <span className={batch.remaining === 0 ? 'text-gray-400' : 'text-gray-900'}>
                                          {batch.remaining}
                                        </span>
                                      </td>
                                      <td className="px-5 py-4 text-sm text-gray-900 text-right">{batch.purchasePrice} ₽</td>
                                      <td className="px-5 py-4 text-sm text-gray-900 text-right">{totalCost.toLocaleString('ru-RU')} ₽</td>
                                      <td className="px-5 py-4 text-sm text-gray-600">{batch.supplier}</td>
                                      <td className="px-5 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setWriteOffDialog({
                                                open: true,
                                                productId: product.id,
                                                batchId: batch.id,
                                                productName: product.productName,
                                                batchNumber: batch.batchNumber,
                                                availableQuantity: batch.remaining,
                                              });
                                            }}
                                            disabled={batch.remaining === 0}
                                            title="Списать"
                                          >
                                            <Minus className={`w-4 h-4 ${batch.remaining === 0 ? 'text-gray-300' : 'text-red-500'}`} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Контент вкладки Поставки */}
      {activeTab === 'supplies' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search by ID */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">Поиск по ID</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    placeholder="Введите ID поставки"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
              </div>
              {/* Start Date */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">Дата от</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
              </div>
              {/* End Date */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">Дата до</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
            {/* Results count */}
            {(searchId || startDate || endDate) && (
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                Найдено поставок: {filteredSupplies.length}
              </div>
            )}
          </div>

          {/* Supplies List */}
          <div className="space-y-4">
            {filteredSupplies.length > 0 ? (
              filteredSupplies.map((supply) => {
                const isExpanded = expandedSupplies.has(supply.id);
                const allExhausted = supply.items.every(item => item.remaining === 0);
                const totalQuantity = supply.items.reduce((sum, item) => sum + item.totalPieces, 0);
                const totalSold = supply.items.reduce((sum, item) => sum + item.sold, 0);
                const totalWrittenOff = supply.items.reduce((sum, item) => sum + item.writeOff, 0);
                const totalRemaining = supply.items.reduce((sum, item) => sum + item.remaining, 0);
                
                return (
                  <div
                    key={supply.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                  >
                    {/* Header */}
                    <div
                      className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleSupply(supply.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Truck className="w-6 h-6 text-pink-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-gray-900">Поставка #{supply.id}</h3>
                            <span className="text-gray-400">•</span>
                            <span className="text-sm text-gray-500">{supply.supplierName || 'Не указан'}</span>
                          </div>
                          <p className="text-sm text-gray-400">
                            {new Date(supply.deliveryDate).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-gray-900 mb-1">{supply.totalAmount.toLocaleString('ru-RU')} ₽</div>
                          <div className="text-sm text-gray-400">{supply.items.length} товаров</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSupplyId(supply.id);
                          }}
                          className="p-2 hover:bg-pink-50 rounded-lg transition-colors"
                          title="Редактировать поставку"
                        >
                          <Edit className="w-4 h-4 text-gray-400 hover:text-pink-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSupply(supply.id);
                          }}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors ml-1"
                          title="Удалить поставку"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
                        </button>
                        <div className="ml-2">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-5 py-3 text-left text-xs text-gray-500">Товар</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Штук</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Продано</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Списано</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Остаток</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Цена</th>
                                <th className="px-5 py-3 text-right text-xs text-gray-500">Общая стоимость</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supply.items.map((item, index) => (
                                <tr key={index} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                  <td className="px-5 py-4 text-sm text-gray-900">{item.productName}</td>
                                  <td className="px-5 py-4 text-sm text-gray-900 text-right">{item.totalPieces}</td>
                                  <td className="px-5 py-4 text-sm text-gray-900 text-right">{item.sold}</td>
                                  <td className="px-5 py-4 text-sm text-gray-900 text-right">{item.writeOff}</td>
                                  <td className="px-5 py-4 text-sm text-right">
                                    <span className={item.remaining === 0 ? 'text-gray-400' : 'text-gray-900'}>
                                      {item.remaining}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-sm text-gray-900 text-right">{item.unitPrice.toFixed(2)} ₽</td>
                                  <td className="px-5 py-4 text-sm text-gray-900 text-right">
                                    {(item.unitPrice * item.totalPieces).toLocaleString('ru-RU')} ₽
                                  </td>
                                </tr>
                              ))}
                              {/* Total Row */}
                              <tr className="bg-gray-50">
                                <td className="px-5 py-4 text-sm text-gray-900">Итого</td>
                                <td className="px-5 py-4 text-sm text-gray-900 text-right">{totalQuantity}</td>
                                <td className="px-5 py-4 text-sm text-gray-900 text-right">{totalSold}</td>
                                <td className="px-5 py-4 text-sm text-gray-900 text-right">{totalWrittenOff}</td>
                                <td className="px-5 py-4 text-sm text-gray-900 text-right">{totalRemaining}</td>
                                <td className="px-5 py-4"></td>
                                <td className="px-5 py-4 text-sm text-gray-900 text-right">
                                  {supply.totalAmount.toLocaleString('ru-RU')} ₽
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                <p className="text-gray-500">Поставки не найдены</p>
                <p className="text-sm text-gray-400 mt-2">Попробуйте изменить параметры поиска</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Диалог списания */}
      {writeOffDialog && (
        <WriteOffDialog
          open={writeOffDialog.open}
          batchInfo={{
            productName: writeOffDialog.productName,
            batchNumber: writeOffDialog.batchNumber || `#${writeOffDialog.batchId}`,
            availableQuantity: writeOffDialog.availableQuantity,
          }}
          onClose={() => setWriteOffDialog(null)}
          onConfirm={(data) => {
            handleWriteOff(writeOffDialog.productId, writeOffDialog.batchId, data);
          }}
        />
      )}
    </div>
  );
}
