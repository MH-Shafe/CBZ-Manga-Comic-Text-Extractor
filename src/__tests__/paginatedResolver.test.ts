import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isPaginatedReader,
  extractPaginationBounds,
  extractSinglePageImage,
  generateSequenceFromPattern,
  generatePageUrl,
  resolvePaginatedReader,
} from '../server/paginatedResolver';

describe('Paginated Reader & Gallery Resolver (1 image per URL -> Full Continuous Strip)', () => {
  // 1. Detection
  describe('isPaginatedReader detection', () => {
    test('detects paginated URL structure with page number at end', () => {
      assert.strictEqual(
        isPaginatedReader('<html><body></body></html>', 'https://site.com/view/727087/1'),
        true
      );
      assert.strictEqual(
        isPaginatedReader('<html><body></body></html>', 'https://site.com/g/12345/1/'),
        true
      );
      assert.strictEqual(
        isPaginatedReader('<html><body></body></html>', 'https://site.com/comic/chapter-1/page/1'),
        true
      );
      assert.strictEqual(
        isPaginatedReader('<html><body></body></html>', 'https://site.com/reader?page=1'),
        true
      );
    });

    test('detects paginated reader from HTML pagination elements', () => {
      const html = `
        <div id="image-container">
          <img src="https://i.site.com/galleries/727087/1.webp" />
        </div>
        <span class="num-pages">96</span>
      `;
      assert.strictEqual(isPaginatedReader(html, 'https://site.com/read'), true);
    });

    test('returns false for non-paginated standard pages without page markers', () => {
      const html = `<div><p>Welcome to our homepage</p></div>`;
      assert.strictEqual(isPaginatedReader(html, 'https://site.com/home'), false);
    });
  });

  // 2. Pagination Bounds Extraction
  describe('extractPaginationBounds', () => {
    test('extracts total pages from num-pages / total-pages span tags', () => {
      const html = `<span class="num-pages">96</span>`;
      const bounds = extractPaginationBounds(html, 'https://site.com/view/727087/1');
      assert.strictEqual(bounds.currentPage, 1);
      assert.strictEqual(bounds.totalPages, 96);
    });

    test('extracts total pages from Page 1 of 96 textual indicator', () => {
      const html = `<div class="top-nav">Page 1 of 48</div>`;
      const bounds = extractPaginationBounds(html, 'https://site.com/read/ch1/1');
      assert.strictEqual(bounds.currentPage, 1);
      assert.strictEqual(bounds.totalPages, 48);
    });

    test('extracts total pages from select dropdown options', () => {
      const html = `
        <select name="page">
          <option value="1">Page 1</option>
          <option value="2">Page 2</option>
          <option value="3">Page 3</option>
          <option value="32">Page 32</option>
        </select>
      `;
      const bounds = extractPaginationBounds(html, 'https://site.com/manga/ch1/1');
      assert.strictEqual(bounds.currentPage, 1);
      assert.strictEqual(bounds.totalPages, 32);
    });

    test('extracts current page from middle of sequence', () => {
      const html = `<span class="total-pages">60</span>`;
      const bounds = extractPaginationBounds(html, 'https://site.com/view/727087/15');
      assert.strictEqual(bounds.currentPage, 15);
      assert.strictEqual(bounds.totalPages, 60);
    });
  });

  // 3. Single Image Extraction
  describe('extractSinglePageImage', () => {
    test('extracts main image from #image-container', () => {
      const html = `
        <div class="header"><img src="/logo.png" /></div>
        <section id="image-container">
          <img src="https://i.site.com/galleries/727087/1.webp" />
        </section>
      `;
      const img = extractSinglePageImage(html, 'https://site.com/view/727087/1');
      assert.strictEqual(img, 'https://i.site.com/galleries/727087/1.webp');
    });
  });

  // 4. Pattern-based Sequence Generation
  describe('generateSequenceFromPattern', () => {
    test('generates full sequence 1 through 96 for standard webp gallery pattern', () => {
      const primaryUrl = 'https://i.site.com/galleries/727087/1.webp';
      const sequence = generateSequenceFromPattern(primaryUrl, 1, 96);

      assert.ok(sequence, 'Sequence must not be null');
      assert.strictEqual(sequence.length, 96);
      assert.strictEqual(sequence[0], 'https://i.site.com/galleries/727087/1.webp');
      assert.strictEqual(sequence[1], 'https://i.site.com/galleries/727087/2.webp');
      assert.strictEqual(sequence[49], 'https://i.site.com/galleries/727087/50.webp');
      assert.strictEqual(sequence[95], 'https://i.site.com/galleries/727087/96.webp');
    });

    test('preserves zero-padding when generating sequential URLs (e.g. 001.jpg -> 096.jpg)', () => {
      const primaryUrl = 'https://cdn.site.com/manga/chapter-1/page_001.jpg';
      const sequence = generateSequenceFromPattern(primaryUrl, 1, 50);

      assert.ok(sequence);
      assert.strictEqual(sequence.length, 50);
      assert.strictEqual(sequence[0], 'https://cdn.site.com/manga/chapter-1/page_001.jpg');
      assert.strictEqual(sequence[8], 'https://cdn.site.com/manga/chapter-1/page_009.jpg');
      assert.strictEqual(sequence[9], 'https://cdn.site.com/manga/chapter-1/page_010.jpg');
      assert.strictEqual(sequence[49], 'https://cdn.site.com/manga/chapter-1/page_050.jpg');
    });
  });

  // 5. Page URL generation
  describe('generatePageUrl', () => {
    test('replaces path number with target page', () => {
      assert.strictEqual(
        generatePageUrl('https://site.com/view/727087/1', 2),
        'https://site.com/view/727087/2'
      );
      assert.strictEqual(
        generatePageUrl('https://site.com/view/727087/1/', 2),
        'https://site.com/view/727087/2/'
      );
    });

    test('updates query parameter with target page', () => {
      assert.strictEqual(
        generatePageUrl('https://site.com/reader?page=1', 5),
        'https://site.com/reader?page=5'
      );
    });
  });

  // 6. Full Resolver End-to-End
  describe('resolvePaginatedReader end-to-end', () => {
    test('resolves full 96-page continuous strip from single page URL (e.g. .../view/727087/1)', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Metamorphosis (Complete Edition) - Page 1</title>
          <meta property="og:title" content="Metamorphosis (Complete Edition) - Page 1" />
        </head>
        <body>
          <div id="image-container">
            <img src="https://i.site.com/galleries/727087/1.webp" />
          </div>
          <div class="pagination">
            <span class="num-pages">96</span>
          </div>
        </body>
        </html>
      `;

      const result = await resolvePaginatedReader(
        mockHtml,
        'https://site.com/view/727087/1',
        'https://site.com/'
      );

      assert.ok(result, 'Expected paginated reader to resolve');
      assert.strictEqual(result.pageCount, 96);
      assert.strictEqual(result.engineName, 'Paginated Reader & Gallery Resolver');
      assert.strictEqual(result.seriesTitle, 'Metamorphosis (Complete Edition)');
      assert.strictEqual(result.episodeTitle, 'Full Sequence (Pages 1–96)');
      assert.strictEqual(result.pages.length, 96);
      assert.strictEqual(result.pages[0].fileName, 'page_001.webp');
      assert.strictEqual(result.pages[0].originalUrl, 'https://i.site.com/galleries/727087/1.webp');
      assert.strictEqual(result.pages[95].fileName, 'page_096.webp');
      assert.strictEqual(result.pages[95].originalUrl, 'https://i.site.com/galleries/727087/96.webp');
      assert.ok(result.pages[95].proxyUrl.includes('proxy-image'));
    });

    test('resolves paginated reader via fetchHtmlFn when image names are arbitrary hashes', async () => {
      const page1Html = `
        <div id="image-container"><img src="https://cdn.site.com/hash_a.jpg" /></div>
        <span class="num-pages">3</span>
      `;
      const page2Html = `<div id="image-container"><img src="https://cdn.site.com/hash_b.jpg" /></div>`;
      const page3Html = `<div id="image-container"><img src="https://cdn.site.com/hash_c.jpg" /></div>`;

      const mockFetch = async (url: string) => {
        if (url.endsWith('/2')) return page2Html;
        if (url.endsWith('/3')) return page3Html;
        return page1Html;
      };

      const result = await resolvePaginatedReader(
        page1Html,
        'https://site.com/read/123/1',
        'https://site.com/',
        mockFetch
      );

      assert.ok(result);
      assert.strictEqual(result.pageCount, 3);
      assert.strictEqual(result.pages[0].originalUrl, 'https://cdn.site.com/hash_a.jpg');
      assert.strictEqual(result.pages[1].originalUrl, 'https://cdn.site.com/hash_b.jpg');
      assert.strictEqual(result.pages[2].originalUrl, 'https://cdn.site.com/hash_c.jpg');
    });
  });
});
