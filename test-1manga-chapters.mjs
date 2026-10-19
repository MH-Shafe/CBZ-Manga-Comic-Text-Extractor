import * as cheerio from 'cheerio';

async function test1MangaChapters() {
  const url = 'https://1manga.co/manga/underworld-restaurant';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const chapterSelectors = [
    'li.wp-manga-chapter a',
    'div.eplister ul li a',
    'div.cl ul li a',
    'div.chapter-list a',
    'ul.chapter-list li a',
    'div.chapters-list a',
    'div.detail_chapterContent a',
    'div.mg_chapter a',
    'div.chapter_box a',
    'div.list-chapter a',
    'ul.version-chap li a',
    'a[href*="/chapter/"]',
  ];

  const chapters = [];
  const seen = new Set();

  for (const sel of chapterSelectors) {
    if ($(sel).length > 0) {
      $(sel).each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const fullUrl = new URL(href, url).toString();
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        let title = $(a).text().trim() || $(a).attr('title') || '';
        title = title.replace(/\s+/g, ' ').trim();

        chapters.push({ title, url: fullUrl });
      });
      if (chapters.length > 0) break;
    }
  }

  console.log(`Extracted ${chapters.length} chapters:`, chapters.slice(0, 10));
}

test1MangaChapters();
