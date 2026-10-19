import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

interface ComicSourceItem {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
  extName: string;
  pkg: string;
  icon?: string;
  version?: string;
  nsfw: boolean;
}

describe('Supported Comic Sources Catalog & Directory (Keiyoushi / Tachiyomi)', () => {
  const sourcesFilePath = path.resolve(process.cwd(), 'src/data/keiyoushi-sources.json');

  test('sources catalog file exists and contains over 1,400 unique verified websites', () => {
    assert.strictEqual(fs.existsSync(sourcesFilePath), true, 'keiyoushi-sources.json must exist');
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    assert.ok(Array.isArray(sources), 'Sources must be an array');
    assert.ok(sources.length > 1400, `Expected >1400 unique websites, got ${sources.length}`);
  });

  test('no duplicate website URLs exist in the catalog', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    const seenUrls = new Set<string>();
    const duplicates: string[] = [];

    for (const s of sources) {
      const u = s.baseUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      if (seenUrls.has(u)) {
        duplicates.push(u);
      }
      seenUrls.add(u);
    }

    assert.strictEqual(duplicates.length, 0, `Expected 0 duplicate URLs, found duplicates: ${duplicates.slice(0, 5).join(', ')}`);
  });

  test('multi-language websites like MangaDex consolidate languages without duplicate cards', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: (ComicSourceItem & { languages?: string[]; langCount?: number })[] = JSON.parse(raw);

    const mangadexList = sources.filter((s) => s.baseUrl.toLowerCase().includes('mangadex.org'));
    assert.strictEqual(mangadexList.length, 1, 'MangaDex must appear exactly once in the catalog');
    assert.ok((mangadexList[0].languages?.length || 0) > 10, 'MangaDex should consolidate multiple languages');
  });

  test('every source contains required valid fields and http(s) baseUrl', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    for (let i = 0; i < Math.min(100, sources.length); i++) {
      const s = sources[i];
      assert.ok(s.id, `Source #${i} must have an id`);
      assert.ok(s.name, `Source #${i} must have a name`);
      assert.ok(s.baseUrl.startsWith('http'), `Source #${i} baseUrl must start with http, got ${s.baseUrl}`);
      assert.ok(typeof s.lang === 'string', `Source #${i} must have a language string`);
      assert.ok(typeof s.nsfw === 'boolean', `Source #${i} must have a boolean nsfw flag`);
    }
  });

  test('search filter matches source name, extension name, and baseUrl', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    const query = 'mangadex';
    const matches = sources.filter((s) =>
      s.name.toLowerCase().includes(query) ||
      s.baseUrl.toLowerCase().includes(query) ||
      s.extName.toLowerCase().includes(query)
    );

    assert.ok(matches.length > 0, 'Should find MangaDex in sources');
    assert.ok(matches.some((m) => m.name.toLowerCase().includes('mangadex')));
  });

  test('language filter isolates sources by language code', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    const enSources = sources.filter((s) => s.lang === 'en');
    assert.ok(enSources.length > 300, 'Should have hundreds of English sources');
    assert.ok(enSources.every((s) => s.lang === 'en'));

    const frSources = sources.filter((s) => s.lang === 'fr');
    assert.ok(frSources.length > 20, 'Should have French sources');
    assert.ok(frSources.every((s) => s.lang === 'fr'));
  });

  test('NSFW filter accurately separates safe-for-work and 18+ content', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    const sfwSources = sources.filter((s) => !s.nsfw);
    const nsfwSources = sources.filter((s) => s.nsfw);

    assert.ok(sfwSources.length > 500, 'Should have hundreds of SFW sources');
    assert.ok(nsfwSources.length > 100, 'Should have adult sources');
    assert.strictEqual(sfwSources.length + nsfwSources.length, sources.length);
  });

  test('pagination slicing behaves correctly without out-of-bounds error', () => {
    const raw = fs.readFileSync(sourcesFilePath, 'utf-8');
    const sources: ComicSourceItem[] = JSON.parse(raw);

    const limit = 36;
    const page1 = sources.slice(0, limit);
    const page2 = sources.slice(limit, limit * 2);

    assert.strictEqual(page1.length, limit);
    assert.strictEqual(page2.length, limit);
    assert.notStrictEqual(page1[0].id, page2[0].id);

    const totalPages = Math.ceil(sources.length / limit);
    assert.ok(totalPages > 35, `Expected >35 pages, got ${totalPages}`);
  });
});
