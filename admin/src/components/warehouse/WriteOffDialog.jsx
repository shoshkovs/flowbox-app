import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function WriteOffDialog({
  open,
  onClose,
  onConfirm,
  batchInfo,
}) {
  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const qty = parseInt(quantity);
    if (!quantity || qty <= 0) {
      setError('Укажите количество для списания');
      return;
    }
    if (qty > batchInfo.availableQuantity) {
      setError(
        `Недостаточно товара. Доступно: ${batchInfo.availableQuantity} шт`
      );
      return;
    }
    onConfirm({ quantity: qty, comment });
    setQuantity('');
    setComment('');
    setError('');
  };

  const handleClose = () => {
    setQuantity('');
    setComment('');
    setError('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
        <div className="mb-4">
          <h2 className="text-xl font-bold pr-8">Списание товара</h2>
          <p className="text-sm text-gray-600 mt-1">
            {batchInfo.productName} • Поставка {batchInfo.batchNumber}
          </p>
        </div>
        <div className="space-y-4">
          <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-pink-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-pink-900">
                Доступно для списания:{' '}
                <span className="font-medium">{batchInfo.availableQuantity} шт</span>
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium mb-2">
              Количество для списания *
            </label>
            <input
              id="quantity"
              type="number"
              min="1"
              max={batchInfo.availableQuantity}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError('');
              }}
              placeholder="Введите количество"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent mt-2"
            />
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
          <div>
            <label htmlFor="comment" className="block text-sm font-medium mb-2">
              Причина списания
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Например: брак, испорчен, просрочен..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent mt-2"
            />
          </div>
          {quantity && parseInt(quantity) > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm text-orange-900">
                После списания останется:{' '}
                <span className="font-medium">
                  {batchInfo.availableQuantity - parseInt(quantity)} шт
                </span>
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Списать
          </button>
        </div>
      </div>
    </div>
  );
}

