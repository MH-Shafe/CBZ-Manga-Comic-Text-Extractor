import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Header,
} from './components/Header';
import { DropZone } from './components/DropZone';
import { PageViewer } from './components/PageViewer';
import { PageGrid } from './components/PageGrid';
import { TextInspector } from './components/TextInspector';
import { SettingsModal } from './components/SettingsModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ExportModal } from './components/ExportModal';
import { WebComicUrlModal } from './components/WebComicUrlModal';
import { SeriesInfoModal } from './components/SeriesInfoModal';
import {
  MultiChapterExtractModal,
  MultiChapterExtractOptions,
  MultiChapterProcessingState,
} from './components/MultiChapterExtractModal';
import {
  ComicPage,
  ExtractionSettings,
  TextBlock,
  ApiQuotaInfo,
  ComicMetadata,
  ComicChapter,
  ReadingOrderMode,
} from './types';
import {
  parseCbzFile,
  parseAnyComicArchive,
  parseMultipleComicFiles,
  generateDemoCbzPages,
  blobToBase64,
  prepareImageForOcr,
  cleanErrorMessage,
} from './utils/cbzParser';
import {
  exportChapterToCbz,
  fetchWebComicMetadata,
  downloadWebComicPages,
  buildWebComicChapter,
} from './utils/webComicImporter';
import { compileChapterSummary, cleanSfxIcons, formatSfxBlock } from './utils/textExporter';
import { syncClientDailyRequests, recordClientDailyRequest } from './utils/dailyRequests';
import {
  planBatchesBySize,
  stitchBatchToCanvas,
  unpackBatchResult,
  sortBlocksByReadingOrder,
  probeImageDimensions,
  calculateScaledHeight,
  BatchItem,
  CompositeBatch,
  MAX_BATCH_HEIGHT,
  MAX_PAGES_PER_BATCH,
  TARGET_COMPOSITE_WIDTH,
} from './utils/batchOcrStitcher';
import {
  Sparkles,
  LayoutGrid,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  StopCircle,
  FileArchive,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Layers,
  CheckSquare,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useFullscreenPanel } from './hooks/useFullscreenPanel';

