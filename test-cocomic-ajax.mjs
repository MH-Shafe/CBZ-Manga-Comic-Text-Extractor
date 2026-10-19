import * as cheerio from 'cheerio';

async function testCocomicChapters() {
  const mangaUrl = 'https://cocomic.co/manga/181197-adult-reading-club/';
  const res = await fetch(mangaUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  // Check static chapter elements
  console.log('Static .wp-manga-chapter count:', $('.wp-manga-chapter').length);
  $('.wp-manga-chapter a, li.wp-manga-chapter a, .chapter-link').each((i, el) => {
    console.log({ href: $(el).attr('href'), text: $(el).text().trim() });
  });

  // Check if AJAX chapter endpoint exists
  const mangaId = $('div[id^="manga-chapters-holder"]').attr('data-id') || $('input.rating-post-id').val() || $('body').attr('class')?.match(/postid-(\d+)/)?.[1];
  console.log('Detected Manga Post ID:', mangaId);

  if (mangaId) {
    const ajaxUrls = [
      `https://cocomic.co/manga/181197-adult-reading-club/ajax/chapters/`,
      `https://cocomic.co/wp-admin/admin-ajax.php`
    ];

    for (const ajaxUrl of ajaxUrls) {
      console.log('Testing AJAX endpoint:', ajaxUrl);
      try {
        let ajaxRes;
        if (ajaxUrl.includes('admin-ajax')) {
          const params = new URLSearchParams();
          params.append('action', 'manga_get_chapters');
          params.append('manga', mangaId);
          ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': mangaUrl
            },
            body: params
          });
        } else {
          ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': mangaUrl
            }
          });
        }
        console.log('AJAX Status:', ajaxRes.status);
        const ajaxHtml = await ajaxRes.text();
        console.log('AJAX HTML Length:', ajaxHtml.length);
        const $ajax = cheerio.load(ajaxHtml);
        const ajaxChapters = [];
        $ajax('a').each((i, el) => {
          const href = $ajax(el).attr('href');
          const text = $ajax(el).text().trim().replace(/\s+/g, ' ');
          if (href && (href.includes('/181197-adult-reading-club/') || href.includes('/manga/'))) {
            ajaxChapters.push({ href, text });
          }
        });
        console.log(`Found ${ajaxChapters.length} AJAX chapters:`);
        console.log(ajaxChapters.slice(0, 30));
      } catch (err) {
        console.error('AJAX Error:', err.message);
      }
    }
  }
}

testCocomicChapters();
