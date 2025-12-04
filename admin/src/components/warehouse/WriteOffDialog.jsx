import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';

interface WriteOffDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { quantity: number; comment: string }) => void;
  batchInfo: {
    productName: string;
    batchNumber: string;
    availableQuantity: number;
  };
}

export function WriteOffDialog({
  open,
  onClose,
  onConfirm,
  batchInfo,
}: WriteOffDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Списание товара</DialogTitle>
          <DialogDescription>
            {batchInfo.productName} • Поставка {batchInfo.batchNumber}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-blue-900">
                Доступно для списания:{' '}
                <span className="font-medium">{batchInfo.availableQuantity} шт</span>
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="quantity">Количество для списания *</Label>
            <Input
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
              className="mt-2"
            />
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
          <div>
            <Label htmlFor="comment">Причина списания</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Например: брак, испорчен, просрочен..."
              rows={3}
              className="mt-2"
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
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} className="bg-red-600 hover:bg-red-700">
            Списать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

