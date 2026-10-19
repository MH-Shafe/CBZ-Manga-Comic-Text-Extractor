import * as cheerio from 'cheerio';
import type { ComicSearchResult, SearchChapterItem, WebComicImportResult } from '../types.ts';
import fs from 'fs';
import path from 'path';
import { AsuraScansSearchAdapter } from './sourceSearchAdapters.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Load Keiyoushi sources catalog cache for any-source lookups
let cachedSources: Array<{
  id: string;
  name: string;
  baseUrl: string;
  pkg?: string;
  extName?: string;
  icon?: string;
}> = [];

function getKeiyoushiSources() {
  if (cachedSources.length > 0) return cachedSources;
  try {
    const filePath = path.resolve(process.cwd(), 'src/data/keiyoushi-sources.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      cachedSources = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Could not read keiyoushi-sources.json for search:', err);
  }
  return cachedSources;
}

/**
 * Normalizes absolute URLs relative to base
 */
function toAbsoluteUrl(url: string, baseUrl: string): string {
  if (!url) return '';
  const clean = url.trim().replace(/&amp;/g, '&');
  if (clean.startsWith('//')) return `https:${clean}`;
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

/**
 * 1. Search MangaDex REST API
 */
export async function searchMangaDex(query: string, limit = 15): Promise<ComicSearchResult[]> {
  try {
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(
      query
    )}&limit=${limit}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];

    const json = await res.json();
    const items = json?.data || [];

    const results: ComicSearchResult[] = [];
    for (const item of items) {
      const attrs = item.attributes || {};
      const title =
        attrs.title?.en ||
        attrs.title?.['ja-ro'] ||
        attrs.title?.['ko-ro'] ||
        Object.values(attrs.title || {})[0] ||
        'Untitled Manga';

      const altTitles: string[] = [];
      if (Array.isArray(attrs.altTitles)) {
        for (const altObj of attrs.altTitles) {
          const val = Object.values(altObj)[0];
          if (typeof val === 'string' && val.trim() && val !== title) {
            altTitles.push(val.trim());
          }
        }
      }

      const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName;
      const coverUrl = coverFileName
        ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.256.jpg`
        : undefined;

      const authorRels = item.relationships?.filter((r: any) => r.type === 'author' || r.type === 'artist') || [];
      const authors = authorRels
        .map((r: any) => r.attributes?.name)
        .filter((n: any): n is string => typeof n === 'string' && Boolean(n));

      const genres: string[] = [];
      if (Array.isArray(attrs.tags)) {
        for (const t of attrs.tags) {
          const name = t.attributes?.name?.en;
          if (name) genres.push(name);
        }
      }

      const synopsis = attrs.description?.en || Object.values(attrs.description || {})[0] || '';

      results.push({
        id: `mangadex:${item.id}`,
        title,
        altTitles: altTitles.slice(0, 5),
        source: 'MangaDex',
        sourceIcon: 'https://mangadex.org/favicon.ico',
        sourceUrl: `https://mangadex.org/title/${item.id}`,
        coverUrl,
        synopsis: typeof synopsis === 'string' ? synopsis.slice(0, 300) : '',
        status: attrs.status,
        authors: authors.length > 0 ? Array.from(new Set(authors)) : undefined,
        genres: genres.slice(0, 6),
      });
    }

    return results;
  } catch (err: any) {
    console.warn('MangaDex search error:', err?.message);
    return [];
  }
}

/**
 * 2. Search Webtoons.com
 */
