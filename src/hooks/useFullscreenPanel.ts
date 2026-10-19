import { useState, useEffect, useCallback, useRef } from 'react';

export type FullscreenPanelType = 'viewer' | 'inspector' | 'grid';

export interface UseFullscreenPanelReturn {
  fullscreenPanel: FullscreenPanelType | null;
  isFullscreen: boolean;
  enterFullscreen: (panel: FullscreenPanelType) => void;
  exitFullscreen: () => void;
  toggleFullscreen: (panel?: FullscreenPanelType) => void;
}

/**
 * Hook to manage presentation-style fullscreen mode for view panels.
 * Integrates with the browser Fullscreen API where permitted (with graceful fallback on mobile / iframes)
 * and handles Escape key listeners and fullscreenchange events.
 */
export function useFullscreenPanel(defaultPanel: FullscreenPanelType = 'viewer'): UseFullscreenPanelReturn {
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanelType | null>(null);
  const isNativeFullscreenRef = useRef<boolean>(false);
  const isTransitionPendingRef = useRef<boolean>(false);

  const isFullscreen = fullscreenPanel !== null;

  const requestBrowserFullscreen = async () => {
    // Avoid native browser fullscreen on mobile / tablet devices.
    // CSS-based fixed inset-0 presentation view is highly stable, avoids native browser status bar conflicts,
    // and bypasses the intrusive Chrome/Safari "to exit full screen..." system notification banners.
    const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(
      navigator.userAgent || navigator.vendor || (window as any).opera
    );
    if (isMobileDevice) {
      isNativeFullscreenRef.current = false;
      return;
    }

    if (isTransitionPendingRef.current) return;
    isTransitionPendingRef.current = true;

    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const root = document.documentElement;
        if (root.requestFullscreen) {
          const promise = root.requestFullscreen();
          if (promise && typeof promise.catch === 'function') {
            await promise.catch((err) => {
              console.warn('Native fullscreen request rejected:', err);
              isNativeFullscreenRef.current = false;
            });
          } else {
            await promise;
          }
          isNativeFullscreenRef.current = !!document.fullscreenElement;
        } else if ((root as any).webkitRequestFullscreen) {
          const promise = (root as any).webkitRequestFullscreen();
          if (promise && typeof promise.catch === 'function') {
            await promise.catch((err) => {
              console.warn('Native webkit fullscreen request rejected:', err);
              isNativeFullscreenRef.current = false;
            });
          } else {
            await promise;
          }
          isNativeFullscreenRef.current = !!(document as any).webkitFullscreenElement;
        }
      }
    } catch (err) {
      // Browser fullscreen may be blocked by iframe permissions policy or unsupported on iOS Safari.
      // The CSS fixed inset-0 presentation view handles this seamlessly without breaking fullscreen mode.
      console.warn('Native requestFullscreen threw a synchronous error:', err);
      isNativeFullscreenRef.current = false;
    } finally {
      isTransitionPendingRef.current = false;
    }
  };

  const exitBrowserFullscreen = async () => {
    if (isTransitionPendingRef.current) return;
    isTransitionPendingRef.current = true;

    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          const promise = document.exitFullscreen();
          if (promise && typeof promise.catch === 'function') {
            await promise.catch((err) => {
              console.warn('Native exitFullscreen request rejected:', err);
            });
          } else {
            await promise;
          }
        } else if ((document as any).webkitExitFullscreen) {
          const promise = (document as any).webkitExitFullscreen();
          if (promise && typeof promise.catch === 'function') {
            await promise.catch((err) => {
              console.warn('Native webkit exitFullscreen request rejected:', err);
            });
          } else {
            await promise;
          }
        }
      }
    } catch (err) {
      console.warn('Native exitFullscreen threw a synchronous error:', err);
    } finally {
      isNativeFullscreenRef.current = false;
      isTransitionPendingRef.current = false;
    }
  };

  const enterFullscreen = useCallback((panel: FullscreenPanelType) => {
    setFullscreenPanel(panel);
    requestBrowserFullscreen();
  }, []);

  const exitFullscreen = useCallback(() => {
    setFullscreenPanel(null);
    exitBrowserFullscreen();
  }, []);

  const toggleFullscreen = useCallback(
    (panel?: FullscreenPanelType) => {
      if (fullscreenPanel !== null) {
        exitFullscreen();
      } else {
        enterFullscreen(panel || defaultPanel);
      }
    },
    [fullscreenPanel, defaultPanel, enterFullscreen, exitFullscreen]
  );

  // Synchronize with native fullscreen exit and Escape key
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNativeActive = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      // Only exit presentation mode if native browser fullscreen was previously active and was exited
      if (isNativeFullscreenRef.current && !isNativeActive) {
        isNativeFullscreenRef.current = false;
        if (fullscreenPanel !== null) {
          setFullscreenPanel(null);
        }
      } else if (isNativeActive) {
        isNativeFullscreenRef.current = true;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenPanel !== null) {
        e.preventDefault();
        e.stopPropagation();
        exitFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreenPanel, exitFullscreen]);

  return {
    fullscreenPanel,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
