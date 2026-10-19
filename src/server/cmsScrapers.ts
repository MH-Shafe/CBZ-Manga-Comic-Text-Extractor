import * as cheerio from 'cheerio';
import type { ReadingOrderMode, WebComicImportResult } from '../types.ts';
import { resolvePaginatedReader } from './paginatedResolver.ts';

export interface ScrapedComicResult extends WebComicImportResult {
  engineName: string;
}

/**
 * Normalizes image URL (handles protocol-relative URLs, whitespace, and HTML entities)
 */
function normalizeUrl(url: string, baseUrl: string): string | null {
  if (!url) return null;
  let clean = url.trim().replace(/&amp;/g, '&');
  if (clean.startsWith('data:image/svg') || clean.startsWith('data:image/gif')) {
    // Usually placeholder 1x1 gifs or lazyload svgs
    return null;
  }
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  }
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Checks if an image URL looks like an ad, avatar, icon, or banner rather than a comic page
 */
function isDisallowedAsset(url: string): boolean {
  const lower = url.toLowerCase();
  const disallowedPatterns = [
    '/avatar',
    '/logo',
    '/banner',
    '/icon',
    '/porn.png',
    'porn.png',
    '/brand',
    'discord',
    'patreon',
    'donate',
    'paypal',
    'disqus',
    'google-analytics',
    'tracker',
    'facebook.com',
    'twitter.com',
    'loading.gif',
    'spinner',
    'placeholder',
    '1x1',
    'pixel.gif',
    'favicon',
  ];
  return disallowedPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Extracts metadata (title, chapter, author, synopsis) from HTML
 */
function extractCommonMetadata(html: string, fallbackTitle = 'Online Comic') {
  const ogTitle =
    html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
    fallbackTitle;

  const ogDesc =
    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ||
    '';

  const author =
    html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/class=["'][^"']*author-name[^"']*["'][^>]*>([^<]+)</i)?.[1] ||
    'Unknown';

  // Attempt to split Series and Episode from title string (e.g. "Solo Leveling - Chapter 123" or "Solo Leveling Chapter 123")
  let seriesTitle = ogTitle;
  let episodeTitle = 'Chapter';

  if (ogTitle.includes(' - ')) {
    const parts = ogTitle.split(' - ');
    seriesTitle = parts[0].trim();
    episodeTitle = parts[1].trim();
  } else if (ogTitle.includes(' | ')) {
    const parts = ogTitle.split(' | ');
    seriesTitle = parts[0].trim();
    episodeTitle = parts[1].trim();
  } else {
    const chMatch = ogTitle.match(/(.*?)(?:Chapter|Episode|Ch\.|Ep\.)\s*([0-9.]+.*)/i);
    if (chMatch) {
      seriesTitle = chMatch[1].trim() || ogTitle;
      episodeTitle = `Chapter ${chMatch[2].trim()}`;
    }
  }

  // Clean trailing website names from series title (e.g. "Solo Leveling - Asura Scans")
  seriesTitle = seriesTitle.replace(/\s*[-–|]\s*(?:Asura|Flame|Reaper|MangaDex|Webtoons|Void|1stKiss|MangaTX).*$/i, '').trim();

  return {
    seriesTitle: seriesTitle || 'Comic',
    episodeTitle: episodeTitle || 'Chapter',
    combinedTitle: ogTitle.trim(),
    author: author.trim(),
    synopsis: ogDesc.trim(),
  };
}

/**
 * Formats image URLs into standard ComicPage items
 */
function buildPagesFromUrls(imageUrls: string[], referer: string) {
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();

  for (const u of imageUrls) {
    if (!seen.has(u)) {
      seen.add(u);
      uniqueUrls.push(u);
    }
  }

  return uniqueUrls.map((url, idx) => {
    const padIdx = String(idx + 1).padStart(3, '0');
    const extMatch = url.match(/\.(jpe?g|png|webp|avif)/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    return {
      index: idx + 1,
      originalUrl: url,
      proxyUrl: `/api/proxy-image?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`,
      fileName: `page_${padIdx}.${ext === 'jpeg' ? 'jpg' : ext}`,
    };
  });
}

// =========================================================================
// 0. Comix.to Engine
// =========================================================================
export function parseComixTo(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isComixTo = targetUrl.toLowerCase().includes('comix.to') || html.includes('comix.to') || html.includes('comix');
  if (!isComixTo) return null;

  let rawImages: string[] = [];

  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const findImagesInObj = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (typeof item === 'string' && (item.includes('http') || item.includes('//')) && (item.endsWith('.jpg') || item.endsWith('.png') || item.endsWith('.webp') || item.includes('image') || item.includes('cdn'))) {
              rawImages.push(item);
            } else {
              findImagesInObj(item);
            }
          }
        } else {
          for (const k of Object.keys(obj)) {
            if ((k === 'url' || k === 'src' || k === 'image' || k === 'img') && typeof obj[k] === 'string') {
              rawImages.push(obj[k]);
            } else {
              findImagesInObj(obj[k]);
            }
          }
        }
      };
      findImagesInObj(json);
    } catch {}
  }

  if (rawImages.length === 0) {
    const $ = cheerio.load(html);
    $('img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-lazy-src');
      if (src && !isDisallowedAsset(src)) {
        rawImages.push(src);
      }
    });
  }

  const validUrls: string[] = [];
  for (const raw of rawImages) {
    const norm = normalizeUrl(raw, targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  if (validUrls.length === 0) return null;

  const meta = extractCommonMetadata(html, 'Comix.to Comic');
  const pages = buildPagesFromUrls(validUrls, referer);

  return {
    success: true,
    engineName: 'Comix.to',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 1. MangaThemesia CMS Engine (Asura Scans, Flame Comics, Reaper Scans, The Blank, Omega Scans, etc.)
// =========================================================================
export function parseMangaThemesia(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isMangaThemesia =
    html.includes('ts_reader.run') ||
    html.includes('id="readerarea"') ||
    html.includes('class="readerarea"') ||
    html.includes('ts-main-box') ||
    html.includes('theme-mangathemesia') ||
    targetUrl.includes('theblank') ||
    targetUrl.includes('theblankscans') ||
    targetUrl.includes('omegascans') ||
    /name=["']generator["']\s+content=["'][^"']*MangaThemesia/i.test(html);

  if (!isMangaThemesia) return null;

  let rawImages: string[] = [];

  // A. Check ts_reader.run(...) JSON config (standard in MangaThemesia)
  const tsRunMatch = html.match(/ts_reader\.run\((\{[\s\S]*?\})\);?/i);
  if (tsRunMatch) {
    try {
      const config = JSON.parse(tsRunMatch[1]);
      if (Array.isArray(config?.sources)) {
        for (const srcObj of config.sources) {
          if (Array.isArray(srcObj?.images) && srcObj.images.length > 0) {
            rawImages = srcObj.images;
            break;
          }
        }
      }
    } catch {
      // JSON parse fallback
      const imgArrayMatch = tsRunMatch[1].match(/"images"\s*:\s*\[([\s\S]*?)\]/i);
      if (imgArrayMatch) {
        const matches = [...imgArrayMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/\\/g, ''));
        if (matches.length > 0) {
          rawImages = matches;
        }
      }
    }
  }

  // B. Fallback to DOM parsing within #readerarea if ts_reader didn't provide images
  if (rawImages.length === 0) {
    const readerArea = html.match(/id=["']readerarea["'][\s\S]*?<\/div>/i);
    const containerHtml = readerArea ? readerArea[0] : html;

    const imgMatches = [...containerHtml.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src|data-url)=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const src = m[1];
      if (src && !isDisallowedAsset(src)) {
        rawImages.push(src);
      }
    }
  }

  const validUrls: string[] = [];
  for (const raw of rawImages) {
    const norm = normalizeUrl(raw, targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  if (validUrls.length === 0) return null;

  const meta = extractCommonMetadata(html);

  // MangaThemesia breadcrumb title overrides if available
  const seriesBreadcrumb =
    html.match(/class=["'][^"']*ts-breadcrumb[^"']*["'][\s\S]*?<a[^>]*href=["'][^"']*\/manga\/[^"']*["'][^>]*>([^<]+)<\/a>/i)?.[1] ||
    html.match(/class=["'][^"']*allc[^"']*["'][\s\S]*?<a[^>]*>([^<]+)<\/a>/i)?.[1];
  if (seriesBreadcrumb) {
    meta.seriesTitle = seriesBreadcrumb.trim();
  }

  const chapterHeading =
    html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ||
    html.match(/<h1[^>]*class=["'][^"']*headpost[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  if (chapterHeading) {
    meta.episodeTitle = chapterHeading;
  }

  const pages = buildPagesFromUrls(validUrls, referer);

  return {
    success: true,
    engineName: 'MangaThemesia (Asura, Flame, Reaper)',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 2. Madara CMS Engine (wp-manga: MangaTX, 1stKiss, Toonily, Toonily.me, TopManhua, AllPornComic, Athrea Scans, Diva Scans, ToonGod, ToonHey, WebtoonScan, WebtoonXYZ, etc.)
// =========================================================================
export function parseMadara(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isMadara =
    html.includes('wp-manga') ||
    html.includes('reading-content') ||
    html.includes('wp-manga-chapter-img') ||
    html.includes('page-break') ||
    html.includes('chapter-heading') ||
    html.includes('toonily') ||
    html.includes('toongod') ||
    html.includes('toonhey') ||
    html.includes('webtoonxyz') ||
    html.includes('webtoonscan') ||
    html.includes('allporncomic') ||
    html.includes('allproncomic') ||
    html.includes('athreascans') ||
    html.includes('divascans') ||
    targetUrl.includes('toonily') ||
    targetUrl.includes('toongod') ||
    targetUrl.includes('toonhey') ||
    targetUrl.includes('webtoonxyz') ||
    targetUrl.includes('webtoonscan') ||
    targetUrl.includes('allporncomic') ||
    targetUrl.includes('allproncomic') ||
    targetUrl.includes('athreascans') ||
    targetUrl.includes('divascans') ||
    targetUrl.includes('toontop');

  if (!isMadara) return null;

  const validUrls: string[] = [];

  // Match reading section from reading-content onwards, up until comments/footer
  const readingIdx = html.search(/class=["'][^"']*(?:reading-content|wp-manga-chapter-img|page-break)[^"']*["']/i);
  const searchHtml = readingIdx !== -1 ? html.slice(readingIdx) : html;

  const endIdx = searchHtml.search(/(?:id=["'](?:comments|disqus_thread|entry-comments)["']|class=["'][^"']*(?:comments-area|entry-footer|site-footer)[^"']*["'])/i);
  const containerHtml = endIdx !== -1 ? searchHtml.slice(0, endIdx) : searchHtml;

  // Extract all img tags within reading container
  const imgMatches = [...containerHtml.matchAll(/<img[^>]+>/gi)];
  for (const m of imgMatches) {
    const tag = m[0];
    const dataSrc =
      tag.match(/data-src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-lazy-src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-full-url=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-wpfc-original-src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-cfsrc=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-original=["']([^"']+)["']/i)?.[1] ||
      tag.match(/src=["']([^"']+)["']/i)?.[1];

    if (dataSrc) {
      const norm = normalizeUrl(dataSrc, targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        validUrls.push(norm);
      }
    }
  }

  if (validUrls.length === 0) return null;

  const meta = extractCommonMetadata(html);

  // Madara series breadcrumbs
  const breadcrumbSeries =
    html.match(/class=["'][^"']*(?:c-breadcrumb|breadcrumb)[^"']*["'][\s\S]*?<a[^>]*href=["'][^"']*\/manga\/[^"']*["'][^>]*>([^<]+)<\/a>/i)?.[1] ||
    html.match(/class=["'][^"']*(?:c-breadcrumb|breadcrumb)[^"']*["'][\s\S]*?<a[^>]*href=["'][^"']*\/webtoon\/[^"']*["'][^>]*>([^<]+)<\/a>/i)?.[1];
  if (breadcrumbSeries) {
    meta.seriesTitle = breadcrumbSeries.trim();
  }

  const chapterHeading =
    html.match(/<h1[^>]*id=["']chapter-heading["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ||
    html.match(/<h2[^>]*id=["']chapter-heading["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  if (chapterHeading) {
    meta.episodeTitle = chapterHeading;
  }

  const pages = buildPagesFromUrls(validUrls, referer);

  return {
    success: true,
    engineName: 'Madara (wp-manga)',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 3. MangaReader, MangaFire, MangaFreak, MangaHere & Kakalot Engine
// =========================================================================
export function parseMangaReaderOrKakalot(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate =
    html.includes('container-chapter-reader') ||
    html.includes('vungdoc') ||
    html.includes('vung-doc') ||
    html.includes('chapter_images') ||
    html.includes('reader-area') ||
    html.includes('chapter-video-frame') ||
    html.includes('mangafire') ||
    html.includes('mangafreak') ||
    html.includes('mangahere') ||
    html.includes('my-slides') ||
    html.includes('read-container') ||
    targetUrl.includes('mangafire') ||
    targetUrl.includes('mangafreak') ||
    targetUrl.includes('mangahere');

  if (!isCandidate) return null;

  let rawImages: string[] = [];

  // A. JavaScript array: var chapter_images = [...] or var images = [...]
  const jsArrayMatch =
    html.match(/var\s+(?:chapter_images|images|pages|pArray)\s*=\s*(\[[\s\S]*?\]);?/i) ||
    html.match(/(?:chapter_images|images|pages|pArray)\s*=\s*(\[[\s\S]*?\]);?/i);

  if (jsArrayMatch) {
    try {
      const arr = JSON.parse(jsArrayMatch[1]);
      if (Array.isArray(arr) && arr.length > 0) {
        rawImages = arr.map((item) => (typeof item === 'string' ? item : item?.url || item?.src || ''));
      }
    } catch {
      const matches = [...jsArrayMatch[1].matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]);
      if (matches.length > 0) {
        rawImages = matches;
      }
    }
  }

  // B. Container: .container-chapter-reader, #vungdoc, .my-slides, .read-container, #reader-area, MangaFire, MangaFreak, MangaHere
  if (rawImages.length === 0) {
    const $ = cheerio.load(html);
    const container = $(
      '.container-chapter-reader, #vungdoc, .vung-doc, .my-slides, .read-container, #reader-area, .reader-page, .reader-wrap, #player, .slides, #slides, #viewer, .reader-main-img'
    );
    const scope = container.length > 0 ? container : $('body');

    scope.find('img').each((_, el) => {
      const src =
        $(el).attr('data-url') ||
        $(el).attr('data-src') ||
        $(el).attr('data-original') ||
        $(el).attr('data-lazy-src') ||
        $(el).attr('src');
      if (src && !isDisallowedAsset(src)) {
        rawImages.push(src);
      }
    });

    if (rawImages.length === 0) {
      const imgMatches = [...html.matchAll(/<img[^>]+(?:src|data-src|data-url|data-lazy-src|data-original)=["']([^"']+)["']/gi)];
      for (const m of imgMatches) {
        if (m[1] && !isDisallowedAsset(m[1])) {
          rawImages.push(m[1]);
        }
      }
    }
  }

  const validUrls: string[] = [];
  for (const raw of rawImages) {
    const norm = normalizeUrl(raw, targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  if (validUrls.length === 0) return null;

  const meta = extractCommonMetadata(html);
  const pages = buildPagesFromUrls(validUrls, referer);

  return {
    success: true,
    engineName: 'MangaReader / Kakalot',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 4. Webtoons.com Engine
// =========================================================================
export function parseWebtoons(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  if (!targetUrl.toLowerCase().includes('webtoons.com')) return null;

  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] || '';
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] || '';
  const subjEpisode = html.match(/<h1[^>]*class=["'][^"']*subj_episode[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const subjSeries = html.match(/<a[^>]*class=["'][^"']*subj[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

  const authorNames = [...html.matchAll(/class=["']author_name["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const author = authorNames.length > 0 ? authorNames.join(', ') : 'Webtoon Creator';

  const seriesTitle = subjSeries || (ogTitle.includes(' - ') ? ogTitle.split(' - ')[0].trim() : ogTitle) || 'Webtoon';
  const episodeTitle = subjEpisode || (ogTitle.includes(' - ') ? ogTitle.split(' - ')[1].trim() : 'Episode');
  const combinedTitle = ogTitle || `${seriesTitle} - ${episodeTitle}`;

  // Extract images from Webtoons reader
  const $ = cheerio.load(html);
  let rawImageUrls: string[] = [];

  // A. Try standard list containers
  const listContainer = $('#_imageList, .viewer_lst, .viewer_img, #_videoViewer, .viewer_video, #_video_viewer, ._viewer_lst');
  if (listContainer.length > 0) {
    listContainer.find('img').each((_, el) => {
      const src = $(el).attr('data-url') || $(el).attr('src');
      if (src && !isDisallowedAsset(src)) {
        rawImageUrls.push(src);
      }
    });
  }

  // B. Fallback to Regex if Cheerio didn't find them (scripts or complex structures)
  if (rawImageUrls.length === 0) {
    const imgContainer = 
      html.match(/id=["']_imageList["'][\s\S]*?<\/div>/i) || 
      html.match(/class=["']viewer_img["'][\s\S]*?<\/div>/i) ||
      html.match(/class=["']viewer_lst["'][\s\S]*?<\/div>/i);
    
    if (imgContainer) {
      const matches = [...imgContainer[0].matchAll(/data-url=["']([^"']+)["']/g)];
      if (matches.length > 0) {
        rawImageUrls = matches.map((m) => m[1]);
      }
    }
  }

  // C. Last resort: scan for known Webtoons image domains (pstatic.net)
  if (rawImageUrls.length === 0) {
    const fallbackMatches = [...html.matchAll(/https?:\/\/[^"'\s]+webtoon-phinf\.pstatic\.net[^"'\s]+/g)].map((m) => m[0]);
    rawImageUrls = fallbackMatches.filter((u) => !u.includes('thumb_') && !u.includes('banner') && !u.includes('icon'));
  }

  const validUrls: string[] = [];
  for (const raw of rawImageUrls) {
    const norm = normalizeUrl(raw, targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  if (validUrls.length === 0) return null;

  // Webtoons is strict: referer should be the episode URL
  const pages = buildPagesFromUrls(validUrls, targetUrl);

  return {
    success: true,
    engineName: 'Webtoons.com Engine',
    sourceUrl: targetUrl,
    seriesTitle,
    episodeTitle,
    combinedTitle,
    author,
    synopsis: ogDesc,
    readingOrder: 'manhwa-vertical',
    referer: targetUrl,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 5. Dynamic Slides & Obfuscated JS Engine (18PornComic, slides_p_path, atob arrays)
// =========================================================================
export function parseDynamicSlideEngine(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate =
    html.includes('slides_p_path') ||
    html.includes('chapter_boxImages') ||
    html.includes('image-chapter') ||
    html.includes('aHR0cHM6Ly') ||
    html.includes('aHR0cDovL');

  if (!isCandidate) return null;

  let rawImages: string[] = [];

  // A. Check slides_p_path array (e.g. 18porncomic.com and similar CMS)
  const slidesMatch =
    html.match(/slides_p_path\s*=\s*\[([\s\S]*?)\];/i) ||
    html.match(/var\s+(?:slides_p_path|slides_path|chapter_slides)\s*=\s*\[([\s\S]*?)\];/i);

  if (slidesMatch) {
    const stringLiterals = [...slidesMatch[1].matchAll(/["']([^"']{10,})["']/g)].map((m) => m[1]);
    for (const item of stringLiterals) {
      if (item.startsWith('aHR0c') || item.startsWith('aHR0cD')) {
        try {
          const decoded = Buffer.from(item, 'base64').toString('utf-8');
          if (decoded.startsWith('http')) {
            rawImages.push(decoded);
            continue;
          }
        } catch {
          // not base64
        }
      }
      if (item.startsWith('http') || item.startsWith('//') || item.startsWith('/')) {
        rawImages.push(item);
      }
    }
  }

  // B. Universal Base64 URL scanner (catches any JS array with base64 encoded image links)
  if (rawImages.length === 0) {
    const b64Matches = [...html.matchAll(/["'](aHR0c[A-Za-z0-9+/=]{15,})["']/g)].map((m) => m[1]);
    for (const b64 of b64Matches) {
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        if (
          decoded.startsWith('http') &&
          /\.(jpe?g|png|webp|avif)/i.test(decoded) &&
          !isDisallowedAsset(decoded)
        ) {
          rawImages.push(decoded);
        }
      } catch {
        // ignore invalid base64
      }
    }
  }

  const validUrls: string[] = [];
  for (const raw of rawImages) {
    const norm = normalizeUrl(raw, targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  if (validUrls.length === 0) return null;

  const meta = extractCommonMetadata(html);
  const pages = buildPagesFromUrls(validUrls, referer);

  return {
    success: true,
    engineName: 'Dynamic Slide / Obfuscated JS Engine',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 6. TS-Main-Image / OmniPorn Engine (ch_img_container, reader_area, ts-main-image)
// =========================================================================
export function parseTsMainImageEngine(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate =
    html.includes('ts-main-image') ||
    html.includes('ch_img_container') ||
    html.includes('reader_area');

  if (!isCandidate) return null;

  const rawImages: string[] = [];

  const allTsImages = [...html.matchAll(/<img[^>]+class=["'][^"']*ts-main-image[^"']*["'][^>]+(?:src|data-src|data-url|data-lazy-src)=["']([^"']+)["']/gi)];
  for (const m of allTsImages) {
    const src = m[1];
    if (src && !isDisallowedAsset(src)) {
      const norm = normalizeUrl(src, targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        rawImages.push(norm);
      }
    }
  }

  if (rawImages.length === 0) {
    const container =
      html.match(/id=["']ch_img_container["'][\s\S]*?<\/div>/i) ||
      html.match(/id=["']reader_area["'][\s\S]*?<\/div>/i);
    const sourceHtml = container ? container[0] : html;
    const imgMatches = [...sourceHtml.matchAll(/<img[^>]+(?:src|data-src|data-url|data-lazy-src)=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const src = m[1];
      if (src && !isDisallowedAsset(src)) {
        const norm = normalizeUrl(src, targetUrl);
        if (norm && !isDisallowedAsset(norm)) {
          rawImages.push(norm);
        }
      }
    }
  }

  const uniqueUrls = Array.from(new Set(rawImages));
  if (uniqueUrls.length === 0) return null;

  const meta = extractCommonMetadata(html);
  const pages = buildPagesFromUrls(uniqueUrls, referer);

  return {
    success: true,
    engineName: 'TS-Main-Image / OmniPorn Engine',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}
// =========================================================================
// 7. NHentai Engine (nhentai.net, nhentai.to, nhentai.xxx)
// =========================================================================
export function parseNHentaiEngine(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate =
    targetUrl.includes('nhentai.net') ||
    targetUrl.includes('nhentai.to') ||
    targetUrl.includes('nhentai.xxx') ||
    html.includes('nhentai.net') ||
    html.includes('nhentai.to') ||
    html.includes('nhentai.xxx') ||
    html.includes('id="thumbnail-container"') ||
    html.includes('class="thumb-container"');

  if (!isCandidate) return null;

  const validUrls: string[] = [];

  // A. Thumbnail container extraction (e.g. /g/12345/ or /g/12345/1/)
  // Pattern: https://t.nhentai.net/galleries/123456/1t.jpg or /1t.png or data-src
  // Map t.nhentai.net -> i.nhentai.net, t3. -> i3., and replace 1t.jpg -> 1.jpg
  const thumbMatches = [...html.matchAll(/(?:src|data-src)=["']([^"']*(?:galleries|nhentai)[^"']*\d+t\.(?:jpg|png|webp|avif|gif))["']/gi)];
  for (const m of thumbMatches) {
    let fullImg = m[1];
    fullImg = fullImg
      .replace(/t\.nhentai\.net/g, 'i.nhentai.net')
      .replace(/t3\.nhentai\.net/g, 'i3.nhentai.net')
      .replace(/t5\.nhentai\.net/g, 'i5.nhentai.net')
      .replace(/t7\.nhentai\.net/g, 'i7.nhentai.net')
      .replace(/(\d+)t\.(jpe?g|png|webp|avif|gif)$/i, '$1.$2');

    const norm = normalizeUrl(fullImg, targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  // B. Reader container extraction (e.g. #image-container img, .reader img, .container img)
  if (validUrls.length === 0) {
    const readerMatches = [...html.matchAll(/<img[^>]+(?:src|data-src|data-url)=["']([^"']*(?:galleries|images|chapter)[^"']*\.(?:jpe?g|png|webp|avif))["']/gi)];
    for (const m of readerMatches) {
      const norm = normalizeUrl(m[1], targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        validUrls.push(norm);
      }
    }
  }

  const uniqueUrls = Array.from(new Set(validUrls));
  if (uniqueUrls.length === 0) return null;

  const meta = extractCommonMetadata(html, 'Doujinshi / Manga');

  // nHentai title extraction
  const nTitleMatch =
    html.match(/<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ||
    html.match(/<h2[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();

  if (nTitleMatch) {
    meta.seriesTitle = nTitleMatch;
    meta.combinedTitle = nTitleMatch;
    meta.episodeTitle = 'Full Work (Complete)';
  }

  // Author / Artist extraction
  const artistMatch =
    html.match(/class=["'][^"']*tag-container[^"']*["'][\s\S]*?Artists:?[\s\S]*?class=["']name["'][^>]*>([^<]+)</i)?.[1] ||
    html.match(/href=["'][^"']*\/artist\/[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["']name["'][^>]*>([^<]+)</i)?.[1];
  if (artistMatch) {
    meta.author = artistMatch.trim();
  }

  const pages = buildPagesFromUrls(uniqueUrls, referer);

  return {
    success: true,
    engineName: 'NHentai Engine (net/to/xxx)',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle || 'Complete Work',
    combinedTitle: meta.combinedTitle,
    author: meta.author || 'Manga Artist',
    synopsis: meta.synopsis,
    readingOrder: 'manga-rtl',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 8. Simply Hentai Engine (simply-hentai.com Next.js & Gallery)
// =========================================================================
export function parseSimplyHentaiEngine(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate =
    targetUrl.includes('simply-hentai') ||
    html.includes('simply-hentai') ||
    html.includes('images.simply-hentai.com');
  if (!isCandidate) return null;

  const validUrls: string[] = [];

  // A. Check Next.js __NEXT_DATA__
  const nextDataMatch = html.match(/<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      const seriesOrAlbum =
        parsed.props?.pageProps?.series ||
        parsed.props?.pageProps?.album ||
        parsed.props?.pageProps?.manga ||
        parsed.props?.pageProps?.data;

      const images = seriesOrAlbum?.images || parsed.props?.pageProps?.images;
      if (Array.isArray(images)) {
        for (const img of images) {
          const u = typeof img === 'string' ? img : img.full || img.url || img.source || img.preview;
          if (u && typeof u === 'string') {
            const norm = normalizeUrl(u, targetUrl);
            if (norm && !isDisallowedAsset(norm)) {
              validUrls.push(norm);
            }
          }
        }
      }
    } catch {}
  }

  // B. Fallback to DOM img tags
  if (validUrls.length === 0) {
    const imgMatches = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']*(?:images\.simply-hentai|simply-hentai)[^"']*)["']/gi)];
    for (const m of imgMatches) {
      const norm = normalizeUrl(m[1], targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        validUrls.push(norm);
      }
    }
  }

  const uniqueUrls = Array.from(new Set(validUrls));
  if (uniqueUrls.length === 0) return null;

  const meta = extractCommonMetadata(html, 'Simply Hentai Manga');
  const pages = buildPagesFromUrls(uniqueUrls, referer);

  return {
    success: true,
    engineName: 'Simply Hentai Engine',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle || 'Complete Work',
    combinedTitle: meta.combinedTitle,
    author: meta.author || 'Manga Artist',
    synopsis: meta.synopsis,
    readingOrder: 'manga-rtl',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 9. NovelCrow Engine (novelcrow.com)
// =========================================================================
export function parseNovelCrowEngine(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate = targetUrl.includes('novelcrow') || html.includes('novelcrow');
  if (!isCandidate) return null;

  const validUrls: string[] = [];
  const $ = cheerio.load(html);

  // 1. Try Cheerio targeted containers
  const container = $('.reading-content, .chapter-content, .entry-content, .content-inner, .page-break, #readerarea, #chapter-content, .text-left, .wp-manga-chapter-img');
  const scope = container.length > 0 ? container : $('body');

  scope.find('img').each((_, el) => {
    const src =
      $(el).attr('data-src') ||
      $(el).attr('data-lazy-src') ||
      $(el).attr('data-original') ||
      $(el).attr('data-url') ||
      $(el).attr('data-full-url') ||
      $(el).attr('src');
    if (src) {
      const norm = normalizeUrl(src, targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        validUrls.push(norm);
      }
    }
  });

  // 2. Fallback to Regex extraction across whole HTML
  if (validUrls.length === 0) {
    const imgMatches = [...html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const norm = normalizeUrl(m[1], targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        validUrls.push(norm);
      }
    }
  }

  const uniqueUrls = Array.from(new Set(validUrls));
  if (uniqueUrls.length === 0) return null;

  const meta = extractCommonMetadata(html, 'NovelCrow Comic');
  const pages = buildPagesFromUrls(uniqueUrls, referer);

  return {
    success: true,
    engineName: 'NovelCrow Engine',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer: referer || 'https://novelcrow.com/',
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// 10. Oppai Stream Engine (oppaistream.com, read.oppai.stream)
// =========================================================================
export function parseOppaiStreamEngine(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const isCandidate =
    targetUrl.includes('oppai.stream') ||
    targetUrl.includes('oppaistream') ||
    html.includes('oppai.stream') ||
    html.includes('oppaistream');
  if (!isCandidate) return null;

  const validUrls: string[] = [];
  const imgMatches = [...html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/gi)];
  for (const m of imgMatches) {
    const norm = normalizeUrl(m[1], targetUrl);
    if (norm && !isDisallowedAsset(norm)) {
      validUrls.push(norm);
    }
  }

  if (validUrls.length === 0) return null;

  const meta = extractCommonMetadata(html, 'Oppai Stream Manga');
  const pages = buildPagesFromUrls(Array.from(new Set(validUrls)), referer);

  return {
    success: true,
    engineName: 'Oppai Stream Engine',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
export function parseUniversalFallback(html: string, targetUrl: string, referer: string): ScrapedComicResult | null {
  const meta = extractCommonMetadata(html);
  const $ = cheerio.load(html);
  const candidates: string[] = [];

  // 1. Look for targeted reader container first
  const container = $('.reader-page, .reading-content, .chapter-images, .readerarea, .vung-doc, .viewer-images, .chapter-content, .entry-content, #reader, #readerarea, #reading-content, #chapter-images, div[class*="reader"], div[class*="chapter"], div[class*="read"], div[class*="viewer"]');
  const scope = container.length > 0 ? container : $('body');

  scope.find('img').each((_, el) => {
    const src =
      $(el).attr('src') ||
      $(el).attr('data-src') ||
      $(el).attr('data-url') ||
      $(el).attr('data-lazy-src') ||
      $(el).attr('data-original');

    if (src && !isDisallowedAsset(src)) {
      const norm = normalizeUrl(src, targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        candidates.push(norm);
      }
    }
  });

  // Fallback to regex extraction if Cheerio didn't yield images
  if (candidates.length === 0) {
    const imgMatches = [...html.matchAll(/<img[^>]+(?:src|data-src|data-url|data-lazy-src|data-original)=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const src = m[1];
      if (src && !isDisallowedAsset(src)) {
        const norm = normalizeUrl(src, targetUrl);
        if (norm && !isDisallowedAsset(norm)) {
          candidates.push(norm);
        }
      }
    }
  }

  // If static img tags yielded fewer than 3 images, check if images are stored in dynamic base64
  if (candidates.length < 3) {
    const b64Matches = [...html.matchAll(/["'](aHR0c[A-Za-z0-9+/=]{15,})["']/g)].map((m) => m[1]);
    const b64Urls: string[] = [];
    for (const b64 of b64Matches) {
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        if (decoded.startsWith('http') && /\.(jpe?g|png|webp|avif)/i.test(decoded) && !isDisallowedAsset(decoded)) {
          b64Urls.push(decoded);
        }
      } catch {}
    }
    if (b64Urls.length >= 3) {
      candidates.splice(0, candidates.length, ...b64Urls);
    }
  }

  if (candidates.length === 0) return null;

  const pages = buildPagesFromUrls(candidates, referer);

  return {
    success: true,
    engineName: 'Universal Reader Engine',
    sourceUrl: targetUrl,
    seriesTitle: meta.seriesTitle,
    episodeTitle: meta.episodeTitle,
    combinedTitle: meta.combinedTitle,
    author: meta.author,
    synopsis: meta.synopsis,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}

// =========================================================================
// Master Scraper Dispatcher
// =========================================================================
export async function parseComicFromHtml(
  html: string,
  targetUrl: string,
  referer: string,
  fetchHtmlFn?: (url: string) => Promise<string>
): Promise<ScrapedComicResult | null> {
  // 0. Comix.to Engine
  const comixto = parseComixTo(html, targetUrl, referer);
  if (comixto && comixto.pages.length > 0) return comixto;

  // 1. Webtoons.com
  const webtoons = parseWebtoons(html, targetUrl, referer);
  if (webtoons && webtoons.pages.length > 0) return webtoons;

  // 2. NHentai Engine (nhentai.net, nhentai.to, nhentai.xxx)
  const nhentai = parseNHentaiEngine(html, targetUrl, referer);
  if (nhentai && nhentai.pages.length > 0) return nhentai;

  // 3. Simply Hentai Engine (simply-hentai.com)
  const simplyHentai = parseSimplyHentaiEngine(html, targetUrl, referer);
  if (simplyHentai && simplyHentai.pages.length > 0) return simplyHentai;

  // 4. NovelCrow Engine (novelcrow.com)
  const novelcrow = parseNovelCrowEngine(html, targetUrl, referer);
  if (novelcrow && novelcrow.pages.length > 0) return novelcrow;

  // 5. Oppai Stream Engine (oppaistream.com, read.oppai.stream)
  const oppai = parseOppaiStreamEngine(html, targetUrl, referer);
  if (oppai && oppai.pages.length > 0) return oppai;

  // 6. MangaThemesia (Asura Scans, Flame Comics, Reaper Scans, The Blank, Omega Scans, etc.)
  const themesia = parseMangaThemesia(html, targetUrl, referer);
  if (themesia && themesia.pages.length > 0) return themesia;

  // 7. Madara CMS (wp-manga: MangaTX, 1stKiss, Toonily, Toonily.me, TopManhua, AllPornComic, Athrea, Diva, ToonGod, ToonHey, WebtoonXYZ, WebtoonScan, etc.)
  const madara = parseMadara(html, targetUrl, referer);
  if (madara && madara.pages.length > 0) return madara;

  // 8. Dynamic Slide & Obfuscated base64 JS Engine (18PornComic, etc.)
  const dynamicSlides = parseDynamicSlideEngine(html, targetUrl, referer);
  if (dynamicSlides && dynamicSlides.pages.length > 0) return dynamicSlides;

  // 9. Paginated Reader & Gallery Resolver (1 image per URL, e.g. .../view/727087/1 -> pages 1..96)
  const paginated = await resolvePaginatedReader(html, targetUrl, referer, fetchHtmlFn);
  if (paginated && paginated.pages.length > 0) return paginated;

  // 10. TS-Main-Image Engine (OmniPorn, etc.)
  const tsMain = parseTsMainImageEngine(html, targetUrl, referer);
  if (tsMain && tsMain.pages.length > 0) return tsMain;

  // 11. MangaReader, MangaFire, MangaFreak, MangaHere & Kakalot
  const reader = parseMangaReaderOrKakalot(html, targetUrl, referer);
  if (reader && reader.pages.length > 0) return reader;

  // 12. Universal heuristic fallback
  const universal = parseUniversalFallback(html, targetUrl, referer);
  if (universal && universal.pages.length > 0) return universal;

  return null;
}
