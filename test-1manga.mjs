import * as cheerio from 'cheerio';

async function test1Manga() {
  const chapterUrl = 'https://1manga.co/chapter/underworld-restaurant/chapter-102';
  console.log('Fetching chapter URL:', chapterUrl);
  try {
    const res = await fetch(chapterUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);
    const $ = cheerio.load(html);

    console.log('Title:', $('title').text().trim());

    // Check images inside page
    const imgs = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original');
      const alt = $(el).attr('alt') || '';
      const cls = $(el).attr('class') || '';
      if (src) imgs.push({ src, alt, cls });
    });

    console.log(`Found ${imgs.length} total images:`);
    console.log(imgs.slice(0, 15));

    // Check div containers
    const containers = [];
    $('div[id*="chapter"], div[class*="chapter"], div[class*="read"], div[class*="page"], div[class*="viewer"]').each((i, el) => {
      const id = $(el).attr('id') || '';
      const cls = $(el).attr('class') || '';
      const imgCount = $(el).find('img').length;
      if (imgCount > 0) containers.push({ id, cls, imgCount });
    });
    console.log('Containers with images:', containers);

  } catch (err) {
    console.error('Error fetching 1manga:', err);
  }
}

test1Manga();
