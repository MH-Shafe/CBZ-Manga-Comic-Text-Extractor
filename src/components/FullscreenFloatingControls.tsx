import React, { useState, useEffect, useRef } from 'react';
import {
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  Sliders,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoveVertical,
  Layers,
  Settings,
  X,
  Gauge,
  Clock,
  Subtitles,
  HelpCircle,
  Eye,
} from 'lucide-react';
import { TTSPipelineStatus } from '../hooks/useFullscreenTTSNarrator';

export interface AutoScrollControlsConfig {
  isActive: boolean;
  onToggle: () => void;
  pauseSeconds: number;
  onPauseSecondsChange: (seconds: number) => void;
  secondsRemaining: number;
  progressPercent: number;
  isAtEnd?: boolean;
  isSmartScrollEnabled?: boolean;
  onToggleSmartScroll?: () => void;
  scrollSpeedMode?: 'slow' | 'normal' | 'fast';
  onScrollSpeedModeChange?: (mode: 'slow' | 'normal' | 'fast') => void;
  scrollVelocityMultiplier?: number;
  onScrollVelocityMultiplierChange?: (multiplier: number) => void;
  currentBlockIndex?: number | null;
  totalBlocks?: number;
  onNextBlock?: () => void;
  onPreviousBlock?: () => void;
}

export interface TTSControlsConfig {
  isActive: boolean;
  onToggle: () => void;
  pipelineStatus: TTSPipelineStatus;
  statusMessage: string;
  currentSpeakingText?: string;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  onVoiceChange: (voice: SpeechSynthesisVoice) => void;
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  scrollSpeedMode?: 'slow' | 'normal' | 'fast';
  onScrollSpeedModeChange?: (mode: 'slow' | 'normal' | 'fast') => void;
  scrollVelocityMultiplier?: number;
  onScrollVelocityMultiplierChange?: (multiplier: number) => void;
  isExtractingNextPage?: boolean;
  nextExtractingIndex?: number | null;
  includeSpeaker?: boolean;
  onToggleIncludeSpeaker?: () => void;
}

export interface FullscreenFloatingControlsProps {
  onExitFullscreen: () => void;
  panelTitle?: string;
  pageInfo?: {
    current: number;
    total: number;
    onPrev?: () => void;
    onNext?: () => void;
    prevDisabled?: boolean;
    nextDisabled?: boolean;
    isMangaRtl?: boolean;
  };
  chapterInfo?: {
    currentTitle?: string;
    currentIndex?: number;
    totalChapters?: number;
    hasPrev?: boolean;
    hasNext?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
    availableChapters?: Array<any>;
    onSelectChapter?: (val: any) => void;
  };
  autoScrollControls?: AutoScrollControlsConfig;
  ttsControls?: TTSControlsConfig;
  children?: React.ReactNode;
  position?: 'bottom' | 'top';
  showTopRightExit?: boolean;
  showSubtitles?: boolean;
  onToggleSubtitles?: (val: boolean) => void;
  forceShowSubtitles?: boolean;
}

/**
 * Immersive Minimal Fullscreen Presentation HUD.
 *
 * Design:
 * - Manga image dominates the entire viewport.
 * - Floating bottom HUD with essential controls:
 *   [Previous Page] [Page X / Y] [Next Page] [Play/Stop TTS] [More Settings] [Exit Fullscreen]
 * - Auto-hides on inactivity after 3.5s; instantly reveals on cursor movement or tap.
 * - Secondary drawer/popover for advanced audio, pacing, zoom, and display mode settings.
 */
