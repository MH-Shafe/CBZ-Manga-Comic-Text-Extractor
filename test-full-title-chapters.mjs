import * as cheerio from 'cheerio';

function toAbsoluteUrl(url, baseUrl) {
  if (!url) return '';
  const clean = url.trim().replace(/&amp;/g, '&');
  if (clean.startsWith('//')) return `https:${clean}`;
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

function parseChapterNumber(rawText, fullChUrl, fallbackIdx) {
  const textMatch =
    rawText.match(/(?:chapter|ch\.?|ep\.?|episode|vol\.?\d+\s*chapter)\s*(\d+(?:\.\d+)?)/i) ||
    rawText.match(/#\s*(\d+(?:\.\d+)?)/) ||
    rawText.match(/^(\d+(?:\.\d+)?)$/);

  if (textMatch) return textMatch[1];

  const urlMatch = fullChUrl.match(/chapter[-_/](\d+)(?:[-_.](\d+))?/i) || fullChUrl.match(/side[-_/](\d+)/i);
  if (urlMatch) {
    if (urlMatch[2]) {
      return `${urlMatch[1]}.${urlMatch[2]}`;
    }
    return urlMatch[1];
  }

  const genMatch = rawText.match(/(\d+(?:\.\d+)?)/);
  if (genMatch) return genMatch[1];

  return String(fallbackIdx);
}

async function testFetchTitleChapters(targetUrl, source = 'Cocomic') {
  const baseUrl = new URL(targetUrl).origin;
  const res = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: `${baseUrl}/` },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const chaptersList = [];
  const seenUrls = new Set();

  const parsedTarget = new URL(targetUrl);
  const cleanMangaPath = parsedTarget.pathname.replace(/\/$/, '');
  const mangaSlug = cleanMangaPath.split('/').pop() || '';

  // 1. Madara / WP-Manga AJAX Chapter Retrieval
  const isMadara =
    html.includes('wp-manga') ||
    html.includes('manga-chapters-holder') ||
    html.includes('c-manga-post') ||
    $('div[id^="manga-chapters-holder"]').length > 0;

  if (isMadara) {
    const mangaId =
      $('div[id^="manga-chapters-holder"]').attr('data-id') ||
      $('input.rating-post-id').val() ||
      html.match(/postid-(\d+)/)?.[1];

    const ajaxEndpoints = [
      `${targetUrl.replace(/\/$/, '')}/ajax/chapters/`,
      `${baseUrl}/wp-admin/admin-ajax.php`,
    ];

    for (const ajaxUrl of ajaxEndpoints) {
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
              Referer: targetUrl,
            },
            body: params,
          });
        } else {
          ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: targetUrl,
            },
          });
        }

        if (ajaxRes && ajaxRes.ok) {
          const ajaxHtml = await ajaxRes.text();
          const $ajax = cheerio.load(ajaxHtml);

          $ajax('li.wp-manga-chapter a, a').each((_, a) => {
            const href = $ajax(a).attr('href');
            if (!href || href.startsWith('#') || href.includes('javascript:')) return;

            const fullChUrl = toAbsoluteUrl(href, baseUrl);
            if (seenUrls.has(fullChUrl)) return;

            const chPath = new URL(fullChUrl).pathname;
            if (mangaSlug && !chPath.includes(mangaSlug) && !fullChUrl.includes(mangaSlug)) {
              return;
            }

            seenUrls.add(fullChUrl);

            let rawText = $ajax(a).text().replace(/\s+/g, ' ').trim();
            if (!rawText || rawText === '#') {
              rawText = $ajax(a).closest('li').text().replace(/\s+/g, ' ').trim();
            }

            const num = parseChapterNumber(rawText, fullChUrl, chaptersList.length + 1);
            const date = $ajax(a).closest('li').find('.chapter-release-date, time, .date').text().trim();

            chaptersList.push({
              id: fullChUrl,
              number: num,
              title: rawText || `Chapter ${num}`,
              url: fullChUrl,
              source: source || 'Online Source',
              releaseDate: date || undefined,
            });
          });

          if (chaptersList.length > 0) break;
        }
      } catch (err) {
        console.warn('Madara AJAX error:', err.message);
      }
    }
  }

  // 2. Static HTML Selectors with Path Filtering
  if (chaptersList.length === 0) {
    const chapterSelectors = [
      'div.detail_chapterContent a',
      'div.mg_chapter a',
      'div.chapter_box a',
      'li.wp-manga-chapter a',
      'div.eplister ul li a',
      'ul#chapterlist li a',
      'ul.list_chapter li a',
      'ul.list-chapter li a',
      'div.chapter-list a',
      'ul.row-content-chapter li a',
      'div.chapters-list a',
      'a[href*="/chapter-"]',
      'a[href*="/chapter/"]',
      'a[href*="-chapter-"]',
      'a[href*="/ch-"]',
      'a[href*="/comic/"][href*="chapter"]',
      'a[href*="/episode"]',
      'div[class*=chapter] a',
      'ul.chapters a',
      '.listing-chapters_wrap a',
    ];

    for (const sel of chapterSelectors) {
      $(sel).each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.includes('javascript:') || href.includes('download') || href.includes('.pdf') || href.includes('/comments')) return;

        const fullChUrl = toAbsoluteUrl(href, baseUrl);
        if (seenUrls.has(fullChUrl)) return;

        // Path filtering: if we have a manga slug, verify chapter link belongs to this manga
        const chPath = new URL(fullChUrl).pathname;
        if (mangaSlug && mangaSlug.length > 3 && !chPath.includes(mangaSlug) && !fullChUrl.includes(mangaSlug)) {
          return;
        }

        seenUrls.add(fullChUrl);

        const rawText = $(el).text().replace(/\s+/g, ' ').trim();
        const date = $(el).closest('li, div').find('.chapter-release-date, .chapterdate, time, .date').text().trim();

        const num = parseChapterNumber(rawText, fullChUrl, chaptersList.length + 1);

        chaptersList.push({
          id: fullChUrl,
          number: num,
          title: rawText || `Chapter ${num}`,
          url: fullChUrl,
          source: source || 'Online Source',
          releaseDate: date || undefined,
        });
      });

      if (chaptersList.length > 0) break;
    }
  }

  // Sort chapters
  chaptersList.sort((a, b) => {
    const na = parseFloat(a.number) || 0;
    const nb = parseFloat(b.number) || 0;
    return na - nb;
  });

  return chaptersList;
}

const chapters = await testFetchTitleChapters('https://cocomic.co/manga/181197-adult-reading-club/');
console.log(`Total Verified Chapters for Adult Reading Club: ${chapters.length}`);
console.log('Sample Chapters (First 5):', chapters.slice(0, 5));
console.log('Sample Chapters (Last 5):', chapters.slice(-5));
