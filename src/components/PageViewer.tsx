import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Columns,
  RotateCw,
  Sparkles,
  EyeOff,
  Eye,
  AlertTriangle,
  MoveVertical,
  RefreshCw,
  ArrowUp,
  Compass,
  MoreHorizontal,
  Check,
  Volume2,
  VolumeX,
  BookOpen,
  Layers,
  ShieldAlert,
  ExternalLink,
  Search,
} from 'lucide-react';
import { ComicPage, ExtractionSettings, TextBlock } from '../types';
import { FullscreenFloatingControls } from './FullscreenFloatingControls';
import {
  useFullscreenTTSNarrator,
  getVisiblePageText,
  getVisiblePageBlocks,
  calculateAdaptiveScrollDuration,
  getBlockTargetScroll,
} from '../hooks/useFullscreenTTSNarrator';
import { ReadingOrderMode } from '../types';
import {
  shouldResetScrollToTop,
  calculatePersistedScrollTop,
  calculatePersistedScrollProgress,
} from '../utils/scrollTransition';

export type FitMode = 'fit-width' | 'fit-page';

interface PageViewerProps {
  pages: ComicPage[];
  currentIndex: number;
  onPageChange: (index: number) => void;
  onToggleExclude: (index: number) => void;
  onExtractCurrentPage: () => void;
  onExtractPage?: (index: number) => Promise<boolean>;
  isProcessing: boolean;
  settings: ExtractionSettings;
  onUpdateSettings?: (settings: ExtractionSettings) => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  // Chapter Navigation Controls
  totalChapters?: number;
  currentChapterIndex?: number;
  currentChapterTitle?: string;
  hasPreviousChapter?: boolean;
  hasNextChapter?: boolean;
  onPreviousChapter?: () => void;
  onNextChapter?: () => void;
  availableChapters?: Array<any>;
  onSelectChapter?: (val: any) => void;
  isLoadingChapter?: boolean;
  loadingChapterMessage?: string;
}

interface DiagnosticOverlayProps {
  blocks: TextBlock[];
  isVisible: boolean;
  onSelectBlock?: (block: TextBlock, idx: number) => void;
}

