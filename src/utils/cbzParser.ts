import JSZip from 'jszip';
import { ComicPage, ComicMetadata, ComicChapter } from '../types';
import { parseMhtArchive } from './mhtParser';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

// Parse ComicInfo.xml metadata schema (standard across Tachiyomi, Mihon, MangaDex, ComicRack)
export function parseComicInfoXml(xmlText: string): Partial<ComicMetadata> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    const series =
      doc.querySelector('Series')?.textContent?.trim() ||
      doc.querySelector('Manga')?.textContent?.trim() ||
      '';
    const title = doc.querySelector('Title')?.textContent?.trim() || '';
    const number = doc.querySelector('Number')?.textContent?.trim() || '';
    const volume = doc.querySelector('Volume')?.textContent?.trim() || '';
    const writer =
      doc.querySelector('Writer')?.textContent?.trim() ||
      doc.querySelector('Author')?.textContent?.trim() ||
      '';
    const penciller =
      doc.querySelector('Penciller')?.textContent?.trim() ||
      doc.querySelector('Artist')?.textContent?.trim() ||
      doc.querySelector('Inker')?.textContent?.trim() ||
      doc.querySelector('Colorist')?.textContent?.trim() ||
      '';
    const scanInfo = doc.querySelector('ScanInformation')?.textContent?.trim() || '';
    const translator = doc.querySelector('Translator')?.textContent?.trim() || '';
    const summary =
      doc.querySelector('Summary')?.textContent?.trim() ||
      doc.querySelector('Plot')?.textContent?.trim() ||
      doc.querySelector('Review')?.textContent?.trim() ||
      doc.querySelector('Notes')?.textContent?.trim() ||
      '';
    const rawGenre = doc.querySelector('Genre')?.textContent?.trim() || '';
    const genres = rawGenre
      ? rawGenre.split(/[,;/]/).map((g) => g.trim()).filter(Boolean)
      : undefined;
    const releaseYear = doc.querySelector('Year')?.textContent?.trim() || undefined;
    const status = doc.querySelector('Status')?.textContent?.trim() || undefined;
    const web = doc.querySelector('Web')?.textContent?.trim() || undefined;

    let author = writer;
    const artist = penciller || writer;
    if (penciller && penciller !== writer) {
      author = author ? `${author}, ${penciller}` : penciller;
    }

    const scanlator = scanInfo || translator;

    let chapterPart = '';
    if (number) {
      chapterPart = `Chapter ${number}`;
    }
    if (title) {
      chapterPart = chapterPart ? `${chapterPart}: ${title}` : title;
    }

    let combinedTitle = '';
    if (series && chapterPart) {
      combinedTitle = `${series} - ${chapterPart}`;
    } else {
      combinedTitle = series || chapterPart || title;
    }

    let combinedAuthor = '';
    if (author && scanlator) {
      combinedAuthor = `${author} (${scanlator})`;
    } else {
      combinedAuthor = author || scanlator || '';
    }

    return {
      mangaTitle: series,
      bookTitle: series,
      chapterNumber: number || undefined,
      chapterTitle: chapterPart || title,
      combinedTitle,
      author: writer || author,
      artist: penciller || undefined,
      scanlator,
      combinedAuthor,
      series,
      volume,
      issueNumber: number,
      synopsis: summary || undefined,
      genres,
      releaseYear,
      status,
      sourceUrl: web,
      source: 'comicinfo',
    };
  } catch (err) {
    console.warn('Failed to parse ComicInfo.xml:', err);
    return {};
  }
}

