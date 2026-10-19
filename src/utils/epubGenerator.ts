import JSZip from 'jszip';
import { ComicPage, ExportOptions, ComicChapter } from '../types';
import { stripSpeakerPrefix, compileChapterSummary, cleanInnerThought, cleanSfxIcons, formatSfxBlock } from './textExporter';

export async function generateEpub(pages: ComicPage[], options: ExportOptions): Promise<Blob> {
  const zip = new JSZip();

  // 1. mimetype file must be first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // Filter pages for export based on exclusion options
  const excludeUnextracted = options.excludeUnextractedPages ?? true;
  const exportPages = pages.filter((p) => {
    if (p.isExcluded) return false;
    if (options.excludeExtraPages && p.isExtraPage) return false;
    const hasText = Boolean(
      (p.fullText && p.fullText.trim()) ||
      (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim()))
    );
    const hasSummary = Boolean(p.pageSummary && p.pageSummary.trim());
    if (excludeUnextracted && !hasText && !hasSummary && p.status !== 'completed') {
      return false;
    }
    return true;
  });

  const bookTitle = options.title || 'Extracted Comic Text';
  const bookAuthor = options.author || 'Manga OCR Assistant';
  const bookId = `urn:uuid:${Date.now()}`;
  const nowUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // Stylesheet
  const css = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.65;
  color: #1a202c;
  padding: 1.5rem;
  max-width: 800px;
  margin: 0 auto;
}
h1, h2, h3 {
  font-family: Georgia, serif;
  color: #2d3748;
}
.page-header {
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.5rem;
  margin-top: 2rem;
  margin-bottom: 1.5rem;
  color: #4a5568;
}
.page-summary {
  background: #f7fafc;
  border-left: 4px solid #4299e1;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  font-style: italic;
  color: #2d3748;
}
.dialogue-block {
  margin-bottom: 1rem;
  padding: 0.5rem 0;
}
.speaker-name {
  font-weight: bold;
  color: #2b6cb0;
  margin-right: 0.5rem;
}
.speech-text {
  color: #1a202c;
}
.narration-block {
  background-color: #fffaf0;
  border-left: 4px solid #dd6b20;
  padding: 0.6rem 0.9rem;
  margin-bottom: 1rem;
  font-style: italic;
  color: #744210;
}
.thought-block {
  color: #4a5568;
  font-style: italic;
  margin-bottom: 1rem;
}
.sfx-block {
  color: #d69e2e;
  font-weight: bold;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}
