import { useState, useEffect, useCallback, useMemo } from 'react';
import { UserSelectedSource, ComicSource, SupportedSourceEngine } from '../types';
import { TOP_50_GLOBAL_RANKED_SOURCES } from '../data/topRankedSources';

export const USER_SOURCES_STORAGE_KEY = 'tachiyomi_user_selected_sources';
export const USER_SOURCES_EVENT = 'tachiyomi-user-sources-changed';

/**
 * Known domains and keyword patterns that use Cloudflare or anti-bot challenge protection
 */
export const KNOWN_CLOUDFLARE_PATTERNS = [
  'cloudflare',
  'turnstile',
  'ddos-guard',
  'novelcrow',
  'allporncomics',
  'mangadex',
  'bato.to',
  'batoto',
  'flamecomics',
  'flamescans',
  'asurascans',
  'asuracomic',
  'reaperscans',
  'void-scans',
  'voidscans',
  'manhwaclan',
  'manhuafast',
  'zinmanga',
  'mangafox',
  'mangahere',
  'readmanganato',
  'chapmanganato',
  'manganato',
  'comick',
  'nightscans',
  'kunmanga',
  'mangatx',
  'topmanhua',
  'manga18fx',
  '1stkissmanga',
  '18comic',
  'toongod',
];

/**
 * Determines whether a comic source uses Cloudflare or anti-bot protection
 */
export function isCloudflareSource(
  source?:
    | {
        baseUrl?: string;
        name?: string;
        pkg?: string;
        extName?: string;
        status?: string;
        isCloudflare?: boolean;
      }
    | string
    | null
): boolean {
  if (!source) return false;
  if (typeof source === 'string') {
    const s = source.toLowerCase();
    return KNOWN_CLOUDFLARE_PATTERNS.some((p) => s.includes(p));
  }
  if (source.isCloudflare === true) return true;
  if (source.status === 'protected') return true;
  const combined = `${source.baseUrl || ''} ${source.name || ''} ${source.pkg || ''} ${source.extName || ''}`.toLowerCase();
  return KNOWN_CLOUDFLARE_PATTERNS.some((p) => combined.includes(p));
}

/**
 * Default starter sources mimicking a fresh Tachiyomi / Mihon install with popular extensions enabled.
 * Users have complete freedom to add, remove, toggle, or install any of the 1,440+ sources.
 */
export const DEFAULT_STARTER_SOURCES: UserSelectedSource[] = [
  {
    id: 'mangadex',
    name: 'MangaDex',
    baseUrl: 'https://mangadex.org',
    pkg: 'eu.kanade.tachiyomi.extension.all.mangadex',
    extName: 'MangaDex',
    lang: 'all',
    engine: 'mangadex',
    enabled: true,
    isPinned: true,
    isCloudflare: false,
    globalRank: 1,
    trafficScore: '85M+ Visits/mo (#1 Worldwide)',
    isTopRanked: true,
    addedAt: 1700000000000,
  },
  {
    id: 'webtoons',
    name: 'Webtoons',
    baseUrl: 'https://www.webtoons.com',
    pkg: 'eu.kanade.tachiyomi.extension.en.webtoons',
    extName: 'Webtoons.com',
    lang: 'en',
    engine: 'webtoons',
    enabled: true,
    isPinned: true,
    isCloudflare: false,
    globalRank: 2,
    trafficScore: '65M+ Visits/mo (#1 Webcomic)',
    isTopRanked: true,
    addedAt: 1700000001000,
  },
  {
    id: 'mangakakalot',
    name: 'MangaKakalot',
    baseUrl: 'https://mangakakalot.com',
    pkg: 'eu.kanade.tachiyomi.extension.en.mangakakalot',
    extName: 'MangaBox',
    lang: 'en',
    engine: 'mangakakalot',
    enabled: true,
    isPinned: true,
    isCloudflare: true,
    globalRank: 3,
    trafficScore: '50M+ Visits/mo (#1 Aggregator)',
    isTopRanked: true,
    addedAt: 1700000005000,
  },
  {
    id: 'asura',
    name: 'Asura Scans',
    baseUrl: 'https://asurascans.com',
    pkg: 'eu.kanade.tachiyomi.extension.en.asurascans',
    extName: 'Asura Scans',
    lang: 'en',
    engine: 'asura',
    enabled: true,
    isPinned: false,
    isCloudflare: true,
    globalRank: 4,
    trafficScore: '45M+ Visits/mo (#1 Manhwa Group)',
    isTopRanked: true,
    addedAt: 1700000002000,
  },
  {
    id: 'batoto',
    name: 'Bato.to',
    baseUrl: 'https://bato.to',
    pkg: 'eu.kanade.tachiyomi.extension.all.batoto',
    extName: 'Bato.to',
    lang: 'all',
    engine: 'batoto',
    enabled: true,
    isPinned: false,
    isCloudflare: true,
    globalRank: 5,
    trafficScore: '38M+ Visits/mo',
    isTopRanked: true,
    addedAt: 1700000003000,
  },
  {
    id: 'flame',
    name: 'Flame Comics',
    baseUrl: 'https://flamecomics.xyz',
    pkg: 'eu.kanade.tachiyomi.extension.en.flamecomics',
    extName: 'Flame Comics',
    lang: 'en',
    engine: 'flame',
    enabled: true,
    isPinned: false,
    isCloudflare: true,
    globalRank: 6,
    trafficScore: '28M+ Visits/mo',
    isTopRanked: true,
    addedAt: 1700000004000,
  },
];

