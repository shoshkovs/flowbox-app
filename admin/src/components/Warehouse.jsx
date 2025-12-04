import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronUp, Package as PackageIcon, TrendingDown, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { WarehouseForm } from './warehouse/WarehouseForm';
import { WriteOffDialog } from './warehouse/WriteOffDialog';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function Warehouse({ authToken }) {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [warehouseProducts, setWarehouseProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [writeOffDialog, setWriteOffDialog] = useState(null);

  useEffect(() => {
    loadWarehouseData();
  }, []);

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
    try {
      const response = await fetch(`${API_BASE}/api/admin/supplies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          productId: data.productId,
          quantity: data.quantity,
          purchasePrice: data.purchasePrice,
          deliveryDate: data.deliveryDate,
          supplier: data.supplier,
          invoiceNumber: data.invoiceNumber,
          comment: data.comment,
        }),
      });

      if (response.ok) {
        toast.success('Поставка успешно добавлена');
        setShowForm(false);
        await loadWarehouseData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка создания поставки');
      }
    } catch (error) {
      console.error('Ошибка создания поставки:', error);
      toast.error('Ошибка создания поставки');
    }
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
        <button
          onClick={() => setShowForm(true)}
          className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Добавить поставку
        </button>
      </div>
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
                <p className="text-sm text-gray-500 mt-1">Меньше 10 шт</p>
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
              const totalWriteOff = product.batches.reduce(
                (sum, b) => sum + b.writeOff,
                0
              );
              return (
                <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleProduct(product.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <img
                          src={product.image}
                          alt={product.productName}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <h3 className="font-medium text-lg">
                            {product.productName}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-gray-500">
                              {product.category}
                            </span>
                            <span className="text-sm text-gray-400">•</span>
                            <span className="text-sm text-gray-500">
                              {product.color}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Остаток</p>
                          <p
                            className={`text-2xl mt-1 ${
                              product.totalRemaining === 0
                                ? 'text-red-600'
                                : product.totalRemaining < 10
                                ? 'text-orange-600'
                                : 'text-gray-900'
                            }`}
                          >
                            {product.totalRemaining} шт
                          </p>
                        </div>
                        <button className="p-2 hover:bg-gray-100 rounded-lg">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-4">
                      {/* Summary block */}
                      <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-white rounded-lg border border-gray-200">
                        <div>
                          <p className="text-xs text-gray-600">Всего поставлено</p>
                          <p className="text-lg mt-1">{totalSupplied} шт</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Продано</p>
                          <p className="text-lg mt-1">{totalSold} шт</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Списано</p>
                          <p className="text-lg mt-1">{totalWriteOff} шт</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Остаток</p>
                          <p className="text-lg mt-1 font-medium">
                            {product.totalRemaining} шт
                          </p>
                        </div>
                      </div>
                      {/* Batches table */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-200">
                                <th className="text-left py-2 px-3 text-xs">
                                  Поставка
                                </th>
                                <th className="text-left py-2 px-3 text-xs">Дата</th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Привезено
                                </th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Продано
                                </th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Списано
                                </th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Остаток
                                </th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Цена закупки
                                </th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Себестоимость
                                </th>
                                <th className="text-left py-2 px-3 text-xs">
                                  Поставщик
                                </th>
                                <th className="text-right py-2 px-3 text-xs">
                                  Действия
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.batches.map((batch) => {
                                const isCurrentBatch = batch.id === currentBatchId;
                                const isExhausted = batch.remaining === 0;
                                const totalCost = batch.initialQuantity * batch.purchasePrice;
                                return (
                                  <tr
                                    key={batch.id}
                                    className={`border-b border-gray-100 ${
                                      isExhausted
                                        ? 'bg-gray-50 text-gray-400'
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <td className="py-2 px-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm">
                                          {batch.batchNumber}
                                        </span>
                                        {isCurrentBatch && (
                                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                            Текущая
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-sm">
                                      {new Date(
                                        batch.deliveryDate
                                      ).toLocaleDateString('ru-RU')}
                                    </td>
                                    <td className="py-2 px-3 text-right text-sm">
                                      {batch.initialQuantity}
                                    </td>
                                    <td className="py-2 px-3 text-right text-sm">
                                      {batch.sold}
                                    </td>
                                    <td className="py-2 px-3 text-right text-sm">
                                      {batch.writeOff}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <span
                                        className={`text-sm font-medium ${
                                          isExhausted
                                            ? 'text-gray-400'
                                            : batch.remaining < 5
                                            ? 'text-orange-600'
                                            : 'text-gray-900'
                                        }`}
                                      >
                                        {batch.remaining}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right text-sm">
                                      {batch.purchasePrice} ₽
                                    </td>
                                    <td className="py-2 px-3 text-right text-sm">
                                      {totalCost.toLocaleString()} ₽
                                    </td>
                                    <td className="py-2 px-3 text-sm">
                                      {batch.supplier}
                                    </td>
                                    <td className="py-2 px-3">
                                      <div className="flex items-center justify-end gap-1">
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
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {writeOffDialog && (
        <WriteOffDialog
          open={writeOffDialog.open}
          onClose={() => setWriteOffDialog(null)}
          onConfirm={(data) =>
            handleWriteOff(writeOffDialog.productId, writeOffDialog.batchId, data)
          }
          batchInfo={{
            productName: writeOffDialog.productName,
            batchNumber: writeOffDialog.batchNumber,
            availableQuantity: writeOffDialog.availableQuantity,
          }}
        />
      )}
    </div>
  );
}
