import React from 'react';

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'floating';
  children: React.ReactNode;
}

const toolbarVariants = {
  default: 'bg-slate-900 border border-slate-800 text-slate-100 shadow-md',
  surface: 'bg-slate-900/60 border border-slate-800/80 text-slate-200 backdrop-blur-md',
  floating: 'bg-slate-900/95 border border-slate-700 shadow-2xl backdrop-blur-md',
};

export const Toolbar: React.FC<ToolbarProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      role="toolbar"
      className={`p-2 sm:p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 sm:gap-3 min-w-0 ${toolbarVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const ToolbarGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`flex items-center gap-1 sm:gap-1.5 flex-wrap min-w-0 ${className}`} {...props}>
      {children}
    </div>
  );
};

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'col';
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
}

const gapClasses = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

export const Stack: React.FC<StackProps> = ({
  direction = 'col',
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`flex ${
        direction === 'row' ? 'flex-row flex-wrap' : 'flex-col'
      } ${gapClasses[gap]} ${alignClasses[align]} ${justifyClasses[justify]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  columns = 3,
  gap = 'md',
  className = '',
  children,
  ...props
}) => {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
    12: 'grid-cols-12',
  };

  return (
    <div className={`grid ${colClasses[columns]} ${gapClasses[gap]} ${className}`} {...props}>
      {children}
    </div>
  );
};
