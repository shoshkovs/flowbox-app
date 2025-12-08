import * as React from "react"

export function Tabs({ defaultValue, value, onValueChange, children, className = "", ...props }) {
  // Если value передан (контролируемый режим), используем его, иначе используем внутреннее состояние
  const [internalTab, setInternalTab] = React.useState(defaultValue);
  const activeTab = value !== undefined ? value : internalTab;
  
  const handleTabChange = (newValue) => {
    if (value === undefined) {
      // Неконтролируемый режим - обновляем внутреннее состояние
      setInternalTab(newValue);
    }
    // Всегда вызываем onValueChange, если он передан
    onValueChange?.(newValue);
  };
  
  return (
    <div className={className} {...props}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { 
            activeTab, 
            onTabChange: handleTabChange 
          });
        }
        return child;
      })}
    </div>
  );
}

export function TabsList({ children, className = "", ...props }) {
  return (
    <div className={`inline-flex gap-1 rounded-lg bg-gray-100 p-1 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, activeTab, onTabChange, className = "", ...props }) {
  const isActive = activeTab === value;
  
  return (
    <button
      onClick={() => onTabChange?.(value)}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-white text-pink-600 shadow-sm"
          : "text-gray-600 hover:text-gray-900"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, activeTab, className = "", ...props }) {
  if (activeTab !== value) return null;
  
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

