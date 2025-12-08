import * as React from "react"

export function Select({ defaultValue, value, onValueChange, children, ...props }) {
  const [selectedValue, setSelectedValue] = React.useState(defaultValue || value);
  
  const handleChange = (e) => {
    const newValue = e.target.value;
    setSelectedValue(newValue);
    onValueChange?.(newValue);
  };
  
  return (
    <div {...props}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { 
            value: selectedValue, 
            onChange: handleChange,
            onValueChange 
          });
        }
        return child;
      })}
    </div>
  );
}

export function SelectTrigger({ className = "", children, ...props }) {
  return (
    <select
      className={`flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23333\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-10 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function SelectValue({ placeholder, ...props }) {
  return <option value="">{placeholder}</option>;
}

export function SelectContent({ children, ...props }) {
  return <>{children}</>;
}

export function SelectItem({ value, children, ...props }) {
  return <option value={value} {...props}>{children}</option>;
}

