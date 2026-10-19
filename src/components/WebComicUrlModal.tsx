import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  X,
  ArrowRight,
  AlertCircle,
  BookOpen,
  User,
  Layers,
  ExternalLink,
  Download,
  Compass,
  Link2,
  Star,
  Search,
  Maximize2,
  Minimize2,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchWebComicMetadata,
  downloadWebComicPages,
  buildWebComicChapter,
  WebComicDownloadProgress,
} from '../utils/webComicImporter';
import { ComicChapter, ComicPage, ReadingOrderMode, WebComicImportResult, ComicSource, SearchChapterItem } from '../types';
import { SupportedSourcesModal } from './SupportedSourcesModal';
import { TitleSearchTab } from './TitleSearchTab';
import { useUserSources } from '../utils/userSources';

interface WebComicUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChapterLoaded: (chapter: ComicChapter, suggestedReadingOrder?: ReadingOrderMode) => void;
  initialTab?: 'search' | 'import' | 'sources';
  initialSearchQuery?: string;
  initialSearchSource?: ComicSource | null;
}

export const WebComicUrlModal: React.FC<WebComicUrlModalProps> = ({
  isOpen,
  onClose,
  onChapterLoaded,
  initialTab = 'search',
  initialSearchQuery = '',
  initialSearchSource = null,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'import' | 'sources'>(initialTab);
  const [url, setUrl] = useState('');
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [metaResult, setMetaResult] = useState<WebComicImportResult | null>(null);
  const [readingOrder, setReadingOrder] = useState<ReadingOrderMode>('manhwa-vertical');
  const [downloadScope, setDownloadScope] = useState<'all' | 'sample15' | 'custom'>('all');
  const [customRange, setCustomRange] = useState({ start: 1, end: 20 });
  const [downloadProgress, setDownloadProgress] = useState<WebComicDownloadProgress | null>(null);
  const [searchTargetSource, setSearchTargetSource] = useState<ComicSource | null>(initialSearchSource);
  const [isFullPage, setIsFullPage] = useState<boolean>(true);
  const { sources: userSources, enabledSources } = useUserSources();

  const [pinnedSources, setPinnedSources] = useState<Array<{ name: string; url: string }>>(() => {
    try {
      const saved = localStorage.getItem('comic_pinned_sources');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { name: 'Webtoons', url: 'https://www.webtoons.com' },
      { name: 'Toonily', url: 'https://toonily.com' },
      { name: 'MangaFire', url: 'https://mangafire.to' },
      { name: 'MangaFreak', url: 'https://ww3.mangafreak.me' },
      { name: 'MangaHere', url: 'https://www.mangahere.cc' },
      { name: 'Asura Scans', url: 'https://asurascans.com' },
      { name: 'Flame Comics', url: 'https://flamecomics.xyz' },
      { name: 'MangaDex', url: 'https://mangadex.org' },
      { name: 'AllPornComic', url: 'https://allporncomic.com' },
      { name: 'NHentai', url: 'https://nhentai.net' },
      { name: 'Omega Scans', url: 'https://omegascans.org' },
      { name: 'WebtoonXYZ', url: 'https://www.webtoon.xyz' },
      { name: 'ToonGod', url: 'https://www.toongod.org' },
      { name: 'Simply Hentai', url: 'https://www.simply-hentai.com' },
      { name: '18PornComic', url: 'https://18porncomic.com' },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('comic_pinned_sources', JSON.stringify(pinnedSources));
    } catch {}
  }, [pinnedSources]);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDownloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDownloading, onClose]);

  if (!isOpen) return null;

  const handleFetchInfo = async (targetUrl?: string) => {
    const inputUrl = (targetUrl || url).trim();
    if (!inputUrl) {
      setFetchError('Please paste or enter a valid web link.');
      return;
    }

    setIsFetchingInfo(true);
    setFetchError(null);
    setMetaResult(null);

    try {
      const data = await fetchWebComicMetadata(inputUrl);
      setMetaResult(data);
      if (data.readingOrder) {
        setReadingOrder(data.readingOrder);
      }
      setCustomRange({ start: 1, end: Math.min(25, data.pageCount) });
    } catch (err: any) {
      console.error('Fetch web comic error:', err);
      setFetchError(err?.message || 'Failed to fetch episode info from the provided URL.');
    } finally {
      setIsFetchingInfo(false);
    }
  };

  const handleStartImport = async () => {
    if (!metaResult || metaResult.pages.length === 0) return;

    let targetPages = metaResult.pages;
    if (downloadScope === 'sample15') {
      targetPages = metaResult.pages.slice(0, 15);
    } else if (downloadScope === 'custom') {
      const startIdx = Math.max(0, customRange.start - 1);
      const endIdx = Math.min(metaResult.pages.length, customRange.end);
      targetPages = metaResult.pages.slice(startIdx, endIdx);
    }

    if (targetPages.length === 0) {
      setFetchError('No pages selected in the specified range.');
      return;
    }

    setIsDownloading(true);
    setFetchError(null);
    setDownloadProgress({
      current: 0,
      total: targetPages.length,
      percent: 0,
      statusText: `Preparing to download ${targetPages.length} panels...`,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const downloadedPages: ComicPage[] = await downloadWebComicPages(
        targetPages,
        (progress) => setDownloadProgress(progress),
        controller.signal
      );

      if (downloadedPages.length === 0) {
        throw new Error('No images could be retrieved.');
      }

      const chapter = buildWebComicChapter(metaResult, downloadedPages);
      onChapterLoaded(chapter, readingOrder);
      onClose();
    } catch (err: any) {
      if (controller.signal.aborted) {
        setFetchError('Download was cancelled.');
      } else {
        console.error('Download error:', err);
        setFetchError(err?.message || 'Failed to download comic panels.');
      }
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        setUrl(text.trim());
        handleFetchInfo(text.trim());
      }
    } catch {
      // ignore
    }
  };

  const handleSelectSource = (source: ComicSource) => {
    setUrl(source.baseUrl);
    setActiveTab('import');
    setFetchError(null);
  };

  const handleSearchInSource = (source: ComicSource) => {
    setSearchTargetSource(source);
    setActiveTab('search');
    setFetchError(null);
  };

  const handleInspectInUrlTab = (targetUrl: string) => {
    setUrl(targetUrl);
    setActiveTab('import');
    handleFetchInfo(targetUrl);
  };

  const handleLaunchChapterFromSearch = async (
    chapterUrl: string,
    suggestedOrder?: ReadingOrderMode,
    availableChapters?: SearchChapterItem[],
    mangaTitle?: string,
    seriesUrl?: string
  ) => {
    setIsDownloading(true);
    setFetchError(null);
    setDownloadProgress({
      current: 0,
      total: 1,
      percent: 0,
      statusText: 'Resolving chapter panels...',
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await fetchWebComicMetadata(chapterUrl);
      setMetaResult(data);
      const chosenOrder = suggestedOrder || data.readingOrder || 'manhwa-vertical';
      setReadingOrder(chosenOrder);

      setDownloadProgress({
        current: 0,
        total: data.pages.length,
        percent: 0,
        statusText: `Downloading ${data.pages.length} panels for "${mangaTitle || data.seriesTitle || data.episodeTitle}"...`,
      });

      const downloadedPages: ComicPage[] = await downloadWebComicPages(
        data.pages,
        (progress) => setDownloadProgress(progress),
        controller.signal
      );

      if (downloadedPages.length === 0) {
        throw new Error('No images could be retrieved.');
      }

      const mergedData: WebComicImportResult = {
        ...data,
        seriesTitle: mangaTitle || data.seriesTitle,
        availableChapters: (availableChapters && availableChapters.length > 0) ? availableChapters : data.availableChapters,
      };

      const chapter = buildWebComicChapter(mergedData, downloadedPages);
      onChapterLoaded(chapter, chosenOrder);
      onClose();
    } catch (err: any) {
      if (controller.signal.aborted) {
        setFetchError('Download was cancelled.');
      } else {
        console.error('Launch chapter error:', err);
        setFetchError(err?.message || 'Failed to download and launch comic chapter.');
        setActiveTab('import');
      }
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
    }
  };

  const isFullPageEffective = (activeTab === 'search' || activeTab === 'sources') ? isFullPage : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webcomic-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDownloading) onClose();
      }}
    >
      <div
        className="bg-slate-900 w-full h-[100dvh] sm:h-[92dvh] sm:max-w-[1200px] flex flex-col transition-all duration-200 shadow-2xl overflow-hidden sm:border sm:border-slate-700/80 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header & Unified Tab Bar (Ultra-Compact) */}
        <div className="px-3 sm:px-5 py-2 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900/95 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shadow-xs text-white shrink-0 ${
                activeTab === 'search'
                  ? 'bg-gradient-to-tr from-indigo-600 to-violet-500'
                  : activeTab === 'sources'
                  ? 'bg-gradient-to-tr from-blue-600 to-indigo-500'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-500'
              }`}
            >
              {activeTab === 'search' ? (
                <Search className="w-4 h-4" />
              ) : activeTab === 'sources' ? (
                <Compass className="w-4 h-4" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 hidden xs:block">
              <h2 id="webcomic-modal-title" className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                {activeTab === 'search'
                  ? 'Title Search'
                  : activeTab === 'sources'
                  ? 'Extensions'
                  : 'Import Link'}
              </h2>
            </div>
          </div>

          {/* Unified Tab Switcher for both mobile and desktop in the header */}
          <div
            role="tablist"
            className="flex rounded-xl bg-slate-950 border border-slate-800 p-0.5 text-xs font-medium"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'search'}
              onClick={() => setActiveTab('search')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer text-xs ${
                activeTab === 'search'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sources'}
              onClick={() => setActiveTab('sources')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer text-xs ${
                activeTab === 'sources'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Sources</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'import'}
              onClick={() => setActiveTab('import')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer text-xs ${
                activeTab === 'import'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Direct </span>Link
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              disabled={isDownloading}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition disabled:opacity-40 cursor-pointer"
              title="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: In-App Title Search Across Sources */}
        {activeTab === 'search' ? (
          <TitleSearchTab
            onLaunchChapter={handleLaunchChapterFromSearch}
            onInspectInUrlTab={handleInspectInUrlTab}
            onOpenSourcesManager={() => setActiveTab('sources')}
            isDownloading={isDownloading}
            downloadingProgressText={downloadProgress?.statusText}
            initialQuery={initialSearchQuery}
            initialSource={searchTargetSource}
          />
        ) : activeTab === 'sources' ? (
          /* Tab 2: Embedded Sources Directory */
          <div className="flex-1 overflow-hidden">
            <SupportedSourcesModal
              isOpen={true}
              onClose={onClose}
              embedded={true}
              onSelectSource={handleSelectSource}
              onSearchInSource={handleSearchInSource}
            />
          </div>
        ) : (
          /* Tab 3: Direct Import by Link */
          <>
            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-200">
              {/* Quick Prompt to explore sources */}
              <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-indigo-300">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  Looking for manga or webtoon sites? Explore our 1,440+ unique website catalog.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('sources')}
                  className="font-bold underline hover:text-white transition cursor-pointer shrink-0 ml-2"
                >
                  Browse Sources →
                </button>
              </div>

              {/* Pinned Favorite Sources Section */}
              <div className="space-y-2 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    Pinned Favorite Sources
                  </span>
                  <span className="text-[11px] text-slate-400">
                    One-click import navigation
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {pinnedSources.map((source) => (
                    <button
                      key={source.url}
                      type="button"
                      onClick={() => setUrl(source.url)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:border-amber-500/80 hover:bg-slate-800 text-slate-200 transition flex items-center gap-1.5 cursor-pointer shadow-sm group"
                      title={`Click to set URL to ${source.name}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-400 group-hover:scale-125 transition" />
                      <span className="font-semibold">{source.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* URL Input Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Website Episode URL</span>
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="text-[11px] font-normal text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                  >
                    Paste from Clipboard
                  </button>
                </label>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      aria-label="Website Episode URL"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isFetchingInfo && !isDownloading) {
                          handleFetchInfo();
                        }
                      }}
                      placeholder="https://asuracomic.net/... or https://novelcrow.com/... or webtoon URL"
                      disabled={isFetchingInfo || isDownloading}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition disabled:opacity-60"
                    />
                    {url && (
                      <button
                        type="button"
                        onClick={() => {
                          setUrl('');
                          setMetaResult(null);
                          setFetchError(null);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleFetchInfo()}
                    disabled={isFetchingInfo || isDownloading || !url.trim()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm rounded-xl transition shadow flex items-center gap-1.5 shrink-0 cursor-pointer"
                    title="Inspect comic link to fetch episode information"
                  >
                    {isFetchingInfo ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Inspecting...</span>
                      </>
                    ) : (
                      <>
                        <span>Inspect Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-400">
                  <span className="text-slate-500 font-semibold mr-1">Supported Engines:</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    NovelCrow
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    MangaThemesia (Asura, Flame, Reaper)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Madara (Toonily, AllPornComic, ToonGod)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Webtoons.com
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    NHentai & Simply Hentai
                  </span>
                </div>
              </div>

              {/* Error Message */}
              {fetchError && (
                <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-semibold block mb-0.5">Import Notice</span>
                      <span>{fetchError}</span>
                    </div>
                  </div>
                </div>
              )}

          {/* Download Progress Bar */}
          {isDownloading && downloadProgress && (
            <div className="p-4 bg-slate-950/80 border border-indigo-900/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-300 flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  {downloadProgress.statusText}
                </span>
                <span className="font-bold text-slate-300">{downloadProgress.percent}%</span>
              </div>

              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-200"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Downloaded {downloadProgress.current} / {downloadProgress.total} panels
                </span>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="text-rose-400 hover:text-rose-300 font-medium transition cursor-pointer"
                >
                  Cancel Download
                </button>
              </div>
            </div>
          )}

          {/* Fetched Metadata Details Card */}
          {metaResult && !isDownloading && (
            <div className="border border-slate-700 bg-slate-950/70 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded">
                      Episode Detected
                    </span>
                    {metaResult.engineName && (
                      <span className="text-[11px] font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-700/80 px-2 py-0.5 rounded">
                        {metaResult.engineName}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      {metaResult.pageCount} panels
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-100 truncate">
                    {metaResult.combinedTitle}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap">
                    {metaResult.seriesTitle && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        <strong>Series:</strong> {metaResult.seriesTitle}
                      </span>
                    )}
                    {metaResult.author && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <strong>Author:</strong> {metaResult.author}
                      </span>
                    )}
                  </div>
                </div>

                <a
                  href={metaResult.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-400 hover:text-indigo-300 flex items-center gap-1 p-1.5 rounded-lg hover:bg-slate-800 transition shrink-0"
                  title="Open source website in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">Source</span>
                </a>
              </div>

              {metaResult.synopsis && (
                <p className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg line-clamp-2 border border-slate-800">
                  {metaResult.synopsis}
                </p>
              )}

              {/* Download Options */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Panel Download Scope:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDownloadScope('all')}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        downloadScope === 'all'
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      All Panels ({metaResult.pageCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDownloadScope('sample15')}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        downloadScope === 'sample15'
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      First 15 Panels
                    </button>
                    <button
                      type="button"
                      onClick={() => setDownloadScope('custom')}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        downloadScope === 'custom'
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>
                </div>

                {downloadScope === 'custom' && (
                  <div className="flex items-center gap-2 text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Pages:</span>
                    <input
                      type="number"
                      min={1}
                      max={metaResult.pageCount}
                      value={customRange.start}
                      onChange={(e) =>
                        setCustomRange((prev) => ({
                          ...prev,
                          start: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center text-slate-100"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="number"
                      min={1}
                      max={metaResult.pageCount}
                      value={customRange.end}
                      onChange={(e) =>
                        setCustomRange((prev) => ({
                          ...prev,
                          end: Math.min(metaResult.pageCount, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center text-slate-100"
                    />
                    <span className="text-slate-500 text-[11px]">
                      ({Math.max(0, customRange.end - customRange.start + 1)} panels total)
                    </span>
                  </div>
                )}

                {/* Reading Order Selection */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Reading Order Mode:
                  </label>
                  <select
                    value={readingOrder}
                    onChange={(e) => setReadingOrder(e.target.value as ReadingOrderMode)}
                    className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="manhwa-vertical">Manhwa / Webtoon (Vertical Strip)</option>
                    <option value="manga-rtl">Manga (Right-to-Left, RTL)</option>
                    <option value="comic-ltr">Western Comic (Left-to-Right, LTR)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-medium rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>

          {metaResult && (
            <button
              type="button"
              onClick={handleStartImport}
              disabled={isDownloading}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-950 transition flex items-center gap-2 cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Downloading Panels...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-emerald-100" />
                  <span>
                    Load into Reader (
                    {downloadScope === 'all'
                      ? metaResult.pageCount
                      : downloadScope === 'sample15'
                      ? Math.min(15, metaResult.pageCount)
                      : Math.max(0, customRange.end - customRange.start + 1)}{' '}
                    panels)
                  </span>
                </>
              )}
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};