// Heuristic parser to auto-detect Book / Chapter Title, Chapter Number, Author, and Scanlator Group from archive filenames
export function parseComicFilename(fileName: string): ComicMetadata {
  let raw = fileName.replace(/\.(cbz|zip|cbr|rar|tar|gz)$/i, '').trim();

  let scanlator = '';
  let author = '';
  let artist = '';
  let chapterPart = '';
  let chapterNumber = '';
  let bookTitle = '';

  // 1. Detect leading bracketed scanlator or group tag: e.g. [Asura Scans], [Flame Comics], [Reaper Scans]
  const leadingTagMatch = raw.match(/^\[([^\]]+)\]\s*/);
  if (leadingTagMatch) {
    scanlator = leadingTagMatch[1].trim();
    raw = raw.slice(leadingTagMatch[0].length).trim();
  }

  // 2. Detect trailing bracketed author or group: e.g. [Chugong], (Eiichiro Oda), [VIZ]
  const trailingTagMatch = raw.match(/\s*(?:\[([^\]]+)\]|\(([^)]+)\))$/);
  if (trailingTagMatch) {
    const matched = (trailingTagMatch[1] || trailingTagMatch[2] || '').trim();
    if (!scanlator && /(?:scans|comics|scanlation|group|tl|team|hub)/i.test(matched)) {
      scanlator = matched;
    } else if (!author) {
      author = matched;
    }
    raw = raw.slice(0, trailingTagMatch.index).trim();
  }

  // 3. Detect chapter or volume notation: e.g. " - Chapter 01", " - c100", " - Ch. 50"
  const chapterMatch = raw.match(/(?:[-_\s]+)(?:chapter|ch\.?|ep\.?|episode|c)\s*(\d+(?:\.\d+)?)(?:\s*[-:]\s*(.+))?$/i);
  if (chapterMatch) {
    chapterNumber = chapterMatch[1];
    const subTitle = chapterMatch[2]?.trim() || '';
    chapterPart = subTitle ? `Chapter ${chapterNumber}: ${subTitle}` : `Chapter ${chapterNumber}`;
    bookTitle = raw.slice(0, chapterMatch.index).trim();
  } else {
    // If format like "Title - 001" or "Title_01"
    const numberMatch = raw.match(/(?:[-_]\s*)(\d{1,4})(?:\s*[-:]\s*(.+))?$/);
    if (numberMatch && !/^\d+$/.test(raw)) {
      chapterNumber = numberMatch[1];
      const subTitle = numberMatch[2]?.trim() || '';
      chapterPart = subTitle ? `Chapter ${chapterNumber}: ${subTitle}` : `Chapter ${chapterNumber}`;
      bookTitle = raw.slice(0, numberMatch.index).trim();
    } else {
      bookTitle = raw.replace(/[_-]+/g, ' ').trim();
      // Capitalize cleanly
      bookTitle = bookTitle
        .split(' ')
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
        .join(' ');
    }
  }

  // Clean remaining book title
  bookTitle = bookTitle.replace(/[-_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (bookTitle) {
    bookTitle = bookTitle
      .split(' ')
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' ');
  }

  let combinedTitle = '';
  if (bookTitle && chapterPart) {
    combinedTitle = `${bookTitle} - ${chapterPart}`;
  } else {
    combinedTitle = bookTitle || chapterPart || 'Manga Chapter Text';
  }

  let combinedAuthor = '';
  if (author && scanlator) {
    combinedAuthor = `${author} (${scanlator})`;
  } else {
    combinedAuthor = author || scanlator || 'Scanlation Archive';
  }

  return {
    mangaTitle: bookTitle || 'Manga Series',
    bookTitle: bookTitle || 'Manga Chapter',
    chapterNumber: chapterNumber || undefined,
    chapterTitle: chapterPart || 'Chapter 1',
    combinedTitle,
    author: author || 'Original Author',
    artist: artist || author || undefined,
    scanlator: scanlator || 'Scanlation Team',
    combinedAuthor,
    series: bookTitle,
    source: 'filename',
  };
}

// Extract comic metadata from ZIP entries (ComicInfo.xml + filename)
export async function extractMetadataFromArchive(
  zipContent: JSZip,
  fileName: string
): Promise<ComicMetadata> {
  const filenameMeta = parseComicFilename(fileName);

  // Search for ComicInfo.xml or any XML file in root or folders
  let xmlEntry: JSZip.JSZipObject | null = null;
  zipContent.forEach((relativePath, zipObject) => {
    if (!zipObject.dir && /comicinfo\.xml$/i.test(relativePath)) {
      xmlEntry = zipObject;
    }
  });

  if (xmlEntry) {
    try {
      const xmlText = await (xmlEntry as JSZip.JSZipObject).async('text');
      const xmlMeta = parseComicInfoXml(xmlText);

      return {
        mangaTitle: xmlMeta.mangaTitle || xmlMeta.bookTitle || filenameMeta.mangaTitle || filenameMeta.bookTitle,
        bookTitle: xmlMeta.bookTitle || filenameMeta.bookTitle,
        chapterNumber: xmlMeta.chapterNumber || filenameMeta.chapterNumber,
        chapterTitle: xmlMeta.chapterTitle || filenameMeta.chapterTitle,
        combinedTitle: xmlMeta.combinedTitle || filenameMeta.combinedTitle,
        author: xmlMeta.author || filenameMeta.author,
        artist: xmlMeta.artist || filenameMeta.artist,
        scanlator: xmlMeta.scanlator || filenameMeta.scanlator,
        combinedAuthor: xmlMeta.combinedAuthor || filenameMeta.combinedAuthor,
        series: xmlMeta.series || filenameMeta.series,
        volume: xmlMeta.volume,
        issueNumber: xmlMeta.issueNumber || xmlMeta.chapterNumber,
        synopsis: xmlMeta.synopsis || filenameMeta.synopsis,
        genres: xmlMeta.genres,
        releaseYear: xmlMeta.releaseYear,
        status: xmlMeta.status,
        sourceUrl: xmlMeta.sourceUrl,
        source: 'comicinfo',
      };
    } catch (err) {
      console.warn('Error reading ComicInfo.xml from archive:', err);
    }
  }

  return filenameMeta;
}

