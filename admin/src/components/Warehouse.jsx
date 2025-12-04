import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TrendingDown, TrendingUp, AlertTriangle, Plus, Edit, RefreshCw } from 'lucide-react';

const API_BASE = window.location.origin;

export function Warehouse({ authToken }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [writeOffModal, setWriteOffModal] = useState({ open: false, product: null });
  const [writeOffQty, setWriteOffQty] = useState('');
  const [writeOffComment, setWriteOffComment] = useState('');
  
  useEffect(() => {
    loadProducts();
  }, []);

  // Перезагружаем данные при возврате на страницу (если пользователь вернулся с формы добавления)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadProducts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/warehouse/stock`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка загрузки данных склада' }));
        console.error('Ошибка загрузки данных склада:', errorData);
        // Fallback на обычный warehouse API
        const fallbackResponse = await fetch(`${API_BASE}/api/admin/warehouse`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          setProducts(data);
        } else {
          setProducts([]);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };


  const filteredProducts = products.filter(product => {
    const matchesSearch = (product.product_name || product.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  
  const totalStockValue = products.reduce((sum, p) => {
    const stock = p.stock !== null && p.stock !== undefined ? p.stock : 0;
    const price = p.price_per_stem || p.price || 0;
    return sum + (stock * price);
  }, 0);

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Склад</h1>
          <p className="text-gray-600 mt-1">Учет наличия и движения товаров</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadProducts}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Обновить данные"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => navigate('/warehouse/new')}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить поставку
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </div>

        {/* Таблица товаров */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">Товар</th>
                <th className="text-left py-3 px-4">Поставлено</th>
                <th className="text-left py-3 px-4">Продано</th>
                <th className="text-left py-3 px-4">Списано</th>
                <th className="text-left py-3 px-4">Остаток</th>
                <th className="text-left py-3 px-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const productId = product.product_id || product.id;
                const productName = product.product_name || product.name || 'Неизвестный товар';
                const totalSupplied = product.total_supplied || 0;
                const totalSold = product.total_sold || 0;
                const totalWrittenOff = product.total_written_off || 0;
                const stock = product.stock !== null && product.stock !== undefined ? product.stock : 0;
                const status = stock <= 0 ? 'out_of_stock' : 'sufficient';

                return (
                  <tr key={productId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">#{productId}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {product.image_url && (
                          <img
                            src={product.image_url}
                            alt={productName}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        )}
                        <span>{productName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{totalSupplied}</td>
                    <td className="py-3 px-4 text-gray-600">{totalSold}</td>
                    <td className="py-3 px-4 text-gray-600">{totalWrittenOff}</td>
                    <td className="py-3 px-4">
                      <span className={`font-semibold ${stock <= 0 ? 'text-red-600' : ''}`}>
                        {stock}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setWriteOffModal({ open: true, product })}
                        className="px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm"
                        disabled={stock <= 0}
                      >
                        Списать
                      </button>
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

      {/* Модалка списания */}
      {writeOffModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Списать товар</h2>
              <button
                onClick={() => {
                  setWriteOffModal({ open: false, product: null });
                  setWriteOffQty('');
                  setWriteOffComment('');
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Товар: {writeOffModal.product?.product_name || writeOffModal.product?.name}</p>
              <p className="text-sm text-gray-600">Остаток: {writeOffModal.product?.stock || 0}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Количество для списания *</label>
              <input
                type="number"
                min="1"
                max={writeOffModal.product?.stock || 0}
                value={writeOffQty}
                onChange={(e) => setWriteOffQty(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="Введите количество"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Комментарий (необязательно)</label>
              <textarea
                value={writeOffComment}
                onChange={(e) => setWriteOffComment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows="3"
                placeholder="Причина списания"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const qty = parseInt(writeOffQty);
                  if (!qty || qty <= 0 || qty > (writeOffModal.product?.stock || 0)) {
                    toast.error('Некорректное количество');
                    return;
                  }

                  try {
                    const response = await fetch(`${API_BASE}/api/admin/warehouse/write-off`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`,
                      },
                      body: JSON.stringify({
                        product_id: writeOffModal.product?.product_id || writeOffModal.product?.id,
                        quantity: qty,
                        comment: writeOffComment || null,
                      }),
                    });

                    if (response.ok) {
                      toast.success('Товар успешно списан');
                      setWriteOffModal({ open: false, product: null });
                      setWriteOffQty('');
                      setWriteOffComment('');
                      loadProducts();
                    } else {
                      const error = await response.json();
                      toast.error(error.error || 'Ошибка списания товара');
                    }
                  } catch (error) {
                    console.error('Ошибка списания:', error);
                    toast.error('Ошибка списания товара');
                  }
                }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Списать
              </button>
              <button
                onClick={() => {
                  setWriteOffModal({ open: false, product: null });
                  setWriteOffQty('');
                  setWriteOffComment('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