.page-image {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  margin-bottom: 1.5rem;
  display: block;
}
`;
  zip.file('OEBPS/style.css', css);

  // Store image files in OEBPS/images if requested
  const imageManifestEntries: string[] = [];
  if (options.includePageImagesInEpub) {
    for (let i = 0; i < exportPages.length; i++) {
      const page = exportPages[i];
      const ext = page.mimeType === 'image/png' ? 'png' : 'jpg';
      const imgFileName = `page_${i + 1}.${ext}`;
      zip.file(`OEBPS/images/${imgFileName}`, page.blob);
      imageManifestEntries.push(
        `<item id="img_${i + 1}" href="images/${imgFileName}" media-type="${page.mimeType}"/>`
      );
    }
  }

  // Chapters / Pages HTML
  const chapterManifestEntries: string[] = [];
  const spineEntries: string[] = [];
  const navTocEntries: string[] = [];
  const ncxNavEntries: string[] = [];

  const shouldIncludeSummary = options.includeSummary ?? options.includePageSummary ?? true;
  const isChapterSummary = options.summaryScope === 'chapter' || options.readingOrder === 'manhwa-vertical';

  let playOrderCounter = 1;

  // 1. If manhwa or chapter summary mode is selected, add single chapter summary at the start
  if (shouldIncludeSummary && isChapterSummary) {
    const chapterSummaryText = options.chapterSummary?.trim() || compileChapterSummary(exportPages);
    if (chapterSummaryText) {
      const summaryId = 'chapter_summary';
      const summaryHref = 'summary.xhtml';
      const summaryTitle = 'Chapter Summary';

      const summaryXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(summaryTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2 class="page-header">${escapeHtml(summaryTitle)}</h2>
  <div class="page-summary">
    <strong>Summary:</strong> ${escapeHtml(chapterSummaryText)}
  </div>
</body>
</html>`;

      zip.file(`OEBPS/${summaryHref}`, summaryXhtml);
      chapterManifestEntries.push(`<item id="${summaryId}" href="${summaryHref}" media-type="application/xhtml+xml"/>`);
      spineEntries.push(`<itemref idref="${summaryId}"/>`);
      navTocEntries.push(`<li><a href="${summaryHref}">${escapeHtml(summaryTitle)}</a></li>`);
      ncxNavEntries.push(`
    <navPoint id="navPoint-${playOrderCounter}" playOrder="${playOrderCounter}">
      <navLabel><text>${escapeHtml(summaryTitle)}</text></navLabel>
      <content src="${summaryHref}"/>
    </navPoint>`);
      playOrderCounter++;
    }
  }

  for (let i = 0; i < exportPages.length; i++) {
    const page = exportPages[i];
    const chapterId = `chapter_${i + 1}`;
    const chapterHref = `page_${i + 1}.xhtml`;
    const pageTitle = `Page ${page.index + 1} - ${page.fileName}`;

    let contentHtml = '';

    if (options.includePageImagesInEpub) {
      const ext = page.mimeType === 'image/png' ? 'png' : 'jpg';
      contentHtml += `<div class="image-wrapper"><img src="images/page_${i + 1}.${ext}" alt="${pageTitle}" class="page-image"/></div>\n`;
    }

    // Include page-by-page summary only when NOT using manhwa chapter summary mode
    if (shouldIncludeSummary && !isChapterSummary && page.pageSummary) {
      contentHtml += `<div class="page-summary"><strong>Summary:</strong> ${escapeHtml(page.pageSummary)}</div>\n`;
    }

    if (page.blocks && page.blocks.length > 0) {
      page.blocks.forEach((block) => {
        let blockText = block.text;
        if (options.excludeSpeakerPrefixes) {
          blockText = stripSpeakerPrefix(blockText);
        }

        if (block.type === 'narration') {
          if (options.excludeSpeakerPrefixes) {
            contentHtml += `<div class="narration-block">${escapeHtml(blockText)}</div>\n`;
          } else {
            contentHtml += `<div class="narration-block"><span class="narration-label">[Narration]</span> ${escapeHtml(blockText)}</div>\n`;
          }
        } else if (block.type === 'thought') {
          const innerThought = cleanInnerThought(blockText);
          if (options.excludeSpeakerPrefixes) {
            contentHtml += `<div class="thought-block"><em>(${escapeHtml(innerThought)})</em></div>\n`;
          } else {
            const speakerTag = block.speaker ? escapeHtml(block.speaker) + ': ' : '';
            contentHtml += `<div class="thought-block"><em>[Thought] ${speakerTag}(${escapeHtml(innerThought)})</em></div>\n`;
          }
        } else if (block.type === 'sfx') {
          contentHtml += `<div class="sfx-block">${escapeHtml(formatSfxBlock(block.text, false))}</div>\n`;
        } else {
          // Standard dialogue
          contentHtml += `<div class="dialogue-block">`;
          if (!options.excludeSpeakerPrefixes && (options.includeSpeakers ?? true) && block.speaker) {
            contentHtml += `<span class="speaker-name">${escapeHtml(block.speaker)}:</span> `;
          }
          contentHtml += `<span class="speech-text">${escapeHtml(blockText)}</span></div>\n`;
        }
      });
    } else if (page.fullText) {
      const paragraphs = page.fullText.split('\n\n');
      paragraphs.forEach((p) => {
        if (p.trim()) {
          const text = options.excludeSpeakerPrefixes ? stripSpeakerPrefix(p.trim()) : p.trim();
          contentHtml += `<p class="dialogue-block">${escapeHtml(text)}</p>\n`;
        }
      });
    } else if (page.pageSummary) {
      contentHtml += `<p class="dialogue-block"><em>[Scene]: ${escapeHtml(page.pageSummary)}</em></p>\n`;
    } else {
      if (!excludeUnextracted) {
        contentHtml += `<p><em>(No extracted text for this page)</em></p>\n`;
      }
    }

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2 class="page-header">${escapeHtml(pageTitle)}</h2>
  ${contentHtml}
</body>
</html>`;

    zip.file(`OEBPS/${chapterHref}`, xhtml);

    chapterManifestEntries.push(`<item id="${chapterId}" href="${chapterHref}" media-type="application/xhtml+xml"/>`);
    spineEntries.push(`<itemref idref="${chapterId}"/>`);
    navTocEntries.push(`<li><a href="${chapterHref}">${escapeHtml(pageTitle)}</a></li>`);
    ncxNavEntries.push(`
    <navPoint id="navPoint-${playOrderCounter}" playOrder="${playOrderCounter}">
      <navLabel><text>${escapeHtml(pageTitle)}</text></navLabel>
      <content src="${chapterHref}"/>
    </navPoint>`);
    playOrderCounter++;
  }

  // Navigation document (EPUB 3 nav.xhtml)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navTocEntries.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // NCX document (for EPUB 2 backward compatibility)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeHtml(bookTitle)}</text></docTitle>
  <docAuthor><text>${escapeHtml(bookAuthor)}</text></docAuthor>
  <navMap>
    ${ncxNavEntries.join('')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // OPF Manifest & Spine
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeHtml(bookTitle)}</dc:title>
    <dc:creator>${escapeHtml(bookAuthor)}</dc:creator>
    ${options.scanlator ? `<dc:contributor>${escapeHtml(options.scanlator)}</dc:contributor>` : ''}
    <dc:language>en</dc:language>
    <dc:date>${nowUtc}</dc:date>
    <meta property="dcterms:modified">${nowUtc}</meta>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${chapterManifestEntries.join('\n    ')}
    ${imageManifestEntries.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineEntries.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

export async function generateMultiChapterEpub(chapters: ComicChapter[], options: ExportOptions): Promise<Blob> {
  const zip = new JSZip();

  // 1. mimetype file must be first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const bookTitle = options.title || 'Extracted Comic Book';
  const bookAuthor = options.author || 'Manga OCR Assistant';
  const bookId = `urn:uuid:${Date.now()}`;
  const nowUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // Stylesheet
  const css = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.65;
  color: #1a202c;
  padding: 1.5rem;
  max-width: 800px;
  margin: 0 auto;
}
h1, h2, h3 {
  font-family: Georgia, serif;
  color: #2d3748;
}
.chapter-title-header {
  font-size: 1.75rem;
  font-weight: bold;
  border-bottom: 3px solid #4a5568;
  padding-bottom: 0.75rem;
  margin-bottom: 1.5rem;
  color: #1a202c;
}
.page-header {
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.5rem;
  margin-top: 2rem;
  margin-bottom: 1.5rem;
  color: #4a5568;
}
.page-summary {
  background: #f7fafc;
  border-left: 4px solid #4299e1;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  font-style: italic;
  color: #2d3748;
}
.dialogue-block {
  margin-bottom: 1rem;
  padding: 0.5rem 0;
}
.speaker-name {
  font-weight: bold;
  color: #2b6cb0;
  margin-right: 0.5rem;
}
.speech-text {
  color: #1a202c;
}
.narration-block {
  background-color: #fffaf0;
  border-left: 4px solid #dd6b20;
  padding: 0.6rem 0.9rem;
  margin-bottom: 1rem;
  font-style: italic;
  color: #744210;
}
.thought-block {
  color: #4a5568;
  font-style: italic;
  margin-bottom: 1rem;
}
.sfx-block {
  color: #d69e2e;
  font-weight: bold;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}
.page-image {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  margin-bottom: 1.5rem;
  display: block;
}
`;
  zip.file('OEBPS/style.css', css);

  const imageManifestEntries: string[] = [];
  const chapterManifestEntries: string[] = [];
  const spineEntries: string[] = [];
  const navTocEntries: string[] = [];
  const ncxNavEntries: string[] = [];

  const shouldIncludeSummary = options.includeSummary ?? options.includePageSummary ?? true;
  let playOrderCounter = 1;

  const scope = options.exportChapterScope || 'all';
  const targetChapters = chapters.filter((chapter) => {
    if (scope === 'extracted') {
      return chapter.pages.some(
        (p) =>
          !p.isExcluded &&
          !p.isExtraPage &&
          ((p.fullText && p.fullText.trim().length > 0) ||
            (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim())) ||
            (p.pageSummary && p.pageSummary.trim().length > 0))
      );
    }
    return true;
  });

  const excludeUnextracted = options.excludeUnextractedPages ?? true;

  for (let cIdx = 0; cIdx < targetChapters.length; cIdx++) {
    const chapter = targetChapters[cIdx];
    const chNum = cIdx + 1;
    const exportPages = chapter.pages.filter((p) => {
      if (p.isExcluded) return false;
      if (options.excludeExtraPages && p.isExtraPage) return false;
      const hasText = Boolean(
        (p.fullText && p.fullText.trim()) ||
        (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim()))
      );
      const hasSummary = Boolean(p.pageSummary && p.pageSummary.trim());
      if (excludeUnextracted && !hasText && !hasSummary && p.status !== 'completed') {
        return false;
      }
      return true;
    });

    const chapterCoverId = `chapter_head_${chNum}`;
    const chapterCoverHref = `chapter_${chNum}_title.xhtml`;
    const chapterTitleText = `Chapter ${chNum}: ${chapter.title}`;

    // Chapter Title Page (with overarching Chapter Summary if present)
    const chapterSummaryText = chapter.chapterSummary?.trim() || compileChapterSummary(exportPages);
    let chapterIntroHtml = `<h1 class="chapter-title-header">${escapeHtml(chapterTitleText)}</h1>\n`;
    if (shouldIncludeSummary && chapterSummaryText) {
      chapterIntroHtml += `<div class="page-summary"><strong>Chapter Summary:</strong> ${escapeHtml(chapterSummaryText)}</div>\n`;
    }
    if (exportPages.length === 0) {
      chapterIntroHtml += `<p><em>(Chapter pending extraction — no dialogue extracted yet)</em></p>\n`;
    }

    const titlePageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(chapterTitleText)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  ${chapterIntroHtml}
