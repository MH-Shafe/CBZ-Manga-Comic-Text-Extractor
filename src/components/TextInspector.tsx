import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  CornerDownRight,
} from 'lucide-react';
import { ComicPage, TextBlock, BlockType } from '../types';
import { cleanSfxIcons, formatSfxBlock } from '../utils/textExporter';

export interface TextInspectorProps {
  page: ComicPage;
  onUpdateBlocks: (pageIndex: number, blocks: TextBlock[]) => void;
  onUpdateFullText: (pageIndex: number, text: string) => void;
  onToggleExclude: (pageIndex: number) => void;
  onExtractPage: (pageIndex: number) => void;
  isProcessing: boolean;
  allPages?: ComicPage[];
  chapterSummary?: string;
  onUpdateChapterSummary?: (summary: string) => void;
  isSynthesizingChapterSummary?: boolean;
  onSynthesizeChapterSummary?: () => Promise<string>;
  onSelectPage?: (pageIndex: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onClose?: () => void;
  activeBlockIndex?: number;
  onSelectBlock?: (blockId: string, idx: number) => void;
}

export const TextInspector: React.FC<TextInspectorProps> = ({
  page,
  onUpdateBlocks,
  onUpdateFullText,
  onToggleExclude,
  onExtractPage,
  isProcessing,
  allPages = [],
  chapterSummary = '',
  onUpdateChapterSummary,
  isSynthesizingChapterSummary = false,
  onSynthesizeChapterSummary,
  onSelectPage,
  isFullscreen = false,
  onToggleFullscreen,
  onClose,
  activeBlockIndex,
  onSelectBlock,
}) => {
  const [activeTab, setActiveTab] = useState<'flow' | 'text' | 'story'>('flow');
  const [copied, setCopied] = useState(false);
  const [isEditingChapterSummary, setIsEditingChapterSummary] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const addMenuRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  const blocks = page.blocks || [];
  const hasValidSummary = Boolean(
    chapterSummary &&
      chapterSummary.trim() &&
      !chapterSummary.includes('No extracted story pages')
  );

  // Close add dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddMenu]);

  // Keyboard navigation across tabs
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tab: 'flow' | 'text' | 'story') => {
    const tabs: ('flow' | 'text' | 'story')[] = ['flow', 'text', 'story'];
    const currentIndex = tabs.indexOf(tab);

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextTab = tabs[(currentIndex + 1) % tabs.length];
      setActiveTab(nextTab);
      const nextButton = tabListRef.current?.querySelector(`[data-tab="${nextTab}"]`) as HTMLButtonElement;
      nextButton?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
      setActiveTab(prevTab);
      const prevButton = tabListRef.current?.querySelector(`[data-tab="${prevTab}"]`) as HTMLButtonElement;
      prevButton?.focus();
    }
  };

  const handleCopy = () => {
    let textToCopy = '';
    if (activeTab === 'story') {
      textToCopy = hasValidSummary ? chapterSummary : '';
    } else if (activeTab === 'text') {
      textToCopy = page.fullText || '';
    } else {
      textToCopy =
        page.fullText ||
        blocks
          .map((b) => {
            if (b.type === 'sfx') {
              return formatSfxBlock(b.text, false);
            }
            return b.speaker ? `${b.speaker}: ${cleanSfxIcons(b.text)}` : cleanSfxIcons(b.text);
          })
          .join('\n\n');
    }

    if (textToCopy) {
      const cleaned = cleanSfxIcons(textToCopy);
      navigator.clipboard.writeText(cleaned);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBlockChange = (blockId: string, updates: Partial<TextBlock>) => {
    const sanitizedUpdates = { ...updates };
    if (typeof sanitizedUpdates.text === 'string') {
      sanitizedUpdates.text = cleanSfxIcons(sanitizedUpdates.text);
    }
    const newBlocks = blocks.map((b) => (b.id === blockId ? { ...b, ...sanitizedUpdates } : b));
    onUpdateBlocks(page.index, newBlocks);
  };

  const handleDeleteBlock = (blockId: string) => {
    const newBlocks = blocks
      .filter((b) => b.id !== blockId)
      .map((b, idx) => ({ ...b, readingOrder: idx + 1 }));
    onUpdateBlocks(page.index, newBlocks);
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newBlocks = [...blocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;

    const updated = newBlocks.map((b, idx) => ({ ...b, readingOrder: idx + 1 }));
    onUpdateBlocks(page.index, updated);
  };

  const handleAddBlock = (position: 'top' | 'bottom' = 'bottom') => {
    const newBlock: TextBlock = {
      id: `block-${Date.now()}`,
      readingOrder: position === 'top' ? 1 : blocks.length + 1,
      type: 'dialogue',
      speaker: '',
      text: position === 'top' ? 'Top speech line' : 'New dialogue line',
      yPercent: position === 'top' ? 5 : 95,
      box_2d: position === 'top' ? [10, 100, 100, 900] : [900, 100, 980, 900],
    };
    const combined = position === 'top' ? [newBlock, ...blocks] : [...blocks, newBlock];
    const reindexed = combined.map((b, idx) => ({ ...b, readingOrder: idx + 1 }));
    onUpdateBlocks(page.index, reindexed);
    setShowAddMenu(false);
  };

  const getBlockTypeBadgeClasses = (type: BlockType) => {
    switch (type) {
      case 'dialogue':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'narration':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'thought':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'sfx':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <aside
      aria-label="Text Inspector"
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col w-full h-full h-[100dvh] overflow-hidden overscroll-none'
          : 'bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-full shadow-lg overflow-hidden'
      }
    >
      {/* HEADER: [Inspector] [Page X] [Block count] [Copy] [Close] */}
      <header className="px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center shrink-0">
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
            Inspector
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700 font-medium text-[11px] shrink-0">
            Page {page.index + 1}
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline shrink-0">
            ({blocks.length} {blocks.length === 1 ? 'block' : 'blocks'})
          </span>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy text to clipboard"
            title="Copy extracted text to clipboard"
            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Fullscreen Mode (if enabled) */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Inspector'}
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Inspector'}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Inspector"
              title="Close Inspector"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* TABS: [Reading Flow] [Text] [Story] */}
      <div className="px-3 pt-2 pb-1.5 bg-slate-950/60 border-b border-slate-800 shrink-0">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Inspector navigation tabs"
          className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs"
        >
          <button
            type="button"
            role="tab"
            id="inspector-tab-flow"
            data-tab="flow"
            aria-selected={activeTab === 'flow'}
            aria-controls="inspector-panel-flow"
            tabIndex={activeTab === 'flow' ? 0 : -1}
            onClick={() => setActiveTab('flow')}
            onKeyDown={(e) => handleTabKeyDown(e, 'flow')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              activeTab === 'flow'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Reading Flow</span>
          </button>

          <button
            type="button"
            role="tab"
            id="inspector-tab-text"
            data-tab="text"
            aria-selected={activeTab === 'text'}
            aria-controls="inspector-panel-text"
            tabIndex={activeTab === 'text' ? 0 : -1}
            onClick={() => setActiveTab('text')}
            onKeyDown={(e) => handleTabKeyDown(e, 'text')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              activeTab === 'text'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Text</span>
          </button>

          <button
            type="button"
            role="tab"
            id="inspector-tab-story"
            data-tab="story"
            aria-selected={activeTab === 'story'}
            aria-controls="inspector-panel-story"
            tabIndex={activeTab === 'story' ? 0 : -1}
            onClick={() => setActiveTab('story')}
            onKeyDown={(e) => handleTabKeyDown(e, 'story')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              activeTab === 'story'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            <span className="truncate">Story</span>
          </button>
        </div>
      </div>

      {/* Flagged non-story page warning if any */}
      {page.isExtraPage && (
        <div className="bg-amber-950/60 border-b border-amber-800/80 px-3 py-2 flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 text-amber-200 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Non-Story Page: {page.extraPageReason || 'Flagged advertisement or credits'}
            </span>
          </div>
          {page.isExcluded && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-semibold shrink-0">
              Excluded
            </span>
          )}
        </div>
      )}

      {/* Page Beat note if available */}
      {page.pageSummary && (
        <div className="bg-indigo-950/25 border-b border-indigo-900/40 px-3 py-1.5 text-xs text-indigo-300 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate italic">Beat: {page.pageSummary}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('story')}
            className="text-[11px] text-indigo-400 hover:text-indigo-200 underline font-medium shrink-0 cursor-pointer"
          >
            Story Arc &rarr;
          </button>
        </div>
      )}

      {/* MAIN CONTENT PANELS */}
      <div className="overflow-y-auto flex-1 min-h-0 p-3 space-y-3">
        {/* TAB 1: READING FLOW */}
        {activeTab === 'flow' && (
          <section
            id="inspector-panel-flow"
            role="tabpanel"
            aria-labelledby="inspector-tab-flow"
            className="space-y-2.5"
          >
            {page.status === 'extracting' ? (
              <div className="py-14 flex flex-col items-center justify-center text-center px-4">
                <div className="w-9 h-9 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="font-semibold text-slate-200 text-xs sm:text-sm">
                  Extracting Dialogue with Vision AI...
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                  Transcribing speech bubbles, narration blocks, and preserving reading order.
                </p>
              </div>
            ) : page.status === 'error' ? (
              <div className="py-10 text-center text-slate-400 flex flex-col items-center px-4">
                <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400 flex items-center justify-center mb-2.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <p className="font-semibold text-rose-300 text-xs sm:text-sm">
                  Extraction Issue
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mt-1 mb-3.5 leading-relaxed">
                  {page.error || 'The model was busy or timed out. Click below to retry.'}
                </p>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => onExtractPage(page.index)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Page OCR</span>
                </button>
              </div>
            ) : page.status !== 'completed' && blocks.length === 0 ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center px-4">
                <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-400 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                </div>
                <p className="font-semibold text-slate-200 text-xs sm:text-sm">
                  No text extracted yet
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mt-1 mb-4 leading-relaxed">
                  Run OCR on this page to detect speech bubbles, narration, and character names.
                </p>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => onExtractPage(page.index)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Extract Page Text</span>
                </button>
              </div>
            ) : (
              <>
                {/* Speech blocks list */}
                <div className="space-y-2">
                  {blocks.map((block, idx) => {
                    const isActive = activeBlockIndex === idx;
                    return (
                      <div
                        key={block.id || `block-${idx}`}
                        onClick={() => onSelectBlock?.(block.id, idx)}
                        className={`rounded-xl border p-2.5 transition-all duration-150 flex flex-col gap-2 group ${
                          isActive
                            ? 'bg-indigo-950/40 border-indigo-500/60 ring-2 ring-indigo-500/30'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* Block metadata header: Order, Type, Speaker, Controls */}
                        <div className="flex items-center justify-between gap-1.5 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {/* Reading order pill */}
                            <span
                              className={`text-[10px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 ${
                                isActive
                                  ? 'bg-indigo-500 text-white'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                              title={`Reading order #${block.readingOrder || idx + 1}`}
                            >
                              {block.readingOrder || idx + 1}
                            </span>

                            {/* Block Type selector */}
                            <select
                              value={block.type || 'dialogue'}
                              onChange={(e) =>
                                handleBlockChange(block.id, { type: e.target.value as BlockType })
                              }
                              aria-label={`Block ${idx + 1} type`}
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${getBlockTypeBadgeClasses(
                                block.type
                              )} bg-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer`}
                            >
                              <option value="dialogue" className="bg-slate-900 text-slate-200">
                                Dialogue
                              </option>
                              <option value="narration" className="bg-slate-900 text-slate-200">
                                Narration
                              </option>
                              <option value="thought" className="bg-slate-900 text-slate-200">
                                Thought
                              </option>
                              <option value="sfx" className="bg-slate-900 text-slate-200">
                                SFX
                              </option>
                              <option value="other" className="bg-slate-900 text-slate-200">
                                Other
                              </option>
                            </select>

                            {/* Speaker input */}
                            <input
                              type="text"
                              value={block.speaker || ''}
                              onChange={(e) =>
                                handleBlockChange(block.id, { speaker: e.target.value })
                              }
                              placeholder="Speaker"
                              aria-label={`Block ${idx + 1} speaker`}
                              className="bg-slate-900/90 border border-slate-750 text-[11px] text-indigo-300 font-medium px-2 py-0.5 rounded-md w-24 placeholder-slate-600 focus:outline-none focus:border-indigo-500 truncate"
                            />
                          </div>

                          {/* Reordering and Delete controls */}
                          <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveBlock(idx, 'up');
                              }}
                              disabled={idx === 0}
                              aria-label={`Move block ${idx + 1} up`}
                              title="Move earlier in reading order"
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 rounded hover:bg-slate-800 transition-colors"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveBlock(idx, 'down');
                              }}
                              disabled={idx === blocks.length - 1}
                              aria-label={`Move block ${idx + 1} down`}
                              title="Move later in reading order"
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-20 rounded hover:bg-slate-800 transition-colors"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBlock(block.id);
                              }}
                              aria-label={`Delete block ${idx + 1}`}
                              title="Delete this block"
                              className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Text editor textarea */}
                        <textarea
                          value={cleanSfxIcons(block.text || '')}
                          onChange={(e) =>
                            handleBlockChange(block.id, { text: e.target.value })
                          }
                          aria-label={`Block ${idx + 1} text`}
                          placeholder="Dialogue or narration text..."
                          rows={2}
                          className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 resize-y font-sans placeholder-slate-600"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Add block button & dropdown */}
                <div className="relative pt-1" ref={addMenuRef}>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAddBlock('bottom')}
                      className="flex-1 py-1.5 px-3 border border-slate-750 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-900 rounded-xl text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                      title="Append a new dialogue block to the bottom of the page"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Add Dialogue Block</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAddMenu(!showAddMenu)}
                      aria-label="More add options"
                      aria-expanded={showAddMenu}
                      className="p-1.5 border border-slate-750 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {showAddMenu && (
                    <div className="absolute bottom-full mb-1 right-0 w-48 bg-slate-900 border border-slate-750 rounded-xl shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        type="button"
                        onClick={() => handleAddBlock('top')}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Add at Top of Page</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddBlock('bottom')}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer"
                      >
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-400" />
                        <span>Add at Bottom of Page</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* TAB 2: PLAIN TEXT */}
        {activeTab === 'text' && (
          <section
            id="inspector-panel-text"
            role="tabpanel"
            aria-labelledby="inspector-tab-text"
            className="h-full flex flex-col space-y-2 min-h-[360px]"
          >
            <div className="flex-1 flex flex-col min-h-0">
              <label htmlFor="plain-text-editor" className="sr-only">
                Full page text
              </label>
              <textarea
                id="plain-text-editor"
                value={cleanSfxIcons(page.fullText || '')}
                onChange={(e) =>
                  onUpdateFullText(page.index, cleanSfxIcons(e.target.value))
                }
                placeholder="Full extracted text for this page..."
                rows={16}
                className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 font-sans resize-none overflow-y-auto"
              />
            </div>
            <p className="text-[11px] text-slate-400 px-1">
              Changes here are synchronized with EPUB, TXT, and Markdown exports.
            </p>
          </section>
        )}

        {/* TAB 3: CHAPTER STORY */}
        {activeTab === 'story' && (
          <section
            id="inspector-panel-story"
            role="tabpanel"
            aria-labelledby="inspector-tab-story"
            className="space-y-3.5"
          >
            {/* Unified Chapter Arc Banner */}
            <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-100">
                    AI Chapter Narrative Arc
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {onSynthesizeChapterSummary && (
                    <button
                      type="button"
                      disabled={isSynthesizingChapterSummary}
                      onClick={() => onSynthesizeChapterSummary()}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                      title="Synthesize all dialogue and scenes into a cohesive narrative arc"
                    >
                      <Sparkles
                        className={`w-3 h-3 ${
                          isSynthesizingChapterSummary ? 'animate-spin' : 'text-indigo-400'
                        }`}
                      />
                      <span>
                        {isSynthesizingChapterSummary
                          ? 'Synthesizing...'
                          : hasValidSummary
                          ? 'AI Refine'
                          : 'Generate'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsEditingChapterSummary(!isEditingChapterSummary)}
                    className="text-[11px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  >
                    {isEditingChapterSummary ? 'Done' : 'Edit'}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Cohesive chapter story arc synthesized across all panels and dialogue.
              </p>

              {/* Story text or editor */}
              {isEditingChapterSummary ? (
                <textarea
                  value={hasValidSummary ? chapterSummary : ''}
                  onChange={(e) => onUpdateChapterSummary?.(e.target.value)}
                  placeholder="Enter or refine overarching chapter narrative..."
                  rows={6}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 font-sans resize-y"
                />
              ) : (
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans min-h-[70px]">
                  {hasValidSummary ? (
                    <p className="leading-relaxed whitespace-pre-line">{chapterSummary}</p>
                  ) : (
                    <p className="text-slate-500 italic">
                      {isSynthesizingChapterSummary
                        ? 'Synthesizing full chapter summary...'
                        : 'No chapter summary synthesized yet. Click "Generate" above or run batch OCR to synthesize.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Scene Beats Flow by Page */}
            {allPages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Scene Beats ({allPages.filter((p) => !p.isExcluded && !p.isExtraPage && p.pageSummary).length} pages)
                  </span>
                  <span className="text-[10px] text-slate-500">Page Navigation</span>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {allPages
                    .filter((p) => !p.isExcluded && !p.isExtraPage)
                    .map((p) => (
                      <button
                        key={p.id || `page-summary-${p.index}`}
                        type="button"
                        onClick={() => onSelectPage?.(p.index)}
                        className={`w-full text-left p-2 rounded-lg border text-xs cursor-pointer transition-all flex items-start gap-2 ${
                          p.index === page.index
                            ? 'bg-indigo-950/40 border-indigo-700/60 text-slate-200'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-indigo-300 border border-slate-700">
                          P.{p.index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="line-clamp-2 text-slate-300 italic text-[11px] leading-relaxed">
                            {p.pageSummary ||
                              (p.blocks && p.blocks.length > 0
                                ? `${p.blocks.length} text blocks extracted`
                                : 'Pending extraction')}
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* FOOTER: Preserved reading status */}
      <footer className="px-3.5 py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
          <span>Reading sequence synced</span>
        </span>
        <span className="text-slate-500 font-mono text-[11px]">
          {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
        </span>
      </footer>
    </aside>
  );
};