export const DiagnosticOverlay: React.FC<DiagnosticOverlayProps> = ({
  blocks,
  isVisible,
  onSelectBlock,
}) => {
  if (!isVisible || !blocks || blocks.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {blocks.map((b, idx) => {
        const box = b.box_2d || (b as any).coordinates;
        if (!Array.isArray(box) || box.length !== 4) return null;
        const [ymin, xmin, ymax, xmax] = box;
        return (
          <div
            key={`diagnostic-box-${b.id || idx}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectBlock?.(b, idx);
            }}
            className="absolute border-2 border-rose-500 bg-rose-500/25 hover:bg-rose-500/45 rounded transition-all duration-200 group cursor-pointer pointer-events-auto"
            style={{
              top: `${ymin / 10}%`,
              left: `${xmin / 10}%`,
              height: `${Math.max(2, (ymax - ymin) / 10)}%`,
              width: `${Math.max(2, (xmax - xmin) / 10)}%`,
            }}
            title={`Click to test scroll to Box #${idx + 1} [${ymin}, ${xmin}, ${ymax}, ${xmax}]: ${b.text}`}
          >
            <span className="absolute -top-4 left-0 bg-rose-600 text-white font-mono text-[9px] px-1.5 py-0.2 rounded shadow whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] pointer-events-none z-40">
              #{idx + 1} [{ymin}, {xmin}, {ymax}, {xmax}]: {b.text?.substring(0, 15)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const PageViewer: React.FC<PageViewerProps> = ({
  pages,
  currentIndex,
  onPageChange,
  onToggleExclude,
  onExtractCurrentPage,
  onExtractPage,
  isProcessing,
  settings,
  onUpdateSettings,
  showInspector,
  onToggleInspector,
  isFullscreen = false,
  onToggleFullscreen,
  totalChapters,
  currentChapterIndex,
  currentChapterTitle,
  hasPreviousChapter,
  hasNextChapter,
  onPreviousChapter,
  onNextChapter,
  availableChapters,
  onSelectChapter,
  isLoadingChapter = false,
  loadingChapterMessage,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isContinuousScroll, setIsContinuousScroll] = useState<boolean>(
    settings.readingOrder === 'manhwa-vertical'
  );
  const [webtoonGap, setWebtoonGap] = useState<'seamless' | 'spaced'>('seamless');
  const [fitMode, setFitMode] = useState<FitMode>(
    settings.readingOrder === 'manhwa-vertical' ? 'fit-width' : 'fit-page'
  );
  const [isLongPage, setIsLongPage] = useState<boolean>(false);
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(1);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [showDebugBoxes, setShowDebugBoxes] = useState<boolean>(false);
  const [containerMetrics, setContainerMetrics] = useState<{
    scrollTop: number;
    clientHeight: number;
    scrollHeight: number;
  }>({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 });
  const [debugSelectedBlockInfo, setDebugSelectedBlockInfo] = useState<{
    idx: number;
    box_2d: number[];
    targetScroll: number;
    text: string;
  } | null>(null);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMoreMenu]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const targetPageIndexRef = useRef<number | null>(null);
  const lastScrolledIndexRef = useRef<number>(currentIndex);
  const lastProgrammaticNavTimeRef = useRef<number>(0);
  const previousIndexRef = useRef<number>(currentIndex);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollHeightRef = useRef<number>(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const pageAspectRatiosRef = useRef<Map<number, number>>(new Map());

  const currentPage = pages[currentIndex];
  const isMangaRtl = settings.readingOrder === 'manga-rtl';

  useEffect(() => {
    if (currentPage) {
      console.log('[VIEWER] PageViewer receives page', {
        pageIndex: currentIndex,
        pageFileName: currentPage.fileName,
        srcType: currentPage.imageUrl?.startsWith('blob:')
          ? 'blob'
          : currentPage.imageUrl?.startsWith('data:')
          ? 'data'
          : 'remote',
        src: currentPage.imageUrl,
      });
    }
  }, [currentIndex, currentPage]);

  // Fullscreen-only Auto-Forward & Web Speech API TTS Engine
  const {
    isTTSActive,
    toggleTTS,
    stopTTS,
    pipelineStatus,
    statusMessage,
    currentSpeakingText,
    voices,
    selectedVoice,
    setSelectedVoice,
    speechRate,
    setSpeechRate,
    isExtractingNextPage,
    nextExtractingIndex,
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
    currentBlockIndex,
    totalBlocks,
    goToNextBlock,
    goToPreviousBlock,
    includeSpeaker,
    toggleIncludeSpeaker,
    scrollSpeedMode,
    setScrollSpeedMode,
    scrollVelocityMultiplier,
    setScrollVelocityMultiplier,
  } = useFullscreenTTSNarrator({
    isFullscreen,
    currentPageIndex: currentIndex,
    pages,
    onPageChange: (nextIndex) => {
      onPageChange(nextIndex);
    },
    onExtractPage: onExtractPage || (async () => {
      onExtractCurrentPage();
      return true;
    }),
    scrollContainerRef,
    isContinuousScroll,
    isProgrammaticScrollRef,
    includeSpeaker: settings.includeSpeakerInTTS,
    onToggleIncludeSpeaker: (include) => {
      if (onUpdateSettings) {
        onUpdateSettings({
          ...settings,
          includeSpeakerInTTS: include,
        });
      }
    },
  });

  // Active Smart Scroll Text Block tracking for visual speech bubble overlays
  const currentVisibleBlocks = useMemo(() => {
    return getVisiblePageBlocks(pages[currentIndex], settings.includeSpeakerInTTS);
  }, [pages, currentIndex, settings.includeSpeakerInTTS]);

  const activeBlock =
    currentBlockIndex !== null && currentVisibleBlocks[currentBlockIndex]
      ? currentVisibleBlocks[currentBlockIndex]
      : null;

  // Local Page Web Speech API player (Continuous read aloud & conversion across pages in non-fullscreen viewer mode)
  const [isSpeakingPage, setIsSpeakingPage] = useState<boolean>(false);
  const isContinuousSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isContinuousSpeakingRef.current && isSpeakingPage) {
      const textToSpeak = getVisiblePageText(currentPage, includeSpeaker);
      if (textToSpeak.trim()) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.0;
        utterance.onend = () => {
          if (isContinuousSpeakingRef.current && currentIndex < pages.length - 1) {
            onPageChange(currentIndex + 1);
          } else {
            isContinuousSpeakingRef.current = false;
            setIsSpeakingPage(false);
          }
        };
        utterance.onerror = () => {
          if (isContinuousSpeakingRef.current && currentIndex < pages.length - 1) {
            onPageChange(currentIndex + 1);
          } else {
            isContinuousSpeakingRef.current = false;
            setIsSpeakingPage(false);
          }
        };
        window.speechSynthesis.speak(utterance);
      } else if (currentIndex < pages.length - 1) {
        const timer = setTimeout(() => {
          if (isContinuousSpeakingRef.current) {
            onPageChange(currentIndex + 1);
          }
        }, 1500);
        return () => clearTimeout(timer);
      } else {
        isContinuousSpeakingRef.current = false;
        setIsSpeakingPage(false);
      }
    }
  }, [currentIndex, isSpeakingPage, currentPage, includeSpeaker, onPageChange, pages.length]);

  const handleToggleSpeakCurrentPage = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeakingPage || window.speechSynthesis.speaking) {
      isContinuousSpeakingRef.current = false;
      window.speechSynthesis.cancel();
      setIsSpeakingPage(false);
      return;
    }

    isContinuousSpeakingRef.current = true;
    setIsSpeakingPage(true);

    // Continuous background extraction for all upcoming pages till the end
    if (onExtractPage) {
      (async () => {
        for (let i = currentIndex; i < pages.length; i++) {
          if (!isContinuousSpeakingRef.current) break;
          const p = pages[i];
          if (p && p.status !== 'completed' && !p.isExcluded && !p.isExtraPage) {
            await onExtractPage(i);
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      })();
    }

    const textToSpeak = getVisiblePageText(currentPage, includeSpeaker);
    if (!textToSpeak.trim()) {
      if (currentIndex < pages.length - 1) {
        setTimeout(() => {
          if (isContinuousSpeakingRef.current) onPageChange(currentIndex + 1);
        }, 1500);
      }
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.onend = () => {
      if (isContinuousSpeakingRef.current && currentIndex < pages.length - 1) {
        onPageChange(currentIndex + 1);
      } else {
        isContinuousSpeakingRef.current = false;
        setIsSpeakingPage(false);
      }
    };
    utterance.onerror = () => {
      if (isContinuousSpeakingRef.current && currentIndex < pages.length - 1) {
        onPageChange(currentIndex + 1);
      } else {
        isContinuousSpeakingRef.current = false;
        setIsSpeakingPage(false);
      }
    };
    window.speechSynthesis.speak(utterance);
  }, [currentPage, includeSpeaker, isSpeakingPage, onExtractPage, currentIndex, pages, onPageChange]);

  // Switch between 3 content types: Manga (RTL), Comic (LTR), Manhwa (Vertical)
  const handleSwitchReadingOrder = (newOrder: ReadingOrderMode) => {
    if (onUpdateSettings) {
      onUpdateSettings({
        ...settings,
        readingOrder: newOrder,
      });
    }
    if (newOrder === 'manhwa-vertical') {
      setIsContinuousScroll(true);
      setWebtoonGap('seamless');
      setFitMode('fit-width');
    } else if (newOrder === 'manga-rtl' || newOrder === 'comic-ltr') {
      setIsContinuousScroll(false);
      setFitMode('fit-page');
    }
    resetTimer();
  };

  // Synchronize reading order setting if changed in settings modal
  useEffect(() => {
    if (settings.readingOrder === 'manhwa-vertical') {
      setIsContinuousScroll(true);
      setWebtoonGap('seamless');
      setFitMode('fit-width');
    } else if (settings.readingOrder === 'manga-rtl' || settings.readingOrder === 'comic-ltr') {
      setIsContinuousScroll(false);
      setFitMode('fit-page');
    }
  }, [settings.readingOrder]);

  // Proactive background pre-fetch: while user is reading or listening to the current page,
  // ensure upcoming consecutive pages are extracted in the background with zero lag.
  useEffect(() => {
    if (!onExtractPage) return;
    if (currentPage?.status !== 'completed') return;

    const nextIdx = currentIndex + 1;
    if (nextIdx < pages.length) {
      const nextPage = pages[nextIdx];
      if (
        nextPage &&
        !nextPage.isExcluded &&
        !nextPage.isExtraPage &&
        nextPage.status === 'idle'
      ) {
        // Debounce 1.2s so user can settle on current page before prefetching next
        const timer = setTimeout(() => {
          onExtractPage(nextIdx).catch(() => {});
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [currentIndex, currentPage?.status, pages, onExtractPage]);

  // Handle image load to detect tall manhwa strip aspect ratios
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalHeight / img.naturalWidth;
      setPageAspectRatio(ratio);
      pageAspectRatiosRef.current.set(currentIndex, ratio);
      const isTall = ratio > 1.5;
      setIsLongPage(isTall);
      // If it's a very tall manhwa strip and fitMode hasn't been explicitly selected, prefer fit-width
      if (isTall && fitMode === 'fit-page' && settings.readingOrder === 'manhwa-vertical') {
        setFitMode('fit-width');
      }

      // If we have a pending scroll restore from an intelligent page transition, apply it now that image is sized
      if (pendingScrollRestoreRef.current !== null && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const targetScroll = calculatePersistedScrollTop(
          pendingScrollRestoreRef.current,
          container.scrollHeight,
          container.clientHeight
        );
        container.scrollTop = targetScroll;
        pendingScrollRestoreRef.current = null;
      }
    }
  };

  // Intelligent scroll position transition in single page view (persists scroll in long manhwa)
  useEffect(() => {
    if (isContinuousScroll || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const prevIdx = previousIndexRef.current;

    if (prevIdx !== currentIndex) {
      const prevPage = pages[prevIdx];
      const nextPage = pages[currentIndex];

      const shouldReset = shouldResetScrollToTop({
        prevIndex: prevIdx,
        nextIndex: currentIndex,
        prevPage,
        nextPage,
        prevScrollTop: lastScrollTopRef.current,
        prevScrollHeight: lastScrollHeightRef.current,
        containerClientHeight: container.clientHeight,
        fitMode,
        readingOrder: settings.readingOrder,
        prevAspectRatio: pageAspectRatiosRef.current.get(prevIdx),
        nextAspectRatio: pageAspectRatiosRef.current.get(currentIndex),
      });

      if (shouldReset || (isTTSActive && !isAutoForwardActive)) {
        container.scrollTop = 0;
        pendingScrollRestoreRef.current = null;
      } else {
        // Persist the relative scroll progress for long manhwa reading flow
        const progress = calculatePersistedScrollProgress(
          lastScrollTopRef.current,
          lastScrollHeightRef.current,
          container.clientHeight
        );
        const targetScroll = calculatePersistedScrollTop(
          progress,
          container.scrollHeight,
          container.clientHeight
        );
        container.scrollTop = targetScroll;
        pendingScrollRestoreRef.current = progress;
      }

      previousIndexRef.current = currentIndex;
    }
  }, [currentIndex, isContinuousScroll, pages, fitMode, settings.readingOrder]);

  const pageViewerRafIdRef = useRef<number | null>(null);

  // Stop any active programmatic animation immediately
  const stopProgrammaticAnimation = useCallback(() => {
    if (pageViewerRafIdRef.current) {
      cancelAnimationFrame(pageViewerRafIdRef.current);
      pageViewerRafIdRef.current = null;
    }
    if (programmaticScrollTimeoutRef.current) {
      clearTimeout(programmaticScrollTimeoutRef.current);
      programmaticScrollTimeoutRef.current = null;
    }
    isProgrammaticScrollRef.current = false;
    targetPageIndexRef.current = null;
  }, []);

  // Continuous, smooth distance-adaptive animation
  const animateScrollTo = useCallback(
    (targetY: number, onComplete?: () => void) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (pageViewerRafIdRef.current) {
        cancelAnimationFrame(pageViewerRafIdRef.current);
        pageViewerRafIdRef.current = null;
      }

      const startY = container.scrollTop;
      const distance = targetY - startY;

      if (Math.abs(distance) <= 6) {
        container.scrollTop = targetY;
        isProgrammaticScrollRef.current = false;
        targetPageIndexRef.current = null;
        if (onComplete) onComplete();
        return;
      }

      isProgrammaticScrollRef.current = true;
      const { durationMs } = calculateAdaptiveScrollDuration(
        distance,
        scrollSpeedMode,
        scrollVelocityMultiplier
      );
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // Smooth cosine ease-in-out curve
        const ease = 0.5 * (1 - Math.cos(Math.PI * progress));
        container.scrollTop = Math.round(startY + distance * ease);

        if (progress < 1) {
          pageViewerRafIdRef.current = requestAnimationFrame(step);
        } else {
          container.scrollTop = targetY;
          isProgrammaticScrollRef.current = false;
          targetPageIndexRef.current = null;
          pageViewerRafIdRef.current = null;
          if (onComplete) onComplete();
        }
      };

      pageViewerRafIdRef.current = requestAnimationFrame(step);
    },
    [scrollSpeedMode, scrollVelocityMultiplier]
  );

  // When opening or switching to continuous scroll mode, ensure we align with currentIndex
  useEffect(() => {
    if (isContinuousScroll && scrollContainerRef.current) {
      if (currentIndex === 0) {
        animateScrollTo(0);
        lastScrolledIndexRef.current = 0;
      } else {
        const target = document.getElementById(`scroll-page-${currentIndex}`);
        if (target) {
          const container = scrollContainerRef.current;
          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const targetScrollTop = Math.max(0, container.scrollTop + (targetRect.top - containerRect.top));
          animateScrollTo(targetScrollTop);
        } else {
          animateScrollTo(0);
        }
      }
    }
  }, [isContinuousScroll, animateScrollTo]);

  // When currentIndex changes from navigation buttons, keyboard, dropdown, or auto-forward while in continuous scroll
  useEffect(() => {
    if (!isContinuousScroll) return;
    // If the change came from user scrolling (handleScroll), currentIndex matches lastScrolledIndexRef.current
    if (currentIndex === lastScrolledIndexRef.current) return;
    lastScrolledIndexRef.current = currentIndex;

    const container = scrollContainerRef.current;
    if (!container) return;

    // If Smart Scroll is enabled and TTS or Auto-Forward is active, let useFullscreenTTSNarrator handle the scroll to the first block!
    if (isSmartScrollEnabled && (isTTSActive || isAutoForwardActive)) {
      return;
    }

    const target = document.getElementById(`scroll-page-${currentIndex}`);
    if (!target) return;

    targetPageIndexRef.current = currentIndex;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetScrollTop = Math.max(0, container.scrollTop + (targetRect.top - containerRect.top));

    animateScrollTo(targetScrollTop);
  }, [currentIndex, isContinuousScroll, animateScrollTo, isSmartScrollEnabled, isTTSActive, isAutoForwardActive]);

  // Synchronize programmatic navigation time when currentIndex changes to prevent handleScroll hijacking
  useEffect(() => {
    if (currentIndex !== lastScrolledIndexRef.current) {
      lastProgrammaticNavTimeRef.current = Date.now();
      isProgrammaticScrollRef.current = true;
    }
  }, [currentIndex]);

  // User manual scroll/touch gesture releases programmatic target lock immediately
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleUserGesture = () => {
      // Cleanly stop any ongoing programmatic scroll so user has 100% immediate manual control
      stopProgrammaticAnimation();
      resetTimer();
    };

    container.addEventListener('wheel', handleUserGesture, { passive: true });
    container.addEventListener('touchstart', handleUserGesture, { passive: true });
    container.addEventListener('touchmove', handleUserGesture, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleUserGesture);
      container.removeEventListener('touchstart', handleUserGesture);
      container.removeEventListener('touchmove', handleUserGesture);
    };
  }, [stopProgrammaticAnimation, resetTimer]);

  // Scroll listener: detects visible page in continuous mode and displays Back to Top button
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;

    setShowScrollTop(container.scrollTop > 400);

    // Track scroll metrics for real-time debugger and intelligent transition between pages
    lastScrollTopRef.current = container.scrollTop;
    lastScrollHeightRef.current = container.scrollHeight;
    setContainerMetrics({
      scrollTop: Math.round(container.scrollTop),
      clientHeight: Math.round(container.clientHeight),
      scrollHeight: Math.round(container.scrollHeight),
    });

    // Ignore scroll events during programmatic navigation window (e.g. page turns)
    const timeSinceNav = Date.now() - lastProgrammaticNavTimeRef.current;
    if (timeSinceNav < 1500) {
      return;
    }

    // If Smart Scroll is actively reading or navigating, let useFullscreenTTSNarrator control transitions
    if (isSmartScrollEnabled && (isTTSActive || isAutoForwardActive)) {
      return;
    }

    // If programmatically animating or navigating to target page, do not fight or emit page change
    if (
      !isContinuousScroll ||
      isProgrammaticScrollRef.current ||
      targetPageIndexRef.current !== null
    ) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const probeY = containerRect.top + 140;

    for (let i = 0; i < pages.length; i++) {
      const el = document.getElementById(`scroll-page-${i}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= probeY && rect.bottom >= probeY) {
          if (i !== currentIndex) {
            lastScrolledIndexRef.current = i;
            onPageChange(i);
          }
          break;
        }
      }
    }
  }, [isContinuousScroll, pages.length, currentIndex, onPageChange]);

  const handleSelectDiagnosticBlock = useCallback(
    (block: TextBlock, idx: number, pageIdx: number) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const target = getBlockTargetScroll(
        container,
        pageIdx,
        block,
        idx,
        (pages[pageIdx]?.blocks || []).length,
        isContinuousScroll
      );
      container.scrollTo({ top: target, behavior: 'smooth' });
      setDebugSelectedBlockInfo({
        idx: idx + 1,
        box_2d: block.box_2d || [],
        targetScroll: target,
        text: block.text?.substring(0, 30) || '',
      });
      setContainerMetrics({
        scrollTop: Math.round(container.scrollTop),
        clientHeight: Math.round(container.clientHeight),
        scrollHeight: Math.round(container.scrollHeight),
      });
    },
    [isContinuousScroll, pages]
  );

  const handleScrollToTop = () => {
    resetTimer();
    targetPageIndexRef.current = 0;
    lastProgrammaticNavTimeRef.current = Date.now();
    animateScrollTo(0, () => {
      if (isContinuousScroll && currentIndex !== 0) {
        lastScrolledIndexRef.current = 0;
        onPageChange(0);
      }
    });
  };

  // Navigation handlers (manual page turns reset auto-scroll timer)
  const handlePrev = useCallback(() => {
    resetTimer();
    lastProgrammaticNavTimeRef.current = Date.now();
    if (currentIndex > 0) {
      targetPageIndexRef.current = currentIndex - 1;
      isProgrammaticScrollRef.current = true;
      if (scrollContainerRef.current) {
        lastScrollTopRef.current = scrollContainerRef.current.scrollTop;
        lastScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
      }
      onPageChange(currentIndex - 1);
    }
  }, [currentIndex, onPageChange, resetTimer]);

  const handleNext = useCallback(() => {
    resetTimer();
    lastProgrammaticNavTimeRef.current = Date.now();
    if (currentIndex < pages.length - 1) {
      targetPageIndexRef.current = currentIndex + 1;
      isProgrammaticScrollRef.current = true;
      if (scrollContainerRef.current) {
        lastScrollTopRef.current = scrollContainerRef.current.scrollTop;
        lastScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
      }
      onPageChange(currentIndex + 1);
    }
  }, [currentIndex, pages.length, onPageChange, resetTimer]);

  // Keyboard navigation (manual keypresses reset auto-scroll timer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if (e.key === 'PageUp') {
        resetTimer();
        handlePrev();
      } else if (e.key === 'PageDown' || e.key === ' ') {
        resetTimer();
        if (e.key === ' ') e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        resetTimer();
        if (isMangaRtl) {
          handleNext();
        } else {
          handlePrev();
        }
      } else if (e.key === 'ArrowRight') {
        resetTimer();
        if (isMangaRtl) {
          handlePrev();
        } else {
          handleNext();
        }
      } else if (e.key === 'Home') {
        resetTimer();
        if (!isContinuousScroll) {
          onPageChange(0);
        }
        handleScrollToTop();
      } else if (isFullscreen && e.key === 'End') {
        resetTimer();
        onPageChange(pages.length - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, pages.length, isFullscreen, isContinuousScroll, isMangaRtl, handlePrev, handleNext]);

  if (!currentPage) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        No pages loaded
      </div>
    );
  }

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col w-full max-w-full h-full h-[100dvh] overflow-hidden select-none overscroll-none touch-manipulation'
          : 'bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-lg'
      }
    >
      {/* Reader Toolbar (Clean, visual hierarchy, responsive, accessible) */}
      {!isFullscreen && (
        <div className="bg-slate-950/95 px-2 sm:px-3.5 py-1.5 sm:py-2 border-b border-slate-800 flex items-center justify-between gap-1 sm:gap-2 text-xs text-slate-300 relative z-20 w-full min-w-0 select-none overflow-x-auto no-scrollbar">
          {/* Group 1: Page Navigation [Previous] [Page X / Y] [Next] */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink min-w-0">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              className="min-h-[32px] h-8 w-8 sm:w-auto px-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-slate-200 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
              title="Previous Page (Left Arrow)"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline font-medium text-xs">Prev</span>
            </button>

            {/* Page Selector Dropdown */}
            <div className="flex items-center gap-1 bg-slate-900 px-1.5 sm:px-2 min-h-[32px] h-8 rounded-lg border border-slate-800 hover:border-slate-700 transition min-w-0 max-w-[76px] sm:max-w-[120px] md:max-w-[150px]">
              <span className="text-slate-400 font-medium hidden md:inline shrink-0">Page</span>
              <select
                value={currentIndex}
                onChange={(e) => {
                  resetTimer();
                  onPageChange(Number(e.target.value));
                }}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs w-full truncate py-0.5"
                aria-label="Select Page"
              >
                {pages.map((p, idx) => (
                  <option key={p.id} value={idx} className="bg-slate-900 text-slate-200">
                    {idx + 1} / {pages.length} {p.status === 'completed' ? '✓' : ''} {p.isExtraPage ? '⚠️' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex >= pages.length - 1}
              className="min-h-[32px] h-8 w-8 sm:w-auto px-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-slate-200 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
              title="Next Page (Right Arrow)"
              aria-label="Next Page"
            >
              <span className="hidden lg:inline font-medium text-xs">Next</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>

            {/* Extra page alert if detected (visible on wider screens) */}
            {currentPage.isExtraPage && (
              <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-md font-medium shrink-0">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate max-w-[110px]">{currentPage.extraPageReason || 'Ad / Credit'}</span>
              </span>
            )}
          </div>

          {/* Group 2: View Mode [Single] [Strip] */}
          <div
            role="group"
            aria-label="Reading layout mode"
            className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 shrink-0"
          >
            <button
              type="button"
              onClick={() => {
                setIsContinuousScroll(false);
                setFitMode(pageAspectRatio > 1.8 ? 'fit-width' : 'fit-page');
              }}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 min-h-[28px] h-7 rounded-md text-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                !isContinuousScroll
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
              title="Single Page view with auto fit"
              aria-label="Single Page view"
              aria-pressed={!isContinuousScroll}
            >
              <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Single</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsContinuousScroll(true);
              }}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 min-h-[28px] h-7 rounded-md text-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isContinuousScroll
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
              title="Continuous vertical scroll strip"
              aria-label="Continuous strip view"
              aria-pressed={isContinuousScroll}
            >
              <MoveVertical className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Strip</span>
            </button>
          </div>

          {/* Group 3: [Zoom -] [100%] [Zoom +] | [Listen] | [Inspector] | [More] | [Fullscreen] */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Zoom Controls */}
            <div className="hidden md:flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 15, 50))}
                className="min-h-[28px] h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Zoom Out (-15%)"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="text-[11px] font-mono px-1.5 min-h-[28px] h-7 flex items-center justify-center text-slate-300 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer min-w-[36px]"
                title="Reset zoom to 100%"
                aria-label="Reset zoom to 100%"
              >
                {zoom}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 20, 200))}
                className="min-h-[28px] h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Zoom In (+20%)"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Inspector Toggle */}
            <button
              type="button"
              onClick={onToggleInspector}
              className={`min-h-[32px] h-8 px-2 sm:px-2.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                showInspector
                  ? 'bg-indigo-950/90 border-indigo-700 text-indigo-300'
                  : 'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={showInspector ? 'Hide Text Inspector' : 'Show Text Inspector'}
              aria-label="Toggle Text Inspector"
              aria-pressed={showInspector}
            >
              <Columns className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Inspector</span>
            </button>

            {/* More Menu Dropdown */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                id="viewer-more-menu-button"
                onClick={() => setShowMoreMenu((prev) => !prev)}
                className={`min-h-[32px] h-8 w-8 sm:w-auto sm:px-2 rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  showMoreMenu
                    ? 'bg-indigo-950/90 border-indigo-700 text-indigo-300'
                    : 'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="More viewing, audio & reading tools"
                aria-label="More viewing options"
                aria-haspopup="menu"
                aria-expanded={showMoreMenu}
              >
                <MoreHorizontal className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline text-xs font-medium">More</span>
              </button>

              {showMoreMenu && (
                <div
                  role="menu"
                  aria-label="Reader Options"
                  className="fixed left-1/2 -translate-x-1/2 top-20 w-[calc(100vw-2rem)] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:top-full sm:translate-x-0 sm:w-64 sm:max-w-none mt-2 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-2 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100 max-h-[75vh] overflow-y-auto"
                >
                  <div className="px-3 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Page & Display
                  </div>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setRotation((r) => (r + 90) % 360);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-800 cursor-pointer transition text-slate-200 hover:text-white"
                  >
                    <RotateCw className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Rotate 90° (Current: {rotation}°)</span>
                  </button>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onToggleExclude(currentIndex);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-800 cursor-pointer transition text-slate-200 hover:text-white"
                  >
                    {currentPage.isExcluded ? (
                      <>
                        <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Include in Dialogue Export</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Exclude from Dialogue Export</span>
                      </>
                    )}
                  </button>

                  {/* Panel spacing in continuous mode */}
                  {isContinuousScroll && (
                    <div className="px-3 py-2 flex items-center justify-between border-t border-slate-800 my-1">
                      <span className="text-slate-300">Panel Spacing:</span>
                      <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setWebtoonGap('seamless')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                            webtoonGap === 'seamless'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Seamless
                        </button>
                        <button
                          type="button"
                          onClick={() => setWebtoonGap('spaced')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                            webtoonGap === 'spaced'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Spaced
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mobile Zoom in More menu if hidden */}
                  <div className="md:hidden px-3 py-2 flex items-center justify-between border-t border-slate-800 my-1">
                    <span className="text-slate-300">Zoom Level:</span>
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(z - 15, 50))}
                        className="px-2 py-0.5 text-slate-400 hover:text-white text-xs"
                      >
                        -
                      </button>
                      <span className="text-xs font-mono px-1">{zoom}%</span>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(z + 20, 200))}
                        className="px-2 py-0.5 text-slate-400 hover:text-white text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-slate-800 my-1" />

                  <div className="px-3 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Reading Order
                  </div>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      handleSwitchReadingOrder('manga-rtl');
                      setShowMoreMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 cursor-pointer transition ${
                      settings.readingOrder === 'manga-rtl' ? 'text-indigo-400 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <span>Manga (Right-to-Left)</span>
                    {settings.readingOrder === 'manga-rtl' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      handleSwitchReadingOrder('manhwa-vertical');
                      setShowMoreMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 cursor-pointer transition ${
                      settings.readingOrder === 'manhwa-vertical' ? 'text-indigo-400 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <span>Manhwa (Vertical Strip)</span>
                    {settings.readingOrder === 'manhwa-vertical' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      handleSwitchReadingOrder('comic-ltr');
                      setShowMoreMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 cursor-pointer transition ${
                      settings.readingOrder === 'comic-ltr' ? 'text-indigo-400 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <span>Comic (Left-to-Right)</span>
                    {settings.readingOrder === 'comic-ltr' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <div className="h-px bg-slate-800 my-1" />

                  <div className="px-3 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    TTS Voice & Audio
                  </div>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      toggleIncludeSpeaker();
                    }}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 cursor-pointer transition"
                  >
                    <div className="flex flex-col pr-2">
                      <span className="text-xs text-slate-200">Speak Character Names</span>
                      <span className="text-[10px] text-slate-400">
                        {includeSpeaker ? 'ON: "Character: Dialogue"' : 'OFF: Pure dialogue stream'}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                        includeSpeaker
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {includeSpeaker ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <div className="h-px bg-slate-800 my-1" />

                  <div className="px-3 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Speech Speed</span>
                    <span className="text-[9px] text-emerald-400 font-mono font-bold">
                      {speechRate.toFixed(2)}x
                    </span>
                  </div>

                  <div className="px-3 py-1.5 flex flex-col gap-2">
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.05"
                      value={speechRate}
                      onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  <div className="h-px bg-slate-800 my-1" />

                  <div className="px-3 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Scroll Velocity</span>
                    <span className="text-[9px] text-indigo-400 font-mono font-bold">
                      {scrollVelocityMultiplier.toFixed(1)}x
                    </span>
                  </div>

                  <div className="px-3 py-1.5 flex items-center gap-1">
                    {[0.5, 1.0, 1.5, 2.0].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setScrollVelocityMultiplier(preset)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                          Math.abs(scrollVelocityMultiplier - preset) < 0.04
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset}x
                      </button>
                    ))}
                  </div>

                  <div className="h-px bg-slate-800 my-1" />

                  <div className="px-3 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Developer Diagnostics
                  </div>

                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setShowDebugBoxes((prev) => !prev);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 cursor-pointer transition text-slate-200"
                  >
                    <span>OCR Debug Bounding Boxes</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        showDebugBoxes
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {showDebugBoxes ? 'Active' : 'Off'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Fullscreen Presentation Mode Toggle */}
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="min-h-[32px] h-8 w-8 sm:w-auto sm:px-2 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-slate-300 hover:text-white transition flex items-center justify-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Enter Fullscreen Presentation Mode (Esc to exit)"
                aria-label="Enter Fullscreen Presentation Mode"
              >
                <Maximize2 className="w-4 h-4 text-indigo-400" />
                <span className="hidden xl:inline text-xs font-medium">Fullscreen</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Low-Opacity Floating Controls (Divided into Left and Right Side Docks) */}
      {isFullscreen && onToggleFullscreen && (
        <FullscreenFloatingControls
          onExitFullscreen={onToggleFullscreen}
          panelTitle="Presentation Mode"
          pageInfo={{
            current: currentIndex + 1,
            total: pages.length,
            onPrev: handlePrev,
            onNext: handleNext,
            prevDisabled: currentIndex <= 0,
            nextDisabled: currentIndex >= pages.length - 1,
            isMangaRtl,
          }}
          chapterInfo={{
            currentTitle: currentChapterTitle,
            currentIndex: currentChapterIndex,
            totalChapters,
            hasPrev: hasPreviousChapter,
            hasNext: hasNextChapter,
            onPrev: onPreviousChapter,
            onNext: onNextChapter,
            availableChapters,
            onSelectChapter,
          }}
          autoScrollControls={{
            isActive: isAutoForwardActive,
            onToggle: toggleAutoForward,
            pauseSeconds,
            onPauseSecondsChange: setPauseSeconds,
            secondsRemaining,
            progressPercent,
            isAtEnd: currentIndex >= pages.length - 1,
            isSmartScrollEnabled,
            onToggleSmartScroll: toggleSmartScroll,
            scrollSpeedMode,
            onScrollSpeedModeChange: setScrollSpeedMode,
            scrollVelocityMultiplier,
            onScrollVelocityMultiplierChange: setScrollVelocityMultiplier,
            currentBlockIndex,
            totalBlocks,
            onNextBlock: goToNextBlock,
            onPreviousBlock: goToPreviousBlock,
          }}
          ttsControls={{
            isActive: isTTSActive,
            onToggle: toggleTTS,
            pipelineStatus,
            statusMessage,
            currentSpeakingText,
            voices,
            selectedVoice,
            onVoiceChange: setSelectedVoice,
            speechRate,
            onSpeechRateChange: setSpeechRate,
            scrollSpeedMode,
            onScrollSpeedModeChange: setScrollSpeedMode,
            scrollVelocityMultiplier,
            onScrollVelocityMultiplierChange: setScrollVelocityMultiplier,
            isExtractingNextPage,
            nextExtractingIndex,
            includeSpeaker,
            onToggleIncludeSpeaker: toggleIncludeSpeaker,
          }}
          showSubtitles={settings.showSpeechSubtitles}
          onToggleSubtitles={(val) => {
            if (onUpdateSettings) {
              onUpdateSettings({ ...settings, showSpeechSubtitles: val });
            }
          }}
          forceShowSubtitles={showDebugBoxes}
        >
          {/* Card: Reading Order (Content Type) */}
          <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
              Reading Order
            </span>
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => handleSwitchReadingOrder('manga-rtl')}
                className={`py-1 rounded text-[11px] font-semibold transition text-center cursor-pointer ${
                  settings.readingOrder === 'manga-rtl'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Manga: Japanese Right-to-Left slide flipping"
              >
                Manga
              </button>
              <button
                type="button"
                onClick={() => handleSwitchReadingOrder('comic-ltr')}
                className={`py-1 rounded text-[11px] font-semibold transition text-center cursor-pointer ${
                  settings.readingOrder === 'comic-ltr'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Comic: Western Left-to-Right slide flipping"
              >
                Comic
              </button>
              <button
                type="button"
                onClick={() => handleSwitchReadingOrder('manhwa-vertical')}
                className={`py-1 rounded text-[11px] font-semibold transition text-center cursor-pointer ${
                  settings.readingOrder === 'manhwa-vertical'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Manhwa: Korean Webtoon continuous vertical stream"
              >
                Manhwa
              </button>
            </div>
          </div>

          {/* Card: Display Mode */}
          <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
              Display Mode
            </span>
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => {
                  setIsContinuousScroll(false);
                  setFitMode('fit-page');
                }}
                className={`flex items-center justify-center gap-1 py-1 rounded text-[11px] transition cursor-pointer ${
                  !isContinuousScroll && fitMode === 'fit-page'
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Slide Mode (Fit Page): Fits page completely on screen"
              >
                <Minimize2 className="w-3 h-3" />
                <span>Slide</span>
              </button>

              <button
                onClick={() => {
                  setIsContinuousScroll(false);
                  setFitMode('fit-width');
                }}
                className={`flex items-center justify-center gap-1 py-1 rounded text-[11px] transition cursor-pointer ${
                  !isContinuousScroll && fitMode === 'fit-width'
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Fit Width: Scales width to screen, scrollable down"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Width</span>
              </button>

              <button
                onClick={() => setIsContinuousScroll(!isContinuousScroll)}
                className={`flex items-center justify-center gap-1 py-1 rounded text-[11px] transition cursor-pointer ${
                  isContinuousScroll
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Webtoon: Continuous vertical scrolling stream"
              >
                <MoveVertical className="w-3 h-3" />
                <span>Webtoon</span>
              </button>
            </div>

            {/* Webtoon Gap toggle if continuous scroll */}
            {isContinuousScroll && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="text-[10px] text-slate-400">Panel Gap:</span>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                  <button
                    onClick={() => setWebtoonGap('seamless')}
                    className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer ${
                      webtoonGap === 'seamless'
                        ? 'bg-emerald-700 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Seamless 0px gap"
                  >
                    0px
                  </button>
                  <button
                    onClick={() => setWebtoonGap('spaced')}
                    className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer ${
                      webtoonGap === 'spaced'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Spaced gap"
                  >
                    Spaced
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card: Canvas & Tools (Zoom, Rotate, Exclude, OCR) */}
          <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
              Canvas & Tools
            </span>
            <div className="flex items-center justify-between gap-1">
              {/* Zoom controls */}
              <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setZoom((z) => Math.max(z - 15, 50))}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoom(100)}
                  className="text-[10px] font-mono px-1 py-0.5 text-center text-slate-300 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer min-w-[32px]"
                  title="Reset Zoom to 100%"
                >
                  {zoom}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(z + 20, 200))}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Rotate */}
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
                title="Rotate 90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              {/* Exclude / Include */}
              <button
                onClick={() => onToggleExclude(currentIndex)}
                className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
                  currentPage.isExcluded
                    ? 'bg-rose-950/60 border-rose-800 text-rose-300 hover:bg-rose-950'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
                title={currentPage.isExcluded ? 'Include page in text export' : 'Exclude page from text export'}
              >
                {currentPage.isExcluded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>

              {/* Single Page OCR */}
              <button
                disabled={isProcessing || currentPage.status === 'extracting'}
                onClick={onExtractCurrentPage}
                className={`px-2 py-1 rounded-lg text-white font-semibold text-xs transition flex items-center gap-1 disabled:opacity-50 cursor-pointer ${
                  currentPage.status === 'error'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
                title={currentPage.status === 'error' ? 'Retry AI Vision OCR' : 'Extract page text'}
              >
                {currentPage.status === 'error' ? (
                  <RefreshCw className="w-3 h-3" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                <span>OCR</span>
              </button>
            </div>

            {/* Debug Boxes Toggle Button */}
            <button
              type="button"
              onClick={() => setShowDebugBoxes(!showDebugBoxes)}
              className={`w-full mt-1.5 py-1 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                showDebugBoxes
                  ? 'bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-500/30'
                  : 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800'
              }`}
              title="Toggle visual OCR text bounding boxes overlay on comic pages"
            >
              <span>{showDebugBoxes ? '🔍 Hide OCR Debug Boxes' : '🔍 Show OCR Debug Boxes'}</span>
            </button>
          </div>
        </FullscreenFloatingControls>
      )}

      {/* Main Canvas / Image Stage */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`bg-slate-950 relative select-none w-full max-w-full overflow-x-auto ${
          isFullscreen
            ? 'flex-1 h-full'
            : 'min-h-[480px] h-[75vh] max-h-[840px]'
        } ${
          isContinuousScroll
            ? 'overflow-y-auto px-1 sm:px-4 py-0'
            : fitMode === 'fit-width'
            ? 'overflow-y-auto flex flex-col items-center justify-start p-1 sm:p-6'
            : 'overflow-hidden flex items-center justify-center p-1 sm:p-4'
        }`}
      >

        {isContinuousScroll ? (
          // Continuous Webtoon Strip (Seamless 0px Gap prevents sliced text)
          <div
            className={`w-full ${isFullscreen ? 'max-w-4xl lg:max-w-5xl' : 'max-w-3xl lg:max-w-4xl'} mx-auto flex flex-col items-center ${
              isFullscreen ? 'pb-8' : 'pb-24'
            } transition-all duration-150 ${
              webtoonGap === 'spaced'
                ? 'gap-6 pt-4'
                : 'gap-0 pt-0 text-[0px] leading-none'
            }`}
            style={{
              width: zoom !== 100 ? `${zoom}%` : '100%',
              maxWidth: zoom > 100 ? `${zoom}%` : undefined,
            }}
          >
            {pages.map((page, idx) => (
              <div
                key={page.id}
                id={`scroll-page-${idx}`}
                className={`relative w-full overflow-hidden block ${
                  webtoonGap === 'spaced'
                    ? `rounded-xl border shadow-xl mb-4 transition ${
                        idx === currentIndex
                          ? 'ring-2 ring-indigo-500 border-indigo-500'
                          : 'border-slate-800/90 hover:border-slate-700'
                      }`
                    : 'border-0 rounded-none shadow-none m-0 p-0 leading-none text-[0px]'
                }`}
                onClick={() => {
                  resetTimer();
                  if (idx !== currentIndex) onPageChange(idx);
                }}
              >
                {/* Extra / Ad Page Alert Banner */}
                {page.isExtraPage && (
                  <div className="absolute top-2 right-2 bg-amber-950/90 text-amber-300 text-[11px] px-2 py-0.5 rounded font-bold border border-amber-700/80 shadow backdrop-blur z-10">
                    ⚠️ Ad/Extra Page
                  </div>
                )}
                {/* In Spaced mode, show individual page badge */}
                {webtoonGap === 'spaced' && (
                  <div className="absolute top-2.5 left-2.5 bg-slate-900/85 text-white text-xs px-2.5 py-1 rounded-md font-bold backdrop-blur border border-slate-700 shadow flex items-center gap-1.5 z-10">
                    <span>Page {idx + 1}</span>
                  </div>
                )}
                <div className="relative w-full block m-0 p-0 leading-none">
                  <img
                      src={page.imageUrl}
                      alt={page.fileName}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-contain block m-0 p-0 border-0 align-bottom select-none"
                      style={{
                        display: 'block',
                        verticalAlign: 'bottom',
                        margin: 0,
                        padding: 0,
                        border: 0,
                      }}
                      loading={idx < 4 ? 'eager' : 'lazy'}
                    />

                  {/* Active Smart Scroll Text Box Highlight Overlay */}
                  {isSmartScrollEnabled && (isTTSActive || isAutoForwardActive) && settings.showSpeechSubtitles && idx === currentIndex && activeBlock && activeBlock.box_2d && activeBlock.box_2d.length === 4 && (
                    <div
                      className="absolute pointer-events-none border-2 border-indigo-400 bg-indigo-500/15 rounded-xl shadow-[0_0_25px_rgba(99,102,241,0.6)] z-20 transition-all duration-300"
                      style={{
                        top: `${activeBlock.box_2d[0] / 10}%`,
                        left: `${activeBlock.box_2d[1] / 10}%`,
                        height: `${Math.max(2, (activeBlock.box_2d[2] - activeBlock.box_2d[0]) / 10)}%`,
                        width: `${Math.max(2, (activeBlock.box_2d[3] - activeBlock.box_2d[1]) / 10)}%`,
                      }}
                    >
                      <div className="absolute -top-3.5 left-2 bg-indigo-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-md border border-indigo-400/60 flex items-center gap-1 animate-pulse">
                        <span>Box {(currentBlockIndex ?? 0) + 1}</span>
                      </div>
                    </div>
                  )}

                  {/* Diagnostic OCR Bounding Boxes Overlay */}
                  <DiagnosticOverlay
                    blocks={page.blocks || []}
                    isVisible={showDebugBoxes}
                    onSelectBlock={(b, bIdx) => handleSelectDiagnosticBlock(b, bIdx, idx)}
                  />
                </div>
              </div>
            ))}

            {/* End of Chapter Interactive Card in Continuous Scroll Mode */}
            <div className="w-full max-w-lg mx-auto my-10 p-6 rounded-2xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-800 text-center flex flex-col items-center gap-4 shadow-2xl backdrop-blur">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-lg">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                  You have finished reading
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-100 mt-0.5">
                  {currentChapterTitle || `Chapter ${(currentChapterIndex || 0) + 1}`}
                </h3>
              </div>

              {totalChapters && totalChapters > 1 ? (
                <div className="flex items-center gap-2.5 flex-wrap justify-center w-full pt-1">
                  {hasPreviousChapter && (
                    <button
                      type="button"
                      onClick={onPreviousChapter}
                      disabled={isLoadingChapter}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous Chapter</span>
                    </button>
                  )}

                  {hasNextChapter ? (
                    <button
                      type="button"
                      onClick={onNextChapter}
                      disabled={isLoadingChapter}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-500/25 transition flex items-center gap-2 cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isLoadingChapter ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Loading Next Chapter...</span>
                        </>
                      ) : (
                        <>
                          <span>Read Next Chapter</span>
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-4 py-2 rounded-xl font-medium">
                      ✨ You are on the latest chapter!
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : fitMode === 'fit-width' ? (
          // Single Page View: Fit to Width (Supports natural scrolling down long Manhwa pages)
          <div
            className={`w-full ${isFullscreen ? 'max-w-4xl lg:max-w-5xl' : 'max-w-3xl lg:max-w-4xl'} mx-auto transition-transform duration-100 ease-out flex flex-col items-center ${isFullscreen ? 'pb-8' : 'pb-12'}`}
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'top center',
              minHeight: pendingScrollRestoreRef.current ? `${lastScrollHeightRef.current}px` : undefined,
            }}
          >
            <div className="relative w-full">
                <img
                  src={currentPage.imageUrl}
                  alt={currentPage.fileName}
                  referrerPolicy="no-referrer"
                  onLoad={handleImageLoad}
                  className="w-full h-auto object-contain rounded-xl shadow-2xl border border-slate-800 block"
                />

              {/* Active Smart Scroll Text Box Highlight Overlay */}
              {isSmartScrollEnabled && (isTTSActive || isAutoForwardActive) && settings.showSpeechSubtitles && activeBlock && activeBlock.box_2d && activeBlock.box_2d.length === 4 && (
                <div
                  className="absolute pointer-events-none border-2 border-indigo-400 bg-indigo-500/15 rounded-xl shadow-[0_0_25px_rgba(99,102,241,0.6)] z-20 transition-all duration-300"
                  style={{
                    top: `${activeBlock.box_2d[0] / 10}%`,
                    left: `${activeBlock.box_2d[1] / 10}%`,
                    height: `${Math.max(2, (activeBlock.box_2d[2] - activeBlock.box_2d[0]) / 10)}%`,
                    width: `${Math.max(2, (activeBlock.box_2d[3] - activeBlock.box_2d[1]) / 10)}%`,
                  }}
                >
                  <div className="absolute -top-3.5 left-2 bg-indigo-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-md border border-indigo-400/60 flex items-center gap-1 animate-pulse">
                    <span>Box {(currentBlockIndex ?? 0) + 1}</span>
                  </div>
                </div>
              )}

              {/* Diagnostic OCR Bounding Boxes Overlay */}
              <DiagnosticOverlay
                blocks={currentPage.blocks || []}
                isVisible={showDebugBoxes}
                onSelectBlock={(b, bIdx) => handleSelectDiagnosticBlock(b, bIdx, currentIndex)}
              />
            </div>

            {/* End of Chapter Card in Single Page Mode on the Last Page */}
            {currentIndex === pages.length - 1 && hasNextChapter && (
              <div className="mt-8 p-4 rounded-xl bg-indigo-950/80 border border-indigo-700/80 text-center flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl max-w-xl w-full">
                <div className="text-left">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">End of Chapter</span>
                  <div className="text-xs font-semibold text-white">Finished current chapter panels</div>
                </div>
                <button
                  type="button"
                  onClick={onNextChapter}
                  disabled={isLoadingChapter}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow cursor-pointer shrink-0"
                >
                  <span>Next Chapter</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          // Single Page View: Fit to Page (Fits complete page inside viewer window like a presentation slide)
          <div
            className="transition-transform duration-100 ease-out flex flex-col items-center justify-center max-w-full m-auto"
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <div className="relative inline-block leading-none m-0 p-0 max-w-full">
              <img
                src={currentPage.imageUrl}
                alt={currentPage.fileName}
                referrerPolicy="no-referrer"
                onLoad={handleImageLoad}
                className={`${isFullscreen ? 'max-h-[96vh] max-w-[96vw]' : 'max-h-[70vh] max-w-full'} w-auto h-auto object-contain rounded-xl shadow-2xl border border-slate-800/80 block select-none`}
              />

              {/* Active Smart Scroll Text Box Highlight Overlay */}
              {isSmartScrollEnabled && (isTTSActive || isAutoForwardActive) && settings.showSpeechSubtitles && activeBlock && activeBlock.box_2d && activeBlock.box_2d.length === 4 && (
                <div
                  className="absolute pointer-events-none border-2 border-indigo-400 bg-indigo-500/15 rounded-xl shadow-[0_0_25px_rgba(99,102,241,0.6)] z-20 transition-all duration-300"
                  style={{
                    top: `${activeBlock.box_2d[0] / 10}%`,
                    left: `${activeBlock.box_2d[1] / 10}%`,
                    height: `${Math.max(2, (activeBlock.box_2d[2] - activeBlock.box_2d[0]) / 10)}%`,
                    width: `${Math.max(2, (activeBlock.box_2d[3] - activeBlock.box_2d[1]) / 10)}%`,
                  }}
                >
                  <div className="absolute -top-3.5 left-2 bg-indigo-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-md border border-indigo-400/60 flex items-center gap-1 animate-pulse">
                    <span>Box {(currentBlockIndex ?? 0) + 1}</span>
                  </div>
                </div>
              )}

              {/* Diagnostic OCR Bounding Boxes Overlay */}
              <DiagnosticOverlay
                blocks={currentPage.blocks || []}
                isVisible={showDebugBoxes}
                onSelectBlock={(b, bIdx) => handleSelectDiagnosticBlock(b, bIdx, currentIndex)}
              />
            </div>

            {/* End of Chapter Card in Fit Page Mode on the Last Page */}
            {currentIndex === pages.length - 1 && hasNextChapter && (
              <div className="mt-4 p-3 rounded-xl bg-indigo-950/80 border border-indigo-700/80 text-center flex items-center justify-between gap-3 shadow-xl max-w-md w-full">
                <span className="text-xs font-semibold text-white truncate">Finished Chapter</span>
                <button
                  type="button"
                  onClick={onNextChapter}
                  disabled={isLoadingChapter}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center gap-1 shadow cursor-pointer shrink-0"
                >
                  <span>Next Chapter</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading Chapter Overlay */}
        {isLoadingChapter && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3 animate-in fade-in">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center shadow-lg">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-white">{loadingChapterMessage || 'Loading chapter...'}</div>
              <div className="text-xs text-slate-400 mt-0.5">Fetching and preparing comic panels</div>
            </div>
          </div>
        )}

        {/* Floating Continuous Webtoon Page Pill (only in non-fullscreen) */}
        {!isFullscreen && isContinuousScroll && (
          <div className="sticky bottom-4 left-4 float-left z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/95 text-slate-200 text-xs font-semibold shadow-2xl border border-slate-700/80 backdrop-blur pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Panel {currentIndex + 1} of {pages.length}</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-300 text-[11px] font-medium">
              {webtoonGap === 'seamless' ? '0px Seamless' : 'Spaced'}
            </span>
          </div>
        )}

        {/* Floating "Back to Top" Button */}
        {showScrollTop && (
          <button
            onClick={handleScrollToTop}
            className={`sticky bottom-4 float-right mr-2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xl border border-indigo-400/40 backdrop-blur transition-all duration-150 animate-in fade-in cursor-pointer ${
              isFullscreen ? 'mb-4' : ''
            }`}
            title="Scroll to Top (Page 1)"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>Top</span>
          </button>
        )}

        {/* Real-time OCR & Scrolling Diagnostic HUD */}
        {showDebugBoxes && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-amber-500/50 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md max-w-xs w-full text-xs font-mono text-slate-200 select-text">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <span>📐 OCR & Scroll Debugger</span>
              </span>
              <button
                type="button"
                onClick={() => setShowDebugBoxes(false)}
                className="text-slate-400 hover:text-white cursor-pointer px-1"
                title="Hide Debugger"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 my-2.5 text-center">
              <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-400">scrollTop</div>
                <div className="text-amber-300 font-bold text-xs">{containerMetrics.scrollTop}px</div>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-400">clientHeight</div>
                <div className="text-indigo-300 font-bold text-xs">{containerMetrics.clientHeight}px</div>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-400">scrollHeight</div>
                <div className="text-emerald-300 font-bold text-xs">{containerMetrics.scrollHeight}px</div>
              </div>
            </div>

            <div className="mb-2.5">
              <div className="text-[9px] text-slate-400 mb-1">Quick Scroll Anchors:</div>
              <div className="flex flex-wrap gap-1">
                {[0, 1000, 2000, 4000, 6000].map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      scrollContainerRef.current?.scrollTo({ top: y, behavior: 'smooth' });
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-[10px] border border-slate-700 cursor-pointer"
                  >
                    {y}px
                  </button>
                ))}
              </div>
            </div>

            {debugSelectedBlockInfo ? (
              <div className="bg-indigo-950/60 p-2 rounded-lg border border-indigo-700/60">
                <div className="text-[10px] font-bold text-indigo-300">
                  Selected: Box #{debugSelectedBlockInfo.idx}
                </div>
                <div className="text-[9px] text-slate-300 truncate mt-0.5">
                  "{debugSelectedBlockInfo.text}"
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">
                  box_2d: [{debugSelectedBlockInfo.box_2d.join(', ')}]
                </div>
                <div className="text-[9px] text-amber-300 mt-0.5">
                  Target Scroll: {debugSelectedBlockInfo.targetScroll}px
                </div>
              </div>
            ) : (
              <div className="text-[9px] text-slate-400 italic">
                Tip: Click any red box on the page to test smart scroll targeting.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Bottom Bar (Hidden in Fullscreen Presentation Mode) */}
      {!isFullscreen && (
        <div className="bg-slate-950/90 px-4 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{currentPage.fileName}</span>
            <span>•</span>
            <span>
              {currentPage.mimeType} ({(currentPage.blob.size / 1024).toFixed(0)} KB)
            </span>
            {isLongPage && !isContinuousScroll && (
              <span className="text-emerald-400 font-medium hidden sm:inline">
                • Tall Strip Page (scroll to read full page)
              </span>
            )}
            {isContinuousScroll && (
              <span className="text-emerald-400 font-medium hidden sm:inline">
                • Continuous Webtoon Stream (Page {currentIndex + 1} of {pages.length} - {webtoonGap === 'seamless' ? 'Seamless 0px Gap' : 'Spaced'})
              </span>
            )}
          </div>
          <div>
            {currentPage.status === 'completed' ? (
              <span className="text-emerald-400 font-medium">
                OCR Complete ({currentPage.blocks?.length || 0} blocks)
              </span>
            ) : currentPage.status === 'extracting' ? (
              <span className="text-indigo-400 animate-pulse font-medium">Extracting with Gemini AI Vision...</span>
            ) : currentPage.status === 'error' ? (
              <span className="text-rose-400 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>OCR Notice: {currentPage.error || 'Click Retry OCR to try again'}</span>
              </span>
            ) : (
              <span>Ready to extract</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
