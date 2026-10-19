import { ComicPage, TextBlock } from '../types';
import { normalizeBoxToNaturalDimensions, sanitizeTextBlockCoordinates } from './coordinateNormalizer';

/**
 * Optical Character Recognition Batch Sizing & Stitching Utility
 *
 * Designed to combine multiple comic/manga pages into an optimal composite strip
 * to drastically reduce API request counts (saving daily quota & RPM), while
 * guaranteeing that text remains sharp and perfectly legible for Gemini Vision AI.
 *
 * Algorithm Rules:
 * 1. Best Size Constraints:
 *    - TARGET_COMPOSITE_WIDTH: 1000px (preserves speech bubble font legibility).
 *    - MAX_BATCH_HEIGHT: 5200px (prevents image downsampling, browser canvas crashes,
 *      and ensures output token boundaries are respected).
 *    - MAX_PAGES_PER_BATCH: 4 pages maximum per request.
 * 2. Dynamic Size Exclusion:
 *    - Pages are evaluated sequentially.
 *    - If adding page N would cause the composite height to exceed MAX_BATCH_HEIGHT (or > 4 pages),
 *      page N is EXCLUDED from the current batch and deferred to begin the next batch.
 *    - Single oversized manhwa strips (> 5200px) form their own single-page batch.
 */

export const TARGET_COMPOSITE_WIDTH = 768;
export const MAX_BATCH_HEIGHT = 5200;
export const MAX_PAGES_PER_BATCH = 4;

export interface PageDimensionInfo {
  pageIndex: number;
  chapterIndex: number;
  width: number;
  height: number;
  scaledHeight: number;
  aspectRatio: number;
}

export interface BatchItem {
  pageIndex: number;
  chapterIndex: number;
  page: ComicPage;
  originalWidth: number;
  originalHeight: number;
  scaledHeight: number;
  yStart: number;
  yEnd: number;
}

export interface CompositeBatch {
  id: string;
  chapterIndex: number;
  items: BatchItem[];
  totalWidth: number;
  totalHeight: number;
}

/**
 * Calculate scaled height for a page normalized to TARGET_COMPOSITE_WIDTH
 */
export function calculateScaledHeight(
  naturalWidth: number,
  naturalHeight: number,
  targetWidth: number = TARGET_COMPOSITE_WIDTH
): number {
  if (!naturalWidth || naturalWidth <= 0 || !naturalHeight || naturalHeight <= 0) {
    // Default 1:1.4 manga aspect ratio fallback
    return Math.round(targetWidth * 1.4);
  }
  return Math.round((naturalHeight * targetWidth) / naturalWidth);
}

/**
 * Plan page batches grouped by size threshold.
 * If adding the next page would cause total height > MAX_BATCH_HEIGHT,
 * exclude that page from the current batch and start the next batch with it.
 */
export function planBatchesBySize(
  pages: { page: ComicPage; pageIndex: number; chapterIndex: number; width?: number; height?: number }[],
  maxHeight: number = MAX_BATCH_HEIGHT,
  maxPages: number = MAX_PAGES_PER_BATCH,
  targetWidth: number = TARGET_COMPOSITE_WIDTH
): CompositeBatch[] {
  if (!pages || pages.length === 0) return [];

  const batches: CompositeBatch[] = [];
  let currentItems: BatchItem[] = [];
  let currentHeight = 0;
  let currentChapterIndex = pages[0]?.chapterIndex ?? 0;

  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    const origWidth = item.width || 800;
    const origHeight = item.height || 1150;
    const scaledHeight = calculateScaledHeight(origWidth, origHeight, targetWidth);

    // If chapter changes, conclude existing batch first
    const isNewChapter = item.chapterIndex !== currentChapterIndex;
    const wouldExceedHeight = currentHeight + scaledHeight > maxHeight;
    const wouldExceedMaxPages = currentItems.length >= maxPages;

    if (currentItems.length > 0 && (isNewChapter || wouldExceedHeight || wouldExceedMaxPages)) {
      // Exclude current item from this batch and seal current batch!
      batches.push({
        id: `batch-${batches.length + 1}-ch${currentChapterIndex}-p${currentItems[0].pageIndex + 1}_to_${currentItems[currentItems.length - 1].pageIndex + 1}`,
        chapterIndex: currentChapterIndex,
        items: [...currentItems],
        totalWidth: targetWidth,
        totalHeight: currentHeight,
      });

      // Start fresh batch with the excluded item
      currentItems = [];
      currentHeight = 0;
      currentChapterIndex = item.chapterIndex;
    }

    // Add item to current batch
    const yStart = currentHeight;
    const yEnd = currentHeight + scaledHeight;
    currentItems.push({
      pageIndex: item.pageIndex,
      chapterIndex: item.chapterIndex,
      page: item.page,
      originalWidth: origWidth,
      originalHeight: origHeight,
      scaledHeight,
      yStart,
      yEnd,
    });
    currentHeight += scaledHeight;
    currentChapterIndex = item.chapterIndex;
  }

  // Push final batch
  if (currentItems.length > 0) {
    batches.push({
      id: `batch-${batches.length + 1}-ch${currentChapterIndex}-p${currentItems[0].pageIndex + 1}_to_${currentItems[currentItems.length - 1].pageIndex + 1}`,
      chapterIndex: currentChapterIndex,
      items: currentItems,
      totalWidth: targetWidth,
      totalHeight: currentHeight,
    });
  }

  return batches;
}

