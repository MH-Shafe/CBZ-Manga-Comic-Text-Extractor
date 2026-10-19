import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle' | 'elevated';
  noPadding?: boolean;
}

const cardVariants = {
  default: 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-md',
  subtle: 'bg-slate-950/60 border-slate-800/80 text-slate-200',
  elevated: 'bg-slate-900 border-slate-700 text-slate-100 shadow-xl',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', noPadding = false, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl border ${cardVariants[variant]} ${
          noPadding ? '' : 'p-4 sm:p-5'
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`flex flex-col gap-1.5 pb-3 border-b border-slate-800/80 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3 className={`font-semibold text-sm sm:text-base text-slate-100 tracking-tight ${className}`} {...props}>
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p className={`text-xs text-slate-400 leading-relaxed ${className}`} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`pt-3 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`flex items-center justify-between pt-3 border-t border-slate-800/80 mt-auto ${className}`} {...props}>
      {children}
    </div>
  );
};

export const Section: React.FC<React.HTMLAttributes<HTMLElement> & { title?: string; subtitle?: string }> = ({
  title,
  subtitle,
  className = '',
  children,
  ...props
}) => {
  return (
    <section className={`flex flex-col gap-3 ${className}`} {...props}>
      {(title || subtitle) && (
        <div className="flex flex-col gap-0.5">
          {title && <h2 className="text-base sm:text-lg font-semibold text-slate-100 tracking-tight">{title}</h2>}
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
};
