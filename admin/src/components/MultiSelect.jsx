import { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';

export function MultiSelect({ 
  values, 
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

  const selectedOptions = options.filter(opt => values.includes(opt.id));

  const handleToggle = (optionId) => {
    if (values.includes(optionId)) {
      onChange(values.filter(id => id !== optionId));
    } else {
      onChange([...values, optionId]);
    }
  };

  const handleCreate = async () => {
    if (newValue.trim()) {
      try {
        const newOption = await onCreate(newValue.trim());
        if (newOption) {
          onChange([...values, newOption.id]);
          setNewValue('');
          setShowNewInput(false);
        }
      } catch (error) {
        console.error('Ошибка создания:', error);
      }
    }
  };

  const handleRemove = (optionId) => {
    onChange(values.filter(id => id !== optionId));
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {/* Выбранные значения */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-800 rounded-full text-sm"
            >
              {option.name}
              <button
                type="button"
                onClick={() => handleRemove(option.id)}
                className="hover:text-pink-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

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
                setNewValue('');
                setShowNewInput(false);
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
            onClick={() => {
              setNewValue('');
              setShowNewInput(false);
            }}
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
            <span className="text-gray-500">{placeholder}</span>
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
                    onClick={() => handleToggle(option.id)}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                      values.includes(option.id) ? 'bg-pink-50' : ''
                    }`}
                  >
                    {values.includes(option.id) && (
                      <Check className="w-4 h-4 text-pink-600" />
                    )}
                    <span className={values.includes(option.id) ? 'text-pink-600' : ''}>
                      {option.name}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowNewInput(true);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 border-t border-gray-200 text-pink-600 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить новое значение
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