/**
 * Load an image from Blob or object URL to inspect natural dimensions
 */
export async function probeImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    // If not in a browser DOM environment (e.g. node test), fallback safely
    if (typeof Image === 'undefined') {
      resolve({ width: 800, height: 1150 });
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 1150,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 800, height: 1150 });
    };
    img.src = url;
  });
}

/**
 * Stitch multiple pages in a batch into a single vertical composite image.
 * If batch contains only 1 page, simply renders that single page without unnecessary canvas expansion.
 */
export async function stitchBatchToCanvas(
  batch: CompositeBatch,
  quality: number = 0.82
): Promise<{ base64: string; mimeType: string }> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas stitching is only supported in browser environment');
  }

  const canvas = document.createElement('canvas');
  canvas.width = batch.totalWidth;
  canvas.height = batch.totalHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2D canvas context for batch stitching');
  }

  // Fill canvas with neutral white backdrop (manga/comic standard)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load and draw each page into its allocated vertical slice
  for (const item of batch.items) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      const url = item.page.imageUrl || URL.createObjectURL(item.page.blob);
      const isTemporaryUrl = !item.page.imageUrl;

      img.onload = () => {
        if (isTemporaryUrl) {
          URL.revokeObjectURL(url);
        }
        ctx.drawImage(img, 0, item.yStart, batch.totalWidth, item.scaledHeight);
        resolve();
      };
      img.onerror = () => {
        if (isTemporaryUrl) {
          URL.revokeObjectURL(url);
        }
        // Fallback: don't completely crash the whole batch if one image glitches
        console.warn(`Failed to render page image ${item.pageIndex + 1} into canvas batch`);
        resolve();
      };
      img.src = url;
    });
  }

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] || '';
  return {
    base64,
    mimeType: 'image/jpeg',
  };
}

export interface UnpackedPageResult {
  pageIndex: number;
  blocks: TextBlock[];
  fullText: string;
  pageSummary: string;
  isExtraPage: boolean;
  extraPageReason?: string;
}

/**
 * Sorts comic text blocks strictly according to comic reading flow:
 * - Vertical progression (Top-to-Bottom) is the PRIMARY axis for comic panels.
 *   Higher dialogue/narration boxes always precede lower dialogue/narration boxes.
 * - Horizontal progression applies within the same panel tier (<= 50 units / 5% height difference):
 *   - 'comic-ltr': Left to Right
 *   - 'manga-rtl': Right to Left
 *   - 'manhwa-vertical': Strict Top to Bottom
 */