// Natural alphanumeric sort helper that handles paths naturally (e.g. p1.jpg before p12.jpg, and subfolders correctly)
export function naturalCompare(a: string, b: string): number {
  const segA = a.split('/');
  const segB = b.split('/');
  const minLen = Math.min(segA.length, segB.length);
  for (let i = 0; i < minLen; i++) {
    const cmp = segA[i].localeCompare(segB[i], undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  }
  return segA.length - segB.length;
}

// Convert Blob to Base64 data string
export function blobToBase64(blob: Blob, fallbackMime = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        let res = reader.result;
        // Ensure data URI contains a valid image mime type instead of generic application/octet-stream
        if (res.startsWith('data:application/octet-stream') || res.startsWith('data:;')) {
          const targetType = blob.type && blob.type.startsWith('image/') ? blob.type : fallbackMime;
          res = res.replace(/^data:[^;]*;base64,/, `data:${targetType};base64,`);
        }
        resolve(res);
      } else {
        reject(new Error('Failed to read image as base64 string'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Prepare image for OCR by scaling down oversized raw scans (preventing 413 payload limits and accelerating AI processing)
export function cleanErrorMessage(raw: any): string {
  if (!raw) return 'Unknown error occurred';
  let str = typeof raw === 'string' ? raw : (raw.message || JSON.stringify(raw));
  const lower = str.toLowerCase();

  // Handle HTML or interrupted network responses
  if (lower.includes('<!doctype') || lower.includes('<html') || lower.includes('<body') || lower.includes('504 gateway') || lower.includes('502 bad gateway')) {
    if (lower.includes('413') || lower.includes('too large')) {
      return 'Image size exceeds network payload limits. Please retry with smaller page.';
    }
    if (lower.includes('504') || lower.includes('timed out') || lower.includes('timeout')) {
      return 'Server gateway timed out (504). Please click Retry.';
    }
    if (lower.includes('502') || lower.includes('bad gateway')) {
      return 'Server connection was interrupted (502). Please click Retry.';
    }
    return 'Server network response was interrupted. Please click Retry.';
  }

  // Handle JSON parse errors or unexpected token syntax errors
  if (lower.includes('unexpected token') || lower.includes('is not valid json') || lower.includes('syntaxerror')) {
    return 'The AI service response was temporarily interrupted. Please click Retry.';
  }

  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(str.slice(firstBrace, lastBrace + 1));
      if (parsed?.error?.message) {
        str = parsed.error.message;
      } else if (parsed?.message) {
        str = parsed.message;
      } else if (parsed?.error && typeof parsed.error === 'string') {
        str = parsed.error;
      }
    } catch {
      // keep str
    }
  }

  const updatedLower = str.toLowerCase();
  if (updatedLower.includes('503') || updatedLower.includes('high demand') || updatedLower.includes('unavailable')) {
    return 'The AI model is temporarily experiencing high demand (503). Please wait a moment and click Retry.';
  }
  if (updatedLower.includes('429') || updatedLower.includes('resource_exhausted') || updatedLower.includes('quota') || updatedLower.includes('rate limit')) {
    return 'Gemini API rate limit reached. Please wait a moment and click Retry.';
  }
  if (updatedLower.includes('api_key_invalid') || updatedLower.includes('key not valid') || updatedLower.includes('unauthorized') || updatedLower.includes('permission_denied')) {
    return 'The Gemini API key is invalid or has expired. Please check your key in Settings.';
  }

  return str.trim() || 'Error extracting page text';
}

export async function prepareImageForOcr(
  blob: Blob,
  maxDimension = 1024,
  quality = 0.84
): Promise<{ base64: string; mimeType: string }> {
  // If not in a browser environment (e.g. Node tests), return raw base64
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    const raw = await blobToBase64(blob);
    return { base64: raw, mimeType: blob.type || 'image/jpeg' };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // If image is already within target bounds and is JPEG, avoid re-encoding
      if (
        width <= maxDimension &&
        height <= maxDimension &&
        (blob.type === 'image/jpeg' || blob.type === 'image/jpg')
      ) {
        blobToBase64(blob).then((b64) => resolve({ base64: b64, mimeType: 'image/jpeg' }));
        return;
      }

      // For long manhwa strips (aspect ratio height/width > 1.8), normalize width to 768px
      // so speech bubbles and dialogue remain sharp while drastically reducing vision tile tokens
      const isLongStrip = height / width > 1.8;
      if (isLongStrip) {
        const targetWidth = Math.min(width, 768);
        height = Math.round((height * targetWidth) / width);
        width = targetWidth;
        // Cap extreme heights to 4800px to avoid multi-tile explosion
        if (height > 4800) {
          width = Math.round((width * 4800) / height);
          height = 4800;
        }
      } else if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ base64: dataUrl, mimeType: 'image/jpeg' });
          return;
        }
      } catch (err) {
        console.warn('Canvas optimization failed, falling back to raw base64:', err);
      }

      // Fallback
      blobToBase64(blob).then((b64) => resolve({ base64: b64, mimeType: blob.type || 'image/jpeg' }));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      blobToBase64(blob).then((b64) => resolve({ base64: b64, mimeType: blob.type || 'image/jpeg' }));
    };

    img.src = url;
  });
}

