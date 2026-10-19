import { useState, useEffect, useRef, useCallback } from 'react';

export const STORAGE_KEY_PAUSE = 'cbz_auto_scroll_pause_sec';
export const DEFAULT_PAUSE_SECONDS = 5;
export const MIN_PAUSE_SECONDS = 0;
export const MAX_PAUSE_SECONDS = 120;

export interface UseAutoPageAdvanceOptions {
  isFullscreen: boolean;
  currentPageIndex: number;
  totalPages: number;
  onAdvancePage: (nextIndex: number) => void;
  defaultPauseSeconds?: number;
}

export interface UseAutoPageAdvanceReturn {
  isAutoAdvanceActive: boolean;
  toggleAutoAdvance: () => void;
  setIsAutoAdvanceActive: (active: boolean) => void;
  pauseSeconds: number;
  setPauseSeconds: (seconds: number) => void;
  secondsRemaining: number;
  progressPercent: number;
  resetTimer: () => void;
}

/**
 * Hook to manage automatic page advancement / auto-scroll in PPTX fullscreen presentation mode.
 *
 * Requirements strictly enforced:
 * 1. Fullscreen Only: If isFullscreen is false, Auto-Scroll cannot run and controls are hidden.
 *    Exiting fullscreen immediately stops Auto-Scroll.
 * 2. User-configurable pause time (e.g. 2s, 3s, 5s, 10s, or custom direct numeric value with min 1s).
 * 3. Advances smoothly to next page (N -> N+1) until reaching the final page, where it stops automatically.
 * 4. Manual interaction (page flip, scroll, keypress) resets the timer.
 * 5. Avoids multiple timers and cleans up all intervals/timeouts.
 */