export async function searchWebtoons(query: string): Promise<ComicSearchResult[]> {
  try {
    const url = `https://www.webtoons.com/en/search?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: ComicSearchResult[] = [];
    const seen = new Set<string>();

    $('a').each((_, el) => {
      const link = $(el).attr('href');
      const titleEl = $(el).find('strong.title, p.title, .subj');
      if (!link || titleEl.length === 0 || link.startsWith('#') || link.includes('/canvas/')) return;

      const fullUrl = toAbsoluteUrl(link, 'https://www.webtoons.com');
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const title = titleEl.text().trim();
      const author = $(el).find('.author').text().trim() || 'Webtoons';
      const img = $(el).find('img').attr('src') || '';
      const views = $(el).find('.view_count').text().trim();

      results.push({
        id: `webtoons:${fullUrl}`,
        title,
        source: 'Webtoons',
        sourceIcon: 'https://www.webtoons.com/favicon.ico',
        sourceUrl: fullUrl,
        coverUrl: img,
        synopsis: views ? `Official Webtoon • ${views}` : 'Official Webtoon on Webtoons.com',
        authors: [author],
        genres: ['Webtoon', 'Manhwa'],
      });
    });

    return results.slice(0, 8);
  } catch (err: any) {
    console.warn('Webtoons search error:', err?.message);
    return [];
  }
}

/**
 * 3. Search Asura Scans
 */
export async function searchAsura(query: string, limit = 20): Promise<ComicSearchResult[]> {
  try {
    const adapter = new AsuraScansSearchAdapter();
    return await adapter.search({ query, limit });
  } catch (err: any) {
    console.warn('Asura search error:', err?.message);
    return [];
  }
}

/**
 * 4. Search Bato.to
 */
export async function searchBatoto(query: string): Promise<ComicSearchResult[]> {
  try {
    const url = `https://bato.to/v3x-search?word=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Referer: 'https://bato.to/' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: ComicSearchResult[] = [];
    const seen = new Set<string>();

    $('a.item-title, a[href*="/series/"], a[href*="/title/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || seen.has(href)) return;
      seen.add(href);

      const title = $(el).text().trim();
      if (!title) return;

      const container = $(el).closest('.item, .line-b, .col');
      const img = container.find('img').attr('src') || container.find('img').attr('data-src');
      const fullUrl = toAbsoluteUrl(href, 'https://bato.to');

      results.push({
        id: `batoto:${fullUrl}`,
        title,
        source: 'Bato.to',
        sourceIcon: 'https://bato.to/favicon.ico',
        sourceUrl: fullUrl,
        coverUrl: img ? toAbsoluteUrl(img, 'https://bato.to') : undefined,
        synopsis: 'Manga / Manhwa on Bato.to',
        genres: ['Manga', 'Manhwa'],
      });
    });

    return results.slice(0, 8);
  } catch (err: any) {
    console.warn('Bato search error:', err?.message);
    return [];
  }
}

/**
 * 5. Search Flame Comics
 */
