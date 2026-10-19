import * as cheerio from 'cheerio';

async function testMadaraChapterExtraction(targetUrl) {
  console.log('Testing chapter extraction for:', targetUrl);
  const baseUrl = new URL(targetUrl).origin;
  const res = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: `${baseUrl}/` }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  let chaptersList = [];
  const seenUrls = new Set();

  // Clean target manga path for filtering out sidebar recommendations
  const parsedTarget = new URL(targetUrl);
  const cleanMangaPath = parsedTarget.pathname.replace(/\/$/, '');

  // 1. Try Madara AJAX chapter endpoints if static chapter list is empty or holder is present
  const isMadara = html.includes('wp-manga') || html.includes('manga-chapters-holder') || html.includes('c-manga-post');
  if (isMadara) {
    const ajaxUrls = [
      `${targetUrl.replace(/\/$/, '')}/ajax/chapters/`,
      `${baseUrl}/wp-admin/admin-ajax.php`
    ];

    const mangaId = $('div[id^="manga-chapters-holder"]').attr('data-id') || $('input.rating-post-id').val() || html.match(/postid-(\d+)/)?.[1];

    for (const ajaxUrl of ajaxUrls) {
      try {
        let ajaxRes;
        if (ajaxUrl.includes('admin-ajax')) {
          if (!mangaId) continue;
          const params = new URLSearchParams();
          params.append('action', 'manga_get_chapters');
          params.append('manga', mangaId);
          ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': targetUrl
            },
            body: params
          });
        } else {
          ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': targetUrl
            }
          });
        }

        if (ajaxRes && ajaxRes.ok) {
          const ajaxHtml = await ajaxRes.text();
          const $ajax = cheerio.load(ajaxHtml);

          $ajax('li.wp-manga-chapter a, a').each((_, a) => {
            const href = $ajax(a).attr('href');
            if (!href || href.startsWith('#') || href.includes('javascript:')) return;

            const fullChUrl = new URL(href, baseUrl).toString();
            if (seenUrls.has(fullChUrl)) return;

            // Ensure link belongs to this manga
            const chPath = new URL(fullChUrl).pathname;
            if (cleanMangaPath && !chPath.startsWith(cleanMangaPath) && !fullChUrl.includes(cleanMangaPath)) {
              return;
            }

            seenUrls.add(fullChUrl);

            let rawText = $ajax(a).text().replace(/\s+/g, ' ').trim();
            if (!rawText || rawText === '#') {
              rawText = $ajax(a).closest('li').text().replace(/\s+/g, ' ').trim();
            }

            const numMatch =
              fullChUrl.match(/chapter[-_/](\d+(?:\.\d+)?)/i) ||
              fullChUrl.match(/side[-_/](\d+(?:\.\d+)?)/i) ||
              rawText.match(/Chapter\s*(\d+(?:\.\d+)?)/i) ||
              rawText.match(/Ch\.?\s*(\d+(?:\.\d+)?)/i) ||
              rawText.match(/(\d+(?:\.\d+)?)/);

            const num = numMatch ? numMatch[1] : String(chaptersList.length + 1);

            chaptersList.push({
              id: fullChUrl,
              number: num,
              title: rawText || `Chapter ${num}`,
              url: fullChUrl,
            });
          });

          if (chaptersList.length > 0) break;
        }
      } catch (err) {
        console.warn('AJAX fetch error:', err.message);
      }
    }
  }

  console.log(`Extracted ${chaptersList.length} chapters:`, chaptersList.slice(0, 15));
}

testMadaraChapterExtraction('https://cocomic.co/manga/181197-adult-reading-club/');
