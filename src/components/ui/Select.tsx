import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { InputSize } from './Input';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: InputSize;
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
  fullWidth?: boolean;
}

const selectSizes: Record<InputSize, string> = {
  sm: 'min-h-[32px] h-8 pl-2.5 pr-7 text-xs rounded-lg',
  md: 'min-h-[40px] h-10 pl-3.5 pr-8 text-sm rounded-xl',
  lg: 'min-h-[44px] h-11 pl-4 pr-9 text-base rounded-xl',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      size = 'md',
      label,
      helperText,
      error,
      options,
      fullWidth = true,
      className = '',
      id,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : 'inline-flex'}`}>
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-slate-300 select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={`w-full bg-slate-900 border text-slate-100 appearance-none transition-colors duration-150 cursor-pointer focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-950 disabled:cursor-not-allowed ${
              error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-slate-700'
            } ${selectSizes[size]} ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className="bg-slate-900 text-slate-100"
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 pointer-events-none" />
        </div>
        {error ? (
          <p className="text-xs text-rose-400 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
