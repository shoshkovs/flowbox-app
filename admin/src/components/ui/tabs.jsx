import * as React from "react"

const TabsContext = React.createContext();

export function Tabs({ defaultValue, value, onValueChange, children, className = "", ...props }) {
  // Если value передан (контролируемый режим), используем его, иначе используем внутреннее состояние
  const [internalTab, setInternalTab] = React.useState(defaultValue || 'general');
  const activeTab = value !== undefined ? value : internalTab;
  
  const handleTabChange = (newValue) => {
    if (value === undefined) {
      // Неконтролируемый режим - обновляем внутреннее состояние
      setInternalTab(newValue);
    }
    // Всегда вызываем onValueChange, если он передан
    if (onValueChange) {
      onValueChange(newValue);
    }
  };
  
  return (
    <TabsContext.Provider value={{ activeTab, onTabChange: handleTabChange }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = "", ...props }) {
  return (
    <div className={`inline-flex gap-1 rounded-lg bg-gray-100 p-1 ${className}`} {...props}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child);
        }
        return child;
      })}
    </div>
  );
}

export function TabsTrigger({ value, children, className = "", ...props }) {
  const { activeTab, onTabChange } = React.useContext(TabsContext);
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

export function TabsContent({ value, children, className = "", ...props }) {
  const { activeTab } = React.useContext(TabsContext);
  
  if (activeTab !== value) return null;
  
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

