import * as cheerio from 'cheerio';
import { ComicPage } from '../types';

export interface MhtParseResult {
  success: boolean;
  engineName: string;
  sourceUrl: string;
  seriesTitle: string;
  episodeTitle: string;
  combinedTitle: string;
  author: string;
  synopsis: string;
  readingOrder: 'manhwa-vertical' | 'manga-rtl' | 'comic-ltr';
  referer: string;
  pageCount: number;
  pages: ComicPage[];
}

export interface MhtEmbeddedImagePart {
  mimePartIndex: number;
  contentType: string;
  contentLocation: string;
  contentId: string;
  originalFilename: string;
  data: Uint8Array;
}

export type MhtOrderingStrategy =
  | 'HTML_REFERENCE_ORDER'
  | 'NATURAL_FILENAME_ORDER'
  | 'MIME_PART_ORDER';

/**
 * Splits string into numeric and string chunks for accurate natural numeric comparison.
 * e.g. "100--image.webp" -> [100, "--image.webp"], "11--image.webp" -> [11, "--image.webp"]
 */
export function parseFilenameChunks(str: string): (string | number)[] {
  const chunks: (string | number)[] = [];
  const regex = /(\d+)|(\D+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(str)) !== null) {
    if (match[1] !== undefined) {
      chunks.push(parseInt(match[1], 10));
    } else if (match[2] !== undefined) {
      chunks.push(match[2].toLowerCase());
    }
  }
  return chunks;
}

/**
 * Robust natural alphanumeric comparison for filenames.
 * Guarantees that "11--image.webp" comes BEFORE "100--image.webp".
 */
export function compareNaturalFilenames(a: string, b: string): number {
  const chunksA = parseFilenameChunks(a);
  const chunksB = parseFilenameChunks(b);
  const len = Math.min(chunksA.length, chunksB.length);

  for (let i = 0; i < len; i++) {
    const ca = chunksA[i];
    const cb = chunksB[i];

    if (typeof ca === 'number' && typeof cb === 'number') {
      if (ca !== cb) return ca - cb;
    } else if (typeof ca === 'string' && typeof cb === 'string') {
      if (ca !== cb) return ca.localeCompare(cb);
    } else {
      return typeof ca === 'number' ? -1 : 1;
    }
  }

  return chunksA.length - chunksB.length;
}

export function naturalCompareFilenames(a: string, b: string): number {
  return compareNaturalFilenames(a, b);
}

/**
 * Detects whether an image filename or DOM context belongs to
 * noise (ads, site logos, social buttons, tracking pixels, avatars).
 */
export function isUnrelatedImage(
  src: string,
  filename: string,
  parentClass = '',
  parentTag = '',
  imgClass = ''
): boolean {
  const lowerFile = filename.toLowerCase();

  // Never filter out images that contain numbers and do not explicitly name logos/avatars/pixels
  if (
    /\d+/.test(lowerFile) &&
    !/logo|avatar|favicon|icon|adsbygoogle|pixel|tracking/i.test(lowerFile)
  ) {
    return false;
  }

  // Check filename, parent tag/class, and img class ONLY (do NOT check full URL directory paths)
  const contextStr = `${filename} ${parentClass} ${parentTag} ${imgClass}`.toLowerCase();

  const noiseKeywords = [
    'logo', 'avatar', 'favicon', 'gravatar', 'site-header', 'site-footer',
    'adsbygoogle', 'popunder', 'disqus', 'facebook', 'twitter', 'discord', 'telegram',
    'patreon', 'paypal', 'donate', 'sponsor', 'tracking', 'pixel', 'analytics',
    'counter', 'stat'
  ];

  for (const kw of noiseKeywords) {
    if (contextStr.includes(kw)) {
      return true;
    }
  }

  // Check parent structural tags (e.g. <img> inside <header>, <footer>, <aside>, <nav>)
  const pTag = parentTag.toLowerCase();
  if (pTag === 'header' || pTag === 'footer' || pTag === 'nav' || pTag === 'aside') {
    return true;
  }

  return false;
}

