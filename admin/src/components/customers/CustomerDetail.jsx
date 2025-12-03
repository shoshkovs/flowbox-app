import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = window.location.origin;

export function CustomerDetail({ authToken, customerId }) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    telegram: '',
    address: '',
    comments: '',
    tags: [],
  });

  useEffect(() => {
    if (customerId) {
      loadCustomer();
    }
  }, [customerId]);

  const loadCustomer = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/customers/${customerId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const foundCustomer = await response.json();
        setCustomer(foundCustomer);
        setCustomerForm({
          name: foundCustomer.name || '',
          phone: foundCustomer.phone || '',
          email: foundCustomer.email || '',
          telegram: foundCustomer.telegram_id ? `@${foundCustomer.telegram_id}` : '',
          address: '',
          comments: '',
          tags: [],
        });
      } else {
        toast.error('Ошибка загрузки данных клиента');
      }
    } catch (error) {
      console.error('Ошибка загрузки клиента:', error);
      toast.error('Ошибка загрузки данных клиента');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async () => {
    if (!customerForm.name || !customerForm.phone) {
      toast.error('Заполните обязательные поля');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/customers/${customerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: customerForm.name,
          phone: customerForm.phone,
          email: customerForm.email || null,
          telegram: customerForm.telegram || null,
        }),
      });

      if (response.ok) {
        toast.success('Данные клиента сохранены');
        navigate('/customers');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка сохранения данных');
      }
    } catch (error) {
      console.error('Ошибка сохранения клиента:', error);
      toast.error('Ошибка сохранения данных');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Загрузка...</div>;
  }

  if (!customer) {
    return <div className="p-6">Клиент не найден</div>;
  }

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой назад */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/customers')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">Редактировать клиента</h1>
          <p className="text-gray-600 mt-1">ID: {customer.id}</p>
        </div>
      </div>

      {/* Форма редактирования */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Информация о клиенте</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Имя <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="Имя клиента"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Телефон <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="+7 (999) 123-45-67"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="email@example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Telegram</label>
            <input
              type="text"
              value={customerForm.telegram}
              onChange={(e) => setCustomerForm({ ...customerForm, telegram: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="@username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Адрес</label>
            <textarea
              value={customerForm.address}
              onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              rows="3"
              placeholder="Адрес доставки"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Комментарии</label>
            <textarea
              value={customerForm.comments}
              onChange={(e) => setCustomerForm({ ...customerForm, comments: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              rows="4"
              placeholder="Дополнительная информация о клиенте..."
            />
          </div>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-end gap-4">
        <button
          onClick={() => navigate('/customers')}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={saving}
        >
          Отменить
        </button>
        <button
          onClick={handleSaveCustomer}
          disabled={saving}
          className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

