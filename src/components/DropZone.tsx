import React, { useRef, useState, useEffect } from 'react';
import {
  Upload,
  FileArchive,
  FolderOpen,
  RefreshCw,
  Layers,
  Globe,
  Download,
  ExternalLink,
  Sparkles,
  Search,
  BookOpen,
  Info,
  User,
  MoreVertical,
  Trash2,
  FileText,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ComicMetadata } from '../types';

export interface DropZoneProps {
  onFileSelected: (file: File) => void;
  onFilesSelected?: (files: File[]) => void;
  onOpenUrlImport?: () => void;
  onOpenTitleSearch?: () => void;
  onOpenSources?: () => void;
  onDownloadCbz?: () => void;
  onOpenSeriesInfo?: () => void;
  onOpenExport?: () => void;
  onOpenMultiChapter?: () => void;
  metadata?: ComicMetadata | null;
  isWebSource?: boolean;
  sourceUrl?: string;
  isLoading: boolean;
  loadingMessage?: string;
  activeFileName?: string;
  totalPages?: number;
  totalChapters?: number;
  activeChapterTitle?: string;
  onReset?: () => void;
  onContinueReading?: () => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelected,
  onFilesSelected,
  onOpenUrlImport,
  onOpenTitleSearch,
  onOpenSources,
  onDownloadCbz,
  onOpenSeriesInfo,
  onOpenExport,
  onOpenMultiChapter,
  metadata,
  isWebSource = false,
  sourceUrl,
  isLoading,
  loadingMessage,
  activeFileName,
  totalPages,
  totalChapters = 1,
  activeChapterTitle,
  onReset,
  onContinueReading,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showOpenMenu, setShowOpenMenu] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const openMenuRef = useRef<HTMLDivElement>(null);

  const cbzInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const mhtInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Handle outside click for menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
      if (openMenuRef.current && !openMenuRef.current.contains(e.target as Node)) {
        setShowOpenMenu(false);
      }
    };
    if (showMoreMenu || showOpenMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu, showOpenMenu]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1 && onFilesSelected) {
        onFilesSelected(Array.from(e.dataTransfer.files));
      } else {
        const file = e.dataTransfer.files[0];
        onFileSelected(file);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (e.target.files.length > 1 && onFilesSelected) {
        onFilesSelected(Array.from(e.target.files));
      } else {
        onFileSelected(e.target.files[0]);
      }
    }
    e.target.value = '';
    setShowOpenMenu(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LOADED STATE: Rich series overview, Continue Reading, and grouped secondary actions
  // ─────────────────────────────────────────────────────────────────────────────
  if (activeFileName && totalPages && totalPages > 0) {
    const mangaTitle =
      metadata?.mangaTitle ||
      metadata?.series ||
      metadata?.bookTitle ||
      activeFileName.replace(/\.(cbz|zip|mht|mhtml)$/i, '');
    const chapterNum = metadata?.chapterNumber || metadata?.issueNumber;
    const authorCredit = metadata?.combinedAuthor || metadata?.author;
    const synopsis = metadata?.synopsis;
    const coverThumb = metadata?.coverThumbnail;

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg relative">
        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={cbzInputRef}
          onChange={handleInputChange}
          accept=".cbz,application/x-cbz,.zip,application/zip"
          multiple
          className="hidden"
        />
        <input
          type="file"
          ref={mhtInputRef}
          onChange={handleInputChange}
          accept=".mht,.mhtml,multipart/related,.html,.htm"
          className="hidden"
        />
        <input
          type="file"
          ref={imageInputRef}
          onChange={handleInputChange}
          accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.gif"
          multiple
          className="hidden"
        />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Left: Cover Thumbnail, Title, Metadata & Chapter Information */}
          <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
            {coverThumb ? (
              <div
                onClick={onOpenSeriesInfo}
                className="relative group cursor-pointer shrink-0"
                title="View series synopsis and metadata"
              >
                <img
                  src={coverThumb}
                  alt={mangaTitle}
                  className="w-13 h-18 sm:w-15 sm:h-21 object-cover rounded-xl shadow-md border border-slate-700/80 group-hover:scale-105 group-hover:border-indigo-500 transition-transform duration-200 bg-slate-950"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div
                onClick={onOpenSeriesInfo}
                className="w-13 h-18 sm:w-15 sm:h-21 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 cursor-pointer hover:bg-indigo-500/20 transition-colors"
                title="View series synopsis"
              >
                {isWebSource ? (
                  <Globe className="w-6 h-6 text-emerald-400" />
                ) : totalChapters > 1 ? (
                  <Layers className="w-6 h-6 text-indigo-300" />
                ) : (
                  <BookOpen className="w-6 h-6" />
                )}
              </div>
            )}

            {/* Title, Badges & Author Metadata */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {chapterNum && (
                  <span className="text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-700/80 px-2 py-0.5 rounded-full font-bold">
                    Ch. {chapterNum}
                  </span>
                )}
                {isWebSource && (
                  <span className="text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    Web Source
                  </span>
                )}
                {totalChapters > 1 ? (
                  <span className="text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {totalChapters} Chapters ({totalPages} pages)
                  </span>
                ) : (
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-medium border border-slate-700">
                    {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                  </span>
                )}
                {metadata?.source && (
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    via {metadata.source === 'comicinfo' ? 'ComicInfo.xml' : metadata.source}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-100 truncate">
                  {mangaTitle}
                </h3>
                {onOpenSeriesInfo && (
                  <button
                    type="button"
                    onClick={onOpenSeriesInfo}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0 p-1 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="View full series overview"
                  >
                    <Info className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Overview</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                {authorCredit && (
                  <span className="flex items-center gap-1 text-slate-300">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{authorCredit}</span>
                  </span>
                )}
                {synopsis && (
                  <p className="text-xs text-slate-400 line-clamp-1 max-w-lg">
                    {synopsis}
                  </p>
                )}
                {(sourceUrl || metadata?.sourceUrl) && (
                  <a
                    href={sourceUrl || metadata?.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 underline text-[11px]"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Original Link</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right Action Hierarchy: [Continue Reading] Primary -> [Import/Open] -> [Export] -> [More] */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Primary Action: Continue Reading */}
            <button
              type="button"
              onClick={onContinueReading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              <BookOpen className="w-4 h-4" />
              <span>Continue Reading</span>
            </button>

            {/* Secondary Action: Import / Open Hub */}
            <div className="relative" ref={openMenuRef}>
              <button
                type="button"
                onClick={() => setShowOpenMenu(!showOpenMenu)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                aria-expanded={showOpenMenu}
              >
                <FolderOpen className="w-4 h-4 text-slate-300" />
                <span>Open / Import</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showOpenMenu && (
                <div className="fixed left-1/2 -translate-x-1/2 top-1/3 w-[calc(100vw-2rem)] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:top-full sm:translate-x-0 sm:w-56 sm:max-w-none mt-1.5 bg-slate-900 border border-slate-750 rounded-xl shadow-2xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100 max-h-[70vh] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      cbzInputRef.current?.click();
                      setShowOpenMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileArchive className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Open CBZ / ZIP</div>
                      <div className="text-[11px] text-slate-400">Single or multi-chapter archive</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      imageInputRef.current?.click();
                      setShowOpenMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Open Images</div>
                      <div className="text-[11px] text-slate-400">Select one or more panels</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      mhtInputRef.current?.click();
                      setShowOpenMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Open Saved Webpage</div>
                      <div className="text-[11px] text-slate-400">.mht or .mhtml archive</div>
                    </div>
                  </button>

                  <div className="h-px bg-slate-800 my-1" />

                  {onOpenTitleSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenTitleSearch();
                        setShowOpenMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Search className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div>
                        <div className="font-semibold">Search Manga Online</div>
                        <div className="text-[11px] text-slate-400">MangaDex, Webtoons, Asura</div>
                      </div>
                    </button>
                  )}

                  {onOpenUrlImport && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUrlImport();
                        setShowOpenMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-semibold">Import Chapter URL</div>
                        <div className="text-[11px] text-slate-400">Paste chapter web link</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Secondary Action: Export */}
            {onOpenExport && (
              <button
                type="button"
                onClick={onOpenExport}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <Download className="w-4 h-4 text-slate-300" />
                <span>Export</span>
              </button>
            )}

            {/* More Menu (Save as CBZ, Multi-chapter extraction, Reset/Unload) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                aria-label="More actions"
                title="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMoreMenu && (
                <div className="fixed left-1/2 -translate-x-1/2 top-1/3 w-[calc(100vw-2rem)] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:top-full sm:translate-x-0 sm:w-52 sm:max-w-none mt-1.5 bg-slate-900 border border-slate-750 rounded-xl shadow-2xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                  {onDownloadCbz && (
                    <button
                      type="button"
                      onClick={() => {
                        onDownloadCbz();
                        setShowMoreMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>Save as .CBZ Archive</span>
                    </button>
                  )}

                  {totalChapters > 1 && onOpenMultiChapter && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenMultiChapter();
                        setShowMoreMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Batch Chapter OCR</span>
                    </button>
                  )}

                  {onOpenSeriesInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSeriesInfo();
                        setShowMoreMenu(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Series &amp; Chapter Details</span>
                    </button>
                  )}

                  {onReset && (
                    <>
                      <div className="h-px bg-slate-800 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          onReset();
                          setShowMoreMenu(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Unload &amp; Close Comic</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EMPTY STATE: Ultra-Compact Central Import Panel
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-2xl p-3 sm:p-5 text-center transition-all duration-200 relative overflow-hidden bg-slate-900/80 ${
        isDragging
          ? 'border-indigo-400 bg-indigo-950/40 scale-[1.004]'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={cbzInputRef}
        onChange={handleInputChange}
        accept=".cbz,application/x-cbz,.zip,application/zip"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={mhtInputRef}
        onChange={handleInputChange}
        accept=".mht,.mhtml,multipart/related,.html,.htm"
        className="hidden"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleInputChange}
        accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.gif"
        multiple
        className="hidden"
      />

      <div className="max-w-2xl mx-auto flex flex-col items-center">
        {/* Compact Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isDragging
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-indigo-400 border border-slate-700'
            }`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-slate-100">
            {isLoading
              ? loadingMessage || 'Unpacking Comic Archive...'
              : 'Open Comic or Import Chapter'}
          </h2>
        </div>

        <p className="text-[11px] text-slate-400 mb-3 max-w-lg leading-snug">
          Drag &amp; drop your archive files or choose a local/online source to start reading:
        </p>

        {/* 2-Part Divided Layout: Local Sources & Online Sources */}
        <div className="w-full space-y-2 text-left">
          {/* Part 1: Local Sources */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Local Sources
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {/* 1. Open CBZ / ZIP */}
              <button
                type="button"
                onClick={() => cbzInputRef.current?.click()}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/60 transition-all flex flex-col items-start gap-1.5 group cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center border border-indigo-500/30 group-hover:scale-105 transition-transform">
                  <FileArchive className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    CBZ / ZIP
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">Comic Archive</div>
                </div>
              </button>

              {/* 2. Open Images */}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/60 transition-all flex flex-col items-start gap-1.5 group cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-700 group-hover:scale-105 transition-transform">
                  <FolderOpen className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    Images
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">JPG, PNG, WEBP</div>
                </div>
              </button>

              {/* 3. Saved Webpage (.mht) */}
              <button
                type="button"
                onClick={() => mhtInputRef.current?.click()}
                className="p-2 sm:p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/60 transition-all flex flex-col items-start gap-1.5 group cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                title="Open saved webpage (.mht/.mhtml)"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30 group-hover:scale-105 transition-transform">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                    Webpage
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">.MHT / .MHTML</div>
                </div>
              </button>
            </div>
          </div>

          {/* Part 2: Online Sources */}
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Online Sources
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {/* 4. Search Manga Online */}
              {onOpenTitleSearch && (
                <button
                  type="button"
                  onClick={onOpenTitleSearch}
                  className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-indigo-950/70 to-slate-900 hover:from-indigo-900/80 hover:to-slate-850 border border-indigo-700/50 hover:border-indigo-500 transition-all flex flex-col items-start gap-1.5 group cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center border border-indigo-400/40 group-hover:scale-105 transition-transform">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-indigo-200 group-hover:text-white transition-colors">
                      Search
                    </div>
                    <div className="text-[9px] text-indigo-300/70 truncate">1,440+ Sites</div>
                  </div>
                </button>
              )}

              {/* 5. Import from URL */}
              {onOpenUrlImport && (
                <button
                  type="button"
                  onClick={onOpenUrlImport}
                  className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/70 to-slate-900 hover:from-emerald-900/80 hover:to-slate-850 border border-emerald-700/50 hover:border-emerald-500 transition-all flex flex-col items-start gap-1.5 group cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
                >
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center border border-emerald-400/40 group-hover:scale-105 transition-transform">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-emerald-200 group-hover:text-white transition-colors">
                      Web Link
                    </div>
                    <div className="text-[9px] text-emerald-300/70 truncate">Paste Chapter URL</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Format indicators */}
        <div className="mt-2.5 flex items-center gap-2 text-[10px] text-slate-500 font-medium">
          <span className="text-indigo-400/90">.CBZ / .ZIP</span>
          <span>•</span>
          <span className="text-amber-400/90">.MHT / .MHTML</span>
          <span>•</span>
          <span className="text-emerald-400/90">Online Webtoons &amp; Manga</span>
        </div>
      </div>
    </div>
  );
};
