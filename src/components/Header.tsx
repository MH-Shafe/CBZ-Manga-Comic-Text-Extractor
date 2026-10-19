import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Sliders,
  Download,
  Upload,
  Sparkles,
  Layers,
  StopCircle,
  AlertCircle,
  Key,
  Globe,
  Compass,
  Search,
  ChevronDown,
  Menu,
  X,
  FileArchive,
  Image as ImageIcon,
  FileCode,
  FolderOpen,
  Info,
  MoreHorizontal,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { ExtractionSettings, ApiQuotaInfo, ComicMetadata } from '../types';
import { ApiQuotaBadge } from './ApiQuotaBadge';
import { Button, IconButton, Badge } from './ui';

export interface HeaderProps {
  totalPages: number;
  extractedCount: number;
  excludedCount: number;
  extraPagesCount: number;
  errorPagesCount?: number;
  totalChapters?: number;
  activeChapterIndex?: number;
  activeFileName?: string;
  seriesTitle?: string;
  chapterTitle?: string;
  metadata?: ComicMetadata | null;
  isProcessing: boolean;
  settings: ExtractionSettings;
  quotaInfo?: ApiQuotaInfo | null;
  onUpdateSettings?: (newSettings: ExtractionSettings) => void;
  onOpenSettings: () => void;
  onOpenApiKey?: () => void;
  onOpenExport: () => void;
  onBatchExtract: () => void;
  onOpenMultiChapterExtract?: () => void;
  onOpenUrlImport?: () => void;
  onOpenTitleSearch?: () => void;
  onOpenSources?: () => void;
  onOpenSeriesInfo?: () => void;
  onStopExtract: () => void;
  onRetryErrors?: () => void;
  onFileSelected?: (file: File) => void;
  onFilesSelected?: (files: File[]) => void;
  onHomeClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  totalPages,
  extractedCount,
  excludedCount,
  extraPagesCount,
  errorPagesCount = 0,
  totalChapters = 1,
  activeChapterIndex = 0,
  activeFileName = '',
  seriesTitle,
  chapterTitle,
  metadata,
  isProcessing,
  settings,
  quotaInfo = null,
  onUpdateSettings = () => {},
  onOpenSettings,
  onOpenApiKey,
  onOpenExport,
  onBatchExtract,
  onOpenMultiChapterExtract,
  onOpenUrlImport,
  onOpenTitleSearch,
  onOpenSources,
  onOpenSeriesInfo,
  onStopExtract,
  onRetryErrors,
  onFileSelected,
  onFilesSelected,
  onHomeClick,
}) => {
  // Menu dropdown and mobile drawer states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Hidden file input refs for unified Import hub actions
  const cbzInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const mhtInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const importMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (importMenuRef.current && !importMenuRef.current.contains(target)) {
        setIsImportOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Keyboard accessibility: Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsImportOpen(false);
        setIsMoreOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle local file picker selections
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (e.target.files.length > 1 && onFilesSelected) {
        onFilesSelected(Array.from(e.target.files));
      } else if (onFileSelected) {
        onFileSelected(e.target.files[0]);
      }
      // Reset input value so re-selecting same file fires event
      e.target.value = '';
      setIsImportOpen(false);
      setIsMobileMenuOpen(false);
    }
  };

  const getReadingOrderLabel = () => {
    switch (settings.readingOrder) {
      case 'manga-rtl':
        return 'Manga (RTL)';
      case 'manhwa-vertical':
        return 'Manhwa (Vertical)';
      case 'comic-ltr':
        return 'Comic (LTR)';
      default:
        return 'Manga (RTL)';
    }
  };

  // Derive display title for the current comic/chapter
  const displaySeries =
    seriesTitle ||
    metadata?.series ||
    metadata?.mangaTitle ||
    metadata?.bookTitle ||
    (activeFileName ? activeFileName.replace(/\.(cbz|zip|mht|mhtml)$/i, '') : '');
  const displayChapter = chapterTitle || (totalChapters > 1 ? `Ch. ${activeChapterIndex + 1}/${totalChapters}` : '');

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-lg w-full">
      {/* Hidden file inputs for Header Import hub */}
      <input
        type="file"
        ref={cbzInputRef}
        onChange={handleFileChange}
        accept=".cbz,application/vnd.comicbook+zip,application/x-cbz"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={zipInputRef}
        onChange={handleFileChange}
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={mhtInputRef}
        onChange={handleFileChange}
        accept=".mht,.mhtml,message/rfc822,multipart/related"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleFileChange}
        accept="image/png,image/jpeg,image/jpg,image/webp,image/avif"
        multiple
        className="hidden"
        aria-hidden="true"
      />

      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left Section: Mobile Menu Toggle, Brand Logo & Current Series Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer shrink-0"
            aria-label="Open Navigation Menu"
            aria-expanded={isMobileMenuOpen}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* App Brand Logo */}
          <button
            onClick={onHomeClick}
            className="flex items-center gap-2 shrink-0 hover:opacity-80 transition cursor-pointer text-left"
            aria-label="Go to Home or Gallery"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="hidden lg:flex flex-col min-w-0">
              <span className="font-bold text-sm lg:text-base text-white tracking-tight leading-none whitespace-nowrap">
                Manga OCR
              </span>
              <span className="text-[10px] text-indigo-300 font-medium leading-tight mt-0.5 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                Vision AI + TTS
              </span>
            </div>
          </button>

          {/* Current Series / Chapter Indicator (Divider + Info) */}
          {displaySeries && (
            <div className="flex items-center gap-2 min-w-0 pl-2 sm:pl-3 border-l border-slate-800 truncate">
              <div className="min-w-0 truncate">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span
                    className="text-xs sm:text-sm font-semibold text-slate-200 truncate cursor-pointer hover:text-indigo-300 transition"
                    title={displaySeries}
                    onClick={onOpenSeriesInfo}
                  >
                    {displaySeries}
                  </span>
                  {displayChapter && (
                    <span className="shrink-0 text-[10px] sm:text-xs font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                      {displayChapter}
                    </span>
                  )}
                </div>
                {totalPages > 0 && (
                  <p className="text-[11px] text-slate-400 truncate hidden md:block leading-none mt-0.5">
                    {extractedCount} of {totalPages} pages extracted · {getReadingOrderLabel()}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center / Processing Live Status (Desktop) */}
        {isProcessing && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-xs text-indigo-200 shrink-0 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="font-medium">OCR Processing Active...</span>
          </div>
        )}

        {/* Right Section: Primary (OCR), Secondary (Export, Import Hub), More Tools, Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* PRIMARY ACTION: Start OCR / Stop OCR */}
          {totalPages > 0 && (
            <>
              {isProcessing ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onStopExtract}
                  className="shadow-md shadow-rose-900/30"
                  leftIcon={<StopCircle className="w-3.5 h-3.5" />}
                  aria-label="Stop OCR Extraction"
                >
                  <span className="font-semibold">Stop OCR</span>
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onBatchExtract}
                  className="shadow-md shadow-indigo-900/30 font-semibold"
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-indigo-200" />}
                  title="Start AI Vision OCR extraction across chapter pages"
                  aria-label="Start OCR Extraction"
                >
                  <span className="hidden min-[400px]:inline">Start </span>
                  <span>OCR</span>
                </Button>
              )}

              {/* SECONDARY ACTION: Export Dialogue */}
              {extractedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onOpenExport}
                  leftIcon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
                  className="hover:text-white hover:border-slate-600 hidden sm:inline-flex"
                  title="Export extracted text to EPUB, TXT, Markdown, or JSON"
                  aria-label="Export extracted dialogue"
                >
                  <span>Export</span>
                </Button>
              )}
            </>
          )}

          {/* SECONDARY ACTION: Unified Import Hub Dropdown */}
          <div className="relative" ref={importMenuRef}>
            <button
              type="button"
              id="header-import-hub-button"
              onClick={() => {
                setIsImportOpen(!isImportOpen);
                setIsMoreOpen(false);
              }}
              className="min-h-[32px] h-8 px-2.5 sm:px-3 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition shadow-sm flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              aria-haspopup="menu"
              aria-expanded={isImportOpen}
              aria-label="Open Import Hub Menu"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="hidden sm:inline">Import</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isImportOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Import Dropdown Menu */}
            {isImportOpen && (
              <div
                role="menu"
                aria-label="Import Options"
                className="fixed left-1/2 -translate-x-1/2 top-16 w-[calc(100vw-2rem)] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:translate-x-0 sm:top-full sm:w-72 sm:max-w-none mt-2 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-1.5 text-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-[80vh] overflow-y-auto"
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Local Files
                </div>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => cbzInputRef.current?.click()}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                >
                  <FileArchive className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Open CBZ Comic</div>
                    <div className="text-[10px] text-slate-400 truncate">.cbz comic archive</div>
                  </div>
                </button>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Open ZIP Archive</div>
                    <div className="text-[10px] text-slate-400 truncate">.zip package or manga folder</div>
                  </div>
                </button>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => mhtInputRef.current?.click()}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                >
                  <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Open MHT / MHTML</div>
                    <div className="text-[10px] text-slate-400 truncate">Saved single-file webpage (.mht)</div>
                  </div>
                </button>

                <button
                  role="menuitem"
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Open Image Files</div>
                    <div className="text-[10px] text-slate-400 truncate">WebP, PNG, JPG chapter pages</div>
                  </div>
                </button>

                <div className="my-1.5 border-t border-slate-800" />

                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Online Scrapers &amp; Catalog
                </div>

                {onOpenTitleSearch && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsImportOpen(false);
                      onOpenTitleSearch();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Search className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Search Manga Titles</div>
                      <div className="text-[10px] text-slate-400 truncate">MangaDex, Webtoons &amp; Asura Scans</div>
                    </div>
                  </button>
                )}

                {onOpenUrlImport && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsImportOpen(false);
                      onOpenUrlImport();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Import from Web URL</div>
                      <div className="text-[10px] text-slate-400 truncate">Read chapters directly from links</div>
                    </div>
                  </button>
                )}

                {onOpenSources && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsImportOpen(false);
                      onOpenSources();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Compass className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0 flex-1 flex items-center justify-between">
                      <span className="font-medium">Supported Sources</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                        1.4k+
                      </span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* MORE TOOLS DROPDOWN MENU */}
          <div className="relative hidden md:block" ref={moreMenuRef}>
            <button
              type="button"
              id="header-more-tools-button"
              onClick={() => {
                setIsMoreOpen(!isMoreOpen);
                setIsImportOpen(false);
              }}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700/80 hover:border-slate-600 transition shadow-sm flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 shrink-0"
              aria-haspopup="menu"
              aria-expanded={isMoreOpen}
              aria-label="More tools and actions"
              title="More actions & tools"
            >
              <MoreHorizontal className="w-4 h-4 text-slate-400" />
              <span className="hidden lg:inline font-medium">More</span>
            </button>

            {isMoreOpen && (
              <div
                role="menu"
                aria-label="More Actions"
                className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-1.5 text-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                {onOpenMultiChapterExtract && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenMultiChapterExtract();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Multi-Chapter Batch OCR</span>
                  </button>
                )}

                {metadata && onOpenSeriesInfo && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenSeriesInfo();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Info className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Series Info &amp; Metadata</span>
                  </button>
                )}

                {errorPagesCount > 0 && onRetryErrors && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onRetryErrors();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-rose-300 hover:text-rose-100 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Retry {errorPagesCount} Failed Pages</span>
                  </button>
                )}

                {onOpenApiKey && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenApiKey();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Key className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Gemini API Key Setup</span>
                  </button>
                )}

                {onOpenSources && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenSources();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2.5 transition text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Compass className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Comic Sources Directory</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* QUIET ACTION: Extraction Settings */}
          <button
            id="header-settings-button"
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700/80 hover:border-slate-600 transition shadow-sm flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 shrink-0"
            title="Configure reading order, watermarks, and OCR settings"
            aria-label="Open Extraction Settings"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="hidden sm:inline font-medium">Settings</span>
          </button>

          {/* QUIET ACTION: API Quota Indicator */}
          <ApiQuotaBadge
            quotaInfo={quotaInfo}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            onOpenFullSettings={onOpenSettings}
            onOpenApiKey={onOpenApiKey}
          />
        </div>
      </div>

      {/* MOBILE DRAWER / SHEET */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden flex justify-start animate-in fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Menu"
        >
          <div
            ref={mobileDrawerRef}
            className="w-4/5 max-w-sm h-full bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between overflow-y-auto shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-4">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onHomeClick?.();
                  }}
                  className="flex items-center gap-2 hover:opacity-80 transition cursor-pointer text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-none">Manga OCR</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Vision AI Reader</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Active Book Info */}
              {displaySeries && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Currently Reading</div>
                  <div className="text-xs font-semibold text-white truncate mt-0.5">{displaySeries}</div>
                  {totalPages > 0 && (
                    <div className="text-[11px] text-indigo-300 font-mono mt-1">
                      {extractedCount}/{totalPages} pages · {getReadingOrderLabel()}
                    </div>
                  )}
                </div>
              )}

              {/* Primary Actions in Mobile Menu */}
              <div className="flex flex-col gap-2">
                {totalPages > 0 && (
                  <>
                    {isProcessing ? (
                      <Button
                        variant="destructive"
                        size="md"
                        fullWidth
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onStopExtract();
                        }}
                        leftIcon={<StopCircle className="w-4 h-4" />}
                      >
                        Stop OCR
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        fullWidth
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onBatchExtract();
                        }}
                        leftIcon={<Sparkles className="w-4 h-4 text-indigo-200" />}
                      >
                        Start OCR Extraction
                      </Button>
                    )}

                    {extractedCount > 0 && (
                      <Button
                        variant="secondary"
                        size="md"
                        fullWidth
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onOpenExport();
                        }}
                        leftIcon={<Download className="w-4 h-4 text-emerald-400" />}
                      >
                        Export Dialogue
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Import Section */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  Import Files &amp; Sources
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    cbzInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                >
                  <FileArchive className="w-4 h-4 text-indigo-400" />
                  <span>Open CBZ Comic</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    zipInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                >
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  <span>Open ZIP Archive</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    mhtInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                >
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span>Open MHT / MHTML</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    imageInputRef.current?.click();
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                >
                  <ImageIcon className="w-4 h-4 text-sky-400" />
                  <span>Open Images</span>
                </button>

                {onOpenTitleSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenTitleSearch();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                  >
                    <Search className="w-4 h-4 text-indigo-400" />
                    <span>Search Manga Titles</span>
                  </button>
                )}

                {onOpenUrlImport && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenUrlImport();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                  >
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>Import Web URL</span>
                  </button>
                )}

                {onOpenSources && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenSources();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                  >
                    <Compass className="w-4 h-4 text-amber-400" />
                    <span>1,440+ Supported Sources</span>
                  </button>
                )}
              </div>

              {/* Tools Section */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  Tools &amp; Settings
                </div>

                {onOpenMultiChapterExtract && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenMultiChapterExtract();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                  >
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Multi-Chapter Batch</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                >
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Extraction &amp; OCR Settings</span>
                </button>

                {onOpenApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenApiKey();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 rounded-lg flex items-center gap-2.5 transition text-slate-200"
                  >
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Gemini API Key</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
              Manga OCR • AI Vision Engine
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

