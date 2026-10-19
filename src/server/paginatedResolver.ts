import type { ScrapedComicResult } from './cmsScrapers.ts';

/**
 * Normalizes an image URL relative to a base URL
 */
function normalizeUrl(url: string, baseUrl: string): string | null {
  if (!url) return null;
  let clean = url.trim().replace(/&amp;/g, '&');
  if (clean.startsWith('data:image/svg') || clean.startsWith('data:image/gif')) return null;
  if (clean.startsWith('//')) clean = 'https:' + clean;
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Checks if a URL looks like an ad or icon rather than a comic page
 */
function isDisallowedAsset(url: string): boolean {
  const lower = url.toLowerCase();
  const disallowedPatterns = [
    '/avatar',
    '/logo',
    '/banner',
    '/icon',
    'discord',
    'patreon',
    'donate',
    'paypal',
    'loading',
    'spinner',
    'favicon',
    'porn.png',
  ];
  return disallowedPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Detects if the current URL or page HTML represents a paginated reader (one image per URL)
 */
export function isPaginatedReader(html: string, targetUrl: string): boolean {
  const urlLower = targetUrl.toLowerCase();

  // URL pagination patterns (e.g., /view/727087/1, /g/12345/1, /chapter-1/1, /page/1, ?page=1)
  const hasPageInUrl =
    /\/(?:view|g|read|comic|manga|chapter|page)\/.*?\/?(\d+)\/?$/i.test(urlLower) ||
    /\/page\/(\d+)\/?$/i.test(urlLower) ||
    /\/\d+\/?$/i.test(urlLower) ||
    /[?&](?:page|p)=(\d+)/i.test(urlLower);

  // HTML pagination indicators
  const hasPaginationElements =
    html.includes('id="image-container"') ||
    html.includes('class="image-container"') ||
    html.includes('class="num-pages"') ||
    html.includes('class="total-pages"') ||
    /<select[^>]*name=["']?(?:page|pages|p)["']?[^>]*>/i.test(html) ||
    /Page\s+\d+\s+of\s+\d+/i.test(html) ||
    /\d+\s*\/\s*\d+\s*(?:pages)?/i.test(html);

  return hasPageInUrl || hasPaginationElements;
}

/**
 * Extracts total pages count and current page index from HTML and URL
 */
export function extractPaginationBounds(html: string, targetUrl: string): { currentPage: number; totalPages: number } {
  let currentPage = 1;
  let totalPages = 1;

  // 1. Current page from URL
  const urlMatch =
    targetUrl.match(/\/(?:view|g|read|comic|manga)\/[^/]+\/(\d+)\/?$/i) ||
    targetUrl.match(/\/chapter[^/]*\/(\d+)\/?$/i) ||
    targetUrl.match(/[?&](?:page|p)=(\d+)/i);

  if (urlMatch) {
    currentPage = parseInt(urlMatch[1], 10) || 1;
  }

  // 2. Total pages from <span class="num-pages">96</span> or <span class="total-pages">96</span>
  const spanTotalMatch =
    html.match(/<span[^>]*class=["'][^"']*(?:num-pages|total-pages|total|pages|page-count)[^"']*["'][^>]*>(\d+)<\/span>/i) ||
    html.match(/<span[^>]*id=["'](?:num-pages|total-pages|total|pages|page-count)["'][^>]*>(\d+)<\/span>/i);

  if (spanTotalMatch) {
    totalPages = parseInt(spanTotalMatch[1], 10);
  }

  // 3. Text pattern "Page 1 of 96" or "1 / 96" or "1 of 96"
  if (totalPages <= 1) {
    const textPatternMatch =
      html.match(/(?:Page\s+\d+\s+of\s+|^\s*\d+\s*\/\s*)(\d+)/i) ||
      html.match(/\b\d+\s+of\s+(\d+)\s+pages\b/i) ||
      html.match(/(\d+)\s*(?:pages|images)\s*total/i);

    if (textPatternMatch) {
      totalPages = parseInt(textPatternMatch[1], 10);
    }
  }

  // 4. Dropdown <select name="page"> max option
  if (totalPages <= 1) {
    const selectMatch = html.match(/<select[^>]*name=["']?(?:page|pages|p|slcChapter)["']?[^>]*>([\s\S]*?)<\/select>/i);
    if (selectMatch) {
      const optionValues = [...selectMatch[1].matchAll(/<option[^>]*value=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/option>/gi)];
      let maxNum = 1;
      for (const opt of optionValues) {
        const valNum = parseInt(opt[1], 10);
        const textNum = parseInt(opt[2].replace(/[^0-9]/g, ''), 10);
        if (!isNaN(valNum) && valNum > maxNum) maxNum = valNum;
        if (!isNaN(textNum) && textNum > maxNum) maxNum = textNum;
      }
      if (maxNum > 1) {
        totalPages = maxNum;
      }
    }
  }

  // 5. Pagination div container max link number
  if (totalPages <= 1) {
    const paginationMatch = html.match(/<div[^>]*class=["'][^"']*(?:pagination|pager|page-nav|navigation)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (paginationMatch) {
      const linkNums = [...paginationMatch[1].matchAll(/<a[^>]*>(\d+)<\/a>/g)].map((m) => parseInt(m[1], 10));
      if (linkNums.length > 0) {
        totalPages = Math.max(...linkNums);
      }
    }
  }

  // Clamp total pages to safe bounds (max 500 pages per chapter)
  totalPages = Math.max(1, Math.min(500, totalPages));

  return { currentPage, totalPages };
}

/**
 * Extracts the single primary comic panel image from the current page
 */
export function extractSinglePageImage(html: string, targetUrl: string): string | null {
  // Priority 1: Main viewer image container
  const containerMatch =
    html.match(/<section[^>]*id=["']image-container["'][^>]*>([\s\S]*?)<\/section>/i) ||
    html.match(/<div[^>]*id=["']image-container["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]*class=["'][^"']*image-container[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]*id=["']main-image["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]*class=["'][^"']*(?:reader-image|comic-page|scan-page)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  const searchScope = containerMatch ? containerMatch[0] : html;

  const imgMatches = [...searchScope.matchAll(/<img[^>]+(?:src|data-src|data-url)=["']([^"']+)["']/gi)];
  for (const m of imgMatches) {
    const src = m[1];
    if (src && !isDisallowedAsset(src)) {
      const norm = normalizeUrl(src, targetUrl);
      if (norm && !isDisallowedAsset(norm)) {
        return norm;
      }
    }
  }

  return null;
}

/**
 * Given a primary image URL (e.g. https://.../galleries/727087/1.webp or .../001.jpg),
 * generates the continuous sequence for pages 1 through totalPages.
 */
export function generateSequenceFromPattern(
  primaryImageUrl: string,
  currentPage: number,
  totalPages: number
): string[] | null {
  if (totalPages <= 1) return [primaryImageUrl];

  // Try to match the page number in the image URL filename
  // Examples: /1.webp, /01.jpg, /001.png, /page-1.jpg, /ch1_1.webp
  const urlObj = new URL(primaryImageUrl);
  const pathname = urlObj.pathname;
  const filename = pathname.split('/').pop() || '';

  // Pattern: (/|^)(prefix?)(0*currentPage)(suffix?)\.(ext)$
  const extMatch = filename.match(/\.(jpe?g|png|webp|avif)$/i);
  if (!extMatch) return null;
  const ext = extMatch[1];
  const nameWithoutExt = filename.slice(0, -extMatch[0].length);

  // Look for current page number inside filename
  const pageRegex = new RegExp(`(^|[^0-9])(0*${currentPage})($|[^0-9])`);
  const match = nameWithoutExt.match(pageRegex);

  if (!match) return null;

  const matchedDigits = match[2];
  const padLength = matchedDigits.length; // e.g. "01" has length 2
  const prefix = nameWithoutExt.slice(0, match.index! + match[1].length);
  const suffix = nameWithoutExt.slice(match.index! + match[1].length + matchedDigits.length);

  const basePath = pathname.slice(0, pathname.lastIndexOf('/') + 1);

  const sequence: string[] = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageStr = String(pageNum).padStart(padLength, '0');
    const newFilename = `${prefix}${pageStr}${suffix}.${ext}`;
    urlObj.pathname = `${basePath}${newFilename}`;
    sequence.push(urlObj.toString());
  }

  return sequence;
}

/**
 * Given a paginated target URL (e.g. https://site.com/view/727087/1),
 * generates the URL for page N.
 */
export function generatePageUrl(targetUrl: string, pageNum: number): string {
  try {
    const parsed = new URL(targetUrl);
    // If page is in query: ?page=1
    if (parsed.searchParams.has('page')) {
      parsed.searchParams.set('page', String(pageNum));
      return parsed.toString();
    }
    if (parsed.searchParams.has('p')) {
      parsed.searchParams.set('p', String(pageNum));
      return parsed.toString();
    }

    // If page is in path: .../1 or .../1/
    const path = parsed.pathname;
    const hasTrailingSlash = path.endsWith('/');
    const cleanPath = hasTrailingSlash ? path.slice(0, -1) : path;
    const newPath = cleanPath.replace(/\/\d+$/, `/${pageNum}`);

    parsed.pathname = hasTrailingSlash ? `${newPath}/` : newPath;
    return parsed.toString();
  } catch {
    return targetUrl;
  }
}

/**
 * Resolves full paginated reader comic into a continuous strip
 */
export async function resolvePaginatedReader(
  html: string,
  targetUrl: string,
  referer: string,
  fetchHtmlFn?: (url: string) => Promise<string>
): Promise<ScrapedComicResult | null> {
  if (!isPaginatedReader(html, targetUrl)) return null;

  const { currentPage, totalPages } = extractPaginationBounds(html, targetUrl);

  // If there's only 1 page detected, let other scrapers handle it
  if (totalPages <= 1) return null;

  const primaryImg = extractSinglePageImage(html, targetUrl);
  if (!primaryImg) return null;

  // Strategy A: Pattern-based instant sequence generation (e.g. .../galleries/727087/1.webp -> 1..totalPages)
  let resolvedImageUrls = generateSequenceFromPattern(primaryImg, currentPage, totalPages);

  // Strategy B: If pattern could not be deduced and fetchHtmlFn is provided, fetch pages concurrently
  if (!resolvedImageUrls && fetchHtmlFn) {
    const pageImageMap = new Map<number, string>();
    pageImageMap.set(currentPage, primaryImg);

    const pagesToFetch: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p !== currentPage) pagesToFetch.push(p);
    }

    // Concurrency limit of 6
    const concurrency = 6;
    for (let i = 0; i < pagesToFetch.length; i += concurrency) {
      const chunk = pagesToFetch.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (p) => {
          try {
            const pageUrl = generatePageUrl(targetUrl, p);
            const pageHtml = await fetchHtmlFn(pageUrl);
            const img = extractSinglePageImage(pageHtml, pageUrl);
            if (img) pageImageMap.set(p, img);
          } catch {
            // ignore failure for missing pages
          }
        })
      );
    }

    const collected: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const img = pageImageMap.get(p);
      if (img) collected.push(img);
    }

    if (collected.length > 0) {
      resolvedImageUrls = collected;
    }
  }

  if (!resolvedImageUrls || resolvedImageUrls.length <= 1) return null;

  // Metadata
  const ogTitle =
    html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
    'Paginated Comic';

  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] || '';
  const author = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)?.[1] || 'Unknown';

  const cleanTitle = ogTitle
    .replace(/\s*[-–|]\s*(?:Page|Page \d+|Read online).*$/i, '')
    .replace(/\s*-\s*\d+\s*\/\s*\d+.*$/i, '')
    .trim();

  const pages = resolvedImageUrls.map((url, idx) => {
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

  return {
    success: true,
    engineName: 'Paginated Reader & Gallery Resolver',
    sourceUrl: targetUrl,
    seriesTitle: cleanTitle,
    episodeTitle: `Full Sequence (Pages 1–${pages.length})`,
    combinedTitle: `${cleanTitle} - Complete Sequence (${pages.length} Pages)`,
    author,
    synopsis: ogDesc,
    readingOrder: 'manhwa-vertical',
    referer,
    pageCount: pages.length,
    pages,
  };
}
