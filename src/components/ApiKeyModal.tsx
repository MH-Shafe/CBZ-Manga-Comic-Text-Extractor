import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Key,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Gauge,
} from 'lucide-react';
import { ExtractionSettings } from '../types';
import { useDailyRequests } from '../utils/dailyRequests';
import { cleanErrorMessage } from '../utils/cbzParser';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ExtractionSettings;
  onUpdateSettings: (newSettings: ExtractionSettings) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const dailyRequests = useDailyRequests();
  const [apiKeyInput, setApiKeyInput] = useState<string>(settings.customApiKey || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isVerifyingKey, setIsVerifyingKey] = useState<boolean>(false);
  const [keyVerifyStatus, setKeyVerifyStatus] = useState<{
    valid?: boolean;
    message?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(settings.customApiKey || '');
      setKeyVerifyStatus(null);
      // Auto-focus input on open
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, settings.customApiKey]);

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

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      // Clear key
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cbz_custom_gemini_api_key');
      }
      onUpdateSettings({ ...settings, customApiKey: undefined });
      setKeyVerifyStatus({ valid: true, message: 'Reverted to built-in server Gemini API key.' });
      return;
    }

    setIsVerifyingKey(true);
    setKeyVerifyStatus(null);
    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const resText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch {
        const firstBrace = resText.indexOf('{');
        const lastBrace = resText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            data = JSON.parse(resText.slice(firstBrace, lastBrace + 1));
          } catch {
            data = null;
          }
        }
      }

      if (res.ok && data?.valid) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('cbz_custom_gemini_api_key', trimmed);
        }
        onUpdateSettings({ ...settings, customApiKey: trimmed });
        setKeyVerifyStatus({ valid: true, message: data.message || 'Valid Gemini API key! Successfully saved.' });
      } else {
        const errMsg = cleanErrorMessage(data?.error || resText || 'Failed to verify key with Gemini API.');
        setKeyVerifyStatus({
          valid: false,
          message: errMsg,
        });
      }
    } catch {
      // Offline fallback: save if plausible
      if (trimmed.startsWith('AIzaSy')) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('cbz_custom_gemini_api_key', trimmed);
        }
        onUpdateSettings({ ...settings, customApiKey: trimmed });
        setKeyVerifyStatus({ valid: true, message: 'Key saved. Verification skipped (offline).' });
      } else {
        setKeyVerifyStatus({ valid: false, message: 'Invalid key format (must start with AIzaSy...)' });
      }
    } finally {
      setIsVerifyingKey(false);
    }
  };

  const handleRemoveApiKey = () => {
    setApiKeyInput('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cbz_custom_gemini_api_key');
    }
    onUpdateSettings({ ...settings, customApiKey: undefined });
    setKeyVerifyStatus({ valid: true, message: 'Custom key removed. Using default server key.' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      {/* Standard Size: SM ≈ 420px */}
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[420px] max-h-[92dvh] shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: [Icon + Title + Description] [Close] */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <Key className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="api-key-modal-title" className="font-bold text-slate-100 text-sm sm:text-base truncate">
                Gemini API Key
              </h2>
              <p className="text-xs text-slate-400 truncate">Manage your Vision AI credentials</p>
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

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs text-slate-300 overscroll-contain flex-1">
          {/* Active Status Badge */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-slate-300 font-medium">Active Provider:</span>
            </div>
            <span
              className={`font-semibold px-2 py-0.5 rounded-md border text-[11px] ${
                settings.customApiKey
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {settings.customApiKey ? 'Custom Key' : 'Built-in Server Key'}
            </span>
          </div>

          <p className="text-slate-400 leading-relaxed text-[11px]">
            Extraction uses the built-in server key by default. Add your personal Google AI Studio key to unlock private quotas or higher rate limits.
          </p>

          {/* Form Input Field */}
          <div className="space-y-1.5">
            <label htmlFor="gemini-api-key-input" className="block font-semibold text-slate-200">
              Gemini API Key
            </label>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                id="gemini-api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setKeyVerifyStatus(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveApiKey();
                  }
                }}
                placeholder="AIzaSy..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 pr-9 font-mono transition"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 p-1 text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
                title={showKey ? 'Hide key' : 'Show key'}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Verification Status Message */}
            {keyVerifyStatus && (
              <div
                className={`p-2.5 rounded-xl flex items-start gap-2 animate-in fade-in text-xs ${
                  keyVerifyStatus.valid
                    ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/80'
                    : 'bg-rose-950/50 text-rose-300 border border-rose-800/80'
                }`}
              >
                {keyVerifyStatus.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span className="leading-snug">{keyVerifyStatus.message}</span>
              </div>
            )}
          </div>

          {/* Daily Quota Counter */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                Daily Requests
              </span>
              <span className="font-mono text-emerald-400 font-semibold text-[11px]">
                {dailyRequests.remaining.toLocaleString()} left
              </span>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{
                  width: `${Math.min(100, (dailyRequests.used / dailyRequests.limit) * 100)}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>{dailyRequests.used} / {dailyRequests.limit} used</span>
              <span>Resets 00:00 UTC</span>
            </div>
          </div>

          {/* Link to AI Studio */}
          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <span className="text-slate-400">Need a free key?</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium hover:underline"
            >
              <span>Get key from AI Studio</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Footer: [Reset to Server] [Cancel] [Save & Test] */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2 shrink-0">
          <div>
            {settings.customApiKey && (
              <button
                type="button"
                onClick={handleRemoveApiKey}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                title="Remove custom key and revert to built-in server key"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveApiKey}
              disabled={isVerifyingKey}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isVerifyingKey ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Key</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
