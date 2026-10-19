import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  BookOpen,
  User,
  ExternalLink,
  Layers,
  ArrowRight,
  ArrowLeft,
  X,
  Play,
  Calendar,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe,
  Filter,
  Check,
  Star,
  Eye,
  Tag,
  Shield,
  ShieldAlert,
  ShieldOff,
  Zap,
  Plus,
  Trash2,
  CheckCircle2,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import {
  ComicSearchResult,
  SearchChapterItem,
  ReadingOrderMode,
  ComicSource,
  StandardizedSearchRequest,
  StandardizedSearchResponse,
  SupportedSourceEngine,
  UserSelectedSource,
} from '../types';
import {
  searchComicTitles,
  searchComicTitlesStandardized,
  fetchComicTitleChapters,
} from '../utils/webComicImporter';
import { useUserSources, isCloudflareSource } from '../utils/userSources';

interface TitleSearchTabProps {
  onLaunchChapter: (
    chapterUrl: string,
    suggestedReadingOrder?: ReadingOrderMode,
    availableChapters?: SearchChapterItem[],
    mangaTitle?: string,
    seriesUrl?: string
  ) => Promise<void>;
  onInspectInUrlTab: (url: string) => void;
  onOpenSourcesManager?: () => void;
  isDownloading: boolean;
  downloadingProgressText?: string;
  initialQuery?: string;
  initialSource?: ComicSource | null;
}

