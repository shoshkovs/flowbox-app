import * as React from "react"

export const Textarea = React.forwardRef(({ className = "", rows = 3, ...props }, ref) => {
  return (
    <textarea
      className={`flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent disabled:opacity-50 ${className}`}
      ref={ref}
      rows={rows}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

