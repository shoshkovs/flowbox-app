import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export function CreatableSelect({ 
  value, 
  onChange, 
  options, 
  onCreate, 
  placeholder, 
  label,
  required = false,
  loading = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const selectedOption = options.find(opt => opt.id === value);

  const handleSelect = (optionId) => {
    if (optionId === 'new') {
      setShowNewInput(true);
      setIsOpen(false);
    } else {
      onChange(optionId);
      setIsOpen(false);
    }
  };

  const handleCreate = async () => {
    if (newValue.trim()) {
      try {
        const newOption = await onCreate(newValue.trim());
        if (newOption) {
          onChange(newOption.id);
          setNewValue('');
          setShowNewInput(false);
        }
      } catch (error) {
        console.error('Ошибка создания:', error);
      }
    }
  };

  const handleCancel = () => {
    setNewValue('');
    setShowNewInput(false);
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {showNewInput ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={`Введите новое значение для ${label.toLowerCase()}`}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCreate();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
          />
          <button
            type="button"
            onClick={handleCreate}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
            disabled={!newValue.trim() || loading}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-left bg-white hover:border-pink-500 focus:ring-2 focus:ring-pink-500 focus:border-transparent flex items-center justify-between"
          >
            <span className={selectedOption ? 'text-gray-900' : 'text-gray-500'}>
              {selectedOption ? selectedOption.name : placeholder}
            </span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isOpen && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option.id)}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-50 ${
                      value === option.id ? 'bg-pink-50 text-pink-600' : ''
                    }`}
                  >
                    {option.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleSelect('new')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 border-t border-gray-200 text-pink-600 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Новое значение
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

