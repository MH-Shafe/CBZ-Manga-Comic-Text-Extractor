import JSZip from 'jszip';
import {
  ComicPage,
  ComicChapter,
  WebComicImportResult,
  WebComicPageItem,
  ComicSearchResult,
  SearchChapterItem,
  ComicMetadata,
  StandardizedSearchRequest,
  StandardizedSearchResponse,
} from '../types';

/**
 * Standardized Search Request across different web sources
 * Dispatches to the standardized multi-source search engine with accurate site-specific schema parsing
 */
export async function searchComicTitlesStandardized(
  request: StandardizedSearchRequest
): Promise<StandardizedSearchResponse> {
  const cleanQuery = (request.query || '').trim();
  if (!cleanQuery) {
    return {
      success: true,
      query: '',
      source: request.sourceId || 'all',
      total: 0,
      results: [],
    };
  }

  const res = await fetch('/api/search-titles-standardized', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`Title search failed with status ${res.status}`);
  }

  const json: StandardizedSearchResponse = await res.json();
  return json;
}

/**
 * Executes a search across comic sources using the standardized interface
 * Supports both StandardizedSearchRequest object and positional legacy arguments
 */
export async function searchComicTitles(
  queryOrRequest: string | StandardizedSearchRequest,
  source = 'all',
  sourceUrl?: string,
  sourceName?: string
): Promise<ComicSearchResult[]> {
  const req: StandardizedSearchRequest =
    typeof queryOrRequest === 'string'
      ? {
          query: queryOrRequest,
          sourceId: source,
          baseUrl: sourceUrl,
          sourceName,
        }
      : queryOrRequest;

  if (!req.query || !req.query.trim()) return [];

  const response = await searchComicTitlesStandardized(req);
  return response.results || [];
}

export async function fetchComicTitleChapters(
  source: string,
  id: string,
  sourceUrl: string
): Promise<SearchChapterItem[]> {
  const res = await fetch(
    `/api/title-chapters?source=${encodeURIComponent(source)}&id=${encodeURIComponent(
      id
    )}&url=${encodeURIComponent(sourceUrl)}`
  );
  if (!res.ok) {
    throw new Error(`Failed to load chapters with status ${res.status}`);
  }
  const json = await res.json();
  return (json?.chapters || []) as SearchChapterItem[];
}

export async function fetchWebComicMetadata(url: string): Promise<WebComicImportResult> {
  const response = await fetch('/api/fetch-web-comic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  const responseText = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        data = JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
      } catch {
        data = null;
      }
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `Failed to fetch web comic: HTTP ${response.status}`);
  }

  if (!data) {
    throw new Error(`Invalid response received when fetching web comic: HTTP ${response.status}`);
  }

  return data as WebComicImportResult;
}

export interface WebComicDownloadProgress {
  current: number;
  total: number;
  percent: number;
  statusText: string;
}

