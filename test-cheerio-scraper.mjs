import * as cheerio from 'cheerio';

async function testCheerioScraper() {
  const url = 'https://1manga.co/chapter/underworld-restaurant/chapter-102';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const images = [];

  // Try targeted reader container first
  const container = $('.reader-page, .reading-content, .chapter-images, .readerarea, .vung-doc, .viewer-images, .chapter-content, .entry-content, #reader, #readerarea, #reading-content, #chapter-images, div[class*="reader"], div[class*="chapter"]');

  const scope = container.length > 0 ? container : $('body');

  scope.find('img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-url') || $(el).attr('data-lazy-src') || $(el).attr('data-original');
    if (src && !src.includes('/logo') && !src.includes('/avatar') && !src.includes('banner') && !src.includes('icon')) {
      images.push(src);
    }
  });

  console.log(`Cheerio extracted ${images.length} comic panel images:`, images);
}

testCheerioScraper();
