import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import type {
  ComicSearchResult,
  StandardizedSearchRequest,
  StandardizedSearchResponse,
  SupportedSourceEngine,
  SourceSpecificDetails,
  UserSelectedSource,
} from '../types.ts';

export type {
  StandardizedSearchRequest,
  StandardizedSearchResponse,
  SupportedSourceEngine,
  SourceSpecificDetails,
  UserSelectedSource,
};

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Normalizes absolute URLs relative to base domain
 */
export function toAbsoluteUrl(url: string, baseUrl: string): string {
  if (!url) return '';
  const clean = url.trim().replace(/&amp;/g, '&');
  if (clean.startsWith('//')) return `https:${clean}`;
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

// Load Keiyoushi sources catalog cache for any-source lookups
let cachedSources: Array<{
  id: string;
  name: string;
  baseUrl: string;
  pkg?: string;
  extName?: string;
  icon?: string;
}> = [];

export function getKeiyoushiSources() {
  if (cachedSources.length > 0) return cachedSources;
  try {
    const filePath = path.resolve(process.cwd(), 'src/data/keiyoushi-sources.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      cachedSources = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Could not read keiyoushi-sources.json for search adapters:', err);
  }
  return cachedSources;
}

/**
 * Base Source Search Adapter Interface
 */
export interface SourceSearchAdapter {
  readonly id: SupportedSourceEngine;
  readonly name: string;
  readonly sourceType: 'rest_api' | 'html_card' | 'json_ld' | 'cms_theme';
  matches(sourceId: string, baseUrl?: string, pkg?: string): boolean;
  search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]>;
}

// =========================================================================
// 1. MangaDex REST v5 API Adapter
// =========================================================================
export class MangaDexSearchAdapter implements SourceSearchAdapter {
  readonly id = 'mangadex' as const;
  readonly name = 'MangaDex';
  readonly sourceType = 'rest_api' as const;

  matches(sourceId: string, baseUrl = ''): boolean {
    const s = (sourceId + ' ' + baseUrl).toLowerCase();
    return s.includes('mangadex');
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const limit = Math.min(30, Math.max(5, request.limit || 15));
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(
      request.query
    )}&limit=${limit}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
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
          attrs.title?.['zh-ro'] ||
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
        const status = attrs.status ? attrs.status.charAt(0).toUpperCase() + attrs.status.slice(1) : undefined;
        const contentRating = attrs.contentRating;

        const sourceDetails: SourceSpecificDetails = {
          engineName: 'MangaDex REST v5',
          sourceType: 'rest_api',
          schemaVersion: '5.0',
          status,
          contentRating,
          seriesId: item.id,
          extraBadges: [
            status || 'Published',
            contentRating ? `Rated: ${contentRating}` : '',
            attrs.year ? String(attrs.year) : '',
          ].filter(Boolean),
        };

        results.push({
          id: `mangadex:${item.id}`,
          title,
          altTitles: altTitles.slice(0, 5),
          source: 'MangaDex',
          sourceIcon: 'https://mangadex.org/favicon.ico',
          sourceUrl: `https://mangadex.org/title/${item.id}`,
          coverUrl,
          synopsis: typeof synopsis === 'string' ? synopsis.slice(0, 300) : '',
          status,
          authors: authors.length > 0 ? Array.from(new Set(authors)) : undefined,
          genres: genres.slice(0, 6),
          sourceDetails,
        });
      }

      return results;
    } catch (err: any) {
      console.warn('MangaDex standardized search error:', err?.message);
      return [];
    }
  }
}

// =========================================================================
// 2. Webtoons.com Portal Adapter
// =========================================================================
export class WebtoonsSearchAdapter implements SourceSearchAdapter {
  readonly id = 'webtoons' as const;
  readonly name = 'Webtoons';
  readonly sourceType = 'html_card' as const;

  matches(sourceId: string, baseUrl = ''): boolean {
    const s = (sourceId + ' ' + baseUrl).toLowerCase();
    return (s.includes('webtoon') && !s.includes('empire')) || s.includes('webtoons.com');
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const url = `https://www.webtoons.com/en/search?keyword=${encodeURIComponent(request.query)}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://www.webtoons.com/',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const results: ComicSearchResult[] = [];
      const seen = new Set<string>();

      // Accurate Webtoons HTML schema selectors (Originals + Canvas)
      $('a').each((_, el) => {
        const link = $(el).attr('href');
        if (!link || link.startsWith('#')) return;

        const titleEl = $(el).find('strong.title, p.title, .subj, h3');
        if (titleEl.length === 0) return;

        const fullUrl = toAbsoluteUrl(link, 'https://www.webtoons.com');
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title = titleEl.text().trim();
        if (!title) return;

        const author = $(el).find('.author, .txt_author').text().trim() || 'Webtoons';
        const img =
          $(el).find('img').attr('data-url') ||
          $(el).find('img').attr('src') ||
          '';
        const views = $(el).find('.view_count, .txt_num, .count').text().trim();
        const genre = $(el).find('.genre, .txt_genre').text().trim();
        const isCanvas = fullUrl.includes('/canvas/') || fullUrl.includes('/challenge/');

        // Extract title_no parameter from Webtoons URL
        const titleNoMatch = fullUrl.match(/title_no=(\d+)/i);
        const titleNo = titleNoMatch ? titleNoMatch[1] : undefined;

        const sourceDetails: SourceSpecificDetails = {
          engineName: 'Webtoons Portal',
          sourceType: 'html_card',
          viewCount: views || undefined,
          isOfficial: !isCanvas,
          isCanvas,
          seriesId: titleNo,
          status: 'Ongoing',
          extraBadges: [
            isCanvas ? 'Canvas' : 'Original',
            views || '',
            genre || '',
          ].filter(Boolean),
        };

        results.push({
          id: `webtoons:${fullUrl}`,
          title,
          source: 'Webtoons',
          sourceIcon: 'https://www.webtoons.com/favicon.ico',
          sourceUrl: fullUrl,
          coverUrl: img,
          synopsis: views ? `Official Webtoon • ${views}` : 'Official Webtoon on Webtoons.com',
          authors: [author],
          genres: genre ? [genre, 'Webtoon', 'Manhwa'] : ['Webtoon', 'Manhwa'],
          viewCount: views || undefined,
          status: 'Ongoing',
          sourceDetails,
        });
      });

      return results.slice(0, 10);
    } catch (err: any) {
      console.warn('Webtoons standardized search error:', err?.message);
      return [];
    }
  }
}

// =========================================================================
// 3. Comix.to Engine Adapter
// =========================================================================
export class ComixToSearchAdapter implements SourceSearchAdapter {
  readonly id = 'comixto' as const;
  readonly name = 'Comix.to';
  readonly sourceType = 'html_card' as const;

  matches(sourceId: string, baseUrl = ''): boolean {
    const s = (sourceId + ' ' + baseUrl).toLowerCase();
    return s.includes('comix.to') || s.includes('comixto');
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || 'https://comix.to').replace(/\/+$/, '');
    const searchUrls = [
      `${cleanBase}/search?q=${encodeURIComponent(request.query)}`,
      `${cleanBase}/search?keyword=${encodeURIComponent(request.query)}`,
      `https://comix.to/search?q=${encodeURIComponent(request.query)}`,
    ];

