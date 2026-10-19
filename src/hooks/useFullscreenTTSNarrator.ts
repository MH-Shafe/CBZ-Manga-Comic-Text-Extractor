import { useState, useEffect, useRef, useCallback } from 'react';
import { ComicPage, TextBlock, TextClassification, BlockType } from '../types';
import { stripSpeakerPrefix } from '../utils/textExporter';

export { stripSpeakerPrefix };

export type { TextClassification, BlockType };

export const STORAGE_KEY_VOICE_URI = 'cbz_tts_voice_uri';
export const STORAGE_KEY_SPEECH_RATE = 'cbz_tts_speech_rate';
export const STORAGE_KEY_PAUSE = 'cbz_auto_scroll_pause_sec';
export const STORAGE_KEY_SMART_SCROLL = 'cbz_smart_scroll_enabled';
export const STORAGE_KEY_INCLUDE_SPEAKER = 'cbz_tts_include_speaker';
export const STORAGE_KEY_SCROLL_SPEED_MODE = 'cbz_scroll_speed_mode';
export const STORAGE_KEY_SCROLL_VELOCITY = 'cbz_scroll_velocity_multiplier';

export const DEFAULT_SPEECH_RATE = 1.0;
export const DEFAULT_PAUSE_SECONDS = 5;
export const MIN_PAUSE_SECONDS = 0;
export const MAX_PAUSE_SECONDS = 120;

export const DEFAULT_SCROLL_VELOCITY = 1.0;
export const MIN_SCROLL_VELOCITY = 0.25;
export const MAX_SCROLL_VELOCITY = 3.0;

export type ScrollSpeedMode = 'slow' | 'normal' | 'fast';

export const SCROLL_SPEED_PIXELS_PER_SEC: Record<ScrollSpeedMode, number> = {
  slow: 200,   // 200 px/sec - Slow, comfortable viewing of manhwa artwork and action
  normal: 350, // 350 px/sec - Smooth, balanced natural reading glide
  fast: 550,   // 550 px/sec - Brisk, rapid reading
};

/**
 * Normalizes text for SFX comparison by collapsing 2+ repeated characters (e.g. "SHHHH..." -> "sh", "TREEEEMBLE" -> "tremble").
 */
export function normalizeSfxWord(word: string): string {
  if (!word) return '';
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  // Collapse runs of 2+ identical consecutive characters into 1 (e.g. eeee -> e, ssss -> s)
  return cleaned.replace(/(.)\1+/g, '$1');
}

/**
 * Common sound effect raw root words, onomatopoeia, and action noise expressions.
 */
export const COMMON_SFX_ROOTS_RAW: ReadonlySet<string> = new Set([
  'shh', 'shhh', 'shhhh', 'murmur', 'mumble', 'whisper', 'grab', 'clutch', 'snatch',
  'tremble', 'shiver', 'shake', 'quiver', 'hmm', 'hmmm', 'hmmmm', 'um', 'umm', 'ummm',
  'uh', 'uhh', 'clap', 'applause', 'bang', 'boom', 'crash', 'thud', 'slam', 'bam',
  'pow', 'kapow', 'smash', 'crack', 'snap', 'clang', 'clink', 'rumble', 'whoosh',
  'swish', 'swoosh', 'slash', 'rustle', 'creak', 'squeak', 'splash', 'drip', 'drop',
  'plop', 'sizzle', 'fizz', 'click', 'clack', 'tick', 'tock', 'tap', 'knock',
  'ding', 'dong', 'beep', 'ring', 'sigh', 'gasp', 'ahem', 'cough', 'sneeze',
  'haha', 'hehe', 'giggle', 'snicker', 'chuckle', 'gulp', 'sniff', 'sob', 'weep',
  'pant', 'yawn', 'groan', 'grunt', 'screech', 'roar', 'howl', 'growl', 'bark',
  'meow', 'chirp', 'flinch', 'twitch', 'glance', 'stare', 'glare', 'blink', 'wink',
  'smirk', 'grin', 'nod', 'shudder', 'wince', 'thump', 'rattle', 'clatter', 'puff',
  'poof', 'whack', 'smack', 'bonk', 'crunch', 'squish', 'doki', 'pitter', 'patter',
  'badump', 'kya', 'kyaa', 'kyaaa', 'uwo', 'uwoo', 'uwa', 'uwaa', 'argh', 'urgh',
  'tch', 'tsk', 'hya', 'hyaa', 'baam', 'baaam', 'ba-dump', 'fwoosh', 'vroom',
  'zoom', 'screeeam', 'scream', 'hic', 'burp', 'chuff', 'snort', 'snortle',
  'hiss', 'buzz', 'whir', 'whirr', 'hum', 'clank', 'jingle', 'zap', 'zing',
  'sh', 'hm', 'um', 'ha', 'he'
]);

/**
 * Dynamically normalized set where every root word is collapsed to 1 consecutive character max.
 */
export const COMMON_SFX_ROOTS: ReadonlySet<string> = new Set(
  Array.from(COMMON_SFX_ROOTS_RAW).map((word) => normalizeSfxWord(word))
);

/**
 * Checks if a string consists of repeated identical or nearly identical word tokens (e.g. "GRAB GRAB", "MURMUR MURMUR", "CLAP CLAP").
 */
export function isRepeatedTokenSfx(text: string): boolean {
  if (!text) return false;
  const raw = text.trim().toLowerCase().replace(/[^\w\s]/g, '');
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 4) {
    const norm0 = normalizeSfxWord(tokens[0]);
    if (norm0 && COMMON_SFX_ROOTS.has(norm0)) {
      const allMatch = tokens.every((t) => normalizeSfxWord(t) === norm0);
      if (allMatch) return true;
    }
  }
  return false;
}

/**
 * Accurately determines if text is an external website watermark, domain link, or scanlation team credit.
 */
export function isActualWatermarkText(text: string): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return (
    /https?:\/\/|discord\.(?:gg|com)|patreon\.com|t\.me\/|twitter\.com/i.test(t) ||
    /(?:^|\s)(?:mangadex|asurascans|flamecomics|reaperscans|bato\.to|realmscans|luminousscans)\b/i.test(t) ||
    /\bwatermark\b/i.test(t) ||
    /(?:^|\s)join\s+our\s+discord/i.test(t) ||
    /(?:^|\s)(?:typesetter|cleaner|redrawer|raw\s+provider)\s*:/i.test(t) ||
    /\b(?:www\.[a-z0-9-]+\.[a-z]{2,}|[a-z0-9-]+\.(?:com|org|net|gg|io|cc|to))\b/i.test(t)
  );
}

export interface ClassificationResult {
  classification: TextClassification;
  isStoryRelevant: boolean;
  reason: string;
}

/**
 * Classifies OCR text into story-relevant categories (dialogue, narration, thought)
 * vs non-story categories (sound effects, background text, watermarks, uncertain).
 */
