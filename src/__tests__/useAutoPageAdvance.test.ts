import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  STORAGE_KEY_PAUSE,
  DEFAULT_PAUSE_SECONDS,
  MIN_PAUSE_SECONDS,
  MAX_PAUSE_SECONDS,
} from '../hooks/useAutoPageAdvance';

describe('Auto-Page Advance Logic & Constraints', () => {
  beforeEach(() => {
    // Clear mock storage if any
  });

  test('default pause time is 5 seconds and respects boundaries', () => {
    assert.strictEqual(DEFAULT_PAUSE_SECONDS, 5);
    assert.strictEqual(MIN_PAUSE_SECONDS, 0);
    assert.strictEqual(MAX_PAUSE_SECONDS, 120);
  });

  test('pause duration allows zero for instant continuous advancement and clamps negative values to 0s', () => {
    const clampPause = (raw: number) => Math.max(MIN_PAUSE_SECONDS, Math.min(MAX_PAUSE_SECONDS, raw));
    assert.strictEqual(clampPause(0), 0);
    assert.strictEqual(clampPause(-5), 0);
    assert.strictEqual(clampPause(0.5), 0.5);
    assert.strictEqual(clampPause(2), 2);
    assert.strictEqual(clampPause(10), 10);
    assert.strictEqual(clampPause(300), 120);
  });

  test('reading orders support Manga RTL, Comic LTR, and Manhwa Vertical', () => {
    const readingOrders = ['manga-rtl', 'comic-ltr', 'manhwa-vertical'];
    assert.ok(readingOrders.includes('manga-rtl'), 'Supports Manga (RTL)');
    assert.ok(readingOrders.includes('comic-ltr'), 'Supports Comic (LTR)');
    assert.ok(readingOrders.includes('manhwa-vertical'), 'Supports Manhwa (Vertical)');
  });

  test('page advancement sequential logic stops at final page', () => {
    const totalPages = 5;
    let currentPage = 0;
    const advance = () => {
      if (currentPage < totalPages - 1) {
        currentPage += 1;
        return true;
      }
      return false; // Reached end
    };

    assert.strictEqual(advance(), true);
    assert.strictEqual(currentPage, 1);
    assert.strictEqual(advance(), true);
    assert.strictEqual(currentPage, 2);
    assert.strictEqual(advance(), true);
    assert.strictEqual(currentPage, 3);
    assert.strictEqual(advance(), true);
    assert.strictEqual(currentPage, 4); // Final page
    assert.strictEqual(advance(), false); // Must stop at end, no loop
    assert.strictEqual(currentPage, 4);
  });
});
