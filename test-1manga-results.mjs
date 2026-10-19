import * as cheerio from 'cheerio';

async function test1MangaSearchCards() {
  const url = 'https://1manga.co/search?q=underworld';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log('Cards found:');
  // Try various selectors
  $('.card, .manga-item, .book-item, .item, div[class*="manga"], div[class*="book"], div[class*="card"]').each((i, el) => {
    const title = $(el).find('.title, h2, h3, h4, a.title, .name').text().trim();
    const link = $(el).find('a').attr('href');
    const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
    if (link && (title || img)) {
      console.log({ title, link, img, cls: $(el).attr('class') });
    }
  });

  // Also check all links under main search container
  console.log('\n--- All manga links on page ---');
  $('a[href*="/manga/"]').each((i, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim() || $(el).attr('title') || $(el).find('img').attr('alt') || '';
    const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
    if (href) {
      console.log({ href, title, img });
    }
  });
}

test1MangaSearchCards();
