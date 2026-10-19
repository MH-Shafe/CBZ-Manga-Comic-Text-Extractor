import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  Zap,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  Gauge,
  Sliders,
  RefreshCw,
  Key,
  Clock,
} from 'lucide-react';
import { ApiQuotaInfo, ExtractionSettings } from '../types';
import { useDailyRequests } from '../utils/dailyRequests';

interface ApiQuotaBadgeProps {
  quotaInfo: ApiQuotaInfo | null;
  settings: ExtractionSettings;
  onUpdateSettings?: (newSettings: ExtractionSettings) => void;
  onOpenFullSettings?: () => void;
  onOpenApiKey?: () => void;
}

export const ApiQuotaBadge: React.FC<ApiQuotaBadgeProps> = ({
  quotaInfo,
  settings,
  onOpenFullSettings,
  onOpenApiKey,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dailyRequests = useDailyRequests(quotaInfo?.dailyRequests);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Ping health endpoint to measure live roundtrip latency
  const measureLatency = async () => {
    try {
      setIsPinging(true);
      const start = performance.now();
      const res = await fetch('/api/health');
      const end = performance.now();
      if (res.ok) {
        setLatencyMs(Math.round(end - start));
      }
    } catch {
      setLatencyMs(null);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    if (isOpen && latencyMs === null) {
      measureLatency();
    }
  }, [isOpen]);

  const modelTitle = quotaInfo?.modelTitle || 'Gemini 3.1 Flash Lite';
  const hasKey = quotaInfo?.hasGeminiKey ?? true;
  const isHealthy = hasKey && (quotaInfo?.status === 'healthy' || quotaInfo?.status !== 'error');

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        id="api-quota-badge-button"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 px-2 sm:px-2.5 py-1.5 rounded-lg border border-slate-700/80 hover:border-slate-600 transition shadow-sm"
        title="Check Gemini Vision API connection status & rate limits"
        aria-label="API Connection Status and Quota"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Status Indicator Dot */}
        <span className="relative flex h-2 w-2">
          {isHealthy ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          )}
        </span>

        {/* Model & Quota label */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="hidden sm:inline font-semibold text-slate-200">Vision API:</span>
          <span className="hidden sm:inline text-emerald-400 font-mono text-[11px] truncate max-w-[120px] md:max-w-[160px]">
            {modelTitle}
          </span>
          <span className="sm:hidden text-emerald-400 font-mono text-[10px] font-bold">AI</span>
        </div>

        {/* Daily Requests pill on trigger */}
        <span
          className="hidden md:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono"
          title="Daily Requests (1,500 RPD)"
        >
          <span className="text-emerald-400 font-medium">{dailyRequests.used}</span>
          <span className="text-slate-500">/</span>
          <span>1,500 RPD</span>
        </span>

        {/* Custom Key Tag if Active */}
        {settings.customApiKey ? (
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/80 text-amber-300 font-medium">
            <Key className="w-2.5 h-2.5 text-amber-400" />
            My Key
          </span>
        ) : null}

        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div
          id="api-quota-popover"
          role="region"
          aria-label="API Quota and Diagnostics"
          className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] sm:w-96 max-w-[calc(100vw-1.5rem)] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-4 text-slate-200 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Top Status Bar */}
          <div className="flex items-start justify-between pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Gemini Vision API Status
                </h4>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {isHealthy ? 'Online' : 'Config Warning'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">Model: {quotaInfo?.model || 'gemini-3.1-flash-lite'}</p>
            </div>

            <button
              onClick={measureLatency}
              disabled={isPinging}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-950 px-2 py-1 rounded border border-slate-800 transition"
              title="Ping backend API to check round-trip latency"
            >
              <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{latencyMs !== null ? `${latencyMs}ms` : 'Ping'}</span>
            </button>
          </div>

          {/* Daily Requests (1,500 RPD) Section */}
          <div
            id="daily-requests-quota-section"
            className="my-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                <span>Daily Requests (1,500 RPD)</span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {dailyRequests.used.toLocaleString()} / {dailyRequests.limit.toLocaleString()}
                <span className="font-normal text-slate-400 ml-1">
                  ({dailyRequests.remaining.toLocaleString()} remaining)
                </span>
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  dailyRequests.remaining < 50
                    ? 'bg-rose-500'
                    : dailyRequests.remaining < 250
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{
                  width: `${Math.min(100, (dailyRequests.used / dailyRequests.limit) * 100)}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono text-slate-300">
                {dailyRequests.used.toLocaleString()} / {dailyRequests.limit.toLocaleString()} ({dailyRequests.remaining.toLocaleString()} remaining)
              </span>
              <span className="text-[10px] text-slate-500">Resets daily (00:00 UTC)</span>
            </div>
          </div>

          {/* Model Vision Limits & Quota Grid */}
          <div className="my-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                API Tier &amp; Rate Limits
              </span>
              <span className="text-slate-500">Google Gemini</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Free Tier Quota
                </div>
                <div className="text-sm font-bold text-white mt-1">15 RPM</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  1,500 requests/day<br />1,000,000 tokens/min
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] font-medium text-indigo-400 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Pay-As-You-Go
                </div>
                <div className="text-sm font-bold text-white mt-1">1,000+ RPM</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Unlimited requests/day<br />High-throughput batching
                </div>
              </div>
            </div>
          </div>

          {/* Active Configuration Summary */}
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Key className="w-3 h-3 text-amber-400" />
                Active Key Source:
              </span>
              <span className="font-semibold text-slate-200">
                {settings.customApiKey ? 'Custom Personal Key' : 'Built-in Server Key'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-400" />
                Batch Pacing:
              </span>
              <span className="font-mono text-emerald-400 font-medium">
                {(settings.batchDelayMs / 1000).toFixed(1)}s delay / page
              </span>
            </div>
          </div>

          {/* Separate Actions: Configure API Key & Extraction Settings */}
          <div className="mt-3 space-y-1.5">
            {onOpenApiKey && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenApiKey();
                }}
                className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Configure API Key</span>
              </button>
            )}

            {onOpenFullSettings && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenFullSettings();
                }}
                className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Extraction &amp; OCR Settings</span>
              </button>
            )}
          </div>

          {/* Footer Link */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-end text-[11px]">
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
            >
              <span>AI Studio Usage Dashboard</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
