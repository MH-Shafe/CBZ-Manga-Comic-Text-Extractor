import * as cheerio from 'cheerio';

async function test1MangaPageExtraction() {
  const url = 'https://1manga.co/chapter/underworld-restaurant/chapter-102';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Collect candidate images from reader-page, container, or main body
  const rawImages = [];
  $('.reader-page img, .reading-content img, .chapter-images img, #readerArea img, div[class*="reader"] img, div[class*="chapter"] img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original');
    if (src) rawImages.push(src);
  });

  if (rawImages.length === 0) {
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original');
      if (src && !src.includes('logo') && !src.includes('avatar') && !src.includes('banner') && !src.includes('icon')) {
        rawImages.push(src);
      }
    });
  }

  console.log(`Extracted ${rawImages.length} images:`, rawImages);
}

test1MangaPageExtraction();
