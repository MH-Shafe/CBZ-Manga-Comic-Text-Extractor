import * as cheerio from 'cheerio';

function parseChapterNumber(rawText, fullChUrl) {
  // 1. Try rawText first (e.g. "Chapter 33.2", "Ch. 12", "Vol.1 Chapter 8")
  const textMatch =
    rawText.match(/(?:chapter|ch\.?|ep\.?|episode|vol\.?\d+\s*chapter)\s*(\d+(?:\.\d+)?)/i) ||
    rawText.match(/#\s*(\d+(?:\.\d+)?)/) ||
    rawText.match(/^(\d+(?:\.\d+)?)$/);

  if (textMatch) return textMatch[1];

  // 2. Try URL slug (e.g. /chapter-33-2/ -> 33.2 or /chapter-12/)
  const urlMatch = fullChUrl.match(/chapter[-_/](\d+)(?:[-_.](\d+))?/i);
  if (urlMatch) {
    if (urlMatch[2]) {
      return `${urlMatch[1]}.${urlMatch[2]}`;
    }
    return urlMatch[1];
  }

  // 3. General number match in rawText
  const genMatch = rawText.match(/(\d+(?:\.\d+)?)/);
  if (genMatch) return genMatch[1];

  return '';
}

console.log('Chapter 33.2 ->', parseChapterNumber('Chapter 33.2', 'https://cocomic.co/manga/181197-adult-reading-club/chapter-33-2/'));
console.log('Chapter 38 ->', parseChapterNumber('Chapter 38', 'https://cocomic.co/manga/181197-adult-reading-club/chapter-38/'));
console.log('side.7 ->', parseChapterNumber('side.7 - side.7', 'https://cocomic.co/manga/181197-adult-reading-club/side-7/'));
console.log('Special. ->', parseChapterNumber('Special.', 'https://cocomic.co/manga/181197-adult-reading-club/special-/'));
