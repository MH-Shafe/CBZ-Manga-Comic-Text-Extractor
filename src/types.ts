export type ReadingOrderMode = 'manga-rtl' | 'manhwa-vertical' | 'comic-ltr';

export type TextClassification =
  | 'dialogue'       // Spoken dialogue between characters -> Read by TTS
  | 'narration'      // Story narration, captions, descriptions -> Read by TTS
  | 'thought'        // Internal monologue, thoughts -> Read by TTS
  | 'sfx'            // Sound effects, onomatopoeia, action noise -> Skipped by TTS
  | 'background'     // Environmental signs, posters, background text -> Skipped by TTS
  | 'watermark'      // Website URLs, translator credits -> Skipped by TTS
  | 'uncertain';     // Inconclusive / unverified isolated text -> Skipped conservatively by TTS

export type BlockType =
  | 'dialogue'
  | 'narration'
  | 'thought'
  | 'sfx'
  | 'background'
  | 'title'
  | 'other'
  | 'watermark';

export interface TextBlock {
  id: string;
  readingOrder: number;
  type: BlockType;
  classification?: TextClassification;
  speaker?: string;
  text: string;
  watermarkOrNoiseFiltered?: boolean;
  box_2d?: number[];
  yPercent?: number;
}

export interface PageExtractedData {
  isExtraPage: boolean;
  extraPageReason?: string;
  pageSummary?: string;
  blocks: TextBlock[];
  fullText: string;
}

export interface ComicPage {
  id: string;
  index: number;
  fileName: string;
  imageUrl: string;
  blob: Blob;
  mimeType: string;
  status: 'idle' | 'extracting' | 'completed' | 'error';
  error?: string;
  isExcluded: boolean;
  isExtraPage?: boolean;
  extraPageReason?: string;
  pageSummary?: string;
  blocks?: TextBlock[];
  fullText?: string;
}

export type PacingPreset = 'free-safe' | 'balanced' | 'fast' | 'custom';

export interface ExtractionSettings {
  readingOrder: ReadingOrderMode;
  filterWatermarks: boolean;
  filterSfx: boolean;
  detectExtraPage: boolean;
  customWatermarkKeywords: string;
  concurrency: number;
  batchDelayMs: number;
  pacingPreset: PacingPreset;
  includeSpeakerInTTS?: boolean;
  showSpeechSubtitles?: boolean;
  customApiKey?: string;
}

export interface DailyRequestsInfo {
  used: number;
  limit: number;
  remaining: number;
}

export interface ApiQuotaInfo {
  hasGeminiKey: boolean;
  model: string;
  modelTitle?: string;
  status?: string;
  dailyRequests?: DailyRequestsInfo;
  visionLimits?: {
    maxImageSizeMb: number;
    supportedMimes: string[];
    freeTierRPM: number;
    freeTierRPD: number;
    freeTierTPM: number;
    paidTierRPM: string;
    recommendedFreeDelayMs: number;
    recommendedBalancedDelayMs: number;
    recommendedFastDelayMs: number;
  };
  supportedReadingOrders?: { id: string; label: string }[];
}

export type SummaryScope = 'chapter' | 'page';

export type ExportChapterScope = 'current' | 'extracted' | 'all';

export interface ComicChapter {
  id: string;
  index: number;
  title: string;
  fileName: string;
  pages: ComicPage[];
  metadata?: ComicMetadata | null;
  chapterSummary?: string;
}

export interface ComicMetadata {
  mangaTitle?: string;
  bookTitle?: string;
  chapterNumber?: string;
  chapterTitle?: string;
  combinedTitle: string;
  author?: string;
  artist?: string;
  scanlator?: string;
  combinedAuthor: string;
  series?: string;
  volume?: string;
  issueNumber?: string;
  coverThumbnail?: string;
  synopsis?: string;
  genres?: string[];
  releaseYear?: string;
  status?: string;
  source?: 'comicinfo' | 'filename' | 'ocr' | 'demo' | 'webtoon' | 'web' | 'mangadex' | 'mht';
  sourceUrl?: string;
  sourceEngine?: string;
  availableChapters?: SearchChapterItem[];
  currentChapterUrl?: string;
  seriesUrl?: string;
}

export interface WebComicPageItem {
  index: number;
  originalUrl: string;
  proxyUrl: string;
  fileName: string;
}

export interface WebComicImportResult {
  success: boolean;
  sourceUrl: string;
  seriesTitle: string;
  episodeTitle: string;
  combinedTitle: string;
  author: string;
  artist?: string;
  chapterNumber?: string;
  coverThumbnail?: string;
  synopsis?: string;
  genres?: string[];
  status?: string;
  readingOrder: ReadingOrderMode;
  referer: string;
  pageCount: number;
  pages: WebComicPageItem[];
  engineName?: string;
  availableChapters?: SearchChapterItem[];
}

