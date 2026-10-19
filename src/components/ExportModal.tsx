import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Download,
  BookOpen,
  FileText,
  Code,
  Image,
  ScrollText,
  UserX,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  ComicPage,
  ExportOptions,
  ReadingOrderMode,
  ComicMetadata,
  ExtractionSettings,
  ComicChapter,
} from '../types';
import {
  generatePlainText,
  generateMarkdown,
  generateJson,
  triggerDownload,
  compileChapterSummary,
  generateMultiChapterText,
  generateMultiChapterMarkdown,
  generateMultiChapterJson,
} from '../utils/textExporter';
import { generateEpub, generateMultiChapterEpub } from '../utils/epubGenerator';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: ComicPage[];
  defaultTitle: string;
  readingOrder?: ReadingOrderMode;
  metadata?: ComicMetadata | null;
  settings?: ExtractionSettings;
  chapterSummary?: string;
  onUpdateChapterSummary?: (summary: string) => void;
  isSynthesizingChapterSummary?: boolean;
  onSynthesizeChapterSummary?: (customTitle?: string) => Promise<string>;
  chapters?: ComicChapter[];
  activeChapterIndex?: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  pages,
  defaultTitle,
  readingOrder = 'manhwa-vertical',
  metadata,
  settings,
  chapterSummary = '',
  onUpdateChapterSummary,
  isSynthesizingChapterSummary = false,
  onSynthesizeChapterSummary,
  chapters = [],
  activeChapterIndex = 0,
}) => {
  const isManhwa = readingOrder === 'manhwa-vertical';

  const [options, setOptions] = useState<ExportOptions>(() => {
    const initialTitle =
      metadata?.combinedTitle ||
      metadata?.bookTitle ||
      defaultTitle.replace(/\.(cbz|zip)$/i, '') ||
      'Manga Chapter Text';
    const initialAuthor = metadata?.author || 'Original Author';
    const initialScanlator = metadata?.scanlator || '';

    return {
      title: initialTitle,
      author: initialAuthor,
      scanlator: initialScanlator,
      format: 'epub',
      includePageImagesInEpub: true,
      excludeSpeakerPrefixes: false,
      includeSummary: true,
      summaryScope: isManhwa ? 'chapter' : 'page',
      chapterSummary: chapterSummary || '',
      excludeExtraPages: true,
      excludeUnextractedPages: true,
      readingOrder,
      exportChapterScope: 'current',
    };
  });

  const [isExporting, setIsExporting] = useState(false);
  const [isEditingChapterSummary, setIsEditingChapterSummary] = useState(false);
  const [localSynthesizing, setLocalSynthesizing] = useState(false);

  const isSynthesizing = isSynthesizingChapterSummary || localSynthesizing;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isExporting) {
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
  }, [isOpen, isExporting, onClose]);

  useEffect(() => {
    if (
      chapterSummary &&
      !chapterSummary.includes('No extracted story pages') &&
      (!options.chapterSummary || options.chapterSummary.includes('No extracted story pages'))
    ) {
      setOptions((prev) => ({ ...prev, chapterSummary }));
    }
  }, [chapterSummary]);

  useEffect(() => {
    if (metadata) {
      setOptions((prev) => ({
        ...prev,
        title: metadata.combinedTitle || metadata.bookTitle || prev.title,
        author: metadata.author || prev.author,
        scanlator: metadata.scanlator || prev.scanlator,
      }));
    }
  }, [metadata]);

  useEffect(() => {
    setOptions((prev) => ({
      ...prev,
      readingOrder,
      summaryScope: isManhwa ? 'chapter' : prev.summaryScope,
    }));
  }, [readingOrder, isManhwa]);

  const exportablePages = useMemo(() => {
    const excludeUnextracted = options.excludeUnextractedPages ?? true;
    return pages.filter((p) => {
      if (p.isExcluded) return false;
      if (options.excludeExtraPages && p.isExtraPage) return false;
      const hasText = Boolean(
        (p.fullText && p.fullText.trim()) ||
        (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim()))
      );
      const hasSummary = Boolean(p.pageSummary && p.pageSummary.trim());
      if (excludeUnextracted && !hasText && !hasSummary && p.status !== 'completed') {
        return false;
      }
      return true;
    });
  }, [pages, options.excludeExtraPages, options.excludeUnextractedPages]);

  const extractedChaptersCount = useMemo(() => {
    if (!chapters || chapters.length === 0) return 0;
    return chapters.filter((ch) =>
      ch.pages.some(
        (p) =>
          !p.isExcluded &&
          !p.isExtraPage &&
          ((p.fullText && p.fullText.trim().length > 0) ||
            (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim())) ||
            (p.pageSummary && p.pageSummary.trim().length > 0))
      )
    ).length;
  }, [chapters]);

  const compiledSummary = useMemo(() => {
    return compileChapterSummary(exportablePages);
  }, [exportablePages]);

  const effectiveChapterSummary = options.chapterSummary?.trim() || compiledSummary;

  const handleTriggerSynthesize = async () => {
    try {
      setLocalSynthesizing(true);
      if (onSynthesizeChapterSummary) {
        const result = await onSynthesizeChapterSummary(options.title);
        setOptions((prev) => ({ ...prev, chapterSummary: result }));
      } else {
        const response = await fetch('/api/generate-chapter-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(settings?.customApiKey ? { 'x-gemini-api-key': settings.customApiKey } : {}),
          },
          body: JSON.stringify({
            pages: exportablePages,
            chapterTitle: options.title,
            readingOrder: options.readingOrder,
            customApiKey: settings?.customApiKey,
            currentSummary: options.chapterSummary || chapterSummary || '',
          }),
        });
        const responseText = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(responseText);
        } catch {
          const firstBrace = responseText.indexOf('{');
          const lastBrace = responseText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
              data = JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
            } catch {
              data = null;
            }
          }
        }
        const rawRes = (data?.chapterSummary || '').trim();
        const resText =
          rawRes && !rawRes.includes('No extracted story pages')
            ? rawRes
            : compileChapterSummary(exportablePages);
        setOptions((prev) => ({ ...prev, chapterSummary: resText }));
        onUpdateChapterSummary?.(resText);
      }
    } catch (err) {
      console.error('Error synthesizing chapter summary:', err);
      const fallback = compileChapterSummary(exportablePages);
      setOptions((prev) => ({ ...prev, chapterSummary: fallback }));
      onUpdateChapterSummary?.(fallback);
    } finally {
      setLocalSynthesizing(false);
    }
  };

  const targetChaptersForExport = useMemo(() => {
    if (!chapters || chapters.length === 0) return [];
    if (options.exportChapterScope === 'extracted') {
      return chapters.filter((ch) =>
        ch.pages.some(
          (p) =>
            !p.isExcluded &&
            !p.isExtraPage &&
            ((p.fullText && p.fullText.trim().length > 0) ||
              (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim())) ||
              (p.pageSummary && p.pageSummary.trim().length > 0))
        )
      );
    }
    return chapters;
  }, [chapters, options.exportChapterScope]);

  const previewText = useMemo(() => {
    if (options.exportChapterScope !== 'current' && targetChaptersForExport.length > 0) {
      const previewOptions: ExportOptions = {
        ...options,
        chapterSummary: effectiveChapterSummary,
      };
      if (options.format === 'markdown') {
        return generateMultiChapterMarkdown(targetChaptersForExport.slice(0, 2), previewOptions);
      } else if (options.format === 'json') {
        return generateMultiChapterJson(targetChaptersForExport.slice(0, 2), previewOptions);
      } else {
        return generateMultiChapterText(targetChaptersForExport.slice(0, 2), previewOptions);
      }
    }

    if (exportablePages.length === 0) return 'No pages selected for export.';

    const previewOptions: ExportOptions = {
      ...options,
      chapterSummary: effectiveChapterSummary,
    };

    if (options.format === 'markdown') {
      return generateMarkdown(exportablePages.slice(0, 3), previewOptions);
    } else if (options.format === 'json') {
      return generateJson(exportablePages.slice(0, 2), previewOptions);
    } else {
      return generatePlainText(exportablePages.slice(0, 3), previewOptions);
    }
  }, [exportablePages, options, effectiveChapterSummary, targetChaptersForExport]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    try {
      setIsExporting(true);
      const safeTitle = (options.title || 'comic_text')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');

      const exportConfig: ExportOptions = {
        ...options,
        chapterSummary: effectiveChapterSummary,
      };

      if (options.exportChapterScope !== 'current' && targetChaptersForExport.length > 0) {
        const fileSuffix = options.exportChapterScope === 'extracted' ? '_extracted_chapters' : '_all_chapters';
        if (options.format === 'epub') {
          const epubBlob = await generateMultiChapterEpub(targetChaptersForExport, exportConfig);
          triggerDownload(epubBlob, `${safeTitle}${fileSuffix}.epub`);
        } else if (options.format === 'markdown') {
          const mdText = generateMultiChapterMarkdown(targetChaptersForExport, exportConfig);
          const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
          triggerDownload(blob, `${safeTitle}${fileSuffix}.md`);
        } else if (options.format === 'json') {
          const jsonText = generateMultiChapterJson(targetChaptersForExport, exportConfig);
          const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
          triggerDownload(blob, `${safeTitle}${fileSuffix}.json`);
        } else {
          const plainText = generateMultiChapterText(targetChaptersForExport, exportConfig);
          const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
          triggerDownload(blob, `${safeTitle}${fileSuffix}.txt`);
        }
      } else {
        if (options.format === 'epub') {
          const epubBlob = await generateEpub(exportablePages, exportConfig);
          triggerDownload(epubBlob, `${safeTitle}.epub`);
        } else if (options.format === 'markdown') {
          const mdText = generateMarkdown(exportablePages, exportConfig);
          const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
          triggerDownload(blob, `${safeTitle}.md`);
        } else if (options.format === 'json') {
          const jsonText = generateJson(exportablePages, exportConfig);
          const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
          triggerDownload(blob, `${safeTitle}.json`);
        } else {
          const plainText = generatePlainText(exportablePages, exportConfig);
          const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
          triggerDownload(blob, `${safeTitle}.txt`);
        }
      }

      setIsExporting(false);
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      {/* Standard Size: MD ≈ 640px */}
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[640px] max-h-[92dvh] shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: [Icon + Title + Description] [Close] */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="export-modal-title" className="font-bold text-slate-100 text-sm sm:text-base truncate">
                Export Extracted Text
              </h2>
              <p className="text-xs text-slate-400 truncate">Save as EPUB ebook, Plain Text, or Markdown</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition shrink-0 cursor-pointer disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-500"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Organized into 1. Format, 2. Scope, 3. Options */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs sm:text-sm text-slate-300 overscroll-contain flex-1">
          {/* 1. Format Selection */}
          <section aria-labelledby="format-heading" className="space-y-2">
            <h3 id="format-heading" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              1. Export Format
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* EPUB */}
              <button
                type="button"
                onClick={() => setOptions({ ...options, format: 'epub' })}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center text-center transition cursor-pointer ${
                  options.format === 'epub'
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500 shadow-sm'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40 text-slate-300'
                }`}
              >
                <BookOpen className="w-5 h-5 mb-1 text-emerald-400" />
                <span className="font-bold text-xs">EPUB</span>
                <span className="text-[10px] text-slate-400">Ebook</span>
              </button>

              {/* TXT */}
              <button
                type="button"
                onClick={() => setOptions({ ...options, format: 'txt' })}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center text-center transition cursor-pointer ${
                  options.format === 'txt'
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500 shadow-sm'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40 text-slate-300'
                }`}
              >
                <FileText className="w-5 h-5 mb-1 text-emerald-400" />
                <span className="font-bold text-xs">Text (.txt)</span>
                <span className="text-[10px] text-slate-400">Clean dialogue</span>
              </button>

              {/* Markdown */}
              <button
                type="button"
                onClick={() => setOptions({ ...options, format: 'markdown' })}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center text-center transition cursor-pointer ${
                  options.format === 'markdown'
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500 shadow-sm'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40 text-slate-300'
                }`}
              >
                <FileText className="w-5 h-5 mb-1 text-emerald-400" />
                <span className="font-bold text-xs">Markdown</span>
                <span className="text-[10px] text-slate-400">Formatted (.md)</span>
              </button>

              {/* JSON */}
              <button
                type="button"
                onClick={() => setOptions({ ...options, format: 'json' })}
                className={`p-2.5 sm:p-3 rounded-xl border flex flex-col items-center text-center transition cursor-pointer ${
                  options.format === 'json'
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500 shadow-sm'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40 text-slate-300'
                }`}
              >
                <Code className="w-5 h-5 mb-1 text-emerald-400" />
                <span className="font-bold text-xs">JSON</span>
                <span className="text-[10px] text-slate-400">Data blocks</span>
              </button>
            </div>
          </section>

          {/* 2. Export Scope (when multiple chapters exist) */}
          {chapters && chapters.length > 1 && (
            <section aria-labelledby="scope-heading" className="space-y-2 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <h3 id="scope-heading" className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>2. Archive Chapter Scope</span>
                </h3>
                <span className="text-[10px] text-indigo-400 font-mono">
                  {extractedChaptersCount} / {chapters.length} extracted
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setOptions({ ...options, exportChapterScope: 'current' })}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    options.exportChapterScope === 'current'
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200 ring-1 ring-indigo-500'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-100">Current Chapter</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {chapters[activeChapterIndex]?.title || `Chapter ${activeChapterIndex + 1}`}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOptions({ ...options, exportChapterScope: 'extracted' })}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    options.exportChapterScope === 'extracted'
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200 ring-1 ring-indigo-500'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-100">Extracted Chapters</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {extractedChaptersCount} chapters with text
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOptions({ ...options, exportChapterScope: 'all' })}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    options.exportChapterScope === 'all'
                      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200 ring-1 ring-indigo-500'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-100">All Chapters</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    All {chapters.length} chapters
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* 3. Optional Content & Metadata */}
          <section aria-labelledby="options-heading" className="space-y-3 border-t border-slate-800 pt-4">
            <h3 id="options-heading" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              3. Content &amp; Formatting Options
            </h3>

            {/* Metadata inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Book / Chapter Title</label>
                <input
                  type="text"
                  value={options.title}
                  onChange={(e) => setOptions({ ...options, title: e.target.value })}
                  placeholder="e.g. Solo Leveling"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Author / Creator</label>
                <input
                  type="text"
                  value={options.author}
                  onChange={(e) => setOptions({ ...options, author: e.target.value })}
                  placeholder="e.g. Author Name"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Summary option */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={options.includeSummary}
                  onChange={(e) => setOptions({ ...options, includeSummary: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-950"
                />
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <ScrollText className="w-4 h-4" />
                  Include Story Summary in Export
                </span>
              </label>

              {options.includeSummary && (
                <div className="pl-5 space-y-2 pt-1 border-l border-emerald-500/30 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Cohesive Chapter Recap</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleTriggerSynthesize}
                        disabled={isSynthesizing || exportablePages.length === 0}
                        className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className={`w-3 h-3 ${isSynthesizing ? 'animate-spin' : ''}`} />
                        <span>{isSynthesizing ? 'Synthesizing...' : 'AI Refine'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingChapterSummary(!isEditingChapterSummary)}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                      >
                        {isEditingChapterSummary ? 'Done' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  {isEditingChapterSummary ? (
                    <textarea
                      rows={3}
                      value={options.chapterSummary !== undefined && options.chapterSummary !== '' ? options.chapterSummary : effectiveChapterSummary}
                      onChange={(e) => {
                        setOptions({ ...options, chapterSummary: e.target.value });
                        onUpdateChapterSummary?.(e.target.value);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500"
                    />
                  ) : (
                    <p className="text-[11px] text-slate-300 italic max-h-20 overflow-y-auto leading-relaxed bg-slate-950/80 p-2 rounded border border-slate-800">
                      {effectiveChapterSummary || 'No summary generated yet.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Checklist options */}
            <div className="space-y-1.5 pt-1 text-xs">
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 transition">
                <input
                  type="checkbox"
                  checked={options.excludeSpeakerPrefixes}
                  onChange={(e) => setOptions({ ...options, excludeSpeakerPrefixes: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-950"
                />
                <span className="text-slate-300">
                  Clean speaker prefixes &amp; [Narration] tags (keeps pure dialogue)
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 transition">
                <input
                  type="checkbox"
                  checked={options.excludeExtraPages}
                  onChange={(e) => setOptions({ ...options, excludeExtraPages: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-950"
                />
                <span className="text-slate-300">
                  Exclude flagged credit sheets &amp; advertisement extra pages
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 transition">
                <input
                  type="checkbox"
                  checked={options.excludeUnextractedPages ?? true}
                  onChange={(e) => setOptions({ ...options, excludeUnextractedPages: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-950"
                />
                <span className="text-slate-300">
                  Omit unextracted empty pages
                </span>
              </label>

              {options.format === 'epub' && (
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 transition">
                  <input
                    type="checkbox"
                    checked={options.includePageImagesInEpub}
                    onChange={(e) => setOptions({ ...options, includePageImagesInEpub: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-950"
                  />
                  <span className="text-slate-300 flex items-center gap-1">
                    <Image className="w-3.5 h-3.5 text-emerald-400" />
                    Embed manga illustrations into EPUB chapters
                  </span>
                </label>
              )}
            </div>
          </section>

          {/* Live Preview Box */}
          <section aria-labelledby="preview-heading" className="space-y-1.5 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <h3 id="preview-heading" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Output Preview ({exportablePages.length} Pages)
              </h3>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {previewText}
            </div>
          </section>
        </div>

        {/* Footer: [Cancel] [Download] */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2 shrink-0">
          <span className="text-xs text-slate-400">
            <strong>{exportablePages.length}</strong> pages ready
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isExporting || exportablePages.length === 0}
              onClick={handleDownload}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download {options.format.toUpperCase()}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