export async function searchFlameComics(query: string): Promise<ComicSearchResult[]> {
  try {
    const url = `https://flamecomics.xyz/series?page=1&name=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Referer: 'https://flamecomics.xyz/' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: ComicSearchResult[] = [];
    const seen = new Set<string>();

    $('a[href*="/series/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const fullUrl = toAbsoluteUrl(href, 'https://flamecomics.xyz');
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const title = $(el).find('h3, .series-title, strong').text().trim() || $(el).text().trim();
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');

      if (title) {
        results.push({
          id: `flame:${fullUrl}`,
          title,
          source: 'Flame Comics',
          sourceIcon: 'https://flamecomics.xyz/favicon.ico',
          sourceUrl: fullUrl,
          coverUrl: img ? toAbsoluteUrl(img, 'https://flamecomics.xyz') : undefined,
          synopsis: 'Action Manhwa on Flame Comics',
          genres: ['Action', 'Manhwa'],
        });
      }
    });

    return results.slice(0, 8);
  } catch (err: any) {
    console.warn('Flame Comics search error:', err?.message);
    return [];
  }
}

/**
 * 6. Universal Any-Source Scraper (Tachiyomi lib-multisrc pattern in TypeScript)
 * Searches ANY website or source from the 1,440+ catalog using CMS patterns
 */
export async function searchAnyGenericSource(
  baseUrl: string,
  sourceName: string,
  query: string,
  pkg = ''
): Promise<ComicSearchResult[]> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const lowerPkg = (pkg || '').toLowerCase();

  // Determine standard search endpoints based on Tachiyomi multisrc packages
  let searchUrls: string[] = [];

  if (
    lowerPkg.includes('madara') ||
    lowerPkg.includes('wp-manga') ||
    lowerPkg.includes('toonily') ||
    lowerPkg.includes('toongod') ||
    lowerPkg.includes('toonhey') ||
    lowerPkg.includes('allporncomic') ||
    cleanBase.includes('toonily') ||
    cleanBase.includes('toongod') ||
    cleanBase.includes('toonhey') ||
    cleanBase.includes('webtoonxyz') ||
    cleanBase.includes('webtoonscan') ||
    cleanBase.includes('allporncomic') ||
    cleanBase.includes('allproncomic') ||
    cleanBase.includes('athreascans') ||
    cleanBase.includes('divascans')
  ) {
    searchUrls = [
      `${cleanBase}/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      `${cleanBase}/search?s=${encodeURIComponent(query)}`,
    ];
  } else if (
    lowerPkg.includes('mangathemesia') ||
    lowerPkg.includes('wpmangastream') ||
    cleanBase.includes('omegascans') ||
    cleanBase.includes('theblank')
  ) {
    searchUrls = [
      `${cleanBase}/?s=${encodeURIComponent(query)}`,
      `${cleanBase}/manga/?title=${encodeURIComponent(query)}`,
    ];
  } else if (
    lowerPkg.includes('mangabox') ||
    lowerPkg.includes('mangakakalot') ||
    cleanBase.includes('mangafire') ||
    cleanBase.includes('mangafreak') ||
    cleanBase.includes('mangahere')
  ) {
    searchUrls = [
      `${cleanBase}/search/story/${encodeURIComponent(query).replace(/%20/g, '_')}`,
      `${cleanBase}/search?keyword=${encodeURIComponent(query)}`,
      `${cleanBase}/search?q=${encodeURIComponent(query)}`,
      `${cleanBase}/filter?keyword=${encodeURIComponent(query)}`,
    ];
  } else if (
    lowerPkg.includes('manga18') ||
    cleanBase.includes('18porncomic') ||
    cleanBase.includes('nhentai') ||
    cleanBase.includes('simply-hentai') ||
    cleanBase.includes('oppaistream') ||
    cleanBase.includes('oppai.stream')
  ) {
    searchUrls = [
      `${cleanBase}/search/?q=${encodeURIComponent(query)}`,
      `${cleanBase}/search?query=${encodeURIComponent(query)}`,
      `${cleanBase}/list-manga?search=${encodeURIComponent(query)}`,
      `${cleanBase}/?s=${encodeURIComponent(query)}`,
    ];
  } else if (lowerPkg.includes('bato')) {
    searchUrls = [`${cleanBase}/v3x-search?word=${encodeURIComponent(query)}`];
  } else {
    // Default fallback search URLs
    searchUrls = [
      `${cleanBase}/search?q=${encodeURIComponent(query)}`,
      `${cleanBase}/?s=${encodeURIComponent(query)}`,
      `${cleanBase}/series?page=1&name=${encodeURIComponent(query)}`,
      `${cleanBase}/manga?search=${encodeURIComponent(query)}`,
    ];
  }

  for (const sUrl of searchUrls) {
    try {
      const res = await fetch(sUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: `${cleanBase}/`,
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      const results: ComicSearchResult[] = [];
      const seen = new Set<string>();

      // Check common Tachiyomi card selectors
      const cardSelectors = [
        'div.story_item',
        'div.c-tabs-item__content',
        'div.bsx',
        'div.item_story',
        'div.story-item',
        'div.list-truyen-item-wrap',
        'div._2aWyJ',
        'div.book-item',
        'div.manga-item',
        'div.manga-detail',
        'div.manga-card',
        'article.bs',
        'div.thumb-item',
        'div.grid > div',
      ];

      const JUNK_TITLE_REGEX = /^(english|raw|read|read now|read more|download|pdf|chapter|new|hot|free|update|manga|comic|online)$/i;

      for (const sel of cardSelectors) {
        if ($(sel).length > 0) {
          $(sel).each((_, card) => {
            let linkEl = $(card).find('.story_name a, .story-title a, .post-title a, .title a, .series-title a, h1 a, h2 a, h3 a, h4 a, a[href*="/comic/"], a[href*="/manga/"], a[href*="/series/"]').first();
            if (linkEl.length === 0) {
              linkEl = $(card).find('a').first();
            }

            let href = linkEl.attr('href');
            if (!href) return;

            let fullUrl = toAbsoluteUrl(href, cleanBase);
            fullUrl = fullUrl.replace(/\/(english|raw|download|free|read)\/?$/i, '');

            if (seen.has(fullUrl)) return;

            let title =
              $(card).find('.story_name a, .story-title a, .post-title a, .title a, h1 a, h2 a, h3 a, h4 a, .name a').first().text().trim() ||
              $(card).find('.story_name, .story-title, .post-title, .title, h1, h2, h3, h4, .name').first().text().trim() ||
              linkEl.text().trim();

            if (!title || JUNK_TITLE_REGEX.test(title)) {
              title = $(card).find('img').attr('alt') || $(card).find('img').attr('title') || linkEl.attr('title') || '';
            }

            title = title.replace(/\s+/g, ' ').trim();
            if (!title || JUNK_TITLE_REGEX.test(title)) return;

            seen.add(fullUrl);

            const imgEl = $(card).find('img').first();
            const img = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('data-original') || imgEl.attr('src');
            const latestCh = $(card).find('.chapter, .latest-chapter, .epxs, .chapter-item').first().text().trim();

            results.push({
              id: `${sourceName.toLowerCase().replace(/\s+/g, '_')}:${fullUrl}`,
              title,
              source: sourceName,
              sourceIcon: `${cleanBase}/favicon.ico`,
              sourceUrl: fullUrl,
              coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
              synopsis: latestCh ? `Latest: ${latestCh}` : `Available on ${sourceName}`,
              latestChapter: latestCh || undefined,
            });
          });

          if (results.length > 0) return results.slice(0, 16);
        }
      }

      // If card selector loop didn't find cards, fallback to smart anchor scanning
      $('a[href*="/manga/"], a[href*="/series/"], a[href*="/comic/"], a[href*="/title/"], a').each((_, a) => {
        let href = $(a).attr('href');
        if (!href || href.startsWith('#') || href.includes('javascript:')) return;

        let fullUrl = toAbsoluteUrl(href, cleanBase);
        fullUrl = fullUrl.replace(/\/(english|raw|download|free|read)\/?$/i, '');

        if (seen.has(fullUrl)) return;

        let text = $(a).text().trim();
        if (!text || text.length < 2 || JUNK_TITLE_REGEX.test(text)) {
          text = $(a).find('img').attr('alt') || $(a).find('img').attr('title') || $(a).attr('title') || '';
        }
        if (!text || text.length < 2) {
          text = $(a).closest('div, li, article').find('h1, h2, h3, h4, .title, .name').first().text().trim();
        }

        text = text.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2 || text.length > 120 || JUNK_TITLE_REGEX.test(text)) return;

        const isMangaLink =
          href.includes('/manga/') ||
          href.includes('/series/') ||
          href.includes('/comic/') ||
          href.includes('/title/') ||
          $(a).find('img').length > 0;

        if (isMangaLink) {
          seen.add(fullUrl);

          const img =
            $(a).find('img').attr('src') ||
            $(a).find('img').attr('data-src') ||
            $(a).find('img').attr('data-lazy-src') ||
            $(a).closest('div, li, article').find('img').attr('src') ||
            $(a).closest('div, li, article').find('img').attr('data-src');

          results.push({
            id: `${sourceName.toLowerCase().replace(/\s+/g, '_')}:${fullUrl}`,
            title: text,
            source: sourceName,
            sourceIcon: `${cleanBase}/favicon.ico`,
            sourceUrl: fullUrl,
            coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
          });
        }
      });

      if (results.length > 0) {
        return results.slice(0, 12);
      }
    } catch {
      // Continue to next search pattern
    }
  }

  return [];
}

