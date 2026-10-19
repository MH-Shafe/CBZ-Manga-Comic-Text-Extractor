/**
 * Centralized Design Tokens
 * Standardized across spacing, control heights, modal dimensions, radii, typography, and colors.
 */

export const spacing = {
  xs: '0.25rem',   // 4px  - dense icon gaps, inline badges
  sm: '0.5rem',    // 8px  - control inner padding, item gaps
  md: '1rem',      // 16px - card padding, standard layout gutters
  lg: '1.5rem',    // 24px - section spacing, large card padding
  xl: '2rem',      // 32px - major layout block gaps
  '2xl': '3rem',   // 48px - hero sections, page margins
} as const;

export const controlHeights = {
  compact: '2rem',      // 32px - dense toolbars, table action buttons
  standard: '2.5rem',   // 40px - standard form inputs, modal actions
  touch: '2.75rem',     // 44px - mobile touch target requirement (WCAG AA)
} as const;

export const dialogWidths = {
  small: '26.25rem',    // 420px - confirmations, simple API key entry
  medium: '40rem',      // 640px - settings, export configuration
  large: '56.25rem',    // 900px - multi-chapter management, metadata viewer
  extraLarge: '75rem',  // 1200px - wide catalog browsing, full search
} as const;

export const radii = {
  small: '0.5rem',      // 8px  - badges, compact buttons, inner items
  medium: '0.75rem',    // 12px - standard buttons, inputs, dropdowns
  large: '1rem',        // 16px - cards, drawers, surface containers
  full: '9999px',       // Pill-shaped elements (strictly for interactive selectors)
} as const;

export const layout = {
  maxContentWidth: '90rem', // 1440px max content width
  readerMaxWidth: '56rem',  // 896px max width for vertical webtoons
  inspectorWidth: '26rem',  // 416px fixed drawer width on desktop
} as const;

export const colors = {
  primary: {
    DEFAULT: '#6366f1', // Indigo 500
    hover: '#4f46e5',   // Indigo 600
    subtle: 'rgba(99, 102, 241, 0.15)',
    border: 'rgba(99, 102, 241, 0.35)',
    text: '#a5b4fc',    // Indigo 200
  },
  secondary: {
    DEFAULT: '#334155', // Slate 700
    hover: '#475569',   // Slate 600
    subtle: 'rgba(51, 65, 85, 0.5)',
    border: '#334155',
    text: '#cbd5e1',    // Slate 300
  },
  success: {
    DEFAULT: '#10b981', // Emerald 500
    hover: '#059669',   // Emerald 600
    subtle: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#6ee7b7',    // Emerald 300
  },
  warning: {
    DEFAULT: '#f59e0b', // Amber 500
    hover: '#d97706',   // Amber 600
    subtle: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.35)',
    text: '#fcd34d',    // Amber 300
  },
  error: {
    DEFAULT: '#f43f5e', // Rose 500
    hover: '#e11d48',   // Rose 600
    subtle: 'rgba(244, 63, 94, 0.15)',
    border: 'rgba(244, 63, 94, 0.35)',
    text: '#fda4af',    // Rose 300
  },
  surface: {
    app: '#020617',     // Slate 950 (app canvas)
    card: '#0f172a',    // Slate 900 (cards, headers, toolbars)
    elevated: '#1e293b',// Slate 800 (dropdowns, popovers, active tabs)
    border: '#334155',  // Slate 700 (standard border)
    borderSubtle: '#1e293b', // Slate 800 (subtle divider)
  },
  text: {
    primary: '#f8fafc',  // Slate 50
    secondary: '#94a3b8',// Slate 400
    muted: '#64748b',    // Slate 500
  },
} as const;

export const typography = {
  pageTitle: 'text-lg sm:text-xl font-bold tracking-tight text-slate-100',
  sectionTitle: 'text-base sm:text-lg font-semibold tracking-tight text-slate-100',
  cardTitle: 'text-sm sm:text-base font-semibold text-slate-200',
  body: 'text-xs sm:text-sm text-slate-300 leading-relaxed',
  secondary: 'text-xs text-slate-400',
  caption: 'text-[11px] text-slate-500 font-medium',
  code: 'font-mono text-xs tracking-tight',
} as const;