export const FullscreenFloatingControls: React.FC<FullscreenFloatingControlsProps> = ({
  onExitFullscreen,
  pageInfo,
  chapterInfo,
  autoScrollControls,
  ttsControls,
  children,
  showSubtitles = false,
  onToggleSubtitles,
  forceShowSubtitles = false,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showSecondaryPanel, setShowSecondaryPanel] = useState(false);

  // Subtitle Draggable State
  const [subtitleOffset, setSubtitleOffset] = useState({ x: 0, y: 0 });
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialOffset = useRef({ x: 0, y: 0 });

  const onSubtitlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDraggingSubtitle(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    initialOffset.current = subtitleOffset;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSubtitlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    setSubtitleOffset({
      x: initialOffset.current.x + dx,
      y: initialOffset.current.y + dy,
    });
  };

  const onSubtitlePointerUp = (e: React.PointerEvent) => {
    setIsDraggingSubtitle(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-hide HUD on inactivity
  const resetInactivityTimer = () => {
    setIsVisible(true);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Don't auto-hide if secondary settings panel is open
    if (!showSecondaryPanel) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 3500);
    }
  };

  useEffect(() => {
    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    resetInactivityTimer();

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [showSecondaryPanel]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if inside an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        if (showSecondaryPanel) {
          setShowSecondaryPanel(false);
        } else {
          onExitFullscreen();
        }
      } else if (e.key === 'ArrowLeft') {
        if (pageInfo?.isMangaRtl) {
          pageInfo?.onNext?.();
        } else {
          pageInfo?.onPrev?.();
        }
      } else if (e.key === 'ArrowRight') {
        if (pageInfo?.isMangaRtl) {
          pageInfo?.onPrev?.();
        } else {
          pageInfo?.onNext?.();
        }
      } else if (e.key === ' ' && !e.repeat) {
        // Spacebar: Toggle TTS speech or advance
        if (ttsControls) {
          e.preventDefault();
          ttsControls.onToggle();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageInfo, ttsControls, onExitFullscreen, showSecondaryPanel]);

  // Close secondary panel on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowSecondaryPanel(false);
      }
    };
    if (showSecondaryPanel) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showSecondaryPanel]);

  const isTTSActive = ttsControls?.isActive ?? false;
  const currentSpeakingText = ttsControls?.currentSpeakingText;

  return (
    <div className="fixed inset-0 pointer-events-none z-40 select-none overflow-hidden flex flex-col justify-between">
      {/* Top Subtle Exit & Chapter Bar (Visually quiet) */}
      <div
        className={`w-full px-4 pt-3 pb-2 flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Chapter Title Badge */}
        {chapterInfo?.currentTitle ? (
          <div className="px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 backdrop-blur-md text-xs font-semibold text-slate-300 flex items-center gap-2 shadow-lg min-w-0 max-w-[calc(100vw-5rem)]">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
            <span className="truncate max-w-[180px] sm:max-w-xs">{chapterInfo.currentTitle}</span>
          </div>
        ) : (
          <div />
        )}

        {/* Minimal Top-Right Exit Button */}
        <button
          type="button"
          onClick={onExitFullscreen}
          className="p-2 rounded-full bg-slate-950/85 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Exit Fullscreen (Esc)"
          aria-label="Exit Fullscreen"
        >
          <Minimize2 className="w-4 h-4 text-indigo-400" />
        </button>
      </div>

      {/* Subtitles Overlay (when TTS is active) */}
      {isTTSActive && (showSubtitles || forceShowSubtitles) && currentSpeakingText && (
        <div className="w-full flex justify-center px-4 mb-2 pointer-events-auto">
          <div
            className="max-w-2xl bg-slate-950/90 border border-indigo-500/50 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md text-center animate-in fade-in slide-in-from-bottom-2 cursor-move touch-none select-none"
            style={{
              transform: `translate(${subtitleOffset.x}px, ${subtitleOffset.y}px)`,
              transition: isDraggingSubtitle ? 'none' : 'transform 0.1s ease-out',
            }}
            onPointerDown={onSubtitlePointerDown}
            onPointerMove={onSubtitlePointerMove}
            onPointerUp={onSubtitlePointerUp}
          >
            <p className="text-xs sm:text-sm font-medium text-slate-100 leading-relaxed pointer-events-none">
              {currentSpeakingText}
            </p>
          </div>
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div
        className={`w-full pb-[max(1rem,env(safe-area-inset-bottom))] px-4 flex flex-col items-center gap-3 transition-all duration-300 pointer-events-auto ${
          isVisible || showSecondaryPanel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Secondary Popover Panel (Settings, Zoom, Voice, Speed) */}
        {showSecondaryPanel && (
          <div
            ref={panelRef}
            className="w-[min(380px,calc(100vw-2rem))] bg-slate-900/95 border border-slate-750 rounded-2xl shadow-2xl backdrop-blur-xl p-4 text-xs text-slate-200 flex flex-col gap-3.5 mb-1 animate-in fade-in zoom-in-95 duration-150 max-h-[60vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Presentation Options</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSecondaryPanel(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TTS Voice Selector */}
            {ttsControls && ttsControls.voices.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>TTS Voice:</span>
                  <span className="text-indigo-400 text-[10px]">
                    {ttsControls.selectedVoice?.name.slice(0, 20) || 'Default'}
                  </span>
                </label>
                <select
                  value={ttsControls.selectedVoice?.voiceURI || ttsControls.selectedVoice?.name || ''}
                  onChange={(e) => {
                    const voice = ttsControls.voices.find(
                      (v) => (v.voiceURI || v.name) === e.target.value
                    );
                    if (voice) ttsControls.onVoiceChange(voice);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {ttsControls.voices.map((v) => {
                    const uniqueKey = `${v.voiceURI || v.name}-${v.lang}`;
                    const optValue = v.voiceURI || v.name;
                    return (
                      <option key={uniqueKey} value={optValue} className="bg-slate-900 text-slate-200">
                        {v.name} ({v.lang})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Speech Rate Controls */}
            {ttsControls && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                  <span>Speech Speed:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400">{ttsControls.speechRate.toFixed(2)}x</span>
                  </div>
                </div>
                
                {/* Range Slider for fine-tuning */}
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.05"
                  value={ttsControls.speechRate}
                  onChange={(e) => ttsControls.onSpeechRateChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 mb-1"
                />
              </div>
            )}

            {/* Auto-Advance / Auto-Scroll Option */}
            {autoScrollControls && (
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Auto-Advance Timer
                  </span>
                  <button
                    type="button"
                    onClick={autoScrollControls.onToggle}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                      autoScrollControls.isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {autoScrollControls.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
                {autoScrollControls.isActive && (
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>Interval: {autoScrollControls.pauseSeconds}s</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {autoScrollControls.secondsRemaining}s remaining
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Subtitles Toggle */}
            <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Subtitles className="w-3.5 h-3.5 text-indigo-400" />
                Show Speech Subtitles
              </span>
              <input
                type="checkbox"
                checked={showSubtitles}
                onChange={(e) => onToggleSubtitles?.(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            {/* Custom Tool Children (Zoom, Rotation, OCR boxes) */}
            {children && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                {children}
              </div>
            )}
          </div>
        )}

        {/* PRIMARY FLOATING DOCK (Target layout) */}
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-slate-950/90 border border-slate-750/90 shadow-2xl backdrop-blur-xl pointer-events-auto max-w-[calc(100vw-1.5rem)]">
          {/* Previous Page Button */}
          {pageInfo?.onPrev && (
            <button
              type="button"
              disabled={pageInfo.prevDisabled}
              onClick={pageInfo.onPrev}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Previous Page (Left Arrow)"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden md:inline text-xs font-semibold">Prev</span>
            </button>
          )}

          {/* Page Indicator Pill */}
          {pageInfo && (
            <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 shrink-0">
              <span className="text-slate-400 font-normal">Page</span>
              <span className="text-white font-bold font-mono">
                {pageInfo.current} / {pageInfo.total}
              </span>
            </div>
          )}

          {/* Next Page Button */}
          {pageInfo?.onNext && (
            <button
              type="button"
              disabled={pageInfo.nextDisabled}
              onClick={pageInfo.onNext}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Next Page (Right Arrow)"
              aria-label="Next Page"
            >
              <span className="hidden md:inline text-xs font-semibold">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* TTS Play / Stop Button */}
          {ttsControls && (
            <button
              type="button"
              onClick={ttsControls.onToggle}
              className={`p-2 sm:px-3 sm:py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isTTSActive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
              title={isTTSActive ? 'Stop Speech Narration (Space)' : 'Listen to Chapter Speech (Space)'}
              aria-label={isTTSActive ? 'Stop Speech Narration' : 'Listen to Chapter Speech'}
            >
              {isTTSActive ? (
                <>
                  <Pause className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Pause</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Listen</span>
                </>
              )}
            </button>
          )}

          {/* Settings / Secondary Options Toggle */}
          <button
            type="button"
            onClick={() => setShowSecondaryPanel(!showSecondaryPanel)}
            className={`p-2 rounded-xl transition cursor-pointer border ${
              showSecondaryPanel
                ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/60'
            }`}
            title="Presentation Options (Voice, Speed, Zoom)"
            aria-label="Presentation Options"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Fullscreen Exit Button */}
          <button
            type="button"
            onClick={onExitFullscreen}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition cursor-pointer"
            title="Exit Fullscreen Mode (Esc)"
            aria-label="Exit Fullscreen Mode"
          >
            <Minimize2 className="w-4 h-4 text-indigo-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