export default function App() {
  const [chapters, setChapters] = useState<ComicChapter[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [isLoadingArchive, setIsLoadingArchive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [showMultiChapterModal, setShowMultiChapterModal] = useState<boolean>(false);
  const [multiChapterProcessingState, setMultiChapterProcessingState] =
    useState<MultiChapterProcessingState | null>(null);

  const [activeTab, setActiveTab] = useState<'reader' | 'gallery'>('reader');
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showUrlImportModal, setShowUrlImportModal] = useState<boolean>(false);
  const [urlModalTab, setUrlModalTab] = useState<'search' | 'import' | 'sources'>('search');
  const [isWebSource, setIsWebSource] = useState<boolean>(false);
  const [webSourceUrl, setWebSourceUrl] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [comicMetadata, setComicMetadata] = useState<ComicMetadata | null>(null);
  const [showSeriesInfoModal, setShowSeriesInfoModal] = useState<boolean>(false);
  const [isLoadingChapter, setIsLoadingChapter] = useState<boolean>(false);
  const [loadingChapterMessage, setLoadingChapterMessage] = useState<string>('');
  const [chapterSummary, setChapterSummary] = useState<string>('');
  const [isSynthesizingChapterSummary, setIsSynthesizingChapterSummary] = useState<boolean>(false);

  // PPTX-style Fullscreen Presentation Mode for all 3 view panels (Viewer, Inspector, Gallery)
  const {
    fullscreenPanel,
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
  } = useFullscreenPanel();

  // Settings
  const [settings, setSettings] = useState<ExtractionSettings>(() => {
    const savedKey =
      typeof window !== 'undefined'
        ? localStorage.getItem('cbz_custom_gemini_api_key') || undefined
        : undefined;
    const savedIncludeSpeaker =
      typeof window !== 'undefined'
        ? localStorage.getItem('cbz_tts_include_speaker') === 'true'
        : false;
    return {
      readingOrder: 'manga-rtl',
      filterWatermarks: true,
      filterSfx: false,
      detectExtraPage: true,
      customWatermarkKeywords: 'mangadex, asurascans, reaperscans, readmanga',
      concurrency: 1,
      batchDelayMs: 2000,
      pacingPreset: 'balanced',
      includeSpeakerInTTS: savedIncludeSpeaker,
      showSpeechSubtitles: false,
      customApiKey: savedKey,
    };
  });

  const handleUpdateSettings = useCallback((newSettings: ExtractionSettings) => {
    setSettings((prev) => {
      if (prev.readingOrder !== newSettings.readingOrder) {
        // Automatically re-sort any already extracted page blocks according to the new comic reading order
        updateActivePages((pagesList) =>
          pagesList.map((p) => {
            if (p.blocks && p.blocks.length > 0) {
              const reordered = sortBlocksByReadingOrder(p.blocks, newSettings.readingOrder);
              const assembledText = reordered
                .map((b) => (b.speaker ? `${b.speaker}: ${b.text}` : b.text))
                .join('\n\n');
              return { ...p, blocks: reordered, fullText: assembledText };
            }
            return p;
          })
        );
      }
      return newSettings;
    });
    if (typeof window !== 'undefined') {
      if (typeof newSettings.includeSpeakerInTTS === 'boolean') {
        localStorage.setItem('cbz_tts_include_speaker', newSettings.includeSpeakerInTTS ? 'true' : 'false');
      }
    }
  }, []);

  // Server health, Vision API quota & Gemini API key status check
  const [serverConfig, setServerConfig] = useState<ApiQuotaInfo | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chaptersRef = useRef<ComicChapter[]>(chapters);
  const pagesRef = useRef<ComicPage[]>(pages);
  const activeChapterIndexRef = useRef<number>(activeChapterIndex);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    activeChapterIndexRef.current = activeChapterIndex;
  }, [activeChapterIndex]);

  useEffect(() => {
    fetch('/api/config')
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (data) {
          setServerConfig(data);
          if (data?.dailyRequests) {
            syncClientDailyRequests(data.dailyRequests);
          }
        }
      })
      .catch((err) => console.warn('Could not fetch /api/config:', err));
  }, []);

  // Helper to update current chapter's pages and keep chapters state synchronized
  const updateActivePages = (updater: (prev: ComicPage[]) => ComicPage[]) => {
    setPages((prev) => {
      const updated = updater(prev);
      pagesRef.current = updated;
      setChapters((prevChapters) => {
        const next = prevChapters.map((ch, idx) =>
          idx === activeChapterIndexRef.current ? { ...ch, pages: updated } : ch
        );
        chaptersRef.current = next;
        return next;
      });
      return updated;
    });
  };

  // Switch between chapters in multi-chapter archives
  const handleSelectChapter = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= chapters.length || newIndex === activeChapterIndex) return;
    if (isProcessing) {
      handleStopExtract();
    }
    // Save current chapter state before switching
    const currentActive = activeChapterIndexRef.current;
    const currentPages = pagesRef.current;
    const currentSummary = chapterSummary;

    setChapters((prevChapters) => {
      const next = prevChapters.map((ch, idx) =>
        idx === currentActive
          ? { ...ch, pages: currentPages, chapterSummary: currentSummary }
          : ch
      );
      chaptersRef.current = next;
      return next;
    });

    setActiveChapterIndex(newIndex);
    activeChapterIndexRef.current = newIndex;
    const targetChapter = chaptersRef.current[newIndex] || chapters[newIndex];
    if (targetChapter) {
      setPages(targetChapter.pages);
      pagesRef.current = targetChapter.pages;
      setComicMetadata(targetChapter.metadata || null);
      setChapterSummary(targetChapter.chapterSummary || '');
    }
    setActivePageIndex(0);
  };

  // User-friendly error message formatter to avoid raw technical stack traces
  const formatUserFriendlyFileError = (err: any, fileName?: string): string => {
    const raw = String(err?.message || err || '');
    if (/can't find end of central directory|is not a valid zip|corrupt|CRC32|end of data/i.test(raw)) {
      return `The file "${fileName || 'archive'}" appears to be corrupt or incomplete. Please verify the archive.`;
    }
    if (/no readable chapters|no comic pages|no images found/i.test(raw)) {
      return `No comic images or readable panels were found inside "${fileName || 'the selected file'}".`;
    }
    if (/mht|mhtml|multipart/i.test(raw)) {
      return `The saved webpage file could not be parsed or contains no embedded images.`;
    }
    if (/unsupported file|unknown format/i.test(raw)) {
      return `This file format is not supported. Please select a .cbz, .zip, .mht/.mhtml file, or comic images.`;
    }
    return raw || 'Failed to open the comic file. Please try again.';
  };

  // Handle uploaded CBZ or multi-chapter ZIP file
  const handleFileSelected = async (file: File) => {
    try {
      setIsLoadingArchive(true);
      setErrorMessage(null);

      const result = await parseAnyComicArchive(file);
      if (!result.chapters || result.chapters.length === 0) {
        throw new Error('No readable chapters or comic pages found in the archive.');
      }

      setChapters(result.chapters);
      chaptersRef.current = result.chapters;
      setActiveChapterIndex(0);
      activeChapterIndexRef.current = 0;
      const firstChapter = result.chapters[0];
      console.log('[PAGE STATE] page object created / set in App:', {
        pagesCount: firstChapter.pages.length,
        firstPageUrl: firstChapter.pages[0]?.imageUrl,
        activeFileName: file.name,
      });
      setPages(firstChapter.pages);
      pagesRef.current = firstChapter.pages;
      setComicMetadata(firstChapter.metadata || null);
      setActivePageIndex(0);
      setActiveFileName(file.name);
      setChapterSummary(firstChapter.chapterSummary || '');
      setIsWebSource(false);
      setWebSourceUrl(undefined);
      setIsLoadingArchive(false);
      setActiveTab('reader');
    } catch (err: any) {
      console.error('Failed to parse archive:', err);
      setErrorMessage(formatUserFriendlyFileError(err, file.name));
      setIsLoadingArchive(false);
    }
  };

  // Load interactive demo comic pages
  const handleLoadDemo = async () => {
    try {
      setIsLoadingArchive(true);
      setErrorMessage(null);

      const demo = await generateDemoCbzPages();
      const demoChapter: ComicChapter = {
        id: 'demo-chapter-1',
        index: 0,
        title: demo.metadata.combinedTitle || 'Sample Chapter 1',
        fileName: demo.fileName,
        pages: demo.pages,
        metadata: demo.metadata,
        chapterSummary: compileChapterSummary(demo.pages),
      };
      setChapters([demoChapter]);
      chaptersRef.current = [demoChapter];
      setActiveChapterIndex(0);
      activeChapterIndexRef.current = 0;
      setPages(demo.pages);
      pagesRef.current = demo.pages;
      setComicMetadata(demo.metadata);
      setActivePageIndex(0);
      setActiveFileName(demo.fileName);
      setChapterSummary(demoChapter.chapterSummary || '');
      setIsWebSource(false);
      setWebSourceUrl(undefined);
      setIsLoadingArchive(false);
      setActiveTab('reader');
    } catch (err: any) {
      console.error('Failed to generate demo pages:', err);
      setErrorMessage('Failed to generate demo comic.');
      setIsLoadingArchive(false);
    }
  };

  // Handle imported Web Comic / Webtoon chapter
  const handleWebComicLoaded = (
    chapter: ComicChapter,
    suggestedReadingOrder?: ReadingOrderMode
  ) => {
    setChapters([chapter]);
    chaptersRef.current = [chapter];
    setActiveChapterIndex(0);
    activeChapterIndexRef.current = 0;
    setPages(chapter.pages);
    pagesRef.current = chapter.pages;
    setComicMetadata(chapter.metadata || null);
    setActivePageIndex(0);
    setActiveFileName(chapter.fileName || chapter.title);
    setChapterSummary(chapter.chapterSummary || '');
    setIsWebSource(true);
    setWebSourceUrl(chapter.metadata?.sourceUrl);
    setIsLoadingArchive(false);
    setActiveTab('reader');
    if (suggestedReadingOrder) {
      setSettings((prev) => ({
        ...prev,
        readingOrder: suggestedReadingOrder,
      }));
    }
  };

  // Sorted web chapters in ascending order for consistent next/previous navigation
  const sortedWebChapters = useMemo(() => {
    if (!comicMetadata?.availableChapters || comicMetadata.availableChapters.length === 0) {
      return [];
    }
    return [...comicMetadata.availableChapters].sort((a, b) => {
      const na = parseFloat(a.number) || 0;
      const nb = parseFloat(b.number) || 0;
      return na - nb;
    });
  }, [comicMetadata?.availableChapters]);

  const currentWebChapterIdx = useMemo(() => {
    if (sortedWebChapters.length === 0) return 0;
    const targetUrl = comicMetadata?.currentChapterUrl || comicMetadata?.sourceUrl || '';
    const clean = (u: string) => u.replace(/\/$/, '').toLowerCase();
    let idx = sortedWebChapters.findIndex((c) => clean(c.url) === clean(targetUrl));
    if (idx === -1 && comicMetadata?.chapterNumber) {
      idx = sortedWebChapters.findIndex((c) => c.number === comicMetadata.chapterNumber);
    }
    if (idx === -1 && comicMetadata?.chapterTitle) {
      const titleLower = comicMetadata.chapterTitle.toLowerCase();
      idx = sortedWebChapters.findIndex(
        (c) => c.title.toLowerCase().includes(titleLower) || titleLower.includes(c.title.toLowerCase())
      );
    }
    return idx >= 0 ? idx : 0;
  }, [sortedWebChapters, comicMetadata]);

  const isMultiChapterArchive = chapters.length > 1;
  const isWebMultiChapter = Boolean(
    comicMetadata?.availableChapters && comicMetadata.availableChapters.length > 1
  );

  // Unified Chapter Switcher for both local CBZ multi-chapter archives and Online Manga Series
  const handleNavigateChapter = async (target: string | number) => {
    // 1. If it's a multi-chapter CBZ archive and target is index number
    if (typeof target === 'number' && chapters.length > 1) {
      handleSelectChapter(target);
      return;
    }

    // 2. If it's a numeric string matching CBZ index
    if (typeof target === 'string' && chapters.length > 1 && /^\d+$/.test(target)) {
      const idx = parseInt(target, 10);
      if (idx >= 0 && idx < chapters.length) {
        handleSelectChapter(idx);
        return;
      }
    }

    // 3. If online manga with availableChapters
    const availableChs = comicMetadata?.availableChapters;
    if (!availableChs || availableChs.length === 0) return;

    let targetItem = null;
    if (typeof target === 'number') {
      targetItem = sortedWebChapters[target] || availableChs[target];
    } else {
      targetItem = availableChs.find((c) => c.url === target) || sortedWebChapters.find((c) => c.url === target);
      if (!targetItem && /^\d+$/.test(target)) {
        const numIdx = parseInt(target, 10);
        targetItem = sortedWebChapters[numIdx] || availableChs[numIdx];
      }
    }

    if (!targetItem || !targetItem.url) return;

    if (isProcessing) {
      handleStopExtract();
    }

    setIsLoadingChapter(true);
    setLoadingChapterMessage(
      `Loading ${targetItem.title || `Chapter ${targetItem.number}`}...`
    );
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await fetchWebComicMetadata(targetItem.url);
      const chosenOrder = data.readingOrder || settings.readingOrder;

      const downloadedPages = await downloadWebComicPages(
        data.pages,
        (progress) => {
          setLoadingChapterMessage(
            `Downloading panels (${progress.current}/${progress.total}) for ${targetItem.title || 'Chapter ' + targetItem.number}...`
          );
        },
        controller.signal
      );

      if (downloadedPages.length === 0) {
        throw new Error('No comic pages could be downloaded for this chapter.');
      }

      const mergedData = {
        ...data,
        seriesTitle: comicMetadata?.series || comicMetadata?.mangaTitle || data.seriesTitle,
        availableChapters: availableChs,
      };

      const newChapter = buildWebComicChapter(mergedData, downloadedPages);

      setChapters([newChapter]);
      chaptersRef.current = [newChapter];
      setActiveChapterIndex(0);
      activeChapterIndexRef.current = 0;
      setPages(newChapter.pages);
      pagesRef.current = newChapter.pages;
      setComicMetadata(newChapter.metadata || null);
      setActivePageIndex(0);
      setActiveFileName(newChapter.fileName || newChapter.title);
      setChapterSummary(newChapter.chapterSummary || '');
      setIsWebSource(true);
      setWebSourceUrl(newChapter.metadata?.sourceUrl);
      setActiveTab('reader');
    } catch (err: any) {
      if (!controller.signal.aborted) {
        console.error('Failed to load chapter:', err);
        setErrorMessage(err?.message || 'Failed to load chapter panels.');
      }
    } finally {
      setIsLoadingChapter(false);
      setLoadingChapterMessage('');
      abortControllerRef.current = null;
    }
  };

  // Unified Chapter Navigation Props
  const navTotalChapters = isMultiChapterArchive
    ? chapters.length
    : isWebMultiChapter
    ? sortedWebChapters.length
    : 1;

  const navCurrentChapterIndex = isMultiChapterArchive
    ? activeChapterIndex
    : isWebMultiChapter
    ? currentWebChapterIdx
    : 0;

  const navCurrentChapterTitle = isMultiChapterArchive
    ? chapters[activeChapterIndex]?.title
    : isWebMultiChapter
    ? sortedWebChapters[currentWebChapterIdx]?.title || comicMetadata?.chapterTitle || chapters[0]?.title
    : chapters[0]?.title || 'Chapter 1';

  const navHasPreviousChapter = isMultiChapterArchive
    ? activeChapterIndex > 0
    : isWebMultiChapter
    ? currentWebChapterIdx > 0
    : false;

  const navHasNextChapter = isMultiChapterArchive
    ? activeChapterIndex < chapters.length - 1
    : isWebMultiChapter
    ? currentWebChapterIdx < sortedWebChapters.length - 1
    : false;

  const navOnPreviousChapter = () => {
    if (isMultiChapterArchive) {
      handleSelectChapter(activeChapterIndex - 1);
    } else if (isWebMultiChapter && currentWebChapterIdx > 0) {
      handleNavigateChapter(sortedWebChapters[currentWebChapterIdx - 1]?.url);
    }
  };

  const navOnNextChapter = () => {
    if (isMultiChapterArchive) {
      handleSelectChapter(activeChapterIndex + 1);
    } else if (isWebMultiChapter && currentWebChapterIdx < sortedWebChapters.length - 1) {
      handleNavigateChapter(sortedWebChapters[currentWebChapterIdx + 1]?.url);
    }
  };

  const navAvailableChapters = isMultiChapterArchive
    ? chapters.map((c, i) => ({ id: c.id, number: String(i + 1), title: c.title, url: String(i) }))
    : isWebMultiChapter
    ? sortedWebChapters
    : undefined;

  // Export current chapter panels as a .cbz archive file
  const handleDownloadCurrentAsCbz = async () => {
    if (pages.length === 0) return;
    const currentChapter = chapters[activeChapterIndex] || chapters[0];
    const fileName =
      currentChapter?.fileName ||
      (activeFileName.endsWith('.cbz') ? activeFileName : `${activeFileName || 'chapter'}.cbz`);
    await exportChapterToCbz(pages, fileName);
  };

  // Handle multiple uploaded comic archives / chapters
  const handleFilesSelected = async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (files.length === 1) {
      return handleFileSelected(files[0]);
    }

    try {
      setIsLoadingArchive(true);
      setErrorMessage(null);

      const parseResult = await parseMultipleComicFiles(files, (title, current, total) => {
        // Unpacking progress
      });

      const parsedChapters = parseResult.chapters;
      if (!parsedChapters || parsedChapters.length === 0) {
        throw new Error('No readable chapters found across the selected files.');
      }

      setChapters(parsedChapters);
      chaptersRef.current = parsedChapters;
      setActiveChapterIndex(0);
      activeChapterIndexRef.current = 0;
      const firstChapter = parsedChapters[0];
      setPages(firstChapter.pages);
      pagesRef.current = firstChapter.pages;
      setComicMetadata(firstChapter.metadata || null);
      setActivePageIndex(0);
      setActiveFileName(parseResult.archiveName || `${files.length} Chapters (${files[0].name}...)`);
      setChapterSummary(firstChapter.chapterSummary || '');
      setIsWebSource(false);
      setWebSourceUrl(undefined);
      setIsLoadingArchive(false);
      setActiveTab('reader');
    } catch (err: any) {
      console.error('Failed to parse multiple files:', err);
      setErrorMessage(formatUserFriendlyFileError(err, files[0]?.name));
      setIsLoadingArchive(false);
    }
  };

  // Synthesize a cohesive full chapter summary across extracted pages
  const handleSynthesizeChapterSummary = async (
    customTitle?: string,
    targetChapterIndex?: number,
    pagesOverride?: ComicPage[]
  ): Promise<string> => {
    try {
      setIsSynthesizingChapterSummary(true);
      const targetIdx =
        targetChapterIndex !== undefined ? targetChapterIndex : activeChapterIndexRef.current;
      const targetChapter = chaptersRef.current[targetIdx] || chapters[targetIdx];
      const targetPages = pagesOverride || (targetChapter ? targetChapter.pages : pagesRef.current);
      const storyPages = targetPages.filter((p) => !p.isExcluded && !p.isExtraPage);

      const title =
        customTitle ||
        targetChapter?.title ||
        comicMetadata?.combinedTitle ||
        comicMetadata?.bookTitle ||
        chaptersRef.current[targetIdx]?.title ||
        activeFileName.replace(/\.(cbz|zip)$/i, '') ||
        'Chapter';

      // Check if any story page has extracted text or summaries
      const hasExtractedContent = storyPages.some(
        (p) =>
          (p.pageSummary && p.pageSummary.trim()) ||
          (p.fullText && p.fullText.trim()) ||
          (p.blocks && p.blocks.length > 0 && p.blocks.some((b) => b.text && b.text.trim()))
      );

      // If no page has been extracted yet, do not query AI or set an error message
      if (!hasExtractedContent) {
        const defaultCompiled = compileChapterSummary(storyPages);
        if (targetIdx === activeChapterIndexRef.current) {
          setChapterSummary('');
        }
        return defaultCompiled;
      }

      const existingSummary =
        targetChapter?.chapterSummary?.trim() ||
        (targetIdx === activeChapterIndexRef.current ? chapterSummary?.trim() : '') ||
        compileChapterSummary(storyPages);

      const response = await fetch('/api/generate-chapter-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.customApiKey ? { 'x-gemini-api-key': settings.customApiKey } : {}),
        },
        body: JSON.stringify({
          pages: storyPages,
          chapterTitle: title,
          readingOrder: settings.readingOrder,
          customApiKey: settings.customApiKey,
          currentSummary: existingSummary,
        }),
      });

      const responseText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(responseText);
      } catch {
        const firstBrace = responseText.indexOf('{');
        const lastBrace = responseText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            data = JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
          } catch {
            data = null;
          }
        }
      }

      if (!response.ok) {
        const rawErr = data?.error || data?.message || responseText || `HTTP ${response.status}`;
        throw new Error(cleanErrorMessage(rawErr));
      }

      if (data?.dailyRequests) {
        syncClientDailyRequests(data.dailyRequests);
      } else {
        recordClientDailyRequest();
      }

      let result = (data?.chapterSummary || '').trim();
      // Ensure we never accept "No extracted story pages..." as a valid chapter summary
      if (
        !result ||
        result.toLowerCase().includes('no extracted story pages') ||
        data.source === 'empty'
      ) {
        result = compileChapterSummary(storyPages);
      }

      if (targetIdx === activeChapterIndexRef.current) {
        setChapterSummary(result);
      }
      setChapters((prev) =>
        prev.map((ch, idx) => (idx === targetIdx ? { ...ch, chapterSummary: result } : ch))
      );
      chaptersRef.current = chaptersRef.current.map((ch, idx) =>
        idx === targetIdx ? { ...ch, chapterSummary: result } : ch
      );
      return result;
    } catch (err) {
      console.warn('Chapter summary AI synthesis fallback:', err);
      const targetIdx =
        targetChapterIndex !== undefined ? targetChapterIndex : activeChapterIndexRef.current;
      const targetChapter = chaptersRef.current[targetIdx] || chapters[targetIdx];
      const targetPages = pagesOverride || (targetChapter ? targetChapter.pages : pagesRef.current);
      const storyPages = targetPages.filter((p) => !p.isExcluded && !p.isExtraPage);
      const fallback = compileChapterSummary(storyPages);

      if (targetIdx === activeChapterIndexRef.current) {
        setChapterSummary(fallback);
      }
      setChapters((prev) =>
        prev.map((ch, idx) => (idx === targetIdx ? { ...ch, chapterSummary: fallback } : ch))
      );
      chaptersRef.current = chaptersRef.current.map((ch, idx) =>
        idx === targetIdx ? { ...ch, chapterSummary: fallback } : ch
      );
      return fallback;
    } finally {
      setIsSynthesizingChapterSummary(false);
    }
  };

  // Extract text for a batch of pages (supports combined multi-page composite canvas)
  const extractBatch = async (
    batch: CompositeBatch,
    signal?: AbortSignal
  ): Promise<boolean> => {
    if (!batch || batch.items.length === 0) return false;
    const chapterIndex = batch.chapterIndex;

    const pageIndicesSet = new Set(batch.items.map((it) => it.pageIndex));
    chaptersRef.current = chaptersRef.current.map((ch, cIdx) =>
      cIdx === chapterIndex
        ? {
            ...ch,
            pages: ch.pages.map((p, pIdx) =>
              pageIndicesSet.has(pIdx) ? { ...p, status: 'extracting', error: undefined } : p
            ),
          }
        : ch
    );
    if (chapterIndex === activeChapterIndexRef.current) {
      pagesRef.current = pagesRef.current.map((p, pIdx) =>
        pageIndicesSet.has(pIdx) ? { ...p, status: 'extracting', error: undefined } : p
      );
    }
    setChapters((prev) =>
      prev.map((ch, cIdx) =>
        cIdx === chapterIndex
          ? {
              ...ch,
              pages: ch.pages.map((p, pIdx) =>
                pageIndicesSet.has(pIdx) ? { ...p, status: 'extracting', error: undefined } : p
              ),
            }
          : ch
      )
    );
    if (chapterIndex === activeChapterIndexRef.current) {
      setPages((prev) =>
        prev.map((p, pIdx) =>
          pageIndicesSet.has(pIdx) ? { ...p, status: 'extracting', error: undefined } : p
        )
      );
    }

    try {
      let base64Data: string;
      let optMime: string = 'image/jpeg';

      if (batch.items.length === 1) {
        const prep = await prepareImageForOcr(batch.items[0].page.blob);
        base64Data = prep.base64;
        optMime = prep.mimeType || 'image/jpeg';
      } else {
        const stitched = await stitchBatchToCanvas(batch);
        base64Data = stitched.base64;
        optMime = stitched.mimeType || 'image/jpeg';
      }

      const response = await fetch('/api/extract-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.customApiKey ? { 'x-gemini-api-key': settings.customApiKey } : {}),
        },
        signal,
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: optMime,
          readingOrder: settings.readingOrder,
          filterWatermarks: settings.filterWatermarks,
          filterSfx: settings.filterSfx,
          detectExtraPage: settings.detectExtraPage,
          customWatermarkKeywords: settings.customWatermarkKeywords,
          pageNumber: batch.items[0].pageIndex + 1,
          pageCount: batch.items.length,
          customApiKey: settings.customApiKey,
        }),
      });

      const responseText = await response.text();
      const trimmedText = responseText.trim();
      let result: any = null;

      try {
        result = JSON.parse(trimmedText);
      } catch {
        const firstBrace = trimmedText.indexOf('{');
        const lastBrace = trimmedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            result = JSON.parse(trimmedText.slice(firstBrace, lastBrace + 1));
          } catch {
            result = null;
          }
        }
      }

      if (!response.ok) {
        const rawErr = result?.error || result?.message || trimmedText;
        throw new Error(cleanErrorMessage(rawErr));
      }

      if (!result) {
        throw new Error(cleanErrorMessage(trimmedText || `Extraction request failed (status ${response.status})`));
      }

      if (result?.dailyRequests) {
        syncClientDailyRequests(result.dailyRequests);
      } else {
        recordClientDailyRequest();
      }

      // Unpack batch results and map coordinates back to individual pages with strict reading order
      const resultMap = unpackBatchResult(batch, result, settings.readingOrder);

      chaptersRef.current = chaptersRef.current.map((ch, cIdx) =>
        cIdx === chapterIndex
          ? {
              ...ch,
              pages: ch.pages.map((p, pIdx) => {
                const unpacked = resultMap.get(pIdx);
                if (unpacked) {
                  return {
                    ...p,
                    status: 'completed' as const,
                    isExtraPage: unpacked.isExtraPage,
                    extraPageReason: unpacked.extraPageReason || '',
                    pageSummary: unpacked.pageSummary,
                    blocks: unpacked.blocks,
                    fullText: unpacked.fullText,
                    isExcluded: unpacked.isExtraPage ? true : p.isExcluded,
                    error: undefined,
                  };
                }
                return p;
              }),
            }
          : ch
      );

      if (chapterIndex === activeChapterIndexRef.current) {
        pagesRef.current = pagesRef.current.map((p, pIdx) => {
          const unpacked = resultMap.get(pIdx);
          if (unpacked) {
            return {
              ...p,
              status: 'completed' as const,
              isExtraPage: unpacked.isExtraPage,
              extraPageReason: unpacked.extraPageReason || '',
              pageSummary: unpacked.pageSummary,
              blocks: unpacked.blocks,
              fullText: unpacked.fullText,
              isExcluded: unpacked.isExtraPage ? true : p.isExcluded,
              error: undefined,
            };
          }
          return p;
        });
      }

      setChapters((prev) =>
        prev.map((ch, cIdx) =>
          cIdx === chapterIndex
            ? {
                ...ch,
                pages: ch.pages.map((p, pIdx) => {
                  const unpacked = resultMap.get(pIdx);
                  if (unpacked) {
                    return {
                      ...p,
                      status: 'completed' as const,
                      isExtraPage: unpacked.isExtraPage,
                      extraPageReason: unpacked.extraPageReason || '',
                      pageSummary: unpacked.pageSummary,
                      blocks: unpacked.blocks,
                      fullText: unpacked.fullText,
                      isExcluded: unpacked.isExtraPage ? true : p.isExcluded,
                      error: undefined,
                    };
                  }
                  return p;
                }),
              }
            : ch
        )
      );

      if (chapterIndex === activeChapterIndexRef.current) {
        setPages((prev) =>
          prev.map((p, pIdx) => {
            const unpacked = resultMap.get(pIdx);
            if (unpacked) {
              return {
                ...p,
                status: 'completed' as const,
                isExtraPage: unpacked.isExtraPage,
                extraPageReason: unpacked.extraPageReason || '',
                pageSummary: unpacked.pageSummary,
                blocks: unpacked.blocks,
                fullText: unpacked.fullText,
                isExcluded: unpacked.isExtraPage ? true : p.isExcluded,
                error: undefined,
              };
            }
            return p;
          })
        );
      }

      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        chaptersRef.current = chaptersRef.current.map((ch, cIdx) =>
          cIdx === chapterIndex
            ? {
                ...ch,
                pages: ch.pages.map((p, pIdx) =>
                  pageIndicesSet.has(pIdx) ? { ...p, status: 'idle' } : p
                ),
              }
            : ch
        );
        if (chapterIndex === activeChapterIndexRef.current) {
          pagesRef.current = pagesRef.current.map((p, pIdx) =>
            pageIndicesSet.has(pIdx) ? { ...p, status: 'idle' } : p
          );
        }
        setChapters((prev) =>
          prev.map((ch, cIdx) =>
            cIdx === chapterIndex
              ? {
                  ...ch,
                  pages: ch.pages.map((p, pIdx) =>
                    pageIndicesSet.has(pIdx) ? { ...p, status: 'idle' } : p
                  ),
                }
              : ch
          )
        );
        if (chapterIndex === activeChapterIndexRef.current) {
          setPages((prev) =>
            prev.map((p, pIdx) =>
              pageIndicesSet.has(pIdx) ? { ...p, status: 'idle' } : p
            )
          );
        }
        return false;
      }

      const cleanMsg = cleanErrorMessage(err);
      console.warn(`Extraction error for batch in chapter ${chapterIndex + 1}:`, cleanMsg);
      chaptersRef.current = chaptersRef.current.map((ch, cIdx) =>
        cIdx === chapterIndex
          ? {
              ...ch,
              pages: ch.pages.map((p, pIdx) =>
                pageIndicesSet.has(pIdx) ? { ...p, status: 'error', error: cleanMsg } : p
              ),
            }
          : ch
      );
      if (chapterIndex === activeChapterIndexRef.current) {
        pagesRef.current = pagesRef.current.map((p, pIdx) =>
          pageIndicesSet.has(pIdx) ? { ...p, status: 'error', error: cleanMsg } : p
        );
      }
      setChapters((prev) =>
        prev.map((ch, cIdx) =>
          cIdx === chapterIndex
            ? {
                ...ch,
                pages: ch.pages.map((p, pIdx) =>
                  pageIndicesSet.has(pIdx) ? { ...p, status: 'error', error: cleanMsg } : p
                ),
              }
            : ch
        )
      );
      if (chapterIndex === activeChapterIndexRef.current) {
        setPages((prev) =>
          prev.map((p, pIdx) =>
            pageIndicesSet.has(pIdx) ? { ...p, status: 'error', error: cleanMsg } : p
          )
        );
      }
      return false;
    }
  };

  // Extract text for a page, bundling upcoming 2-3 consecutive unextracted pages into a single composite extraction
  const extractChapterPage = async (
    chapterIndex: number,
    pageIndex: number,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const chapter = chaptersRef.current[chapterIndex] || chapters[chapterIndex];
    if (!chapter) return false;
    const page = chapter.pages[pageIndex];
    if (!page) return false;

    // Probe base page dimensions
    const baseDims = await probeImageDimensions(page.blob);
    const origW0 = baseDims.width || 800;
    const origH0 = baseDims.height || 1150;
    const scaledH0 = calculateScaledHeight(origW0, origH0, TARGET_COMPOSITE_WIDTH);

    // If current page is already a long manhwa strip (> 3600px), process as single page
    const candidateIndices = [pageIndex];
    let cumulativeHeight = scaledH0;

    if (scaledH0 <= 3600) {
      // Check if upcoming consecutive pages can be bundled (up to 3 pages total, staying <= MAX_BATCH_HEIGHT)
      for (let offset = 1; offset <= 2; offset++) {
        const nextIdx = pageIndex + offset;
        const nextPage = chapter.pages[nextIdx];
        if (
          nextPage &&
          !nextPage.isExcluded &&
          !nextPage.isExtraPage &&
          nextPage.status !== 'completed' &&
          nextPage.status !== 'extracting'
        ) {
          const nextDims = await probeImageDimensions(nextPage.blob);
          const nextW = nextDims.width || 800;
          const nextH = nextDims.height || 1150;
          const nextScaledH = calculateScaledHeight(nextW, nextH, TARGET_COMPOSITE_WIDTH);

          if (cumulativeHeight + nextScaledH <= MAX_BATCH_HEIGHT) {
            candidateIndices.push(nextIdx);
            cumulativeHeight += nextScaledH;
          } else {
            break;
          }
        } else {
          break; // Keep consecutive sequence
        }
      }
    }

    if (candidateIndices.length === 1) {
      const singleBatch: CompositeBatch = {
        id: `single-ch${chapterIndex}-p${pageIndex}`,
        chapterIndex,
        items: [
          {
            pageIndex,
            chapterIndex,
            page,
            originalWidth: origW0,
            originalHeight: origH0,
            scaledHeight: scaledH0,
            yStart: 0,
            yEnd: scaledH0,
          },
        ],
        totalWidth: TARGET_COMPOSITE_WIDTH,
        totalHeight: scaledH0,
      };
      return extractBatch(singleBatch, signal);
    }

    // Bundle multi-page composite strip
    let currentY = 0;
    const items: BatchItem[] = [];
    for (const pIdx of candidateIndices) {
      const p = chapter.pages[pIdx];
      const dims = await probeImageDimensions(p.blob);
      const origW = dims.width || 800;
      const origH = dims.height || 1150;
      const scaledH = calculateScaledHeight(origW, origH, TARGET_COMPOSITE_WIDTH);
      items.push({
        pageIndex: pIdx,
        chapterIndex,
        page: p,
        originalWidth: origW,
        originalHeight: origH,
        scaledHeight: scaledH,
        yStart: currentY,
        yEnd: currentY + scaledH,
      });
      currentY += scaledH;
    }

    const multiBatch: CompositeBatch = {
      id: `bundle-ch${chapterIndex}-p${candidateIndices[0] + 1}_to_${candidateIndices[candidateIndices.length - 1] + 1}`,
      chapterIndex,
      items,
      totalWidth: TARGET_COMPOSITE_WIDTH,
      totalHeight: currentY,
    };

    return extractBatch(multiBatch, signal);
  };

  // Extract text for a single page in current active chapter
  const extractSinglePage = async (
    pageIndex: number,
    signal?: AbortSignal
  ): Promise<boolean> => {
    const currentActiveIdx = activeChapterIndexRef.current;
    const success = await extractChapterPage(currentActiveIdx, pageIndex, signal);
    if (success && !signal?.aborted) {
      const latestPages = pagesRef.current;
      const remainingUnextracted = latestPages.filter(
        (p) => !p.isExcluded && !p.isExtraPage && p.status !== 'completed'
      );
      if (remainingUnextracted.length === 0) {
        const completedPages = latestPages.filter(
          (p) => !p.isExcluded && !p.isExtraPage && p.status === 'completed'
        );
        if (completedPages.length > 0) {
          handleSynthesizeChapterSummary(undefined, currentActiveIdx, latestPages).catch((e) =>
            console.warn('Auto chapter summary synthesis on page completion:', e)
          );
        }
      }
    }
    return success;
  };

  // Extract a batch of pages or continue sequentially through the full manga
  const handleBatchExtract = async (targetIndices?: number[]) => {
    const allChapters = chaptersRef.current.length > 0 ? chaptersRef.current : chapters;
    if (allChapters.length === 0) return;

    setIsProcessing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Case 1: User explicitly selected specific page indices (e.g. from gallery overview)
      if (targetIndices && targetIndices.length > 0) {
        const currentActiveIdx = activeChapterIndexRef.current;
        const currentChapter = allChapters[currentActiveIdx];
        if (!currentChapter) return;

        const candidatePages = targetIndices
          .map((pIdx) => ({
            page: currentChapter.pages[pIdx],
            pageIndex: pIdx,
            chapterIndex: currentActiveIdx,
          }))
          .filter((it) => it.page && !it.page.isExcluded);

        if (candidatePages.length === 0) return;

        const pagesWithDimensions = await Promise.all(
          candidatePages.map(async (item) => {
            const dims = await probeImageDimensions(item.page.blob);
            return { ...item, width: dims.width, height: dims.height };
          })
        );

        // Group by optimal size (excludes last page if size goes over)
        const plannedBatches = planBatchesBySize(
          pagesWithDimensions,
          MAX_BATCH_HEIGHT,
          MAX_PAGES_PER_BATCH,
          TARGET_COMPOSITE_WIDTH
        );

        let completedPages = 0;
        setProcessingProgress({ current: 0, total: candidatePages.length });

        for (let bIdx = 0; bIdx < plannedBatches.length; bIdx++) {
          if (controller.signal.aborted) break;
          const batch = plannedBatches[bIdx];
          await extractBatch(batch, controller.signal);
          completedPages += batch.items.length;
          setProcessingProgress({
            current: Math.min(completedPages, candidatePages.length),
            total: candidatePages.length,
          });

          if (bIdx < plannedBatches.length - 1 && !controller.signal.aborted) {
            const delay = settings.batchDelayMs ?? 1500;
            if (delay > 0) await new Promise((res) => setTimeout(res, delay));
          }
        }
        return;
      }

      // Case 2: User started OCR: Continue to finish the FULL manga across all chapters!
      const chapterOrder: number[] = [];
      const activeIdx = activeChapterIndexRef.current;
      chapterOrder.push(activeIdx);
      for (let i = 0; i < allChapters.length; i++) {
        if (i !== activeIdx) chapterOrder.push(i);
      }

      // Count total pending pages across the full manga
      let totalMangaPending = 0;
      chapterOrder.forEach((cIdx) => {
        const ch = chaptersRef.current[cIdx] || allChapters[cIdx];
        if (!ch) return;
        totalMangaPending += ch.pages.filter((p) => !p.isExcluded && p.status !== 'completed').length;
      });

      // If all completed, allow re-running all non-excluded pages
      const forceAll = totalMangaPending === 0;
      if (forceAll) {
        chapterOrder.forEach((cIdx) => {
          const ch = chaptersRef.current[cIdx] || allChapters[cIdx];
          if (!ch) return;
          totalMangaPending += ch.pages.filter((p) => !p.isExcluded).length;
        });
      }

      let totalPagesCompletedSoFar = 0;
      setProcessingProgress({ current: 0, total: totalMangaPending });

      for (let c = 0; c < chapterOrder.length; c++) {
        if (controller.signal.aborted) break;
        const cIdx = chapterOrder[c];
        const ch = chaptersRef.current[cIdx] || allChapters[cIdx];
        if (!ch) continue;

        const candidatePages = ch.pages
          .map((page, pageIndex) => ({ page, pageIndex, chapterIndex: cIdx }))
          .filter((it) => !it.page.isExcluded && (forceAll || it.page.status !== 'completed'));

        if (candidatePages.length === 0) continue;

        // Switch active chapter in UI so user observes real-time chapter progression
        if (activeChapterIndexRef.current !== cIdx) {
          setActiveChapterIndex(cIdx);
          activeChapterIndexRef.current = cIdx;
          setPages(ch.pages);
          pagesRef.current = ch.pages;
          setComicMetadata(ch.metadata || null);
          setChapterSummary(ch.chapterSummary || '');
        }

        // Measure page dimensions for accurate vertical strip sizing
        const pagesWithDimensions = await Promise.all(
          candidatePages.map(async (item) => {
            const dims = await probeImageDimensions(item.page.blob);
            return { ...item, width: dims.width, height: dims.height };
          })
        );

        // Group into size-optimal batches (if adding next page goes over 5200px or 4 pages, exclude last page for next batch)
        const plannedBatches = planBatchesBySize(
          pagesWithDimensions,
          MAX_BATCH_HEIGHT,
          MAX_PAGES_PER_BATCH,
          TARGET_COMPOSITE_WIDTH
        );

        for (let bIdx = 0; bIdx < plannedBatches.length; bIdx++) {
          if (controller.signal.aborted) break;
          const batch = plannedBatches[bIdx];

          await extractBatch(batch, controller.signal);
          totalPagesCompletedSoFar += batch.items.length;

          setProcessingProgress({
            current: Math.min(totalPagesCompletedSoFar, totalMangaPending),
            total: totalMangaPending,
          });

          if (
            (bIdx < plannedBatches.length - 1 || c < chapterOrder.length - 1) &&
            !controller.signal.aborted
          ) {
            const delay = settings.batchDelayMs ?? 1500;
            if (delay > 0) await new Promise((res) => setTimeout(res, delay));
          }
        }

        // When chapter finishes, synthesize full chapter summary
        if (!controller.signal.aborted) {
          const latestPages = chaptersRef.current[cIdx]?.pages || [];
          const completedPages = latestPages.filter(
            (p) => !p.isExcluded && !p.isExtraPage && p.status === 'completed'
          );
          if (completedPages.length > 0) {
            try {
              await handleSynthesizeChapterSummary(undefined, cIdx, latestPages);
            } catch (err) {
              console.warn('Auto chapter summary synthesis error:', err);
            }
          }
        }
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // Extract multiple selected chapters with one click
  const handleMultiChapterExtract = async (
    selectedChapterIndices: number[],
    options: MultiChapterExtractOptions
  ) => {
    if (selectedChapterIndices.length === 0) return;

    // Collect all tasks across chosen chapters
    const tasks: { chapterIndex: number; pageIndex: number }[] = [];
    selectedChapterIndices.forEach((chIdx) => {
      const ch = chaptersRef.current[chIdx] || chapters[chIdx];
      if (!ch) return;
      ch.pages.forEach((p, pIdx) => {
        if (p.isExcluded) return;
        if (options.skipCompletedPages && p.status === 'completed') return;
        tasks.push({ chapterIndex: chIdx, pageIndex: pIdx });
      });
    });

    if (tasks.length === 0) {
      setErrorMessage(
        'All pages in the selected chapters are already completed. Uncheck "Skip already completed pages" if you wish to force re-extraction.'
      );
      return;
    }

    setIsProcessing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let overallCurrent = 0;
    const overallTotal = tasks.length;

    for (let cIdxIdx = 0; cIdxIdx < selectedChapterIndices.length; cIdxIdx++) {
      if (controller.signal.aborted) break;
      const chIdx = selectedChapterIndices[cIdxIdx];
      const ch = chaptersRef.current[chIdx] || chapters[chIdx];
      if (!ch) continue;

      // Make this chapter active in the UI so the user can see live progress
      setActiveChapterIndex(chIdx);
      activeChapterIndexRef.current = chIdx;
      setPages(ch.pages);
      pagesRef.current = ch.pages;
      setComicMetadata(ch.metadata || null);
      setChapterSummary(ch.chapterSummary || '');

      const chapterCandidatePages = ch.pages
        .map((page, pageIndex) => ({ page, pageIndex, chapterIndex: chIdx }))
        .filter((it) => !it.page.isExcluded && (!options.skipCompletedPages || it.page.status !== 'completed'));

      const pagesWithDimensions = await Promise.all(
        chapterCandidatePages.map(async (item) => {
          const dims = await probeImageDimensions(item.page.blob);
          return { ...item, width: dims.width, height: dims.height };
        })
      );

      const chapterBatches = planBatchesBySize(
        pagesWithDimensions,
        MAX_BATCH_HEIGHT,
        MAX_PAGES_PER_BATCH,
        TARGET_COMPOSITE_WIDTH
      );

      for (let bIdx = 0; bIdx < chapterBatches.length; bIdx++) {
        if (controller.signal.aborted) break;
        const batch = chapterBatches[bIdx];
        overallCurrent += batch.items.length;

        setMultiChapterProcessingState({
          chapterIndex: chIdx,
          chapterTitle: ch.title,
          chapterCurrent: cIdxIdx + 1,
          chapterTotal: selectedChapterIndices.length,
          pageCurrent: Math.min(overallCurrent, chapterCandidatePages.length),
          pageTotal: chapterCandidatePages.length,
          overallPageCurrent: overallCurrent,
          overallPageTotal: overallTotal,
          statusText: `Extracting ${ch.title} — Batch ${bIdx + 1}/${chapterBatches.length} (${batch.items.length} pages combined)`,
        });

        setProcessingProgress({
          current: overallCurrent,
          total: overallTotal,
        });

        await extractBatch(batch, controller.signal);

        // Pacing interval between requests
        if (overallCurrent < overallTotal && !controller.signal.aborted) {
          const delay = settings.batchDelayMs ?? 1500;
          if (delay > 0) {
            await new Promise((res) => setTimeout(res, delay));
          }
        }
      }

      // When this chapter is done extraction, generate the full summary of that chapter!
      if (!controller.signal.aborted) {
        const latestChapters = chaptersRef.current;
        const currentCh = latestChapters[chIdx];
        const chPages = currentCh ? currentCh.pages : [];
        const hasCompletedPages = chPages.some(
          (p) => !p.isExcluded && !p.isExtraPage && p.status === 'completed'
        );

        if (hasCompletedPages) {
          try {
            setMultiChapterProcessingState((prev) =>
              prev ? { ...prev, statusText: `Generating full summary for ${ch.title}...` } : null
            );
            await handleSynthesizeChapterSummary(ch.title, chIdx, chPages);
          } catch (err) {
            console.warn('Auto chapter summary failed for chapter:', ch.title, err);
          }
        }
      }
    }

    setIsProcessing(false);
    setMultiChapterProcessingState(null);
    abortControllerRef.current = null;
  };

  const handleStopExtract = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
  };

  // Toggle page exclusion
  const handleToggleExclude = (index: number) => {
    updateActivePages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, isExcluded: !p.isExcluded } : p))
    );
  };

  // Exclude all detected extra pages
  const handleExcludeAllExtraPages = () => {
    updateActivePages((prev) =>
      prev.map((p) => (p.isExtraPage ? { ...p, isExcluded: true } : p))
    );
  };

  // Update text blocks of a page
  const handleUpdateBlocks = (pageIndex: number, blocks: TextBlock[]) => {
    updateActivePages((prev) =>
      prev.map((p, i) => {
        if (i === pageIndex) {
          const sanitizedBlocks = blocks.map((b) => ({
            ...b,
            text: cleanSfxIcons(b.text),
            speaker: typeof b.speaker === 'string' ? cleanSfxIcons(b.speaker) : b.speaker,
          }));
          const assembledText = sanitizedBlocks
            .map((b) => {
              if (b.type === 'sfx') {
                return formatSfxBlock(b.text, false);
              }
              return b.speaker ? `${b.speaker}: ${b.text}` : b.text;
            })
            .join('\n\n');
          return { ...p, blocks: sanitizedBlocks, fullText: assembledText };
        }
        return p;
      })
    );
  };

  // Update raw full text of a page
  const handleUpdateFullText = (pageIndex: number, text: string) => {
    updateActivePages((prev) =>
      prev.map((p, i) => (i === pageIndex ? { ...p, fullText: cleanSfxIcons(text) } : p))
    );
  };

  const extractedCount = pages.filter((p) => p.status === 'completed').length;
  const excludedCount = pages.filter((p) => p.isExcluded).length;
  const extraPagesCount = pages.filter((p) => p.isExtraPage).length;
  const errorPagesCount = pages.filter((p) => p.status === 'error').length;

  // Retry all pages that encountered an error
  const handleRetryErrors = () => {
    setErrorMessage(null);
    const errorIndices = pages
      .map((p, idx) => ({ idx, status: p.status }))
      .filter((item) => item.status === 'error')
      .map((item) => item.idx);
    if (errorIndices.length > 0) {
      handleBatchExtract(errorIndices);
    } else {
      handleBatchExtract();
    }
  };

  const handleHomeClick = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    }
    if (pages.length > 0) {
      setActiveTab('gallery');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pages.length, isFullscreen, exitFullscreen]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Global Header */}
      <Header
        totalPages={pages.length}
        extractedCount={extractedCount}
        excludedCount={excludedCount}
        extraPagesCount={extraPagesCount}
        errorPagesCount={errorPagesCount}
        totalChapters={navTotalChapters}
        activeChapterIndex={activeChapterIndex}
        activeFileName={activeFileName}
        seriesTitle={comicMetadata?.series || comicMetadata?.mangaTitle || comicMetadata?.bookTitle}
        chapterTitle={chapters[activeChapterIndex]?.title}
        metadata={comicMetadata}
        isProcessing={isProcessing}
        settings={settings}
        quotaInfo={serverConfig}
        onUpdateSettings={handleUpdateSettings}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenApiKey={() => setShowApiKeyModal(true)}
        onOpenExport={() => setShowExportModal(true)}
        onBatchExtract={() => handleBatchExtract()}
        onOpenMultiChapterExtract={() => setShowMultiChapterModal(true)}
        onOpenSeriesInfo={() => setShowSeriesInfoModal(true)}
        onFileSelected={handleFileSelected}
        onFilesSelected={handleFilesSelected}
        onHomeClick={handleHomeClick}
        onOpenTitleSearch={() => {
          setUrlModalTab('search');
          setShowUrlImportModal(true);
        }}
        onOpenUrlImport={() => {
          setUrlModalTab('import');
          setShowUrlImportModal(true);
        }}
        onOpenSources={() => {
          setUrlModalTab('sources');
          setShowUrlImportModal(true);
        }}
        onStopExtract={handleStopExtract}
        onRetryErrors={handleRetryErrors}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Error Notification banner if any or if error pages exist */}
        {(errorMessage || errorPagesCount > 0) && (
          <div className="bg-rose-950/80 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm shadow-md animate-in fade-in max-w-full overflow-hidden">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1 w-full">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0 flex-1">
                <span className="block break-words leading-relaxed">
                  {errorMessage ||
                    `${errorPagesCount} ${errorPagesCount === 1 ? 'page' : 'pages'} encountered an error. Click "Retry Failed Pages" to re-extract with the active Gemini AI vision engine.`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              {errorPagesCount > 0 && (
                <button
                  disabled={isProcessing}
                  onClick={handleRetryErrors}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-3 py-1 rounded-lg text-xs transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Retry {errorPagesCount} Failed {errorPagesCount === 1 ? 'Page' : 'Pages'}</span>
                </button>
              )}
              {errorMessage && (
                <button
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-400 hover:text-white font-bold ml-1 text-xs"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Multi-Chapter Batch Extraction Live Banner */}
        {multiChapterProcessingState && (
          <div className="bg-indigo-950/90 border border-indigo-700/80 rounded-xl p-4 shadow-lg flex flex-col gap-2.5 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                <span className="font-bold text-indigo-100 text-sm">
                  {multiChapterProcessingState.statusText}
                </span>
                <span className="bg-indigo-900/90 text-indigo-300 px-2 py-0.5 rounded-full font-mono text-[11px]">
                  Chapter {multiChapterProcessingState.chapterCurrent} / {multiChapterProcessingState.chapterTotal}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMultiChapterModal(true)}
                  className="text-xs text-indigo-200 hover:text-white font-medium px-2.5 py-1 rounded bg-indigo-900/60 border border-indigo-700/60 transition"
                >
                  View Multi-Chapter Details
                </button>
                <button
                  onClick={handleStopExtract}
                  className="text-xs text-rose-300 hover:text-rose-100 flex items-center gap-1 font-semibold px-2.5 py-1 rounded bg-rose-950/70 border border-rose-800 transition"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Stop Batch</span>
                </button>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    multiChapterProcessingState.overallPageTotal > 0
                      ? (multiChapterProcessingState.overallPageCurrent /
                          multiChapterProcessingState.overallPageTotal) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-indigo-300/80">
              <span>Overall progress across selected chapters</span>
              <span className="font-mono">
                {multiChapterProcessingState.overallPageCurrent} / {multiChapterProcessingState.overallPageTotal} pages (
                {Math.round(
                  (multiChapterProcessingState.overallPageCurrent /
                    multiChapterProcessingState.overallPageTotal) *
                    100
                )}
                %)
              </span>
            </div>
          </div>
        )}

        {/* Single Chapter Extraction Progress Bar (only when not in multi-chapter processing mode) */}
        {isProcessing && !multiChapterProcessingState && (
          <div className="bg-indigo-950/70 border border-indigo-800/80 rounded-xl p-3.5 shadow-md flex flex-col gap-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs text-indigo-200">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                <span className="font-semibold">
                  Extracting Page {processingProgress.current} of {processingProgress.total}...
                </span>
                <span className="text-indigo-400 hidden sm:inline">
                  (Reading Order: {settings.readingOrder.toUpperCase()} • Noise &amp; Watermarks Filtered)
                </span>
              </div>
              <button
                onClick={handleStopExtract}
                className="text-xs text-rose-300 hover:text-rose-100 flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            {/* Progress Track */}
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    processingProgress.total > 0
                      ? (processingProgress.current / processingProgress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Dropzone / Upload Header */}
        <DropZone
          onFileSelected={handleFileSelected}
          onFilesSelected={handleFilesSelected}
          onOpenTitleSearch={() => {
            setUrlModalTab('search');
            setShowUrlImportModal(true);
          }}
          onOpenUrlImport={() => {
            setUrlModalTab('import');
            setShowUrlImportModal(true);
          }}
          onOpenSources={() => {
            setUrlModalTab('sources');
            setShowUrlImportModal(true);
          }}
          onDownloadCbz={pages.length > 0 ? handleDownloadCurrentAsCbz : undefined}
          onOpenSeriesInfo={() => setShowSeriesInfoModal(true)}
          onOpenExport={() => setShowExportModal(true)}
          onOpenMultiChapter={() => setShowMultiChapterModal(true)}
          onContinueReading={() => setActiveTab('reader')}
          metadata={comicMetadata}
          isWebSource={isWebSource}
          sourceUrl={webSourceUrl}
          isLoading={isLoadingArchive}
          activeFileName={activeFileName}
          totalPages={chapters.length > 1 ? chapters.reduce((s, c) => s + c.pages.length, 0) : pages.length}
          totalChapters={navTotalChapters}
          activeChapterTitle={navCurrentChapterTitle}
          onReset={() => {
            setChapters([]);
            setPages([]);
            setActiveFileName('');
            setActivePageIndex(0);
            setActiveChapterIndex(0);
            setIsWebSource(false);
            setWebSourceUrl(undefined);
            setComicMetadata(null);
          }}
        />

        {/* Workbench Section when pages are loaded */}
        {pages.length > 0 && (
          <div className="flex flex-col gap-4">
            {/* Multi-Chapter Navigation Toolbar if archive contains multiple chapters OR online series chapters available */}
            {(isMultiChapterArchive || isWebMultiChapter) && (
              <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                        {comicMetadata?.series || comicMetadata?.mangaTitle || (isMultiChapterArchive ? 'Multi-Chapter Archive' : 'Manga Series')}
                      </span>
                      <span className="text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        Chapter {navCurrentChapterIndex + 1} of {navTotalChapters}
                      </span>
                      {comicMetadata && (
                        <button
                          type="button"
                          onClick={() => setShowSeriesInfoModal(true)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                          title="View series synopsis & details"
                        >
                          Series Info
                        </button>
                      )}
                    </div>
                    <div className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-[220px] sm:max-w-md">
                      {navCurrentChapterTitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Multi-Chapter Extract Button (for local archives) */}
                  {isMultiChapterArchive && (
                    <button
                      id="multi-chapter-toolbar-extract-button"
                      onClick={() => setShowMultiChapterModal(true)}
                      className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-lg font-semibold text-xs sm:text-sm shadow-md transition whitespace-nowrap cursor-pointer ${
                        isProcessing && multiChapterProcessingState
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                      title={
                        isProcessing
                          ? 'Multi-chapter extraction running in background — click to open progress modal'
                          : 'Select and extract multiple chapters with one click'
                      }
                    >
                      {isProcessing && multiChapterProcessingState ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>Extracting (Ch {multiChapterProcessingState.chapterCurrent}/{multiChapterProcessingState.chapterTotal})</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-indigo-200" />
                          <span>Extract Multiple Chapters</span>
                        </>
                      )}
                      <span className="bg-indigo-900/80 px-1.5 py-0.5 rounded text-[11px] font-mono">
                        {chapters.filter((c) => c.pages.every((p) => p.status === 'completed' || p.isExcluded)).length}/{chapters.length}
                      </span>
                    </button>
                  )}

                  {/* Chapter Select Dropdown */}
                  <select
                    value={navCurrentChapterIndex}
                    onChange={(e) => handleNavigateChapter(Number(e.target.value))}
                    disabled={isLoadingChapter}
                    aria-label="Select Chapter"
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-xs sm:text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer max-w-[200px] sm:max-w-xs truncate"
                  >
                    {isMultiChapterArchive
                      ? chapters.map((ch, idx) => {
                          const completedCount = ch.pages.filter((p) => p.status === 'completed').length;
                          return (
                            <option key={ch.id} value={idx}>
                              {idx + 1}. {ch.title} ({ch.pages.length} pages{completedCount > 0 ? ` • ${completedCount} done` : ''})
                            </option>
                          );
                        })
                      : sortedWebChapters.map((ch, idx) => (
                          <option key={ch.id || ch.url || idx} value={idx}>
                            {idx + 1}. {ch.title || `Chapter ${ch.number || idx + 1}`}
                          </option>
                        ))}
                  </select>

                  {/* Previous & Next Chapter Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={navOnPreviousChapter}
                      disabled={!navHasPreviousChapter || isLoadingChapter}
                      aria-label="Previous Chapter"
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:hover:bg-slate-800 transition text-xs flex items-center gap-1 border border-slate-700 font-semibold cursor-pointer"
                      title="Move to Previous Chapter"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Prev Ch</span>
                    </button>

                    <button
                      type="button"
                      onClick={navOnNextChapter}
                      disabled={!navHasNextChapter || isLoadingChapter}
                      aria-label="Next Chapter"
                      className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition text-xs flex items-center gap-1 border border-indigo-500 font-semibold shadow-sm cursor-pointer"
                      title="Move to Next Chapter"
                    >
                      {isLoadingChapter ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span className="hidden sm:inline">Next Ch</span>
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Switcher Tabs & Quick Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
              {/* Tab selector */}
              <div
                role="tablist"
                aria-label="Workspace views"
                className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800"
              >
                <button
                  type="button"
                  role="tab"
                  id="tab-reader"
                  aria-selected={activeTab === 'reader'}
                  aria-controls="panel-reader"
                  onClick={() => setActiveTab('reader')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'reader'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Reader &amp; Inspector</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-gallery"
                  aria-selected={activeTab === 'gallery'}
                  aria-controls="panel-gallery"
                  onClick={() => setActiveTab('gallery')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'gallery'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Page Overview ({pages.length})</span>
                </button>
              </div>

              {/* Status summary & Presentation Trigger */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 hidden sm:inline">
                  Ready to export:{' '}
                  <strong className="text-emerald-400 font-semibold">
                    {pages.filter((p) => !p.isExcluded && p.status === 'completed').length}
                  </strong>{' '}
                  <span className="text-slate-600">/</span> {pages.filter((p) => !p.isExcluded).length} pages
                </span>

                {/* Quick PPTX Fullscreen Presentation Mode Button */}
                <button
                  onClick={() => {
                    if (activeTab === 'reader') {
                      toggleFullscreen('viewer');
                    } else {
                      toggleFullscreen('grid');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer shadow-sm"
                  title="Open current view in Fullscreen PPTX Presentation Mode (Esc to exit)"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Present Fullscreen</span>
                </button>
              </div>
            </div>

            {/* Active View: Reader Mode vs Gallery Mode */}
            {activeTab === 'reader' ? (
              <div className="flex flex-col lg:flex-row gap-5 items-start w-full relative">
                {/* Left: Interactive Comic Viewer (dominant, flex-1, min-w-0) */}
                <div className="flex-1 min-w-0 w-full">
                  <PageViewer
                    pages={pages}
                    currentIndex={activePageIndex}
                    onPageChange={(idx) => setActivePageIndex(idx)}
                    onToggleExclude={handleToggleExclude}
                    onExtractCurrentPage={() => extractSinglePage(activePageIndex)}
                    onExtractPage={(idx) => extractSinglePage(idx)}
                    isProcessing={isProcessing}
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    showInspector={showInspector}
                    onToggleInspector={() => setShowInspector(!showInspector)}
                    isFullscreen={isFullscreen && fullscreenPanel === 'viewer'}
                    onToggleFullscreen={() => toggleFullscreen('viewer')}
                    totalChapters={navTotalChapters}
                    currentChapterIndex={navCurrentChapterIndex}
                    currentChapterTitle={navCurrentChapterTitle}
                    hasPreviousChapter={navHasPreviousChapter}
                    hasNextChapter={navHasNextChapter}
                    onPreviousChapter={navOnPreviousChapter}
                    onNextChapter={navOnNextChapter}
                    availableChapters={navAvailableChapters}
                    onSelectChapter={handleNavigateChapter}
                    isLoadingChapter={isLoadingChapter}
                    loadingChapterMessage={loadingChapterMessage}
                  />
                </div>

                {/* Desktop Sticky Side Panel (>= 1024px) */}
                {showInspector && (
                  <div className="hidden lg:block w-[380px] xl:w-[420px] shrink-0 sticky top-4 h-[calc(100vh-6rem)] min-h-[600px] max-h-[820px]">
                    <TextInspector
                      page={pages[activePageIndex]}
                      onUpdateBlocks={handleUpdateBlocks}
                      onUpdateFullText={handleUpdateFullText}
                      onToggleExclude={handleToggleExclude}
                      onExtractPage={(idx) => extractSinglePage(idx)}
                      isProcessing={isProcessing}
                      allPages={pages}
                      chapterSummary={
                        chapterSummary && !chapterSummary.includes('No extracted story pages')
                          ? chapterSummary
                          : compileChapterSummary(pages)
                      }
                      onUpdateChapterSummary={(s) => {
                        setChapterSummary(s);
                        chaptersRef.current = chaptersRef.current.map((ch, idx) =>
                          idx === activeChapterIndexRef.current ? { ...ch, chapterSummary: s } : ch
                        );
                        setChapters((prev) =>
                          prev.map((ch, idx) =>
                            idx === activeChapterIndex ? { ...ch, chapterSummary: s } : ch
                          )
                        );
                      }}
                      isSynthesizingChapterSummary={isSynthesizingChapterSummary}
                      onSynthesizeChapterSummary={handleSynthesizeChapterSummary}
                      onSelectPage={(idx) => setActivePageIndex(idx)}
                      isFullscreen={isFullscreen && fullscreenPanel === 'inspector'}
                      onToggleFullscreen={() => toggleFullscreen('inspector')}
                      onClose={() => setShowInspector(false)}
                    />
                  </div>
                )}

                {/* Mobile Bottom Sheet (< 640px) & Tablet Drawer (640px-1023px) */}
                {showInspector && (
                  <div className="lg:hidden">
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-40 transition-opacity"
                      onClick={() => setShowInspector(false)}
                      aria-hidden="true"
                    />

                    {/* Mobile Bottom Sheet (< 640px) */}
                    <div className="fixed inset-x-0 bottom-0 z-50 h-[85vh] max-h-[85dvh] rounded-t-2xl bg-slate-900 border-t border-slate-700 shadow-2xl flex flex-col sm:hidden overflow-hidden animate-in slide-in-from-bottom duration-200">
                      <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto my-2 shrink-0" />
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <TextInspector
                          page={pages[activePageIndex]}
                          onUpdateBlocks={handleUpdateBlocks}
                          onUpdateFullText={handleUpdateFullText}
                          onToggleExclude={handleToggleExclude}
                          onExtractPage={(idx) => extractSinglePage(idx)}
                          isProcessing={isProcessing}
                          allPages={pages}
                          chapterSummary={
                            chapterSummary && !chapterSummary.includes('No extracted story pages')
                              ? chapterSummary
                              : compileChapterSummary(pages)
                          }
                          onUpdateChapterSummary={(s) => {
                            setChapterSummary(s);
                            chaptersRef.current = chaptersRef.current.map((ch, idx) =>
                              idx === activeChapterIndexRef.current ? { ...ch, chapterSummary: s } : ch
                            );
                            setChapters((prev) =>
                              prev.map((ch, idx) =>
                                idx === activeChapterIndex ? { ...ch, chapterSummary: s } : ch
                              )
                            );
                          }}
                          isSynthesizingChapterSummary={isSynthesizingChapterSummary}
                          onSynthesizeChapterSummary={handleSynthesizeChapterSummary}
                          onSelectPage={(idx) => setActivePageIndex(idx)}
                          isFullscreen={isFullscreen && fullscreenPanel === 'inspector'}
                          onToggleFullscreen={() => toggleFullscreen('inspector')}
                          onClose={() => setShowInspector(false)}
                        />
                      </div>
                    </div>

                    {/* Tablet Drawer (640px - 1023px) */}
                    <div className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-[85vw] bg-slate-900 border-l border-slate-700 shadow-2xl hidden sm:flex lg:hidden flex-col overflow-hidden animate-in slide-in-from-right duration-200">
                      <TextInspector
                        page={pages[activePageIndex]}
                        onUpdateBlocks={handleUpdateBlocks}
                        onUpdateFullText={handleUpdateFullText}
                        onToggleExclude={handleToggleExclude}
                        onExtractPage={(idx) => extractSinglePage(idx)}
                        isProcessing={isProcessing}
                        allPages={pages}
                        chapterSummary={
                          chapterSummary && !chapterSummary.includes('No extracted story pages')
                            ? chapterSummary
                            : compileChapterSummary(pages)
                        }
                        onUpdateChapterSummary={(s) => {
                          setChapterSummary(s);
                          chaptersRef.current = chaptersRef.current.map((ch, idx) =>
                            idx === activeChapterIndexRef.current ? { ...ch, chapterSummary: s } : ch
                          );
                          setChapters((prev) =>
                            prev.map((ch, idx) =>
                              idx === activeChapterIndex ? { ...ch, chapterSummary: s } : ch
                            )
                          );
                        }}
                        isSynthesizingChapterSummary={isSynthesizingChapterSummary}
                        onSynthesizeChapterSummary={handleSynthesizeChapterSummary}
                        onSelectPage={(idx) => setActivePageIndex(idx)}
                        isFullscreen={isFullscreen && fullscreenPanel === 'inspector'}
                        onToggleFullscreen={() => toggleFullscreen('inspector')}
                        onClose={() => setShowInspector(false)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Gallery Overview Mode */
              <PageGrid
                pages={pages}
                selectedPageIndex={activePageIndex}
                onSelectPage={(idx) => {
                  setActivePageIndex(idx);
                  setActiveTab('reader');
                }}
                onToggleExclude={handleToggleExclude}
                onExtractPage={(idx) => extractSinglePage(idx)}
                onExtractMultiple={(indices) => handleBatchExtract(indices)}
                onExcludeAllExtraPages={handleExcludeAllExtraPages}
                onRetryErrors={handleRetryErrors}
                isProcessing={isProcessing}
                isFullscreen={isFullscreen && fullscreenPanel === 'grid'}
                onToggleFullscreen={() => toggleFullscreen('grid')}
              />
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        pages={pages}
        defaultTitle={chapters[activeChapterIndex]?.title || activeFileName || 'Manga_Chapter'}
        readingOrder={settings.readingOrder}
        metadata={comicMetadata}
        settings={settings}
        chapterSummary={
          chapterSummary && !chapterSummary.includes('No extracted story pages')
            ? chapterSummary
            : compileChapterSummary(pages)
        }
        onUpdateChapterSummary={(s) => {
          setChapterSummary(s);
          chaptersRef.current = chaptersRef.current.map((ch, idx) =>
            idx === activeChapterIndexRef.current ? { ...ch, chapterSummary: s } : ch
          );
          setChapters((prev) =>
            prev.map((ch, idx) =>
              idx === activeChapterIndex ? { ...ch, chapterSummary: s } : ch
            )
          );
        }}
        isSynthesizingChapterSummary={isSynthesizingChapterSummary}
        onSynthesizeChapterSummary={handleSynthesizeChapterSummary}
        chapters={chapters}
        activeChapterIndex={activeChapterIndex}
      />

      {/* Multi-Chapter Extract Modal */}
      <MultiChapterExtractModal
        isOpen={showMultiChapterModal}
        onClose={() => setShowMultiChapterModal(false)}
        chapters={chapters}
        activeChapterIndex={activeChapterIndex}
        onSelectChapter={handleSelectChapter}
        onStartExtract={handleMultiChapterExtract}
        isProcessing={isProcessing}
        onStopExtract={handleStopExtract}
        processingState={multiChapterProcessingState}
        dailyRequests={serverConfig?.dailyRequests}
        settings={settings}
        onOpenExport={() => {
          setShowMultiChapterModal(false);
          setShowExportModal(true);
        }}
      />

      {/* Web Comic / Webtoon URL Import Modal */}
      <WebComicUrlModal
        isOpen={showUrlImportModal}
        initialTab={urlModalTab}
        onClose={() => setShowUrlImportModal(false)}
        onChapterLoaded={handleWebComicLoaded}
      />

      {/* Series Info Modal */}
      <SeriesInfoModal
        isOpen={showSeriesInfoModal}
        onClose={() => setShowSeriesInfoModal(false)}
        metadata={comicMetadata}
        pagesCount={pages.length}
        activeChapterTitle={navCurrentChapterTitle}
        allChapters={chapters}
        activeChapterIndex={navCurrentChapterIndex}
        onSelectChapter={(val) => handleNavigateChapter(val)}
      />

      {/* Background Multi-Chapter Extraction Floating Toast */}
      {isProcessing && multiChapterProcessingState && !showMultiChapterModal && (
        <div
          id="background-extraction-toast"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-40 bg-slate-900/95 border border-indigo-500/70 shadow-2xl shadow-indigo-950/80 rounded-xl p-3 sm:p-3.5 max-w-[calc(100vw-2rem)] sm:max-w-md w-auto sm:w-full backdrop-blur flex items-center justify-between gap-3 animate-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5 truncate">
                <span>Ch {multiChapterProcessingState.chapterCurrent}/{multiChapterProcessingState.chapterTotal}:</span>
                <span className="text-indigo-300 truncate font-medium">{multiChapterProcessingState.chapterTitle}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                Page {multiChapterProcessingState.pageCurrent}/{multiChapterProcessingState.pageTotal}
                {multiChapterProcessingState.overallPageTotal > 0 &&
                  ` (${multiChapterProcessingState.overallPageCurrent}/${multiChapterProcessingState.overallPageTotal} total)`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowMultiChapterModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
              title="Open multi-chapter extraction dialog"
            >
              View
            </button>
            <button
              onClick={handleStopExtract}
              className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition cursor-pointer"
              title="Stop extraction"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
