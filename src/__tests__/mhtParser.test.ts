import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMhtArchive } from '../utils/mhtParser';

// Sample 1x1 base64 png and larger fake base64 images for testing
const TINY_PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// A larger valid base64 payload to pass minimum size threshold
const DUMMY_MANGA_IMAGE_BASE64 = Buffer.alloc(1200, 0x42).toString('base64');

describe('MHT / MHTML Archive Parser', () => {
  test('parses a multipart/related MHT archive and extracts embedded manga images', async () => {
    const boundary = '----=_NextPart_01D8C123.ABCD1234';
    const mhtContent = [
      'From: <Saved by Web Browser>',
      'Subject: Bad Mom (Lucius & Logan) - Chapter 1 - NovelCrow',
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Location: https://novelcrow.com/comic/bad-mom-lucius-logan/1-bad-mom-chapter-1-lucius-logan/',
      '',
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<title>Bad Mom (Lucius & Logan) - Chapter 1 - NovelCrow</title>',
      '<meta property="og:title" content="Bad Mom" />',
      '<meta name="author" content="Lucius & Logan" />',
      '</head>',
      '<body>',
      '<div class="reading-content">',
      '  <img src="https://novelcrow.com/wp-content/uploads/001-Image.webp" />',
      '  <img src="https://novelcrow.com/wp-content/uploads/002-Image.webp" />',
      '  <img src="https://novelcrow.com/wp-content/uploads/010-Image.webp" />',
      '</div>',
      '</body>',
      '</html>',
      '',
      `--${boundary}`,
      'Content-Type: image/webp',
      'Content-Transfer-Encoding: base64',
      'Content-Location: https://novelcrow.com/wp-content/uploads/001-Image.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}`,
      'Content-Type: image/webp',
      'Content-Transfer-Encoding: base64',
      'Content-Location: https://novelcrow.com/wp-content/uploads/002-Image.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}`,
      'Content-Type: image/webp',
      'Content-Transfer-Encoding: base64',
      'Content-Location: https://novelcrow.com/wp-content/uploads/010-Image.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}--`,
    ].join('\r\n');

    const result = await parseMhtArchive(mhtContent, 'Bad Mom - Chapter 1.mht');

    assert.equal(result.success, true);
    assert.equal(result.seriesTitle, 'Bad Mom');
    assert.equal(result.author, 'Lucius & Logan');
    assert.equal(result.pages.length, 3);
    assert.equal(result.pages[0].fileName, 'page_001.webp');
    assert.equal(result.pages[1].fileName, 'page_002.webp');
    assert.equal(result.pages[2].fileName, 'page_003.webp');
  });

  test('correctly orders natural numeric filenames (e.g. NovelCrow1, NovelCrow2, NovelCrow10)', async () => {
    const boundary = '----=_NextPart_TEST_NATURAL_SORT';
    const mhtContent = [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html',
      '',
      '<html><body>Manga Chapter</body></html>',
      '',
      `--${boundary}`,
      'Content-Type: image/jpeg',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/NovelCrow10.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}`,
      'Content-Type: image/jpeg',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/NovelCrow1.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}`,
      'Content-Type: image/jpeg',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/NovelCrow2.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}--`,
    ].join('\n');

    const result = await parseMhtArchive(mhtContent, 'Chapter.mhtml');
    assert.equal(result.pages.length, 3);
    // Verified natural ordering
    assert.equal(result.pages[0].fileName, 'page_001.jpeg');
    assert.equal(result.pages[1].fileName, 'page_002.jpeg');
    assert.equal(result.pages[2].fileName, 'page_003.jpeg');
  });

  test('correctly places 100--image.webp AFTER 11--image.webp in natural numeric sorting', async () => {
    const boundary = '----=_NextPart_TEST_NATURAL_100_VS_11';
    const mhtContent = [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html',
      '',
      '<html><body>Manga Chapter</body></html>',
      '',
      `--${boundary}`,
      'Content-Type: image/webp',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/100--image.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}`,
      'Content-Type: image/webp',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/11--image.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}`,
      'Content-Type: image/webp',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/1--image.webp',
      '',
      DUMMY_MANGA_IMAGE_BASE64,
      '',
      `--${boundary}--`,
    ].join('\n');

    const result = await parseMhtArchive(mhtContent, 'Chapter.mhtml');
    assert.equal(result.pages.length, 3);
    // Page 1 should be 1--image.webp, Page 2 should be 11--image.webp, Page 3 should be 100--image.webp
    assert.equal(result.pages[0].fileName, 'page_001.webp');
    assert.equal(result.pages[1].fileName, 'page_002.webp');
    assert.equal(result.pages[2].fileName, 'page_003.webp');
  });

  test('filters out tiny tracking pixels and UI logo assets', async () => {
    const boundary = '----=_NextPart_FILTER_TEST';
    const mhtContent = [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html',
      '',
      '<html><body><h1>Title</h1></body></html>',
      '',
      `--${boundary}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/tracking_pixel.png',
      '',
      TINY_PIXEL_BASE64, // <= 100 bytes (filtered)
      '',
      `--${boundary}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/site-logo.png',
      '',
      DUMMY_MANGA_IMAGE_BASE64, // logo name (filtered)
      '',
      `--${boundary}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-Location: http://example.com/chapter_page_01.png',
      '',
      DUMMY_MANGA_IMAGE_BASE64, // real manga panel
      '',
      `--${boundary}--`,
    ].join('\n');

    const result = await parseMhtArchive(mhtContent, 'Chapter.mht');
    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0].fileName, 'page_001.png');
  });

  test('throws descriptive error on malformed or empty MHT', async () => {
    await assert.rejects(
      async () => {
        await parseMhtArchive('random non-mime string', 'invalid.mht');
      },
      /This saved webpage could not be parsed/
    );
  });
});