export function sortBlocksByReadingOrder(
  blocks: TextBlock[],
  readingOrder: 'manga-rtl' | 'manhwa-vertical' | 'comic-ltr' = 'comic-ltr'
): TextBlock[] {
  const sorted = [...blocks];
  sorted.sort((a, b) => {
    const aY = a.box_2d ? a.box_2d[0] : ((a.yPercent ?? 0) * 10);
    const bY = b.box_2d ? b.box_2d[0] : ((b.yPercent ?? 0) * 10);
    const diffY = aY - bY;

    // Vertical tier threshold: 50 units on a 0-1000 scale (5% of page height)
    // If two bubbles are on clearly different vertical levels, the higher one ALWAYS comes first!
    if (Math.abs(diffY) > 50) {
      return diffY;
    }

    // If both bubbles are roughly on the same panel row / horizontal tier (within 5% height):
    const aX = a.box_2d ? a.box_2d[1] : 0;
    const bX = b.box_2d ? b.box_2d[1] : 0;

    if (readingOrder === 'manga-rtl') {
      // Japanese manga: Right to Left within the same row
      if (Math.abs(bX - aX) > 35) {
        return bX - aX;
      }
    } else if (readingOrder === 'comic-ltr') {
      // Western comic: Left to Right within the same row
      if (Math.abs(aX - bX) > 35) {
        return aX - bX;
      }
    }

    // If positions are very close, fallback to vertical ordering
    return diffY;
  });

  return sorted.map((b, idx) => ({ ...b, readingOrder: idx + 1 }));
}

/**
 * Unpack AI vision OCR result from the composite image back to each individual page.
 *
 * Mathematical coordinate re-mapping:
 * - Bounding boxes [ymin, xmin, ymax, xmax] are relative to composite height (0-1000).
 * - yPercent is relative to composite height (0-100).
 * - We find which vertical slice [yStart, yEnd] the block's center falls in,
 *   and transform coordinates to be local to that page (0-1000 scale).
 */
