import { ComicPage, ReadingOrderMode } from '../types';

export interface ScrollTransitionContext {
  prevIndex: number;
  nextIndex: number;
  prevPage?: ComicPage;
  nextPage?: ComicPage;
  prevScrollTop: number;
  prevScrollHeight: number;
  containerClientHeight: number;
  fitMode: 'fit-width' | 'fit-page';
  readingOrder: ReadingOrderMode;
  prevAspectRatio?: number;
  nextAspectRatio?: number;
}

/**
 * Determines whether the comic reader should reset the scroll position to the top
 * or persist the current scroll offset when transitioning pages.
 *
 * Resets to top (returns true) ONLY when:
 * 1. Initial load or invalid previous index.
 * 2. Already at or near the top of the container (scrollTop <= 20px).
 * 3. Non-consecutive page jumps (|nextIndex - prevIndex| > 1), e.g., via dropdown or thumbnail picker.
 * 4. Transitioning to or from an extra page (credits, advertisements, covers, author notes).
 * 5. The reader was already scrolled to the bottom of the previous page (finished reading that page slice).
 * 6. Standard slide mode ('fit-page' mode) for non-manhwa reading where pages are intended to be viewed as whole slides.
 * 7. Transitioning between significantly different page formats/aspect ratios (e.g. tall manhwa strip vs standard comic page or ratio delta > 35%).
 *
 * For consecutive long manhwa pages (or tall strips in fit-width mode), it returns false,
 * allowing the reader to persist the current scroll position for a continuous reading experience.
 */
export function shouldResetScrollToTop(context: ScrollTransitionContext): boolean {
  const {
    prevIndex,
    nextIndex,
    prevPage,
    nextPage,
    prevScrollTop,
    prevScrollHeight,
    containerClientHeight,
    fitMode,
    readingOrder,
    prevAspectRatio,
    nextAspectRatio,
  } = context;

  // Initial load or invalid index
  if (prevIndex < 0 || prevIndex === nextIndex) {
    return true;
  }

  // 1. If already at the top, resetting to 0 is natural and identical
  if (prevScrollTop <= 20) {
    return true;
  }

  // 2. Non-consecutive navigation (e.g. jump across chapters or via dropdown/gallery)
  const jumpDistance = Math.abs(nextIndex - prevIndex);
  if (jumpDistance > 1) {
    return true;
  }

  // 3. Extra pages (credits, adverts, covers, recaps) are structurally distinct
  if (prevPage?.isExtraPage || nextPage?.isExtraPage) {
    return true;
  }

  // 4. If user already scrolled to the bottom of the previous page, they completed reading it
  // and should start at the top of the new page.
  if (prevScrollHeight > containerClientHeight) {
    const isAtBottom = prevScrollTop + containerClientHeight >= prevScrollHeight - 50;
    if (isAtBottom) {
      return true;
    }
  }

  // 5. Check if pages are long manhwa strips or standard slides
  const isManhwaMode = readingOrder === 'manhwa-vertical';
  const isPrevTall = prevAspectRatio ? prevAspectRatio >= 1.5 : false;
  const isNextTall = nextAspectRatio ? nextAspectRatio >= 1.5 : false;

  // In standard fit-page mode without manhwa reading order or tall strips, reset to top
  if (fitMode === 'fit-page' && !isManhwaMode && !isPrevTall && !isNextTall) {
    return true;
  }

  // 6. Significant aspect ratio delta between consecutive pages
  // If one page is a tall manhwa strip and the other is a standard/landscape comic page,
  // or if aspect ratios differ by more than 35%, reset to top.
  if (prevAspectRatio && nextAspectRatio) {
    const minRatio = Math.min(prevAspectRatio, nextAspectRatio);
    const maxRatio = Math.max(prevAspectRatio, nextAspectRatio);
    const ratioDelta = (maxRatio - minRatio) / maxRatio;

    // Transitioning between tall strip and standard comic page
    if ((isPrevTall && !isNextTall) || (!isPrevTall && isNextTall)) {
      return true;
    }

    if (ratioDelta > 0.35) {
      return true;
    }
  }

  // Consecutive long manhwa / tall strip pages in fit-width or manhwa mode:
  // Persist current scroll position for smooth uninterrupted reading!
  return false;
}

/**
 * Calculates the relative scroll progress (0.0 to 1.0) within the scrollable range of a page.
 */
export function calculatePersistedScrollProgress(
  prevScrollTop: number,
  prevScrollHeight: number,
  containerClientHeight: number
): number {
  const maxPrevScroll = Math.max(1, prevScrollHeight - containerClientHeight);
  return Math.max(0, Math.min(1, prevScrollTop / maxPrevScroll));
}

/**
 * Calculates a safe persisted scroll position matching the relative progress on the new image.
 */
export function calculatePersistedScrollTop(
  relativeProgressOrScrollTop: number,
  newScrollHeight: number,
  containerClientHeight: number
): number {
  const maxScroll = Math.max(0, newScrollHeight - containerClientHeight);
  if (maxScroll <= 0) return 0;
  
  // If passed a 0.0 - 1.0 ratio, multiply by maxScroll
  if (relativeProgressOrScrollTop >= 0 && relativeProgressOrScrollTop <= 1) {
    return Math.round(relativeProgressOrScrollTop * maxScroll);
  }
  
  // Fallback if passed raw pixel value
  return Math.min(Math.max(0, Math.round(relativeProgressOrScrollTop)), maxScroll);
}
