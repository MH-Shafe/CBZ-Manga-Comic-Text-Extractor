import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  ExternalLink,
  Filter,
  Check,
  Copy,
  Sparkles,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Zap,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Plus,
  Trash2,
  Star,
  RotateCcw,
  Layers,
  Globe,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  MoreVertical,
} from 'lucide-react';
import { ComicSource, ComicSourcesResponse, SourceHealthPing } from '../types';
import { useUserSources, isCloudflareSource } from '../utils/userSources';

interface SupportedSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource?: (source: ComicSource) => void;
  onSearchInSource?: (source: ComicSource) => void;
  embedded?: boolean;
}

export const SupportedSourcesModal: React.FC<SupportedSourcesModalProps> = ({
  isOpen,
  onClose,
  onSelectSource,
  onSearchInSource,
  embedded = false,
}) => {
  const {
    sources: userSources,
    installedMap,
    install: installSource,
    uninstall: uninstallSource,
    toggleEnabled: toggleSourceEnabled,
    setAllEnabled: setAllSourcesEnabled,
    togglePinned: toggleSourcePinned,
    reset: resetSourcesToDefaults,
  } = useUserSources();

  const [viewTab, setViewTab] = useState<'installed' | 'catalog'>('installed');
  const [installedFilter, setInstalledFilter] = useState<'all' | 'active' | 'disabled' | 'pinned'>('all');
  const [search, setSearch] = useState('');
  const [selectedLang, setSelectedLang] = useState('all-langs');
  const [nsfwFilter, setNsfwFilter] = useState<'all' | 'sfw' | 'nsfw'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'updated' | 'protected' | 'no_cloudflare'>('all');
  const [excludeCloudflare, setExcludeCloudflare] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'version_desc' | 'name_asc' | 'langs_desc'>('default');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ComicSourcesResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live Ping Map: sourceId -> SourceHealthPing & isPinging
  const [pingResults, setPingResults] = useState<Record<string, SourceHealthPing>>({});
  const [pingingMap, setPingingMap] = useState<Record<string, boolean>>({});

  // Custom Source Modal State
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [customInputUrl, setCustomInputUrl] = useState('');
  const [customInputName, setCustomInputName] = useState('');
  const [customInputLang, setCustomInputLang] = useState('en');
  const [customInputError, setCustomInputError] = useState<string | null>(null);

  const handleAddCustomSource = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomInputError(null);
    let raw = customInputUrl.trim();
    if (!raw) {
      setCustomInputError('Please enter a valid website URL or domain');
      return;
    }
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = `https://${raw}`;
    }
    try {
      const parsed = new URL(raw);
      const domain = parsed.hostname.replace(/^www\./, '');
      const defaultName =
        customInputName.trim() ||
        domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      const customId = `custom_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`;

      installSource({
        id: customId,
        name: defaultName,
        baseUrl: parsed.origin,
        lang: customInputLang || 'en',
        extName: 'Custom Source',
      });

      setCustomInputUrl('');
      setCustomInputName('');
      setIsAddCustomOpen(false);
      setViewTab('installed');
    } catch {
      setCustomInputError('Invalid website URL. Please check the domain format.');
    }
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch sources when filters change (with debouncing for text search)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const timer = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedLang && selectedLang !== 'all-langs') params.set('lang', selectedLang);
      if (nsfwFilter !== 'all') params.set('nsfw', nsfwFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (excludeCloudflare) params.set('cloudflare', 'exclude');
      if (sortBy !== 'default') params.set('sort', sortBy);
      params.set('page', String(currentPage));
      params.set('limit', '32');

      fetch(`/api/comic-sources?${params.toString()}`)
        .then((res) => res.json())
        .then((resData: ComicSourcesResponse) => {
          if (isMounted && resData.success) {
            setData(resData);
          }
        })
        .catch((err) => {
          console.error('Failed to load comic sources:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, search, selectedLang, nsfwFilter, statusFilter, excludeCloudflare, sortBy, currentPage]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handleLangChange = (lang: string) => {
    setSelectedLang(lang);
    setCurrentPage(1);
  };

  const handleNsfwChange = (val: 'all' | 'sfw' | 'nsfw') => {
    setNsfwFilter(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (status: 'all' | 'online' | 'updated' | 'protected' | 'no_cloudflare') => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleToggleExcludeCloudflare = () => {
    setExcludeCloudflare((prev) => !prev);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: 'default' | 'version_desc' | 'name_asc' | 'langs_desc') => {
    setSortBy(sort);
    setCurrentPage(1);
  };

  const handleCopyLink = async (source: ComicSource, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(source.baseUrl);
      setCopiedId(source.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const renderImportStatusBanner = (ping: SourceHealthPing | undefined, isPinging: boolean) => {
    if (isPinging) {
      return (
        <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-[11px] flex items-center justify-between text-indigo-300 animate-pulse">
          <span className="flex items-center gap-1.5 font-medium">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
            <span>Testing live manga search &amp; page import capability...</span>
          </span>
        </div>
      );
    }

    if (!ping) return null;

    return (
      <div
        className={`p-2.5 rounded-lg text-[11px] border flex flex-col gap-1 transition-all ${
          ping.canImport
            ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200'
            : 'bg-rose-950/50 border-rose-800/80 text-rose-200'
        }`}
      >
        <div className="flex items-center justify-between font-bold">
          <span className="flex items-center gap-1.5">
            {ping.canImport ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span>{ping.canImport ? 'Manga Import Verified' : 'Manga Import Blocked'}</span>
          </span>
          <span className="font-mono text-[10px] bg-slate-900/80 border border-slate-700/60 px-1.5 py-0.5 rounded text-slate-300">
            {ping.latencyMs}ms
          </span>
        </div>

        <p className="text-[10px] leading-tight text-slate-300 font-medium">
          {ping.importStatusText || ping.statusText}
        </p>

        {ping.sampleTitle && (
          <div className="text-[10px] text-slate-400 truncate pt-1 mt-0.5 border-t border-slate-800/60 flex items-center justify-between">
            <span className="truncate">
              Tested: <strong className="text-slate-100">{ping.sampleTitle}</strong>
            </span>
            {typeof ping.samplePageCount === 'number' && (
              <span className="shrink-0 text-emerald-400 font-mono font-bold ml-1 bg-emerald-950 px-1 rounded border border-emerald-800">
                {ping.samplePageCount} pgs
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const handlePingSource = async (source: ComicSource, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (pingingMap[source.id]) return;

    setPingingMap((prev) => ({ ...prev, [source.id]: true }));
    try {
      const res = await fetch(
        `/api/ping-source?url=${encodeURIComponent(source.baseUrl)}&id=${encodeURIComponent(source.id)}&name=${encodeURIComponent(source.name)}&engine=${encodeURIComponent((source as any).engine || '')}`
      );
      const pingData: SourceHealthPing = await res.json();
      setPingResults((prev) => ({
        ...prev,
        [source.id]: pingData,
      }));
    } catch (err: any) {
      setPingResults((prev) => ({
        ...prev,
        [source.id]: {
          status: 0,
          statusText: 'Network Error',
          latencyMs: 0,
          online: false,
          canImport: false,
          importStatusText: `Connection failed (${err?.message || 'Network error'})`,
          checkedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setPingingMap((prev) => ({ ...prev, [source.id]: false }));
    }
  };

  const activeInstalledCount = useMemo(() => {
    return userSources.filter((s) => s.enabled).length;
  }, [userSources]);

  const pinnedInstalledCount = useMemo(() => {
    return userSources.filter((s) => s.isPinned).length;
  }, [userSources]);

  const filteredInstalledSources = useMemo(() => {
    let list = [...userSources];

    if (installedFilter === 'active') {
      list = list.filter((s) => s.enabled);
    } else if (installedFilter === 'disabled') {
      list = list.filter((s) => !s.enabled);
    } else if (installedFilter === 'pinned') {
      list = list.filter((s) => s.isPinned);
    }

    if (excludeCloudflare || statusFilter === 'no_cloudflare') {
      list = list.filter((s) => !isCloudflareSource(s));
    } else if (statusFilter === 'protected') {
      list = list.filter((s) => isCloudflareSource(s));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.baseUrl.toLowerCase().includes(q) ||
          (s.lang && s.lang.toLowerCase().includes(q)) ||
          (s.pkg && s.pkg.toLowerCase().includes(q))
      );
    }

    // Default sort: pinned sources always at the top
    return list.sort((a, b) => {
      if (Boolean(a.isPinned) === Boolean(b.isPinned)) return 0;
      return a.isPinned ? -1 : 1;
    });
  }, [userSources, search, excludeCloudflare, statusFilter, installedFilter]);

  const handleSearchInSourceWithInstall = (source: ComicSource) => {
    if (!installedMap[source.id]) {
      installSource(source);
    }
    if (onSearchInSource) {
      onSearchInSource(source);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isAddCustomOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isAddCustomOpen]);

  if (!isOpen) return null;

  const content = (
    <div className="flex flex-col h-full min-h-0 text-slate-200 bg-slate-950">
      {/* Ultra-Compact Unified Header & Controls (3 Rows on Mobile, <= 15% Viewport Height) */}
      <div className="px-3 sm:px-5 py-2 bg-slate-900/95 border-b border-slate-800 shrink-0 space-y-1.5">
        {/* Row 1: Tab Switcher + Quick Actions (No CF, Custom, Sort) */}
        <div className="flex items-center justify-between gap-2 relative">
          {/* Segmented View Switcher */}
          <div className="flex p-0.5 bg-slate-950 rounded-xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewTab('installed');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 font-bold text-xs cursor-pointer ${
                viewTab === 'installed'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Library</span>
              <span className="bg-slate-900/80 px-1.5 py-0.2 rounded text-[10px] font-mono text-indigo-200">
                {userSources.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewTab('catalog');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 font-bold text-xs cursor-pointer ${
                viewTab === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Catalog</span>
              <span className="bg-slate-900/80 px-1.5 py-0.2 rounded text-[10px] font-mono text-indigo-200">
                {data?.total ?? '1.4k+'}
              </span>
            </button>
          </div>

          {/* Desktop Actions */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {viewTab === 'installed' && userSources.length > 0 && (
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setAllSourcesEnabled(true)}
                  className="px-2 py-1 text-[10px] font-bold uppercase text-emerald-400 hover:bg-emerald-500/10 rounded transition cursor-pointer"
                  title="Enable all installed sources"
                >
                  Enable All
                </button>
                <div className="w-px h-3 bg-slate-800 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setAllSourcesEnabled(false)}
                  className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 hover:bg-slate-500/10 rounded transition cursor-pointer"
                  title="Disable all installed sources"
                >
                  Disable All
                </button>
              </div>
            )}

            {viewTab === 'catalog' && (
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="default">Sort: Default</option>
                <option value="name_asc">Name A-Z</option>
                <option value="version_desc">Version</option>
                <option value="langs_desc">Languages</option>
              </select>
            )}

            <button
              type="button"
              onClick={handleToggleExcludeCloudflare}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer shrink-0 ${
                excludeCloudflare
                  ? 'bg-amber-500/15 border-amber-500/70 text-amber-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Exclude Cloudflare-protected sources"
            >
              <ShieldOff className="w-3 h-3 text-amber-400" />
              <span>No CF</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddCustomOpen(true)}
              className="px-2 py-1.5 bg-slate-950 border border-slate-800 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300 rounded-lg transition flex items-center gap-1 text-[10px] font-bold cursor-pointer"
              title="Add Custom Site URL"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Custom</span>
            </button>
          </div>

          {/* Mobile 3-Dot Menu Button & Dropdown */}
          <div className="flex sm:hidden items-center relative">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
              aria-label="Source options menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {mobileMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/40" 
                  onClick={() => setMobileMenuOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-2 space-y-2">
                  {viewTab === 'installed' && userSources.length > 0 && (
                    <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-lg p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAllSourcesEnabled(true);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs font-bold uppercase text-emerald-400 hover:bg-emerald-500/10 rounded transition cursor-pointer"
                      >
                        Enable All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAllSourcesEnabled(false);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs font-bold uppercase text-slate-400 hover:bg-slate-500/10 rounded transition cursor-pointer"
                      >
                        Disable All
                      </button>
                    </div>
                  )}

                  {viewTab === 'catalog' && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 px-1">Sort Options</span>
                      <select
                        value={sortBy}
                        onChange={(e) => {
                          handleSortChange(e.target.value as any);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 rounded-lg p-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="default">Sort: Default</option>
                        <option value="name_asc">Name A-Z</option>
                        <option value="version_desc">Version</option>
                        <option value="langs_desc">Languages</option>
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      handleToggleExcludeCloudflare();
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg text-xs font-bold border transition flex items-center justify-between cursor-pointer ${
                      excludeCloudflare
                        ? 'bg-amber-500/15 border-amber-500/70 text-amber-400'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldOff className="w-3.5 h-3.5 text-amber-400" />
                      No Cloudflare
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${excludeCloudflare ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                      {excludeCloudflare ? 'Active' : 'Off'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAddCustomOpen(true);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300 rounded-lg transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Custom Source</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Search Input Box (Full Width) */}
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={viewTab === 'installed' ? 'Search your library...' : 'Search 1,440+ extensions by site name, domain, package...'}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-inner"
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Row 3: Unified Horizontal Filter Ribbon & HOT Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs pb-0.5">
          {viewTab === 'installed' ? (
            /* Installed Filter Chips */
            <div className="flex items-center gap-1 shrink-0">
              {(['all', 'active', 'disabled', 'pinned'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setInstalledFilter(filter)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition cursor-pointer shrink-0 border ${
                    installedFilter === filter
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
              <span className="text-slate-600 text-[10px] px-1">•</span>
              <span className="text-[10px] text-slate-400 shrink-0">
                <strong className="text-slate-200 font-mono">{filteredInstalledSources.length}</strong> sources
              </span>
            </div>
          ) : (
            /* Catalog Filter Controls + Popular Chips */
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Language Selector */}
              <select
                value={selectedLang}
                onChange={(e) => handleLangChange(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-300 rounded-md px-1.5 py-0.5 focus:outline-none focus:border-indigo-500 cursor-pointer shrink-0"
              >
                <option value="all-langs">All Langs</option>
                {data?.languages.slice(0, 15).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>

              {/* SFW / NSFW Switcher */}
              <div className="flex p-0.5 bg-slate-950 rounded-md border border-slate-800 shrink-0">
                {(['all', 'sfw', 'nsfw'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleNsfwChange(type)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition cursor-pointer ${
                      nsfwFilter === type
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="h-3.5 w-px bg-slate-800 mx-0.5 shrink-0" />

              {/* HOT Popular Quick Tags */}
              <span className="text-amber-400 font-bold text-[9px] uppercase tracking-wider flex items-center gap-0.5 shrink-0">
                <Sparkles className="w-2.5 h-2.5" />
                HOT:
              </span>
              {[
                'Toonily',
                'Webtoons',
                'MangaFire',
                'MangaDex',
                'Asura Scans',
                'Flame Comics',
                'Omega Scans',
                'WebtoonScan',
              ].map((popular) => {
                const isMatch = search.toLowerCase() === popular.toLowerCase();
                return (
                  <button
                    key={popular}
                    type="button"
                    onClick={() => handleSearchChange(isMatch ? '' : popular)}
                    className={`text-[9px] px-2 py-0.5 rounded-md border transition cursor-pointer flex items-center gap-1 shrink-0 font-medium ${
                      isMatch
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <span>{popular}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sources Grid Container */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
        {viewTab === 'installed' ? (
          /* ========================================================
             TAB 1: MY INSTALLED SOURCES (Tachiyomi Installed Sources)
             ======================================================== */
          filteredInstalledSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[220px] text-slate-400 gap-2.5 max-w-md mx-auto text-center p-4">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-xs font-bold text-slate-200">
                {userSources.length === 0 ? 'No Sources Installed Yet' : 'No Installed Sources Match Filter'}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {userSources.length === 0
                  ? 'Select which extensions you want enabled for in-app searching. Explore our 1,440+ verified extensions catalog and install your favorite websites.'
                  : 'Try clearing your search query or check "Available Catalog" to install more.'}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setViewTab('catalog')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Browse Catalog</span>
                </button>
                {userSources.length === 0 && (
                  <button
                    type="button"
                    onClick={resetSourcesToDefaults}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition cursor-pointer"
                  >
                    Load Default Starter Pack
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredInstalledSources.map((source) => {
                const isCopied = copiedId === source.id;
                const isPinging = Boolean(pingingMap[source.id]);
                const ping = pingResults[source.id];
                return (
                  <div
                    key={source.id}
                    className={`group relative flex flex-col justify-between p-3.5 bg-slate-900 rounded-2xl border transition-all duration-200 ${
                      source.enabled
                        ? 'border-slate-800 hover:border-indigo-500/50 shadow-md shadow-slate-950/20'
                        : 'border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-inner">
                        {source.icon ? (
                          <img src={source.icon} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <BookOpen className="w-5 h-5 text-indigo-400" />
                        )}
                      </div>
                      
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <h3 className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-400 transition-colors">
                            {source.name}
                          </h3>
                          <button
                            type="button"
                            onClick={() => toggleSourcePinned(source.id)}
                            className={`p-1 rounded-md hover:bg-slate-800 transition cursor-pointer ${source.isPinned ? 'text-amber-400' : 'text-slate-600'}`}
                            title={source.isPinned ? 'Unpin source' : 'Pin source to top'}
                          >
                            <Star className={`w-3.5 h-3.5 ${source.isPinned ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <span className="text-indigo-400 font-mono">{source.lang}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <span className="truncate">{source.engine || 'Extension'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {isCloudflareSource(source) ? (
                          <div className="px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40 text-[9px] font-bold uppercase">CF</div>
                        ) : (
                          <div className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 text-[9px] font-bold uppercase">Direct</div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleSourceEnabled(source.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                          source.enabled
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-xs'
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {source.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handlePingSource(source as any, e)}
                          disabled={isPinging}
                          className="p-1.5 rounded-md bg-slate-950 text-slate-500 hover:text-indigo-400 border border-slate-800 transition cursor-pointer"
                          title="Test Connection"
                        >
                          <Activity className={`w-3.5 h-3.5 ${isPinging ? 'animate-pulse text-indigo-400' : ''}`} />
                        </button>
                        <a
                          href={source.baseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md bg-slate-950 text-slate-500 hover:text-slate-200 border border-slate-800 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex items-center gap-1.5">
                         {onSearchInSource && (
                           <button
                             type="button"
                             onClick={() => onSearchInSource(source as any)}
                             className="px-2 py-1 rounded-md bg-indigo-600/15 text-indigo-400 border border-indigo-600/30 hover:bg-indigo-600 hover:text-white transition text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                             title="Search inside this source"
                           >
                             <Search className="w-3 h-3" />
                             <span>Search</span>
                           </button>
                         )}
                         <button
                            type="button"
                            onClick={() => uninstallSource(source.id)}
                            className="p-1.5 rounded-md bg-slate-950 text-slate-700 hover:text-rose-400 border border-slate-800 transition cursor-pointer"
                            title="Remove from installed"
                         >
                            <Trash2 className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    </div>
                    
                    {ping && (
                       <div className={`mt-2 p-1.5 rounded-lg border text-[9px] font-bold ${ping.canImport ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-rose-500/10 border-rose-500/25 text-rose-300'}`}>
                         {ping.canImport ? 'Verified' : 'Blocked'} • {ping.latencyMs}ms
                       </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ========================================================
             TAB 2: AVAILABLE EXTENSIONS (1,440+ Keiyoushi Catalog)
             ======================================================== */
          isLoading && !data ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
              <Compass className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm font-medium">Loading Tachiyomi / Keiyoushi source directory...</p>
            </div>
          ) : data && data.sources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.sources.map((source) => {
                const isCopied = copiedId === source.id;
                const isPinging = Boolean(pingingMap[source.id]);
                const ping = pingResults[source.id];
                const isInstalled = Boolean(installedMap[source.id]);

                const isV16 = source.version && source.version.startsWith('1.6');
                const isV14 = source.version && source.version.startsWith('1.4');

                return (
                  <div
                    key={source.id}
                    className="bg-slate-950/80 hover:bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-3.5 transition-all flex flex-col justify-between gap-2.5 shadow-sm group relative"
                  >
                    {/* Top info: Icon & Name & Status Badge */}
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center p-1 relative shadow-inner">
                        {source.icon ? (
                          <img
                            src={source.icon}
                            alt={source.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <BookOpen className="w-4 h-4 text-indigo-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3
                            className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-300 transition"
                            title={source.name}
                          >
                            {source.name}
                          </h3>
                          {source.nsfw && (
                            <span
                              className="text-[9px] px-1 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-bold"
                              title="18+ Adult Content"
                            >
                              18+
                            </span>
                          )}
                          {isInstalled && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              Installed
                            </span>
                          )}
                        </div>

                        <a
                          href={source.baseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-400 hover:text-indigo-300 truncate flex items-center gap-1 transition"
                          title={source.baseUrl}
                        >
                          <span className="truncate">{source.baseUrl.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                        </a>
                      </div>
                    </div>

                    {/* Status & Version Code Meta Row */}
                    <div className="flex items-center justify-between gap-1.5 text-[10px] bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800/80">
                      <div className="flex items-center gap-1 min-w-0 flex-wrap">
                        {source.isCloudflare || source.status === 'protected' ? (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80" title="Cloudflare Protected">
                            <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                            CF
                          </span>
                        ) : source.status === 'updated' ? (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80" title="Updated v1.6+">
                            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                            v1.6+
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/80" title="Direct Web Access">
                            <Zap className="w-2.5 h-2.5 text-indigo-400" />
                            Direct
                          </span>
                        )}

                        {source.version && (
                          <span
                            className="font-mono text-[9px] px-1 py-0.2 rounded border font-medium bg-slate-950 text-slate-400 border-slate-800"
                            title={`Extension Version: v${source.version}`}
                          >
                            v{source.version}
                          </span>
                        )}
                      </div>

                      {/* Live Ping Tester */}
                      <div className="shrink-0">
                        {ping ? (
                          <span
                            className={`inline-flex items-center gap-0.5 font-mono text-[9px] font-bold px-1 py-0.2 rounded border ${
                              ping.online
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border-rose-800'
                            }`}
                            title={`${ping.statusText} (${ping.latencyMs}ms)`}
                          >
                            <Zap className="w-2.5 h-2.5" />
                            {ping.latencyMs}ms
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isPinging}
                            onClick={(e) => handlePingSource(source, e)}
                            className="text-[9px] text-slate-400 hover:text-indigo-300 px-1 py-0.2 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Ping and test live connection status"
                          >
                            {isPinging ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin text-indigo-400" />
                            ) : (
                              <Activity className="w-2.5 h-2.5 text-slate-400" />
                            )}
                            <span>{isPinging ? '...' : 'Ping'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Live Functional Import Status Banner */}
                    {renderImportStatusBanner(ping, isPinging)}

                    {/* Languages & Action Buttons */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-xs">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9px] uppercase font-bold px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {source.lang}
                        </span>
                        {source.langCount && source.langCount > 1 && (
                          <span
                            className="text-[9px] px-1 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 font-semibold cursor-help"
                            title={`Supported languages: ${source.languages?.join(', ')}`}
                          >
                            +{source.langCount - 1}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Install / Installed Button */}
                        {isInstalled ? (
                          <button
                            type="button"
                            onClick={() => uninstallSource(source.id)}
                            className="px-2 py-0.8 text-[10px] font-semibold text-emerald-300 hover:text-rose-300 bg-emerald-950/80 hover:bg-rose-950/80 border border-emerald-700/80 hover:border-rose-700/80 rounded-lg transition flex items-center gap-1 cursor-pointer group/btn shadow-xs"
                            title="Installed in My Sources. Click to uninstall."
                          >
                            <Check className="w-2.5 h-2.5 text-emerald-400 group-hover/btn:hidden" />
                            <Trash2 className="w-2.5 h-2.5 text-rose-400 hidden group-hover/btn:inline" />
                            <span className="group-hover/btn:hidden">Added</span>
                            <span className="hidden group-hover/btn:inline">Remove</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => installSource(source)}
                            className="px-2 py-0.8 text-[10px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs"
                            title="Add this source to My Sources"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Install</span>
                          </button>
                        )}

                        {/* Search Inside this Source Button */}
                        {onSearchInSource && (
                          <button
                            type="button"
                            onClick={() => handleSearchInSourceWithInstall(source)}
                            className="px-2 py-0.8 text-[10px] font-semibold text-indigo-300 hover:text-white bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs"
                            title={`Search manga titles inside ${source.name}`}
                          >
                            <Search className="w-2.5 h-2.5" />
                            <span>Search</span>
                          </button>
                        )}

                        {/* Use for Import Button */}
                        {onSelectSource && (
                          <button
                            type="button"
                            onClick={() => onSelectSource(source)}
                            className="px-1.5 py-0.8 text-[10px] font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs"
                            title="Import link from this website in reader"
                          >
                            <span>Link</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
              <Filter className="w-8 h-8 text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No sources found matching your filters</p>
              <p className="text-xs text-slate-500 max-w-sm text-center">
                Try adjusting your search keywords, switching to &quot;All Languages&quot;, or toggling the 18+ filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedLang('all-langs');
                  setNsfwFilter('all');
                  setStatusFilter('all');
                  setSortBy('default');
                  setCurrentPage(1);
                }}
                className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          )
        )}
      </div>

      {/* Pagination Footer (Only on Catalog view) */}
      {viewTab === 'catalog' && data && data.totalPages > 1 && (
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-300 shrink-0">
          <div className="text-slate-400">
            Page <strong className="text-slate-200">{data.page}</strong> of{' '}
            <strong className="text-slate-200">{data.totalPages}</strong> ({data.total.toLocaleString()} total sources)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 transition cursor-pointer"
              title="Previous Page"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-slate-200">{currentPage}</span>
            <button
              type="button"
              disabled={currentPage >= data.totalPages || isLoading}
              onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 transition cursor-pointer"
              title="Next Page"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Custom Source Modal Dialog */}
      {isAddCustomOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn"
          onClick={() => {
            setIsAddCustomOpen(false);
            setCustomInputError(null);
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-100">Add Custom Manga / Comic Site</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddCustomOpen(false);
                  setCustomInputError(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomSource} className="space-y-3.5 text-xs">
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Add any website domain (e.g. <span className="font-mono text-indigo-300">novelcrow.com</span>, <span className="font-mono text-indigo-300">mangakomi.io</span>). It will be added to your &quot;My Sources&quot; library and enabled for in-app search &amp; reading.
              </p>

              {customInputError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs">
                  {customInputError}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Website URL or Domain *</label>
                <input
                  type="text"
                  value={customInputUrl}
                  onChange={(e) => setCustomInputUrl(e.target.value)}
                  placeholder="https://novelcrow.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Source Display Name (Optional)</label>
                <input
                  type="text"
                  value={customInputName}
                  onChange={(e) => setCustomInputName(e.target.value)}
                  placeholder="e.g. NovelCrow"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddCustomOpen(false)}
                  className="px-3.5 py-1.5 text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow transition cursor-pointer"
                >
                  Add to My Sources
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col w-full h-full overflow-hidden animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supported-sources-title"
    >
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-inner text-white shrink-0">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 id="supported-sources-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
              Supported Comic &amp; Manga Sources
              <span className="text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                1,440+ Verified &amp; Monitored
              </span>
            </h2>
            <p className="text-xs text-slate-400 hidden sm:block">
              Live extension version codes, update tracking, and active status monitoring • Tachiyomi &amp; Keiyoushi open-source catalog
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-sm"
          title="Close & Return"
        >
          <X className="w-4 h-4" />
          <span>Close</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{content}</div>
    </div>
  );
};
