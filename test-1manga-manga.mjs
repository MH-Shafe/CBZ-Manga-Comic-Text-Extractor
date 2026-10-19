import * as cheerio from 'cheerio';

async function test1MangaMangaPage() {
  const url = 'https://1manga.co/manga/underworld-restaurant';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  console.log('Status:', res.status);
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log('Title:', $('title').text().trim());

  const chapters = [];
  $('a[href*="/chapter/"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    chapters.push({ href, text });
  });

  console.log(`Found ${chapters.length} chapters:`, chapters.slice(0, 10));
}

test1MangaMangaPage();
