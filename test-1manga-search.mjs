import * as cheerio from 'cheerio';

async function test1MangaSearch() {
  const searchUrls = [
    'https://1manga.co/search?q=underworld',
    'https://1manga.co/search?query=underworld',
    'https://1manga.co/search/underworld',
    'https://1manga.co/?s=underworld',
    'https://1manga.co/manga-list?search=underworld'
  ];

  for (const url of searchUrls) {
    console.log('Testing URL:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      console.log('Status:', res.status);
      const html = await res.text();
      const $ = cheerio.load(html);
      console.log('Title:', $('title').text().trim());

      // Look for manga cards / links
      const links = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.includes('/manga/') || href.includes('/comic/') || href.includes('/series/') || href.includes('underworld')) {
          links.push({ href, text });
        }
      });
      console.log(`Found ${links.length} matching links:`, links.slice(0, 5));
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

test1MangaSearch();
