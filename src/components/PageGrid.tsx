import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  CheckSquare,
  Square,
  RefreshCw,
  Maximize2,
  Minimize2,
  MoreVertical,
  Check,
  X,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { ComicPage } from '../types';

export interface PageGridProps {
  pages: ComicPage[];
  selectedPageIndex: number;
  onSelectPage: (index: number) => void;
  onToggleExclude: (index: number) => void;
  onExtractPage: (index: number) => void;
  onExtractMultiple: (indices: number[]) => void;
  onExcludeAllExtraPages: () => void;
  onRetryErrors?: () => void;
  isProcessing: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const PageGrid: React.FC<PageGridProps> = ({
  pages,
  selectedPageIndex,
  onSelectPage,
  onToggleExclude,
  onExtractPage,
  onExtractMultiple,
  onExcludeAllExtraPages,
  onRetryErrors,
  isProcessing,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'extracted' | 'pending' | 'errors' | 'ads'>('all');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showExcludeConfirm, setShowExcludeConfirm] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  const extractedCount = pages.filter((p) => p.status === 'completed').length;
  const pendingCount = pages.filter((p) => p.status === 'idle' || p.status === 'extracting').length;
  const errorPagesCount = pages.filter((p) => p.status === 'error').length;
  const extraPagesCount = pages.filter((p) => p.isExtraPage).length;

  const toggleSelectIndex = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const selectAll = () => {
    setSelectedIndices(pages.map((_, i) => i));
  };

  const clearSelection = () => {
    setSelectedIndices([]);
  };

  const filteredPages = pages.filter((p) => {
    if (filterMode === 'extracted') return p.status === 'completed';
    if (filterMode === 'pending') return p.status !== 'completed' && p.status !== 'error';
    if (filterMode === 'errors') return p.status === 'error';
    if (filterMode === 'ads') return p.isExtraPage;
    return true;
  });

  const handleExcludeAllAds = () => {
    onExcludeAllExtraPages();
    setShowExcludeConfirm(false);
    setShowMoreMenu(false);
  };

  const handleBatchExtract = () => {
    if (selectedIndices.length === 0) return;
    onExtractMultiple(selectedIndices);
    clearSelection();
  };

  return (
    <section
      aria-label="Chapter Page Gallery"
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col w-full max-w-full h-full h-[100dvh] overflow-hidden p-3 sm:p-5 overscroll-none'
          : 'bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-5 flex flex-col gap-3.5 shadow-lg w-full min-w-0'
      }
    >
      {/* ─────────────────────────────────────────────────────────────────────────────
          TOP TOOLBAR: Filter Tabs & Action Toolbar
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-800 shrink-0 w-full min-w-0">
        {/* Row 1: Filter Tabs [All] [Done] [Pending] [Errors] [Ads] */}
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div
            role="tablist"
            aria-label="Filter pages by status"
            className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5 max-w-full no-scrollbar"
          >
            {/* Filter: All */}
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-950/70 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <span>All</span>
              <span className="text-[11px] opacity-80">({pages.length})</span>
            </button>

            {/* Filter: Done */}
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'extracted'}
              onClick={() => setFilterMode('extracted')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                filterMode === 'extracted'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-950/70 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <span>Done</span>
              <span className="text-[11px] opacity-80">({extractedCount})</span>
            </button>

            {/* Filter: Pending */}
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'pending'}
              onClick={() => setFilterMode('pending')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                filterMode === 'pending'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-950/70 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <span>Pending</span>
              <span className="text-[11px] opacity-80">({pendingCount})</span>
            </button>

            {/* Filter: Errors (if any exist) */}
            {errorPagesCount > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={filterMode === 'errors'}
                onClick={() => setFilterMode('errors')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  filterMode === 'errors'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80'
                }`}
              >
                <span>Errors</span>
                <span className="text-[11px] font-bold">({errorPagesCount})</span>
              </button>
            )}

            {/* Filter: Ads (if any detected) */}
            {extraPagesCount > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={filterMode === 'ads'}
                onClick={() => setFilterMode('ads')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                  filterMode === 'ads'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-800/80'
                }`}
              >
                <span>Ads</span>
                <span className="text-[11px] font-bold">({extraPagesCount})</span>
              </button>
            )}
          </div>

          {/* Fullscreen presentation toggle */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Presentation'}
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Gallery Mode'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-indigo-400" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Row 2: Action Controls [Select All] [Clear] [Extract Selected] [More] */}
        <div className="flex items-center justify-between gap-2 flex-wrap w-full min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Select All / Clear Selection */}
            {selectedIndices.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-indigo-300 font-semibold bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800">
                  {selectedIndices.length} of {pages.length} selected
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer font-medium"
                >
                  Clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <CheckSquare className="w-3.5 h-3.5 text-slate-300" />
                <span>Select All</span>
              </button>
            )}

            {/* Extract Selected Action */}
            {selectedIndices.length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleBatchExtract}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>Extract Selected ({selectedIndices.length})</span>
              </button>
            )}
          </div>

          {/* More Action Dropdown */}
          <div className="relative shrink-0" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-expanded={showMoreMenu}
              aria-haspopup="true"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
            >
              <span>More</span>
              <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-750 rounded-xl shadow-2xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                {extraPagesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowExcludeConfirm(true);
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-amber-300 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Exclude All {extraPagesCount} Detected Ads</span>
                  </button>
                )}

                {errorPagesCount > 0 && onRetryErrors && (
                  <button
                    type="button"
                    onClick={() => {
                      onRetryErrors();
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-rose-300 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Retry All {errorPagesCount} Failed Pages</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    selectAll();
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Select All ({pages.length} pages)</span>
                </button>

                {selectedIndices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearSelection();
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-400 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <X className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Deselect All</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Inline Exclude All Ads Confirmation */}
        {showExcludeConfirm && (
          <div className="bg-amber-950/80 border border-amber-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-200 animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Exclude <strong>{extraPagesCount}</strong> detected credit/advertisement pages from export and TTS?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExcludeAllAds}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer"
              >
                Yes, Exclude All
              </button>
              <button
                type="button"
                onClick={() => setShowExcludeConfirm(false)}
                className="px-2.5 py-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          GRID CARDS CONTAINER: Responsive minmax layout
          - Mobile: 2 columns
          - Tablet: 3-4 columns
          - Desktop: 5-6 columns (8 in fullscreen)
         ───────────────────────────────────────────────────────────────────────────── */}
      <div
        className={`grid gap-3 sm:gap-4 overflow-y-auto pr-1 flex-1 min-h-[300px] w-full min-w-0 ${
          isFullscreen
            ? 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 max-h-[680px]'
        }`}
      >
        {filteredPages.map((page) => {
          const isSelected = selectedIndices.includes(page.index);
          const isCurrentInViewer = selectedPageIndex === page.index;

          return (
            <div
              key={page.id || `page-card-${page.index}`}
              onClick={() => onSelectPage(page.index)}
              className={`group relative rounded-xl sm:rounded-2xl border cursor-pointer overflow-hidden transition-all duration-150 flex flex-col bg-slate-950 select-none min-w-0 ${
                isSelected
                  ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-md bg-indigo-950/20'
                  : isCurrentInViewer
                  ? 'ring-2 ring-emerald-500/80 border-emerald-500 shadow-md bg-emerald-950/10'
                  : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              } ${page.isExcluded ? 'opacity-55 grayscale-[25%]' : 'opacity-100'}`}
            >
              {/* 1. Thumbnail Image Area (Consistent 3:4 Aspect Ratio) */}
              <div className="aspect-[3/4] w-full bg-slate-950 relative overflow-hidden flex items-center justify-center shrink-0">
                <img
                  src={page.imageUrl}
                  alt={page.fileName || `Page ${page.index + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top transition duration-200 group-hover:scale-[1.03]"
                  loading="lazy"
                />

                {/* Excluded Visual Overlay */}
                {page.isExcluded && (
                  <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[1px] flex items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-950/90 text-rose-300 border border-rose-800 px-2 py-0.5 rounded shadow">
                      Excluded
                    </span>
                  </div>
                )}

                {/* Current Page Indicator Badge */}
                {isCurrentInViewer && !page.isExcluded && (
                  <div className="absolute top-2 left-2">
                    <span className="bg-emerald-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                      Current
                    </span>
                  </div>
                )}

                {/* Multi-Select Checkbox in Top Right */}
                <button
                  type="button"
                  onClick={(e) => toggleSelectIndex(page.index, e)}
                  aria-label={`Select page ${page.index + 1}`}
                  className="absolute top-2 right-2 p-1 rounded-md bg-slate-950/85 hover:bg-slate-900 text-slate-300 transition-colors backdrop-blur-md border border-slate-700/60"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {/* Detected Ad / Credit Flag Banner */}
                {page.isExtraPage && (
                  <div className="absolute bottom-2 left-2 right-2">
                    <div
                      className="bg-amber-950/95 border border-amber-700/80 text-amber-200 text-[10px] font-medium px-1.5 py-0.5 rounded shadow flex items-center gap-1 truncate"
                      title={page.extraPageReason || 'Detected scanlator credit or ad'}
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate">Ad / Credit</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Structured Thumbnail Card Footer: Predictable Height */}
              <div className="p-2 sm:p-2.5 flex flex-col justify-between gap-1 bg-slate-900/90 border-t border-slate-800/80 h-[56px] shrink-0">
                {/* Line 1: Page Number & Exclude Toggle */}
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-100 truncate">
                    Page {page.index + 1}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExclude(page.index);
                    }}
                    aria-label={page.isExcluded ? `Include page ${page.index + 1}` : `Exclude page ${page.index + 1}`}
                    title={page.isExcluded ? 'Click to include in export and TTS' : 'Click to exclude from export and TTS'}
                    className={`p-1 rounded transition-colors ${
                      page.isExcluded
                        ? 'text-rose-400 hover:text-rose-300 bg-rose-950/60'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {page.isExcluded ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Line 2: OCR Status */}
                <div className="flex items-center justify-between text-[10px] gap-1">
                  {page.status === 'completed' ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium truncate">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>OCR Done</span>
                    </span>
                  ) : page.status === 'extracting' ? (
                    <span className="flex items-center gap-1 text-indigo-400 font-medium animate-pulse truncate">
                      <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                      <span>Extracting...</span>
                    </span>
                  ) : page.status === 'error' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExtractPage(page.index);
                      }}
                      className="flex items-center gap-1 text-rose-400 hover:text-rose-300 bg-rose-950/60 px-1.5 py-0.5 rounded font-semibold border border-rose-800/60 transition-colors truncate"
                      title={page.error ? `Error: ${page.error}. Click to retry.` : 'Click to retry OCR'}
                    >
                      <RefreshCw className="w-3 h-3 shrink-0" />
                      <span>Retry</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 font-normal truncate">Pending OCR</span>
                  )}

                  {page.blocks && page.blocks.length > 0 && (
                    <span className="text-slate-400 font-mono text-[10px] shrink-0">
                      {page.blocks.length} {page.blocks.length === 1 ? 'box' : 'boxes'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
