import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
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

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-[32px] h-8 px-2.5 py-1 text-xs gap-1.5 rounded-lg',
  md: 'min-h-[40px] h-10 px-3.5 py-2 text-sm gap-2 rounded-xl',
  lg: 'min-h-[44px] h-11 px-5 py-2.5 text-sm sm:text-base gap-2.5 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center font-semibold tracking-tight transition-all duration-150 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none ${
          variantStyles[variant]
        } ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>
        )}
        {children && <span className="truncate">{children}</span>}
        {!isLoading && rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