// Parse extracted JSZip instance into ComicPage items and extract metadata
export async function parseCbzContent(
  zipContent: JSZip,
  fileName: string
): Promise<{ pages: ComicPage[]; metadata: ComicMetadata }> {
  const metadata = await extractMetadataFromArchive(zipContent, fileName);

  const fileEntries: { name: string; zipObject: JSZip.JSZipObject }[] = [];

  zipContent.forEach((relativePath, zipObject) => {
    // Ignore hidden files like __MACOSX or Thumbs.db
    if (!zipObject.dir && !relativePath.startsWith('__MACOSX') && IMAGE_EXTENSIONS.test(relativePath)) {
      fileEntries.push({ name: relativePath, zipObject });
    }
  });

  // Sort files naturally
  fileEntries.sort((a, b) => naturalCompare(a.name, b.name));

  if (fileEntries.length === 0) {
    throw new Error(`No valid comic images found in ${fileName}.`);
  }

  const pages: ComicPage[] = [];

  for (let i = 0; i < fileEntries.length; i++) {
    const entry = fileEntries[i];
    const rawBlob = await entry.zipObject.async('blob');
    const ext = entry.name.split('.').pop()?.toLowerCase() || 'jpg';
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';

    // Wrap rawBlob with explicit image MIME type
    const blob = new Blob([rawBlob], { type: mimeType });
    const imageUrl = URL.createObjectURL(blob);

    pages.push({
      id: `page-${i + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      index: i,
      fileName: entry.name.split('/').pop() || entry.name,
      imageUrl,
      blob,
      mimeType,
      status: 'idle',
      isExcluded: false,
    });
  }

  // Ensure coverThumbnail is attached from first page if not already provided
  if (pages.length > 0 && !metadata.coverThumbnail) {
    metadata.coverThumbnail = pages[0].imageUrl;
  }

  return { pages, metadata };
}

// Parse a single CBZ or ZIP file into ComicPage items and extract metadata
export async function parseCbzFile(file: File): Promise<{ pages: ComicPage[]; metadata: ComicMetadata }> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(file);
  return parseCbzContent(zipContent, file.name);
}

// Parse a ZIP file containing multiple .cbz files (or chapter subfolders)
export async function parseMultiChapterZip(
  file: File,
  onProgress?: (progressText: string, current: number, total: number) => void
): Promise<{ chapters: ComicChapter[]; parentArchiveName: string }> {
  const rootZip = new JSZip();
  const zipContent = await rootZip.loadAsync(file);

  // 1. Search for nested .cbz files (or .zip files) inside the parent ZIP
  const cbzEntries: { name: string; zipObject: JSZip.JSZipObject }[] = [];
  zipContent.forEach((relativePath, zipObject) => {
    if (!zipObject.dir && !relativePath.startsWith('__MACOSX') && /\.(cbz)$/i.test(relativePath)) {
      cbzEntries.push({ name: relativePath, zipObject });
    }
  });

  if (cbzEntries.length > 0) {
    // Sort CBZ files in natural alphanumeric order
    cbzEntries.sort((a, b) => naturalCompare(a.name, b.name));

    const chapters: ComicChapter[] = [];

    for (let i = 0; i < cbzEntries.length; i++) {
      const entry = cbzEntries[i];
      const baseName = entry.name.split('/').pop() || entry.name;
      onProgress?.(
        `Unpacking chapter ${i + 1} of ${cbzEntries.length}: ${baseName}`,
        i + 1,
        cbzEntries.length
      );

      const cbzBlob = await entry.zipObject.async('blob');
      const innerZip = new JSZip();
      const innerContent = await innerZip.loadAsync(cbzBlob);
      const { pages, metadata } = await parseCbzContent(innerContent, baseName);

      const chapterTitle =
        metadata.chapterTitle ||
        metadata.combinedTitle ||
        baseName.replace(/\.(cbz|zip)$/i, '');

      chapters.push({
        id: `chapter-${i + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        index: i,
        title: chapterTitle,
        fileName: baseName,
        pages,
        metadata,
        chapterSummary: '',
      });
    }

    return { chapters, parentArchiveName: file.name };
  }

  // 2. Check if ZIP contains multiple subdirectories with images (e.g. Chapter 01/, Chapter 02/)
  const folderImageMap = new Map<string, { name: string; zipObject: JSZip.JSZipObject }[]>();
  zipContent.forEach((relativePath, zipObject) => {
    if (!zipObject.dir && !relativePath.startsWith('__MACOSX') && IMAGE_EXTENSIONS.test(relativePath)) {
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        const folder = parts[0];
        if (!folderImageMap.has(folder)) {
          folderImageMap.set(folder, []);
        }
        folderImageMap.get(folder)!.push({ name: relativePath, zipObject });
      }
    }
  });

  if (folderImageMap.size > 1) {
    const sortedFolders = Array.from(folderImageMap.keys()).sort(naturalCompare);
    const chapters: ComicChapter[] = [];

    for (let i = 0; i < sortedFolders.length; i++) {
      const folderName = sortedFolders[i];
      const entries = folderImageMap.get(folderName)!;
      entries.sort((a, b) => naturalCompare(a.name, b.name));

      onProgress?.(
        `Unpacking folder ${i + 1} of ${sortedFolders.length}: ${folderName}`,
        i + 1,
        sortedFolders.length
      );

      const pages: ComicPage[] = [];
      for (let pIdx = 0; pIdx < entries.length; pIdx++) {
        const entry = entries[pIdx];
        const rawBlob = await entry.zipObject.async('blob');
        const ext = entry.name.split('.').pop()?.toLowerCase() || 'jpg';
        let mimeType = 'image/jpeg';
        if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'gif') mimeType = 'image/gif';

        const blob = new Blob([rawBlob], { type: mimeType });
        const imageUrl = URL.createObjectURL(blob);

        pages.push({
          id: `page-${i + 1}-${pIdx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          index: pIdx,
          fileName: entry.name.split('/').pop() || entry.name,
          imageUrl,
          blob,
          mimeType,
          status: 'idle',
          isExcluded: false,
        });
      }

      const chapterMeta = parseComicFilename(`${file.name.replace(/\.zip$/i, '')} - ${folderName}`);
      if (pages.length > 0 && !chapterMeta.coverThumbnail) {
        chapterMeta.coverThumbnail = pages[0].imageUrl;
      }

      chapters.push({
        id: `chapter-${i + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        index: i,
        title: folderName,
        fileName: folderName,
        pages,
        metadata: chapterMeta,
        chapterSummary: '',
      });
    }

    return { chapters, parentArchiveName: file.name };
  }

  // 3. Fallback: single chapter in this zip
  const { pages, metadata } = await parseCbzContent(zipContent, file.name);
  return {
    chapters: [
      {
        id: `chapter-1-${Date.now()}`,
        index: 0,
        title: metadata.chapterTitle || metadata.combinedTitle || file.name.replace(/\.(cbz|zip)$/i, ''),
        fileName: file.name,
        pages,
        metadata,
        chapterSummary: '',
      },
    ],
    parentArchiveName: file.name,
  };
}