    for (const url of searchUrls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const results: ComicSearchResult[] = [];
        const seen = new Set<string>();

        $('a[href*="/comic/"], a[href*="/manga/"], a[href*="/title/"]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          const fullUrl = toAbsoluteUrl(href, cleanBase);
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);

          const titleEl = $(el).find('h3, h4, .title, .name').first();
          const title = (titleEl.length > 0 ? titleEl.text() : $(el).text()).trim().replace(/\s+/g, ' ');
          if (!title || title.length < 2 || /^\d+(\.\d+)?$/.test(title)) return;

          const imgEl = $(el).find('img').first();
          const img = imgEl.attr('data-src') || imgEl.attr('src');

          results.push({
            id: `comixto:${fullUrl}`,
            title,
            source: 'Comix.to',
            sourceIcon: 'https://comix.to/favicon.ico',
            sourceUrl: fullUrl,
            coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
            synopsis: 'Manga / Comic on Comix.to',
            genres: ['Manga', 'Manhwa', 'Comics'],
            status: 'Ongoing',
          });
        });

        if (results.length > 0) {
          return results.slice(0, request.limit || 15);
        }
      } catch (err: any) {
        console.warn('Comix.to search error:', err?.message);
      }
    }

    return [];
  }
}

// =========================================================================
// 4. Asura Scans Engine Adapter
// =========================================================================
export class AsuraScansSearchAdapter implements SourceSearchAdapter {
  readonly id = 'asura' as const;
  readonly name = 'Asura Scans';
  readonly sourceType = 'cms_theme' as const;

