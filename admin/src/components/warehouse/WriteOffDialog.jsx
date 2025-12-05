import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

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

  const isValid = parseInt(quantity) > 0 && parseInt(quantity) <= batchInfo.availableQuantity && comment.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-gray-900 mb-1">Списание товара</h2>
            <p className="text-sm text-gray-500">{batchInfo.productName} — Поставка {batchInfo.batchNumber}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {/* Content */}
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="p-6 space-y-5">
          {/* Available Info */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-amber-900 mb-1">Доступно к списанию</p>
              <p className="text-amber-900">{batchInfo.availableQuantity} шт</p>
            </div>
          </div>
          {/* Amount Input */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Количество для списания
            </label>
            <input
              type="number"
              min="1"
              max={batchInfo.availableQuantity}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError('');
              }}
              placeholder="Введите количество"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              required
            />
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
          {/* Reason Input */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Причина списания
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Укажите причину списания"
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              required
            />
          </div>
          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Списать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