// Unified parser that handles either single .cbz, .zip, .mht/.mhtml saved webpage, or raw image files
export async function parseAnyComicArchive(
  file: File,
  onProgress?: (progressText: string, current: number, total: number) => void
): Promise<{ chapters: ComicChapter[]; isMultiChapter: boolean; archiveName: string }> {
  const fileName = file.name || 'uploaded_comic';

  // 1. If explicitly a single image file (.jpg, .png, .webp, .avif, .gif)
  if (IMAGE_EXTENSIONS.test(fileName)) {
    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'avif') mimeType = 'image/avif';

    const page: ComicPage = {
      id: `page-1-${Date.now()}`,
      index: 0,
      fileName,
      imageUrl: URL.createObjectURL(file),
      blob: file,
      mimeType: file.type || mimeType,
      status: 'idle',
      isExcluded: false,
    };

    const meta = parseComicFilename(fileName.replace(IMAGE_EXTENSIONS, ''));
    meta.coverThumbnail = page.imageUrl;

    return {
      isMultiChapter: false,
      archiveName: fileName,
      chapters: [
        {
          id: `chapter-1-${Date.now()}`,
          index: 0,
          title: meta.chapterTitle || meta.combinedTitle || fileName,
          fileName,
          pages: [page],
          metadata: meta,
          chapterSummary: '',
        },
      ],
    };
  }

  // 2. If explicitly a .mht or .mhtml saved webpage file
  if (/\.(mhtml?|html?)$/i.test(fileName)) {
    const buffer = await file.arrayBuffer();
    const mhtResult = await parseMhtArchive(buffer, fileName);
    console.log('[IMPORT] chapter/pages created from MHT:', {
      fileName,
      pagesCount: mhtResult.pages.length,
      firstPageUrl: mhtResult.pages[0]?.imageUrl,
    });
    const chapter: ComicChapter = {
      id: `mht-chapter-1-${Date.now()}`,
      index: 0,
      title: mhtResult.episodeTitle || mhtResult.seriesTitle || fileName.replace(/\.(mhtml?|html?)$/i, ''),
      fileName,
      pages: mhtResult.pages,
      metadata: {
        mangaTitle: mhtResult.seriesTitle,
        bookTitle: mhtResult.seriesTitle,
        chapterTitle: mhtResult.episodeTitle,
        combinedTitle: mhtResult.combinedTitle || mhtResult.seriesTitle,
        author: mhtResult.author,
        combinedAuthor: mhtResult.author || 'Original Author',
        synopsis: mhtResult.synopsis,
        source: 'mht',
        sourceUrl: mhtResult.sourceUrl,
      },
      chapterSummary: '',
    };
    return {
      isMultiChapter: false,
      archiveName: fileName,
      chapters: [chapter],
    };
  }

  // 3. Try parsing as a ZIP / CBZ archive
  try {
    if (/\.cbz$/i.test(fileName)) {
      const single = await parseCbzFile(file);
      return {
        isMultiChapter: false,
        archiveName: fileName,
        chapters: [
          {
            id: `chapter-1-${Date.now()}`,
            index: 0,
            title: single.metadata.chapterTitle || single.metadata.combinedTitle || fileName.replace(/\.cbz$/i, ''),
            fileName,
            pages: single.pages,
            metadata: single.metadata,
            chapterSummary: '',
          },
        ],
      };
    }

    const result = await parseMultiChapterZip(file, onProgress);
    return {
      isMultiChapter: result.chapters.length > 1,
      archiveName: result.parentArchiveName,
      chapters: result.chapters,
    };
  } catch (zipErr: any) {
    // 4. Fallback: If zip loading failed with central directory error, check if the file is an MHT saved webpage
    try {
      const buffer = await file.arrayBuffer();
      const mhtResult = await parseMhtArchive(buffer, fileName);
      return {
          isMultiChapter: false,
          archiveName: fileName,
          chapters: [
            {
              id: `mht-chapter-1-${Date.now()}`,
              index: 0,
              title: mhtResult.episodeTitle || mhtResult.seriesTitle || fileName.replace(/\.(mhtml?|html?)$/i, ''),
              fileName,
              pages: mhtResult.pages,
              metadata: {
                mangaTitle: mhtResult.seriesTitle,
                bookTitle: mhtResult.seriesTitle,
                chapterTitle: mhtResult.episodeTitle,
                combinedTitle: mhtResult.combinedTitle || mhtResult.seriesTitle,
                author: mhtResult.author,
                combinedAuthor: mhtResult.author || 'Original Author',
                synopsis: mhtResult.synopsis,
                source: 'mht',
                sourceUrl: mhtResult.sourceUrl,
              },
              chapterSummary: '',
            },
          ],
        };
    } catch {
      // Continue to throw clean error
    }

    throw new Error(
      `Could not read "${fileName}". Please ensure it is a valid .CBZ file, .ZIP archive, .MHT / .MHTML saved webpage, or comic image.`
    );
  }
}

