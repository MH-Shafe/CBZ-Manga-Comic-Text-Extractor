import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  StopCircle,
  FileCheck,
  CheckSquare,
  Square,
  Filter,
  Gauge,
  BookOpen,
  Download,
} from 'lucide-react';
import { ComicChapter, DailyRequestsInfo, ExtractionSettings } from '../types';

export interface MultiChapterExtractOptions {
  skipCompletedPages: boolean;
  autoSynthesizeSummaries: boolean;
}

export interface MultiChapterProcessingState {
  chapterIndex: number;
  chapterTitle: string;
  chapterCurrent: number;
  chapterTotal: number;
  pageCurrent: number;
  pageTotal: number;
  overallPageCurrent: number;
  overallPageTotal: number;
  statusText?: string;
}

interface MultiChapterExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: ComicChapter[];
  activeChapterIndex: number;
  onSelectChapter?: (index: number) => void;
  onStartExtract: (
    selectedChapterIndices: number[],
    options: MultiChapterExtractOptions
  ) => void;
  isProcessing: boolean;
  onStopExtract: () => void;
  processingState?: MultiChapterProcessingState | null;
  dailyRequests?: DailyRequestsInfo;
  settings: ExtractionSettings;
  onOpenExport?: () => void;
}

export const MultiChapterExtractModal: React.FC<MultiChapterExtractModalProps> = ({
  isOpen,
  onClose,
  chapters,
  activeChapterIndex,
  onSelectChapter,
  onStartExtract,
  isProcessing,
  onStopExtract,
  processingState,
  dailyRequests,
  settings,
  onOpenExport,
}) => {
  const initialSelection = useMemo(() => {
    const uncompleted = chapters
      .map((ch, idx) => ({ idx, done: ch.pages.every((p) => p.status === 'completed' || p.isExcluded) }))
      .filter((ch) => !ch.done)
      .map((ch) => ch.idx);

    if (uncompleted.length > 0) return new Set(uncompleted);
    return new Set(chapters.map((_, idx) => idx));
  }, [chapters]);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(initialSelection);
  const [skipCompletedPages, setSkipCompletedPages] = useState<boolean>(true);
  const [autoSynthesizeSummaries, setAutoSynthesizeSummaries] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && !isProcessing) {
      setSelectedIndices(initialSelection);
    }
  }, [isOpen, initialSelection, isProcessing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const { totalPagesToExtract, totalSelectedPages, completedInSelected } = useMemo(() => {
    let toExtract = 0;
    let total = 0;
    let completed = 0;

    chapters.forEach((ch, idx) => {
      if (selectedIndices.has(idx)) {
        ch.pages.forEach((p) => {
          if (!p.isExcluded) {
            total += 1;
            if (p.status === 'completed') {
              completed += 1;
              if (!skipCompletedPages) {
                toExtract += 1;
              }
            } else {
              toExtract += 1;
            }
          }
        });
      }
    });

    return { totalPagesToExtract: toExtract, totalSelectedPages: total, completedInSelected: completed };
  }, [chapters, selectedIndices, skipCompletedPages]);

  const extractedChaptersCount = useMemo(() => {
    return chapters.filter((ch) =>
      ch.pages.some(
        (p) =>
          !p.isExcluded &&
          !p.isExtraPage &&
          ((p.fullText && p.fullText.trim().length > 0) ||
            (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim())) ||
            (p.pageSummary && p.pageSummary.trim().length > 0) ||
            p.status === 'completed')
      )
    ).length;
  }, [chapters]);

  if (!isOpen) return null;

  const toggleChapter = (index: number) => {
    if (isProcessing) return;
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const handleSelectAll = () => {
    if (isProcessing) return;
    setSelectedIndices(new Set(chapters.map((_, idx) => idx)));
  };

  const handleSelectUnextracted = () => {
    if (isProcessing) return;
    const uncompleted = chapters
      .map((ch, idx) => ({
        idx,
        hasPending: ch.pages.some((p) => !p.isExcluded && p.status !== 'completed'),
      }))
      .filter((ch) => ch.hasPending)
      .map((ch) => ch.idx);
    setSelectedIndices(new Set(uncompleted));
  };

  const handleDeselectAll = () => {
    if (isProcessing) return;
    setSelectedIndices(new Set());
  };

  const handleExtractClick = () => {
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    if (indices.length === 0 || totalPagesToExtract === 0) return;
    onStartExtract(indices, {
      skipCompletedPages,
      autoSynthesizeSummaries,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="multi-chapter-modal-title"
    >
      {/* Standard Size: LG ≈ 900px */}
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[900px] max-h-[92dvh] shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="multi-chapter-modal-title" className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  Multi-Chapter Batch Extraction
                </h2>
                <span className="text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                  {chapters.length} Chapters
                </span>
                {extractedChaptersCount > 0 && (
                  <span className="text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded-full font-medium">
                    {extractedChaptersCount} Extracted
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                Batch OCR dialogue across chapters with Gemini Vision AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenExport && (
              <button
                type="button"
                onClick={onOpenExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm cursor-pointer"
                title="Export chapters (EPUB, Markdown, Text, JSON)"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              title="Close modal"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Active Processing Banner */}
        {isProcessing && processingState && (
          <div className="p-3.5 bg-indigo-950/80 border-b border-indigo-800/80 space-y-2 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-200">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping shrink-0" />
                <span className="font-semibold shrink-0">
                  Chapter {processingState.chapterCurrent}/{processingState.chapterTotal}:
                </span>
                <span className="text-indigo-300 font-bold truncate">
                  {processingState.chapterTitle}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-indigo-900/80 px-2 py-0.5 rounded text-indigo-200">
                  Page {processingState.pageCurrent}/{processingState.pageTotal}
                </span>
                <button
                  type="button"
                  onClick={onStopExtract}
                  className="text-rose-300 hover:text-rose-100 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800 hover:bg-rose-900 transition cursor-pointer"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </div>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-indigo-900">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    processingState.overallPageTotal > 0
                      ? (processingState.overallPageCurrent / processingState.overallPageTotal) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 2-Column Responsive Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0">
          {/* Left Column: Selection Controls & Options */}
          <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/50 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              {/* Filter / Quick Selection */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Filter className="w-3.5 h-3.5 text-indigo-400" />
                    Select Chapters
                  </span>
                  <span className="font-mono text-indigo-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/60">
                    {selectedIndices.size} / {chapters.length}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={isProcessing}
                    className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition border border-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    All ({chapters.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectUnextracted}
                    disabled={isProcessing}
                    className="px-2 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-xs font-medium transition border border-indigo-800 disabled:opacity-40 cursor-pointer"
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={isProcessing}
                    className="px-2 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 text-xs font-medium transition border border-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Extraction Checkbox Options */}
              <div className="space-y-2 text-xs">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={skipCompletedPages}
                    disabled={isProcessing}
                    onChange={(e) => setSkipCompletedPages(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-200 block">
                      Skip completed pages
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Only extract unextracted pages to conserve quota.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={autoSynthesizeSummaries}
                    disabled={isProcessing}
                    onChange={(e) => setAutoSynthesizeSummaries(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-200 block">
                      Auto-generate chapter recap
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Synthesizes a story recap after each chapter finishes.
                    </span>
                  </div>
                </label>
              </div>

              {/* Pages to extract stats */}
              <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
                    Pages to Extract:
                  </span>
                  <span className="font-bold text-indigo-300 font-mono text-sm">
                    {totalPagesToExtract}
                  </span>
                </div>
                {dailyRequests && (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                    <span>Remaining Quota:</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {dailyRequests.remaining.toLocaleString()} RPD
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Left Column Action Buttons */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              {isProcessing ? (
                <button
                  type="button"
                  onClick={onStopExtract}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Stop Extraction</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleExtractClick}
                  disabled={selectedIndices.size === 0 || totalPagesToExtract === 0}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>
                    {selectedIndices.size === 0
                      ? 'Select Chapters'
                      : totalPagesToExtract === 0
                      ? 'All Pages Complete'
                      : `Extract ${selectedIndices.size} Chapters (${totalPagesToExtract} Pgs)`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 transition cursor-pointer"
              >
                {isProcessing ? 'Run in Background & Close' : 'Close'}
              </button>
            </div>
          </div>

          {/* Right Column: Chapter List */}
          <div className="md:col-span-7 flex flex-col overflow-hidden bg-slate-900/40">
            <div className="p-3 sm:p-3.5 border-b border-slate-800/90 bg-slate-900/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span>Chapters ({chapters.length})</span>
              </div>
              <span className="text-[11px] text-slate-400">Click row to toggle</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 max-h-[520px]">
              {chapters.map((chapter, idx) => {
                const isSelected = selectedIndices.has(idx);
                const totalPages = chapter.pages.filter((p) => !p.isExcluded).length;
                const completedPages = chapter.pages.filter(
                  (p) => !p.isExcluded && p.status === 'completed'
                ).length;
                const isFullyExtracted = totalPages > 0 && completedPages === totalPages;
                const isCurrentlyProcessing =
                  isProcessing && processingState?.chapterIndex === idx;

                return (
                  <div
                    key={chapter.id || idx}
                    onClick={() => toggleChapter(idx)}
                    className={`p-2.5 sm:p-3 rounded-xl border transition cursor-pointer select-none flex items-center justify-between gap-3 ${
                      isCurrentlyProcessing
                        ? 'bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500'
                        : isSelected
                        ? 'bg-slate-850/90 border-indigo-500/60 shadow-sm'
                        : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                    } ${isProcessing ? 'cursor-not-allowed opacity-90' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center transition shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-600 bg-slate-900 text-transparent'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-3 h-3" />
                        ) : (
                          <Square className="w-3 h-3" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 border border-slate-800 font-mono">
                            CH {idx + 1}
                          </span>
                          <span
                            className={`text-xs font-semibold truncate max-w-[180px] sm:max-w-xs ${
                              isSelected ? 'text-white' : 'text-slate-300'
                            }`}
                            title={chapter.title}
                          >
                            {chapter.title}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">
                          {totalPages} pages • {completedPages} done
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isCurrentlyProcessing ? (
                        <span className="text-[11px] bg-indigo-900 text-indigo-200 border border-indigo-700 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                          Extracting...
                        </span>
                      ) : isFullyExtracted ? (
                        <span className="text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Done</span>
                        </span>
                      ) : (
                        <span className="text-[11px] bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-full">
                          {completedPages}/{totalPages}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
