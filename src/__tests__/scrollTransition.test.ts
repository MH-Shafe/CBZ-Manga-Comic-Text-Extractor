import { test, describe } from 'node:test';
import assert from 'node:assert';
import { shouldResetScrollToTop, calculatePersistedScrollTop } from '../utils/scrollTransition';
import { ComicPage } from '../types';

describe('Intelligent Scroll Transition Logic', () => {
  const dummyBlob = new Blob([], { type: 'image/jpeg' });

  const createDummyPage = (id: string, index: number, isExtraPage = false): ComicPage => ({
    id,
    index,
    fileName: `page-${index + 1}.jpg`,
    imageUrl: `blob:dummy-${index}`,
    blob: dummyBlob,
    mimeType: 'image/jpeg',
    status: 'completed',
    isExcluded: false,
    isExtraPage,
  });

  test('persists scroll position for consecutive long manhwa pages mid-scroll', () => {
    const prevPage = createDummyPage('p1', 0);
    const nextPage = createDummyPage('p2', 1);

    const result = shouldResetScrollToTop({
      prevIndex: 0,
      nextIndex: 1,
      prevPage,
      nextPage,
      prevScrollTop: 850,
      prevScrollHeight: 4000,
      containerClientHeight: 900,
      fitMode: 'fit-width',
      readingOrder: 'manhwa-vertical',
      prevAspectRatio: 3.2,
      nextAspectRatio: 3.0,
    });

    assert.strictEqual(
      result,
      false,
      'Should persist scroll position when reading consecutive manhwa strips mid-scroll'
    );
  });

  test('resets scroll to top when transitioning to or from an extra page', () => {
    const normalPage = createDummyPage('p1', 0);
    const extraPage = createDummyPage('p2', 1, true); // Extra ad or credits page

    const result = shouldResetScrollToTop({
      prevIndex: 0,
      nextIndex: 1,
      prevPage: normalPage,
      nextPage: extraPage,
      prevScrollTop: 800,
      prevScrollHeight: 3000,
      containerClientHeight: 800,
      fitMode: 'fit-width',
      readingOrder: 'manhwa-vertical',
      prevAspectRatio: 3.0,
      nextAspectRatio: 2.8,
    });

    assert.strictEqual(result, true, 'Should reset to top when entering an extra page');
  });

  test('resets scroll to top when user already reached the bottom of previous page', () => {
    const prevPage = createDummyPage('p1', 0);
    const nextPage = createDummyPage('p2', 1);

    // prevScrollTop (2200) + clientHeight (800) = 3000 >= scrollHeight (3000) - 50 -> reached bottom!
    const result = shouldResetScrollToTop({
      prevIndex: 0,
      nextIndex: 1,
      prevPage,
      nextPage,
      prevScrollTop: 2200,
      prevScrollHeight: 3000,
      containerClientHeight: 800,
      fitMode: 'fit-width',
      readingOrder: 'manhwa-vertical',
      prevAspectRatio: 3.0,
      nextAspectRatio: 3.0,
    });

    assert.strictEqual(result, true, 'Should start at top of next page if previous page was completed');
  });

  test('resets scroll to top on non-consecutive page jumps', () => {
    const prevPage = createDummyPage('p1', 0);
    const distantPage = createDummyPage('p6', 5);

    const result = shouldResetScrollToTop({
      prevIndex: 0,
      nextIndex: 5,
      prevPage,
      nextPage: distantPage,
      prevScrollTop: 600,
      prevScrollHeight: 3000,
      containerClientHeight: 800,
      fitMode: 'fit-width',
      readingOrder: 'manhwa-vertical',
      prevAspectRatio: 3.0,
      nextAspectRatio: 3.0,
    });

    assert.strictEqual(result, true, 'Should reset scroll to top when jumping multiple pages');
  });

  test('resets scroll to top when transitioning between significantly different aspect ratios', () => {
    const manhwaStrip = createDummyPage('p1', 0);
    const standardPage = createDummyPage('p2', 1);

    const result = shouldResetScrollToTop({
      prevIndex: 0,
      nextIndex: 1,
      prevPage: manhwaStrip,
      nextPage: standardPage,
      prevScrollTop: 700,
      prevScrollHeight: 4000,
      containerClientHeight: 800,
      fitMode: 'fit-width',
      readingOrder: 'manhwa-vertical',
      prevAspectRatio: 3.8, // Tall strip
      nextAspectRatio: 1.2, // Standard comic page
    });

    assert.strictEqual(
      result,
      true,
      'Should reset scroll when transitioning from tall strip to standard comic page'
    );
  });

  test('calculatePersistedScrollTop clamps properly within new container bounds', () => {
    // If previous scroll was 1500, but new scrollHeight is only 1800 with 1000 clientHeight:
    // Max scroll is 800.
    const clamped = calculatePersistedScrollTop(1500, 1800, 1000);
    assert.strictEqual(clamped, 800, 'Clamps persisted scroll to maximum available scroll height');

    // If within bounds:
    const normal = calculatePersistedScrollTop(500, 3000, 1000);
    assert.strictEqual(normal, 500, 'Maintains exact scroll offset when within bounds');
  });
});