  matches(sourceId: string, baseUrl = ''): boolean {
    const s = (sourceId + ' ' + baseUrl).toLowerCase();
    return s.includes('asura') || s.includes('asuracomic');
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    let cleanBase = (request.baseUrl || 'https://asurascans.com').replace(/\/+$/, '');
    if (cleanBase.includes('asuracomic.net')) {
      cleanBase = 'https://asurascans.com';
    }

    const endpoints = [
      `${cleanBase}/browse/comics?search=${encodeURIComponent(request.query)}`,
      `${cleanBase}/comics?search=${encodeURIComponent(request.query)}`,
      `${cleanBase}/series?search=${encodeURIComponent(request.query)}`,
      `${cleanBase}/browse/comics?search=${encodeURIComponent(request.query)}&page=1`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Referer: `${cleanBase}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const results: ComicSearchResult[] = [];
        const seen = new Set<string>();

        // 1. Primary selector: Modern Asura series-card container
        const cardElements = $('.series-card, div[data-series-id]');
        if (cardElements.length > 0) {
          cardElements.each((_, card) => {
            const cardEl = $(card);
            const linkEl = cardEl.find('a[href*="/comics/"], a[href*="/series/"]').first();
            const href = linkEl.attr('href') || cardEl.find('a').first().attr('href');
            if (!href) return;

            const fullUrl = toAbsoluteUrl(href, cleanBase);
            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);

            const titleEl = cardEl.find('h3, h4, .series-title').first();
            const imgEl = cardEl.find('img').first();
            const rawTitle = titleEl.text().trim() || imgEl.attr('alt') || '';
            const title = rawTitle.replace(/\s+/g, ' ').trim();
            if (!title) return;

            const img = imgEl.attr('src') || imgEl.attr('data-src') || '';

            // Rating (e.g. 9.8)
            const ratingEl = cardEl
              .find('span')
              .filter((_, el) => /^\d+\.\d+$/.test($(el).text().trim()))
              .first();
            const rating = ratingEl.text().trim() || undefined;

            // Latest chapter or total chapters (e.g. 201 Chapters)
            const chEl = cardEl.find('span:contains("Ch"), span:contains("Chapter")').first();
            const chText = chEl.text().trim().replace(/\s+/g, ' ');
            const chMatch = chText.match(/(\d+(?:\.\d+)?)/);
            const latestChapter = chMatch
              ? chText.includes('Chapter') && !chText.includes('Chs')
                ? `Chapter ${chMatch[1]}`
                : `${chMatch[1]} Chapters`
              : chText || undefined;

            // Status (e.g. completed, ongoing, hiatus)
            const statusEl = cardEl
              .find('span:contains("completed"), span:contains("ongoing"), span:contains("hiatus")')
              .first();
            const statusRaw = statusEl.text().trim() || 'Ongoing';
            const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);

            const sourceDetails: SourceSpecificDetails = {
              engineName: 'Asura Scans Engine',
              sourceType: 'cms_theme',
              rating,
              latestChapterNumber: chMatch ? chMatch[1] : undefined,
              status,
              extraBadges: [
                rating ? `★ ${rating}` : '',
                latestChapter || '',
                status ? status.toUpperCase() : '',
              ].filter(Boolean),
            };

            results.push({
              id: `asura:${fullUrl}`,
              title,
              source: 'Asura Scans',
              sourceIcon:
                'https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/en/asurascans/res/mipmap-xhdpi/ic_launcher.png',
              sourceUrl: fullUrl,
              coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
              synopsis: latestChapter
                ? `${latestChapter} • ${status} Manhwa on Asura Scans`
                : 'Action Manhwa on Asura Scans',
              genres: ['Action', 'Manhwa', 'Fantasy'],
              rating,
              latestChapter,
              status,
              sourceDetails,
            });
          });
        }

        // 2. Fallback selector for alternate layouts
        if (results.length === 0) {
          $('a[href*="/comics/"], a[href*="/series/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            const fullUrl = toAbsoluteUrl(href, cleanBase);
            if (seen.has(fullUrl)) return;

            const titleEl = $(el).find('h3, h4, .series-title').first();
            const imgEl = $(el).find('img').first();
            const rawText = (titleEl.length > 0 ? titleEl.text() : $(el).text()).trim();
            const title = (rawText.replace(/^[\d.]+\s*$/, '').trim() || imgEl.attr('alt') || '')
              .replace(/\s+/g, ' ')
              .trim();
            if (!title || /^\d+(\.\d+)?$/.test(title)) return;

            seen.add(fullUrl);
            const img = imgEl.attr('data-src') || imgEl.attr('src') || '';
            const ratingText = $(el).find('.rating, .numscore, .score, span:contains(".")').text().trim();
            const ratingMatch = ratingText.match(/(\d+\.\d+)/);
            const rating = ratingMatch ? ratingMatch[1] : undefined;

            const chapterText = $(el).find('.text-xs, .epxs, span:contains("Chapter"), span:contains("Ch")').text().trim();
            const chMatch = chapterText.match(/(?:Chapter|Ch\.?)\s*(\d+(?:\.\d+)?)/i);
            const latestChapter = chMatch ? `Chapter ${chMatch[1]}` : undefined;

            results.push({
              id: `asura:${fullUrl}`,
              title,
              source: 'Asura Scans',
              sourceIcon:
                'https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/en/asurascans/res/mipmap-xhdpi/ic_launcher.png',
              sourceUrl: fullUrl,
              coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
              synopsis: latestChapter ? `${latestChapter} • Action Manhwa` : 'Action Manhwa on Asura Scans',
              genres: ['Action', 'Manhwa', 'Fantasy'],
              rating,
              latestChapter,
              status: 'Ongoing',
            });
          });
        }

        if (results.length > 0) {
          const maxLimit = request.limit && request.limit > 0 ? request.limit : 50;
          return results.slice(0, maxLimit);
        }
      } catch (err: any) {
        console.warn('Asura search endpoint error:', err?.message);
      }
    }

    return [];
  }
}

// =========================================================================
// 4. Bato.to v3x Adapter
// =========================================================================
export class BatotoSearchAdapter implements SourceSearchAdapter {
  readonly id = 'batoto' as const;
  readonly name = 'Bato.to';
  readonly sourceType = 'html_card' as const;

  matches(sourceId: string, baseUrl = ''): boolean {
    const s = (sourceId + ' ' + baseUrl).toLowerCase();
    return s.includes('bato') || s.includes('batoto');
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || 'https://bato.to').replace(/\/+$/, '');
    const url = `${cleanBase}/v3x-search?word=${encodeURIComponent(request.query)}`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const results: ComicSearchResult[] = [];
      const seen = new Set<string>();

      $('div.item, div.line-b, div.col').each((_, el) => {
        const linkEl = $(el).find('a.item-title, a[href*="/series/"], a[href*="/title/"]').first();
        const href = linkEl.attr('href');
        if (!href) return;

        const fullUrl = toAbsoluteUrl(href, cleanBase);
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title = linkEl.text().trim();
        if (!title) return;

        const imgEl = $(el).find('img.rounded, img').first();
        const img = imgEl.attr('src') || imgEl.attr('data-src');

        const author = $(el).find('div.item-alias, div.item-author, span.author').text().trim();
        const status = $(el).find('.badge, .item-status, .badge-secondary').text().trim();
        const genres: string[] = [];
        $(el).find('div.item-genre span, .genres a').each((_, g) => {
          const name = $(g).text().trim();
          if (name) genres.push(name);
        });

        const latestChEl = $(el).find('a.visited, div.item-volch a').first();
        const latestCh = latestChEl.text().trim();

        const sourceDetails: SourceSpecificDetails = {
          engineName: 'Bato.to v3x',
          sourceType: 'html_card',
          status: status || undefined,
          extraBadges: [status || '', latestCh || ''].filter(Boolean),
        };

        results.push({
          id: `batoto:${fullUrl}`,
          title,
          source: 'Bato.to',
          sourceIcon: `${cleanBase}/favicon.ico`,
          sourceUrl: fullUrl,
          coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
          synopsis: latestCh ? `Latest: ${latestCh} • Bato.to` : 'Manga / Manhwa on Bato.to',
          status: status || undefined,
          authors: author ? [author] : undefined,
          genres: genres.length > 0 ? genres.slice(0, 5) : ['Manga', 'Manhwa'],
          latestChapter: latestCh || undefined,
          sourceDetails,
        });
      });

      return results.slice(0, 10);
    } catch (err: any) {
      console.warn('Batoto standardized search error:', err?.message);
      return [];
    }
  }
}

// =========================================================================
// 5. Flame Comics Adapter
// =========================================================================
export class FlameComicsSearchAdapter implements SourceSearchAdapter {
  readonly id = 'flame' as const;
  readonly name = 'Flame Comics';
  readonly sourceType = 'cms_theme' as const;

  matches(sourceId: string, baseUrl = ''): boolean {
    const s = (sourceId + ' ' + baseUrl).toLowerCase();
    return s.includes('flame') || s.includes('flamecomics');
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || 'https://flamecomics.xyz').replace(/\/+$/, '');
    const url = `${cleanBase}/series?page=1&name=${encodeURIComponent(request.query)}`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const results: ComicSearchResult[] = [];
      const seen = new Set<string>();

      $('a[href*="/series/"], div.bsx').each((_, el) => {
        const linkEl = $(el).is('a') ? $(el) : $(el).find('a').first();
        const href = linkEl.attr('href');
        if (!href) return;

        const fullUrl = toAbsoluteUrl(href, cleanBase);
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title =
          $(el).find('h3, .series-title, strong, .tt').first().text().trim() ||
          linkEl.text().trim();
        if (!title) return;

        const img =
          $(el).find('img').attr('data-src') ||
          $(el).find('img').attr('src') ||
          '';

        const rating = $(el).find('.numscore, .score').text().trim();
        const latestCh = $(el).find('.epxs, .chapter').text().trim();
        const type = $(el).find('.type').text().trim() || 'Manhwa';

        const sourceDetails: SourceSpecificDetails = {
          engineName: 'Flame Comics Engine',
          sourceType: 'cms_theme',
          rating: rating || undefined,
          status: 'Ongoing',
          extraBadges: [rating ? `★ ${rating}` : '', type, latestCh || ''].filter(Boolean),
        };

        results.push({
          id: `flame:${fullUrl}`,
          title,
          source: 'Flame Comics',
          sourceIcon: `${cleanBase}/favicon.ico`,
          sourceUrl: fullUrl,
          coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
          synopsis: latestCh ? `Latest: ${latestCh} • Flame Comics` : 'Action Manhwa on Flame Comics',
          genres: ['Action', 'Manhwa', type],
          rating: rating || undefined,
          latestChapter: latestCh || undefined,
          status: 'Ongoing',
          sourceDetails,
        });
      });

      return results.slice(0, 10);
    } catch (err: any) {
      console.warn('Flame Comics standardized search error:', err?.message);
      return [];
    }
  }
}

// =========================================================================
// 6. MangaBox / MangaKakalot / Manganato Adapter
// =========================================================================
export class MangaBoxKakalotSearchAdapter implements SourceSearchAdapter {
  readonly id = 'mangakakalot' as const;
  readonly name = 'MangaKakalot / MangaBox';
  readonly sourceType = 'html_card' as const;

  matches(sourceId: string, baseUrl = '', pkg = ''): boolean {
    const s = (sourceId + ' ' + baseUrl + ' ' + pkg).toLowerCase();
    return (
      s.includes('mangakakalot') ||
      s.includes('manganato') ||
      s.includes('mangabox') ||
      s.includes('mangafire') ||
      s.includes('mangafreak') ||
      s.includes('mangahere')
    );
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || 'https://mangakakalot.com').replace(/\/+$/, '');
    const searchUrls = [
      `${cleanBase}/search/story/${encodeURIComponent(request.query).replace(/%20/g, '_')}`,
      `${cleanBase}/search/${encodeURIComponent(request.query)}`,
    ];

    for (const url of searchUrls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const results: ComicSearchResult[] = [];
        const seen = new Set<string>();

        $('div.story_item, div.search-story-item').each((_, el) => {
          const linkEl = $(el).find('h3.story_name a, a.item_img, a').first();
          const href = linkEl.attr('href');
          if (!href) return;

          const fullUrl = toAbsoluteUrl(href, cleanBase);
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);

          const title = $(el).find('h3.story_name a, .story_name a').first().text().trim();
          if (!title) return;

          const img = $(el).find('img').first().attr('src');
          const author = $(el).find('span:contains("Author"), span.story_author').text().replace(/Author\s*:\s*/i, '').trim();
          const views = $(el).find('span:contains("View")').text().replace(/View\s*:\s*/i, '').trim();
          const latestCh = $(el).find('em.story_chapter a, a.story_chapter').first().text().trim();

          const sourceDetails: SourceSpecificDetails = {
            engineName: 'MangaBox / Kakalot Engine',
            sourceType: 'html_card',
            viewCount: views || undefined,
            extraBadges: [views ? `👁 ${views}` : '', latestCh || ''].filter(Boolean),
          };

          results.push({
            id: `kakalot:${fullUrl}`,
            title,
            source: request.sourceName || 'MangaKakalot',
            sourceIcon: `${cleanBase}/favicon.ico`,
            sourceUrl: fullUrl,
            coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
            synopsis: latestCh ? `Latest: ${latestCh}` : `Available on ${request.sourceName || 'MangaKakalot'}`,
            authors: author ? [author] : undefined,
            viewCount: views || undefined,
            latestChapter: latestCh || undefined,
            sourceDetails,
          });
        });

        if (results.length > 0) return results.slice(0, 12);
      } catch (err: any) {
        console.warn('MangaBox search error:', err?.message);
      }
    }

    return [];
  }
}

// =========================================================================
// 7. Madara WP-Manga CMS Adapter
// =========================================================================
export class MadaraSearchAdapter implements SourceSearchAdapter {
  readonly id = 'madara' as const;
  readonly name = 'Madara (WP-Manga)';
  readonly sourceType = 'cms_theme' as const;

  matches(sourceId: string, baseUrl = '', pkg = ''): boolean {
    const s = (sourceId + ' ' + baseUrl + ' ' + pkg).toLowerCase();
    return (
      s.includes('madara') ||
      s.includes('wp-manga') ||
      s.includes('wpmanga') ||
      s.includes('toonily') ||
      s.includes('toongod') ||
      s.includes('toonhey') ||
      s.includes('webtoonxyz') ||
      s.includes('webtoonscan') ||
      s.includes('allporncomic') ||
      s.includes('allproncomic') ||
      s.includes('athreascans') ||
      s.includes('athrea') ||
      s.includes('divascans') ||
      s.includes('diva') ||
      s.includes('toontop') ||
      s.includes('mangatx') ||
      s.includes('1stkiss')
    );
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || '').replace(/\/+$/, '');
    if (!cleanBase) return [];

    const searchUrls = [
      `${cleanBase}/?s=${encodeURIComponent(request.query)}&post_type=wp-manga`,
      `${cleanBase}/search?s=${encodeURIComponent(request.query)}`,
    ];

    for (const url of searchUrls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const results: ComicSearchResult[] = [];
        const seen = new Set<string>();

        $('div.c-tabs-item__content, div.row.c-tabs-item__content').each((_, el) => {
          const linkEl = $(el).find('.post-title h3 a, .post-title h4 a, .post-title a').first();
          const href = linkEl.attr('href');
          if (!href) return;

          const fullUrl = toAbsoluteUrl(href, cleanBase);
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);

          const title = linkEl.text().trim();
          if (!title) return;

          const imgEl = $(el).find('.tab-thumb img').first();
          const img = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('src');
          const score = $(el).find('.score, .post-total-rating .score').first().text().trim();
          const latestCh = $(el).find('.chapter-item .chapter a, .latest-chap a').first().text().trim();
          const author = $(el).find('.mg_author .summary-content a').text().trim();

          const sourceDetails: SourceSpecificDetails = {
            engineName: 'Madara WP-Manga',
            sourceType: 'cms_theme',
            rating: score || undefined,
            extraBadges: [score ? `★ ${score}` : '', latestCh || ''].filter(Boolean),
          };

          results.push({
            id: `madara:${fullUrl}`,
            title,
            source: request.sourceName || 'Madara Source',
            sourceIcon: `${cleanBase}/favicon.ico`,
            sourceUrl: fullUrl,
            coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
            synopsis: latestCh ? `Latest: ${latestCh}` : undefined,
            rating: score || undefined,
            latestChapter: latestCh || undefined,
            authors: author ? [author] : undefined,
            sourceDetails,
          });
        });

        if (results.length > 0) return results.slice(0, 12);
      } catch (err: any) {
        console.warn('Madara search error:', err?.message);
      }
    }

    return [];
  }
}

// =========================================================================
// 8. MangaThemesia CMS Adapter
// =========================================================================
export class MangaThemesiaSearchAdapter implements SourceSearchAdapter {
  readonly id = 'mangathemesia' as const;
  readonly name = 'MangaThemesia';
  readonly sourceType = 'cms_theme' as const;

  matches(sourceId: string, baseUrl = '', pkg = ''): boolean {
    const s = (sourceId + ' ' + baseUrl + ' ' + pkg).toLowerCase();
    return (
      s.includes('mangathemesia') ||
      s.includes('wpmangastream') ||
      s.includes('theblank') ||
      s.includes('omegascans') ||
      s.includes('omega')
    );
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || '').replace(/\/+$/, '');
    if (!cleanBase) return [];

    const searchUrls = [
      `${cleanBase}/?s=${encodeURIComponent(request.query)}`,
      `${cleanBase}/manga/?title=${encodeURIComponent(request.query)}`,
    ];

    for (const url of searchUrls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const results: ComicSearchResult[] = [];
        const seen = new Set<string>();

        $('div.bsx').each((_, el) => {
          const linkEl = $(el).find('a[itemprop="url"], a').first();
          const href = linkEl.attr('href');
          if (!href) return;

          const fullUrl = toAbsoluteUrl(href, cleanBase);
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);

          const title = $(el).find('.tt, h4').first().text().trim() || linkEl.attr('title') || '';
          if (!title) return;

          const imgEl = $(el).find('img.ts-post-image, img').first();
          const img = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('src');
          const score = $(el).find('.numscore').text().trim();
          const latestCh = $(el).find('.epxs').first().text().trim();

          const sourceDetails: SourceSpecificDetails = {
            engineName: 'MangaThemesia',
            sourceType: 'cms_theme',
            rating: score || undefined,
            extraBadges: [score ? `★ ${score}` : '', latestCh || ''].filter(Boolean),
          };

          results.push({
            id: `themesia:${fullUrl}`,
            title,
            source: request.sourceName || 'MangaThemesia Source',
            sourceIcon: `${cleanBase}/favicon.ico`,
            sourceUrl: fullUrl,
            coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
            synopsis: latestCh ? `Latest: ${latestCh}` : undefined,
            rating: score || undefined,
            latestChapter: latestCh || undefined,
            sourceDetails,
          });
        });

        if (results.length > 0) return results.slice(0, 12);
      } catch (err: any) {
        console.warn('MangaThemesia search error:', err?.message);
      }
    }

    return [];
  }
}

// =========================================================================
// 9. Manga18 / 18PornComic Adapter (Tachiyomi lib-multisrc manga18)
// =========================================================================
export class Manga18SearchAdapter implements SourceSearchAdapter {
  readonly id = 'manga18' as const;
  readonly name = 'Manga18 / 18PornComic';
  readonly sourceType = 'html_card' as const;

  matches(sourceId: string, baseUrl = '', pkg = ''): boolean {
    const s = (sourceId + ' ' + baseUrl + ' ' + pkg).toLowerCase();
    return (
      s.includes('manga18') ||
      s.includes('18porncomic') ||
      s.includes('eighteenporncomic') ||
      s.includes('manga18fx') ||
      s.includes('manga18cc') ||
      s.includes('nhentai') ||
      s.includes('simply-hentai') ||
      s.includes('simplyhentai') ||
      s.includes('oppai')
    );
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || 'https://18porncomic.com').replace(/\/+$/, '');
    const url = `${cleanBase}/list-manga?search=${encodeURIComponent(request.query)}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: `${cleanBase}/`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const results: ComicSearchResult[] = [];
      const seen = new Set<string>();

      // Card structure in Manga18 multisrc is .story_item
      $('div.story_item').each((_, card) => {
        let title = $(card).find('.mg_name a').first().text().trim();
        let linkEl = $(card).find('.story_images a, .mg_name a').first();
        if (!title) {
          title = $(card).find('.story_images a').attr('title') || linkEl.attr('title') || '';
        }
        title = title.replace(/\s+/g, ' ').trim();
        if (!title) return;

        const href = linkEl.attr('href');
        if (!href) return;

        const fullUrl = toAbsoluteUrl(href, cleanBase);
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const imgEl = $(card).find('img').first();
        const img = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-original');
        const latestCh = $(card).find('.mg_chapter .chapter_count a, .chapter-item a').first().text().trim();

        const sourceDetails: SourceSpecificDetails = {
          engineName: request.sourceName || 'Manga18 Engine',
          sourceType: 'html_card',
          extraBadges: [latestCh || '', '18+'].filter(Boolean),
        };

        results.push({
          id: `${(request.sourceName || 'manga18').toLowerCase().replace(/\s+/g, '_')}:${fullUrl}`,
          title,
          source: request.sourceName || '18 Porn Comic',
          sourceIcon: `${cleanBase}/favicon.ico`,
          sourceUrl: fullUrl,
          coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
          synopsis: latestCh ? `Latest: ${latestCh}` : `Available on ${request.sourceName || 'Manga18'}`,
          latestChapter: latestCh || undefined,
          sourceDetails,
        });
      });

      return results.slice(0, 16);
    } catch (err: any) {
      console.warn('Manga18 search error:', err?.message);
      return [];
    }
  }
}