import {
  executeStandardizedSearch,
} from './sourceSearchAdapters.ts';
import type {
  StandardizedSearchRequest,
  StandardizedSearchResponse,
} from './sourceSearchAdapters.ts';

export { executeStandardizedSearch };
export type { StandardizedSearchRequest, StandardizedSearchResponse };

/**
 * Main Search Router: Searches across all sources or any targeted source from the catalog
 * Uses the standardized source adapter engine with site-specific schema parsers
 */
export async function searchTitlesAcrossSources(
  query: string,
  sourceFilter = 'all',
  customUrl?: string,
  customName?: string
): Promise<ComicSearchResult[]> {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  const response = await executeStandardizedSearch({
    query: cleanQuery,
    sourceId: sourceFilter,
    baseUrl: customUrl,
    sourceName: customName,
  });

  return response.results;
}

function parseChapterNumber(rawText: string, fullChUrl: string, fallbackIdx: number): string {
  const textMatch =
    rawText.match(/(?:chapter|ch\.?|ep\.?|episode|vol\.?\d+\s*chapter)\s*(\d+(?:\.\d+)?)/i) ||
    rawText.match(/#\s*(\d+(?:\.\d+)?)/) ||
    rawText.match(/^(\d+(?:\.\d+)?)$/);

  if (textMatch) return textMatch[1];

  const urlMatch = fullChUrl.match(/chapter[-_/](\d+)(?:[-_.](\d+))?/i) || fullChUrl.match(/side[-_/](\d+)/i);
  if (urlMatch) {
    if (urlMatch[2]) {
      return `${urlMatch[1]}.${urlMatch[2]}`;
    }
    return urlMatch[1];
  }

  const genMatch = rawText.match(/(\d+(?:\.\d+)?)/);
  if (genMatch) return genMatch[1];

  return String(fallbackIdx);
}

/**
 * Universal Chapter Fetcher: Extracts all chapters for a title from ANY source website
 */
export async function fetchTitleChapters(
  source: string,
  id: string,
  sourceUrl: string
): Promise<SearchChapterItem[]> {
  const lowerSource = (source || '').toLowerCase();
  const safeId = (id || '').toLowerCase();
  const targetUrl = sourceUrl || (id && id.includes('http') ? id.replace(/^[^:]+:/, '') : '');

  // 1. MangaDex REST API
  if (lowerSource.includes('mangadex') || safeId.startsWith('mangadex:')) {
    const mangaId = (id || '').replace(/^mangadex:/, '');
    try {
      const feedUrl = `https://api.mangadex.org/manga/${mangaId}/feed?order[chapter]=asc&limit=100&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];

      const json = await res.json();
      const chapters = json?.data || [];
      const chaptersList: SearchChapterItem[] = [];
      const seenChapterNums = new Set<string>();

      // First pass: English chapters
      for (const ch of chapters) {
        const lang = ch.attributes?.translatedLanguage;
        if (lang === 'en' && !ch.attributes?.externalUrl) {
          const num = ch.attributes?.chapter || '1';
          const chTitle = ch.attributes?.title ? `: ${ch.attributes.title}` : '';
          const key = `en_${num}`;
          if (!seenChapterNums.has(key)) {
            seenChapterNums.add(key);
            chaptersList.push({
              id: ch.id,
              number: num,
              title: `Chapter ${num}${chTitle}`,
              url: `https://mangadex.org/chapter/${ch.id}`,
              source: 'MangaDex',
              releaseDate: ch.attributes?.publishAt?.split('T')[0],
              pagesCount: ch.attributes?.pages,
            });
          }
        }
      }

      // Second pass: all languages fallback
      if (chaptersList.length === 0) {
        for (const ch of chapters) {
          if (!ch.attributes?.externalUrl) {
            const num = ch.attributes?.chapter || '1';
            const lang = ch.attributes?.translatedLanguage || 'any';
            const chTitle = ch.attributes?.title ? `: ${ch.attributes.title}` : '';
            const key = `${lang}_${num}`;
            if (!seenChapterNums.has(key)) {
              seenChapterNums.add(key);
              chaptersList.push({
                id: ch.id,
                number: num,
                title: `[${lang.toUpperCase()}] Chapter ${num}${chTitle}`,
                url: `https://mangadex.org/chapter/${ch.id}`,
                source: 'MangaDex',
                releaseDate: ch.attributes?.publishAt?.split('T')[0],
                pagesCount: ch.attributes?.pages,
              });
            }
          }
        }
      }

      return chaptersList;
    } catch (err: any) {
      console.warn('Error fetching MangaDex chapters:', err?.message);
      return [];
    }
  }

  // 2. Webtoons.com
  if (lowerSource.includes('webtoons') || safeId.startsWith('webtoons:') || (targetUrl && targetUrl.includes('webtoons.com'))) {
    const listUrl = targetUrl || (id || '').replace(/^webtoons:/, '');
    try {
      const res = await fetch(listUrl, {
        headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.webtoons.com/' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const chaptersList: SearchChapterItem[] = [];

      $('li[id^="episode_"]').each((_, el) => {
        const link = $(el).find('a').attr('href');
        if (!link) return;
        const viewerUrl = toAbsoluteUrl(link, 'https://www.webtoons.com');
        const epTitle = $(el).find('span.subj').text().trim();
        const date = $(el).find('span.date').text().trim();

        const epNoMatch = viewerUrl.match(/episode_no=(\d+)/i);
        const epNo = epNoMatch ? epNoMatch[1] : String(chaptersList.length + 1);

        chaptersList.push({
          id: viewerUrl,
          number: epNo,
          title: epTitle || `Episode ${epNo}`,
          url: viewerUrl,
          source: 'Webtoons',
          releaseDate: date,
        });
      });

      return chaptersList;
    } catch (err: any) {
      console.warn('Error fetching Webtoons episodes:', err?.message);
      return [];
    }
  }

  // 3. Universal Chapter Extraction for ANY website (Asura, Bato, Flame, Madara, MangaThemesia, etc.)
  if (targetUrl && targetUrl.startsWith('http')) {
    try {
      const baseUrl = new URL(targetUrl).origin;
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': USER_AGENT, Referer: `${baseUrl}/` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const chaptersList: SearchChapterItem[] = [];
      const seenUrls = new Set<string>();

      const parsedTarget = new URL(targetUrl);
      const cleanMangaPath = parsedTarget.pathname.replace(/\/$/, '');
      const rawMangaSlug = cleanMangaPath.split('/').pop() || '';
      const cleanMangaSlug = rawMangaSlug.replace(/^\d+[-_]?/, '');
      const baseSlug = cleanMangaSlug.replace(/[-_]\d+$/, '');
      const cleanTargetUrl = targetUrl.replace(/\/$/, '').toLowerCase();

      const isMatchingMangaSlug = (chPathAndUrl: string) => {
        const lower = chPathAndUrl.toLowerCase();
        // A chapter URL cannot be identical to the series landing page itself
        if (lower.replace(/\/$/, '') === cleanTargetUrl) return false;
        if (!rawMangaSlug || rawMangaSlug.length <= 3) return true;
        if (lower.includes(rawMangaSlug.toLowerCase())) return true;
        if (cleanMangaSlug && cleanMangaSlug.length > 2 && lower.includes(cleanMangaSlug.toLowerCase())) return true;
        if (baseSlug && baseSlug.length > 2 && lower.includes(baseSlug.toLowerCase())) return true;
        // Also allow chapter links that clearly have /chapter-, /ch-, /episode- segments
        if (lower.includes('/chapter') || lower.includes('/ch-') || lower.includes('/episode') || lower.includes('/vol-')) return true;
        return false;
      };

      // 3a. Madara / WP-Manga AJAX Chapter Retrieval (MangaForFree, Cocomic, MangaTX, Toonily, TopManhua, 1stKiss, etc.)
      const isMadara =
        html.includes('wp-manga') ||
        html.includes('manga-chapters-holder') ||
        html.includes('c-manga-post') ||
        $('div[id^="manga-chapters-holder"]').length > 0;

      if (isMadara) {
        const rawMangaId =
          $('div[id^="manga-chapters-holder"]').attr('data-id') ||
          $('input.rating-post-id').val() ||
          $('input[name="manga"]').val() ||
          html.match(/postid-(\d+)/)?.[1] ||
          html.match(/["']manga_id["']\s*:\s*["']?(\d+)["']?/)?.[1] ||
          html.match(/["']manga["']\s*:\s*["']?(\d+)["']?/)?.[1] ||
          html.match(/data-id=["'](\d+)["']/)?.[1] ||
          html.match(/data-post-id=["'](\d+)["']/)?.[1];

        const mangaId = Array.isArray(rawMangaId) ? rawMangaId[0] : (rawMangaId ? String(rawMangaId) : undefined);

        // When mangaId is known, admin-ajax.php is the canonical Madara endpoint that reliably returns all chapters
        const ajaxEndpoints: Array<{ url: string; isAjax: boolean; action?: string }> = mangaId
          ? [
              { url: `${baseUrl}/wp-admin/admin-ajax.php`, isAjax: true, action: 'manga_get_chapters' },
              { url: `${targetUrl.replace(/\/$/, '')}/ajax/chapters/`, isAjax: false },
              { url: `${baseUrl}/wp-admin/admin-ajax.php`, isAjax: true, action: 'app_manga_get_chapters' },
            ]
          : [
              { url: `${targetUrl.replace(/\/$/, '')}/ajax/chapters/`, isAjax: false },
            ];

        for (const ep of ajaxEndpoints) {
          try {
            let ajaxRes;
            if (ep.isAjax) {
              if (!mangaId) continue;
              const params = new URLSearchParams();
              params.append('action', ep.action || 'manga_get_chapters');
              params.append('manga', mangaId);
              ajaxRes = await fetch(ep.url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                  'User-Agent': USER_AGENT,
                  'X-Requested-With': 'XMLHttpRequest',
                  Referer: targetUrl,
                },
                body: params,
              });
            } else {
              ajaxRes = await fetch(ep.url, {
                method: 'POST',
                headers: {
                  'User-Agent': USER_AGENT,
                  'X-Requested-With': 'XMLHttpRequest',
                  Referer: targetUrl,
                },
              });
            }

            if (ajaxRes && ajaxRes.ok) {
              const ajaxHtml = await ajaxRes.text();
              const $ajax = cheerio.load(ajaxHtml);

              // Prefer specific Madara chapter links first
              let linkElements = $ajax('li.wp-manga-chapter a, .wp-manga-chapter a, .chapter-manhua a');
              if (linkElements.length === 0) {
                linkElements = $ajax('.listing-chapters_wrap a, a[href*="/chapter"], a[href*="-chapter-"], a[href*="/ch-"]');
              }

              linkElements.each((_, a) => {
                const href = $ajax(a).attr('href');
                if (!href || href.startsWith('#') || href.includes('javascript:') || href.includes('/feed') || href.includes('/comment')) return;

                const fullChUrl = toAbsoluteUrl(href, baseUrl);
                if (fullChUrl.replace(/\/$/, '').toLowerCase() === cleanTargetUrl) return;
                if (seenUrls.has(fullChUrl)) return;

                const chPath = new URL(fullChUrl).pathname;
                if (!isMatchingMangaSlug(chPath) && !isMatchingMangaSlug(fullChUrl)) {
                  return;
                }

                seenUrls.add(fullChUrl);

                let rawText = $ajax(a).text().replace(/\s+/g, ' ').trim();
                if (!rawText || rawText === '#') {
                  rawText = $ajax(a).closest('li').text().replace(/\s+/g, ' ').trim();
                }

                const num = parseChapterNumber(rawText, fullChUrl, chaptersList.length + 1);
                const date = $ajax(a).closest('li').find('.chapter-release-date, time, .date').text().trim();

                chaptersList.push({
                  id: fullChUrl,
                  number: num,
                  title: rawText || `Chapter ${num}`,
                  url: fullChUrl,
                  source: source || 'Online Source',
                  releaseDate: date || undefined,
                });
              });

              if (chaptersList.length > 0) break;
            }
          } catch (err: any) {
            console.warn('Madara AJAX chapter error:', err?.message);
          }
        }
      }

      // 3b. Scan all possible static chapter selectors across WordPress, Madara, Manga18 & custom manga themes
      if (chaptersList.length === 0) {
        const chapterSelectors = [
          'div.detail_chapterContent a',
          'div.mg_chapter a',
          'div.chapter_box a',
          'li.wp-manga-chapter a',
          'div.eplister ul li a',
          'ul#chapterlist li a',
          'ul.list_chapter li a',
          'ul.list-chapter li a',
          'div.chapter-list a',
          'ul.row-content-chapter li a',
          'div.chapters-list a',
          'a[href*="/chapter-"]',
          'a[href*="/chapter/"]',
          'a[href*="-chapter-"]',
          'a[href*="/ch-"]',
          'a[href*="/comic/"][href*="chapter"]',
          'a[href*="/episode"]',
          'div[class*=chapter] a',
          'ul.chapters a',
          '.listing-chapters_wrap a',
        ];

        for (const sel of chapterSelectors) {
          $(sel).each((_, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('#') || href.includes('javascript:') || href.includes('download') || href.includes('.pdf') || href.includes('/comments')) return;

            const fullChUrl = toAbsoluteUrl(href, baseUrl);
            if (fullChUrl.replace(/\/$/, '').toLowerCase() === cleanTargetUrl) return;
            if (seenUrls.has(fullChUrl)) return;

            // Path filtering: ensure chapter link belongs strictly to this manga
            const chPath = new URL(fullChUrl).pathname;
            if (!isMatchingMangaSlug(chPath) && !isMatchingMangaSlug(fullChUrl)) {
              return;
            }

            seenUrls.add(fullChUrl);

            const rawText = $(el).text().replace(/\s+/g, ' ').trim();
            const date = $(el).closest('li, div').find('.chapter-release-date, .chapterdate, time, .date').text().trim();

            const num = parseChapterNumber(rawText, fullChUrl, chaptersList.length + 1);

            chaptersList.push({
              id: fullChUrl,
              number: num,
              title: rawText || `Chapter ${num}`,
              url: fullChUrl,
              source: source || 'Online Source',
              releaseDate: date || undefined,
            });
          });

          if (chaptersList.length > 0) break;
        }
      }

      // 3c. MangaThemesia AJAX Chapter Retrieval (if static chapterlist was empty)
      if (chaptersList.length === 0 && (html.includes('mangathemesia') || html.includes('theme-mangathemesia') || html.includes('ts-breadcrumb') || html.includes('eplister'))) {
        const tsPostId =
          $('div#chapterlist').attr('data-id') ||
          html.match(/postid-(\d+)/)?.[1] ||
          html.match(/data-id=["'](\d+)["']/)?.[1];
        if (tsPostId) {
          try {
            const params = new URLSearchParams();
            params.append('action', 'chapter_list');
            params.append('manga_id', tsPostId);
            const tsRes = await fetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': USER_AGENT,
                Referer: targetUrl,
              },
              body: params,
            });
            if (tsRes.ok) {
              const tsHtml = await tsRes.text();
              const $ts = cheerio.load(tsHtml);
              $ts('li a, a').each((_, a) => {
                const href = $ts(a).attr('href');
                if (!href || href.startsWith('#')) return;
                const fullChUrl = toAbsoluteUrl(href, baseUrl);
                if (fullChUrl.replace(/\/$/, '').toLowerCase() === cleanTargetUrl) return;
                if (seenUrls.has(fullChUrl)) return;
                if (!isMatchingMangaSlug(fullChUrl)) return;
                seenUrls.add(fullChUrl);
                const rawText = $ts(a).text().trim();
                const num = parseChapterNumber(rawText, fullChUrl, chaptersList.length + 1);
                chaptersList.push({
                  id: fullChUrl,
                  number: num,
                  title: rawText || `Chapter ${num}`,
                  url: fullChUrl,
                  source: source || 'Online Source',
                });
              });
            }
          } catch (e: any) {
            console.warn('MangaThemesia AJAX error:', e?.message);
          }
        }
      }

      // If no separate chapter list was found, check if this page is a single-chapter doujin / comic reader page
      if (chaptersList.length === 0) {
        const hasViewer = $('.chapter-content, #chapter_content, .reading-content, #reader-area, .vung-doc, div.viewer-cnt, #readerarea').length > 0;
        if (hasViewer) {
          chaptersList.push({
            id: targetUrl,
            number: '1',
            title: 'Chapter 1 (Full Comic / Read Online)',
            url: targetUrl,
            source: source || 'Online Source',
          });
        }
      }

      // Sort chapters numerically ascending (Chapter 1, Chapter 2, ...)
      chaptersList.sort((a, b) => {
        const na = parseFloat(a.number) || 0;
        const nb = parseFloat(b.number) || 0;
        return na - nb;
      });

      return chaptersList;
    } catch (err: any) {
      console.warn('Universal chapter extraction error:', err?.message);
    }
  }

  return [];
}

/**
 * Resolves a MangaDex chapter ID into full comic pages ready for the reader
 */
export async function resolveMangaDexChapter(
  chapterId: string
): Promise<WebComicImportResult | null> {
  const cleanId = chapterId.replace(/^mangadex:/i, '').trim();
  try {
    const chRes = await fetch(`https://api.mangadex.org/chapter/${cleanId}?includes[]=manga`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!chRes.ok) return null;

    const chJson = await chRes.json();
    const ch = chJson.data;
    if (!ch) return null;

    const mangaRel = ch.relationships?.find((r: any) => r.type === 'manga');
    let seriesTitle = 'Manga';
    let author = 'Manga Creator';
    let artist = '';
    let synopsis = '';
    let coverThumbnail: string | undefined;
    let genres: string[] = [];
    let status: string | undefined;

    if (mangaRel?.id) {
      try {
        const mRes = await fetch(
          `https://api.mangadex.org/manga/${mangaRel.id}?includes[]=cover_art&includes[]=author&includes[]=artist`,
          {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (mRes.ok) {
          const mJson = await mRes.json();
          const mData = mJson.data;
          seriesTitle =
            mData?.attributes?.title?.en ||
            mData?.attributes?.title?.['ja-ro'] ||
            Object.values(mData?.attributes?.title || {})[0] ||
            'Manga';

          const desc = mData?.attributes?.description?.en || Object.values(mData?.attributes?.description || {})[0] || '';
          synopsis = typeof desc === 'string' ? desc : '';
          status = mData?.attributes?.status;

          const authors = mData?.relationships
            ?.filter((r: any) => r.type === 'author')
            .map((r: any) => r.attributes?.name)
            .filter(Boolean);
          if (authors && authors.length > 0) {
            author = authors.join(', ');
          }

          const artists = mData?.relationships
            ?.filter((r: any) => r.type === 'artist')
            .map((r: any) => r.attributes?.name)
            .filter(Boolean);
          if (artists && artists.length > 0) {
            artist = artists.join(', ');
          }

          const coverRel = mData?.relationships?.find((r: any) => r.type === 'cover_art');
          const coverFile = coverRel?.attributes?.fileName;
          if (coverFile) {
            coverThumbnail = `https://uploads.mangadex.org/covers/${mangaRel.id}/${coverFile}.256.jpg`;
          }

          if (Array.isArray(mData?.attributes?.tags)) {
            genres = mData.attributes.tags
              .map((t: any) => t.attributes?.name?.en)
              .filter(Boolean)
              .slice(0, 6);
          }
        }
      } catch {}
    }

    const chapterNum = ch.attributes?.chapter || '1';
    const rawEpTitle = ch.attributes?.title ? `Chapter ${chapterNum}: ${ch.attributes.title}` : `Chapter ${chapterNum}`;

    const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${cleanId}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!atHomeRes.ok) return null;

    const atHome = await atHomeRes.json();
    const baseUrl = atHome.baseUrl;
    const hash = atHome.chapter?.hash;
    const files = atHome.chapter?.data || [];

    if (!baseUrl || !hash || files.length === 0) {
      return null;
    }

    const pages = files.map((fileName: string, idx: number) => {
      const originalUrl = `${baseUrl}/data/${hash}/${fileName}`;
      return {
        index: idx + 1,
        originalUrl,
        proxyUrl: `/api/proxy-image?url=${encodeURIComponent(originalUrl)}&referer=${encodeURIComponent(
          'https://mangadex.org/'
        )}`,
        fileName,
      };
    });

    return {
      success: true,
      sourceUrl: `https://mangadex.org/chapter/${cleanId}`,
      seriesTitle,
      episodeTitle: rawEpTitle,
      combinedTitle: `${seriesTitle} - ${rawEpTitle}`,
      author,
      artist: artist || undefined,
      chapterNumber: chapterNum,
      coverThumbnail,
      synopsis: synopsis || undefined,
      genres: genres.length > 0 ? genres : undefined,
      status,
      readingOrder: 'manga-rtl',
      referer: 'https://mangadex.org/',
      pageCount: pages.length,
      pages,
      engineName: 'MangaDex API',
    };
  } catch (err: any) {
    console.error('Error resolving MangaDex chapter:', err);
    return null;
  }
}
