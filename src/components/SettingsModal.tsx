import React, { useEffect } from 'react';
import {
  X,
  Sliders,
  ArrowRightLeft,
  ShieldAlert,
  FileText,
  Sparkles,
  VolumeX,
  Volume2,
  Clock,
  Gauge,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ExtractionSettings, ReadingOrderMode } from '../types';
import { useDailyRequests } from '../utils/dailyRequests';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ExtractionSettings;
  onUpdateSettings: (newSettings: ExtractionSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const dailyRequests = useDailyRequests();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const readingOrders: { id: ReadingOrderMode; title: string; desc: string; icon: string }[] = [
    {
      id: 'manga-rtl',
      title: 'Japanese Manga (Right-to-Left)',
      desc: 'Panels flow from Top-Right to Top-Left, then downwards.',
      icon: '🇯🇵',
    },
    {
      id: 'manhwa-vertical',
      title: 'Korean Manhwa / Webtoon (Vertical)',
      desc: 'Continuous vertical strip reading order with seamless 0px gap.',
      icon: '🇰🇷',
    },
    {
      id: 'comic-ltr',
      title: 'Western Comic (Left-to-Right)',
      desc: 'Standard Western layout: top-left to top-right row by row.',
      icon: '🇺🇸',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      {/* Standard Size: MD ≈ 640px */}
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[640px] max-h-[92dvh] shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: [Icon + Title + Description] [Close] */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="settings-modal-title" className="font-bold text-slate-100 text-sm sm:text-base truncate">
                Extraction &amp; OCR Settings
              </h2>
              <p className="text-xs text-slate-400 truncate">Configure reading order, watermarks, and TTS</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Grouped into Clear Sections */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-slate-300 overscroll-contain flex-1">
          {/* Section 1: Reading Order */}
          <section aria-labelledby="reading-order-section-title" className="space-y-2.5">
            <h3
              id="reading-order-section-title"
              className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reading Order &amp; Panel Sequencing</span>
            </h3>
            <div className="space-y-2">
              {readingOrders.map((order) => {
                const isSelected = settings.readingOrder === order.id;
                return (
                  <div
                    key={order.id}
                    onClick={() => onUpdateSettings({ ...settings, readingOrder: order.id })}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/40 shadow-inner'
                        : 'border-slate-800 hover:border-slate-700 bg-slate-800/40'
                    }`}
                  >
                    <span className="text-xl select-none mt-0.5">{order.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold text-xs sm:text-sm ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {order.title}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{order.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 2: Watermarks & Noise Filtering */}
          <section aria-labelledby="noise-section-title" className="border-t border-slate-800 pt-5 space-y-3">
            <h3
              id="noise-section-title"
              className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Watermark &amp; Noise Filtering</span>
            </h3>

            <div className="space-y-2.5">
              {/* Filter Watermarks Toggle */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:bg-slate-800/70 transition">
                <input
                  type="checkbox"
                  checked={settings.filterWatermarks}
                  onChange={(e) => onUpdateSettings({ ...settings, filterWatermarks: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                />
                <div>
                  <span className="font-semibold text-slate-200 block text-xs sm:text-sm">
                    Filter Scanlator Watermarks &amp; Website URLs
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Omit domains (.com, .org), discord links, redrawer stamps, and donation requests.
                  </p>
                </div>
              </label>

              {/* Custom Watermark Terms */}
              {settings.filterWatermarks && (
                <div className="pl-6 pt-1 space-y-1">
                  <label htmlFor="custom-keywords-input" className="block text-xs font-medium text-slate-300">
                    Custom Blacklist Keywords (comma-separated):
                  </label>
                  <input
                    id="custom-keywords-input"
                    type="text"
                    value={settings.customWatermarkKeywords}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        customWatermarkKeywords: e.target.value,
                      })
                    }
                    placeholder="e.g. mangadex, asurascans, reaperscans"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Sound Effects Filter */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:bg-slate-800/70 transition">
                <input
                  type="checkbox"
                  checked={settings.filterSfx}
                  onChange={(e) => onUpdateSettings({ ...settings, filterSfx: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200 text-xs sm:text-sm">
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Omit Sound Effects (SFX / Onomatopoeia)</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Excludes background onomatopoeia (*BAM*, *SWOOSH*), keeping pure dialogue and narration.
                  </p>
                </div>
              </label>

              {/* Extra Page Detection */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:bg-slate-800/70 transition">
                <input
                  type="checkbox"
                  checked={settings.detectExtraPage}
                  onChange={(e) => onUpdateSettings({ ...settings, detectExtraPage: e.target.checked })}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200 text-xs sm:text-sm">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Detect Non-Story Extra Pages (Credits, Ads)</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Automatically flags recruitment sheets, advertisements, and blank pages for exclusion.
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* Section 3: Text-to-Speech (TTS) Narration */}
          <section aria-labelledby="tts-section-title" className="border-t border-slate-800 pt-5 space-y-3">
            <h3
              id="tts-section-title"
              className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
            >
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Text-to-Speech (TTS) Narration</span>
            </h3>

            <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.includeSpeakerInTTS ?? false}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, includeSpeakerInTTS: e.target.checked })
                  }
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                />
                <div>
                  <span className="font-semibold text-slate-200 block text-xs sm:text-sm">
                    Speak Character Names Aloud in TTS
                  </span>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {settings.includeSpeakerInTTS
                      ? 'TTS announces character names before each line (e.g. "Hero: What is this place?!"). Ideal for audio-only listening.'
                      : 'TTS reads pure dialogue without reciting character names (e.g. "What is this place?!"). Ideal when watching the comic on screen.'}
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* Section 4: Batch Pacing & Rate Limits */}
          <section aria-labelledby="pacing-section-title" className="border-t border-slate-800 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3
                id="pacing-section-title"
                className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Batch Pacing &amp; API Quotas</span>
              </h3>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                {(settings.batchDelayMs / 1000).toFixed(1)}s delay / page
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    batchDelayMs: 4000,
                    pacingPreset: 'free-safe',
                  })
                }
                className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                  settings.pacingPreset === 'free-safe' || settings.batchDelayMs === 4000
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Free-Safe
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">4.0s delay</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    batchDelayMs: 2000,
                    pacingPreset: 'balanced',
                  })
                }
                className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                  settings.pacingPreset === 'balanced' || settings.batchDelayMs === 2000
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs text-indigo-400">
                  <Gauge className="w-3.5 h-3.5" />
                  Balanced
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">2.0s delay</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    batchDelayMs: 500,
                    pacingPreset: 'fast',
                  })
                }
                className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                  settings.pacingPreset === 'fast' || settings.batchDelayMs === 500
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs text-amber-400">
                  <Zap className="w-3.5 h-3.5" />
                  Turbo
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">0.5s delay</div>
              </button>
            </div>

            {/* Daily Quota Counter */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                  Daily Quota (RPD)
                </span>
                <span className="font-mono text-emerald-400 font-semibold text-[11px]">
                  {dailyRequests.remaining.toLocaleString()} left
                </span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (dailyRequests.used / dailyRequests.limit) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer: [Real-time notice] [Done] */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Saved automatically
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