/**
 * Determines the best search engine adapter identifier for a given source
 */
export function inferSourceEngine(source: { id?: string; name?: string; baseUrl?: string; pkg?: string }): SupportedSourceEngine {
  const combined = `${source.id || ''} ${source.name || ''} ${source.baseUrl || ''} ${source.pkg || ''}`.toLowerCase();
  if (combined.includes('mangadex')) return 'mangadex';
  if (combined.includes('webtoon.xyz') || combined.includes('webtoonxyz') || combined.includes('webtoonscan')) return 'madara';
  if (combined.includes('webtoons')) return 'webtoons';
  if (combined.includes('asura')) return 'asura';
  if (combined.includes('bato')) return 'batoto';
  if (combined.includes('flame')) return 'flame';
  if (combined.includes('mangakakalot') || combined.includes('manganato') || combined.includes('mangabox') || combined.includes('mangafire') || combined.includes('mangafreak') || combined.includes('mangahere')) return 'mangakakalot';
  if (
    combined.includes('madara') ||
    combined.includes('wp-manga') ||
    combined.includes('toonily') ||
    combined.includes('toongod') ||
    combined.includes('toonhey') ||
    combined.includes('allporncomic') ||
    combined.includes('allproncomic') ||
    combined.includes('athreascans') ||
    combined.includes('athrea') ||
    combined.includes('divascans') ||
    combined.includes('diva')
  ) return 'madara';
  if (combined.includes('mangathemesia') || combined.includes('themesia') || combined.includes('theblank') || combined.includes('omegascans')) return 'mangathemesia';
  if (combined.includes('manga18') || combined.includes('eighteenporncomic') || combined.includes('18porncomic') || combined.includes('nhentai') || combined.includes('simply-hentai') || combined.includes('oppai')) return 'manga18';
  return 'generic';
}

/**
 * Retrieves the user-selected/installed sources from localStorage
 */
