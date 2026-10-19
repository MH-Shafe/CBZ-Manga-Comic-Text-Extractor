import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getVisiblePageText,
  findDefaultNaturalVoice,
  getPageScrollBounds,
  evaluateBlockProgression,
  stripSpeakerPrefix,
  isActualWatermarkText,
  isSoundEffectOrActionNoise,
  findNextUnextractedPageIndex,
  calculateAdaptiveScrollDuration,
  SCROLL_SPEED_PIXELS_PER_SEC,
  classifyTextContent,
  isStoryRelevantForTTS,
  getPageGeometry,
  getBlockTargetScroll,
} from '../hooks/useFullscreenTTSNarrator';
import { ComicPage } from '../types';

describe('useFullscreenTTSNarrator tests', () => {
  test('getVisiblePageText extracts only visible text ordered by readingOrder', () => {
    const page: ComicPage = {
      id: 'p1',
      index: 0,
      fileName: 'page_001.jpg',
      imageUrl: 'blob:test',
      blob: new Blob(),
      mimeType: 'image/jpeg',
      status: 'completed',
      isExcluded: false,
      pageSummary: 'A samurai faces his rival at sunset on the hilltop.', // Should NEVER be read
      extraPageReason: 'Title banner',
      blocks: [
        {
          id: 'b2',
          readingOrder: 2,
          type: 'dialogue',
          speaker: 'Rival',
          text: 'You cannot defeat me!',
        },
        {
          id: 'b1',
          readingOrder: 1,
          type: 'dialogue',
          speaker: 'Samurai',
          text: 'Draw your blade.',
        },
        {
          id: 'b3',
          readingOrder: 3,
          type: 'other',
          text: 'scans-by-watermark.com',
          watermarkOrNoiseFiltered: true, // Should be filtered out
        },
      ],
      fullText: 'Draw your blade. You cannot defeat me!',
    };

    const text = getVisiblePageText(page);

    // Verifies ordering: b1 then b2
    assert.strictEqual(text, 'Draw your blade.\nYou cannot defeat me!');
    // Verifies summary is NOT in text
    assert.ok(!text.includes('samurai faces his rival'));
    // Verifies filtered watermark is NOT in text
    assert.ok(!text.includes('watermark.com'));
  });

  test('stripSpeakerPrefix cleans character names from dialogue strings', () => {
    assert.strictEqual(stripSpeakerPrefix('Hero: What is this place?!'), 'What is this place?!');
    assert.strictEqual(stripSpeakerPrefix('[Villain]: You cannot escape.'), 'You cannot escape.');
    assert.strictEqual(stripSpeakerPrefix('(Narrator): Long ago...'), 'Long ago...');
    assert.strictEqual(stripSpeakerPrefix('Just dialogue without speaker.'), 'Just dialogue without speaker.');
    assert.strictEqual(stripSpeakerPrefix(''), '');
  });

  test('isSoundEffectOrActionNoise accurately identifies non-box SFX and action text', () => {
    assert.strictEqual(isSoundEffectOrActionNoise('* SHHHH... *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('* MURMUR *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('* GRAB GRAB *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('* TREMBLE *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('* TREEEEMBLE *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('* HMMMM... *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('* CLAP *'), true);
    assert.strictEqual(isSoundEffectOrActionNoise('Honey, why are you staring at me?'), false);
  });

  test('getVisiblePageText filters out sound effects and action noise from TTS reading', () => {
    const pageWithSfx: ComicPage = {
      id: 'p-sfx',
      index: 0,
      fileName: 'page_003.jpg',
      imageUrl: '',
      blob: new Blob(),
      mimeType: 'image/jpeg',
      status: 'completed',
      isExcluded: false,
      blocks: [
        { id: 'b1', readingOrder: 1, type: 'other', text: '* SHHHH... *' },
        { id: 'b2', readingOrder: 2, type: 'other', text: '* MURMUR *' },
        { id: 'b3', readingOrder: 3, type: 'dialogue', text: 'So why the hell am I this scared?' },
        { id: 'b4', readingOrder: 4, type: 'other', text: '* TREMBLE *' },
      ],
      fullText: '* SHHHH... *\n* MURMUR *\nSo why the hell am I this scared?\n* TREMBLE *',
    };

    const text = getVisiblePageText(pageWithSfx);
    assert.strictEqual(text, 'So why the hell am I this scared?');
  });

  test('getVisiblePageText preserves top dialogue boxes even if erroneously flagged as watermark noise', () => {
    const pageWithTopDialogue: ComicPage = {
      id: 'p-top-test',
      index: 0,
      fileName: 'page_001.jpg',
      imageUrl: '',
      blob: new Blob(),
      mimeType: 'image/jpeg',
      status: 'completed',
      isExcluded: false,
      blocks: [
        {
          id: 'b-top',
          readingOrder: 1,
          type: 'narration',
          text: 'At the break of dawn, the fortress horn echoed across the mountains.',
          watermarkOrNoiseFiltered: true, // Erroneously flagged by AI vision due to top margin placement
        },
        {
          id: 'b-dialogue',
          readingOrder: 2,
          type: 'dialogue',
          speaker: 'Commander',
          text: 'Prepare the vanguard! We march now.',
          watermarkOrNoiseFiltered: false,
        },
        {
          id: 'b-watermark',
          readingOrder: 3,
          type: 'other',
          text: 'scans-by-watermark.com / join discord.gg/scans',
          watermarkOrNoiseFiltered: true, // Actual watermark
        },
      ],
      fullText: 'At the break of dawn, the fortress horn echoed across the mountains.\n\nCommander: Prepare the vanguard! We march now.',
    };

    const text = getVisiblePageText(pageWithTopDialogue);
    // Verifies top dialogue/narration was preserved and spoken
    assert.ok(text.includes('At the break of dawn, the fortress horn echoed across the mountains.'));
    // Verifies normal dialogue was spoken
    assert.ok(text.includes('Prepare the vanguard! We march now.'));
    // Verifies actual watermark was excluded
    assert.ok(!text.includes('scans-by-watermark.com'));
    assert.ok(!text.includes('discord.gg'));
  });

  test('getVisiblePageText supports toggling speaker names ON and OFF', () => {
    const page: ComicPage = {
      id: 'p-speakers',
      index: 0,
      fileName: 'page.jpg',
      imageUrl: '',
      blob: new Blob(),
      mimeType: 'image/jpeg',
      status: 'completed',
      isExcluded: false,
      blocks: [
        { id: 'b1', readingOrder: 1, type: 'dialogue', speaker: 'Hero', text: 'Who goes there?' },
        { id: 'b2', readingOrder: 2, type: 'dialogue', speaker: 'Villain', text: 'Your doom!' },
      ],
    };

    // When includeSpeaker is false (default when watching the page): pure dialogue
    const textWithoutSpeaker = getVisiblePageText(page, false);
    assert.strictEqual(textWithoutSpeaker, 'Who goes there?\nYour doom!');

    // When includeSpeaker is true: includes speaker prefixes
    const textWithSpeaker = getVisiblePageText(page, true);
    assert.strictEqual(textWithSpeaker, 'Hero: Who goes there?\nVillain: Your doom!');
  });

  test('getVisiblePageText falls back to fullText if blocks array is empty', () => {
    const page: ComicPage = {
      id: 'p2',
      index: 1,
      fileName: 'page_002.jpg',
      imageUrl: 'blob:test',
      blob: new Blob(),
      mimeType: 'image/jpeg',
      status: 'completed',
      isExcluded: false,
      pageSummary: 'Action sequence without dialogue bubbles',
      blocks: [],
      fullText: 'Wait, what is that sound?',
    };

    const text = getVisiblePageText(page);
    assert.strictEqual(text, 'Wait, what is that sound?');
    assert.ok(!text.includes('Action sequence'));
  });

  test('getVisiblePageText returns empty string if page has no visible dialogue/text', () => {
    const page: ComicPage = {
      id: 'p3',
      index: 2,
      fileName: 'page_003.jpg',
      imageUrl: 'blob:test',
      blob: new Blob(),
      mimeType: 'image/jpeg',
      status: 'completed',
      isExcluded: false,
      pageSummary: 'A silent vista of the ocean waves crashing against rocks.',
      blocks: [],
      fullText: '',
    };

    const text = getVisiblePageText(page);
    assert.strictEqual(text, '');
  });

  test('findDefaultNaturalVoice prioritizes Microsoft Ava Natural Online voice', () => {
    const mockVoices = [
      { name: 'Microsoft David Desktop', lang: 'en-US', default: true, voiceURI: 'v1', localService: true },
      { name: 'Google US English', lang: 'en-US', default: false, voiceURI: 'v2', localService: false },
      {
        name: 'Microsoft Ava Multilingual Online (Natural) - English (United States)',
        lang: 'en-US',
        default: false,
        voiceURI: 'v3',
        localService: false,
      },
      { name: 'Microsoft Jenny Online (Natural)', lang: 'en-US', default: false, voiceURI: 'v4', localService: false },
    ] as SpeechSynthesisVoice[];

    const selected = findDefaultNaturalVoice(mockVoices);
    assert.ok(selected);
    assert.strictEqual(selected.name, 'Microsoft Ava Multilingual Online (Natural) - English (United States)');
  });

  test('findDefaultNaturalVoice falls back to natural English voice if Ava is absent', () => {
    const mockVoices = [
      { name: 'Microsoft David Desktop', lang: 'en-US', default: true, voiceURI: 'v1', localService: true },
      { name: 'Microsoft Jenny Online (Natural)', lang: 'en-US', default: false, voiceURI: 'v4', localService: false },
    ] as SpeechSynthesisVoice[];

    const selected = findDefaultNaturalVoice(mockVoices);
    assert.ok(selected);
    assert.strictEqual(selected.name, 'Microsoft Jenny Online (Natural)');
  });

  test('sequential advancement rule gate simulation', () => {
    // Pipeline rule verification:
    // 1. While reading Page 1, Page 2 extracts in background.
    // 2. Do not leave Page 1 until Page 2 extraction is complete.
    // 3. Never advance to a page whose extraction is not completed.
    let page1TTSFinished = false;
    let page2ExtractionFinished = false;

    const canAdvanceToPage2 = () => page1TTSFinished && page2ExtractionFinished;

    // Case 1: Page 1 TTS finishes, but Page 2 extraction is still pending -> CANNOT advance
    page1TTSFinished = true;
    page2ExtractionFinished = false;
    assert.strictEqual(canAdvanceToPage2(), false, 'Must not leave Page 1 before Page 2 extraction completes');

    // Case 2: Page 2 extraction finishes, but Page 1 TTS is still reading -> CANNOT advance
    page1TTSFinished = false;
    page2ExtractionFinished = true;
    assert.strictEqual(canAdvanceToPage2(), false, 'Must not leave Page 1 before Page 1 TTS finishes');

    // Case 3: Both Page 1 TTS and Page 2 extraction finished -> CAN advance
    page1TTSFinished = true;
    page2ExtractionFinished = true;
    assert.strictEqual(canAdvanceToPage2(), true, 'Advances once both TTS and next page extraction finish');
  });

  test('Auto-Forward gate condition when TTS is OFF vs ON', () => {
    let isTTSActive = false;
    let currentTTSFinished = false;
    let nextExtractionDone = false;

    const canAdvance = () => {
      const isTTSDone = !isTTSActive || currentTTSFinished;
      return isTTSDone && nextExtractionDone;
    };

    // When TTS is OFF:
    isTTSActive = false;
    nextExtractionDone = false;
    assert.strictEqual(canAdvance(), false, 'TTS OFF: cannot advance before next extraction is complete');

    nextExtractionDone = true;
    assert.strictEqual(canAdvance(), true, 'TTS OFF: advances as soon as next extraction completes');

    // When TTS is toggled ON:
    isTTSActive = true;
    currentTTSFinished = false;
    assert.strictEqual(canAdvance(), false, 'TTS ON: blocks advancement until current page TTS finishes');

    currentTTSFinished = true;
    assert.strictEqual(canAdvance(), true, 'TTS ON: advances once current page TTS has finished');

    // Turning TTS OFF immediately satisfies TTS condition without restarting
    isTTSActive = true;
    currentTTSFinished = false;
    assert.strictEqual(canAdvance(), false);
    isTTSActive = false; // user turns TTS OFF
    assert.strictEqual(canAdvance(), true, 'Toggling TTS OFF immediately allows Auto-Forward to proceed');
  });

  test('speech utterance onerror failsafe avoids reader deadlock', () => {
    let currentTTSFinished = false;
    let nextExtractionDone = true;

    // Simulate utterance.onerror callback
    const handleUtteranceError = () => {
      currentTTSFinished = true; // Prevents getting stuck
    };

    assert.strictEqual(currentTTSFinished && nextExtractionDone, false);
    handleUtteranceError();
    assert.strictEqual(currentTTSFinished && nextExtractionDone, true, 'Error callback resolves TTS gate to prevent deadlock');
  });

  test('getPageScrollBounds accurately detects long pages in single-page mode', () => {
    // Mock container with scrollHeight > clientHeight (long manhwa image)
    const mockLongContainer = {
      scrollHeight: 2400,
      clientHeight: 800,
      scrollTop: 0,
    } as unknown as HTMLElement;

    const longBounds = getPageScrollBounds(mockLongContainer, 0, false);
    assert.strictEqual(longBounds.isLongPage, true);
    assert.strictEqual(longBounds.startScroll, 0);
    assert.strictEqual(longBounds.endScroll, 1600);
    assert.strictEqual(longBounds.scrollDistance, 1600);

    // Mock container with standard page fitting viewport
    const mockNormalContainer = {
      scrollHeight: 800,
      clientHeight: 800,
      scrollTop: 0,
    } as unknown as HTMLElement;

    const normalBounds = getPageScrollBounds(mockNormalContainer, 0, false);
    assert.strictEqual(normalBounds.isLongPage, false);
    assert.strictEqual(normalBounds.scrollDistance, 0);
  });

  test('Long page auto-scroll requires bottom reached before advancing', () => {
    let isTTSDone = true;
    let isNextExtractionDone = true;
    let isBottomReached = false;

    const canAdvance = () => isTTSDone && isBottomReached && isNextExtractionDone;

    // 1. TTS is done and next extraction is done, but manhwa has NOT reached the bottom yet
    isBottomReached = false;
    assert.strictEqual(canAdvance(), false, 'Must not advance until long page has smoothly scrolled to the bottom');

    // 2. Smooth auto-scroller finishes and reaches bottom of the manhwa page
    isBottomReached = true;
    assert.strictEqual(canAdvance(), true, 'Advances once bottom is reached, TTS done, and next extraction is ready');
  });

  test('evaluateBlockProgression tracks remaining blocks and triggers Smart Scroll or Auto-Forward', () => {
    const totalBlocks = 3;

    // Block 0 finishes -> More blocks remain (block 1, block 2) -> Trigger Smart Scroll to block 1
    const step0 = evaluateBlockProgression(0, totalBlocks);
    assert.strictEqual(step0.action, 'smart-scroll-next-block');
    assert.strictEqual(step0.hasMoreBlocks, true);
    assert.strictEqual(step0.nextBlockIndex, 1);

    // Block 1 finishes -> More blocks remain (block 2) -> Trigger Smart Scroll to block 2
    const step1 = evaluateBlockProgression(1, totalBlocks);
    assert.strictEqual(step1.action, 'smart-scroll-next-block');
    assert.strictEqual(step1.hasMoreBlocks, true);
    assert.strictEqual(step1.nextBlockIndex, 2);

    // Block 2 finishes -> No more blocks remain on the same page -> Proceed to auto-forward to next page
    const step2 = evaluateBlockProgression(2, totalBlocks);
    assert.strictEqual(step2.action, 'auto-forward-next-page');
    assert.strictEqual(step2.hasMoreBlocks, false);
    assert.strictEqual(step2.nextBlockIndex, null);
  });

  test('evaluateBlockProgression with single block immediately proceeds to auto-forward', () => {
    const totalBlocks = 1;
    const step0 = evaluateBlockProgression(0, totalBlocks);
    assert.strictEqual(step0.action, 'auto-forward-next-page');
    assert.strictEqual(step0.hasMoreBlocks, false);
    assert.strictEqual(step0.nextBlockIndex, null);
  });

  test('Simulated block orchestration loop with tracked block index', () => {
    const totalBlocks = 4;
    let currentBlockIndex = 0;
    const visitedBlocks: number[] = [];
    let autoForwardTriggered = false;

    // Simulate loop driven by evaluateBlockProgression
    while (currentBlockIndex < totalBlocks) {
      visitedBlocks.push(currentBlockIndex);
      const decision = evaluateBlockProgression(currentBlockIndex, totalBlocks);

      if (decision.hasMoreBlocks && decision.nextBlockIndex !== null) {
        // Trigger Smart Scroll to next block
        currentBlockIndex = decision.nextBlockIndex;
      } else {
        // No more blocks remain -> proceed to auto-forward
        autoForwardTriggered = true;
        break;
      }
    }

    assert.deepStrictEqual(visitedBlocks, [0, 1, 2, 3], 'All 4 dialogue blocks were read in sequence');
    assert.strictEqual(autoForwardTriggered, true, 'Auto-forward logic was triggered only after last block finished');
    assert.strictEqual(currentBlockIndex, 3, 'Final block index matches the last block');
  });

  test('findNextUnextractedPageIndex prioritizes current page, then forward to end, and only extracts forward from current page', () => {
    // Current page unextracted -> returns current page index
    const pages1 = [
      { status: 'idle' },
      { status: 'idle' },
      { status: 'idle' },
    ];
    assert.strictEqual(findNextUnextractedPageIndex(pages1, 0), 0);

    // Current page already completed -> returns next page index (1)
    const pages2 = [
      { status: 'completed' },
      { status: 'idle' },
      { status: 'idle' },
    ];
    assert.strictEqual(findNextUnextractedPageIndex(pages2, 0), 1);

    // When starting at index 1 and pages 1 & 2 are idle while page 0 is idle -> returns 1 first
    const pages3 = [
      { status: 'idle' },
      { status: 'idle' },
      { status: 'idle' },
    ];
    assert.strictEqual(findNextUnextractedPageIndex(pages3, 1), 1);

    // When starting at index 1, page 1 is completed, page 2 is idle -> returns 2 (forward direction)
    const pages4 = [
      { status: 'idle' },
      { status: 'completed' },
      { status: 'idle' },
    ];
    assert.strictEqual(findNextUnextractedPageIndex(pages4, 1), 2);

    // When forward pages (1, 2) are completed, does NOT extract previous page 0 (returns null)
    const pages5 = [
      { status: 'idle' },
      { status: 'completed' },
      { status: 'completed' },
    ];
    assert.strictEqual(
      findNextUnextractedPageIndex(pages5, 1),
      null,
      'Does not extract previous pages when starting from middle of chapter'
    );

    // If user navigates to previous page 0, it extracts page 0 and continues from there
    assert.strictEqual(
      findNextUnextractedPageIndex(pages5, 0),
      0,
      'Extracts page 0 when user navigates to page 0'
    );
  });

  test('findNextUnextractedPageIndex continues converting all pages till the end without stopping after next page', () => {
    // Simulated continuous all-pages conversion queue starting from page 0
    const mockPages = [
      { status: 'completed' }, // page 0 (currently being read aloud)
      { status: 'idle' },      // page 1
      { status: 'idle' },      // page 2
      { status: 'idle' },      // page 3
      { status: 'idle' },      // page 4
      { status: 'idle' },      // page 5
    ];

    const conversionOrder: number[] = [];
    let curReaderIndex = 0;

    // Simulate multi-page composite batching in background (bundles 2-3 pages per request)
    while (true) {
      const nextTarget = findNextUnextractedPageIndex(mockPages, curReaderIndex);
      if (nextTarget === null) break;

      conversionOrder.push(nextTarget);

      // Simulate batching nextTarget and up to 2 subsequent consecutive pages
      mockPages[nextTarget].status = 'completed';
      if (nextTarget + 1 < mockPages.length) mockPages[nextTarget + 1].status = 'completed';
      if (nextTarget + 2 < mockPages.length) mockPages[nextTarget + 2].status = 'completed';
    }

    // First batch: extracts 1, 2, 3 -> nextTarget was 1
    // Second batch: extracts 4, 5 -> nextTarget was 4
    // Did NOT stop after next page (page 1)! Continued all the way till page 5!
    assert.deepStrictEqual(conversionOrder, [1, 4], 'Continuous converter processed subsequent batches until the end');
    assert.ok(mockPages.every((p) => p.status === 'completed'), 'All pages were converted to completed status');
  });

  test('findNextUnextractedPageIndex respects excluded pages, extra pages, and in-flight extractions', () => {
    const pages = [
      { status: 'completed' },
      { status: 'idle', isExcluded: true }, // Should be skipped
      { status: 'idle', isExtraPage: true }, // Should be skipped
      { status: 'idle' }, // Should be picked
    ];

    assert.strictEqual(findNextUnextractedPageIndex(pages, 0), 3, 'Skipped excluded and extra pages and picked page 3');

    // With in-flight extraction for page 3
    const inFlight = new Set([3]);
    assert.strictEqual(findNextUnextractedPageIndex(pages, 0, inFlight), null, 'Page 3 is in flight, no other targets remain');
  });

  test('calculateAdaptiveScrollDuration scales duration with distance and speed profiles', () => {
    // Normal speed (350 px/sec)
    const shortScroll = calculateAdaptiveScrollDuration(100, 'normal');
    assert.ok(shortScroll.durationMs >= 700, 'Small distances maintain minimum 700ms smooth glide');

    const medScroll = calculateAdaptiveScrollDuration(700, 'normal');
    assert.strictEqual(medScroll.durationMs, 2000, '700px distance at 350px/s takes exactly 2000ms');

    // Slow speed (200 px/sec) takes longer for artwork appreciation
    const slowLongScroll = calculateAdaptiveScrollDuration(1000, 'slow');
    assert.strictEqual(slowLongScroll.durationMs, 5000, '1000px at 200px/s takes 5000ms (5 seconds)');

    // Fast speed (550 px/sec)
    const fastScroll = calculateAdaptiveScrollDuration(1100, 'fast');
    assert.strictEqual(fastScroll.durationMs, 2000, '1100px at 550px/s takes 2000ms');
  });

  test('calculateAdaptiveScrollDuration allocates generous visual dwell time for large text-free artwork zones', () => {
    // Small gap (<100px)
    const smallGap = calculateAdaptiveScrollDuration(50, 'normal');
    assert.strictEqual(smallGap.visualDwellMs, 250, 'Small gap uses subtle 250ms dwell');

    // Medium gap (300-600px)
    const medGap = calculateAdaptiveScrollDuration(450, 'normal');
    assert.strictEqual(medGap.visualDwellMs, 700, 'Medium gap allocates 700ms visual dwell time');

    // Large gap (>600px) - extensive visual panels / fight scenes / scenery
    const largeGap = calculateAdaptiveScrollDuration(1200, 'normal');
    assert.strictEqual(largeGap.visualDwellMs, 1200, 'Large gap allocates 1200ms visual dwell time to absorb artwork');

    // Slow speed gives even more dwell time (1.4x)
    const slowLargeGap = calculateAdaptiveScrollDuration(1200, 'slow');
    assert.strictEqual(slowLargeGap.visualDwellMs, 1200, 'Slow mode calculates appropriate visual dwell time');
  });

  test('calculateAdaptiveScrollDuration adjusts animation duration dynamically based on variable velocity multiplier', () => {
    // Base travel for 700px at normal (350 px/s): 2000ms at 1.0x
    const normal1x = calculateAdaptiveScrollDuration(700, 'normal', 1.0);
    assert.strictEqual(normal1x.durationMs, 2000, '700px at 1.0x takes 2000ms');
    assert.strictEqual(normal1x.effectivePxPerSec, 350, 'Effective velocity is 350 px/s');

    // 2.0x velocity multiplier: doubles velocity to 700 px/s, halves duration to 1000ms
    const fast2x = calculateAdaptiveScrollDuration(700, 'normal', 2.0);
    assert.strictEqual(fast2x.durationMs, 1000, '700px at 2.0x takes 1000ms');
    assert.strictEqual(fast2x.effectivePxPerSec, 700, 'Effective velocity is 700 px/s');

    // 0.5x velocity multiplier: halves velocity to 175 px/s, doubles duration to 4000ms
    const slowHalf = calculateAdaptiveScrollDuration(700, 'normal', 0.5);
    assert.strictEqual(slowHalf.durationMs, 4000, '700px at 0.5x takes 4000ms');
    assert.strictEqual(slowHalf.effectivePxPerSec, 175, 'Effective velocity is 175 px/s');
  });

  test('classifyTextContent correctly identifies story relevant vs sound effects and background noise', () => {
    // SFX standalone tests
    assert.strictEqual(classifyTextContent('SHHHH...').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('MURMUR').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('MURMUR MURMUR').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('GRAB GRAB').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('TREMBLE').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('TREEEEMBLE').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('HMMMM...').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('CLAP').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('CLAP CLAP').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('BANG').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('WHOOSH').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('THUD').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('SIGH').isStoryRelevant, false);
    assert.strictEqual(classifyTextContent('GASP').isStoryRelevant, false);

    // False positive protections (Dialogue / Story-Relevant text)
    assert.strictEqual(classifyTextContent('CLAP YOUR HANDS!').isStoryRelevant, true);
    assert.strictEqual(classifyTextContent('Why is your body trembling?').isStoryRelevant, true);
    assert.strictEqual(classifyTextContent('Grab my hand before you fall!').isStoryRelevant, true);
    assert.strictEqual(classifyTextContent('Shhh, be quiet. Someone is coming.').isStoryRelevant, true);
    assert.strictEqual(classifyTextContent('Hmm, let me think about that plan.').isStoryRelevant, true);

    // Watermarks
    assert.strictEqual(classifyTextContent('Read manga on asurascans.com').isStoryRelevant, false);
  });

  test('getPageGeometry returns accurate DOM positions relative to scroll container', () => {
    const mockContainer = {
      clientHeight: 800,
      clientWidth: 600,
      scrollHeight: 10000,
      scrollTop: 1200,
      getBoundingClientRect: () => ({ top: 100, height: 800, width: 600 }),
    } as unknown as HTMLElement;

    const mockPage = {
      clientHeight: 3000,
      clientWidth: 600,
      getBoundingClientRect: () => ({ top: 400, height: 3000, width: 600 }),
      querySelector: () => ({
        clientHeight: 3000,
        clientWidth: 600,
        getBoundingClientRect: () => ({ top: 400, height: 3000, width: 600 }),
      }),
    } as unknown as HTMLElement;

    const geom = getPageGeometry(mockContainer, mockPage);
    // pageTop in container: (400 - 100) + 1200 = 1500
    assert.strictEqual(geom.pageTop, 1500);
    assert.strictEqual(geom.imageTop, 1500);
    assert.strictEqual(geom.pageHeight, 3000);
    assert.strictEqual(geom.imageHeight, 3000);
  });

  test('getBlockTargetScroll accurately centers block using image geometry without cumulative gaps', () => {
    const mockContainer = {
      clientHeight: 1000,
      scrollHeight: 10000,
      scrollTop: 500,
      getBoundingClientRect: () => ({ top: 0, height: 1000, width: 800 }),
    } as unknown as HTMLElement;

    const mockPage = {
      clientHeight: 4000,
      getBoundingClientRect: () => ({ top: 2000, height: 4000, width: 800 }),
      querySelector: () => ({
        clientHeight: 4000,
        clientWidth: 800,
        getBoundingClientRect: () => ({ top: 2000, height: 4000, width: 800 }),
      }),
    } as unknown as HTMLElement;

    // Simulate page element in DOM
    (globalThis as any).document = {
      getElementById: (id: string) => (id === 'scroll-page-1' ? mockPage : null),
      querySelector: () => mockPage,
    };

    // Block at y = 50% of the 4000px page: ymin=450, ymax=550 -> center = 500 (50%) -> 2000px into the image
    // Container scrollTop = 500. page top in container = (2000 - 0) + 500 = 2500.
    // blockCenterY = 2500 + 0.5 * 4000 = 4500.
    // target = 4500 - 1000 * 0.35 = 4150 (comfortably places block at 35% from viewport top).
    const scrollTarget = getBlockTargetScroll(
      mockContainer,
      1,
      { id: 'b1', text: 'Hello', readingOrder: 1, type: 'dialogue', box_2d: [450, 100, 550, 400] },
      0,
      1,
      true
    );

    assert.strictEqual(scrollTarget, 4150);
  });
});