// =========================================================================
// 10. Generic CMS / Any-Source Fallback Adapter
// =========================================================================
export class GenericCmsSearchAdapter implements SourceSearchAdapter {
  readonly id = 'generic' as const;
  readonly name = 'Generic CMS';
  readonly sourceType = 'html_card' as const;

  matches(): boolean {
    return true; // Fallback matches all
  }

  async search(request: StandardizedSearchRequest): Promise<ComicSearchResult[]> {
    const cleanBase = (request.baseUrl || '').replace(/\/+$/, '');
    if (!cleanBase) return [];

    const searchUrls = [
      `${cleanBase}/search?q=${encodeURIComponent(request.query)}`,
      `${cleanBase}/?s=${encodeURIComponent(request.query)}`,
      `${cleanBase}/series?page=1&name=${encodeURIComponent(request.query)}`,
      `${cleanBase}/manga?search=${encodeURIComponent(request.query)}`,
      `${cleanBase}/list-manga?search=${encodeURIComponent(request.query)}`,
      `${cleanBase}/search?keyword=${encodeURIComponent(request.query)}`,
    ];

    const JUNK_PATH_REGEX = /\/(list-manga|all-manga|categories|category|genres|genre|tags|tag|authors|author|popular|latest|top|filter|browse|search|bookmark|bookmarks|history|privacy|terms|dmca|contact|random|login|register|user|status|type)\/?$/i;
    const JUNK_TITLE_REGEX = /^(popular|latest|trending|home|all|directory|random|bookmarks|search|top|genres|completed|ongoing|status|rank|type|chapter|read now|next|prev|register|login|sign in|sign up|contact us|privacy policy|dmca|disclaimer|raw|download|free|manga|comic|online)$/i;

    const queryTokens = request.query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length >= 3);