export interface ExportOptions {
  title: string;
  author: string;
  scanlator?: string;
  format: 'epub' | 'txt' | 'markdown' | 'json';
  includePageImagesInEpub: boolean;
  excludeSpeakerPrefixes: boolean;
  includeSummary: boolean;
  summaryScope: SummaryScope;
  chapterSummary?: string;
  excludeExtraPages: boolean;
  excludeUnextractedPages?: boolean;
  readingOrder?: ReadingOrderMode;
  includeSpeakers?: boolean;
  includePageSummary?: boolean;
  exportChapterScope?: ExportChapterScope;
}

export type SourceStatusType = 'online' | 'updated' | 'protected' | 'active';

export interface SourceHealthPing {
  status: number;
  statusText: string;
  latencyMs: number;
  online: boolean;
  checkedAt: string;
  isCloudflare?: boolean;
  canImport?: boolean;
  importStatusText?: string;
  sampleTitle?: string;
  sampleCoverUrl?: string;
  sampleChapterCount?: number;
  samplePageCount?: number;
  detectedEngine?: string;
  importError?: string;
}

export interface ComicSource {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
  extName: string;
  pkg: string;
  icon?: string;
  version?: string;
  versionCode?: number;
  status?: SourceStatusType;
  lastUpdated?: string;
  nsfw: boolean;
  languages?: string[];
  langCount?: number;
  isPopular?: boolean;
  isCloudflare?: boolean;
  globalRank?: number;
  trafficScore?: string;
  isTopRanked?: boolean;
  health?: SourceHealthPing;
}

export interface ComicSourcesResponse {
  success: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sources: ComicSource[];
  languages: { code: string; name: string; count: number }[];
  topSources: ComicSource[];
  catalogInfo?: {
    repoName: string;
    version: string;
    lastSyncDate: string;
    totalActive: number;
    healthRate: string;
  };
}

export type SupportedSourceEngine =
  | 'all'
  | 'mangadex'
  | 'webtoons'
  | 'asura'
  | 'batoto'
  | 'flame'
  | 'mangakakalot'
  | 'madara'
  | 'mangathemesia'
  | 'manga18'
  | 'comixto'
  | 'generic';

export interface UserSelectedSource {
  id: string;
  name: string;
  baseUrl: string;
  pkg?: string;
  extName?: string;
  lang?: string;
  icon?: string;
  engine?: SupportedSourceEngine;
  enabled: boolean;
  isPinned?: boolean;
  isCloudflare?: boolean;
  globalRank?: number;
  trafficScore?: string;
  isTopRanked?: boolean;
  addedAt?: number;
}

export interface StandardizedSearchRequest {
  query: string;
  sourceId?: string; // 'all', 'mangadex', 'webtoons', 'asura', 'batoto', 'flame', 'mangakakalot', or catalog source ID
  sourceEngine?: SupportedSourceEngine;
  baseUrl?: string;
  sourceName?: string;
  page?: number;
  limit?: number;
  language?: string;
  nsfw?: boolean;
  sort?: 'relevance' | 'rating' | 'latest' | 'views';
  selectedSources?: UserSelectedSource[];
}

export interface SourceSpecificDetails {
  engineName: string;
  sourceType: 'rest_api' | 'html_card' | 'json_ld' | 'cms_theme';
  schemaVersion?: string;
  rating?: string;
  viewCount?: string;
  latestChapterNumber?: string;
  latestChapterTitle?: string;
  releaseDate?: string;
  status?: string;
  contentRating?: string;
  isOfficial?: boolean;
  isCanvas?: boolean;
  seriesId?: string;
  extraBadges?: string[];
  rawSchemaType?: string;
}

export interface SearchChapterItem {
  id: string;
  number: string;
  title: string;
  url: string;
  source: string;
  releaseDate?: string;
  scanlator?: string;
  pagesCount?: number;
}

export interface ComicSearchResult {
  id: string;
  title: string;
  altTitles?: string[];
  source: string;
  sourceIcon?: string;
  sourceUrl: string;
  coverUrl?: string;
  synopsis?: string;
  status?: string;
  authors?: string[];
  genres?: string[];
  latestChapter?: string;
  firstChapterUrl?: string;
  latestChapterUrl?: string;
  chaptersCount?: number;
  chapters?: SearchChapterItem[];
  rating?: string;
  viewCount?: string;
  sourceDetails?: SourceSpecificDetails;
}

export interface TitleSearchResponse {
  success: boolean;
  query: string;
  total: number;
  results: ComicSearchResult[];
}

export interface StandardizedSearchResponse {
  success: boolean;
  query: string;
  source: string;
  sourceEngine?: SupportedSourceEngine;
  total: number;
  page?: number;
  limit?: number;
  results: ComicSearchResult[];
  engineInfo?: {
    name: string;
    sourceType: string;
    latencyMs?: number;
  };
  error?: string;
}
