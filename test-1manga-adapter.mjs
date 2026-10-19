import * as cheerio from 'cheerio';

async function testAdapter() {
  const url = 'https://1manga.co/search?q=underworld';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];
  const seen = new Set();
  const query = 'underworld';
  const queryTokens = ['underworld'];

  // Check manga links
  $('a[href*="/manga/"], a[href*="/comic/"], a[href*="/series/"]').each((_, a) => {
    let href = $(a).attr('href');
    if (!href) return;
    let fullUrl = new URL(href, 'https://1manga.co').toString();

    if (seen.has(fullUrl)) return;

    let title = $(a).text().trim() || $(a).attr('title') || $(a).find('img').attr('alt') || '';
    if (!title || title.length < 2) {
      // Check parent/sibling
      title = $(a).closest('div, li, article').find('h1, h2, h3, h4, .title, .name').text().trim();
    }

    title = title.replace(/\s+/g, ' ').trim();
    if (!title || title.length < 2) return;

    // Must match query
    const lowerTitle = title.toLowerCase();
    if (!queryTokens.some((tok) => lowerTitle.includes(tok))) return;

    seen.add(fullUrl);

    // Find cover image
    let img = $(a).find('img').attr('src') || $(a).find('img').attr('data-src') ||
              $(a).closest('div, li, article').find('img').attr('src') || $(a).closest('div, li, article').find('img').attr('data-src');

    results.push({ title, fullUrl, coverUrl: img });
  });

  console.log(`Found ${results.length} results:`, results.slice(0, 5));
}

testAdapter();
