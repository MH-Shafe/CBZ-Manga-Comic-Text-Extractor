import React, { useEffect } from 'react';
import {
  X,
  BookOpen,
  User,
  Paintbrush,
  Calendar,
  Layers,
  ExternalLink,
  Globe,
  Sparkles,
  Info,
} from 'lucide-react';
import { ComicMetadata, ComicChapter } from '../types';

interface SeriesInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata?: ComicMetadata | null;
  pagesCount?: number;
  activeChapterTitle?: string;
  allChapters?: ComicChapter[];
  activeChapterIndex?: number;
  onSelectChapter?: (index: number | string) => void;
}

export const SeriesInfoModal: React.FC<SeriesInfoModalProps> = ({
  isOpen,
  onClose,
  metadata,
  pagesCount = 0,
  activeChapterTitle,
  allChapters = [],
  activeChapterIndex = 0,
  onSelectChapter,
}) => {
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

  const title =
    metadata?.mangaTitle ||
    metadata?.series ||
    metadata?.bookTitle ||
    activeChapterTitle ||
    'Comic Series';

  const chapterNum = metadata?.chapterNumber || metadata?.issueNumber;
  const chapterName = metadata?.chapterTitle || activeChapterTitle || '';
  const author = metadata?.author;
  const artist = metadata?.artist;
  const scanlator = metadata?.scanlator;
  const synopsis = metadata?.synopsis;
  const cover = metadata?.coverThumbnail;
  const genres = metadata?.genres || [];
  const year = metadata?.releaseYear;
  const status = metadata?.status;
  const sourceUrl = metadata?.sourceUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="series-info-modal-title"
    >
      {/* Standard Size: MD ≈ 640px */}
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-[640px] max-h-[92dvh] shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: [Icon + Title + Description] [Close] */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-inner shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="series-info-modal-title" className="text-sm sm:text-base font-bold text-slate-100 truncate">
                Series &amp; Chapter Overview
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Title, author, and storyline synopsis
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Prioritizing Cover, Title, Author, Chapter, Synopsis */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-200 overscroll-contain">
          {/* Top Hero Section */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
            {/* Cover Thumbnail */}
            {cover ? (
              <div className="relative group shrink-0 mx-auto sm:mx-0">
                <img
                  src={cover}
                  alt={title}
                  className="w-24 h-36 sm:w-28 sm:h-40 object-cover rounded-xl shadow-lg border border-slate-700/80 bg-slate-950"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div className="w-24 h-36 sm:w-28 sm:h-40 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center gap-2 text-slate-600 shrink-0 mx-auto sm:mx-0">
                <BookOpen className="w-8 h-8" />
                <span className="text-[10px] font-medium text-slate-500">No Cover</span>
              </div>
            )}

            {/* Title & Core Metadata */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {chapterNum && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
                    Chapter {chapterNum}
                  </span>
                )}
                {status && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                    {status}
                  </span>
                )}
                {pagesCount > 0 && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    {pagesCount} pages
                  </span>
                )}
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-slate-100 leading-snug break-words">
                {title}
              </h3>

              {chapterName && chapterName !== title && (
                <p className="text-xs sm:text-sm text-indigo-300 font-medium truncate">
                  {chapterName}
                </p>
              )}

              {/* Author / Artist */}
              <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap pt-0.5">
                {author && (
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span><strong>Author:</strong> {author}</span>
                  </span>
                )}
                {artist && artist !== author && (
                  <span className="flex items-center gap-1.5">
                    <Paintbrush className="w-3.5 h-3.5 text-violet-400" />
                    <span><strong>Artist:</strong> {artist}</span>
                  </span>
                )}
                {scanlator && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{scanlator}</span>
                  </span>
                )}
                {year && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{year}</span>
                  </span>
                )}
              </div>

              {/* Genre Chips */}
              {genres.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {genres.map((g) => (
                    <span
                      key={g}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/80"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Synopsis Section */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Synopsis</span>
            </h4>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-300 leading-relaxed max-h-44 overflow-y-auto">
              {synopsis ? (
                <p className="whitespace-pre-line">{synopsis}</p>
              ) : (
                <p className="text-slate-500 italic">
                  No synopsis was embedded in this archive.
                </p>
              )}
            </div>
          </div>

          {/* Chapter Navigation if Multi-Chapter Archive */}
          {allChapters.length > 1 ? (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Archive Chapters ({allChapters.length})</span>
                </span>
                <span className="text-indigo-400 text-[11px]">
                  Viewing {activeChapterIndex + 1} of {allChapters.length}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {allChapters.map((ch, idx) => {
                  const isActive = idx === activeChapterIndex;
                  return (
                    <button
                      key={ch.id || idx}
                      type="button"
                      onClick={() => {
                        onSelectChapter?.(idx);
                        onClose();
                      }}
                      className={`p-2 rounded-lg border text-left text-xs transition cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? 'bg-indigo-600 border-indigo-500 text-white font-bold shadow'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="truncate flex-1">{ch.title}</span>
                      <span className="text-[10px] opacity-75 shrink-0">{ch.pages.length}p</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : metadata?.availableChapters && metadata.availableChapters.length > 1 ? (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Available Series Chapters ({metadata.availableChapters.length})</span>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {metadata.availableChapters.map((ch, idx) => {
                  const isActive =
                    ch.url === metadata.currentChapterUrl ||
                    ch.url === metadata.sourceUrl ||
                    ch.number === metadata.chapterNumber;
                  return (
                    <button
                      key={ch.id || ch.url || idx}
                      type="button"
                      onClick={() => {
                        onSelectChapter?.(ch.url || idx);
                        onClose();
                      }}
                      className={`p-2 rounded-lg border text-left text-xs transition cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? 'bg-indigo-600 border-indigo-500 text-white font-bold shadow'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="truncate flex-1">
                        {ch.title || `Chapter ${ch.number || idx + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Source Link */}
          {sourceUrl && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <span>Source Link</span>
              </span>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 underline"
              >
                <span>Open in Browser</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