export const TitleSearchTab: React.FC<TitleSearchTabProps> = ({
  onLaunchChapter,
  onInspectInUrlTab,
  onOpenSourcesManager,
  isDownloading,
  downloadingProgressText,
  initialQuery = '',
  initialSource = null,
}) => {
  const {
    sources: userSources,
    enabledSources,
    installedMap,
    install: installUserSource,
    uninstall: uninstallUserSource,
    toggleEnabled: toggleUserSourceEnabled,
    togglePinned: toggleUserSourcePinned,
    reset: resetUserSources,
  } = useUserSources();

  const [query, setQuery] = useState(initialQuery);
  const [activeSource, setActiveSource] = useState<string>(initialSource ? initialSource.id : 'all');
  const [customSelectedSource, setCustomSelectedSource] = useState<ComicSource | null>(initialSource);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ComicSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMeta, setSearchMeta] = useState<{
    engineName?: string;
    sourceType?: string;
    latencyMs?: number;
    total?: number;
  } | null>(null);

  // Catalog Picker for 1,440+ sources
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogLang, setCatalogLang] = useState<string>('all');
  const [catalogExcludeCloudflare, setCatalogExcludeCloudflare] = useState(false);
  const [catalogSources, setCatalogSources] = useState<ComicSource[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [excludeCloudflare, setExcludeCloudflare] = useState(false);

  // Sorted user-selected sources: pinned first, then alphabetical
  const sortedUserSources = useMemo(() => {
    return [...userSources].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [userSources]);

  // Selected manga for viewing chapters
  const [selectedManga, setSelectedManga] = useState<ComicSearchResult | null>(null);
  const [chapters, setChapters] = useState<SearchChapterItem[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [chapterFilterQuery, setChapterFilterQuery] = useState('');
  const [chapterSortAsc, setChapterSortAsc] = useState(true);
  const [launchingChapterUrl, setLaunchingChapterUrl] = useState<string | null>(null);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);

  // Load catalog sources when opening the picker
  useEffect(() => {
    if (!isSourcePickerOpen || catalogSources.length > 0) return;
    setIsLoadingCatalog(true);
    fetch('/api/comic-sources?limit=100')
      .then((res) => res.json())
      .then((data) => {
        if (data?.sources) setCatalogSources(data.sources);
      })
      .catch((err) => console.warn('Failed to load sources for search picker:', err))
      .finally(() => setIsLoadingCatalog(false));
  }, [isSourcePickerOpen, catalogSources.length]);

  // Update if initialSource changes
  useEffect(() => {
    if (initialSource) {
      setCustomSelectedSource(initialSource);
      setActiveSource(initialSource.id);
    }
  }, [initialSource]);

  // Perform search across all sources or the chosen specific source using standardized interface
  const handlePerformSearch = async (
    overrideQuery?: string,
    overrideSource?: string,
    overrideCustomSource?: ComicSource | null,
    cfExcludeOverride?: boolean
  ) => {
    const q = (overrideQuery !== undefined ? overrideQuery : query).trim();
    if (!q) return;

    const source = overrideSource !== undefined ? overrideSource : activeSource;
    const targetCustom = overrideCustomSource !== undefined ? overrideCustomSource : customSelectedSource;
    const isExcludeCF = cfExcludeOverride !== undefined ? cfExcludeOverride : excludeCloudflare;

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    setSelectedManga(null);
    setChapters([]);

    // Construct StandardizedSearchRequest
    let targetEngine: SupportedSourceEngine | undefined = undefined;
    let targetBaseUrl = targetCustom?.baseUrl;
    let targetSourceName = targetCustom?.name;

    if (source === 'all') {
      targetEngine = 'all';
    } else {
      const userSrc = userSources.find((s) => s.id === source);
      if (userSrc) {
        targetEngine = userSrc.engine;
        targetBaseUrl = userSrc.baseUrl;
        targetSourceName = userSrc.name;
      }
    }

    const activeSourcesToUse = isExcludeCF
      ? enabledSources.filter((s) => !isCloudflareSource(s))
      : enabledSources;

    const standardizedReq: StandardizedSearchRequest = {
      query: q,
      sourceId: source,
      sourceEngine: targetEngine,
      baseUrl: targetBaseUrl,
      sourceName: targetSourceName,
      selectedSources: source === 'all' ? activeSourcesToUse : undefined,
    };

    try {
      const response: StandardizedSearchResponse = await searchComicTitlesStandardized(standardizedReq);
      setResults(response.results || []);
      setSearchMeta(
        response.engineInfo
          ? { ...response.engineInfo, total: response.total }
          : { engineName: source === 'all' ? `My Sources (${activeSourcesToUse.length}${isExcludeCF ? ' • CF-Free' : ''})` : targetSourceName || source, total: response.total }
      );
    } catch (err: any) {
      console.error('Standardized title search failed:', err);
      setSearchError(err?.message || 'Failed to search across comic sources. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Select a source from 1,440+ catalog
  const handleSelectCatalogSource = (source: ComicSource) => {
    setCustomSelectedSource(source);
    setActiveSource(source.id);
    setIsSourcePickerOpen(false);
    if (query.trim()) {
      handlePerformSearch(query, source.id, source);
    }
  };

  // Clear custom source back to 'all'
  const handleClearCustomSource = () => {
    setCustomSelectedSource(null);
    setActiveSource('all');
    if (query.trim()) {
      handlePerformSearch(query, 'all', null);
    }
  };

  // Open chapters for a selected manga
  const handleSelectManga = async (manga: ComicSearchResult) => {
    setSelectedManga(manga);
    setChapters([]);
    setChapterError(null);
    setIsLoadingChapters(true);
    setChapterFilterQuery('');

    try {
      const chs = await fetchComicTitleChapters(manga.source, manga.id, manga.sourceUrl);
      setChapters(chs);
    } catch (err: any) {
      console.error('Failed to load chapters:', err);
      setChapterError(err?.message || 'Failed to load chapter list from this source.');
    } finally {
      setIsLoadingChapters(false);
    }
  };

  // Quick launch first chapter of a manga
  const handleQuickLaunch = async (manga: ComicSearchResult) => {
    setSelectedManga(manga);
    setIsLoadingChapters(true);
    setChapterError(null);

    try {
      const chs = await fetchComicTitleChapters(manga.source, manga.id, manga.sourceUrl);
      setChapters(chs);
      if (chs.length > 0) {
        const firstCh = chs[0];
        handleLaunchChapter(firstCh.url, manga.source, chs, manga);
      } else {
        setChapterError('No chapters found for this title.');
      }
    } catch (err: any) {
      console.error('Quick launch error:', err);
      setChapterError(err?.message || 'Failed to quick launch chapter.');
    } finally {
      setIsLoadingChapters(false);
    }
  };

  // Launch a chapter into reader
  const handleLaunchChapter = async (
    chapterUrl: string,
    sourceName?: string,
    overrideChapters?: SearchChapterItem[],
    overrideManga?: ComicSearchResult | null
  ) => {
    setLaunchingChapterUrl(chapterUrl);
    try {
      const targetManga = overrideManga !== undefined ? overrideManga : selectedManga;
      const chList = overrideChapters || chapters;
      const lowerSource = (sourceName || targetManga?.source || '').toLowerCase();
      const suggestedOrder: ReadingOrderMode =
        lowerSource.includes('webtoon') || lowerSource.includes('asura') || lowerSource.includes('flame')
          ? 'manhwa-vertical'
          : 'manga-rtl';
      await onLaunchChapter(chapterUrl, suggestedOrder, chList, targetManga?.title, targetManga?.sourceUrl);
    } catch (err: any) {
      console.error('Launch failed:', err);
      setChapterError(err?.message || 'Failed to launch chapter in reader.');
    } finally {
      setLaunchingChapterUrl(null);
    }
  };

  // Filtered & sorted chapters
  const filteredChapters = useMemo(() => {
    let list = [...chapters];
    if (chapterFilterQuery.trim()) {
      const q = chapterFilterQuery.toLowerCase().trim();
      list = list.filter(
        (ch) => ch.number.includes(q) || ch.title.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const na = parseFloat(a.number) || 0;
      const nb = parseFloat(b.number) || 0;
      return chapterSortAsc ? na - nb : nb - na;
    });
    return list;
  }, [chapters, chapterFilterQuery, chapterSortAsc]);

  const getSourceBadgeStyle = (src: string) => {
    const s = src.toLowerCase();
    if (s.includes('mangadex')) return 'bg-amber-950/80 text-amber-300 border-amber-800';
    if (s.includes('webtoon')) return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
    if (s.includes('asura')) return 'bg-sky-950/80 text-sky-300 border-sky-800';
    if (s.includes('bato')) return 'bg-rose-950/80 text-rose-300 border-rose-800';
    if (s.includes('flame')) return 'bg-orange-950/80 text-orange-300 border-orange-800';
    return 'bg-indigo-950/80 text-indigo-300 border-indigo-800';
  };

  return (
    <div className="flex flex-col h-full text-slate-200 overflow-hidden">
      {/* Top Search & Source Filter Bar (Ultra-Compact, 3 Rows on Mobile) */}
      <div className="px-3 sm:px-5 py-2 sm:py-2.5 border-b border-slate-800 bg-slate-900/80 space-y-2 shrink-0">
        {/* Row 1: Search Input Box, Search Button & No CF Toggle */}
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSearching) {
                  handlePerformSearch();
                }
              }}
              placeholder={
                customSelectedSource
                  ? `Search inside ${customSelectedSource.name}...`
                  : 'Search titles across all active sources...'
              }
              aria-label="Search manga titles"
              disabled={isSearching || isDownloading}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition disabled:opacity-60"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setHasSearched(false);
                  setSelectedManga(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handlePerformSearch()}
            disabled={isSearching || isDownloading || !query.trim()}
            className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Searching</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !excludeCloudflare;
              setExcludeCloudflare(next);
              if (query.trim()) {
                handlePerformSearch(query, activeSource, customSelectedSource, next);
              }
            }}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 cursor-pointer text-xs shrink-0 ${
              excludeCloudflare
                ? 'border-amber-500/80 bg-amber-950/80 text-amber-300'
                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
            title="Exclude Cloudflare-protected sites"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">No CF</span>
          </button>
        </div>

        {/* Row 2: Source Selection & Quick Filters */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider hidden xs:inline">
              Target:
            </span>
            
            {customSelectedSource ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-950/80 border border-indigo-700/80 text-indigo-200 text-[10px] font-bold shadow-xs">
                <Globe className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{customSelectedSource.name}</span>
                <button
                  type="button"
                  onClick={handleClearCustomSource}
                  className="p-0.5 hover:bg-indigo-900 rounded-full text-indigo-400 hover:text-white transition cursor-pointer"
                  title="Clear source filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveSource('all');
                  if (query.trim()) handlePerformSearch(query, 'all', null);
                }}
                className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeSource === 'all'
                    ? 'border-indigo-500 bg-indigo-950/90 text-indigo-300 shadow-xs'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>All Active Sources</span>
                <span className="bg-slate-900 px-1 py-0.2 rounded text-[9px] font-mono">{enabledSources.length}</span>
              </button>
            )}

            {!customSelectedSource && sortedUserSources.slice(0, 3).map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => {
                  setActiveSource(source.id);
                  if (query.trim()) handlePerformSearch(query, source.id, null);
                }}
                className={`px-3 py-1.5 rounded-full border text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                  activeSource === source.id
                    ? 'border-indigo-500 bg-indigo-950 text-indigo-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                {source.isPinned && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                <span>{source.name}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={onOpenSourcesManager}
              className="px-3 py-1.5 rounded-full border border-dashed border-slate-700 bg-slate-900 text-slate-400 hover:text-indigo-300 hover:border-indigo-700 transition flex items-center gap-2 text-xs font-bold cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>More Sources</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 sm:py-5">
        {/* Error banner */}
        {searchError && (
          <div className="mb-4 p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{searchError}</p>
              <p className="text-[11px] text-rose-400 pt-0.5">
                Tip: You can also switch to the &quot;Import Link&quot; tab to directly paste a chapter URL.
              </p>
            </div>
          </div>
        )}

        {/* View Mode 1: Selected Title Chapter Browser */}
        {selectedManga ? (
          <div className="space-y-6 animate-fadeIn pb-10">
            {/* Minimal Header */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedManga(null)}
                className="text-xs font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-1.5 transition group cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span>Return to Results</span>
              </button>

              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest border ${getSourceBadgeStyle(selectedManga.source)}`}>
                  {selectedManga.source}
                </span>
                <a
                  href={selectedManga.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
                  title="Source Link"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Title Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
              <div className="w-32 h-48 sm:w-40 sm:h-60 rounded-2xl overflow-hidden shrink-0 bg-slate-900 border border-slate-800 shadow-2xl relative mx-auto md:mx-0">
                {selectedManga.coverUrl ? (
                  <img
                    src={selectedManga.coverUrl}
                    alt={selectedManga.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900">
                    <BookOpen className="w-12 h-12 text-slate-800" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
              </div>

              <div className="space-y-4 text-center md:text-left min-w-0">
                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-100 leading-tight">
                    {selectedManga.title}
                  </h3>
                  {selectedManga.authors && selectedManga.authors.length > 0 && (
                    <p className="text-sm font-medium text-slate-400 flex items-center justify-center md:justify-start gap-1.5">
                      <User className="w-4 h-4 text-slate-600" />
                      {selectedManga.authors.join(', ')}
                    </p>
                  )}
                </div>

                {selectedManga.synopsis && (
                  <p className="text-xs sm:text-sm text-slate-400 line-clamp-3 md:line-clamp-4 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                    {selectedManga.synopsis}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-900/40">
                    Online Feed
                  </span>
                  {selectedManga.status && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedManga.status}
                    </span>
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-indigo-950/40 text-indigo-400 border border-indigo-900/40">
                    {chapters.length} Chapters
                  </span>
                </div>
              </div>
            </div>

            {/* Chapters Feed Container */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Chapter Feed
                </h4>
                
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <input
                      type="text"
                      value={chapterFilterQuery}
                      onChange={(e) => setChapterFilterQuery(e.target.value)}
                      placeholder="Filter by #"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setChapterSortAsc(!chapterSortAsc)}
                    className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-400 transition"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isLoadingChapters ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Fetching Panels...</span>
                </div>
              ) : chapterError ? (
                <div className="p-6 bg-rose-950/20 border border-rose-900/30 rounded-2xl text-center space-y-4">
                  <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-rose-200">{chapterError}</p>
                    <p className="text-xs text-rose-400">The source website might be experiencing issues or protection.</p>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectManga(selectedManga)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-900/20"
                    >
                      Retry Feed
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredChapters.length === 0 ? (
                    <div className="py-12 col-span-full text-center text-slate-600 font-bold text-xs uppercase tracking-widest">
                      No matching chapters found
                    </div>
                  ) : (
                    filteredChapters.map((ch) => (
                      <button
                        key={ch.id || ch.url}
                        onClick={() => handleLaunchChapter(ch.url, ch.source)}
                        disabled={isDownloading || launchingChapterUrl === ch.url}
                        className="group relative flex items-center justify-between p-3.5 bg-slate-950/40 hover:bg-indigo-600 border border-slate-800 hover:border-indigo-500 rounded-xl transition-all duration-300 text-left disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-indigo-400 group-hover:text-white transition-colors">
                              #{ch.number}
                            </span>
                            <span className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors truncate">
                              {ch.title || `Chapter ${ch.number}`}
                            </span>
                          </div>
                          {ch.releaseDate && (
                            <span className="text-[10px] text-slate-500 group-hover:text-indigo-200 font-medium pt-0.5 block">
                              {ch.releaseDate}
                            </span>
                          )}
                        </div>
                        
                        <div className="ml-3 p-1.5 rounded-lg bg-slate-900 group-hover:bg-indigo-500 text-slate-500 group-hover:text-white transition-colors">
                          {launchingChapterUrl === ch.url ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 fill-current" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* View Mode 2: Search Results Grid / Initial Discovery View */
          <div>
            {isSearching ? (
              /* Loading Skeletons */
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <span className="text-sm font-semibold text-slate-300">
                  {customSelectedSource
                    ? `Searching inside ${customSelectedSource.name}...`
                    : 'Searching across MangaDex, Webtoons, Asura, Bato & Flame...'}
                </span>
                <span className="text-xs text-slate-500">
                  Executing parallel multi-source requests & extracting comic cards
                </span>
              </div>
            ) : hasSearched ? (
              /* Search Results */
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-200">
                      Found {results.length} titles matching &quot;{query}&quot;
                      {customSelectedSource && (
                        <span className="ml-1 text-indigo-300">on {customSelectedSource.name}</span>
                      )}
                    </span>
                    {searchMeta?.engineName && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/80 text-slate-300 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>Parsed via {searchMeta.engineName}</span>
                        {searchMeta.latencyMs !== undefined && (
                          <span className="text-slate-500">• {searchMeta.latencyMs}ms</span>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-500 text-[11px] hidden sm:inline">
                    Site-specific schema parsed
                  </span>
                </div>

                {results.length === 0 ? (
                  <div className="py-12 text-center space-y-4 max-w-md mx-auto">
                    <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-300">
                        No comic titles found matching &quot;{query}&quot;
                        {customSelectedSource && (
                          <span className="text-indigo-300"> on {customSelectedSource.name}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {customSelectedSource
                          ? `This title might not be hosted on ${customSelectedSource.name}. Try querying across all repositories or check spelling.`
                          : 'Try searching with fewer words, selecting a different source from the catalog, or switch to "Import Link" to paste a direct URL.'}
                      </p>
                    </div>

                    {customSelectedSource && (
                      <button
                        type="button"
                        onClick={() => {
                          handleClearCustomSource();
                          handlePerformSearch(query, 'all', null);
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Search &quot;{query}&quot; in All Sources (Global)</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {results.map((manga) => (
                      <div
                        key={`${manga.source}-${manga.id}`}
                        onClick={() => handleSelectManga(manga)}
                        className="group flex flex-col bg-slate-950/50 hover:bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer shadow-lg hover:shadow-indigo-900/10"
                      >
                        {/* Thumbnail Cover Image */}
                        <div className="aspect-[3/4] relative overflow-hidden bg-slate-900">
                          {manga.coverUrl ? (
                            <img
                              src={manga.coverUrl}
                              alt={manga.title}
                              className="w-full h-full object-cover transition duration-500 group-hover:scale-110"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const imgEl = e.target as HTMLElement;
                                imgEl.style.display = 'none';
                                const parent = imgEl.parentElement;
                                if (parent) {
                                  const fallback = document.createElement('div');
                                  fallback.className = 'w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-900 text-slate-600';
                                  fallback.innerHTML = `<svg class="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>`;
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-900">
                              <BookOpen className="w-12 h-12 text-slate-700" />
                            </div>
                          )}
                          
                          {/* Overlay Gradient */}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                          
                          {/* Source Badge (Top Left) */}
                          <div className="absolute top-2 left-2">
                            <span className={`text-[10px] px-2 py-1 rounded-lg font-black uppercase tracking-widest border backdrop-blur-md shadow-lg ${getSourceBadgeStyle(manga.source)}`}>
                              {manga.source}
                            </span>
                          </div>

                          {/* Quick Stats (Top Right) */}
                          <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                            {manga.rating && (
                              <div className="bg-amber-500/90 backdrop-blur-md text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                                <Star className="w-2.5 h-2.5 fill-white" />
                                {manga.rating}
                              </div>
                            )}
                            {manga.status && (
                              <div className="bg-slate-900/80 backdrop-blur-md text-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-tighter border border-slate-700">
                                {manga.status}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Title Info */}
                        <div className="p-3.5 space-y-2">
                          <h3 className="text-sm font-bold text-slate-100 line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors">
                            {manga.title}
                          </h3>
                          
                          {manga.latestChapter && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500 font-medium">Latest:</span>
                              <span className="text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/50">
                                {manga.latestChapter}
                              </span>
                            </div>
                          )}

                          <div className="pt-2 flex items-center justify-between gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickLaunch(manga);
                              }}
                              className="flex-1 bg-slate-900 hover:bg-indigo-600 text-slate-300 hover:text-white text-[11px] font-bold py-1.5 rounded-lg border border-slate-800 hover:border-indigo-500 transition-all flex items-center justify-center gap-1.5"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Read First</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectManga(manga);
                              }}
                              className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800 transition-colors"
                              title="View Chapters"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Discovery / Initial Screen - Tachiyomi / Mihon Selected Sources Hub */
              <div className="py-5 space-y-6">
                {/* Hero Header */}
                <div className="p-5 bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-950 border border-indigo-800/60 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Tachiyomi &amp; Mihon Multi-Source Architecture</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-100">
                      Select which sources you prefer to use and search them seamlessly
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Just like Tachiyomi &amp; Mihon extensions, you choose your favorite reading sources. Query your active sources simultaneously or search inside a single website catalog.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => (onOpenSourcesManager ? onOpenSourcesManager() : setIsSourcePickerOpen(true))}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-900/30 transition flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Select Sources (1,440+)</span>
                    </button>
                    {userSources.length === 0 && (
                      <button
                        type="button"
                        onClick={resetUserSources}
                        className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                      >
                        Load Recommended
                      </button>
                    )}
                  </div>
                </div>

                {/* Selected Sources Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-200">
                        My Preferred Sources ({userSources.length})
                      </h4>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900 text-emerald-400 border border-slate-800 font-medium">
                        {enabledSources.length} enabled for multi-search
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => (onOpenSourcesManager ? onOpenSourcesManager() : setIsSourcePickerOpen(true))}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add from 1,440+ Directory</span>
                      </button>
                      {userSources.length > 0 && (
                        <button
                          type="button"
                          onClick={resetUserSources}
                          className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1 transition cursor-pointer ml-2"
                          title="Reset to recommended starter sources"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {userSources.length === 0 ? (
                    /* Empty State when user removed all sources */
                    <div className="p-8 text-center bg-slate-950/60 border border-dashed border-slate-800 rounded-2xl space-y-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-800/80 flex items-center justify-center mx-auto text-indigo-400">
                        <Compass className="w-6 h-6" />
                      </div>
                      <div className="max-w-md mx-auto space-y-1">
                        <h4 className="font-bold text-slate-200 text-sm">No Sources Selected Yet</h4>
                        <p className="text-xs text-slate-400">
                          In Tachiyomi and Mihon, you select the specific extensions you want to search. Choose your preferred sites from our 1,440+ verified catalog.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => (onOpenSourcesManager ? onOpenSourcesManager() : setIsSourcePickerOpen(true))}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Browse 1,440+ Extensions</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetUserSources}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition cursor-pointer"
                        >
                          Load Starter Pack
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Grid of User-Selected Sources */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {sortedUserSources.map((source) => (
                        <div
                          key={source.id}
                          className={`bg-slate-950/70 border ${
                            source.enabled ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-60'
                          } rounded-xl p-3.5 transition flex flex-col justify-between gap-3 group relative`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <h5 className="font-bold text-xs text-slate-200 truncate group-hover:text-indigo-300 transition">
                                  {source.name}
                                </h5>
                                {source.isPinned && (
                                  <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                                )}
                              </div>
                              <a
                                href={source.baseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-slate-400 hover:text-indigo-300 truncate block mt-0.5"
                              >
                                {source.baseUrl.replace(/^https?:\/\//, '')}
                              </a>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleUserSourcePinned(source.id)}
                              className={`p-1 rounded hover:bg-slate-800 transition cursor-pointer ${
                                source.isPinned ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                              }`}
                              title={source.isPinned ? 'Unpin from search bar' : 'Pin to front of search bar'}
                            >
                              <Star className={`w-3.5 h-3.5 ${source.isPinned ? 'fill-amber-400' : ''}`} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] pt-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 border border-slate-800">
                                {source.lang || 'all'}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-900/60">
                                {source.engine || 'extension'}
                              </span>
                              {isCloudflareSource(source) ? (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 flex items-center gap-0.5"
                                  title="Cloudflare Protected (anti-bot security)"
                                >
                                  <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                                  <span>CF</span>
                                </span>
                              ) : (
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-0.5"
                                  title="Direct Web Access (Cloudflare-Free)"
                                >
                                  <Zap className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>Direct</span>
                                </span>
                              )}
                            </div>

                            {/* Active Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => toggleUserSourceEnabled(source.id)}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition flex items-center gap-1 cursor-pointer ${
                                source.enabled
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900'
                                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
                              }`}
                              title={source.enabled ? 'Included in multi-source searches' : 'Disabled for searches (click to enable)'}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${source.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                              <span>{source.enabled ? 'Active' : 'Off'}</span>
                            </button>
                          </div>

                          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSource(source.id);
                                setCustomSelectedSource(null);
                                if (query.trim()) {
                                  handlePerformSearch(query, source.id, null);
                                }
                              }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Search className="w-3 h-3" />
                              <span>Search in Site</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => uninstallUserSource(source.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition cursor-pointer"
                              title="Remove from my preferred sources"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add More Sources Card */}
                      <button
                        type="button"
                        onClick={() => (onOpenSourcesManager ? onOpenSourcesManager() : setIsSourcePickerOpen(true))}
                        className="bg-slate-950/40 hover:bg-slate-900/60 border border-dashed border-indigo-800/60 hover:border-indigo-600 rounded-xl p-4 transition flex flex-col items-center justify-center gap-2 text-center group cursor-pointer min-h-[120px]"
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-950 border border-indigo-700/80 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition">
                          <Plus className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-indigo-300 group-hover:text-indigo-200">
                            Add More Sources
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Choose from 1,440+ verified extensions
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Popular Starter Searches */}
                <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick Starter Titles (Click to Search Across Active Sources):</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      'Solo Leveling',
                      'Omniscient Reader',
                      'Tower of God',
                      'Eleceed',
                      'Wind Breaker',
                      'Lookism',
                      'One Piece',
                      'Chainsaw Man',
                      'Jujutsu Kaisen',
                      'The Beginning After the End',
                    ].map((title) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => {
                          setQuery(title);
                          handlePerformSearch(title, activeSource, customSelectedSource);
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-indigo-950 hover:text-indigo-300 border border-slate-800 hover:border-indigo-700/80 rounded-lg text-xs text-slate-300 transition cursor-pointer"
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1,440+ Source Picker Modal Drawer */}
      {isSourcePickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col w-full h-full overflow-hidden animate-fadeIn">
          <div className="bg-slate-900 border-b border-slate-800 flex flex-col w-full h-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-inner text-white shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                    Select &amp; Manage Comic Sources
                    <span className="text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                      1,440+ Extensions Catalog
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Select which sources to include in search • <strong className="text-emerald-400">{userSources.length}</strong> selected in My Sources
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSourcePickerOpen(false)}
                className="px-3 py-1.5 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-sm"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>

            {/* Filter and Language Selector */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Filter sources by name or URL (e.g. MangaDex, Webtoons, Asura, Reaper, Bato)..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
                />
              </div>

              {/* Language Pills and Cloudflare Filter */}
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-400 text-[11px] mr-1">Language:</span>
                  {['all', 'en', 'ja', 'ko', 'es', 'fr', 'id'].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setCatalogLang(lang)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] uppercase font-semibold transition cursor-pointer ${
                        catalogLang === lang
                          ? 'bg-indigo-600 text-white shadow-sm font-bold'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCatalogExcludeCloudflare(!catalogExcludeCloudflare)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border ${
                    catalogExcludeCloudflare
                      ? 'bg-amber-950/80 text-amber-200 border-amber-500 shadow-sm font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                  title="Filter out Cloudflare-protected sites"
                >
                  <ShieldOff className={`w-3.5 h-3.5 ${catalogExcludeCloudflare ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>{catalogExcludeCloudflare ? 'Excluding Cloudflare' : 'Exclude Cloudflare'}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {isLoadingCatalog ? (
                <div className="col-span-full py-16 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <span>Loading extension catalog...</span>
                </div>
              ) : (
                catalogSources
                  .filter((s) => {
                    if (catalogExcludeCloudflare && isCloudflareSource(s)) {
                      return false;
                    }
                    if (catalogLang !== 'all' && s.lang && s.lang !== catalogLang && s.lang !== 'all') {
                      return false;
                    }
                    if (!catalogSearch.trim()) return true;
                    const q = catalogSearch.toLowerCase();
                    return s.name.toLowerCase().includes(q) || s.baseUrl.toLowerCase().includes(q);
                  })
                  .slice(0, 100)
                  .map((s) => {
                    const isInstalled = !!installedMap[s.id];
                    return (
                      <div
                        key={s.id}
                        className={`w-full p-2.5 bg-slate-950/70 hover:bg-slate-850 border ${
                          isInstalled ? 'border-emerald-800/80 bg-emerald-950/10' : 'border-slate-800'
                        } rounded-xl text-left flex items-center justify-between gap-3 transition group`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                            {s.icon ? (
                              <img src={s.icon} alt={s.name} className="w-full h-full object-contain" />
                            ) : (
                              <BookOpen className="w-4 h-4 text-indigo-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 truncate">
                                {s.name}
                              </h4>
                              {isInstalled && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-semibold flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Selected</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{s.baseUrl}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                            {s.lang}
                          </span>

                          {isCloudflareSource(s) ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 flex items-center gap-0.5" title="Cloudflare Protected">
                              <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                              <span>CF</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-0.5" title="Direct Web Access (No Cloudflare)">
                              <Zap className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Direct</span>
                            </span>
                          )}

                          {/* Quick Select / Add Toggle Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isInstalled) {
                                uninstallUserSource(s.id);
                              } else {
                                installUserSource(s);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                              isInstalled
                                ? 'bg-emerald-950 text-emerald-300 hover:bg-rose-950 hover:text-rose-300 border border-emerald-700/80 hover:border-rose-700'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                            }`}
                            title={isInstalled ? 'Remove from my sources' : 'Add to my preferred sources'}
                          >
                            {isInstalled ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>Select</span>
                              </>
                            )}
                          </button>

                          {/* Search In Source Action */}
                          <button
                            type="button"
                            onClick={() => handleSelectCatalogSource(s)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Search inside this source now"
                          >
                            <ArrowRight className="w-4 h-4 text-indigo-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Downloading Banner if active */}
      {isDownloading && downloadingProgressText && (
        <div className="px-5 py-3 border-t border-indigo-900/60 bg-indigo-950/80 flex items-center justify-between text-xs text-indigo-200 shrink-0">
          <div className="flex items-center gap-2 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>{downloadingProgressText}</span>
          </div>
          <span className="text-[11px] text-indigo-300">
            Preparing panels for comic reader...
          </span>
        </div>
      )}
    </div>
  );
};
