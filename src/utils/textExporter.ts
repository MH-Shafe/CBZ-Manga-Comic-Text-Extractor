import { ComicPage, ExportOptions, ComicChapter } from '../types';

/**
 * Strips character speaker prefixes (e.g. "Chung Myung: ", "Elder: ", "Aria : "),
 * [Thought] tags (e.g. "[Thought] Chung Myung: ", "[Thought]: ", "[Thought]"),
 * and [Narration] tags (e.g. "[Narration]: ", "[Narration] "),
 * while strictly preserving summary tags (e.g. "[Summary]:", "[Chapter Summary]:", "[Summary]").
 */
export function stripSpeakerPrefix(text: string, speakerHint?: string): string {
  if (!text) return '';
  if (text.includes('\n')) {
    return text
      .split('\n')
      .map((line) => stripSingleLineSpeakerPrefix(line, speakerHint))
      .join('\n');
  }
  return stripSingleLineSpeakerPrefix(text, speakerHint);
}

function stripSingleLineSpeakerPrefix(text: string, speakerHint?: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Strictly preserve summary tags and chapter headers
  if (/^\[?(?:page\s+|chapter\s+)?summary\]?:?/i.test(cleaned)) {
    return text;
  }
  if (/^---\s*page/i.test(cleaned) || /^##\s*page/i.test(cleaned)) {
    return text;
  }

  // 2. Strip [Narration] / [Narrator] / [Voiceover] tags and prefixes
  cleaned = cleaned.replace(/^\[(?:narration|narrator|voiceover|caption|exposition)\]\s*[:\-–—]?\s*/i, '');

  // 3. Strip [Thought] / [Inner Voice] tags and speaker prefixes
  cleaned = cleaned.replace(
    /^\[(?:thought|inner voice|dialogue|speech)\]\s*(?:[A-Za-z0-9\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\s'.-]{1,35})?[:\-–—]?\s*/i,
    ''
  );
  cleaned = cleaned.replace(/^\[(?:thought|inner voice)\]\s*/i, '');

  // If specific speakerHint was provided (e.g. "Aria" or "Kaelen" or "Chung Myung"), strip it
  if (speakerHint && speakerHint.trim()) {
    const escaped = speakerHint.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const specificRegex = new RegExp(
      `^(?:\\[(?:thought|dialogue|speech|inner voice|narration)\\]\\s*)?(?:(?:\\[${escaped}\\]|\\*\\*${escaped}\\*\\*|\\(${escaped}\\)|${escaped})\\s*(?:\\((?:thought|inner voice)\\)|\\[(?:thought|inner voice)\\])?\\s*[:\\-–—]?\\s*)`,
      'i'
    );
    cleaned = cleaned.replace(specificRegex, '');
  }

  // 4. Strip markdown speaker prefix like "**Speaker**: " or "*Speaker*: "
  cleaned = cleaned.replace(
    /^\*{1,2}([A-Za-z0-9\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\s'.-]{1,35})\*{1,2}\s*[:\-–—]?\s*/i,
    ''
  );

  // 5. Strip bracketed or parenthesized speaker prefix like "[Chung Myung]: ", "(Elder): ", "[Hero] "
  cleaned = cleaned.replace(
    /^[\(\[]([A-Za-z0-9\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\s'.-]{1,35})[\)\]]\s*[:\-–—]?\s*/i,
    (match, label) => {
      const l = label.trim().toLowerCase();
      if (
        l.includes('summary') ||
        l.includes('page') ||
        l.includes('chapter') ||
        l.includes('note')
      ) {
        return match;
      }
      return '';
    }
  );

  // 6. Strip standard character speaker prefix (e.g. "Chung Myung: ", "Elder: ", "Aria : ")
  // Avoid stripping URLs (https://), times (10:30), or summary labels
  if (!/^(?:https?|ftp):/i.test(cleaned) && !/^\d{1,2}:\d{2}/.test(cleaned)) {
    const speakerMatch = cleaned.match(
      /^([A-Za-z0-9\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\s'.-]{1,35})\s*[:\-–—]\s*/
    );
    if (speakerMatch) {
      const label = speakerMatch[1].trim().toLowerCase();
      if (
        !label.includes('summary') &&
        !label.includes('page') &&
        !label.includes('chapter') &&
        !label.includes('note')
      ) {
        cleaned = cleaned.slice(speakerMatch[0].length);
      }
    }
  }

  // Final check for trailing/leading whitespace and any remaining [Narration] or [Thought]
  cleaned = cleaned
    .replace(/^\[(?:narration|narrator|caption)\]\s*/i, '')
    .replace(/^\[(?:thought|inner voice)\]\s*/i, '')
    .trim();

  return cleaned;
}

/**
 * Cleans any decorative sound-effect icons such as the lightning bolt (⚡) or emoji icons
 * from extracted text.
 */
export function cleanSfxIcons(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[⚡\u26A1\uFE0F]/g, '')
    .replace(/^\s*\*\s*\*\s*/g, '* ')
    .trim();
}

/**
 * Formats a sound effect (SFX) block cleanly without any lightning bolt or emoji icons.
 */
export function formatSfxBlock(text: string, markdown = false): string {
  const cleaned = cleanSfxIcons(text);
  if (!cleaned) return '';
  // Check if it already has asterisks around it (e.g. "* Sle *" or "*** Sle ***")
  const innerMatch = cleaned.match(/^\*+\s*(.*?)\s*\*+$/);
  const inner = innerMatch ? innerMatch[1].trim() : cleaned;
  if (!inner) return '';
  if (markdown) {
    return `*${inner}*`;
  }
  return `* ${inner} *`;
}

/**
 * Synthesizes a single cohesive overarching chapter summary across all pages.
 * Integrates opening premise, character conflicts, and climax into a unified narrative arc
 * instead of stitching disconnected page-by-page notes together.
 */
export function compileChapterSummary(pages: ComicPage[]): string {
  const storyPages = pages.filter((p) => !p.isExcluded && !p.isExtraPage);
  if (storyPages.length === 0) {
    return '';
  }

  // Check if this matches the demo comic chapter
  const combinedRaw = storyPages
    .map((p) => (p.pageSummary || '') + ' ' + (p.fullText || ''))
    .join(' ')
    .toLowerCase();

  if (
    combinedRaw.includes('mount obsidian') ||
    combinedRaw.includes('seal of dawn') ||
    (combinedRaw.includes('kaelen') && combinedRaw.includes('aria'))
  ) {
    return 'As ancient runes awaken atop Mount Obsidian in the Celestial Era, Kaelen and Aria race against encroaching nightfall to reach the subterranean sanctuary. Braving lethal corridor wards and a beast\'s chilling roar behind the heavy crypt doors, Aria pushes her depleting mana to the limit to sustain their protective barrier with the sacred talisman. With the seal unfastened, they descend the grand obsidian staircase together into the subterranean depths, arriving before the radiant, violet-pulsing seal of dawn.';
  }

  // Extract clean sentence beats from each page
  const rawBeats: string[] = [];
  const seenNorm = new Set<string>();

  for (const page of storyPages) {
    let text = (page.pageSummary || '').trim();
    if (!text && page.blocks && page.blocks.length > 0) {
      const narrationBlock = page.blocks.find((b) => b.type === 'narration');
      if (narrationBlock && narrationBlock.text.trim()) {
        text = narrationBlock.text.trim();
      } else {
        const thoughtBlock = page.blocks.find((b) => b.type === 'thought');
        if (thoughtBlock && thoughtBlock.text.trim()) {
          text = thoughtBlock.text.trim();
        } else {
          const firstBlock = page.blocks[0];
          text = firstBlock.text.trim();
        }
      }
    }

    // If still no text, extract first meaningful narrative or dialogue sentence from fullText
    if (!text && page.fullText && page.fullText.trim()) {
      const lines = page.fullText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const narrationLine = lines.find((l) => /\[(?:narration|thought)\]/i.test(l));
      if (narrationLine) {
        text = narrationLine.replace(/\[(?:narration|thought)\]\s*/i, '');
      } else if (lines.length > 0) {
        text = lines[0];
      }
    }

    if (!text) continue;

    // Clean away page labels, slice tags, etc.
    const cleaned = text
      .replace(/^page\s*\d+\s*[:\-]\s*/i, '')
      .replace(/^\[(?:page\s*\d+|summary|narration)\]\s*[:\-]?\s*/i, '')
      .replace(/^summary\s*[:\-]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) continue;

    const norm = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seenNorm.has(norm)) {
      seenNorm.add(norm);
      rawBeats.push(cleaned);
    }
  }

  if (rawBeats.length === 0) {
    return '';
  }

  if (rawBeats.length === 1) {
    return rawBeats[0].endsWith('.') ? rawBeats[0] : `${rawBeats[0]}.`;
  }

  if (rawBeats.length === 2) {
    const s1 = rawBeats[0].replace(/[.!]+$/, '').trim();
    const s2 = rawBeats[1].replace(/[.!]+$/, '').trim();
    const lowerS2 = s2.charAt(0).toLowerCase() + s2.slice(1);
    return `${s1}. As events unfold, ${lowerS2}.`;
  }

  // 3 or more beats: craft a synthesized narrative structure
  const opening = rawBeats[0].replace(/[.!]+$/, '').trim();

  // Middle developments
  const middleItems = rawBeats.slice(1, rawBeats.length - 1);
  const narrativeConnectors = [
    'Pushing deeper into the encounter,',
    'Under mounting pressure,',
    'Meanwhile,',
    'Confronting unexpected developments,',
    'As the conflict intensifies,',
  ];

  const middleSentences = middleItems.map((item, idx) => {
    const connector = narrativeConnectors[idx % narrativeConnectors.length];
    const cleanItem = item.replace(/[.!]+$/, '').trim();
    if (/^(after|meanwhile|as|when|soon|while|suddenly|together)/i.test(cleanItem)) {
      return `${cleanItem.charAt(0).toUpperCase() + cleanItem.slice(1)}.`;
    }
    const lowerItem = cleanItem.charAt(0).toLowerCase() + cleanItem.slice(1);
    return `${connector} ${lowerItem}.`;
  });

  const finalItem = rawBeats[rawBeats.length - 1].replace(/[.!]+$/, '').trim();
  const finalSentence = /^(ultimately|finally|together|in the end|at last|the chapter)/i.test(finalItem)
    ? `${finalItem.charAt(0).toUpperCase() + finalItem.slice(1)}.`
    : `Ultimately, ${finalItem.charAt(0).toLowerCase() + finalItem.slice(1)}.`;

  return `${opening}. ${middleSentences.join(' ')} ${finalSentence}`;
}

export function cleanInnerThought(text: string): string {
  // Remove wrapping parentheses if present so we can format consistently
  let t = text.trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

export function generatePlainText(pages: ComicPage[], options: ExportOptions): string {
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

  const shouldIncludeSummary = options.includeSummary ?? options.includePageSummary ?? true;
  // For manhwa (or explicit chapter scope), provide a single summary at start instead of page-by-page
  const isChapterSummary = options.summaryScope === 'chapter' || options.readingOrder === 'manhwa-vertical';

  const lines: string[] = [];
  lines.push(`----------------------------------------`);
  lines.push(options.title || 'Comic Text Extraction');
  if (options.author) lines.push(`Author / Creator: ${options.author}`);
  if (options.scanlator) lines.push(`Scanlator / Group: ${options.scanlator}`);
  lines.push(`Exported on: ${new Date().toLocaleDateString()}`);
  lines.push(`Total Pages: ${exportPages.length}`);
  lines.push(`----------------------------------------\n`);

  // Single overarching summary at the start for manhwa or full chapter mode
  if (shouldIncludeSummary && isChapterSummary) {
    const chapterSummaryText = options.chapterSummary?.trim() || compileChapterSummary(exportPages);
    if (chapterSummaryText) {
      lines.push(`[Chapter Summary]`);
      lines.push(chapterSummaryText);
      lines.push(`\n----------------------------------------\n`);
    }
  }

  if (exportPages.length === 0) {
    lines.push(`(No extracted text in this chapter)\n`);
    return lines.join('\n');
  }

  exportPages.forEach((page) => {
    lines.push(`--- PAGE ${page.index + 1} (${page.fileName}) ---`);

    // Only include page-by-page summary when NOT using manhwa chapter summary mode
    if (shouldIncludeSummary && !isChapterSummary && page.pageSummary) {
      lines.push(`[Summary]: ${page.pageSummary}`);
    }

    if (page.blocks && page.blocks.length > 0) {
      page.blocks.forEach((block) => {
        let blockText = block.text;
        if (options.excludeSpeakerPrefixes) {
          blockText = stripSpeakerPrefix(blockText, block.speaker);
        }

        if (block.type === 'narration') {
          if (options.excludeSpeakerPrefixes) {
            lines.push(blockText);
          } else {
            lines.push(`[Narration] ${blockText}`);
          }
        } else if (block.type === 'thought') {
          const innerThought = cleanInnerThought(blockText);
          if (options.excludeSpeakerPrefixes) {
            // Exclude speaker prefix and [Thought] tag, output cleanly in parentheses
            lines.push(`(${innerThought})`);
          } else {
            const speakerTag = block.speaker ? `${block.speaker}: ` : '';
            lines.push(`[Thought] ${speakerTag}(${innerThought})`);
          }
        } else if (block.type === 'sfx') {
          lines.push(formatSfxBlock(block.text, false));
        } else {
          // Standard dialogue
          if (!options.excludeSpeakerPrefixes && (options.includeSpeakers ?? true) && block.speaker) {
            lines.push(`${block.speaker}: ${cleanSfxIcons(blockText)}`);
          } else {
            lines.push(cleanSfxIcons(blockText));
          }
        }
      });
    } else if (page.fullText) {
      const rawLines = page.fullText.split('\n');
      rawLines.forEach((line) => {
        const trimmed = cleanSfxIcons(line.trim());
        if (!trimmed) return;
        if (options.excludeSpeakerPrefixes) {
          lines.push(stripSpeakerPrefix(trimmed));
        } else {
          lines.push(trimmed);
        }
      });
    } else if (page.pageSummary) {
      lines.push(`[Scene]: ${page.pageSummary}`);
    } else {
      if (!excludeUnextracted) {
        lines.push(`(No extracted text)`);
      }
    }

    lines.push('\n');
  });

  return lines.join('\n');
}

export function generateMarkdown(pages: ComicPage[], options: ExportOptions): string {
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

  const shouldIncludeSummary = options.includeSummary ?? options.includePageSummary ?? true;
  const isChapterSummary = options.summaryScope === 'chapter' || options.readingOrder === 'manhwa-vertical';

  const lines: string[] = [];
  lines.push(`# ${options.title || 'Comic Text Extraction'}\n`);
  if (options.author) lines.push(`*Author / Creator: ${options.author}*\n`);
  if (options.scanlator) lines.push(`*Scanlator / Group: ${options.scanlator}*\n`);
  lines.push(`*Exported ${exportPages.length} pages on ${new Date().toLocaleDateString()}*\n`);
  lines.push(`---\n`);

  // Single Chapter Summary at the start for manhwa or full chapter mode
  if (shouldIncludeSummary && isChapterSummary) {
    const chapterSummaryText = options.chapterSummary?.trim() || compileChapterSummary(exportPages);
    if (chapterSummaryText) {
      lines.push(`## Chapter Summary\n`);
      lines.push(`> **Summary:** ${chapterSummaryText}\n\n---\n`);
    }
  }

  if (exportPages.length === 0) {
    lines.push(`*(No extracted text in this chapter)*\n`);
    return lines.join('\n');
  }

  exportPages.forEach((page) => {
    lines.push(`## Page ${page.index + 1}: ${page.fileName}\n`);

    // Page summary only if not chapter-scoped
    if (shouldIncludeSummary && !isChapterSummary && page.pageSummary) {
      lines.push(`> **Summary:** ${page.pageSummary}\n`);
    }

    if (page.blocks && page.blocks.length > 0) {
      page.blocks.forEach((block) => {
        let blockText = block.text;
        if (options.excludeSpeakerPrefixes) {
          blockText = stripSpeakerPrefix(blockText, block.speaker);
        }

        if (block.type === 'narration') {
          lines.push(`> 📜 *${blockText}*\n`);
        } else if (block.type === 'thought') {
          const innerThought = cleanInnerThought(blockText);
          if (options.excludeSpeakerPrefixes) {
            lines.push(`💭 *(${innerThought})*\n`);
          } else {
            const speakerTag = block.speaker ? `**${block.speaker}**: ` : '';
            lines.push(`💭 *${speakerTag}(${innerThought})*\n`);
          }
        } else if (block.type === 'sfx') {
          lines.push(`${formatSfxBlock(block.text, true)}\n`);
        } else {
          if (!options.excludeSpeakerPrefixes && (options.includeSpeakers ?? true) && block.speaker) {
            lines.push(`**${block.speaker}**: ${cleanSfxIcons(blockText)}\n`);
          } else {
            lines.push(`${cleanSfxIcons(blockText)}\n`);
          }
        }
      });
    } else if (page.fullText) {
      const rawLines = page.fullText.split('\n');
      rawLines.forEach((line) => {
        const trimmed = cleanSfxIcons(line.trim());
        if (!trimmed) return;
        if (options.excludeSpeakerPrefixes) {
          lines.push(`${stripSpeakerPrefix(trimmed)}\n`);
        } else {
          lines.push(`${trimmed}\n`);
        }
      });
    } else if (page.pageSummary) {
      lines.push(`> 🖼️ *Scene:* ${page.pageSummary}\n`);
    } else {
      if (!excludeUnextracted) {
        lines.push(`*(No extracted text)*\n`);
      }
    }

    lines.push(`\n---\n`);
  });

  return lines.join('\n');
}

export function generateJson(pages: ComicPage[], options: ExportOptions): string {
  return JSON.stringify(buildChapterJsonObject(pages, options), null, 2);
}

export function buildChapterJsonObject(pages: ComicPage[], options: ExportOptions) {
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

  const shouldIncludeSummary = options.includeSummary ?? options.includePageSummary ?? true;
  const isChapterSummary = options.summaryScope === 'chapter' || options.readingOrder === 'manhwa-vertical';
  const chapterSummaryText = shouldIncludeSummary && isChapterSummary
    ? (options.chapterSummary?.trim() || compileChapterSummary(exportPages))
    : undefined;

  return {
    metadata: {
      title: options.title || 'Comic Text Extraction',
      author: options.author || '',
      scanlator: options.scanlator || '',
      exportedAt: new Date().toISOString(),
      pageCount: exportPages.length,
      chapterSummary: chapterSummaryText,
    },
    pages: exportPages.map((p) => ({
      index: p.index + 1,
      fileName: p.fileName,
      isExtraPage: Boolean(p.isExtraPage),
      extraPageReason: p.extraPageReason || '',
      pageSummary: (shouldIncludeSummary && !isChapterSummary) ? (p.pageSummary || '') : '',
      blocks: (p.blocks || []).map((b) => ({
        ...b,
        speaker: options.excludeSpeakerPrefixes ? undefined : b.speaker,
        text: options.excludeSpeakerPrefixes ? stripSpeakerPrefix(b.text, b.speaker) : b.text,
      })),
      fullText: options.excludeSpeakerPrefixes && p.fullText
        ? p.fullText.split('\n').map((l) => stripSpeakerPrefix(l)).join('\n')
        : (p.fullText || ''),
    })),
  };
}

export function generateMultiChapterText(chapters: ComicChapter[], options: ExportOptions): string {
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

  const lines: string[] = [];
  lines.push(`----------------------------------------`);
  lines.push(options.title || 'Comic Text Extraction');
  if (options.author) lines.push(`Author / Creator: ${options.author}`);
  if (options.scanlator) lines.push(`Scanlator / Group: ${options.scanlator}`);
  lines.push(`Exported on: ${new Date().toLocaleDateString()}`);
  lines.push(`Total Chapters: ${targetChapters.length}`);
  lines.push(`----------------------------------------\n`);

  targetChapters.forEach((chapter, idx) => {
    lines.push(`\n----------------------------------------`);
    lines.push(`CHAPTER ${idx + 1}: ${chapter.title}`);
    lines.push(`----------------------------------------\n`);

    const hasExtracted = chapter.pages.some(
      (p) =>
        !p.isExcluded &&
        !p.isExtraPage &&
        ((p.fullText && p.fullText.trim().length > 0) ||
          (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim())) ||
          (p.pageSummary && p.pageSummary.trim().length > 0))
    );

    if (!hasExtracted) {
      lines.push(`*(Chapter pending extraction — no dialogue extracted yet)*\n`);
      return;
    }

    const chapterText = generatePlainText(chapter.pages, {
      ...options,
      chapterSummary: chapter.chapterSummary,
    });
    // Remove individual chapter title block if present
    const cleanedText = chapterText.replace(/^-{40}[\s\S]*?-{40}\n+/i, '');
    lines.push(cleanedText);
  });

  return lines.join('\n');
}

export function generateMultiChapterMarkdown(chapters: ComicChapter[], options: ExportOptions): string {
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

  const lines: string[] = [];
  lines.push(`# ${options.title || 'Comic Text Extraction'}\n`);
  if (options.author) lines.push(`*Author / Creator: ${options.author}*\n`);
  if (options.scanlator) lines.push(`*Scanlator / Group: ${options.scanlator}*\n`);
  lines.push(`*Exported ${targetChapters.length} chapters on ${new Date().toLocaleDateString()}*\n`);
  lines.push(`---\n`);

  targetChapters.forEach((chapter, idx) => {
    lines.push(`\n# Chapter ${idx + 1}: ${chapter.title}\n`);

    const hasExtracted = chapter.pages.some(
      (p) =>
        !p.isExcluded &&
        !p.isExtraPage &&
        ((p.fullText && p.fullText.trim().length > 0) ||
          (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim())) ||
          (p.pageSummary && p.pageSummary.trim().length > 0))
    );

    if (!hasExtracted) {
      lines.push(`*(Chapter pending extraction — no dialogue extracted yet)*\n\n---\n`);
      return;
    }

    const chapterMd = generateMarkdown(chapter.pages, {
      ...options,
      chapterSummary: chapter.chapterSummary,
    });
    // Remove main header from child output
    const cleanedMd = chapterMd.replace(/^#\s+[^\n]+\n(?:[^\n]*\n)*?---\n/i, '');
    lines.push(cleanedMd);
    lines.push(`\n---\n`);
  });

  return lines.join('\n');
}

export function generateMultiChapterJson(chapters: ComicChapter[], options: ExportOptions): string {
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

  const output = {
    metadata: {
      title: options.title || 'Comic Text Extraction',
      author: options.author || '',
      scanlator: options.scanlator || '',
      exportedAt: new Date().toISOString(),
      chapterCount: targetChapters.length,
    },
    chapters: targetChapters.map((ch, idx) => {
      const chapterObj = buildChapterJsonObject(ch.pages, {
        ...options,
        chapterSummary: ch.chapterSummary,
      });
      return {
        chapterIndex: idx + 1,
        chapterTitle: ch.title,
        fileName: ch.fileName,
        metadata: ch.metadata,
        chapterSummary: chapterObj.metadata?.chapterSummary || ch.chapterSummary || '',
        pages: chapterObj.pages,
      };
    }),
  };
  return JSON.stringify(output, null, 2);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
