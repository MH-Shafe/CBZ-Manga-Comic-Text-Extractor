import React, { forwardRef } from 'react';
import { ButtonVariant, ButtonSize } from './Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  'aria-label': string; // Required for accessibility
  title?: string;
  icon: React.ReactNode;
}

const iconButtonSizes: Record<ButtonSize, string> = {
  sm: 'w-8 h-8 min-h-[32px] min-w-[32px] p-1.5 rounded-lg text-xs',
  md: 'w-10 h-10 min-h-[40px] min-w-[40px] p-2 rounded-xl text-sm',
  lg: 'w-11 h-11 min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-base',
};

const iconButtonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-sm border border-indigo-500/50',
  secondary:
    'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-700',
  outline:
    'bg-transparent hover:bg-slate-800 active:bg-slate-900 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600',
  ghost:
    'bg-transparent hover:bg-slate-800/80 active:bg-slate-800 text-slate-400 hover:text-slate-100 border border-transparent',
  destructive:
    'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm border border-rose-500/50',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      'aria-label': ariaLabel,
      title,
      icon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        aria-label={ariaLabel}
        title={title || ariaLabel}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none ${
          iconButtonVariants[variant]
        } ${iconButtonSizes[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