</body>
</html>`;
    zip.file(`OEBPS/${chapterCoverHref}`, titlePageXhtml);
    chapterManifestEntries.push(`<item id="${chapterCoverId}" href="${chapterCoverHref}" media-type="application/xhtml+xml"/>`);
    spineEntries.push(`<itemref idref="${chapterCoverId}"/>`);

    navTocEntries.push(`<li><a href="${chapterCoverHref}">${escapeHtml(chapterTitleText)}</a><ol>`);
    ncxNavEntries.push(`
    <navPoint id="navPoint-${playOrderCounter}" playOrder="${playOrderCounter}">
      <navLabel><text>${escapeHtml(chapterTitleText)}</text></navLabel>
      <content src="${chapterCoverHref}"/>`);
    playOrderCounter++;

    // Pages for this chapter
    for (let pIdx = 0; pIdx < exportPages.length; pIdx++) {
      const page = exportPages[pIdx];
      const pageId = `ch_${chNum}_page_${pIdx + 1}`;
      const pageHref = `ch_${chNum}_page_${pIdx + 1}.xhtml`;
      const pageLabel = `Page ${page.index + 1}`;

      let contentHtml = '';
      if (options.includePageImagesInEpub) {
        const ext = page.mimeType === 'image/png' ? 'png' : 'jpg';
        const imgName = `ch_${chNum}_page_${pIdx + 1}.${ext}`;
        zip.file(`OEBPS/images/${imgName}`, page.blob);
        imageManifestEntries.push(`<item id="img_ch_${chNum}_${pIdx + 1}" href="images/${imgName}" media-type="${page.mimeType}"/>`);
        contentHtml += `<div class="image-wrapper"><img src="images/${imgName}" alt="${pageLabel}" class="page-image"/></div>\n`;
      }

      if (shouldIncludeSummary && options.summaryScope === 'page' && page.pageSummary) {
        contentHtml += `<div class="page-summary"><strong>Summary:</strong> ${escapeHtml(page.pageSummary)}</div>\n`;
      }

      if (page.blocks && page.blocks.length > 0) {
        page.blocks.forEach((block) => {
          let blockText = block.text;
          if (options.excludeSpeakerPrefixes) {
            blockText = stripSpeakerPrefix(blockText);
          }
          if (block.type === 'narration') {
            if (options.excludeSpeakerPrefixes) {
              contentHtml += `<div class="narration-block">${escapeHtml(blockText)}</div>\n`;
            } else {
              contentHtml += `<div class="narration-block"><span class="narration-label">[Narration]</span> ${escapeHtml(blockText)}</div>\n`;
            }
          } else if (block.type === 'thought') {
            const innerThought = cleanInnerThought(blockText);
            if (options.excludeSpeakerPrefixes) {
              contentHtml += `<div class="thought-block"><em>(${escapeHtml(innerThought)})</em></div>\n`;
            } else {
              const speakerTag = block.speaker ? escapeHtml(block.speaker) + ': ' : '';
              contentHtml += `<div class="thought-block"><em>[Thought] ${speakerTag}(${escapeHtml(innerThought)})</em></div>\n`;
            }
          } else if (block.type === 'sfx') {
            contentHtml += `<div class="sfx-block">${escapeHtml(formatSfxBlock(block.text, false))}</div>\n`;
          } else {
            contentHtml += `<div class="dialogue-block">`;
            if (!options.excludeSpeakerPrefixes && (options.includeSpeakers ?? true) && block.speaker) {
              contentHtml += `<span class="speaker-name">${escapeHtml(block.speaker)}:</span> `;
            }
            contentHtml += `<span class="speech-text">${escapeHtml(blockText)}</span></div>\n`;
          }
        });
      } else if (page.fullText) {
        const paragraphs = page.fullText.split('\n\n');
        paragraphs.forEach((p) => {
          if (p.trim()) {
            const text = options.excludeSpeakerPrefixes ? stripSpeakerPrefix(p.trim()) : p.trim();
            contentHtml += `<p class="dialogue-block">${escapeHtml(text)}</p>\n`;
          }
        });
      } else if (page.pageSummary) {
        contentHtml += `<p class="dialogue-block"><em>[Scene]: ${escapeHtml(page.pageSummary)}</em></p>\n`;
      } else {
        if (!excludeUnextracted) {
          contentHtml += `<p><em>(No extracted text for this page)</em></p>\n`;
        }
      }

      const pageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(`${chapterTitleText} - ${pageLabel}`)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2 class="page-header">${escapeHtml(pageLabel)}</h2>
  ${contentHtml}
</body>
</html>`;
      zip.file(`OEBPS/${pageHref}`, pageXhtml);
      chapterManifestEntries.push(`<item id="${pageId}" href="${pageHref}" media-type="application/xhtml+xml"/>`);
      spineEntries.push(`<itemref idref="${pageId}"/>`);

      navTocEntries.push(`  <li><a href="${pageHref}">${escapeHtml(pageLabel)}</a></li>`);
      ncxNavEntries.push(`
      <navPoint id="navPoint-${playOrderCounter}" playOrder="${playOrderCounter}">
        <navLabel><text>${escapeHtml(pageLabel)}</text></navLabel>
        <content src="${pageHref}"/>
      </navPoint>`);
      playOrderCounter++;
    }

    navTocEntries.push(`</ol></li>`);
    ncxNavEntries.push(`</navPoint>`);
  }

  // Navigation document
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navTocEntries.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // NCX document
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeHtml(bookTitle)}</text></docTitle>
  <docAuthor><text>${escapeHtml(bookAuthor)}</text></docAuthor>
  <navMap>
    ${ncxNavEntries.join('')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // OPF Manifest & Spine
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeHtml(bookTitle)}</dc:title>
    <dc:creator>${escapeHtml(bookAuthor)}</dc:creator>
    ${options.scanlator ? `<dc:contributor>${escapeHtml(options.scanlator)}</dc:contributor>` : ''}
    <dc:language>en</dc:language>
    <dc:date>${nowUtc}</dc:date>
    <meta property="dcterms:modified">${nowUtc}</meta>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${chapterManifestEntries.join('\n    ')}
    ${imageManifestEntries.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineEntries.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