export function useAutoPageAdvance({
  isFullscreen,
  currentPageIndex,
  totalPages,
  onAdvancePage,
  defaultPauseSeconds = DEFAULT_PAUSE_SECONDS,
}: UseAutoPageAdvanceOptions): UseAutoPageAdvanceReturn {
  // Configured pause duration (persisted in localStorage)
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
        // Fallback to default
      }
    }
    return defaultPauseSeconds;
  });

  const [isAutoAdvanceActive, setIsAutoAdvanceActiveState] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(pauseSeconds);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const onAdvancePageRef = useRef(onAdvancePage);
  useEffect(() => {
    onAdvancePageRef.current = onAdvancePage;
  }, [onAdvancePage]);

  const currentPageIndexRef = useRef(currentPageIndex);
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  const totalPagesRef = useRef(totalPages);
  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  const pauseSecondsRef = useRef(pauseSeconds);
  useEffect(() => {
    pauseSecondsRef.current = pauseSeconds;
  }, [pauseSeconds]);

  // Timestamp of the start of the current pause period
  const timerStartRef = useRef<number | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // Update pause duration with sensible clamping and persistence
  const setPauseSeconds = useCallback((rawSeconds: number) => {
    const validSeconds = Math.max(
      MIN_PAUSE_SECONDS,
      Math.min(MAX_PAUSE_SECONDS, Math.round(rawSeconds * 10) / 10)
    );
    setPauseSecondsState(validSeconds);
    pauseSecondsRef.current = validSeconds;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_PAUSE, validSeconds.toString());
      }
    } catch {
      // Ignore storage errors
    }
    // If active, reset current timer so new duration is immediately respected
    if (timerStartRef.current !== null) {
      timerStartRef.current = Date.now();
      setSecondsRemaining(validSeconds);
      setProgressPercent(0);
    }
  }, []);

  // Clear running timer interval
  const clearTimer = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    timerStartRef.current = null;
  }, []);

  // Reset timer countdown (e.g. on manual page change or scroll)
  const resetTimer = useCallback(() => {
    if (isAutoAdvanceActive && isFullscreen) {
      timerStartRef.current = Date.now();
      setSecondsRemaining(pauseSecondsRef.current);
      setProgressPercent(0);
    }
  }, [isAutoAdvanceActive, isFullscreen]);

  // Toggle Auto-Advance on/off
  const toggleAutoAdvance = useCallback(() => {
    if (!isFullscreen) return;
    setIsAutoAdvanceActiveState((prev) => {
      const next = !prev;
      if (!next) {
        clearTimer();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);
      } else {
        // If already on the last page, cannot start auto-scroll
        if (currentPageIndexRef.current >= totalPagesRef.current - 1) {
          return false;
        }
        timerStartRef.current = Date.now();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);
      }
      return next;
    });
  }, [isFullscreen, clearTimer]);

  const setIsAutoAdvanceActive = useCallback(
    (active: boolean) => {
      if (!isFullscreen && active) return;
      if (active && currentPageIndexRef.current >= totalPagesRef.current - 1) {
        return;
      }
      setIsAutoAdvanceActiveState(active);
      if (!active) {
        clearTimer();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);
      } else {
        timerStartRef.current = Date.now();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);
      }
    },
    [isFullscreen, clearTimer]
  );

  // STRICT REQUIREMENT: If not fullscreen, immediately stop auto-scroll and reset
  useEffect(() => {
    if (!isFullscreen) {
      if (isAutoAdvanceActive) {
        setIsAutoAdvanceActiveState(false);
      }
      clearTimer();
      setSecondsRemaining(pauseSecondsRef.current);
      setProgressPercent(0);
    }
  }, [isFullscreen, isAutoAdvanceActive, clearTimer]);

  // Reset countdown when current page index changes (manual navigation or after advance)
  useEffect(() => {
    if (isAutoAdvanceActive && isFullscreen) {
      // Check if reached end of content
      if (currentPageIndex >= totalPages - 1) {
        setIsAutoAdvanceActiveState(false);
        clearTimer();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(100);
      } else {
        timerStartRef.current = Date.now();
        setSecondsRemaining(pauseSecondsRef.current);
        setProgressPercent(0);
      }
    }
  }, [currentPageIndex, totalPages, isAutoAdvanceActive, isFullscreen, clearTimer]);

  // Main countdown timer loop when active
  useEffect(() => {
    if (!isAutoAdvanceActive || !isFullscreen) {
      clearTimer();
      return;
    }

    // If starting on or reached last page, stop immediately
    if (currentPageIndexRef.current >= totalPagesRef.current - 1) {
      setIsAutoAdvanceActiveState(false);
      clearTimer();
      return;
    }

    if (!timerStartRef.current) {
      timerStartRef.current = Date.now();
    }

    // Interval tick at 100ms for smooth progress tracking
    intervalIdRef.current = setInterval(() => {
      if (!timerStartRef.current) return;

      const targetDuration = pauseSecondsRef.current;
      if (targetDuration <= 0) {
        setSecondsRemaining(0);
        setProgressPercent(100);
        const cur = currentPageIndexRef.current;
        const total = totalPagesRef.current;
        if (cur < total - 1) {
          timerStartRef.current = Date.now();
          onAdvancePageRef.current(cur + 1);
        } else {
          setIsAutoAdvanceActiveState(false);
          clearTimer();
        }
        return;
      }

      const elapsed = (Date.now() - timerStartRef.current) / 1000;
      const remaining = Math.max(0, targetDuration - elapsed);
      const percent = Math.min(100, Math.max(0, (elapsed / targetDuration) * 100));

      setSecondsRemaining(Math.ceil(remaining));
      setProgressPercent(percent);

      if (remaining <= 0) {
        // Time expired! Advance to next page
        const cur = currentPageIndexRef.current;
        const total = totalPagesRef.current;

        if (cur < total - 1) {
          // Advance to next page using existing navigation mechanism
          timerStartRef.current = Date.now();
          onAdvancePageRef.current(cur + 1);
        } else {
          // Reached the final page: stop automatically
          setIsAutoAdvanceActiveState(false);
          clearTimer();
        }
      }
    }, 100);

    return () => {
      clearTimer();
    };
  }, [isAutoAdvanceActive, isFullscreen, clearTimer]);

  return {
    isAutoAdvanceActive,
    toggleAutoAdvance,
    setIsAutoAdvanceActive,
    pauseSeconds,
    setPauseSeconds,
    secondsRemaining,
    progressPercent,
    resetTimer,
  };
}