    for (const sUrl of searchUrls) {
      try {
        const res = await fetch(sUrl, {
          headers: { 'User-Agent': USER_AGENT, Referer: `${cleanBase}/` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);
        const results: ComicSearchResult[] = [];
        const seen = new Set<string>();

        const cardSelectors = [
          'div.story_item',
          'div.c-tabs-item__content',
          'div.bsx',
          'div.item_story',
          'div.story-item',
          'div.item',
          'div.book-item',
          'div.manga-item',
          'div.list-truyen-item-wrap',
          'article.bs',
          'div.thumb-item',
          'div.manga-card',
          'div.group',
        ];

        for (const sel of cardSelectors) {
          if ($(sel).length > 0) {
            $(sel).each((_, card) => {
              // Try to find the primary title link first
              let linkEl = $(card).find('.mg_name a, .story_name a, .story-title a, .post-title a, .title a, .series-title a, h1 a, h2 a, h3 a, h4 a, a[href*="/comic/"], a[href*="/manga/"], a[href*="/series/"]').first();
              if (linkEl.length === 0) {
                linkEl = $(card).find('a').first();
              }

              let href = linkEl.attr('href');
              if (!href) return;

              // Filter out navigation/category URLs
              if (JUNK_PATH_REGEX.test(href)) return;

              // Normalize href to remove language/action subpaths like /english, /raw, /download
              let fullUrl = toAbsoluteUrl(href, cleanBase);
              fullUrl = fullUrl.replace(/\/(english|raw|download|free|read)\/?$/i, '');

              // Extract best title: prioritize explicit title elements over inner badge links
              let title =
                $(card).find('.mg_name a, .story_name a, .story-title a, .post-title a, .title a, h1 a, h2 a, h3 a, h4 a, .name a').first().text().trim() ||
                $(card).find('.story_images a').attr('title') ||
                $(card).find('.mg_name, .story_name, .story-title, .post-title, .title, h1, h2, h3, h4, .name').first().text().trim() ||
                linkEl.text().trim();

              if (!title || JUNK_TITLE_REGEX.test(title)) {
                title = $(card).find('img').attr('alt') || linkEl.attr('title') || '';
              }

              title = title.replace(/\s+/g, ' ').trim();
              if (!title || title.length < 2 || JUNK_TITLE_REGEX.test(title)) return;

              if (seen.has(fullUrl)) return;

              // Relevancy check: If the page returned default frontpage popular cards, check token overlap
              const lowerTitle = title.toLowerCase();
              if (queryTokens.length > 0) {
                const hasMatch = queryTokens.some((tok) => lowerTitle.includes(tok));
                if (!hasMatch && $(sel).length > 20) {
                  // Ignore popular/trending fallback lists that don't match query
                  return;
                }
              }

              seen.add(fullUrl);

              const imgEl = $(card).find('img').first();
              const img = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('data-original') || imgEl.attr('src');
              const latestCh = $(card).find('.mg_chapter .chapter_count a, .chapter, .latest-chapter, .epxs, .chapter-item').first().text().trim();

              const sourceDetails: SourceSpecificDetails = {
                engineName: request.sourceName || 'Catalog Engine',
                sourceType: 'html_card',
                extraBadges: [latestCh || ''].filter(Boolean),
              };

              results.push({
                id: `${(request.sourceName || 'generic').toLowerCase().replace(/\s+/g, '_')}:${fullUrl}`,
                title,
                source: request.sourceName || 'Online Source',
                sourceIcon: `${cleanBase}/favicon.ico`,
                sourceUrl: fullUrl,
                coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
                synopsis: latestCh ? `Latest: ${latestCh}` : `Available on ${request.sourceName || 'Source'}`,
                latestChapter: latestCh || undefined,
                sourceDetails,
              });
            });

            if (results.length > 0) return results.slice(0, 16);
          }
        }

        // If card selectors produced no results, fallback to smart manga anchor scanning
        $('a[href*="/manga/"], a[href*="/comic/"], a[href*="/series/"], a[href*="/title/"]').each((_, a) => {
          let href = $(a).attr('href');
          if (!href) return;
          if (JUNK_PATH_REGEX.test(href)) return;

          let fullUrl = toAbsoluteUrl(href, cleanBase);
          fullUrl = fullUrl.replace(/\/(english|raw|download|free|read)\/?$/i, '');

          if (seen.has(fullUrl)) return;

          let title = $(a).text().trim() || $(a).attr('title') || $(a).find('img').attr('alt') || '';
          if (!title || title.length < 2) {
            title = $(a).closest('div, li, article').find('h1, h2, h3, h4, .title, .name').text().trim();
          }

          title = title.replace(/\s+/g, ' ').trim();
          if (!title || title.length < 2 || JUNK_TITLE_REGEX.test(title)) return;

          const lowerTitle = title.toLowerCase();
          if (queryTokens.length > 0) {
            const hasMatch = queryTokens.some((tok) => lowerTitle.includes(tok));
            if (!hasMatch) return;
          }

          seen.add(fullUrl);

          const parentBox = $(a).closest('div, li, article');
          const imgEl = $(a).find('img').length > 0 ? $(a).find('img').first() : parentBox.find('img').first();
          const img = imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || imgEl.attr('data-original') || imgEl.attr('src');
          const latestCh = parentBox.find('.chapter, .latest-chapter, .epxs, .chapter-item').first().text().trim();

          results.push({
            id: `${(request.sourceName || 'generic').toLowerCase().replace(/\s+/g, '_')}:${fullUrl}`,
            title,
            source: request.sourceName || 'Online Source',
            sourceIcon: `${cleanBase}/favicon.ico`,
            sourceUrl: fullUrl,
            coverUrl: img ? toAbsoluteUrl(img, cleanBase) : undefined,
            synopsis: latestCh ? `Latest: ${latestCh}` : `Available on ${request.sourceName || 'Source'}`,
            latestChapter: latestCh || undefined,
            sourceDetails: {
              engineName: request.sourceName || 'Generic CMS',
              sourceType: 'html_card',
              extraBadges: [latestCh || ''].filter(Boolean),
            },
          });
        });

        if (results.length > 0) return results.slice(0, 16);
      } catch {
        // Continue to next URL pattern
      }
    }

    return [];
  }
}

// Instantiate all adapters in order of priority
export const ALL_SEARCH_ADAPTERS: SourceSearchAdapter[] = [
  new MangaDexSearchAdapter(),
  new WebtoonsSearchAdapter(),
  new ComixToSearchAdapter(),
  new AsuraScansSearchAdapter(),
  new BatotoSearchAdapter(),
  new FlameComicsSearchAdapter(),
  new MangaBoxKakalotSearchAdapter(),
  new MadaraSearchAdapter(),
  new MangaThemesiaSearchAdapter(),
  new Manga18SearchAdapter(),
  new GenericCmsSearchAdapter(),
];

/**
 * Resolves the most accurate search adapter for a standardized request
 */
export function resolveSearchAdapter(request: StandardizedSearchRequest): SourceSearchAdapter {
  const sourceId = request.sourceId || '';
  const baseUrl = request.baseUrl || '';

  // 1. If an explicit sourceEngine is supplied
  if (request.sourceEngine && request.sourceEngine !== 'all') {
    const found = ALL_SEARCH_ADAPTERS.find((a) => a.id === request.sourceEngine);
    if (found) return found;
  }

  // 2. Check catalog to look up package name or official baseUrl if sourceId is an extension ID
  const catalog = getKeiyoushiSources();
  const catalogMatch = catalog.find((s) => s.id === sourceId || s.name.toLowerCase() === sourceId.toLowerCase());
  const effectiveBaseUrl = baseUrl || catalogMatch?.baseUrl || '';
  const effectivePkg = catalogMatch?.pkg || '';

  // 3. Match against registered adapters (excluding fallback)
  for (const adapter of ALL_SEARCH_ADAPTERS.slice(0, -1)) {
    if (adapter.matches(sourceId, effectiveBaseUrl, effectivePkg)) {
      return adapter;
    }
  }

  // 4. Fallback to generic CMS adapter
  return ALL_SEARCH_ADAPTERS[ALL_SEARCH_ADAPTERS.length - 1];
}

/**
 * Master Standardized Search Execution Function
 * Handles both targeted source queries and parallel multi-source fan-out
 */
export async function executeStandardizedSearch(
  request: StandardizedSearchRequest
): Promise<StandardizedSearchResponse> {
  const startTime = Date.now();
  const cleanQuery = (request.query || '').trim();

  if (!cleanQuery) {
    return {
      success: true,
      query: '',
      source: request.sourceId || 'all',
      total: 0,
      page: request.page || 1,
      results: [],
    };
  }

  const isGlobalAll = !request.sourceId || request.sourceId === 'all' || request.sourceEngine === 'all';

  // CASE 1: Specific Source Targeted
  if (!isGlobalAll) {
    const adapter = resolveSearchAdapter(request);
    try {
      const results = await adapter.search(request);
      return {
        success: true,
        query: cleanQuery,
        source: request.sourceName || request.sourceId || adapter.name,
        sourceEngine: adapter.id,
        total: results.length,
        page: request.page || 1,
        results,
        engineInfo: {
          name: adapter.name,
          sourceType: adapter.sourceType,
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (err: any) {
      console.error(`Error in adapter ${adapter.name}:`, err);
      return {
        success: false,
        query: cleanQuery,
        source: request.sourceId || adapter.name,
        total: 0,
        page: request.page || 1,
        results: [],
        error: err?.message || 'Search execution failed',
      };
    }
  }

  // CASE 2: Global / Multi-Source Fan-out across User-Selected Sources (or Core Engines)
  let settled: PromiseSettledResult<ComicSearchResult[]>[];
  let searchEngineName = 'Global Multi-Source Fan-out';

  if (request.selectedSources && request.selectedSources.length > 0) {
    const activeSelected = request.selectedSources.filter((s) => s.enabled !== false);
    if (activeSelected.length > 0) {
      searchEngineName = `Tachiyomi My Sources (${activeSelected.length} active)`;
      const perSourceLimit = Math.max(4, Math.min(20, Math.ceil(30 / activeSelected.length)));

      settled = await Promise.allSettled(
        activeSelected.map(async (src) => {
          const subRequest: StandardizedSearchRequest = {
            query: cleanQuery,
            sourceId: src.id,
            sourceName: src.name,
            baseUrl: src.baseUrl,
            sourceEngine: src.engine,
            limit: perSourceLimit,
          };
          const adapter = resolveSearchAdapter(subRequest);
          return adapter.search(subRequest);
        })
      );
    } else {
      // All user sources were disabled
      return {
        success: true,
        query: cleanQuery,
        source: 'selected',
        sourceEngine: 'all',
        total: 0,
        page: request.page || 1,
        results: [],
        engineInfo: {
          name: 'All Selected Sources Disabled',
          sourceType: 'rest_api',
          latencyMs: Date.now() - startTime,
        },
      };
    }
  } else {
    // Default fallback to core top engines
    const coreAdapters = [
      new MangaDexSearchAdapter(),
      new WebtoonsSearchAdapter(),
      new AsuraScansSearchAdapter(),
      new BatotoSearchAdapter(),
      new FlameComicsSearchAdapter(),
    ];

    settled = await Promise.allSettled(
      coreAdapters.map((adapter) => adapter.search(request))
    );
  }

  const aggregated: ComicSearchResult[] = [];
  const seenIds = new Set<string>();

  for (const item of settled) {
    if (item.status === 'fulfilled' && Array.isArray(item.value)) {
      for (const card of item.value) {
        // Deduplicate cards by unique ID or source+url
        const dedupKey = card.id || `${card.source}:${card.sourceUrl}`;
        if (!seenIds.has(dedupKey)) {
          seenIds.add(dedupKey);
          aggregated.push(card);
        }
      }
    }
  }

  // Deduplicate and rank results: exact match -> prefix match -> alphabetical
  const lowerQ = cleanQuery.toLowerCase();
  aggregated.sort((a, b) => {
    const aExact = a.title.toLowerCase() === lowerQ;
    const bExact = b.title.toLowerCase() === lowerQ;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aAltExact = (a.altTitles || []).some((t) => t.toLowerCase() === lowerQ);
    const bAltExact = (b.altTitles || []).some((t) => t.toLowerCase() === lowerQ);
    if (aAltExact && !bAltExact) return -1;
    if (!aAltExact && bAltExact) return 1;

    const aStarts = a.title.toLowerCase().startsWith(lowerQ);
    const bStarts = b.title.toLowerCase().startsWith(lowerQ);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    return 0;
  });

  return {
    success: true,
    query: cleanQuery,
    source: request.selectedSources && request.selectedSources.length > 0 ? 'selected' : 'all',
    sourceEngine: 'all',
    total: aggregated.length,
    page: request.page || 1,
    results: aggregated,
    engineInfo: {
      name: searchEngineName,
      sourceType: 'rest_api',
      latencyMs: Date.now() - startTime,
    },
  };
}
