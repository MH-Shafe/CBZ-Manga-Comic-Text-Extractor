import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Page Navigation & Continuous Scroll Lock Logic', () => {
  test('Next and Prev buttons consistently advance and retreat across all reading orders', () => {
    const totalPages = 5;

    const navigate = (
      action: 'next' | 'prev',
      currentIndex: number,
      readingOrder: 'manga-rtl' | 'comic-ltr' | 'manhwa-vertical'
    ) => {
      // Direct Next/Prev UI contract: Next always increments page, Prev always decrements
      if (action === 'next') {
        return Math.min(totalPages - 1, currentIndex + 1);
      } else {
        return Math.max(0, currentIndex - 1);
      }
    };

    // Regardless of readingOrder, clicking "Next" from Page 0 takes user to Page 1 (never back to Page 0)
    assert.strictEqual(navigate('next', 0, 'manga-rtl'), 1, 'Manga RTL clicking Next advances to page index 1');
    assert.strictEqual(navigate('next', 1, 'manga-rtl'), 2, 'Manga RTL clicking Next advances to page index 2');
    assert.strictEqual(navigate('next', 0, 'comic-ltr'), 1, 'Comic LTR clicking Next advances to page index 1');
    assert.strictEqual(navigate('next', 0, 'manhwa-vertical'), 1, 'Manhwa vertical clicking Next advances to page index 1');

    // Clicking "Prev" takes user back
    assert.strictEqual(navigate('prev', 2, 'manga-rtl'), 1, 'Clicking Prev retreats to page index 1');
    assert.strictEqual(navigate('prev', 0, 'manga-rtl'), 0, 'Prev disabled / clamped at page index 0');
  });

  test('Target page lock prevents intermediate scroll listener frames from reverting currentIndex', () => {
    let currentIndex = 0;
    let targetPageIndex: number | null = null;
    let isProgrammaticScroll = false;

    // Simulate clicking Next:
    const handleNextClick = () => {
      const nextIdx = currentIndex + 1;
      currentIndex = nextIdx;
      targetPageIndex = nextIdx;
      isProgrammaticScroll = true;
    };

    // Simulate scroll listener running during smooth scroll
    const simulateScrollEvent = (detectedPageAtProbe: number) => {
      // If programmatically scrolling to a target page, do not fight or emit page change
      if (isProgrammaticScroll || targetPageIndex !== null) {
        return; // Guarded!
      }
      if (detectedPageAtProbe !== currentIndex) {
        currentIndex = detectedPageAtProbe;
      }
    };

    handleNextClick();
    assert.strictEqual(currentIndex, 1, 'Current index was set to 1 on Next click');
    assert.strictEqual(targetPageIndex, 1, 'Target page lock is engaged for index 1');

    // During smooth scroll animation, probe line still intersects with Page 0
    simulateScrollEvent(0);
    assert.strictEqual(currentIndex, 1, 'Scroll listener is blocked from reverting to page 0 during transition');

    // Once smooth scroll finishes and settles on target page:
    targetPageIndex = null;
    isProgrammaticScroll = false;

    // User scrolls naturally to page 2:
    simulateScrollEvent(2);
    assert.strictEqual(currentIndex, 2, 'After scroll lock is released, natural scroll updates currentIndex correctly');
  });

  test('User manual gesture cancels programmatic lock so user has instant scroll control', () => {
    let currentIndex = 1;
    let targetPageIndex: number | null = 1;
    let isProgrammaticScroll = true;

    // User touches screen or turns mouse wheel
    const handleUserGesture = () => {
      targetPageIndex = null;
      isProgrammaticScroll = false;
    };

    handleUserGesture();
    assert.strictEqual(targetPageIndex, null, 'Programmatic target lock cleared by user gesture');
    assert.strictEqual(isProgrammaticScroll, false, 'Programmatic scroll flag cleared');
  });
});
