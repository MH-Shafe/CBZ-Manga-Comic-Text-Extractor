import React from 'react';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  dot?: boolean;
}

const badgeVariants: Record<BadgeVariant, string> = {
  primary: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/60',
  success: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60',
  warning: 'bg-amber-950/70 text-amber-300 border-amber-700/60',
  error: 'bg-rose-950/70 text-rose-300 border-rose-700/60',
  neutral: 'bg-slate-800 text-slate-300 border-slate-700',
};

const dotColors: Record<BadgeVariant, string> = {
  primary: 'bg-indigo-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-rose-400',
  neutral: 'bg-slate-400',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  icon,
  dot = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border tracking-wide select-none ${badgeVariants[variant]} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