export async function downloadWebComicPages(
  pagesToDownload: WebComicPageItem[],
  onProgress?: (progress: WebComicDownloadProgress) => void,
  abortSignal?: AbortSignal
): Promise<ComicPage[]> {
  const total = pagesToDownload.length;
  let completed = 0;
  const results: ComicPage[] = new Array(total);

  const concurrency = 6;
  let cursor = 0;

  async function loadDirectBrowserImage(
    originalUrl: string
  ): Promise<{ imageUrl: string; blob: Blob; mimeType: string }> {
    // 1. Try direct client fetch first
    try {
      const res = await fetch(originalUrl, { mode: 'cors' });
      if (res.ok) {
        const b = await res.blob();
        if (b && b.size > 100) {
          return {
            imageUrl: URL.createObjectURL(b),
            blob: b,
            mimeType: b.type || 'image/jpeg',
          };
        }
      }
    } catch {
      // CORS block, proceed to Image element
    }

    // 2. Try Image() element in browser with canvas conversion
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';

        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve({
              imageUrl: originalUrl,
              blob: new Blob([''], { type: 'image/jpeg' }),
              mimeType: 'image/jpeg',
            });
          }
        }, 4000);

        img.onload = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (ctx && canvas.width > 0 && canvas.height > 0) {
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(
                (blob) => {
                  if (blob && blob.size > 100) {
                    resolve({
                      imageUrl: URL.createObjectURL(blob),
                      blob,
                      mimeType: 'image/jpeg',
                    });
                    return;
                  }
                  resolve({
                    imageUrl: originalUrl,
                    blob: new Blob([''], { type: 'image/jpeg' }),
                    mimeType: 'image/jpeg',
                  });
                },
                'image/jpeg',
                0.95
              );
              return;
            }
          } catch {
            // Tainted canvas due to CORS
          }
          resolve({
            imageUrl: originalUrl,
            blob: new Blob([''], { type: 'image/jpeg' }),
            mimeType: 'image/jpeg',
          });
        };

        img.onerror = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({
            imageUrl: originalUrl,
            blob: new Blob([''], { type: 'image/jpeg' }),
            mimeType: 'image/jpeg',
          });
        };

        img.src = originalUrl;
      });
    }

    return {
      imageUrl: originalUrl,
      blob: new Blob([''], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
    };
  }

  async function worker() {
    while (cursor < total) {
      if (abortSignal?.aborted) {
        throw new Error('Import cancelled by user');
      }

      const taskIndex = cursor++;
      const item = pagesToDownload[taskIndex];

      try {
        let loaded = false;

        // Attempt A: Try server anti-hotlink proxy
        try {
          const res = await fetch(item.proxyUrl, { signal: abortSignal });
          if (res.ok) {
            const blob = await res.blob();
            if (blob && blob.size > 100 && !blob.type.includes('html')) {
              const imageUrl = URL.createObjectURL(blob);
              const mimeType = blob.type || 'image/jpeg';

              results[taskIndex] = {
                id: `webtoon-p-${item.index}-${Date.now()}-${taskIndex}`,
                index: taskIndex,
                fileName: item.fileName,
                imageUrl,
                blob,
                mimeType,
                status: 'idle',
                isExcluded: false,
              };
              loaded = true;
            }
          }
        } catch {
          // Proxy failed, fall back to direct browser loading
        }

        // Attempt B: If server proxy failed (e.g. Cloudflare HTTP 403 on server), load directly in client browser
        if (!loaded) {
          const direct = await loadDirectBrowserImage(item.originalUrl);
          results[taskIndex] = {
            id: `webtoon-p-${item.index}-${Date.now()}-${taskIndex}`,
            index: taskIndex,
            fileName: item.fileName,
            imageUrl: direct.imageUrl,
            blob: direct.blob,
            mimeType: direct.mimeType,
            status: 'idle',
            isExcluded: false,
          };
          loaded = true;
        }
      } catch (err: any) {
        if (abortSignal?.aborted) {
          throw err;
        }
        console.warn(`Failed to fetch page ${item.index}, using direct URL fallback:`, err);
        results[taskIndex] = {
          id: `webtoon-p-${item.index}-${Date.now()}-${taskIndex}`,
          index: taskIndex,
          fileName: item.fileName,
          imageUrl: item.originalUrl,
          blob: new Blob([''], { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          status: 'idle',
          isExcluded: false,
        };
      }

      completed++;
      if (onProgress) {
        onProgress({
          current: completed,
          total,
          percent: Math.round((completed / total) * 100),
          statusText: `Downloading page ${completed} of ${total}...`,
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return results.filter(Boolean);
}

export function buildWebComicChapter(
  meta: WebComicImportResult,
  pages: ComicPage[]
): ComicChapter {
  const safeTitle = (meta.combinedTitle || meta.episodeTitle || 'Web Comic')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();

  // Extract chapter number from episodeTitle or combinedTitle if not explicitly given
  let chapterNumber = meta.chapterNumber || '';
  if (!chapterNumber && meta.episodeTitle) {
    const match =
      meta.episodeTitle.match(/(?:chapter|ch\.?|ep\.?|episode)\s*(\d+(?:\.\d+)?)/i) ||
      meta.episodeTitle.match(/(\d+)/);
    if (match) {
      chapterNumber = match[1];
    }
  }

  const coverThumbnail = meta.coverThumbnail || (pages.length > 0 ? pages[0].imageUrl : undefined);
  const author = meta.author || 'Original Creator';
  const artist = meta.artist || author;
  const combinedAuthor = author && artist && author !== artist ? `${author} (Art: ${artist})` : author;

  const metadata: ComicMetadata = {
    mangaTitle: meta.seriesTitle || 'Web Comic Series',
    bookTitle: meta.seriesTitle || 'Web Comic Series',
    chapterNumber: chapterNumber || undefined,
    chapterTitle: meta.episodeTitle || 'Chapter',
    combinedTitle: meta.combinedTitle || `${meta.seriesTitle} - ${meta.episodeTitle}`,
    author,
    artist,
    combinedAuthor,
    series: meta.seriesTitle || 'Web Comic Series',
    coverThumbnail,
    synopsis: meta.synopsis,
    genres: meta.genres,
    status: meta.status,
    source: meta.sourceUrl?.includes('mangadex') ? 'mangadex' : 'webtoon',
    sourceUrl: meta.sourceUrl,
    sourceEngine: meta.engineName,
    availableChapters: meta.availableChapters,
    currentChapterUrl: meta.sourceUrl,
    seriesUrl: (meta as any).seriesUrl,
  };

  return {
    id: `web-chap-${Date.now()}`,
    index: 0,
    title: meta.combinedTitle || meta.episodeTitle || 'Webtoon Chapter',
    fileName: `${safeTitle}.cbz`,
    pages,
    chapterSummary: meta.synopsis || undefined,
    metadata,
  };
}

export async function exportChapterToCbz(
  pages: ComicPage[],
  fileName: string
): Promise<void> {
  const zip = new JSZip();

  for (const page of pages) {
    zip.file(page.fileName, page.blob);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const downloadUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const downloadName = fileName.endsWith('.cbz') ? fileName : `${fileName}.cbz`;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
}