export function getUserSelectedSources(): UserSelectedSource[] {
  if (typeof window === 'undefined') return DEFAULT_STARTER_SOURCES;
  try {
    const raw = localStorage.getItem(USER_SOURCES_STORAGE_KEY);
    if (!raw) {
      // First run: initialize with default starter set
      localStorage.setItem(USER_SOURCES_STORAGE_KEY, JSON.stringify(DEFAULT_STARTER_SOURCES));
      return DEFAULT_STARTER_SOURCES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      let needsSave = false;
      const normalized = parsed.map((s: UserSelectedSource) => {
        if (s.id === 'asura' && s.baseUrl && s.baseUrl.includes('asuracomic.net')) {
          needsSave = true;
          return { ...s, baseUrl: 'https://asurascans.com' };
        }
        return s;
      });
      if (needsSave && typeof window !== 'undefined') {
        localStorage.setItem(USER_SOURCES_STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    }
  } catch (err) {
    console.error('Failed to load user selected sources:', err);
  }
  return DEFAULT_STARTER_SOURCES;
}

/**
 * Persists user-selected sources and broadcasts change event
 */
export function saveUserSelectedSources(sources: UserSelectedSource[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_SOURCES_STORAGE_KEY, JSON.stringify(sources));
    window.dispatchEvent(new CustomEvent(USER_SOURCES_EVENT, { detail: sources }));
  } catch (err) {
    console.error('Failed to save user selected sources:', err);
  }
}

/**
 * Adds / Installs a source to the user's preferred sources list
 */
export function installUserSource(source: ComicSource | { id: string; name: string; baseUrl: string; pkg?: string; extName?: string; lang?: string }): UserSelectedSource {
  const existing = getUserSelectedSources();
  const foundIndex = existing.findIndex((s) => s.id === source.id || (s.baseUrl && s.baseUrl === source.baseUrl));
  
  if (foundIndex >= 0) {
    // If it exists but was disabled, re-enable it
    const updated = [...existing];
    updated[foundIndex] = { ...updated[foundIndex], enabled: true };
    saveUserSelectedSources(updated);
    return updated[foundIndex];
  }

  const newSource: UserSelectedSource = {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    pkg: source.pkg,
    extName: source.extName,
    lang: source.lang || 'en',
    engine: inferSourceEngine(source),
    enabled: true,
    isPinned: false,
    isCloudflare: isCloudflareSource(source),
    addedAt: Date.now(),
  };

  const updated = [newSource, ...existing];
  saveUserSelectedSources(updated);
  return newSource;
}

/**
 * Removes / Uninstalls a source from the user's preferred sources list
 */
export function uninstallUserSource(sourceId: string): void {
  const existing = getUserSelectedSources();
  const updated = existing.filter((s) => s.id !== sourceId);
  saveUserSelectedSources(updated);
}

/**
 * Toggles whether a source is enabled for searches
 */
export function toggleUserSourceEnabled(sourceId: string): void {
  const existing = getUserSelectedSources();
  const updated = existing.map((s) => {
    if (s.id === sourceId) {
      return { ...s, enabled: !s.enabled };
    }
    return s;
  });
  saveUserSelectedSources(updated);
}

/**
 * Toggles whether a source is pinned to the front of the filter bar
 */
export function toggleUserSourcePinned(sourceId: string): void {
  const existing = getUserSelectedSources();
  const updated = existing.map((s) => {
    if (s.id === sourceId) {
      return { ...s, isPinned: !s.isPinned };
    }
    return s;
  });
  saveUserSelectedSources(updated);
}

/**
 * Restores the default starter sources
 */
export function resetUserSourcesToDefault(): void {
  saveUserSelectedSources(DEFAULT_STARTER_SOURCES);
}

/**
 * Check if a source is currently in the user's installed list
 */
export function isSourceInstalled(sourceId: string, sourcesList?: UserSelectedSource[]): boolean {
  const list = sourcesList || getUserSelectedSources();
  return list.some((s) => s.id === sourceId);
}

/**
 * Sets all sources enabled or disabled
 */
export function setAllUserSourcesEnabled(enabled: boolean): void {
  const existing = getUserSelectedSources();
  const updated = existing.map((s) => ({ ...s, enabled }));
  saveUserSelectedSources(updated);
}

/**
 * Custom React hook for subscribing to and managing user-installed sources
 */
export function useUserSources() {
  const [sources, setSources] = useState<UserSelectedSource[]>(() => getUserSelectedSources());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<UserSelectedSource[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setSources(customEvent.detail);
      } else {
        setSources(getUserSelectedSources());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === USER_SOURCES_STORAGE_KEY) {
        setSources(getUserSelectedSources());
      }
    };

    window.addEventListener(USER_SOURCES_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(USER_SOURCES_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const installedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of sources) {
      map[s.id] = true;
    }
    return map;
  }, [sources]);

  const enabledSources = useMemo(() => {
    return sources.filter((s) => s.enabled);
  }, [sources]);

  const install = useCallback((source: ComicSource | { id: string; name: string; baseUrl: string; pkg?: string; extName?: string; lang?: string }) => {
    return installUserSource(source);
  }, []);

  const uninstall = useCallback((sourceId: string) => {
    uninstallUserSource(sourceId);
  }, []);

  const toggleEnabled = useCallback((sourceId: string) => {
    toggleUserSourceEnabled(sourceId);
  }, []);

  const setAllEnabled = useCallback((enabled: boolean) => {
    setAllUserSourcesEnabled(enabled);
  }, []);

  const togglePinned = useCallback((sourceId: string) => {
    toggleUserSourcePinned(sourceId);
  }, []);

  const reset = useCallback(() => {
    resetUserSourcesToDefault();
  }, []);

  return {
    sources,
    enabledSources,
    installedMap,
    install,
    uninstall,
    toggleEnabled,
    setAllEnabled,
    togglePinned,
    reset,
  };
}
