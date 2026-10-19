import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  parseMangaThemesia,
  parseMadara,
  parseMangaReaderOrKakalot,
  parseWebtoons,
  parseDynamicSlideEngine,
  parseNHentaiEngine,
  parseSimplyHentaiEngine,
  parseNovelCrowEngine,
  parseOppaiStreamEngine,
  parseUniversalFallback,
  parseComicFromHtml,
} from '../server/cmsScrapers';

describe('Universal CMS Scraper Engines (Madara, MangaThemesia, MangaReader, Webtoons)', () => {
  // 1. MangaThemesia Engine (Asura Scans, Flame Comics, Reaper Scans)
  describe('MangaThemesia Engine', () => {
    test('extracts high-res images from ts_reader.run JSON payload', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Solo Leveling Chapter 100 - Asura Scans</title>
          <meta property="og:title" content="Solo Leveling Chapter 100 - Asura Scans" />
        </head>
        <body class="theme-mangathemesia">
          <div class="ts-breadcrumb">
            <a href="https://asuracomic.net/manga/solo-leveling">Solo Leveling</a>
          </div>
          <h1 class="entry-title">Chapter 100</h1>
          <div id="readerarea"></div>
          <script>
            ts_reader.run({
              "prevUrl": "https://asuracomic.net/solo-leveling-chapter-99/",
              "nextUrl": "https://asuracomic.net/solo-leveling-chapter-101/",
              "sources": [
                {
                  "source": "Default",
                  "images": [
                    "https://asuracomic.net/wp-content/uploads/2024/01/001.webp",
                    "https://asuracomic.net/wp-content/uploads/2024/01/002.webp",
                    "https://asuracomic.net/wp-content/uploads/2024/01/003.webp"
                  ]
                }
              ]
            });
          </script>
        </body>
        </html>
      `;

      const result = parseMangaThemesia(mockHtml, 'https://asuracomic.net/solo-leveling-chapter-100/', 'https://asuracomic.net/');
      assert.ok(result, 'Expected MangaThemesia to parse successfully');
      assert.strictEqual(result.pageCount, 3);
      assert.strictEqual(result.engineName, 'MangaThemesia (Asura, Flame, Reaper)');
      assert.strictEqual(result.seriesTitle, 'Solo Leveling');
      assert.strictEqual(result.episodeTitle, 'Chapter 100');
      assert.strictEqual(result.readingOrder, 'manhwa-vertical');
      assert.strictEqual(result.pages[0].originalUrl, 'https://asuracomic.net/wp-content/uploads/2024/01/001.webp');
      assert.ok(result.pages[0].proxyUrl.includes('proxy-image'));
    });

    test('extracts images from #readerarea DOM when ts_reader script is not present', () => {
      const mockHtml = `
        <div id="readerarea">
          <p><img src="https://flamecomics.xyz/comic/01.jpg" /></p>
          <p><img data-src="https://flamecomics.xyz/comic/02.jpg" /></p>
          <p><img src="https://flamecomics.xyz/assets/discord-banner.jpg" /></p>
        </div>
      `;

      const result = parseMangaThemesia(mockHtml, 'https://flamecomics.xyz/chapter-5/', 'https://flamecomics.xyz/');
      assert.ok(result, 'Expected MangaThemesia DOM fallback to parse');
      assert.strictEqual(result.pageCount, 2, 'Should filter out discord banner');
      assert.strictEqual(result.pages[0].originalUrl, 'https://flamecomics.xyz/comic/01.jpg');
      assert.strictEqual(result.pages[1].originalUrl, 'https://flamecomics.xyz/comic/02.jpg');
    });
  });

  // 2. Madara Engine (wp-manga: MangaTX, 1stKiss, Toonily, TopManhua)
  describe('Madara (wp-manga) Engine', () => {
    test('extracts images from .reading-content with lazy-load data-src attributes', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html class="wp-manga">
        <head>
          <title>The Beginning After the End - Chapter 175</title>
          <meta property="og:title" content="The Beginning After the End - Chapter 175" />
        </head>
        <body>
          <div class="c-breadcrumb">
            <a href="https://mangatx.to/manga/tbate/">The Beginning After the End</a>
          </div>
          <h1 id="chapter-heading">Chapter 175</h1>
          <div class="reading-content">
            <div class="page-break no-gaps">
              <img src="data:image/svg+xml;base64,PHN2Zz4..." data-src="https://mangatx.to/uploads/tbate/175/01.jpg" class="wp-manga-chapter-img" />
            </div>
            <div class="page-break no-gaps">
              <img src="data:image/svg+xml;base64,PHN2Zz4..." data-lazy-src="https://mangatx.to/uploads/tbate/175/02.jpg" class="wp-manga-chapter-img" />
            </div>
            <div class="page-break no-gaps">
              <img src="https://mangatx.to/uploads/tbate/175/03.jpg" class="wp-manga-chapter-img" />
            </div>
            <img src="https://mangatx.to/logo.png" />
          </div>
        </body>
        </html>
      `;

      const result = parseMadara(mockHtml, 'https://mangatx.to/manga/tbate/chapter-175/', 'https://mangatx.to/');
      assert.ok(result, 'Expected Madara scraper to parse successfully');
      assert.strictEqual(result.pageCount, 3);
      assert.strictEqual(result.engineName, 'Madara (wp-manga)');
      assert.strictEqual(result.seriesTitle, 'The Beginning After the End');
      assert.strictEqual(result.episodeTitle, 'Chapter 175');
      assert.strictEqual(result.pages[0].originalUrl, 'https://mangatx.to/uploads/tbate/175/01.jpg');
      assert.strictEqual(result.pages[1].originalUrl, 'https://mangatx.to/uploads/tbate/175/02.jpg');
      assert.strictEqual(result.pages[2].originalUrl, 'https://mangatx.to/uploads/tbate/175/03.jpg');
    });
  });

  // 3. MangaReader & MangaNato / Kakalot Engine
  describe('MangaReader / Kakalot Engine', () => {
    test('extracts images from JavaScript chapter_images array', () => {
      const mockHtml = `
        <div class="container-chapter-reader"></div>
        <script>
          var chapter_images = [
            "https://v1.mkklcdnv6tempv2.com/img/01.jpg",
            "https://v1.mkklcdnv6tempv2.com/img/02.jpg"
          ];
        </script>
      `;

      const result = parseMangaReaderOrKakalot(mockHtml, 'https://manganato.com/chapter-1', 'https://manganato.com/');
      assert.ok(result, 'Expected MangaReader scraper to parse JS array');
      assert.strictEqual(result.pageCount, 2);
      assert.strictEqual(result.engineName, 'MangaReader / Kakalot');
      assert.strictEqual(result.pages[0].originalUrl, 'https://v1.mkklcdnv6tempv2.com/img/01.jpg');
    });
  });

  // 4. Webtoons.com Engine
  describe('Webtoons.com Engine', () => {
    test('extracts images from Webtoons _imageList viewer container', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Tower of God - Ep. 150" />
          <meta property="og:description" content="SIU webtoon episode" />
          <span class="author_name">SIU</span>
        </head>
        <body>
          <div id="_imageList">
            <img data-url="https://webtoon-phinf.pstatic.net/comic/001.jpg" />
            <img data-url="https://webtoon-phinf.pstatic.net/comic/002.jpg" />
          </div>
        </body>
        </html>
      `;

      const result = parseWebtoons(mockHtml, 'https://www.webtoons.com/en/fantasy/tower-of-god/viewer?title_no=95&episode_no=150', 'https://www.webtoons.com/');
      assert.ok(result, 'Expected Webtoons engine to parse successfully');
      assert.strictEqual(result.pageCount, 2);
      assert.strictEqual(result.seriesTitle, 'Tower of God');
      assert.strictEqual(result.episodeTitle, 'Ep. 150');
      assert.strictEqual(result.author, 'SIU');
      assert.strictEqual(result.pages[0].originalUrl, 'https://webtoon-phinf.pstatic.net/comic/001.jpg');
    });
  });

  // 5. Dynamic Slides & Obfuscated JS Engine (18PornComic, slides_p_path)
  describe('Dynamic Slides & Obfuscated JS Engine', () => {
    test('extracts and decodes base64 URLs from slides_p_path array like 18porncomic.com', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Secret Class Uncensored - Chapter 146" />
        </head>
        <body>
          <div class="chapter_boxImages" id="chapter_boxImages"></div>
          <script type="text/javascript">
            var slides_p_path = [
              "aHR0cHM6Ly9iay4xOHBvcm5jb21pYy5jb20vdXBsb2Fkcy9tYW5nYS9zZWNyZXQtY2xhc3MtdW5jZW5zb3JlZC9jaGFwdGVycy9jaGFwdGVyLTE0Ni8wMi5qcGc=",
              "aHR0cHM6Ly9iay4xOHBvcm5jb21pYy5jb20vdXBsb2Fkcy9tYW5nYS9zZWNyZXQtY2xhc3MtdW5jZW5zb3JlZC9jaGFwdGVycy9jaGFwdGVyLTE0Ni8wMy5qcGc=",
              "aHR0cHM6Ly9iay4xOHBvcm5jb21pYy5jb20vdXBsb2Fkcy9tYW5nYS9zZWNyZXQtY2xhc3MtdW5jZW5zb3JlZC9jaGFwdGVycy9jaGFwdGVyLTE0Ni8wNC5qcGc=",
            ];
          </script>
        </body>
        </html>
      `;

      const result = parseDynamicSlideEngine(mockHtml, 'https://18porncomic.com/comic/secret-class-uncensored/chapter-146', 'https://18porncomic.com/');
      assert.ok(result, 'Expected DynamicSlideEngine to parse base64 array');
      assert.strictEqual(result.pageCount, 3);
      assert.strictEqual(result.seriesTitle, 'Secret Class Uncensored');
      assert.strictEqual(result.episodeTitle, 'Chapter 146');
      assert.strictEqual(result.pages[0].originalUrl, 'https://bk.18porncomic.com/uploads/manga/secret-class-uncensored/chapters/chapter-146/02.jpg');
      assert.strictEqual(result.pages[1].originalUrl, 'https://bk.18porncomic.com/uploads/manga/secret-class-uncensored/chapters/chapter-146/03.jpg');
      assert.strictEqual(result.pages[2].originalUrl, 'https://bk.18porncomic.com/uploads/manga/secret-class-uncensored/chapters/chapter-146/04.jpg');
    });
  });

  // 6. Universal Fallback Scraper Engine
  describe('Universal Fallback Scraper Engine', () => {
    test('filters out logos, avatars, trackers, and relative links correctly', () => {
      const mockHtml = `
        <div class="chapter-content">
          <img src="/avatars/user1.png" />
          <img src="https://site.com/assets/logo.png" />
          <img src="https://site.com/comic/page_1.png" />
          <img src="https://site.com/comic/page_2.png" />
          <img src="https://site.com/comic/page_3.png" />
          <img src="/patreon-badge.jpg" />
        </div>
      `;

      const result = parseUniversalFallback(mockHtml, 'https://site.com/read/chapter-1', 'https://site.com/');
      assert.ok(result, 'Expected universal scraper to extract pages');
      assert.strictEqual(result.pageCount, 3);
      assert.strictEqual(result.pages[0].originalUrl, 'https://site.com/comic/page_1.png');
      assert.strictEqual(result.pages[1].originalUrl, 'https://site.com/comic/page_2.png');
      assert.strictEqual(result.pages[2].originalUrl, 'https://site.com/comic/page_3.png');
    });
  });

  // 7. Master Dispatcher
  describe('Master Scraper Dispatcher', () => {
    test('routes MangaThemesia URL to MangaThemesia engine', async () => {
      const html = `<body class="theme-mangathemesia"><div id="readerarea"><img src="https://asurascans.com/01.jpg" /></div></body>`;
      const result = await parseComicFromHtml(html, 'https://asurascans.com/ch-1', 'https://asurascans.com/');
      assert.ok(result);
      assert.strictEqual(result.engineName, 'MangaThemesia (Asura, Flame, Reaper)');
    });

    test('routes Madara URL to Madara engine', async () => {
      const html = `<div class="wp-manga"><div class="reading-content"><img src="https://mangatx.to/01.jpg" /></div></div>`;
      const result = await parseComicFromHtml(html, 'https://mangatx.to/ch-1', 'https://mangatx.to/');
      assert.ok(result);
      assert.strictEqual(result.engineName, 'Madara (wp-manga)');
    });

    test('routes Toonily and AllPornComic URLs to Madara engine', async () => {
      const html = `
        <div class="reading-content">
          <img data-src="https://toonily.com/uploads/chapter-1/01.jpg" class="wp-manga-chapter-img" />
          <img data-src="https://toonily.com/uploads/chapter-1/02.jpg" class="wp-manga-chapter-img" />
        </div>
      `;
      const result = await parseComicFromHtml(html, 'https://toonily.com/webtoon/series/chapter-1/', 'https://toonily.com/');
      assert.ok(result);
      assert.strictEqual(result.pageCount, 2);
      assert.strictEqual(result.engineName, 'Madara (wp-manga)');
    });

    test('routes NHentai URL to NHentai engine and converts thumbnail paths to full images', async () => {
      const html = `
        <html>
        <head><title>Test Doujin Title - nHentai</title></head>
        <body>
          <h1 class="title"><span class="pretty">My Amazing Doujinshi</span></h1>
          <div id="thumbnail-container">
            <div class="thumb-container">
              <a href="/g/12345/1/"><img data-src="https://t.nhentai.net/galleries/998877/1t.jpg" /></a>
            </div>
            <div class="thumb-container">
              <a href="/g/12345/2/"><img data-src="https://t.nhentai.net/galleries/998877/2t.jpg" /></a>
            </div>
          </div>
        </body>
        </html>
      `;
      const result = await parseComicFromHtml(html, 'https://nhentai.net/g/12345/', 'https://nhentai.net/');
      assert.ok(result);
      assert.strictEqual(result.engineName, 'NHentai Engine (net/to/xxx)');
      assert.strictEqual(result.pageCount, 2);
      assert.strictEqual(result.seriesTitle, 'My Amazing Doujinshi');
      assert.strictEqual(result.readingOrder, 'manga-rtl');
      assert.strictEqual(result.pages[0].originalUrl, 'https://i.nhentai.net/galleries/998877/1.jpg');
      assert.strictEqual(result.pages[1].originalUrl, 'https://i.nhentai.net/galleries/998877/2.jpg');
    });

    test('routes Simply Hentai URL to Simply Hentai engine via Next.js JSON or DOM', async () => {
      const html = `
        <html>
        <head><title>Simply Manga</title></head>
        <body>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "series": {
                    "title": "Cosplay Diary",
                    "images": [
                      "https://images.simply-hentai.com/page-1.jpg",
                      "https://images.simply-hentai.com/page-2.jpg"
                    ]
                  }
                }
              }
            }
          </script>
        </body>
        </html>
      `;
      const result = await parseComicFromHtml(html, 'https://www.simply-hentai.com/series/cosplay-diary', 'https://www.simply-hentai.com/');
      assert.ok(result);
      assert.strictEqual(result.engineName, 'Simply Hentai Engine');
      assert.strictEqual(result.pageCount, 2);
      assert.strictEqual(result.readingOrder, 'manga-rtl');
      assert.strictEqual(result.pages[0].originalUrl, 'https://images.simply-hentai.com/page-1.jpg');
    });

    test('routes MangaFire and MangaFreak to MangaReader/Kakalot engine', async () => {
      const html = `
        <div id="player">
          <div class="reader-page"><img data-url="https://s1.mangafire.to/manga/ch1/01.jpg" /></div>
          <div class="reader-page"><img data-url="https://s1.mangafire.to/manga/ch1/02.jpg" /></div>
        </div>
      `;
      const result = await parseComicFromHtml(html, 'https://mangafire.to/read/ch-1', 'https://mangafire.to/');
      assert.ok(result);
      assert.strictEqual(result.pageCount, 2);
      assert.strictEqual(result.pages[0].originalUrl, 'https://s1.mangafire.to/manga/ch1/01.jpg');
    });

    test('routes NovelCrow URL to NovelCrow engine and parses Bad Mom chapter correctly', async () => {
      const html = `
        <html>
        <head>
          <title>Bad Mom (Lucius &amp; Logan) - Chapter 1 - NovelCrow</title>
          <meta property="og:title" content="Bad Mom - Chapter 1 - NovelCrow" />
        </head>
        <body>
          <h1 class="chapter-title">Bad Mom - Chapter 1</h1>
          <div class="reading-content">
            <div class="page-break"><img data-src="https://novelcrow.com/wp-content/uploads/WP-manga/data/manga_1234/bad_mom_ch1/01.jpg" /></div>
            <div class="page-break"><img data-src="https://novelcrow.com/wp-content/uploads/WP-manga/data/manga_1234/bad_mom_ch1/02.jpg" /></div>
            <div class="page-break"><img data-src="https://novelcrow.com/wp-content/uploads/WP-manga/data/manga_1234/bad_mom_ch1/03.jpg" /></div>
          </div>
        </body>
        </html>
      `;
      const result = await parseComicFromHtml(
        html,
        'https://novelcrow.com/comic/bad-mom-lucius-logan/1-bad-mom-chapter-1-lucius-logan/',
        'https://novelcrow.com/'
      );
      assert.ok(result);
      assert.strictEqual(result.engineName, 'NovelCrow Engine');
      assert.strictEqual(result.pageCount, 3);
      assert.strictEqual(
        result.pages[0].originalUrl,
        'https://novelcrow.com/wp-content/uploads/WP-manga/data/manga_1234/bad_mom_ch1/01.jpg'
      );
      assert.strictEqual(
        result.pages[1].originalUrl,
        'https://novelcrow.com/wp-content/uploads/WP-manga/data/manga_1234/bad_mom_ch1/02.jpg'
      );
    });

    test('returns null if page contains no recognizable comic images', async () => {
      const html = `<html><body><p>Hello world, no images here.</p></body></html>`;
      const result = await parseComicFromHtml(html, 'https://empty.com', 'https://empty.com/');
      assert.strictEqual(result, null);
    });
  });
});