// Parse multiple files (e.g. multiple .cbz files, or a folder of image files uploaded together)
export async function parseMultipleComicFiles(
  files: File[],
  onProgress?: (progressText: string, current: number, total: number) => void
): Promise<{ chapters: ComicChapter[]; isMultiChapter: boolean; archiveName: string }> {
  if (files.length === 1) {
    return parseAnyComicArchive(files[0], onProgress);
  }

  // Sort files in natural alphanumeric order
  const sortedFiles = [...files].sort((a, b) => naturalCompare(a.name, b.name));

  // Check if user uploaded a collection of raw image files
  const imageFiles = sortedFiles.filter((f) => IMAGE_EXTENSIONS.test(f.name));
  if (imageFiles.length > 0 && imageFiles.length >= sortedFiles.length / 2) {
    const pages: ComicPage[] = imageFiles.map((file, idx) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      let mimeType = 'image/jpeg';
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'avif') mimeType = 'image/avif';

      return {
        id: `page-${idx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        index: idx,
        fileName: file.name,
        imageUrl: URL.createObjectURL(file),
        blob: file,
        mimeType: file.type || mimeType,
        status: 'idle',
        isExcluded: false,
      };
    });

    const meta = parseComicFilename(imageFiles[0].name.replace(IMAGE_EXTENSIONS, ''));
    if (pages.length > 0) meta.coverThumbnail = pages[0].imageUrl;

    return {
      chapters: [
        {
          id: `chapter-1-${Date.now()}`,
          index: 0,
          title: meta.chapterTitle || meta.combinedTitle || `${pages.length} Pages`,
          fileName: `${pages.length} Images`,
          pages,
          metadata: meta,
          chapterSummary: '',
        },
      ],
      isMultiChapter: false,
      archiveName: `${imageFiles.length} Images (${imageFiles[0].name}...)`,
    };
  }

  const chapters: ComicChapter[] = [];

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    onProgress?.(`Loading chapter ${i + 1} of ${sortedFiles.length}: ${file.name}`, i + 1, sortedFiles.length);

    try {
      const res = await parseAnyComicArchive(file);
      chapters.push(...res.chapters);
    } catch (err) {
      console.warn(`Could not parse ${file.name}:`, err);
    }
  }

  if (chapters.length === 0) {
    throw new Error('No readable comic pages or chapters found in the selected files.');
  }

  // Re-index chapters
  chapters.forEach((ch, idx) => {
    ch.index = idx;
  });

  return {
    chapters,
    isMultiChapter: chapters.length > 1,
    archiveName: `${chapters.length} Chapters (${sortedFiles[0].name.replace(/\.(cbz|zip)$/i, '')}...)`,
  };
}

// Generate demo comic pages drawn on canvas for instant testing without file upload
export async function generateDemoCbzPages(): Promise<{
  pages: ComicPage[];
  fileName: string;
  metadata: ComicMetadata;
}> {
  const demoPagesData = [
    {
      title: 'Chapter 1: The Seal of Dawn',
      subtitle: 'Official Release - Page 1',
      panels: [
        {
          type: 'narration',
          text: 'In the year 742 of the Celestial Era, ancient runes began to awaken atop Mount Obsidian.',
          x: 60,
          y: 80,
          w: 480,
          h: 70,
        },
        {
          type: 'bubble',
          speaker: 'Aria',
          text: 'Master! Look at the horizon. The constellation has shifted!',
          x: 100,
          y: 220,
          w: 240,
          h: 110,
        },
        {
          type: 'bubble',
          speaker: 'Kaelen',
          text: 'Prepare your incantations. We do not have much time before nightfall.',
          x: 300,
          y: 380,
          w: 240,
          h: 110,
        },
      ],
      watermark: 'scans-free-manga.org - DO NOT REPOST',
      isExtra: false,
      bgColor: '#1a1d24',
      panelBorder: '#4a5568',
    },
    {
      title: 'Page 2: The Crypt of Winds',
      subtitle: 'Chapter 1 - Page 2',
      panels: [
        {
          type: 'bubble',
          speaker: 'Kaelen',
          text: 'Stay behind me. The wards placed here were designed to repel mortal souls.',
          x: 80,
          y: 100,
          w: 250,
          h: 110,
        },
        {
          type: 'sfx',
          text: '* ROOOAR *',
          x: 360,
          y: 160,
          w: 180,
          h: 60,
        },
        {
          type: 'bubble',
          speaker: 'Aria',
          text: 'Did you hear that? Something is breathing behind those heavy stone doors!',
          x: 280,
          y: 300,
          w: 260,
          h: 110,
        },
        {
          type: 'narration',
          text: 'A heavy metallic click echoed throughout the corridor.',
          x: 70,
          y: 470,
          w: 460,
          h: 65,
        },
      ],
      watermark: 'WATERMARK: Join discord.gg/comicscans for chapter 2 early release!',
      isExtra: false,
      bgColor: '#161922',
      panelBorder: '#3f4756',
    },
    {
      title: 'Page 3: The Awakening',
      subtitle: 'Chapter 1 - Page 3',
      panels: [
        {
          type: 'bubble',
          speaker: 'Kaelen',
          text: 'Aria, hold the talisman! Do not let the sacred flame flicker out!',
          x: 90,
          y: 90,
          w: 250,
          h: 110,
        },
        {
          type: 'thought',
          speaker: 'Aria',
          text: '(My mana is depleting so quickly... can I maintain this barrier for another minute?)',
          x: 290,
          y: 230,
          w: 260,
          h: 120,
        },
        {
          type: 'bubble',
          speaker: 'Aria',
          text: 'I will hold it with everything I have! Break the seal now!',
          x: 100,
          y: 400,
          w: 240,
          h: 100,
        },
      ],
      watermark: 'mangastream-online.io / support us on patreon.com/scanlators',
      isExtra: false,
      bgColor: '#1b1d28',
      panelBorder: '#4a5266',
    },
    {
      title: 'Page 3 (Long Manhwa Strip): Descent into the Obsidian Sanctuary',
      subtitle: 'Chapter 1 - Vertical Strip',
      height: 1600,
      panels: [
        {
          type: 'narration',
          text: 'The grand staircase descended deep into the subterranean depths of Mount Obsidian.',
          x: 60,
          y: 80,
          w: 480,
          h: 70,
        },
        {
          type: 'bubble',
          speaker: 'Kaelen',
          text: 'Watch your footing. In webtoon format, this long strip scrolls continuously from top to bottom.',
          x: 90,
          y: 260,
          w: 320,
          h: 110,
        },
        {
          type: 'sfx',
          text: '* DRIP... DRIP... *',
          x: 360,
          y: 490,
          w: 200,
          h: 60,
        },
        {
          type: 'thought',
          speaker: 'Aria',
          text: '(With Fit Width mode, readers can view and scroll this entire tall manhwa page with full text clarity!)',
          x: 100,
          y: 710,
          w: 380,
          h: 110,
        },
        {
          type: 'bubble',
          speaker: 'Aria',
          text: 'Master! Look at the ancient glyphs carved into the pillars below!',
          x: 120,
          y: 1000,
          w: 340,
          h: 110,
        },
        {
          type: 'narration',
          text: 'At the bottom of the long cavern, the seal of dawn pulsed with radiant violet energy.',
          x: 60,
          y: 1300,
          w: 480,
          h: 70,
        },
      ],
      watermark: 'manhwa-scans.cc / Read webtoons in full length',
      isExtra: false,
      bgColor: '#131622',
      panelBorder: '#394154',
    },
    {
      title: 'EXTRA PAGE: Scanlation Team Credits & Recruitment',
      subtitle: 'Non-Story Extra Page',
      panels: [
        {
          type: 'credit',
          text: '=== TRANSLATION TEAM RECRUITMENT ===\nWe are urgently looking for:\n- Japanese/Korean to English Translators\n- Redrawers & Cleaners\n- Quality Checkers\n\nApply on Discord: discord.gg/manga-guild\nSupport us on Patreon: patreon.com/guildscans\n\nDo not upload to other aggregator sites!',
          x: 50,
          y: 90,
          w: 500,
          h: 380,
        },
      ],
      watermark: 'Scanlator recruitment sheet - Not part of comic chapter',
      isExtra: true,
      bgColor: '#231d27',
      panelBorder: '#805ad5',
    },
  ];

  const pages: ComicPage[] = [];

  for (let idx = 0; idx < demoPagesData.length; idx++) {
    const data = demoPagesData[idx];
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = (data as any).height || 840;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Draw Page Background
      ctx.fillStyle = data.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Page Header Bar
      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, canvas.width, 50);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
      ctx.fillText(data.title, 24, 32);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Page ${idx + 1} of ${demoPagesData.length}`, canvas.width - 24, 32);
      ctx.textAlign = 'left';

      // Draw Panels & Bubbles
      data.panels.forEach((panel) => {
        if (panel.type === 'narration') {
          // Yellowish narration caption box
          ctx.fillStyle = '#fef08a';
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 2;
          ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
          ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);

          ctx.fillStyle = '#713f12';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillText('NARRATION', panel.x + 12, panel.y + 18);

          ctx.fillStyle = '#1e293b';
          ctx.font = '13px system-ui, sans-serif';
          wrapText(ctx, panel.text, panel.x + 12, panel.y + 36, panel.w - 24, 18);
        } else if (panel.type === 'bubble') {
          // Comic Speech Bubble
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 3;
          drawRoundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 18);
          ctx.fill();
          ctx.stroke();

          // Tail
          ctx.beginPath();
          ctx.moveTo(panel.x + panel.w / 2 - 10, panel.y + panel.h);
          ctx.lineTo(panel.x + panel.w / 2 + 10, panel.y + panel.h);
          ctx.lineTo(panel.x + panel.w / 2, panel.y + panel.h + 20);
          ctx.closePath();
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.stroke();

          // Bubble cover line
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(panel.x + panel.w / 2 - 8, panel.y + panel.h - 2, 16, 4);

          // Speaker label
          if (panel.speaker) {
            ctx.fillStyle = '#6366f1';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.fillText(panel.speaker.toUpperCase(), panel.x + 14, panel.y + 20);
          }

          // Text inside bubble
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px system-ui, sans-serif';
          wrapText(ctx, panel.text, panel.x + 14, panel.y + (panel.speaker ? 38 : 26), panel.w - 28, 18);
        } else if (panel.type === 'thought') {
          // Cloud/Thought Bubble
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          drawRoundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 24);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#475569';
          ctx.font = 'italic bold 11px system-ui, sans-serif';
          ctx.fillText('THOUGHT', panel.x + 14, panel.y + 20);

          ctx.fillStyle = '#334155';
          ctx.font = 'italic 13px system-ui, sans-serif';
          wrapText(ctx, panel.text, panel.x + 14, panel.y + 38, panel.w - 28, 18);
        } else if (panel.type === 'sfx') {
          // Sound effect text
          ctx.fillStyle = '#f59e0b';
          ctx.font = '900 24px Impact, system-ui, sans-serif';
          ctx.fillText(panel.text, panel.x, panel.y + 36);
        } else if (panel.type === 'credit') {
          // Extra credit page content
          ctx.fillStyle = '#2e2537';
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2;
          drawRoundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#e9d5ff';
          ctx.font = 'bold 16px system-ui, sans-serif';
          ctx.fillText('SCANLATION STAFF CREDITS', panel.x + 20, panel.y + 40);

          ctx.fillStyle = '#cbd5e1';
          ctx.font = '13px monospace';
          const lines = panel.text.split('\n');
          lines.forEach((line, lineIdx) => {
            ctx.fillText(line, panel.x + 20, panel.y + 70 + lineIdx * 20);
          });
        }
      });

      // Draw Unwanted Watermark at bottom (to demonstrate OCR filtering!)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(20, canvas.height - 50, canvas.width - 40, 30);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.strokeRect(20, canvas.height - 50, canvas.width - 40, 30);

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`[WATERMARK NOISE TO FILTER]: ${data.watermark}`, canvas.width / 2, canvas.height - 30);
      ctx.textAlign = 'left';
    }

    const blob: Blob = await new Promise((res) => {
      canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.92);
    });

    const imageUrl = URL.createObjectURL(blob);

    pages.push({
      id: `demo-page-${idx + 1}`,
      index: idx,
      fileName: `demo_page_${idx + 1}.jpg`,
      imageUrl,
      blob,
      mimeType: 'image/jpeg',
      status: 'idle',
      isExcluded: false,
    });
  }

  const metadata: ComicMetadata = {
    mangaTitle: 'The Seal of Dawn',
    bookTitle: 'The Seal of Dawn',
    chapterNumber: '1',
    chapterTitle: 'Chapter 1: Ancient Runes Awakening',
    combinedTitle: 'The Seal of Dawn - Chapter 1',
    author: 'Aria & Kaelen Chronicles',
    artist: 'Studio Obsidian Art',
    scanlator: 'Celestial Guild Scans',
    combinedAuthor: 'Aria & Kaelen Chronicles (Celestial Guild Scans)',
    series: 'The Seal of Dawn',
    issueNumber: '1',
    coverThumbnail: pages.length > 0 ? pages[0].imageUrl : undefined,
    synopsis:
      'In the year 742 of the Celestial Era, ancient runes awaken atop Mount Obsidian as Aria and Kaelen race against time to unseal the legendary dawn relics and repel the shadow wards.',
    genres: ['Fantasy', 'Adventure', 'Action'],
    releaseYear: '2025',
    status: 'Ongoing',
    source: 'demo',
  };

  return {
    pages,
    fileName: 'sample_manga_chapter_01.cbz',
    metadata,
  };
}

// Canvas text wrapping helper
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// Canvas rounded rectangle helper
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
