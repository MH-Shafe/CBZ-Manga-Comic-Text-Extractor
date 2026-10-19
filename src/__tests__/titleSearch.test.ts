import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  searchTitlesAcrossSources,
  fetchTitleChapters,
  resolveMangaDexChapter,
} from '../server/titleSearch';

describe('In-App Title Search Across Sources', () => {
  it('returns empty array when query is blank or whitespace', async () => {
    const results = await searchTitlesAcrossSources('   ');
    assert.deepStrictEqual(results, []);
  });

  it('searches across sources and returns formatted ComicSearchResult items', async () => {
    // Search a known worldwide popular series
    const results = await searchTitlesAcrossSources('Solo Leveling');
    assert(Array.isArray(results), 'Expected results to be an array');
    assert(results.length > 0, 'Expected at least one result for Solo Leveling');

    const first = results[0];
    assert(first.id, 'Result must have an id');
    assert(first.title, 'Result must have a title');
    assert(first.source, 'Result must have a source name');
    assert(first.sourceUrl, 'Result must have a sourceUrl');

    // Verify altTitles or title matches search query
    const hasSolo =
      first.title.toLowerCase().includes('solo') ||
      first.title.toLowerCase().includes('level') ||
      (first.altTitles && first.altTitles.some((t) => t.toLowerCase().includes('solo')));
    assert(hasSolo, `Expected top result to be related to Solo Leveling, got: ${first.title}`);
  });

  it('supports filtering by specific source (e.g. mangadex)', async () => {
    const mdResults = await searchTitlesAcrossSources('Chainsaw Man', 'mangadex');
    assert(Array.isArray(mdResults), 'Expected array');
    if (mdResults.length > 0) {
      assert(mdResults.every((r) => r.source === 'MangaDex'), 'All results should be from MangaDex');
    }
  });

  it('supports filtering by webtoons source', async () => {
    const webtoonsResults = await searchTitlesAcrossSources('Tower of God', 'webtoons');
    assert(Array.isArray(webtoonsResults), 'Expected array');
    if (webtoonsResults.length > 0) {
      assert(
        webtoonsResults.every((r) => r.source === 'Webtoons'),
        'All results should be from Webtoons'
      );
    }
  });

  it('fetches chapter list for a MangaDex manga', async () => {
    // MangaDex ID for Tatsuki Fujimoto collection
    const mangaId = '991e9f15-8368-4843-a78a-5605918f9c3e';
    const chapters = await fetchTitleChapters('MangaDex', `mangadex:${mangaId}`, `https://mangadex.org/title/${mangaId}`);
    assert(Array.isArray(chapters), 'Chapters must be an array');
    if (chapters.length > 0) {
      const ch = chapters[0];
      assert(ch.id, 'Chapter must have id');
      assert(ch.number, 'Chapter must have number');
      assert(ch.title, 'Chapter must have title');
      assert(ch.url.startsWith('http'), 'Chapter URL must be valid link');
    }
  });

  it('resolves MangaDex chapter into full comic panels with proxy URLs', async () => {
    // Real public chapter on MangaDex
    const chapterId = '68475b28-7622-4fd8-b720-4a21b1f55f7d';
    const resolved = await resolveMangaDexChapter(chapterId);
    assert(resolved !== null, 'Expected chapter to resolve successfully');
    if (resolved) {
      assert.strictEqual(resolved.success, true);
      assert(resolved.pages.length > 0, 'Must have at least one panel');
      assert(resolved.pages[0].proxyUrl.includes('/api/proxy-image'), 'Must route pages through proxy');
      assert(resolved.seriesTitle, 'Must have series title');
      assert.strictEqual(resolved.readingOrder, 'manga-rtl');
    }
  });

  it('gracefully handles non-existent or invalid chapter IDs', async () => {
    const badResult = await resolveMangaDexChapter('non-existent-invalid-id-0000');
    assert.strictEqual(badResult, null);
  });
});
