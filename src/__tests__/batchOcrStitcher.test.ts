import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  calculateScaledHeight,
  planBatchesBySize,
  unpackBatchResult,
  sortBlocksByReadingOrder,
  MAX_BATCH_HEIGHT,
  MAX_PAGES_PER_BATCH,
  TARGET_COMPOSITE_WIDTH,
  CompositeBatch,
} from '../utils/batchOcrStitcher';
import { ComicPage } from '../types';

describe('Batch OCR Sizing & Dynamic Exclusion Tests', () => {
  const dummyBlob = new Blob([], { type: 'image/jpeg' });

  const makePage = (index: number, chapterIndex = 0): ComicPage => ({
    id: `page-${index + 1}`,
    index,
    fileName: `p${index + 1}.jpg`,
    imageUrl: '',
    blob: dummyBlob,
    mimeType: 'image/jpeg',
    status: 'idle',
    isExcluded: false,
  });

  test('calculates normalized scaled height accurately', () => {
    // 800 x 1200 scaled to target width 1000 => 1500
    const h = calculateScaledHeight(800, 1200, 1000);
    assert.strictEqual(h, 1500);
  });

  test('excludes the last page when cumulative size/height exceeds MAX_BATCH_HEIGHT', () => {
    // 4 standard manga pages: 800 x 1200 each => scaled height = 1500 each at width 1000
    // Page 1: 1500
    // Page 2: 1500 (total = 3000)
    // Page 3: 1500 (total = 4500)
    // Page 4: 1500 (total would be 6000 > MAX_BATCH_HEIGHT 5200)
    // Therefore: Page 4 MUST be excluded from Batch 1 and placed into Batch 2!
    const pages = [
      { page: makePage(0), pageIndex: 0, chapterIndex: 0, width: 800, height: 1200 },
      { page: makePage(1), pageIndex: 1, chapterIndex: 0, width: 800, height: 1200 },
      { page: makePage(2), pageIndex: 2, chapterIndex: 0, width: 800, height: 1200 },
      { page: makePage(3), pageIndex: 3, chapterIndex: 0, width: 800, height: 1200 },
    ];

    const batches = planBatchesBySize(pages, 5200, 4, 1000);

    assert.strictEqual(batches.length, 2, 'Should create exactly 2 batches');
    // Batch 1 has 3 pages (height 4500 <= 5200)
    assert.strictEqual(batches[0].items.length, 3, 'Batch 1 should have 3 pages');
    assert.strictEqual(batches[0].totalHeight, 4500);
    assert.strictEqual(batches[0].items[0].pageIndex, 0);
    assert.strictEqual(batches[0].items[2].pageIndex, 2);

    // Batch 2 has the excluded page (pageIndex: 3)
    assert.strictEqual(batches[1].items.length, 1, 'Batch 2 should have the excluded page 4');
    assert.strictEqual(batches[1].items[0].pageIndex, 3);
    assert.strictEqual(batches[1].totalHeight, 1500);
  });

  test('handles long manhwa strips by isolating tall pages into their own batch', () => {
    // Page 1: tall manhwa strip 1000 x 4800
    // Page 2: standard page 1000 x 1400
    const pages = [
      { page: makePage(0), pageIndex: 0, chapterIndex: 0, width: 1000, height: 4800 },
      { page: makePage(1), pageIndex: 1, chapterIndex: 0, width: 1000, height: 1400 },
    ];

    const batches = planBatchesBySize(pages, 5200, 4, 1000);
    assert.strictEqual(batches.length, 2);
    assert.strictEqual(batches[0].items.length, 1);
    assert.strictEqual(batches[0].totalHeight, 4800);
    assert.strictEqual(batches[1].items.length, 1);
    assert.strictEqual(batches[1].totalHeight, 1400);
  });

  test('enforces MAX_PAGES_PER_BATCH cap even for short pages', () => {
    // 5 short pages of height 500 each => total 2500 < 5200
    // Cap is 4 pages max per batch
    const pages = [0, 1, 2, 3, 4].map((i) => ({
      page: makePage(i),
      pageIndex: i,
      chapterIndex: 0,
      width: 1000,
      height: 500,
    }));

    const batches = planBatchesBySize(pages, 5200, 4, 1000);
    assert.strictEqual(batches.length, 2);
    assert.strictEqual(batches[0].items.length, 4);
    assert.strictEqual(batches[1].items.length, 1);
  });

  test('unpacks dialogue blocks and remaps coordinates back to individual pages', () => {
    const batch: CompositeBatch = {
      id: 'test-batch',
      chapterIndex: 0,
      items: [
        {
          pageIndex: 0,
          chapterIndex: 0,
          page: makePage(0),
          originalWidth: 1000,
          originalHeight: 2000,
          scaledHeight: 2000,
          yStart: 0,
          yEnd: 2000,
        },
        {
          pageIndex: 1,
          chapterIndex: 0,
          page: makePage(1),
          originalWidth: 1000,
          originalHeight: 2000,
          scaledHeight: 2000,
          yStart: 2000,
          yEnd: 4000,
        },
      ],
      totalWidth: 1000,
      totalHeight: 4000,
    };

    const mockOcrResult = {
      blocks: [
        // Block 1 on Page 1 (y: 500px => 500/4000 * 1000 = 125 on composite scale)
        {
          id: 'b1',
          readingOrder: 1,
          type: 'dialogue',
          speaker: 'Hero',
          text: 'Hello from Page 1',
          yPercent: 12,
          box_2d: [100, 100, 150, 400] as [number, number, number, number],
        },
        // Block 2 on Page 2 (y: 3000px => 3000/4000 * 1000 = 750 on composite scale)
        {
          id: 'b2',
          readingOrder: 2,
          type: 'dialogue',
          speaker: 'Villain',
          text: 'Hello from Page 2',
          yPercent: 75,
          box_2d: [700, 200, 800, 600] as [number, number, number, number],
        },
      ],
      fullText: 'Full composite text',
    };

    const resultMap = unpackBatchResult(batch, mockOcrResult);

    const page0Res = resultMap.get(0);
    const page1Res = resultMap.get(1);

    assert.ok(page0Res);
    assert.ok(page1Res);

    assert.strictEqual(page0Res?.blocks.length, 1);
    assert.strictEqual(page0Res?.blocks[0].text, 'Hello from Page 1');
    assert.strictEqual(page0Res?.blocks[0].speaker, 'Hero');
    assert.strictEqual(page0Res?.fullText, 'Hero: Hello from Page 1');

    assert.strictEqual(page1Res?.blocks.length, 1);
    assert.strictEqual(page1Res?.blocks[0].text, 'Hello from Page 2');
    assert.strictEqual(page1Res?.blocks[0].speaker, 'Villain');
    assert.strictEqual(page1Res?.fullText, 'Villain: Hello from Page 2');
  });

  test('correctly preserves and assigns top-of-page dialogue box on page boundaries', () => {
    const batch: CompositeBatch = {
      id: 'test-boundary-batch',
      chapterIndex: 0,
      items: [
        {
          pageIndex: 0,
          chapterIndex: 0,
          page: makePage(0),
          originalWidth: 1000,
          originalHeight: 2000,
          scaledHeight: 2000,
          yStart: 0,
          yEnd: 2000,
        },
        {
          pageIndex: 1,
          chapterIndex: 0,
          page: makePage(1),
          originalWidth: 1000,
          originalHeight: 2000,
          scaledHeight: 2000,
          yStart: 2000,
          yEnd: 4000,
        },
      ],
      totalWidth: 1000,
      totalHeight: 4000,
    };

    // A top dialogue box on Page 2 whose bounding box slightly overlaps or touches the 2000px boundary
    // box_2d: [ymin, xmin, ymax, xmax] -> on 4000px canvas, 495 is 1980px and 520 is 2080px (majority on Page 2)
    const mockOcrResult = {
      blocks: [
        {
          id: 'b-top-page2',
          readingOrder: 1,
          type: 'dialogue',
          speaker: 'Captain',
          text: 'Hold the gates! We are under attack!',
          box_2d: [495, 100, 520, 800] as [number, number, number, number],
        },
      ],
      fullText: 'Captain: Hold the gates! We are under attack!',
    };

    const resultMap = unpackBatchResult(batch, mockOcrResult);
    const page1Res = resultMap.get(1);

    assert.ok(page1Res, 'Page 2 result should exist');
    assert.strictEqual(page1Res?.blocks.length, 1, 'Top dialogue must be mapped to Page 2, not lost or assigned to Page 1');
    assert.strictEqual(page1Res?.blocks[0].text, 'Hold the gates! We are under attack!');
    assert.strictEqual(page1Res?.blocks[0].speaker, 'Captain');
    // Verify local ymin was clamped cleanly to 0
    assert.strictEqual(page1Res?.blocks[0].box_2d?.[0], 0);
  });

  test('sortBlocksByReadingOrder strictly enforces Top-to-Bottom alignment across comic tiers', () => {
    // 4 speech bubbles on a Western comic page:
    // Panel 1 (Top tier): Left bubble (A) and Right bubble (B)
    // Panel 2 (Bottom tier): Left bubble (C) and Right bubble (D)
    // Previously, flawed sorting read horizontally left-to-right (A then C, then B then D),
    // skipping to the bottom of the page before finishing the top row!
    const mockPageBlocks = [
      {
        id: 'c-bottom-left',
        readingOrder: 1, // Suppose model mistakenly indexed left side first
        type: 'dialogue' as const,
        speaker: 'Hero',
        text: 'Bottom Left dialogue (Panel 2)',
        box_2d: [600, 80, 680, 400], // y = 600
      },
      {
        id: 'a-top-left',
        readingOrder: 2,
        type: 'dialogue' as const,
        speaker: 'Hero',
        text: 'Top Left dialogue (Panel 1)',
        box_2d: [50, 100, 120, 420], // y = 50
      },
      {
        id: 'd-bottom-right',
        readingOrder: 3,
        type: 'dialogue' as const,
        speaker: 'Sidekick',
        text: 'Bottom Right dialogue (Panel 2)',
        box_2d: [620, 600, 700, 900], // y = 620
      },
      {
        id: 'b-top-right',
        readingOrder: 4,
        type: 'dialogue' as const,
        speaker: 'Villain',
        text: 'Top Right dialogue (Panel 1)',
        box_2d: [70, 580, 140, 920], // y = 70
      },
    ];

    const sortedComic = sortBlocksByReadingOrder(mockPageBlocks, 'comic-ltr');

    // Expected sequence in Western comic:
    // 1. Top Left (Panel 1)
    // 2. Top Right (Panel 1)
    // 3. Bottom Left (Panel 2)
    // 4. Bottom Right (Panel 2)
    assert.strictEqual(sortedComic[0].id, 'a-top-left', 'First should be Top Left');
    assert.strictEqual(sortedComic[1].id, 'b-top-right', 'Second should be Top Right');
    assert.strictEqual(sortedComic[2].id, 'c-bottom-left', 'Third should be Bottom Left');
    assert.strictEqual(sortedComic[3].id, 'd-bottom-right', 'Fourth should be Bottom Right');

    // Expected sequence in Manga (Right-to-Left, Top-to-Bottom):
    // 1. Top Right (Panel 1)
    // 2. Top Left (Panel 1)
    // 3. Bottom Right (Panel 2)
    // 4. Bottom Left (Panel 2)
    const sortedManga = sortBlocksByReadingOrder(mockPageBlocks, 'manga-rtl');
    assert.strictEqual(sortedManga[0].id, 'b-top-right', 'Manga First should be Top Right');
    assert.strictEqual(sortedManga[1].id, 'a-top-left', 'Manga Second should be Top Left');
    assert.strictEqual(sortedManga[2].id, 'd-bottom-right', 'Manga Third should be Bottom Right');
    assert.strictEqual(sortedManga[3].id, 'c-bottom-left', 'Manga Fourth should be Bottom Left');
  });

  test('sortBlocksByReadingOrder uses 5% (50 units) diffY threshold for vertical tier progression', () => {
    // Two bubbles: bubble A at y = 100, x = 600 (Right side). Bubble B at y = 160, x = 100 (Left side).
    // diffY = 60 units (6% of page height).
    // Under 5% threshold (50 units), diffY (60) > 50 -> Vertical tier progression dominates!
    // Therefore higher bubble A (y = 100) MUST come first, even in comic-ltr (where left side would otherwise precede right side if in same row).
    const blocksWith6PercentDiff = [
      {
        id: 'lower-left',
        readingOrder: 1,
        type: 'dialogue' as const,
        speaker: 'B',
        text: 'Lower Left bubble',
        box_2d: [160, 100, 200, 300], // y = 160
      },
      {
        id: 'higher-right',
        readingOrder: 2,
        type: 'dialogue' as const,
        speaker: 'A',
        text: 'Higher Right bubble',
        box_2d: [100, 600, 140, 800], // y = 100
      },
    ];

    const sorted = sortBlocksByReadingOrder(blocksWith6PercentDiff, 'comic-ltr');
    assert.strictEqual(sorted[0].id, 'higher-right', 'Higher bubble comes first because diffY (60) exceeds 5% (50 units)');
    assert.strictEqual(sorted[1].id, 'lower-left', 'Lower bubble comes second');
  });
});
