import { searchComicTitlesStandardized } from './src/utils/webComicImporter.ts';

async function run() {
  const res = await fetch('http://localhost:3000/api/search-titles-standardized', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'underworld',
      sourceId: '1manga',
      baseUrl: 'https://1manga.co',
      sourceName: '1Manga'
    })
  });
  const data = await res.json();
  console.log('Search Results for 1manga.co:', data);
}

run();