export function classifyTextContent(
  rawText: string,
  declaredType?: BlockType,
  speaker?: string
): ClassificationResult {
  if (!rawText || !rawText.trim()) {
    return { classification: 'uncertain', isStoryRelevant: false, reason: 'Empty text' };
  }

  const trimmed = rawText.trim();

  // 1. Watermark / Domain / Scanlation team detection
  if (isActualWatermarkText(trimmed)) {
    return { classification: 'watermark', isStoryRelevant: false, reason: 'External website/credit watermark' };
  }

  // 2. Action notation / asterisks / tildes: * BANG *, ~ Tremble ~, * SHHHH... *, [SFX]
  if (/^\*[\s\S]+\*$/.test(trimmed) || /^~[\s\S]+~$/.test(trimmed) || /^[«‹][\s\S]+[»›]$/.test(trimmed)) {
    return { classification: 'sfx', isStoryRelevant: false, reason: 'Enclosed in action symbols' };
  }
  if (/^\[sfx\]/i.test(trimmed) || /^sfx\s*:/i.test(trimmed)) {
    return { classification: 'sfx', isStoryRelevant: false, reason: 'Explicit SFX prefix' };
  }

  // 3. Repeated word patterns: "GRAB GRAB", "MURMUR MURMUR", "CLAP CLAP", "TAP TAP"
  if (isRepeatedTokenSfx(trimmed)) {
    return { classification: 'sfx', isStoryRelevant: false, reason: 'Repeated sound effect tokens' };
  }

  // 4. Token & Sentence Structure Analysis
  const contentOnly = speaker ? stripSpeakerPrefix(trimmed, speaker) : stripSpeakerPrefix(trimmed);
  const cleanWords = contentOnly.replace(/[^\w\s'-]/g, ' ').trim().split(/\s+/).filter(Boolean);

  // Check if content is a single standalone SFX word (e.g. "TREMBLE", "SHHHH...", "HMMMM...", "CLAP", "WHOOSH", "BANG", "THUD", "SIGH", "GASP")
  if (cleanWords.length <= 2) {
    const singleNorm = normalizeSfxWord(cleanWords.join(''));
    if (COMMON_SFX_ROOTS.has(singleNorm)) {
      return { classification: 'sfx', isStoryRelevant: false, reason: `Isolated SFX token: ${singleNorm}` };
    }
    if (cleanWords.length === 1 && COMMON_SFX_ROOTS.has(normalizeSfxWord(cleanWords[0]))) {
      return { classification: 'sfx', isStoryRelevant: false, reason: `Matches SFX root: ${cleanWords[0]}` };
    }
  }

  // 5. Explicit BlockType Override from OCR Vision Model
  if (declaredType === 'sfx') {
    return { classification: 'sfx', isStoryRelevant: false, reason: 'Flagged as SFX by vision model' };
  }
  if (declaredType === 'background') {
    return { classification: 'background', isStoryRelevant: false, reason: 'Background environmental sign' };
  }
  if (declaredType === 'watermark') {
    return { classification: 'watermark', isStoryRelevant: false, reason: 'Watermark flag' };
  }
  if (declaredType === 'thought' || /^\[thought\]/i.test(trimmed) || /^\(thought\)/i.test(trimmed)) {
    return { classification: 'thought', isStoryRelevant: true, reason: 'Character thought/internal monologue' };
  }
  if (declaredType === 'narration' || /^\[narration\]/i.test(trimmed) || /^\[caption\]/i.test(trimmed)) {
    return { classification: 'narration', isStoryRelevant: true, reason: 'Story narration/caption' };
  }

  // 6. Dialogue & Story-Relevant Heuristics:
  const isQuoted = /^["'“‘「].+["'”’」]$/.test(contentOnly.trim());
  const hasDialoguePunctuation = /[?!.,:;]/.test(contentOnly);
  const hasSentenceWords = cleanWords.length >= 3;

  if (isQuoted || (hasSentenceWords && hasDialoguePunctuation) || (speaker && cleanWords.length >= 1)) {
    return { classification: 'dialogue', isStoryRelevant: true, reason: 'Spoken dialogue/conversation' };
  }

  // If text is 3+ words, treat as story dialogue/narration
  if (cleanWords.length >= 3) {
    return { classification: 'dialogue', isStoryRelevant: true, reason: 'Multi-word story dialogue' };
  }

  // Conservative handling of isolated 1-2 words without speaker/punctuation
  if (cleanWords.length <= 2 && /^[A-Z0-9\s!.]+$/.test(trimmed)) {
    const single = normalizeSfxWord(cleanWords[0] || '');
    if (COMMON_SFX_ROOTS.has(single)) {
      return { classification: 'sfx', isStoryRelevant: false, reason: 'All-caps isolated sound effect' };
    }
  }

  // Default to dialogue for genuine story text
  return { classification: 'dialogue', isStoryRelevant: true, reason: 'Standard story text' };
}

/**
 * Evaluates whether a text block is story-relevant and should be read aloud by TTS.
 * Strictly skips sound effects, background noise, watermarks, and non-story text.
 */
export function isStoryRelevantForTTS(
  block: TextBlock | string,
  blockType?: BlockType,
  speaker?: string
): boolean {
  if (typeof block === 'string') {
    return classifyTextContent(block, blockType, speaker).isStoryRelevant;
  }
  return classifyTextContent(block.text, block.type || blockType, block.speaker || speaker).isStoryRelevant;
}

/**
 * Backwards-compatible check: determines if text is a sound effect, SFX, or non-box action noise.
 */
export function isSoundEffectOrActionNoise(text: string): boolean {
  if (!text) return false;
  return !isStoryRelevantForTTS(text);
}

/**
 * Calculates smooth distance-adaptive scroll duration and visual comprehension dwell time
 * dynamically based on the pixel distance to be traveled and the variable scroll velocity multiplier.
 * Prevents rapid jumping across large text-free artwork zones in manhwa webtoons.
 */
export function calculateAdaptiveScrollDuration(
  distance: number,
  speedModeOrVelocity: ScrollSpeedMode | number = 'normal',
  velocityMultiplier: number = 1.0,
  wordCount: number = 0
): { durationMs: number; visualDwellMs: number; effectivePxPerSec: number } {
  const absDist = Math.abs(distance);

  let basePxPerSec = 350;
  let multiplier = typeof speedModeOrVelocity === 'number' ? speedModeOrVelocity : velocityMultiplier;

  if (typeof speedModeOrVelocity === 'string') {
    basePxPerSec = SCROLL_SPEED_PIXELS_PER_SEC[speedModeOrVelocity] || 350;
  }

  // Ensure multiplier is clamped to valid positive range (0.2x to 4.0x)
  const safeMultiplier = Math.max(0.2, Math.min(4.0, multiplier || 1.0));

  // Continuous, adaptive speed profile:
  // - For text-heavy zones (high wordCount), decelerate significantly (down to 0.45x) so text slides in slowly & remains comfortable to read.
  // - For long image-only gaps (low wordCount & high distance), accelerate slightly (up to 1.35x) to sweep visual regions cleanly.
  let adaptiveFactor = 1.0;
  if (wordCount > 0) {
    if (wordCount > 15) {
      adaptiveFactor = Math.max(0.45, 1.0 - (wordCount - 15) * 0.02);
    } else if (absDist > 500 && wordCount < 5) {
      adaptiveFactor = Math.min(1.35, 1.0 + (absDist - 500) * 0.0007);
    }
  }

  const effectivePxPerSec = Math.round(basePxPerSec * safeMultiplier * adaptiveFactor);

  // Linear travel time based on distance (ms)
  const travelMs = (absDist / effectivePxPerSec) * 1000;

  // Scaled minimum and maximum duration limits based on velocity
  const minDurationMs = Math.max(250, Math.round(700 / (safeMultiplier * adaptiveFactor)));
  const maxDurationMs = Math.max(minDurationMs, Math.round(8000 / (safeMultiplier * adaptiveFactor)));
  const durationMs = Math.max(minDurationMs, Math.min(maxDurationMs, Math.round(travelMs)));

  // Visual Dwell Time: Extra time given to the user to visually digest artwork
  // when traversing larger text-free artwork zones before the voice/focus begins
  let visualDwellMs = 250;
  if (absDist > 600) {
    visualDwellMs = 1200;
  } else if (absDist > 300) {
    visualDwellMs = 700;
  } else if (absDist > 100) {
    visualDwellMs = 400;
  }

  // Scale dwell time inversely by velocity multiplier and adaptiveFactor
  visualDwellMs = Math.round(visualDwellMs / (safeMultiplier * adaptiveFactor));

  return { durationMs, visualDwellMs, effectivePxPerSec };
}

export interface PageScrollBounds {
  startScroll: number;
  endScroll: number;
  isLongPage: boolean;
  scrollDistance: number;
}

/**
 * Retrieves the true rendered height of a comic page element, inspecting the internal image
 * natural dimensions and bounding box to ensure robust calculation during lazy loading or async layout.
 */
export function getPageRenderedHeight(pageEl: HTMLElement | null): number {
  if (!pageEl) return 1000;
  const imgEl = pageEl.querySelector('img');
  if (imgEl) {
    const rectHeight = imgEl.getBoundingClientRect().height;
    if (rectHeight > 10) return Math.round(rectHeight);
    if (imgEl.naturalHeight > 0 && imgEl.naturalWidth > 0 && imgEl.clientWidth > 0) {
      return Math.round((imgEl.naturalHeight / imgEl.naturalWidth) * imgEl.clientWidth);
    }
  }
  return Math.max(10, pageEl.offsetHeight || 1000);
}

export interface PageGeometry {
  pageTop: number;
  pageHeight: number;
  imageTop: number;
  imageHeight: number;
  imageWidth: number;
}

/**
 * Canonical page geometry extractor: directly queries the browser DOM for the actual
 * position and rendered dimensions of the page and its image within the scroll container.
 * Eliminates all manual assumptions, gap guesses, or cumulative height summation.
 */
export function getPageGeometry(
  container: HTMLElement,
  pageEl: HTMLElement
): PageGeometry {
  const containerRect = typeof container.getBoundingClientRect === 'function'
    ? container.getBoundingClientRect()
    : { top: 0, height: container.clientHeight || 1000, width: container.clientWidth || 800 };

  const pageRect = typeof pageEl.getBoundingClientRect === 'function'
    ? pageEl.getBoundingClientRect()
    : { top: 0, height: pageEl.clientHeight || 1000, width: pageEl.clientWidth || 800 };

  const scrollTop = container.scrollTop || 0;
  const pageTop = pageRect.top - containerRect.top + scrollTop;
  const pageHeight = Math.max(1, pageRect.height || pageEl.clientHeight || 1000);

  const imgEl = typeof pageEl.querySelector === 'function' ? pageEl.querySelector('img') : null;
  if (!imgEl) {
    return {
      pageTop,
      pageHeight,
      imageTop: pageTop,
      imageHeight: pageHeight,
      imageWidth: pageRect.width || 800,
    };
  }

  const imgRect = typeof imgEl.getBoundingClientRect === 'function'
    ? imgEl.getBoundingClientRect()
    : { top: pageRect.top, height: pageHeight, width: pageRect.width };

  const imgHeight = Math.max(1, imgRect.height || imgEl.clientHeight || pageHeight);
  const imgWidth = Math.max(1, imgRect.width || imgEl.clientWidth || pageRect.width);

  const geometry: PageGeometry = {
    pageTop,
    pageHeight,
    imageTop: imgRect.top - containerRect.top + scrollTop,
    imageHeight: imgHeight,
    imageWidth: imgWidth,
  };

  if (typeof window !== 'undefined' && (window as any).__DEV_GEOMETRY_LOGGING__ !== false) {
    console.log('[GEOMETRY DEBUG]', {
      container,
      pageEl,
      scrollTop: container.scrollTop,
      pageRect,
      containerRect,
      imgRect,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      offsetParent: (pageEl as HTMLElement).offsetParent,
      pageParent: pageEl.parentElement,
      calculatedPageTop: geometry.pageTop,
      calculatedImageTop: geometry.imageTop,
      imageHeight: geometry.imageHeight,
    });
  }

  return geometry;
}

/**
 * Calculates vertical scroll bounds for single-page and continuous-scroll readers.
 * Determines if a page is taller than the viewport ("long page") requiring auto-scroll.
 * Uses exact DOM bounding geometry without guessing cumulative heights or gaps.
 */
export function getPageScrollBounds(
  container: HTMLElement | null,
  pageIndex: number,
  isContinuous: boolean
): PageScrollBounds {
  if (!container) {
    return { startScroll: 0, endScroll: 0, isLongPage: false, scrollDistance: 0 };
  }

  const containerHeight = Math.round(container.clientHeight);

  if (!isContinuous) {
    const maxScroll = Math.max(0, container.scrollHeight - containerHeight);
    return {
      startScroll: 0,
      endScroll: maxScroll,
      isLongPage: maxScroll > 25,
      scrollDistance: maxScroll,
    };
  }

  const pageEl = document.getElementById(`scroll-page-${pageIndex}`);
  if (!pageEl) {
    return {
      startScroll: container.scrollTop,
      endScroll: container.scrollTop,
      isLongPage: false,
      scrollDistance: 0,
    };
  }

  const geometry = getPageGeometry(container, pageEl);
  const startScroll = Math.max(0, Math.round(geometry.pageTop));
  const pageHeight = geometry.pageHeight;
  const endScroll = Math.max(startScroll, Math.round(geometry.pageTop + pageHeight - containerHeight));
  const isLongPage = pageHeight > containerHeight + 25;

  return {
    startScroll,
    endScroll,
    isLongPage,
    scrollDistance: Math.max(0, endScroll - startScroll),
  };
}

/**
 * Calculates the ideal scroll position to bring a specific TextBlock into clear,
 * comfortable view (upper-middle of reader container with padding for art & context).
 * Maps text box coordinates strictly against the rendered image dimensions and DOM position.
 */
export function getBlockTargetScroll(
  container: HTMLElement | null,
  pageIndex: number,
  block: TextBlock,
  blockIndex: number,
  totalBlocks: number,
  isContinuous: boolean
): number {
  if (!container) return 0;

  const pageEl = isContinuous
    ? document.getElementById(`scroll-page-${pageIndex}`)
    : (document.getElementById(`scroll-page-${pageIndex}`) || document.querySelector('.relative.w-full') as HTMLElement | null);

  const containerHeight = Math.round(container.clientHeight);
  const maxScroll = Math.max(0, container.scrollHeight - containerHeight);

  if (!pageEl) {
    return Math.max(0, Math.min(maxScroll, container.scrollTop));
  }

  const geometry = getPageGeometry(container, pageEl);

  let blockCenterY: number;
  if (block.box_2d && block.box_2d.length === 4) {
    const [ymin, , ymax] = block.box_2d;
    // Strictly scale relative to rendered image height, offset from true image top in container
    blockCenterY = geometry.imageTop + (((ymin + ymax) / 2) / 1000) * geometry.imageHeight;
  } else if (typeof block.yPercent === 'number') {
    blockCenterY = geometry.imageTop + (block.yPercent / 100) * geometry.imageHeight;
  } else {
    const ratio = totalBlocks > 1 ? 0.12 + (blockIndex / (totalBlocks - 1)) * 0.76 : 0.4;
    blockCenterY = geometry.imageTop + ratio * geometry.imageHeight;
  }

  // Positioning the block comfortably around upper-middle reading area (35% from viewport top)
  const target = blockCenterY - containerHeight * 0.35;
  const clampedTarget = Math.max(0, Math.min(maxScroll, Math.round(target)));

  if (typeof window !== 'undefined' && (window as any).__DEV_SCROLL_LOGGING__ !== false) {
    console.log('[SCROLL DEBUG]', {
      box_2d: block.box_2d,
      yPercent: block.yPercent,
      imageTop: geometry.imageTop,
      imageHeight: geometry.imageHeight,
      blockCenterY,
      targetScroll: target,
      clampedTarget,
      actualScrollTop: container.scrollTop,
      containerHeight,
      scrollHeight: container.scrollHeight,
      maxScroll,
    });
  }

  return clampedTarget;
}

/**
 * Extracts visible dialogue and narrative blocks ordered strictly by readingOrder.
 * Safeguards top dialogue and narrative boxes from being accidentally omitted by AI watermark flags,
 * and filters out all sound effects (SFX), atmospheric background noises, and non-story text from TTS.
 */
export function getVisiblePageBlocks(page: ComicPage | undefined, includeSpeaker = false): TextBlock[] {
  if (!page) return [];

  if (page.blocks && page.blocks.length > 0) {
    const visibleBlocks = page.blocks
      .filter((b) => {
        if (!b.text || !b.text.trim()) return false;
        
        // Use our robust text classification to verify if the block contains story-relevant dialogue, narration, or thoughts
        if (!isStoryRelevantForTTS(b, b.type, b.speaker)) return false;

        // Extra safeguard: exclude blatant watermark domains even if model didn't set flag
        if (isActualWatermarkText(b.text)) return false;

        return true;
      })
      .sort((a, b) => (a.readingOrder ?? 0) - (b.readingOrder ?? 0));

    if (visibleBlocks.length > 0) {
      return visibleBlocks;
    }
  }

  if (page.fullText && page.fullText.trim().length > 0) {
    const lines = page.fullText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && isStoryRelevantForTTS(l));

    const cleanedLines = includeSpeaker
      ? lines
      : lines.map((l) => stripSpeakerPrefix(l));

    return cleanedLines.map((line, idx) => ({
      id: `fulltext-fallback-${idx}`,
      readingOrder: idx + 1,
      type: 'dialogue',
      text: line,
    }));
  }

  return [];
}

/**
 * Extracts ONLY text actually visible on the page (dialogues, speech bubbles, narrations).
 * Explicitly excludes page summaries, translations, or artwork descriptions.
 * If includeSpeaker is false, strips speaker tags (e.g. "Hero: ") for pure dialogue immersion.
 */
export function getVisiblePageText(page: ComicPage | undefined, includeSpeaker = false): string {
  const blocks = getVisiblePageBlocks(page, includeSpeaker);
  if (blocks.length > 0) {
    return blocks
      .map((b) => {
        if (includeSpeaker && b.speaker && b.speaker.trim() && b.speaker.toLowerCase() !== 'narrator') {
          const stripped = stripSpeakerPrefix(b.text.trim(), b.speaker);
          return `${b.speaker}: ${stripped}`;
        }
        return stripSpeakerPrefix(b.text.trim(), b.speaker);
      })
      .join('\n');
  }
  return '';
}

/**
 * Selects the best browser natural voice, specifically looking for
 * "Microsoft Ava Multilingual Online (Natural) - English (United States)" or standard Natural voices.
 */
export function findDefaultNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // 1. Look for Microsoft Ava Natural / Online
  const avaVoice = voices.find((v) => {
    const name = v.name.toLowerCase();
    return name.includes('ava') && (name.includes('natural') || name.includes('online'));
  });
  if (avaVoice) return avaVoice;

  // 2. Any voice with Ava in the name
  const anyAva = voices.find((v) => v.name.toLowerCase().includes('ava'));
  if (anyAva) return anyAva;

  // 3. Microsoft Natural English voice (e.g. Jenny, Guy, Aria)
  const msNatural = voices.find((v) => {
    const name = v.name.toLowerCase();
    return (
      (name.includes('microsoft') || name.includes('online')) &&
      name.includes('natural') &&
      (v.lang.startsWith('en') || v.lang === '')
    );
  });
  if (msNatural) return msNatural;

  // 4. Any voice with "Natural" and English
  const anyNatural = voices.find((v) => {
    const name = v.name.toLowerCase();
    return name.includes('natural') && v.lang.startsWith('en');
  });
  if (anyNatural) return anyNatural;

  // 5. Google US English
  const googleEn = voices.find((v) => v.name.includes('Google') && v.lang.startsWith('en'));
  if (googleEn) return googleEn;

  // 6. Any English voice
  const anyEn = voices.find((v) => v.lang.startsWith('en'));
  if (anyEn) return anyEn;

  // 7. Browser default voice or first available
  return voices.find((v) => v.default) || voices[0] || null;
}

export interface BlockOrchestrationDecision {
  action: 'smart-scroll-next-block' | 'auto-forward-next-page';
  nextBlockIndex: number | null;
  hasMoreBlocks: boolean;
}

/**
 * Pure evaluation function for block-by-block Smart Scroll orchestration.
 * When a block finishes:
 * - Checks if more blocks remain on the same page.
 * - If yes, returns 'smart-scroll-next-block' with nextBlockIndex.
 * - If no, returns 'auto-forward-next-page' to proceed with auto-forwarding to the next page.
 */
export function evaluateBlockProgression(
  currentBlockIndex: number,
  totalBlocks: number
): BlockOrchestrationDecision {
  const nextIndex = currentBlockIndex + 1;
  const hasMoreBlocks = nextIndex < totalBlocks;
  return {
    action: hasMoreBlocks ? 'smart-scroll-next-block' : 'auto-forward-next-page',
    nextBlockIndex: hasMoreBlocks ? nextIndex : null,
    hasMoreBlocks,
  };
}

/**
 * Determines the next page index that requires OCR text extraction.
 * Strictly operates in forward reading order from currentIndex to the end of the chapter:
 * 1. Current page (if not completed and not excluded)
 * 2. Next pages in forward direction from currentIndex + 1 to pages.length - 1
 * If starting from the middle of a chapter, only extracts from that page forward to the end.
 * If the user wants to read/listen to previous pages, they navigate to that page and resume from there.
 * Returns null if all pages from currentIndex to the end are already completed.
 */
export function findNextUnextractedPageIndex(
  pages: Array<{ status: string; isExcluded?: boolean; isExtraPage?: boolean }>,
  currentIndex: number,
  inFlightIndices?: Set<number>
): number | null {
  const total = pages.length;
  if (total === 0) return null;

  // 1. Current page if unextracted and not already in flight
  if (
    currentIndex >= 0 &&
    currentIndex < total &&
    pages[currentIndex]?.status !== 'completed' &&
    !pages[currentIndex]?.isExcluded &&
    !pages[currentIndex]?.isExtraPage &&
    (!inFlightIndices || !inFlightIndices.has(currentIndex))
  ) {
    return currentIndex;
  }

  // 2. Search forward strictly from currentIndex + 1 to end of chapter
  for (let i = currentIndex + 1; i < total; i++) {
    const p = pages[i];
    if (
      p &&
      p.status !== 'completed' &&
      !p.isExcluded &&
      !p.isExtraPage &&
      (!inFlightIndices || !inFlightIndices.has(i))
    ) {
      return i;
    }
  }

  return null;
}

export interface UseFullscreenTTSNarratorOptions {
  isFullscreen: boolean;
  currentPageIndex: number;
  pages: ComicPage[];
  onPageChange: (nextIndex: number) => void;
  onExtractPage?: (pageIndex: number) => Promise<boolean>;
  defaultPauseSeconds?: number;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  isContinuousScroll?: boolean;
  isProgrammaticScrollRef?: React.MutableRefObject<boolean>;
  includeSpeaker?: boolean;
  onToggleIncludeSpeaker?: (include: boolean) => void;
}

export type TTSPipelineStatus =
  | 'idle'
  | 'extracting-current'
  | 'reading'
  | 'waiting-for-next'
  | 'advancing'
  | 'completed'
  | 'error';

export interface UseFullscreenTTSNarratorReturn {
  // TTS State
  isTTSActive: boolean;
  toggleTTS: () => void;
  stopTTS: () => void;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  setSelectedVoice: (voice: SpeechSynthesisVoice) => void;
  speechRate: number;
  setSpeechRate: (rate: number) => void;

  // Auto-Forward State
  isAutoForwardActive: boolean;
  toggleAutoForward: () => void;
  setIsAutoForwardActive: (active: boolean) => void;
  pauseSeconds: number;
  setPauseSeconds: (seconds: number) => void;
  secondsRemaining: number;
  progressPercent: number;
  resetTimer: () => void;

  // Smart Scroll State
  isSmartScrollEnabled: boolean;
  toggleSmartScroll: () => void;
  setIsSmartScrollEnabled: (enabled: boolean) => void;
  currentBlockIndex: number | null;
  totalBlocks: number;
  goToNextBlock?: () => void;
  goToPreviousBlock?: () => void;

  // Speaker Name in TTS State
  includeSpeaker: boolean;
  setIncludeSpeaker: (include: boolean) => void;
  toggleIncludeSpeaker: () => void;

  // Top-to-Bottom Scroll Speed State
  scrollSpeedMode: ScrollSpeedMode;
  setScrollSpeedMode: (mode: ScrollSpeedMode) => void;
  scrollVelocityMultiplier: number;
  setScrollVelocityMultiplier: (multiplier: number) => void;

  // Pipeline & Status
  pipelineStatus: TTSPipelineStatus;
  statusMessage: string;
  currentSpeakingText: string;
  isExtractingNextPage: boolean;
  nextExtractingIndex: number | null;
}

/**
 * Unified Reader TTS + Smart Scroll + Auto-Forward Controller.
 *
 * Smart Scroll capabilities:
 * - When reading a long image, automatically scrolls down to the next text block in reading order.
 * - Reads dialogue block-by-block with high-quality natural TTS.
 * - Only advances to the next page once ALL text blocks on the current image have been read aloud
 *   AND the bottom of the page has been viewed AND the next page extraction is completed.
 */
export function useFullscreenTTSNarrator({
  isFullscreen,
  currentPageIndex,
  pages,
  onPageChange,
  onExtractPage,
  defaultPauseSeconds = DEFAULT_PAUSE_SECONDS,
  scrollContainerRef,
  isContinuousScroll = false,
  isProgrammaticScrollRef,
  includeSpeaker: initialIncludeSpeaker,
  onToggleIncludeSpeaker,
}: UseFullscreenTTSNarratorOptions): UseFullscreenTTSNarratorReturn {
  // TTS State
  const [isTTSActive, setIsTTSActiveState] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<TTSPipelineStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [currentSpeakingText, setCurrentSpeakingText] = useState<string>('');

  // Smart Scroll State
  const [isSmartScrollEnabled, setIsSmartScrollEnabledState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SMART_SCROLL);
        if (saved !== null) {
          return saved === 'true';
        }
      } catch {
        // Ignore read error
      }
    }
    return true; // Smart Scroll enabled by default
  });
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number | null>(null);
  const currentBlockIndexRef = useRef<number | null>(null);
  const [totalBlocks, setTotalBlocks] = useState<number>(0);
  const totalBlocksRef = useRef<number>(0);
  const lastPageIndexRef = useRef<number>(currentPageIndex);

  const updateCurrentBlockIndex = useCallback((idx: number | null) => {
    currentBlockIndexRef.current = idx;
    setCurrentBlockIndex(idx);
  }, []);

  // Auto-Forward State
  const [isAutoForwardActive, setIsAutoForwardActiveState] = useState<boolean>(false);
  const [pauseSeconds, setPauseSecondsState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_PAUSE);
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= MIN_PAUSE_SECONDS) {
            return Math.min(parsed, MAX_PAUSE_SECONDS);
          }
        }
      } catch {
        // Ignore read error
      }
    }
    return defaultPauseSeconds;
  });
  const [secondsRemaining, setSecondsRemaining] = useState<number>(pauseSeconds);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Background Extraction State
  const [isExtractingNextPage, setIsExtractingNextPage] = useState<boolean>(false);
  const [nextExtractingIndex, setNextExtractingIndex] = useState<number | null>(null);

  // Web Speech Voices State
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoiceState] = useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRateState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SPEECH_RATE);
        if (saved) {
          const val = parseFloat(saved);
          if (!isNaN(val) && val >= 0.25 && val <= 4.0) return val;
        }
      } catch {
        // Fallback to default
      }
    }
    return DEFAULT_SPEECH_RATE;
  });

  // Speaker Name Inclusion in TTS State (Default false: pure dialogue without character names)
  const [includeSpeaker, setIncludeSpeakerState] = useState<boolean>(() => {
    if (typeof initialIncludeSpeaker === 'boolean') {
      return initialIncludeSpeaker;
    }
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_INCLUDE_SPEAKER);
        if (saved !== null) {
          return saved === 'true';
        }
      } catch {
        // Fallback to default false
      }
    }
    return false;
  });
  const includeSpeakerRef = useRef<boolean>(includeSpeaker);
  includeSpeakerRef.current = includeSpeaker;

  const onToggleIncludeSpeakerRef = useRef(onToggleIncludeSpeaker);
  useEffect(() => {
    onToggleIncludeSpeakerRef.current = onToggleIncludeSpeaker;
  }, [onToggleIncludeSpeaker]);

  // Keep synchronized if parent settings change
  useEffect(() => {
    if (typeof initialIncludeSpeaker === 'boolean') {
      includeSpeakerRef.current = initialIncludeSpeaker;
      setIncludeSpeakerState(initialIncludeSpeaker);
    }
  }, [initialIncludeSpeaker]);

  const setIncludeSpeaker = useCallback((include: boolean) => {
    includeSpeakerRef.current = include;
    setIncludeSpeakerState(include);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_INCLUDE_SPEAKER, include ? 'true' : 'false');
      }
    } catch {
      // Ignore write error
    }
    if (onToggleIncludeSpeakerRef.current) {
      onToggleIncludeSpeakerRef.current(include);
    }
  }, []);

  const toggleIncludeSpeaker = useCallback(() => {
    setIncludeSpeaker(!includeSpeakerRef.current);
  }, [setIncludeSpeaker]);

  // Top-to-Bottom Scroll Speed State
  const [scrollSpeedMode, setScrollSpeedModeState] = useState<ScrollSpeedMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SCROLL_SPEED_MODE) as ScrollSpeedMode;
        if (saved === 'slow' || saved === 'normal' || saved === 'fast') return saved;
      } catch {}
    }
    return 'normal';
  });
  const scrollSpeedModeRef = useRef<ScrollSpeedMode>(scrollSpeedMode);
  scrollSpeedModeRef.current = scrollSpeedMode;

  const setScrollSpeedMode = useCallback((mode: ScrollSpeedMode) => {
    setScrollSpeedModeState(mode);
    scrollSpeedModeRef.current = mode;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_SCROLL_SPEED_MODE, mode);
      } catch {}
    }
  }, []);

  // Variable Scroll Velocity Multiplier State (e.g. 0.5x, 1.0x, 1.5x, 2.0x)
  const [scrollVelocityMultiplier, setScrollVelocityMultiplierState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SCROLL_VELOCITY);
        if (saved !== null) {
          const val = parseFloat(saved);
          if (!isNaN(val) && val >= MIN_SCROLL_VELOCITY && val <= MAX_SCROLL_VELOCITY) {
            return val;
          }
        }
      } catch {}
    }
    return DEFAULT_SCROLL_VELOCITY;
  });
  const scrollVelocityMultiplierRef = useRef<number>(scrollVelocityMultiplier);
  scrollVelocityMultiplierRef.current = scrollVelocityMultiplier;

  const setScrollVelocityMultiplier = useCallback((velocity: number) => {
    const clamped = Math.max(MIN_SCROLL_VELOCITY, Math.min(MAX_SCROLL_VELOCITY, Math.round(velocity * 100) / 100));
    setScrollVelocityMultiplierState(clamped);
    scrollVelocityMultiplierRef.current = clamped;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_SCROLL_VELOCITY, clamped.toString());
      } catch {}
    }
  }, []);

  // Keep live references to state and props to avoid stale closures in callbacks
  const isFullscreenRef = useRef(isFullscreen);
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const currentPageIndexRef = useRef(currentPageIndex);
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const onExtractPageRef = useRef(onExtractPage);
  useEffect(() => {
    onExtractPageRef.current = onExtractPage;
  }, [onExtractPage]);

  const isTTSActiveRef = useRef(isTTSActive);
  useEffect(() => {
    isTTSActiveRef.current = isTTSActive;
  }, [isTTSActive]);

  const isSmartScrollEnabledRef = useRef(isSmartScrollEnabled);
  useEffect(() => {
    isSmartScrollEnabledRef.current = isSmartScrollEnabled;
  }, [isSmartScrollEnabled]);

  const isAutoForwardActiveRef = useRef(isAutoForwardActive);
  useEffect(() => {
    isAutoForwardActiveRef.current = isAutoForwardActive;
  }, [isAutoForwardActive]);

  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  const speechRateRef = useRef(speechRate);
  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  const pauseSecondsRef = useRef(pauseSeconds);
  useEffect(() => {
    pauseSecondsRef.current = pauseSeconds;
  }, [pauseSeconds]);

  const scrollContainerRefLive = useRef(scrollContainerRef);
  useEffect(() => {
    scrollContainerRefLive.current = scrollContainerRef;
  }, [scrollContainerRef]);

  const isContinuousScrollRef = useRef(isContinuousScroll);
  useEffect(() => {
    isContinuousScrollRef.current = isContinuousScroll;
  }, [isContinuousScroll]);

  const localProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollRef = isProgrammaticScrollRef || localProgrammaticScrollRef;

  // Track active utterances, in-flight extractions, auto-scrolling, and gate conditions
  const playBlockAtIndexRef = useRef<((idx: number) => Promise<void>) | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const inFlightExtractionsRef = useRef<Map<number, Promise<boolean>>>(new Map());
  const isContinuousConvertingRef = useRef<boolean>(false);
  const continuousConversionRunIdRef = useRef<number>(0);
  const activePipelineRunIdRef = useRef<number>(0);
  const isCurrentTTSFinishedRef = useRef<boolean>(false);
  const isNextPageExtractionFinishedRef = useRef<boolean>(false);
  const isCurrentPageScrolledToBottomRef = useRef<boolean>(false);
  const autoScrollRafIdRef = useRef<number | null>(null);
  const autoScrollTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const isUserInteractingRef = useRef<boolean>(false);
  const userInteractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimerStartRef = useRef<number | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const preBufferedUtterancesRef = useRef<Map<string, SpeechSynthesisUtterance>>(new Map());

  // =========================================================================
  // Robust Voice Loading (Addressing Chromium & Safari delayed voice loading)
  // =========================================================================
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    let pollCount = 0;
    const syncVoices = () => {
      const avail = window.speechSynthesis.getVoices();
      if (avail && avail.length > 0) {
        // Deduplicate voices by voiceURI / name to prevent any duplicate keys or select options
        const uniqueAvail: SpeechSynthesisVoice[] = [];
        const seenKeys = new Set<string>();
        for (const v of avail) {
          const key = `${v.voiceURI || v.name}-${v.lang}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueAvail.push(v);
          }
        }
        setVoices(uniqueAvail);
        setSelectedVoiceState((prev) => {
          if (prev) {
            const match = uniqueAvail.find((v) => v.voiceURI === prev.voiceURI);
            if (match) return match;
          }
          try {
            const savedUri = localStorage.getItem(STORAGE_KEY_VOICE_URI);
            if (savedUri) {
              const savedMatch = uniqueAvail.find((v) => v.voiceURI === savedUri);
              if (savedMatch) return savedMatch;
            }
          } catch {
            // Ignore storage read error
          }
          return findDefaultNaturalVoice(uniqueAvail);
        });
      }
    };

    syncVoices();

    window.speechSynthesis.onvoiceschanged = syncVoices;
    if (window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', syncVoices);
    }

    const pollInterval = setInterval(() => {
      pollCount++;
      syncVoices();
      if (pollCount >= 15) {
        clearInterval(pollInterval);
      }
    }, 200);

    return () => {
      clearInterval(pollInterval);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
        if (window.speechSynthesis.removeEventListener) {
          window.speechSynthesis.removeEventListener('voiceschanged', syncVoices);
        }
      }
    };
  }, []);

  const setSelectedVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setSelectedVoiceState(voice);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_VOICE_URI, voice.voiceURI);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const setSpeechRate = useCallback((rate: number) => {
    const clamped = Math.max(0.25, Math.min(4.0, rate));
    setSpeechRateState(clamped);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SPEECH_RATE, clamped.toString());
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const setPauseSeconds = useCallback((rawSeconds: number) => {
    const valid = Math.max(
      MIN_PAUSE_SECONDS,
      Math.min(MAX_PAUSE_SECONDS, Math.round(rawSeconds * 10) / 10)
    );
    setPauseSecondsState(valid);
    pauseSecondsRef.current = valid;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_PAUSE, valid.toString());
      }
    } catch {
      // Ignore storage error
    }
    if (pauseTimerStartRef.current !== null) {
      pauseTimerStartRef.current = Date.now();
      setSecondsRemaining(valid);
      setProgressPercent(0);
    }
  }, []);

  const setIsSmartScrollEnabled = useCallback((enabled: boolean) => {
    setIsSmartScrollEnabledState(enabled);
    isSmartScrollEnabledRef.current = enabled;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SMART_SCROLL, enabled ? 'true' : 'false');
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const toggleSmartScroll = useCallback(() => {
    setIsSmartScrollEnabled(!isSmartScrollEnabledRef.current);
  }, [setIsSmartScrollEnabled]);

  // Cancel any running animation frames and timeouts
  const cancelAutoScroll = useCallback(() => {
    if (autoScrollRafIdRef.current !== null) {
      cancelAnimationFrame(autoScrollRafIdRef.current);
      autoScrollRafIdRef.current = null;
    }
    if (autoScrollTimeoutIdRef.current !== null) {
      clearTimeout(autoScrollTimeoutIdRef.current);
      autoScrollTimeoutIdRef.current = null;
    }
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
    }
  }, [programmaticScrollRef]);

  // Cancel any active speech synthesis and auto-scroll
  const cancelSpeech = useCallback(() => {
    cancelAutoScroll();
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    if (typeof window !== 'undefined') {
      try {
        delete (window as unknown as { __activeTTSUtterance?: SpeechSynthesisUtterance }).__activeTTSUtterance;
      } catch {
        // Ignore delete error
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {
          console.warn('speechSynthesis cancel warning:', e);
        }
      }
    }
    currentUtteranceRef.current = null;
  }, [cancelAutoScroll]);

  // Detect manual user scrolling to avoid fighting user gestures
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleUserInteraction = () => {
      if (programmaticScrollRef.current) return;
      isUserInteractingRef.current = true;
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
      userInteractionTimeoutRef.current = setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 1800);
    };

    container.addEventListener('wheel', handleUserInteraction, { passive: true });
    container.addEventListener('touchstart', handleUserInteraction, { passive: true });
    container.addEventListener('pointerdown', handleUserInteraction, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleUserInteraction);
      container.removeEventListener('touchstart', handleUserInteraction);
      container.removeEventListener('pointerdown', handleUserInteraction);
      if (userInteractionTimeoutRef.current) {
        clearTimeout(userInteractionTimeoutRef.current);
      }
    };
  }, [scrollContainerRef, programmaticScrollRef]);

  // Stop continuous background conversion
  const stopContinuousAllPagesExtraction = useCallback(() => {
    isContinuousConvertingRef.current = false;
    continuousConversionRunIdRef.current += 1;
    setIsExtractingNextPage(false);
    setNextExtractingIndex(null);
  }, []);

  // Stop TTS completely
  const stopTTS = useCallback(() => {
    cancelSpeech();
    setIsTTSActiveState(false);
    isCurrentTTSFinishedRef.current = true;
    setCurrentSpeakingText('');
    setPipelineStatus('idle');
    setStatusMessage('TTS paused.');
    stopContinuousAllPagesExtraction();
  }, [cancelSpeech, stopContinuousAllPagesExtraction]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelSpeech();
      stopContinuousAllPagesExtraction();
    };
  }, [cancelSpeech, stopContinuousAllPagesExtraction]);

  // Exiting fullscreen stops all speech and auto-forward
  useEffect(() => {
    if (!isFullscreen) {
      cancelSpeech();
      stopContinuousAllPagesExtraction();
      if (isTTSActive) setIsTTSActiveState(false);
      if (isAutoForwardActive) setIsAutoForwardActiveState(false);
      isCurrentTTSFinishedRef.current = false;
      isNextPageExtractionFinishedRef.current = false;
      setPipelineStatus('idle');
      setStatusMessage('');
      setCurrentSpeakingText('');
      updateCurrentBlockIndex(null);
      totalBlocksRef.current = 0;
      setTotalBlocks(0);
      setIsExtractingNextPage(false);
      setNextExtractingIndex(null);
    }
  }, [isFullscreen, isTTSActive, isAutoForwardActive, cancelSpeech, stopContinuousAllPagesExtraction]);

  // Trigger or retrieve in-flight background extraction for a page index
  const triggerPageExtraction = useCallback((pageIdx: number): Promise<boolean> => {
    const currentPages = pagesRef.current;
    const page = currentPages[pageIdx];

    if (!page) return Promise.resolve(false);
    if (page.status === 'completed') return Promise.resolve(true);

    const existingPromise = inFlightExtractionsRef.current.get(pageIdx);
    if (existingPromise) return existingPromise;

    if (!onExtractPageRef.current) return Promise.resolve(false);

    const extractionPromise = onExtractPageRef.current(pageIdx)
      .then((success) => {
        inFlightExtractionsRef.current.delete(pageIdx);
        return success;
      })
      .catch((err) => {
        inFlightExtractionsRef.current.delete(pageIdx);
        console.warn(`Extraction error for page ${pageIdx + 1}:`, err);
        return false;
      });

    inFlightExtractionsRef.current.set(pageIdx, extractionPromise);
    return extractionPromise;
  }, []);

  // Pre-creates and configures native SpeechSynthesisUtterance of the next page in the background (Zero Latency Pipelining)
  const preBufferNextPageUtterance = useCallback((nextIdx: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (nextIdx >= pagesRef.current.length) return;

    const nextPage = pagesRef.current[nextIdx];
    if (!nextPage || nextPage.status !== 'completed') return;

    let textToSpeak = '';
    const visibleBlocks = getVisiblePageBlocks(nextPage);
    if (isSmartScrollEnabledRef.current && visibleBlocks.length > 0) {
      const firstBlock = visibleBlocks[0];
      if (firstBlock) {
        let blockText = firstBlock.text;
        if (
          includeSpeakerRef.current &&
          firstBlock.speaker &&
          firstBlock.speaker.trim() &&
          firstBlock.speaker.toLowerCase() !== 'narrator'
        ) {
          const stripped = stripSpeakerPrefix(firstBlock.text, firstBlock.speaker);
          blockText = `${firstBlock.speaker}: ${stripped}`;
        } else if (!includeSpeakerRef.current) {
          blockText = stripSpeakerPrefix(firstBlock.text, firstBlock.speaker);
        }
        textToSpeak = blockText;
      }
    } else {
      textToSpeak = getVisiblePageText(nextPage, includeSpeakerRef.current);
    }

    if (!textToSpeak || textToSpeak.trim().length === 0) return;

    // Clean old pre-buffers to prevent memory buildup
    preBufferedUtterancesRef.current.clear();

    try {
      const availVoices = window.speechSynthesis.getVoices();
      const voiceToUse =
        selectedVoiceRef.current ||
        findDefaultNaturalVoice(availVoices.length > 0 ? availVoices : voices) ||
        availVoices[0] ||
        null;

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      if (voiceToUse) {
        utterance.voice = voiceToUse;
        utterance.lang = voiceToUse.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = speechRateRef.current;
      utterance.pitch = 1.0;

      preBufferedUtterancesRef.current.set(nextIdx.toString(), utterance);
    } catch (err) {
      console.warn('Pre-buffering utterance failed:', err);
    }
  }, [voices]);

  // =========================================================================
  // Gate Evaluation: Advances page ONLY when ALL conditions are satisfied:
  // Rule 1: All visible text blocks on current image have been read aloud.
  // Rule 2: Long image has scrolled to the bottom (or fits in viewport).
  // Rule 3: Next page text extraction is complete.
  // =========================================================================
  const evaluateAndAdvance = useCallback((source: string) => {
    if (!isFullscreenRef.current || !isAutoForwardActiveRef.current) {
      return;
    }

    const curIdx = currentPageIndexRef.current;
    const totalPages = pagesRef.current.length;

    // If on final page, finish auto-forward
    if (curIdx >= totalPages - 1) {
      setIsAutoForwardActiveState(false);
      isAutoForwardActiveRef.current = false;
      setPipelineStatus('completed');
      setStatusMessage('Completed reading all pages.');
      return;
    }

    const nextIdx = curIdx + 1;
    const isNextExtractionDone =
      isNextPageExtractionFinishedRef.current ||
      pagesRef.current[nextIdx]?.status === 'completed' ||
      pagesRef.current[nextIdx]?.status === 'error';

    const isCurrentTTSDone = !isTTSActiveRef.current || isCurrentTTSFinishedRef.current;
    const isBottomReached = isCurrentPageScrolledToBottomRef.current;

    // All conditions required to advance
    if (isCurrentTTSDone && isBottomReached && isNextExtractionDone) {
      setPipelineStatus('advancing');
      setStatusMessage(`Page ${nextIdx + 1} extraction ready & all text blocks read. Advancing...`);
      onPageChangeRef.current(nextIdx);
    } else if (!isCurrentTTSDone) {
      setPipelineStatus('reading');
      setStatusMessage(`Reading Page ${curIdx + 1} text blocks...`);
    } else if (!isBottomReached) {
      setPipelineStatus('reading');
      setStatusMessage(`Reaching bottom of Page ${curIdx + 1}... (${source})`);
    } else if (!isNextExtractionDone) {
      setPipelineStatus('waiting-for-next');
      setStatusMessage(`Page ${curIdx + 1} read complete. Waiting for Page ${nextIdx + 1} extraction...`);
    }
  }, [programmaticScrollRef]);

  // Continuous all-pages background extraction loop: converts all pages till the end
  const startContinuousAllPagesExtraction = useCallback(() => {
    if (isContinuousConvertingRef.current) {
      return;
    }

    continuousConversionRunIdRef.current += 1;
    const runId = continuousConversionRunIdRef.current;
    isContinuousConvertingRef.current = true;

    const runLoop = async () => {
      const failedIndices = new Set<number>();

      while (
        isContinuousConvertingRef.current &&
        continuousConversionRunIdRef.current === runId
      ) {
        const currentPages = pagesRef.current;
        const total = currentPages.length;
        if (total === 0) break;

        const curIdx = currentPageIndexRef.current;
        const inFlightSet = new Set(inFlightExtractionsRef.current.keys());

        // Find next unextracted page, prioritizing forward direction from curIdx
        const candidatePages = currentPages.map((p, idx) =>
          failedIndices.has(idx) ? { ...p, status: 'completed' as const } : p
        );
        const targetIdx = findNextUnextractedPageIndex(candidatePages, curIdx, inFlightSet);

        // If all pages have been extracted or scheduled
        if (targetIdx === null) {
          if (inFlightSet.size > 0) {
            await Promise.race(Array.from(inFlightExtractionsRef.current.values()));
            continue;
          }
          setIsExtractingNextPage(false);
          setNextExtractingIndex(null);
          break;
        }

        setIsExtractingNextPage(true);
        setNextExtractingIndex(targetIdx);

        try {
          const success = await triggerPageExtraction(targetIdx);

          if (!isContinuousConvertingRef.current || continuousConversionRunIdRef.current !== runId) {
            break;
          }

          if (!success) {
            failedIndices.add(targetIdx);
          }

          // If this extraction was for the immediate next page, trigger gate evaluation
          if (targetIdx === currentPageIndexRef.current + 1) {
            isNextPageExtractionFinishedRef.current = true;
            preBufferNextPageUtterance(targetIdx);
            evaluateAndAdvance('next-page-extraction-finished');
          }

          // Pacing delay between multi-page composite batch calls
          await new Promise((r) => setTimeout(r, 600));
        } catch (err) {
          console.warn(`Continuous conversion error on page ${targetIdx + 1}:`, err);
          failedIndices.add(targetIdx);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      if (continuousConversionRunIdRef.current === runId) {
        setIsExtractingNextPage(false);
        setNextExtractingIndex(null);
        isContinuousConvertingRef.current = false;
      }
    };

    runLoop();
  }, [triggerPageExtraction, evaluateAndAdvance]);

  // Smooth cinematic glide to target scroll position
  const smoothScrollTo = useCallback(
    (
      container: HTMLElement,
      targetScroll: number,
      durationMs: number,
      runId: number
    ): Promise<void> => {
      return new Promise((resolve) => {
        const startPos = container.scrollTop;
        const distance = targetScroll - startPos;

        if (Math.abs(distance) <= 12 || durationMs <= 50) {
          programmaticScrollRef.current = true;
          container.scrollTop = targetScroll;
          programmaticScrollRef.current = false;
          resolve();
          return;
        }

        const startTime = performance.now();

        const step = (now: number) => {
          if (activePipelineRunIdRef.current !== runId) {
            programmaticScrollRef.current = false;
            resolve();
            return;
          }

          if (isUserInteractingRef.current) {
            autoScrollRafIdRef.current = requestAnimationFrame(step);
            return;
          }

          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          // Smooth cosine ease-in-out (natural human eye / reading glide)
          const ease = 0.5 * (1 - Math.cos(Math.PI * progress));

          programmaticScrollRef.current = true;
          container.scrollTop = Math.round(startPos + distance * ease);

          if (progress < 1) {
            autoScrollRafIdRef.current = requestAnimationFrame(step);
          } else {
            container.scrollTop = targetScroll;
            programmaticScrollRef.current = false;
            resolve();
          }
        };

        autoScrollRafIdRef.current = requestAnimationFrame(step);
      });
    },
    [programmaticScrollRef]
  );

  // Speak a single text block with Web Speech API and wait for utterance completion
  const speakSingleBlock = useCallback(
    (text: string, runId: number, block?: TextBlock): Promise<boolean> => {
      return new Promise((resolve) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          resolve(true);
          return;
        }

        if (!text || text.trim().length === 0) {
          resolve(true);
          return;
        }

        const isCurrentRunValid = () => {
          return activePipelineRunIdRef.current === runId;
        };

        const startSpeaking = async () => {
          const wasSpeaking = typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;

          if (wasSpeaking) {
            cancelSpeech();
            // Yield to let the browser process native speech cancellation completely before queuing the next audio
            await new Promise((r) => setTimeout(r, 80));
            if (!isCurrentRunValid()) {
              resolve(false);
              return;
            }
          }

          const availVoices = window.speechSynthesis.getVoices();
          const voiceToUse =
            selectedVoiceRef.current ||
            findDefaultNaturalVoice(availVoices.length > 0 ? availVoices : voices) ||
            availVoices[0] ||
            null;

          const cachedKey = currentPageIndexRef.current.toString();
          let utterance = preBufferedUtterancesRef.current.get(cachedKey);

          if (utterance && utterance.text === text) {
            preBufferedUtterancesRef.current.delete(cachedKey);
            if (voiceToUse) {
              utterance.voice = voiceToUse;
              utterance.lang = voiceToUse.lang || 'en-US';
            }
            utterance.rate = speechRateRef.current;
          } else {
            utterance = new SpeechSynthesisUtterance(text);
            if (voiceToUse) {
              utterance.voice = voiceToUse;
              utterance.lang = voiceToUse.lang || 'en-US';
            } else {
              utterance.lang = 'en-US';
            }
            utterance.rate = speechRateRef.current;
            utterance.pitch = 1.0;
          }

          // Note: In manhwa reading, scrolling occurs ONCE per block transition (in playBlockAtIndex).
          // While the block is being read aloud, the viewport stays completely still for optimal readability.

          (window as unknown as { __activeTTSUtterance?: SpeechSynthesisUtterance }).__activeTTSUtterance = utterance;
          currentUtteranceRef.current = utterance;

          let settled = false;
          const settle = (val: boolean) => {
            if (!settled) {
              settled = true;
              if (keepAliveIntervalRef.current) {
                clearInterval(keepAliveIntervalRef.current);
                keepAliveIntervalRef.current = null;
              }
              try {
                delete (window as unknown as { __activeTTSUtterance?: SpeechSynthesisUtterance }).__activeTTSUtterance;
              } catch {
                // Ignore delete error
              }
              currentUtteranceRef.current = null;
              resolve(val);
            }
          };

          utterance.onend = () => {
            settle(true);
          };

          utterance.onerror = (e) => {
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
              console.warn('speechSynthesis utterance error:', e);
            }
            settle(false);
          };

          try {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            // Directly speak the prepared utterance without any redundant synchronous cancels
            window.speechSynthesis.speak(utterance);
          } catch (err) {
            console.warn('Failed to speak block utterance:', err);
            settle(false);
          }

          // Chromium keep-alive workaround
          keepAliveIntervalRef.current = setInterval(() => {
            if (settled || activePipelineRunIdRef.current !== runId) {
              if (keepAliveIntervalRef.current) {
                clearInterval(keepAliveIntervalRef.current);
                keepAliveIntervalRef.current = null;
              }
              return;
            }
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
              window.speechSynthesis.pause();
              window.speechSynthesis.resume();
            }
          }, 8000);
        };

        startSpeaking();
      });
    },
    [cancelSpeech, voices]
  );

  // Countdown pause on a single block when TTS is OFF
  const countdownPause = useCallback((durationMs: number, runId: number): Promise<void> => {
    if (durationMs <= 0) {
      setSecondsRemaining(0);
      setProgressPercent(100);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (activePipelineRunIdRef.current !== runId) {
          clearInterval(interval);
          resolve();
          return;
        }
        const elapsed = Date.now() - startTime;
        const remainingMs = Math.max(0, durationMs - elapsed);
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
        setProgressPercent(Math.min(100, Math.round((elapsed / durationMs) * 100)));

        if (remainingMs <= 0) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }, []);

  // Continuous linear auto-scroller fallback (used for wordless strips or when Smart Scroll is OFF)
  const startLongPageAutoScroll = useCallback(
    (bounds: PageScrollBounds, durationMs: number, runId: number) => {
      cancelAutoScroll();

      const container = scrollContainerRefLive.current?.current;
      if (!container || !bounds.isLongPage) {
        isCurrentPageScrolledToBottomRef.current = true;
        return;
      }

      isCurrentPageScrolledToBottomRef.current = false;

      const startDelay = pauseSecondsRef.current > 0 ? Math.min(250, pauseSecondsRef.current * 250) : 0;
      const executeScroll = () => {
        if (activePipelineRunIdRef.current !== runId || !isAutoForwardActiveRef.current) return;

        const freshBounds = getPageScrollBounds(container, currentPageIndexRef.current, isContinuousScrollRef.current);
        const startPos = container.scrollTop;
        const targetPos = freshBounds.endScroll;
        const distance = targetPos - startPos;

        if (distance <= 15) {
          isCurrentPageScrolledToBottomRef.current = true;
          evaluateAndAdvance('already-at-bottom');
          return;
        }

        const startTime = performance.now();
        let pausedDuration = 0;
        let pauseStartTime = 0;

        const step = (now: number) => {
          if (activePipelineRunIdRef.current !== runId || !isAutoForwardActiveRef.current) {
            cancelAutoScroll();
            return;
          }

          if (isUserInteractingRef.current) {
            if (pauseStartTime === 0) pauseStartTime = now;
            autoScrollRafIdRef.current = requestAnimationFrame(step);
            return;
          } else if (pauseStartTime !== 0) {
            pausedDuration += now - pauseStartTime;
            pauseStartTime = 0;
          }

          const effectiveElapsed = now - startTime - pausedDuration;
          const progress = Math.min(1, Math.max(0, effectiveElapsed / durationMs));
          const nextScrollPos = Math.round(startPos + distance * progress);

          programmaticScrollRef.current = true;
          container.scrollTop = nextScrollPos;

          setProgressPercent(Math.round(progress * 100));
          const remainingSec = Math.max(0, Math.ceil((durationMs - effectiveElapsed) / 1000));
          setSecondsRemaining(remainingSec);

          if (progress < 1 && container.scrollTop < targetPos - 5) {
            autoScrollRafIdRef.current = requestAnimationFrame(step);
          } else {
            programmaticScrollRef.current = true;
            container.scrollTop = targetPos;
            setProgressPercent(100);
            setSecondsRemaining(0);

            const bottomDelay = pauseSecondsRef.current > 0 ? Math.min(1000, pauseSecondsRef.current * 1000) : 0;
            if (bottomDelay <= 0) {
              programmaticScrollRef.current = false;
              if (activePipelineRunIdRef.current === runId) {
                isCurrentPageScrolledToBottomRef.current = true;
                evaluateAndAdvance('scroll-bottom-reached');
              }
            } else {
              autoScrollTimeoutIdRef.current = setTimeout(() => {
                programmaticScrollRef.current = false;
                if (activePipelineRunIdRef.current === runId) {
                  isCurrentPageScrolledToBottomRef.current = true;
                  evaluateAndAdvance('scroll-bottom-reached');
                }
              }, bottomDelay);
            }
          }
        };

        autoScrollRafIdRef.current = requestAnimationFrame(step);
      };

      if (startDelay <= 0) {
        executeScroll();
      } else {
        autoScrollTimeoutIdRef.current = setTimeout(executeScroll, startDelay);
      }
    },
    [cancelAutoScroll, programmaticScrollRef, evaluateAndAdvance]
  );

  // Speak full text (fallback for single-page reading or legacy mode)
  const speakCurrentPageText = useCallback(
    (text: string, runId: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        isCurrentTTSFinishedRef.current = true;
        evaluateAndAdvance('no-speech-api');
        return;
      }

      if (!text || text.trim().length === 0) {
        isCurrentTTSFinishedRef.current = true;
        setPipelineStatus('reading');
        setStatusMessage(`Page ${currentPageIndexRef.current + 1} (Silent / Visual Panel)...`);
        setCurrentSpeakingText('');

        const container = scrollContainerRefLive.current?.current;
        const bounds = getPageScrollBounds(container, currentPageIndexRef.current, isContinuousScrollRef.current);
        if (!bounds.isLongPage) {
          isCurrentPageScrolledToBottomRef.current = true;
          if (isAutoForwardActiveRef.current) {
            const silentDelay = pauseSecondsRef.current > 0 ? pauseSecondsRef.current * 1000 : 0;
            if (silentDelay <= 0) {
              if (activePipelineRunIdRef.current === runId) {
                evaluateAndAdvance('silent-panel-pause-complete');
              }
            } else {
              setTimeout(() => {
                if (activePipelineRunIdRef.current === runId) {
                  evaluateAndAdvance('silent-panel-pause-complete');
                }
              }, silentDelay);
            }
          } else {
            evaluateAndAdvance('silent-panel');
          }
        }
        return;
      }

      const isCurrentRunValid = () => {
        return activePipelineRunIdRef.current === runId;
      };

      const startSpeaking = async () => {
        const wasSpeaking = typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;

        if (wasSpeaking) {
          cancelSpeech();
          // Yield to let the browser process native speech cancellation completely before queuing the next audio
          await new Promise((r) => setTimeout(r, 80));
          if (!isCurrentRunValid()) return;
        }

        setPipelineStatus('reading');
        setStatusMessage(`Reading Page ${currentPageIndexRef.current + 1} visible text...`);
        setCurrentSpeakingText(text);

        const availVoices = window.speechSynthesis.getVoices();
        const voiceToUse =
          selectedVoiceRef.current ||
          findDefaultNaturalVoice(availVoices.length > 0 ? availVoices : voices) ||
          availVoices[0] ||
          null;

        const cachedKey = currentPageIndexRef.current.toString();
        let utterance = preBufferedUtterancesRef.current.get(cachedKey);

        if (utterance && utterance.text === text) {
          preBufferedUtterancesRef.current.delete(cachedKey);
          if (voiceToUse) {
            utterance.voice = voiceToUse;
            utterance.lang = voiceToUse.lang || 'en-US';
          }
          utterance.rate = speechRateRef.current;
        } else {
          utterance = new SpeechSynthesisUtterance(text);
          if (voiceToUse) {
            utterance.voice = voiceToUse;
            utterance.lang = voiceToUse.lang || 'en-US';
          } else {
            utterance.lang = 'en-US';
          }
          utterance.rate = speechRateRef.current;
          utterance.pitch = 1.0;
        }

        (window as unknown as { __activeTTSUtterance?: SpeechSynthesisUtterance }).__activeTTSUtterance = utterance;
        currentUtteranceRef.current = utterance;

        let isFinished = false;
        const onTTSFinished = (success: boolean) => {
          if (!isFinished) {
            isFinished = true;
            if (keepAliveIntervalRef.current) {
              clearInterval(keepAliveIntervalRef.current);
              keepAliveIntervalRef.current = null;
            }
            try {
              delete (window as unknown as { __activeTTSUtterance?: SpeechSynthesisUtterance }).__activeTTSUtterance;
            } catch {
              // Ignore delete error
            }
            currentUtteranceRef.current = null;
            isCurrentTTSFinishedRef.current = true;

            if (activePipelineRunIdRef.current === runId) {
              evaluateAndAdvance(success ? 'tts-onend' : 'tts-onerror');
            }
          }
        };

        utterance.onend = () => {
          onTTSFinished(true);
        };

        utterance.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.warn('speechSynthesis utterance error:', e);
          }
          onTTSFinished(false);
        };

        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          // Directly speak the prepared utterance without any redundant synchronous cancels
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          console.warn('Failed to speak utterance:', err);
          onTTSFinished(false);
        }
      };

      startSpeaking();
    },
    [cancelSpeech, evaluateAndAdvance, voices]
  );

  // =========================================================================
  // Primary Pipeline Loop for Current Page
  // =========================================================================
  useEffect(() => {
    if (!isFullscreen) return;

    activePipelineRunIdRef.current += 1;
    const currentRunId = activePipelineRunIdRef.current;
    const curIdx = currentPageIndex;
    const totalPages = pagesRef.current.length;

    // Reset condition flags for the new page
    isCurrentTTSFinishedRef.current = !isTTSActive;
    isNextPageExtractionFinishedRef.current =
      curIdx >= totalPages - 1 || pagesRef.current[curIdx + 1]?.status === 'completed';

    pauseTimerStartRef.current = Date.now();
    setSecondsRemaining(pauseSecondsRef.current);
    setProgressPercent(0);
    setCurrentBlockIndex(null);
    setTotalBlocks(0);

    const isCurrentRunValid = () => {
      return (
        activePipelineRunIdRef.current === currentRunId &&
        isFullscreenRef.current &&
        currentPageIndexRef.current === curIdx
      );
    };

    const runPagePipeline = async () => {
      const curPage = pagesRef.current[curIdx];
      if (!curPage) return;

      // STEP 1: Current Page Extraction (if needed)
      if (curPage.status !== 'completed') {
        setPipelineStatus('extracting-current');
        setStatusMessage(`Extracting text on Page ${curIdx + 1}...`);
        setCurrentSpeakingText('');

        const success = await triggerPageExtraction(curIdx);
        if (!isCurrentRunValid()) return;

        if (!success && pagesRef.current[curIdx]?.status === 'error') {
          setPipelineStatus('error');
          setStatusMessage(`Page ${curIdx + 1} extraction notice. Waiting...`);
          await new Promise((r) => setTimeout(r, 1500));
          if (!isCurrentRunValid()) return;
        }
      }

      // STEP 2: Continuous Background Extraction for All Pages till the end
      if (isTTSActiveRef.current || isAutoForwardActiveRef.current) {
        startContinuousAllPagesExtraction();
        const nextIdx = curIdx + 1;
        if (nextIdx >= totalPages || pagesRef.current[nextIdx]?.status === 'completed') {
          isNextPageExtractionFinishedRef.current = true;
          preBufferNextPageUtterance(nextIdx);
        } else {
          isNextPageExtractionFinishedRef.current = false;
        }
      } else {
        isNextPageExtractionFinishedRef.current = true;
      }

      // STEP 3: Smart Scroll & Text Narration
      const container = scrollContainerRefLive.current?.current;
      const bounds = getPageScrollBounds(container, curIdx, isContinuousScrollRef.current);
      const visibleBlocks = getVisiblePageBlocks(pagesRef.current[curIdx]);

      // Smart Scroll: Auto-scroll to each text block in reading order and only advance once all blocks are read
      if (isSmartScrollEnabledRef.current && visibleBlocks.length > 0) {
        if (visibleBlocks.length > 0) {
          const totalCount = visibleBlocks.length;
          totalBlocksRef.current = totalCount;
          setTotalBlocks(totalCount);
          isCurrentTTSFinishedRef.current = false;
          isCurrentPageScrolledToBottomRef.current = false;

          // Track the starting block index (0 for new page, or resume current block if on same page)
          const startBlock =
            curIdx === lastPageIndexRef.current &&
            currentBlockIndexRef.current !== null &&
            currentBlockIndexRef.current < totalCount
              ? currentBlockIndexRef.current
              : 0;
          lastPageIndexRef.current = curIdx;
          updateCurrentBlockIndex(startBlock);

          // Orchestrated block player tracking current block index
          const playBlockAtIndex = async (bIdx: number): Promise<void> => {
            if (!isCurrentRunValid()) return;

            // Track the current block index
            updateCurrentBlockIndex(bIdx);
            const block = visibleBlocks[bIdx];
            if (!block) return;

            // 1. Smoothly scroll container to bring this text block into view (Smart Scroll)
            if (container) {
              const targetScroll = getBlockTargetScroll(
                container,
                curIdx,
                block,
                bIdx,
                totalCount,
                isContinuousScrollRef.current
              );
              const startPos = container.scrollTop;
              const scrollDistance = Math.abs(targetScroll - startPos);

              const wordCount = block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0;
              // Calculate distance-adaptive duration
              const { durationMs } = calculateAdaptiveScrollDuration(
                scrollDistance,
                scrollSpeedModeRef.current,
                scrollVelocityMultiplierRef.current,
                wordCount
              );

              setStatusMessage(
                scrollDistance > 350
                  ? `Viewing artwork & panning to block ${bIdx + 1}...`
                  : `Smart Scroll: focusing block ${bIdx + 1} of ${totalCount}...`
              );

              await smoothScrollTo(container, targetScroll, durationMs, currentRunId);
              if (!isCurrentRunValid()) return;
              // Instant read aloud: NO dwell pause wait! Read aloud immediately as text comes into view.
            }

            // 2. Format spoken dialogue
            let speechText = block.text;
            if (
              includeSpeakerRef.current &&
              block.speaker &&
              block.speaker.trim() &&
              block.speaker.toLowerCase() !== 'narrator'
            ) {
              const stripped = stripSpeakerPrefix(block.text, block.speaker);
              speechText = `${block.speaker}: ${stripped}`;
            } else if (!includeSpeakerRef.current) {
              speechText = stripSpeakerPrefix(block.text, block.speaker);
            }

            setCurrentSpeakingText(speechText);
            setPipelineStatus('reading');
            setStatusMessage(`Smart Scroll: reading block ${bIdx + 1} of ${totalCount}...`);

            // 3. Read aloud immediately if TTS is ON, or countdown pause if TTS is OFF
            if (isTTSActiveRef.current) {
              await speakSingleBlock(speechText, currentRunId, block);
              if (!isCurrentRunValid()) return;
            } else {
              const blockPauseMs =
                pauseSecondsRef.current <= 0
                  ? 0
                  : Math.max(0, Math.round((pauseSecondsRef.current * 1000) / totalCount));
              if (blockPauseMs > 0) {
                await countdownPause(blockPauseMs, currentRunId);
                if (!isCurrentRunValid()) return;
              }
            }

            // Block has finished! Check if more blocks remain on the same page.
            const progression = evaluateBlockProgression(bIdx, totalCount);

            if (progression.hasMoreBlocks && progression.nextBlockIndex !== null) {
              // Advance immediately to next block
              setStatusMessage(`Block ${bIdx + 1} read. Smart scrolling to block ${progression.nextBlockIndex + 1}...`);
              await playBlockAtIndex(progression.nextBlockIndex);
            } else {
              // If no: proceed to the auto-forward logic to the next page
              setStatusMessage(`All ${totalCount} text blocks read on Page ${curIdx + 1}. Proceeding to auto-forward...`);

              // Glide to bottom of long strip if not already there so reader views full artwork
              if (container && bounds.isLongPage) {
                const freshBounds = getPageScrollBounds(container, curIdx, isContinuousScrollRef.current);
                const endDistance = Math.max(0, freshBounds.endScroll - container.scrollTop);
                if (endDistance > 20) {
                  const { durationMs } = calculateAdaptiveScrollDuration(
                    endDistance,
                    scrollSpeedModeRef.current,
                    scrollVelocityMultiplierRef.current
                  );
                  setStatusMessage(`All text blocks read. Viewing concluding artwork on Page ${curIdx + 1}...`);
                  await smoothScrollTo(container, freshBounds.endScroll, durationMs, currentRunId);
                  if (!isCurrentRunValid()) return;
                  if (pauseSecondsRef.current > 0) {
                    await new Promise((r) => setTimeout(r, Math.min(1000, pauseSecondsRef.current * 1000)));
                    if (!isCurrentRunValid()) return;
                  }
                }
              }

              isCurrentTTSFinishedRef.current = true;
              isCurrentPageScrolledToBottomRef.current = true;
              setCurrentSpeakingText('');
              setPipelineStatus('reading');
              setStatusMessage(`Page ${curIdx + 1} narration complete.`);

              // Proceed to auto-forward logic to advance to next page
              evaluateAndAdvance('smart-scroll-all-blocks-finished');
            }
          };

          playBlockAtIndexRef.current = playBlockAtIndex;
          if (isTTSActiveRef.current || isAutoForwardActiveRef.current) {
            await playBlockAtIndex(startBlock);
          } else {
            updateCurrentBlockIndex(startBlock);
          }
          return;
        }
      }

      // Fallback: Wordless strip or standard single-page reading
      const visibleText = getVisiblePageText(pagesRef.current[curIdx], includeSpeakerRef.current);

      if (bounds.isLongPage) {
        isCurrentPageScrolledToBottomRef.current = false;
        const freshBounds = getPageScrollBounds(container, curIdx, isContinuousScrollRef.current);
        const distance = Math.max(0, freshBounds.endScroll - (container?.scrollTop ?? 0));
        const { durationMs: calculatedDurationMs } = calculateAdaptiveScrollDuration(
          distance,
          scrollSpeedModeRef.current,
          scrollVelocityMultiplierRef.current
        );

        if (isTTSActiveRef.current) {
          const wordCount = visibleText.trim().split(/\s+/).filter(Boolean).length;
          const speechSec = wordCount > 0 ? (wordCount / 2.5) / speechRateRef.current : 0;
          const durationMs = Math.max(
            calculatedDurationMs,
            speechSec * 1000,
            pauseSecondsRef.current > 0 ? pauseSecondsRef.current * 1000 : 0
          );
          if (isAutoForwardActiveRef.current) {
            startLongPageAutoScroll(bounds, durationMs, currentRunId);
          }
          speakCurrentPageText(visibleText, currentRunId);
        } else {
          isCurrentTTSFinishedRef.current = true;
          setCurrentSpeakingText('');
          const durationMs = Math.max(
            calculatedDurationMs,
            pauseSecondsRef.current > 0 ? pauseSecondsRef.current * 1000 : 0
          );
          if (isAutoForwardActiveRef.current) {
            startLongPageAutoScroll(bounds, durationMs, currentRunId);
          }
        }
      } else {
        isCurrentPageScrolledToBottomRef.current = true;
        if (isTTSActiveRef.current) {
          speakCurrentPageText(visibleText, currentRunId);
        } else {
          isCurrentTTSFinishedRef.current = true;
          setCurrentSpeakingText('');
          if (isAutoForwardActiveRef.current) {
            evaluateAndAdvance('tts-is-off');
          }
        }
      }
    };

    runPagePipeline();

    return () => {
      cancelSpeech();
    };
  }, [
    isFullscreen,
    currentPageIndex,
    isTTSActive,
    isSmartScrollEnabled,
    triggerPageExtraction,
    speakCurrentPageText,
    cancelSpeech,
    evaluateAndAdvance,
    startLongPageAutoScroll,
    smoothScrollTo,
    speakSingleBlock,
    countdownPause,
    startContinuousAllPagesExtraction,
  ]);

  // Auto-Forward Countdown Timer (Used when TTS is OFF on standard/non-long pages)
  useEffect(() => {
    if (!isFullscreen || !isAutoForwardActive) {
      pauseTimerStartRef.current = null;
      return;
    }

    if (isTTSActive) {
      return;
    }

    const container = scrollContainerRefLive.current?.current;
    const bounds = getPageScrollBounds(container, currentPageIndex, isContinuousScrollRef.current);
    if (bounds.isLongPage) {
      return;
    }

    const interval = setInterval(() => {
      if (!pauseTimerStartRef.current) {
        pauseTimerStartRef.current = Date.now();
      }

      const target = pauseSecondsRef.current;
      if (target <= 0) {
        setSecondsRemaining(0);
        setProgressPercent(100);
        evaluateAndAdvance('zero-pause');
        return;
      }

      const elapsed = (Date.now() - pauseTimerStartRef.current) / 1000;
      const remaining = Math.max(0, target - elapsed);
      const percent = Math.min(100, Math.max(0, (elapsed / target) * 100));

      setSecondsRemaining(Math.ceil(remaining));
      setProgressPercent(percent);

      if (remaining <= 0) {
        evaluateAndAdvance('pause-timer-expired');
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [isFullscreen, isAutoForwardActive, isTTSActive, currentPageIndex, evaluateAndAdvance]);

  // Reactive Controls: TTS Toggle
  const toggleTTS = useCallback(() => {
    if (!isFullscreen) return;

    if (isTTSActive) {
      cancelSpeech();
      setIsTTSActiveState(false);
      isTTSActiveRef.current = false;
      isCurrentTTSFinishedRef.current = true;
      setCurrentSpeakingText('');
      setStatusMessage('TTS turned OFF.');
      stopContinuousAllPagesExtraction();

      if (isAutoForwardActiveRef.current) {
        evaluateAndAdvance('tts-toggled-off');
      }
    } else {
      setIsTTSActiveState(true);
      isTTSActiveRef.current = true;
      isCurrentTTSFinishedRef.current = false;

      // Automatically enable Auto-Forward so pages advance smoothly upon speech completion
      if (!isAutoForwardActiveRef.current) {
        setIsAutoForwardActiveState(true);
        isAutoForwardActiveRef.current = true;
        pauseTimerStartRef.current = Date.now();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);
      }

      // Start converting all pages till the end!
      startContinuousAllPagesExtraction();

      const curIdx = currentPageIndexRef.current;
      const visibleText = getVisiblePageText(pagesRef.current[curIdx], includeSpeakerRef.current);
      speakCurrentPageText(visibleText, activePipelineRunIdRef.current);
    }
  }, [
    isFullscreen,
    isTTSActive,
    cancelSpeech,
    evaluateAndAdvance,
    speakCurrentPageText,
    startContinuousAllPagesExtraction,
    stopContinuousAllPagesExtraction,
  ]);

  // Reactive Controls: Auto-Forward Toggle
  const toggleAutoForward = useCallback(() => {
    if (!isFullscreen) return;

    if (isAutoForwardActive) {
      cancelAutoScroll();
      setIsAutoForwardActiveState(false);
      isAutoForwardActiveRef.current = false;
      setStatusMessage('Auto-Forward paused.');
      if (!isTTSActiveRef.current) {
        stopContinuousAllPagesExtraction();
      }
    } else {
      const curIdx = currentPageIndexRef.current;
      const totalPages = pagesRef.current.length;

      if (curIdx >= totalPages - 1) {
        setStatusMessage('At final page.');
        return;
      }

      setIsAutoForwardActiveState(true);
      isAutoForwardActiveRef.current = true;
      pauseTimerStartRef.current = Date.now();
      setSecondsRemaining(pauseSecondsRef.current);
      setProgressPercent(0);

      const container = scrollContainerRefLive.current?.current;
      const bounds = getPageScrollBounds(container, curIdx, isContinuousScrollRef.current);

      if (bounds.isLongPage) {
        isCurrentPageScrolledToBottomRef.current = false;
      } else {
        isCurrentPageScrolledToBottomRef.current = true;
      }

      // Start continuous background extraction for all pages
      startContinuousAllPagesExtraction();

      if (isTTSActiveRef.current) {
        if (isCurrentTTSFinishedRef.current) {
          evaluateAndAdvance('auto-forward-started-tts-already-done');
        } else if (!currentUtteranceRef.current) {
          const visibleText = getVisiblePageText(pagesRef.current[curIdx], includeSpeakerRef.current);
          speakCurrentPageText(visibleText, activePipelineRunIdRef.current);
        }
      }
    }
  }, [
    isFullscreen,
    isAutoForwardActive,
    evaluateAndAdvance,
    speakCurrentPageText,
    cancelAutoScroll,
    startContinuousAllPagesExtraction,
    stopContinuousAllPagesExtraction,
  ]);

  const setIsAutoForwardActive = useCallback(
    (active: boolean) => {
      if (!isFullscreen && active) return;
      if (active && currentPageIndexRef.current >= pagesRef.current.length - 1) return;

      if (!active) {
        cancelAutoScroll();
      }

      setIsAutoForwardActiveState(active);
      isAutoForwardActiveRef.current = active;
      if (active) {
        pauseTimerStartRef.current = Date.now();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);

        const curIdx = currentPageIndexRef.current;
        const container = scrollContainerRefLive.current?.current;
        const bounds = getPageScrollBounds(container, curIdx, isContinuousScrollRef.current);

        if (bounds.isLongPage) {
          isCurrentPageScrolledToBottomRef.current = false;
        } else {
          isCurrentPageScrolledToBottomRef.current = true;
        }

        if (isTTSActiveRef.current && !currentUtteranceRef.current) {
          const visibleText = getVisiblePageText(pagesRef.current[curIdx]);
          speakCurrentPageText(visibleText, activePipelineRunIdRef.current);
        }
      }
    },
    [isFullscreen, speakCurrentPageText, cancelAutoScroll]
  );

  const resetTimer = useCallback(() => {
    pauseTimerStartRef.current = Date.now();
    setSecondsRemaining(pauseSecondsRef.current);
    setProgressPercent(0);
  }, []);

  const goToNextBlock = useCallback(() => {
    if (totalBlocksRef.current <= 0) {
      const curPage = currentPageIndexRef.current;
      const totalPages = pagesRef.current.length;
      if (curPage < totalPages - 1) {
        onPageChangeRef.current(curPage + 1);
      }
      return;
    }
    const curBlock = currentBlockIndexRef.current ?? 0;
    const nextIdx = curBlock + 1;
    if (nextIdx < totalBlocksRef.current) {
      cancelSpeech();
      updateCurrentBlockIndex(nextIdx);
      if (playBlockAtIndexRef.current) {
        playBlockAtIndexRef.current(nextIdx);
      }
    } else {
      cancelSpeech();
      cancelAutoScroll();
      isCurrentTTSFinishedRef.current = true;
      isCurrentPageScrolledToBottomRef.current = true;
      const curPage = currentPageIndexRef.current;
      const totalPages = pagesRef.current.length;
      if (curPage < totalPages - 1) {
        updateCurrentBlockIndex(0);
        onPageChangeRef.current(curPage + 1);
      }
    }
  }, [cancelSpeech, cancelAutoScroll, updateCurrentBlockIndex]);

  const goToPreviousBlock = useCallback(() => {
    if (totalBlocksRef.current <= 0) {
      const curPage = currentPageIndexRef.current;
      if (curPage > 0) {
        onPageChangeRef.current(curPage - 1);
      }
      return;
    }
    const curBlock = currentBlockIndexRef.current ?? 0;
    const prevIdx = curBlock - 1;
    if (prevIdx >= 0) {
      cancelSpeech();
      updateCurrentBlockIndex(prevIdx);
      if (playBlockAtIndexRef.current) {
        playBlockAtIndexRef.current(prevIdx);
      }
    } else {
      cancelSpeech();
      cancelAutoScroll();
      const curPage = currentPageIndexRef.current;
      if (curPage > 0) {
        updateCurrentBlockIndex(0);
        onPageChangeRef.current(curPage - 1);
      }
    }
  }, [cancelSpeech, cancelAutoScroll, updateCurrentBlockIndex]);

  return {
    isTTSActive,
    toggleTTS,
    stopTTS,
    voices,
    selectedVoice,
    setSelectedVoice,
    speechRate,
    setSpeechRate,
    isAutoForwardActive,
    toggleAutoForward,
    setIsAutoForwardActive,
    pauseSeconds,
    setPauseSeconds,
    secondsRemaining,
    progressPercent,
    resetTimer,
    isSmartScrollEnabled,
    toggleSmartScroll,
    setIsSmartScrollEnabled,
    currentBlockIndex,
    totalBlocks,
    goToNextBlock,
    goToPreviousBlock,
    pipelineStatus,
    statusMessage,
    currentSpeakingText,
    isExtractingNextPage,
    nextExtractingIndex,
    includeSpeaker,
    setIncludeSpeaker,
    toggleIncludeSpeaker,
    scrollSpeedMode,
    setScrollSpeedMode,
    scrollVelocityMultiplier,
    setScrollVelocityMultiplier,
  };
}