export function unpackBatchResult(
  batch: CompositeBatch,
  rawResult: {
    blocks?: any[];
    fullText?: string;
    pageSummary?: string;
    isExtraPage?: boolean;
    extraPageReason?: string;
  },
  readingOrder: 'manga-rtl' | 'manhwa-vertical' | 'comic-ltr' = 'comic-ltr'
): Map<number, UnpackedPageResult> {
  const resultMap = new Map<number, UnpackedPageResult>();

  // Initialize empty containers for all pages in this batch
  batch.items.forEach((item) => {
    resultMap.set(item.pageIndex, {
      pageIndex: item.pageIndex,
      blocks: [],
      fullText: '',
      pageSummary: '',
      isExtraPage: false,
      extraPageReason: '',
    });
  });

  const totalHeight = Math.max(1, batch.totalHeight);
  const rawBlocks = Array.isArray(rawResult?.blocks) ? rawResult.blocks : [];

  rawBlocks.forEach((rawBlock) => {
    if (!rawBlock || typeof rawBlock.text !== 'string' || !rawBlock.text.trim()) return;

    // Determine vertical center and bounds of the block on the composite image (in pixels)
    let yCenterPx = 0;
    let yMinPx = 0;
    let yMaxPx = 0;
    const box = rawBlock.box_2d;
    if (Array.isArray(box) && box.length === 4 && typeof box[0] === 'number' && typeof box[2] === 'number') {
      yMinPx = (box[0] / 1000) * totalHeight;
      yMaxPx = (box[2] / 1000) * totalHeight;
      yCenterPx = (yMinPx + yMaxPx) / 2;
    } else if (typeof rawBlock.yPercent === 'number') {
      yCenterPx = (rawBlock.yPercent / 100) * totalHeight;
      yMinPx = Math.max(0, yCenterPx - 30);
      yMaxPx = Math.min(totalHeight, yCenterPx + 30);
    }

    // Locate matching page item by maximum vertical overlap to prevent top/bottom boundary clipping
    let targetItem = batch.items[0];
    let maxOverlap = -1;

    for (const item of batch.items) {
      const overlapStart = Math.max(item.yStart, yMinPx);
      const overlapEnd = Math.min(item.yEnd, yMaxPx);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        targetItem = item;
      }
    }

    // If no positive overlap, locate by vertical center or fallback to nearest page
    if (maxOverlap <= 0) {
      targetItem = batch.items.find(
        (item) => yCenterPx >= item.yStart && yCenterPx < item.yEnd
      ) || (yCenterPx >= totalHeight ? batch.items[batch.items.length - 1] : batch.items[0]);
    }

    if (!targetItem) return;

    const pageSliceHeight = Math.max(1, targetItem.scaledHeight);

    // Remap bounding box to local page coordinates (0-1000) using coordinateNormalizer
    let localBox: [number, number, number, number] | undefined = undefined;
    if (Array.isArray(box) && box.length === 4) {
      localBox = normalizeBoxToNaturalDimensions(
        box as [number, number, number, number],
        targetItem.yStart,
        pageSliceHeight,
        totalHeight,
        { width: targetItem.originalWidth, height: targetItem.originalHeight }
      );
    }

    // Remap yPercent to local page percentage (0-100)
    const localYPercent = Math.max(
      0,
      Math.min(100, Math.round(((yCenterPx - targetItem.yStart) / pageSliceHeight) * 100))
    );

    const remappedBlock: TextBlock = sanitizeTextBlockCoordinates({
      id: rawBlock.id || `block-${targetItem.pageIndex + 1}-${Math.random().toString(36).substring(2, 7)}`,
      readingOrder: rawBlock.readingOrder || 1,
      type: rawBlock.type || 'dialogue',
      speaker: rawBlock.speaker || '',
      text: rawBlock.text.trim(),
      watermarkOrNoiseFiltered: Boolean(rawBlock.watermarkOrNoiseFiltered),
      yPercent: localYPercent,
      box_2d: localBox,
    });

    const pageRes = resultMap.get(targetItem.pageIndex);
    if (pageRes) {
      pageRes.blocks.push(remappedBlock);
    }
  });

  // Post-process each page: re-sort reading order, construct fullText & summary
  batch.items.forEach((item, idx) => {
    const pageRes = resultMap.get(item.pageIndex);
    if (!pageRes) return;

    // Sort blocks strictly according to comic reading flow:
    // Vertical progression (Top-to-Bottom) is the PRIMARY axis for comic panels.
    // Higher panels / higher speech bubbles must ALWAYS come before lower panels.
    pageRes.blocks = sortBlocksByReadingOrder(pageRes.blocks, readingOrder);

    // Construct clean unified page dialogue text
    if (pageRes.blocks.length > 0) {
      pageRes.fullText = pageRes.blocks
        .map((b) => (b.speaker ? `${b.speaker}: ${b.text}` : b.text))
        .join('\n\n');

      pageRes.pageSummary =
        batch.items.length === 1 && rawResult?.pageSummary
          ? rawResult.pageSummary
          : `Page ${item.pageIndex + 1} with ${pageRes.blocks.length} dialogue block${pageRes.blocks.length > 1 ? 's' : ''}`;
    } else {
      pageRes.fullText = '';
      pageRes.pageSummary = `Page ${item.pageIndex + 1} (visual artwork / no dialogue detected)`;
    }

    // Handle extra/recruitment page detection
    if (rawResult?.isExtraPage) {
      // If single page, mark directly
      if (batch.items.length === 1) {
        pageRes.isExtraPage = true;
        pageRes.extraPageReason = rawResult.extraPageReason || 'Detected scanlation credit / recruitment';
      } else {
        // If last page of the batch and contains credit keywords or extra page indication
        const isLastPageOfBatch = idx === batch.items.length - 1;
        const pageLower = pageRes.fullText.toLowerCase();
        const hasCreditKeywords =
          pageLower.includes('recruitment') ||
          pageLower.includes('discord') ||
          pageLower.includes('patreon') ||
          pageLower.includes('typesetter') ||
          pageLower.includes('proofreader') ||
          pageLower.includes('raw provider') ||
          pageLower.includes('translated by') ||
          pageLower.includes('end of chapter');

        if (isLastPageOfBatch && hasCreditKeywords) {
          pageRes.isExtraPage = true;
          pageRes.extraPageReason = rawResult.extraPageReason || 'End-of-chapter scanlation credits / recruitment';
        }
      }
    }
  });

  return resultMap;
}

/**
 * Diagnostic utility: Crops a specific text box region from an image blob using 0-1000 coordinate bounds
 * so test OCR validation or visual inspection can verify coordinate precision.
 */
export async function cropBoxAsDataUrl(
  imageBlob: Blob,
  box: [number, number, number, number]
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve('');
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const [ymin, xmin, ymax, xmax] = box;
      const x = (xmin / 1000) * img.naturalWidth;
      const y = (ymin / 1000) * img.naturalHeight;
      const w = Math.max(10, ((xmax - xmin) / 1000) * img.naturalWidth);
      const h = Math.max(10, ((ymax - ymin) / 1000) * img.naturalHeight);

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } else {
        resolve('');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('');
    };
    img.src = url;
  });
}