function checkIsSequenceReversed(parts: MhtEmbeddedImagePart[]): boolean {
  if (parts.length < 2) return false;
  const numbers: number[] = [];
  for (const part of parts) {
    const match = part.originalFilename.match(/\d+/);
    if (match) {
      numbers.push(parseInt(match[0], 10));
    }
  }

  if (numbers.length < parts.length * 0.6) return false;

  let decreasingCount = 0;
  let increasingCount = 0;
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] > numbers[i + 1]) decreasingCount++;
    if (numbers[i] < numbers[i + 1]) increasingCount++;
  }

  return decreasingCount > increasingCount;
}

/**
 * Binary-safe MIME / MHT / MHTML parser for saved web pages.
 * Reconstructs correct forward page ordering using HTML references, Content-Location,
 * and natural numeric filename sorting.
 */
export async function parseMhtArchive(
  mhtTextOrBuffer: string | ArrayBuffer | Uint8Array,
  fileName: string
): Promise<MhtParseResult> {
  const uint8Array =
    mhtTextOrBuffer instanceof Uint8Array
      ? mhtTextOrBuffer
      : mhtTextOrBuffer instanceof ArrayBuffer
      ? new Uint8Array(mhtTextOrBuffer)
      : new TextEncoder().encode(mhtTextOrBuffer);

  const decoder = new TextDecoder('utf-8', { fatal: false });
  // Read first 8KB to locate MIME boundary safely
  const firstChunk = decoder.decode(uint8Array.slice(0, Math.min(8000, uint8Array.length)));

  if (
    !firstChunk ||
    (!firstChunk.includes('MIME-Version:') &&
      !firstChunk.includes('multipart/related') &&
      !firstChunk.includes('Content-Type:'))
  ) {
    throw new Error(
      'This saved webpage could not be parsed. The MHT/MHTML file may be incomplete or corrupted.'
    );
  }

  // Detect boundary
  let boundary = '';
  const boundaryMatch =
    firstChunk.match(/boundary="?([^";\r\n]+)"?/i) ||
    firstChunk.match(/boundary=([^\s;\r\n]+)/i);
  if (boundaryMatch) {
    boundary = boundaryMatch[1].trim();
  } else {
    const lines = firstChunk.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('--') && line.length > 2 && line.length < 100) {
        boundary = line.slice(2).trim();
        break;
      }
    }
  }

  if (!boundary) {
    throw new Error(
      'This saved webpage could not be parsed. No MIME boundary was found in the MHT/MHTML file.'
    );
  }

  const delimiter = new TextEncoder().encode('--' + boundary);
  const parts: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i <= uint8Array.length - delimiter.length; i++) {
    let match = true;
    for (let j = 0; j < delimiter.length; j++) {
      if (uint8Array[i + j] !== delimiter[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      if (i > start) {
        parts.push(uint8Array.slice(start, i));
      }
      start = i + delimiter.length;
    }
  }
  if (start < uint8Array.length) {
    parts.push(uint8Array.slice(start));
  }

  let htmlContent = '';
  const embeddedImages: MhtEmbeddedImagePart[] = [];
  const resourceLookupMap = new Map<string, MhtEmbeddedImagePart>();

  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const part = parts[pIdx];
    if (part.length === 0) continue;

    // Find header-body split (\r\n\r\n or \n\n)
    let splitIndex = -1;
    let headerOffset = 4;
    for (let i = 0; i < part.length - 3; i++) {
      if (part[i] === 13 && part[i + 1] === 10 && part[i + 2] === 13 && part[i + 3] === 10) {
        splitIndex = i;
        headerOffset = 4;
        break;
      }
    }
    if (splitIndex === -1) {
      for (let i = 0; i < part.length - 1; i++) {
        if (part[i] === 10 && part[i + 1] === 10) {
          splitIndex = i;
          headerOffset = 2;
          break;
        }
      }
    }
    if (splitIndex === -1) continue;

    const headersRaw = decoder.decode(part.slice(0, splitIndex));
    const bodyRaw = part.slice(splitIndex + headerOffset);

    let contentType = 'application/octet-stream';
    let transferEncoding = 'binary';
    let contentLocation = '';
    let contentId = '';

    const headerLines = headersRaw.split(/\r?\n/);
    for (const hLine of headerLines) {
      const lower = hLine.toLowerCase();
      if (lower.startsWith('content-type:')) {
        contentType = hLine.slice(13).trim();
      } else if (lower.startsWith('content-transfer-encoding:')) {
        transferEncoding = hLine.slice(26).trim().toLowerCase();
      } else if (lower.startsWith('content-location:')) {
        contentLocation = hLine.slice(17).trim();
      } else if (lower.startsWith('content-id:')) {
        contentId = hLine.slice(11).trim().replace(/^<|>$/g, '');
      }
    }

    let binaryData: Uint8Array;
    if (transferEncoding === 'base64') {
      const base64String = decoder.decode(bodyRaw).replace(/[\s\r\n]/g, '');
      if (typeof Buffer !== 'undefined') {
        binaryData = new Uint8Array(Buffer.from(base64String, 'base64'));
      } else {
        const binaryString = atob(base64String);
        binaryData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          binaryData[i] = binaryString.charCodeAt(i);
        }
      }
    } else if (transferEncoding === 'quoted-printable') {
      const decodedQP = decodeQuotedPrintable(decoder.decode(bodyRaw));
      binaryData = new TextEncoder().encode(decodedQP);
    } else {
      binaryData = bodyRaw;
    }

    const lowerCt = contentType.toLowerCase();
    if (lowerCt.includes('text/html') || lowerCt.includes('application/xhtml')) {
      htmlContent = decoder.decode(binaryData);
    } else {
      // Check magic bytes for valid images (WebP, PNG, JPEG, GIF, AVIF)
      let detectedMime = '';
      if (
        binaryData.length >= 12 &&
        binaryData[0] === 0x52 &&
        binaryData[1] === 0x49 &&
        binaryData[2] === 0x46 &&
        binaryData[3] === 0x46 &&
        binaryData[8] === 0x57 &&
        binaryData[9] === 0x45 &&
        binaryData[10] === 0x42 &&
        binaryData[11] === 0x50
      ) {
        detectedMime = 'image/webp';
      } else if (
        binaryData.length >= 4 &&
        binaryData[0] === 0x89 &&
        binaryData[1] === 0x50 &&
        binaryData[2] === 0x4e &&
        binaryData[3] === 0x47
      ) {
        detectedMime = 'image/png';
      } else if (
        binaryData.length >= 3 &&
        binaryData[0] === 0xff &&
        binaryData[1] === 0xd8 &&
        binaryData[2] === 0xff
      ) {
        detectedMime = 'image/jpeg';
      } else if (
        binaryData.length >= 4 &&
        binaryData[0] === 0x47 &&
        binaryData[1] === 0x49 &&
        binaryData[2] === 0x46
      ) {
        detectedMime = 'image/gif';
      } else if (lowerCt.includes('image/')) {
        if (lowerCt.includes('png')) detectedMime = 'image/png';
        else if (lowerCt.includes('webp')) detectedMime = 'image/webp';
        else if (lowerCt.includes('gif')) detectedMime = 'image/gif';
        else if (lowerCt.includes('avif')) detectedMime = 'image/avif';
        else detectedMime = 'image/jpeg';
      }

      if (detectedMime && binaryData.length >= 1000) {
        const rawFilename =
          contentLocation.split('/').pop()?.split('?')[0] ||
          contentId.split('/').pop()?.split('?')[0] ||
          `part_${embeddedImages.length + 1}.${detectedMime.split('/')[1]}`;

        const imgPart: MhtEmbeddedImagePart = {
          mimePartIndex: pIdx,
          contentType: detectedMime,
          contentLocation,
          contentId,
          originalFilename: rawFilename,
          data: binaryData,
        };

        embeddedImages.push(imgPart);

        // Index in lookup map for fast HTML reference matching
        if (contentLocation) {
          resourceLookupMap.set(contentLocation, imgPart);
          try {
            const parsedUrl = new URL(contentLocation);
            resourceLookupMap.set(parsedUrl.pathname, imgPart);
            resourceLookupMap.set(parsedUrl.pathname.split('/').pop() || '', imgPart);
          } catch {}
        }
        if (contentId) {
          resourceLookupMap.set('cid:' + contentId, imgPart);
          resourceLookupMap.set(contentId, imgPart);
        }
        resourceLookupMap.set(rawFilename, imgPart);
      }
    }
  }

  if (!htmlContent && embeddedImages.length === 0) {
    throw new Error(
      'This saved webpage could not be parsed. The MHT/MHTML file may be incomplete or corrupted.'
    );
  }

  const $ = cheerio.load(htmlContent || '');
  const seriesTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    fileName.replace(/\.mht(ml)?$/i, '');
  const synopsis =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';
  const author = $('meta[name="author"]').attr('content') || 'Unknown';

  // Filter out tiny tracking pixels, icons, logos, and UI ads from embeddedImages pool
  const validEmbeddedImages = embeddedImages.filter((img) => {
    if (img.data.length < 1000) return false;
    return !isUnrelatedImage(img.contentLocation, img.originalFilename);
  });

  if (validEmbeddedImages.length === 0) {
    throw new Error('No embedded manga images were found in this saved webpage.');
  }

  // Record MIME Extraction Order for debug logging
  const mimeExtractionOrder = validEmbeddedImages.map((img) => img.originalFilename);

  // Stage 1: Attempt HTML Reference Order matching inside main reader container
  const readerSelectors = [
    '#chapter-images',
    '.reading-content',
    '#reader',
    '.vng-viewer',
    '#vng-viewer',
    '.entry-content',
    '#viewer',
    '#arraydata',
    '.container-chapter-reader',
    '#readerarea',
    '.reader-area',
    '.manga-reading',
    '.comic-images',
    '#comic-images',
    '#page-list',
    '.page-break',
    '#content .entry-content',
    'main',
  ];

  let $readerContainer: ReturnType<typeof $> | null = null;
  for (const sel of readerSelectors) {
    const found = $(sel);
    if (found.length > 0 && found.find('img').length > 0) {
      $readerContainer = found;
      break;
    }
  }

  const htmlMatchedImages: MhtEmbeddedImagePart[] = [];
  const htmlOrderList: string[] = [];
  const seenImageKeys = new Set<string>();

  const $imgNodes = $readerContainer ? $readerContainer.find('img') : $('img');

  $imgNodes.each((_, el) => {
    const src =
      $(el).attr('src') ||
      $(el).attr('data-src') ||
      $(el).attr('data-lazy-src') ||
      $(el).attr('data-original') ||
      '';
    if (!src || src.startsWith('data:image/svg')) return;

    const imgClass = $(el).attr('class') || '';
    const parent = $(el).parent();
    const parentClass = parent.attr('class') || '';
    const parentTag = parent.prop('tagName')?.toLowerCase() || '';
    const filename = src.split('/').pop()?.split('?')[0] || '';

    if (isUnrelatedImage(src, filename, parentClass, parentTag, imgClass)) {
      return;
    }

    let matchedPart: MhtEmbeddedImagePart | undefined;
    if (resourceLookupMap.has(src)) {
      matchedPart = resourceLookupMap.get(src);
    } else {
      try {
        const parsed = new URL(src, 'https://localhost');
        if (resourceLookupMap.has(parsed.pathname)) {
          matchedPart = resourceLookupMap.get(parsed.pathname);
        } else if (resourceLookupMap.has(parsed.pathname.split('/').pop() || '')) {
          matchedPart = resourceLookupMap.get(parsed.pathname.split('/').pop() || '');
        }
      } catch {
        const basename = src.split('/').pop()?.split('?')[0];
        if (basename && resourceLookupMap.has(basename)) {
          matchedPart = resourceLookupMap.get(basename);
        }
      }
    }

    if (matchedPart) {
      const key = matchedPart.contentLocation || matchedPart.originalFilename;
      if (!seenImageKeys.has(key)) {
        seenImageKeys.add(key);
        htmlMatchedImages.push(matchedPart);
        htmlOrderList.push(matchedPart.originalFilename);
      }
    }
  });

  // If HTML matching produced a reversed sequence, reverse it to ascending order
  if (checkIsSequenceReversed(htmlMatchedImages)) {
    htmlMatchedImages.reverse();
  }

  let finalOrderedParts: MhtEmbeddedImagePart[] = [];
  let orderingStrategy: MhtOrderingStrategy = 'MIME_PART_ORDER';

  if (htmlMatchedImages.length > 0) {
    orderingStrategy = 'HTML_REFERENCE_ORDER';
    finalOrderedParts = [...htmlMatchedImages];

    // Append any embedded manga images that were not explicitly referenced in HTML (naturally sorted)
    const remainingParts: MhtEmbeddedImagePart[] = [];
    for (const img of validEmbeddedImages) {
      const key = img.contentLocation || img.originalFilename;
      if (!seenImageKeys.has(key)) {
        seenImageKeys.add(key);
        remainingParts.push(img);
      }
    }
    remainingParts.sort((a, b) => compareNaturalFilenames(a.originalFilename, b.originalFilename));
    finalOrderedParts.push(...remainingParts);
  } else {
    // Primary Natural Numeric Filename Ordering
    orderingStrategy = 'NATURAL_FILENAME_ORDER';
    finalOrderedParts = [...validEmbeddedImages].sort((a, b) =>
      compareNaturalFilenames(a.originalFilename, b.originalFilename)
    );
  }

  const finalPageOrderNames = finalOrderedParts.map((img) => img.originalFilename);

  // Requirement Log: Output [MHT ORDER DEBUG]
  console.log('[MHT ORDER DEBUG]', {
    mimeExtractionOrder,
    htmlDetectedOrder: htmlOrderList,
    finalPageOrder: finalPageOrderNames,
    orderingStrategy,
  });

  // Construct final ComicPage array with sequential internal filenames
  const pages: ComicPage[] = finalOrderedParts.map((part, idx) => {
    const blob = new Blob([part.data], { type: part.contentType });
    const imageUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(blob)
        : `data:${part.contentType};base64,` +
          (typeof Buffer !== 'undefined' ? Buffer.from(part.data).toString('base64') : '');

    const ext = part.contentType.split('/')[1] || 'webp';
    const fileName = `page_${String(idx + 1).padStart(3, '0')}.${ext}`;

    const first12Ascii = Array.from(part.data.slice(0, 12))
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');

    console.log('[MHT IMAGE DEBUG]', {
      index: idx,
      originalFilename: part.originalFilename,
      internalFilename: fileName,
      contentType: part.contentType,
      byteLength: part.data.length,
      firstBytes: first12Ascii,
      blobSize: blob.size,
      objectUrl: imageUrl,
    });

    return {
      id: `mht-p-${idx + 1}-${Date.now()}`,
      index: idx,
      fileName,
      imageUrl,
      blob,
      mimeType: part.contentType,
      status: 'idle',
      isExcluded: false,
    };
  });

  const cleanSeriesTitle =
    seriesTitle.replace(/\s*[-–|]\s*(?:NovelCrow|Manga|Chapter).*$/i, '').trim() ||
    'Imported Saved Webpage';

  return {
    success: true,
    engineName: 'Saved Webpage (MHT/MHTML)',
    sourceUrl: '',
    seriesTitle: cleanSeriesTitle,
    episodeTitle: 'Complete Chapter',
    combinedTitle: seriesTitle,
    author,
    synopsis,
    readingOrder: 'manhwa-vertical',
    referer: '',
    pageCount: pages.length,
    pages,
  };
}

function decodeQuotedPrintable(str: string): string {
  try {
    return str
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return str;
  }
}

