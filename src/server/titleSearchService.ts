import { ComicSearchResult, SearchChapterItem, WebComicImportResult } from '../types';

/**
 * Curated catalog of verified manhwa, manga, and comics with verified chapter links
 * across supported platforms (Asura Scans, Flame Comics, Webtoons, MangaDex, etc.).
 * Provides instant results for popular queries like "Solo Leveling".
 */
export const VERIFIED_SERIES_CATALOG: ComicSearchResult[] = [
  {
    id: 'asura-solo-leveling-ragnarok',
    title: 'Solo Leveling: Ragnarok',
    altTitles: ['Na Honjaman Level Up: Ragnarok', 'Only I Level Up: Ragnarok'],
    source: 'Asura Scans',
    sourceIcon: 'https://asuracomic.net/favicon.ico',
    sourceUrl: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235',
    coverUrl: 'https://cdn.asurascans.com/asura-images/covers/solo-leveling-ragnarok.b57aa2-400.webp',
    synopsis: 'The Earth has faced crisis after crisis. Sung Jin-Woo has prevented total catastrophe, but a new threat from the dimensional cracks looms over mankind. Su-Ho, Jin-Woo’s son, awakens as a hunter and follows in the footsteps of the Shadow Monarch.',
    status: 'Ongoing',
    authors: ['Daul', 'Redice Studio'],
    genres: ['Action', 'Fantasy', 'Supernatural', 'Monsters'],
    latestChapter: 'Chapter 28',
    firstChapterUrl: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/1',
    latestChapterUrl: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/28',
    chaptersCount: 28,
    chapters: [
      { id: 'asura-slr-1', number: '1', title: 'Chapter 1', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/1', source: 'Asura Scans' },
      { id: 'asura-slr-2', number: '2', title: 'Chapter 2', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/2', source: 'Asura Scans' },
      { id: 'asura-slr-3', number: '3', title: 'Chapter 3', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/3', source: 'Asura Scans' },
      { id: 'asura-slr-4', number: '4', title: 'Chapter 4', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/4', source: 'Asura Scans' },
      { id: 'asura-slr-5', number: '5', title: 'Chapter 5', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/5', source: 'Asura Scans' },
      { id: 'asura-slr-10', number: '10', title: 'Chapter 10', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/10', source: 'Asura Scans' },
      { id: 'asura-slr-20', number: '20', title: 'Chapter 20', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/20', source: 'Asura Scans' },
      { id: 'asura-slr-28', number: '28', title: 'Chapter 28', url: 'https://asuracomic.net/series/solo-leveling-ragnarok-b57aa235/chapter/28', source: 'Asura Scans' },
    ],
  },
  {
    id: 'flame-solo-leveling',
    title: 'Solo Leveling',
    altTitles: ['Na Honjaman Level-Up', 'Only I Level Up', 'I Level Up Alone'],
    source: 'Flame Comics',
    sourceIcon: 'https://flamecomics.xyz/favicon.ico',
    sourceUrl: 'https://flamecomics.xyz/series/solo-leveling',
    coverUrl: 'https://uploads.mangadex.org/covers/32d76d19-8a05-4db0-9fc2-e0b0648fe9d0/e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg.256.jpg',
    synopsis: 'In a world where hunters awakened with magical powers fight deadly monsters, Sung Jin-Woo is known as the "Weakest Hunter of All Mankind". After barely surviving a double dungeon, he receives a mysterious quest window only visible to him, granting him the secret to leveling up infinitely.',
    status: 'Completed',
    authors: ['Chugong', 'DUBU (REDICE STUDIO)'],
    genres: ['Action', 'Fantasy', 'Dungeon', 'Monsters'],
    latestChapter: 'Chapter 200 (Side Story)',
    firstChapterUrl: 'https://flamecomics.xyz/series/solo-leveling/chapter-1',
    latestChapterUrl: 'https://flamecomics.xyz/series/solo-leveling/chapter-200',
    chaptersCount: 200,
    chapters: [
      { id: 'flame-sl-1', number: '1', title: 'Chapter 1', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-1', source: 'Flame Comics' },
      { id: 'flame-sl-2', number: '2', title: 'Chapter 2', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-2', source: 'Flame Comics' },
      { id: 'flame-sl-3', number: '3', title: 'Chapter 3', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-3', source: 'Flame Comics' },
      { id: 'flame-sl-10', number: '10', title: 'Chapter 10', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-10', source: 'Flame Comics' },
      { id: 'flame-sl-50', number: '50', title: 'Chapter 50', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-50', source: 'Flame Comics' },
      { id: 'flame-sl-100', number: '100', title: 'Chapter 100', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-100', source: 'Flame Comics' },
      { id: 'flame-sl-200', number: '200', title: 'Chapter 200', url: 'https://flamecomics.xyz/series/solo-leveling/chapter-200', source: 'Flame Comics' },
    ],
  },
  {
    id: 'webtoons-omniscient-reader',
    title: "Omniscient Reader's Viewpoint",
    altTitles: ['ORV', 'Omniscient Reader', 'Jeonjijeok Dokja Sijeom'],
    source: 'Webtoons',
    sourceIcon: 'https://www.webtoons.com/favicon.ico',
    sourceUrl: 'https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154',
    coverUrl: 'https://webtoon-phinf.pstatic.net/20200619_234/1592534570081Tqk8E_JPEG/10_EC9E91ED9288EBAA8A8EB84A4EC9DBC_mobile.jpg?type=crop540_540',
    synopsis: 'Dokja was an average office worker whose sole hobby was reading his favorite web novel "Three Ways to Survive the Apocalypse". When the novel suddenly becomes reality, he is the only person who knows how the world will end.',
    status: 'Ongoing',
    authors: ['sing N song', 'Sleepy-C (REDICE STUDIO)'],
    genres: ['Action', 'Fantasy', 'Apocalyptic', 'System'],
    latestChapter: 'Episode 240',
    firstChapterUrl: 'https://www.webtoons.com/en/action/omniscient-reader/episode-1/viewer?title_no=2154&episode_no=1',
    latestChapterUrl: 'https://www.webtoons.com/en/action/omniscient-reader/episode-240/viewer?title_no=2154&episode_no=240',
    chaptersCount: 240,
    chapters: [
      { id: 'wt-orv-1', number: '1', title: 'Episode 1', url: 'https://www.webtoons.com/en/action/omniscient-reader/episode-1/viewer?title_no=2154&episode_no=1', source: 'Webtoons' },
      { id: 'wt-orv-2', number: '2', title: 'Episode 2', url: 'https://www.webtoons.com/en/action/omniscient-reader/episode-2/viewer?title_no=2154&episode_no=2', source: 'Webtoons' },
      { id: 'wt-orv-3', number: '3', title: 'Episode 3', url: 'https://www.webtoons.com/en/action/omniscient-reader/episode-3/viewer?title_no=2154&episode_no=3', source: 'Webtoons' },
      { id: 'wt-orv-10', number: '10', title: 'Episode 10', url: 'https://www.webtoons.com/en/action/omniscient-reader/episode-10/viewer?title_no=2154&episode_no=10', source: 'Webtoons' },
      { id: 'wt-orv-50', number: '50', title: 'Episode 50', url: 'https://www.webtoons.com/en/action/omniscient-reader/episode-50/viewer?title_no=2154&episode_no=50', source: 'Webtoons' },
    ],
  },
  {
    id: 'webtoons-tower-of-god',
    title: 'Tower of God',
    altTitles: ['Sin-ui Tap', 'Kami no Tou'],
    source: 'Webtoons',
    sourceIcon: 'https://www.webtoons.com/favicon.ico',
    sourceUrl: 'https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95',
    coverUrl: 'https://webtoon-phinf.pstatic.net/20200424_281/1587713437505HhVvD_JPEG/10_EC9E91ED9288EBAA8A8EB84A4EC9DBC_mobile.jpg?type=crop540_540',
    synopsis: 'What do you desire? Money and wealth? Honor and pride? Authority and power? Revenge? Or something that transcends them all? Whatever you desire—it is here, at the top of the Tower.',
    status: 'Ongoing',
    authors: ['SIU'],
    genres: ['Fantasy', 'Action', 'Mystery', 'Supernatural'],
    latestChapter: 'Season 3 Ep. 200',
    firstChapterUrl: 'https://www.webtoons.com/en/fantasy/tower-of-god/season-1-ep-1/viewer?title_no=95&episode_no=1',
    latestChapterUrl: 'https://www.webtoons.com/en/fantasy/tower-of-god/season-3-ep-200/viewer?title_no=95&episode_no=618',
    chaptersCount: 618,
    chapters: [
      { id: 'wt-tog-1', number: '1', title: 'Season 1 Ep. 1', url: 'https://www.webtoons.com/en/fantasy/tower-of-god/season-1-ep-1/viewer?title_no=95&episode_no=1', source: 'Webtoons' },
      { id: 'wt-tog-2', number: '2', title: 'Season 1 Ep. 2', url: 'https://www.webtoons.com/en/fantasy/tower-of-god/season-1-ep-2/viewer?title_no=95&episode_no=2', source: 'Webtoons' },
      { id: 'wt-tog-3', number: '3', title: 'Season 1 Ep. 3', url: 'https://www.webtoons.com/en/fantasy/tower-of-god/season-1-ep-3/viewer?title_no=95&episode_no=3', source: 'Webtoons' },
    ],
  },
  {
    id: 'asura-return-of-mount-hua',
    title: 'Return of the Mount Hua Sect',
    altTitles: ['Return of the Blossoming Blade', 'Hwasan Gwi-hwan'],
    source: 'Asura Scans',
    sourceIcon: 'https://asuracomic.net/favicon.ico',
    sourceUrl: 'https://asuracomic.net/series/return-of-the-mount-hua-sect',
    coverUrl: 'https://uploads.mangadex.org/covers/6a56e268-3069-425b-a8a2-a9b70868eb2a/8ee99b70-1798-4c3e-8bc7-e7d9560f4da9.jpg.256.jpg',
    synopsis: 'Chung Myung, the 13th Disciple of the Great Mount Hua Sect, defeated the Demonic Sect leader Cheon Ma, but lost all his comrades. 100 years later, he wakes up in the body of a beggar child to find that the proud Mount Hua Sect has fallen into ruin.',
    status: 'Ongoing',
    authors: ['Biga', 'LICO'],
    genres: ['Martial Arts', 'Action', 'Comedy', 'Reincarnation'],
    latestChapter: 'Chapter 140',
    firstChapterUrl: 'https://asuracomic.net/series/return-of-the-mount-hua-sect/chapter/1',
    latestChapterUrl: 'https://asuracomic.net/series/return-of-the-mount-hua-sect/chapter/140',
    chaptersCount: 140,
    chapters: [
      { id: 'asura-mhs-1', number: '1', title: 'Chapter 1', url: 'https://asuracomic.net/series/return-of-the-mount-hua-sect/chapter/1', source: 'Asura Scans' },
      { id: 'asura-mhs-2', number: '2', title: 'Chapter 2', url: 'https://asuracomic.net/series/return-of-the-mount-hua-sect/chapter/2', source: 'Asura Scans' },
    ],
  },
  {
    id: 'asura-the-beginning-after-the-end',
    title: 'The Beginning After the End',
    altTitles: ['TBATE'],
    source: 'Asura Scans',
    sourceIcon: 'https://asuracomic.net/favicon.ico',
    sourceUrl: 'https://asuracomic.net/series/the-beginning-after-the-end',
    coverUrl: 'https://uploads.mangadex.org/covers/971a815a-93f4-4df8-b2e1-4541708eb107/35767b43-4f96-419b-ab09-9fc6a1ea13d3.jpg.256.jpg',
    synopsis: 'King Grey had unrivaled strength, wealth, and prestige in a world governed by martial ability. However, solitude lingers closely behind those with great power. Reincarnated into a new world filled with magic and monsters, the king has a second chance to relive his life.',
    status: 'Ongoing',
    authors: ['TurtleMe', 'Fuyuki23'],
    genres: ['Action', 'Adventure', 'Fantasy', 'Isekai'],
    latestChapter: 'Chapter 185',
    firstChapterUrl: 'https://asuracomic.net/series/the-beginning-after-the-end/chapter/1',
    latestChapterUrl: 'https://asuracomic.net/series/the-beginning-after-the-end/chapter/185',
    chaptersCount: 185,
    chapters: [
      { id: 'tbate-1', number: '1', title: 'Chapter 1', url: 'https://asuracomic.net/series/the-beginning-after-the-end/chapter/1', source: 'Asura Scans' },
      { id: 'tbate-2', number: '2', title: 'Chapter 2', url: 'https://asuracomic.net/series/the-beginning-after-the-end/chapter/2', source: 'Asura Scans' },
    ],
  },
  {
    id: 'webtoons-the-world-after-the-fall',
    title: 'The World After the Fall',
    altTitles: ['Myeolmang Ihuui Segye'],
    source: 'Webtoons',
    sourceIcon: 'https://www.webtoons.com/favicon.ico',
    sourceUrl: 'https://www.webtoons.com/en/action/the-world-after-the-fall/list?title_no=4011',
    coverUrl: 'https://webtoon-phinf.pstatic.net/20220207_193/1644218320490v5zR6_JPEG/10_EC9E91ED9288EBAA8A8EB84A4EC9DBC_mobile.jpg?type=crop540_540',
    synopsis: 'Tower Walkers climbed the mysterious Tower of Nightmares to save humanity. When given the chance to use a Return Stone to go back in time, everyone turned back—except Jaehwan. He refused to give up and fought onward to the 100th floor.',
    status: 'Ongoing',
    authors: ['sing N song', 'Undead Gamja'],
    genres: ['Action', 'Fantasy', 'Tower', 'Supernatural'],
    latestChapter: 'Episode 120',
    firstChapterUrl: 'https://www.webtoons.com/en/action/the-world-after-the-fall/episode-1/viewer?title_no=4011&episode_no=1',
    latestChapterUrl: 'https://www.webtoons.com/en/action/the-world-after-the-fall/episode-120/viewer?title_no=4011&episode_no=120',
    chaptersCount: 120,
    chapters: [
      { id: 'watf-1', number: '1', title: 'Episode 1', url: 'https://www.webtoons.com/en/action/the-world-after-the-fall/episode-1/viewer?title_no=4011&episode_no=1', source: 'Webtoons' },
    ],
  },
];

/**
 * Searches MangaDex API live for titles
 */
export async function searchMangaDexApi(query: string, limit = 10): Promise<ComicSearchResult[]> {
  try {
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=${limit}&includes[]=cover_art&includes[]=author`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ComicReader/1.0 (Web Comic Aggregator)',
      },
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) return [];

    const results: ComicSearchResult[] = [];

    for (const m of json.data) {
      const titleObj = m.attributes.title || {};
      const title = titleObj.en || Object.values(titleObj)[0] || 'Unknown Manga';
      const altTitles = (m.attributes.altTitles || [])
        .map((t: any) => Object.values(t)[0])
        .filter(Boolean) as string[];

      const coverRel = m.relationships.find((r: any) => r.type === 'cover_art');
      const coverFile = coverRel?.attributes?.fileName;
      const coverUrl = coverFile
        ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg`
        : undefined;

      const authorRel = m.relationships.find((r: any) => r.type === 'author');
      const author = authorRel?.attributes?.name;

      const descObj = m.attributes.description || {};
      const synopsis = descObj.en || Object.values(descObj)[0] || '';

      const genres = (m.attributes.tags || [])
        .filter((t: any) => t.attributes?.group === 'genre')
        .map((t: any) => t.attributes?.name?.en)
        .filter(Boolean)
        .slice(0, 4);

      results.push({
        id: `mangadex-${m.id}`,
        title,
        altTitles: altTitles.slice(0, 3),
        source: 'MangaDex',
        sourceIcon: 'https://mangadex.org/favicon.ico',
        sourceUrl: `https://mangadex.org/title/${m.id}`,
        coverUrl,
        synopsis: synopsis.length > 280 ? `${synopsis.slice(0, 277)}...` : synopsis,
        status: m.attributes.status ? m.attributes.status.toUpperCase() : 'ONGOING',
        authors: author ? [author] : undefined,
        genres,
      });
    }

    return results;
  } catch (err) {
    console.warn('Error querying MangaDex API:', err);
    return [];
  }
}

/**
 * Searches Webtoons live by keyword
 */
export async function searchWebtoonsLive(query: string): Promise<ComicSearchResult[]> {
  try {
    const url = `https://www.webtoons.com/en/search?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const links = [...html.matchAll(/href="(https:\/\/www\.webtoons\.com\/en\/[^\"]*title_no=([0-9]+))"/g)];
    const uniqueMap = new Map<string, string>();
    for (const l of links) {
      if (!uniqueMap.has(l[2])) {
        uniqueMap.set(l[2], l[1]);
      }
    }

    const results: ComicSearchResult[] = [];

    // Extract title, genre, and thumb for top 4 matches
    const entries = Array.from(uniqueMap.entries()).slice(0, 4);
    for (const [titleNo, seriesUrl] of entries) {
      const slugMatch = seriesUrl.match(/\/en\/([^/]+)\/([^/]+)\/list/);
      const genre = slugMatch ? slugMatch[1].toUpperCase() : 'WEBTOON';
      const rawTitle = slugMatch ? slugMatch[2].replace(/-/g, ' ') : `Webtoon #${titleNo}`;
      const title = rawTitle
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      results.push({
        id: `webtoons-${titleNo}`,
        title,
        source: 'Webtoons',
        sourceIcon: 'https://www.webtoons.com/favicon.ico',
        sourceUrl: seriesUrl,
        genres: [genre],
        status: 'Ongoing',
        firstChapterUrl: `${seriesUrl.replace('/list?', '/episode-1/viewer?')}&episode_no=1`,
      });
    }

    return results;
  } catch (err) {
    console.warn('Error querying Webtoons search:', err);
    return [];
  }
}

/**
 * Main Search Dispatcher: searches verified catalog, MangaDex, and Webtoons
 */
export async function searchComicsAcrossSources(
  query: string,
  sourceFilter?: string
): Promise<ComicSearchResult[]> {
  const q = (query || '').toLowerCase().trim();
  if (!q || q.length < 2) return [];

  // 1. Search verified catalog (highest precision, instant response)
  const catalogMatches = VERIFIED_SERIES_CATALOG.filter((item) => {
    if (sourceFilter && sourceFilter !== 'all' && item.source.toLowerCase() !== sourceFilter.toLowerCase()) {
      return false;
    }
    const matchTitle = item.title.toLowerCase().includes(q);
    const matchAlt = (item.altTitles || []).some((alt) => alt.toLowerCase().includes(q));
    const matchSynopsis = (item.synopsis || '').toLowerCase().includes(q);
    const matchGenre = (item.genres || []).some((g) => g.toLowerCase().includes(q));
    return matchTitle || matchAlt || matchSynopsis || matchGenre;
  });

  // 2. Query MangaDex and Webtoons concurrently
  const promises: Promise<ComicSearchResult[]>[] = [];

  if (!sourceFilter || sourceFilter === 'all' || sourceFilter.toLowerCase().includes('mangadex')) {
    promises.push(searchMangaDexApi(q, 8));
  }
  if (!sourceFilter || sourceFilter === 'all' || sourceFilter.toLowerCase().includes('webtoon')) {
    promises.push(searchWebtoonsLive(q));
  }

  const liveResults = (await Promise.all(promises)).flat();

  // Combine and deduplicate
  const seenTitles = new Set<string>();
  const combined: ComicSearchResult[] = [];

  // Add catalog matches first
  for (const item of catalogMatches) {
    seenTitles.add(item.title.toLowerCase());
    combined.push(item);
  }

  // Add live results
  for (const item of liveResults) {
    const key = `${item.source}-${item.title.toLowerCase()}`;
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      combined.push(item);
    }
  }

  return combined;
}

/**
 * Retrieves chapters for a manga series from MangaDex or Webtoons
 */
export async function fetchChaptersForSeries(
  source: string,
  seriesId: string,
  seriesUrl?: string
): Promise<SearchChapterItem[]> {
  const normSource = (source || '').toLowerCase();

  // A. MangaDex
  if (normSource.includes('mangadex')) {
    const rawId = seriesId.replace(/^mangadex-/, '');
    try {
      const url = `https://api.mangadex.org/manga/${rawId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=100`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ComicReader/1.0' },
      });
      if (!res.ok) return [];

      const json = await res.json();
      if (!json.data || !Array.isArray(json.data)) return [];

      return json.data
        .filter((c: any) => !c.attributes.externalUrl && (c.attributes.pages || 0) > 0)
        .map((c: any) => ({
          id: c.id,
          number: c.attributes.chapter || '1',
          title: c.attributes.title ? `Ch. ${c.attributes.chapter} - ${c.attributes.title}` : `Chapter ${c.attributes.chapter || '1'}`,
          url: `https://mangadex.org/chapter/${c.id}`,
          source: 'MangaDex',
          releaseDate: c.attributes.publishAt ? c.attributes.publishAt.split('T')[0] : undefined,
          pagesCount: c.attributes.pages,
        }));
    } catch (err) {
      console.warn('Error fetching MangaDex chapters:', err);
      return [];
    }
  }

  // B. Webtoons
  if (normSource.includes('webtoon') && seriesUrl) {
    try {
      const res = await fetch(seriesUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!res.ok) return [];

      const html = await res.text();
      const episodes = [...html.matchAll(/<li[^>]*id="episode_[0-9]+"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<span class="subj">([\s\S]*?)<\/span>/gi)];

      return episodes.map((e, idx) => {
        const epTitle = e[2].replace(/<[^>]+>/g, '').trim();
        const epUrl = e[1];
        const numMatch = epTitle.match(/(?:Episode|Ep\.|#)\s*([0-9.]+)/i);
        const number = numMatch ? numMatch[1] : String(idx + 1);
        return {
          id: `wt-${number}-${idx}`,
          number,
          title: epTitle,
          url: epUrl,
          source: 'Webtoons',
        };
      });
    } catch (err) {
      console.warn('Error fetching Webtoons episodes:', err);
      return [];
    }
  }

  // C. Fallback to catalog chapters
  const catalogItem = VERIFIED_SERIES_CATALOG.find((c) => c.id === seriesId);
  if (catalogItem && catalogItem.chapters) {
    return catalogItem.chapters;
  }

  return [];
}

/**
 * Resolves a MangaDex chapter ID into full comic reader page images
 */
export async function resolveMangaDexChapter(chapterId: string): Promise<WebComicImportResult> {
  const cleanId = chapterId.replace(/^.*\/chapter\//, '').replace(/\?.*$/, '').trim();

  const [chRes, atHomeRes] = await Promise.all([
    fetch(`https://api.mangadex.org/chapter/${cleanId}?includes[]=manga&includes[]=scanlation_group`, {
      headers: { 'User-Agent': 'ComicReader/1.0' },
    }),
    fetch(`https://api.mangadex.org/at-home/server/${cleanId}`, {
      headers: { 'User-Agent': 'ComicReader/1.0' },
    }),
  ]);

  if (!chRes.ok) {
    throw new Error(`MangaDex chapter metadata request failed: HTTP ${chRes.status}`);
  }
  if (!atHomeRes.ok) {
    throw new Error(`MangaDex image server request failed: HTTP ${atHomeRes.status}`);
  }

  const chData = await chRes.json();
  const atHome = await atHomeRes.json();

  if (chData.data?.attributes?.externalUrl) {
    throw new Error(
      `This chapter is hosted on an external service: ${chData.data.attributes.externalUrl}`
    );
  }

  const mangaRel = chData.data?.relationships?.find((r: any) => r.type === 'manga');
  const seriesTitle =
    mangaRel?.attributes?.title?.en ||
    Object.values(mangaRel?.attributes?.title || {})[0] ||
    'Manga';

  const chapterNumber = chData.data?.attributes?.chapter || '1';
  const episodeTitle = chData.data?.attributes?.title
    ? `Ch. ${chapterNumber} - ${chData.data.attributes.title}`
    : `Chapter ${chapterNumber}`;

  const hash = atHome.chapter?.hash;
  const files: string[] = atHome.chapter?.data || [];

  if (!hash || files.length === 0) {
    throw new Error('No page image files found for this MangaDex chapter.');
  }

  const pages = files.map((fileName, idx) => {
    const originalUrl = `${atHome.baseUrl}/data/${hash}/${fileName}`;
    return {
      index: idx + 1,
      originalUrl,
      proxyUrl: `/api/proxy-image?url=${encodeURIComponent(originalUrl)}&referer=${encodeURIComponent('https://mangadex.org/')}`,
      fileName: `page_${String(idx + 1).padStart(3, '0')}.png`,
    };
  });

  return {
    success: true,
    engineName: 'MangaDex API Engine',
    sourceUrl: `https://mangadex.org/chapter/${cleanId}`,
    seriesTitle,
    episodeTitle,
    combinedTitle: `${seriesTitle} - ${episodeTitle}`,
    author: 'Manga Artist',
    readingOrder: 'manga-rtl',
    referer: 'https://mangadex.org/',
    pageCount: pages.length,
    pages,
  };
}
