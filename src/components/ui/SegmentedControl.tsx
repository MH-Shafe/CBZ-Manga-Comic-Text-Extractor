import React from 'react';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  fullWidth = false,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs',
    md: 'p-1 text-xs sm:text-sm',
  };

  const itemSizeClasses = {
    sm: 'py-1 px-2.5 min-h-[28px]',
    md: 'py-1.5 px-3 min-h-[36px]',
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center bg-slate-950/80 rounded-xl border border-slate-800 select-none ${
        sizeClasses[size]
      } ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed ${
              itemSizeClasses[size]
            } ${fullWidth ? 'flex-1' : ''} ${
              isSelected
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
