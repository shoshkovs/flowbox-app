import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronUp, Package as PackageIcon, TrendingDown, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { WarehouseForm } from './warehouse/WarehouseForm';
import { WriteOffDialog } from './warehouse/WriteOffDialog';
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

  const handleSaveSupply = async (data) => {
    await loadSupplies();
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  if (showForm) {
    return (
      <WarehouseForm
        authToken={authToken}
        onClose={() => setShowForm(false)}
        onSave={handleSaveSupply}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl">Склад</h1>
          <p className="text-gray-600 mt-1">Партийный учет товаров и поставок</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              try {
                const response = await fetch(`${API_BASE}/api/admin/warehouse/diagnostics`, {
                  headers: {
                    'Authorization': `Bearer ${authToken}`,
                  },
                });
                if (response.ok) {
                  const data = await response.json();
                  console.log('📊 Диагностика склада:', data);
                  
                  // Выводим в консоль и показываем уведомление
                  const negativeProducts = data.products.filter(p => p.stock < 0);
                  const message = `Товаров: ${data.summary.totalProducts}, Поставок: ${data.summary.totalSupplies}, Отрицательных остатков: ${data.summary.productsWithNegativeStock}`;
                  
                  toast.success(message, {
                    duration: 5000,
                  });
                  
                  // Выводим детали в консоль
                  console.table(data.products.map(p => ({
                    'Товар': p.name,
                    'Поставлено': p.supplied,
                    'Продано': p.sold,
                    'Списано': p.written_off,
                    'Остаток': p.stock
                  })));
                  
                  if (negativeProducts.length > 0) {
                    console.warn('⚠️ Товары с отрицательными остатками:');
                    console.table(negativeProducts.map(p => ({
                      'Товар': p.name,
                      'Остаток': p.stock
                    })));
                  }
                } else {
                  const error = await response.json();
                  toast.error(error.error || 'Ошибка получения диагностики');
                }
              } catch (error) {
                console.error('Ошибка получения диагностики:', error);
                toast.error('Ошибка получения диагностики');
              }
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            Показать диагностику
          </button>
          <button
            onClick={async () => {
              if (!confirm('Исправить отрицательные остатки на складе? Это удалит лишние списания.')) {
                return;
              }
              try {
                const response = await fetch(`${API_BASE}/api/admin/warehouse/fix-negative-stock`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${authToken}`,
                  },
                });
                if (response.ok) {
                  const data = await response.json();
                  toast.success(data.message || 'Отрицательные остатки исправлены');
                  await loadWarehouseData();
                  if (activeTab === 'supplies') {
                    await loadSupplies();
                  }
                } else {
                  const error = await response.json();
                  toast.error(error.error || 'Ошибка исправления остатков');
                }
              } catch (error) {
                console.error('Ошибка исправления остатков:', error);
                toast.error('Ошибка исправления остатков');
              }
            }}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 flex items-center gap-2"
          >
            Исправить остатки
          </button>
          <button
            onClick={async () => {
              if (!confirm('Вы уверены, что хотите удалить все гортензии? Это действие нельзя отменить.')) {
                return;
              }
              try {
                const response = await fetch(`${API_BASE}/api/admin/warehouse/delete-hydrangeas`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${authToken}`,
                  },
                });
                if (response.ok) {
                  const data = await response.json();
                  toast.success(data.message || 'Гортензии успешно удалены');
                  await loadWarehouseData();
                  if (activeTab === 'supplies') {
                    await loadSupplies();
                  }
                } else {
                  const error = await response.json();
                  toast.error(error.error || 'Ошибка удаления гортензий');
                }
              } catch (error) {
                console.error('Ошибка удаления гортензий:', error);
                toast.error('Ошибка удаления гортензий');
              }
            }}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2"
          >
            Удалить гортензии
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить поставку
          </button>
        </div>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('products')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'products'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Товары
          </button>
          <button
            onClick={() => setActiveTab('supplies')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'supplies'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Поставки
          </button>
        </nav>
      </div>

      {/* KPI карточки (только для вкладки Товары) */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Стоимость склада</p>
                <p className="text-2xl mt-2">{totalValue.toLocaleString()} ₽</p>
                <p className="text-sm text-gray-500 mt-1">Закупочная цена</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <PackageIcon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Низкие остатки</p>
                <p className="text-2xl mt-2">{lowStockCount}</p>
                <p className="text-sm text-gray-500 mt-1">Меньше 20 шт</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <TrendingDown className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Нулевые остатки</p>
                <p className="text-2xl mt-2">{outOfStockCount}</p>
                <p className="text-sm text-gray-500 mt-1">Требуют заказа</p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
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

                return (
                  <div
                    key={product.id}
                    className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleProduct(product.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          {/* Изображение товара */}
                          <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.productName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <PackageIcon className="w-8 h-8" />
                              </div>
                            )}
                          </div>
                          {/* Название и категория */}
                          <div className="flex-1">
                            <div className="text-lg font-semibold">{product.productName}</div>
                            <div className="text-sm text-gray-500 mt-1">
                              {product.category} • {product.color}
                            </div>
                          </div>
                        </div>
                        {/* Остаток справа */}
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm text-gray-500">Остаток</div>
                            <div className="text-xl font-semibold">{product.totalRemaining} шт</div>
                          </div>
                          <button className="p-2 hover:bg-gray-100 rounded">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>
                      
                      {/* Статистика под заголовком */}
                      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-200">
                        <div className="text-sm">
                          <span className="text-gray-500">Всего поставлено:</span>{' '}
                          <span className="font-medium">{totalSupplied} шт</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Продано:</span>{' '}
                          <span className="font-medium">{totalSold} шт</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Списано:</span>{' '}
                          <span className="font-medium">{totalWriteOff} шт</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Остаток:</span>{' '}
                          <span className="font-medium">{product.totalRemaining} шт</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-gray-50">
                        <table className="w-full">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                                Поставка
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                                Дата
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Привезено
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Продано
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Списано
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Остаток
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Цена закупки
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Себестоимость
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                Поставщик
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-600">
                                Действия
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {product.batches.map((batch) => {
                              const isExhausted = batch.remaining === 0;
                              const isCurrent = currentBatchId === batch.id;
                              const totalCost = batch.remaining * batch.purchasePrice;

                              return (
                                <tr
                                  key={batch.id}
                                  className={`border-b border-gray-200 ${
                                    isExhausted ? 'bg-gray-50' : 'bg-white'
                                  }`}
                                >
                                  <td className="py-2 px-4 text-sm">
                                    #{batch.supplyId || batch.id}
                                    {isCurrent && (
                                      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                                        Текущая
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-4 text-sm">
                                    {new Date(batch.deliveryDate).toLocaleDateString('ru-RU')}
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {batch.initialQuantity}
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {batch.sold}
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {batch.writeOff}
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {batch.remaining}
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {batch.purchasePrice} ₽
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {totalCost.toLocaleString()} ₽
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm">
                                    {batch.supplier}
                                  </td>
                                  <td className="py-2 px-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        className="h-7 w-7 p-1 hover:bg-gray-100 rounded flex items-center justify-center"
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
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        className="h-7 w-7 p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded flex items-center justify-center"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteBatch(product.id, batch.id);
                                        }}
                                        title="Удалить партию"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Поставщик
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Дата
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                    Стоимость
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                {supplies.map((supply) => {
                  const isExpanded = expandedSupplies.has(supply.id);
                  return (
                    <>
                      <tr
                        key={supply.id}
                        className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleSupply(supply.id)}
                      >
                        <td className="py-3 px-4 text-sm font-medium">
                          #{supply.id}
                        </td>
                        <td className="py-3 px-4 text-sm font-medium">
                          {supply.supplierName || 'Не указан'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {new Date(supply.deliveryDate).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-medium">
                          {supply.totalAmount.toLocaleString()} ₽
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button className="p-1 hover:bg-gray-100 rounded">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && supply.items.length > 0 && (
                        <tr>
                          <td colSpan="5" className="p-0">
                            <div className="bg-gray-50 border-t border-gray-200">
                              <table className="w-full">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                                      Товар
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                      Количество штук
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                      Продано
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                      Списано
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                      Остаток
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                      Цена за шт
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600">
                                      Цена общая
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {supply.items.map((item) => {
                                    const isExhausted = item.remaining === 0;
                                    return (
                                      <tr
                                        key={item.id}
                                        className={`border-b border-gray-200 ${
                                          isExhausted ? 'bg-gray-300 opacity-50' : 'bg-white'
                                        }`}
                                      >
                                        <td className="py-2 px-4 text-sm font-medium">
                                          {item.productName}
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm">
                                          {item.totalPieces}
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm">
                                          {item.sold}
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm">
                                          {item.writeOff}
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm font-medium">
                                          {item.remaining}
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm">
                                          {item.unitPrice.toFixed(2)} ₽
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm font-medium">
                                          {item.totalPrice.toFixed(2)} ₽
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
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
