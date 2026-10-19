import React from 'react';

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Root Application Shell
 * Enforces zero horizontal scroll leakage and responsive full-height layout.
 */
export const AppShell: React.FC<AppShellProps> = ({ className = '', children, ...props }) => {
  return (
    <div
      className={`min-h-screen w-full max-w-full overflow-x-clip bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  maxWidth?: 'standard' | 'wide' | 'reader' | 'full';
  children: React.ReactNode;
}

const maxWidthClasses = {
  standard: 'max-w-7xl',       // 1280px
  wide: 'max-w-[1440px]',      // 1440px
  reader: 'max-w-4xl',         // 896px (webtoon strip)
  full: 'max-w-full',
};

/**
 * Responsive Page Container
 * Enforces standardized responsive horizontal gutters and max content widths.
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  maxWidth = 'wide',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-5 ${maxWidthClasses[maxWidth]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
