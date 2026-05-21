/**
 * AGENT 5 — services/audioCache.ts
 * Local audio caching system for offline support.
 *
 * Download priority:
 * 1. System UI audio (~20 small files) — on first launch
 * 2. Topic name/intro audio (6 files) — on first launch
 * 3. Sign names (60 files) — when topic is first opened
 * 4. Sign explanations + questions — when sign is first viewed
 *
 * Storage: expo-file-system DocumentDirectory/audio/
 * Cache invalidation: URL-based (if URL matches cached URL, use cache)
 */

import * as FileSystem from 'expo-file-system/legacy';

// ─── Config ───────────────────────────────────────────────────────────────────

const AUDIO_CACHE_DIR = (FileSystem.documentDirectory ?? '') + 'audio/';
const MAX_CACHED_FILES = 35;

/** FIFO queue of locally cached file paths — enforces MAX_CACHED_FILES limit */
const _cacheQueue: string[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a remote URL to a safe local filename */
function urlToFilename(url: string): string {
  // Extract last path segment: /audio/sign_stop_name.mp3 → sign_stop_name.mp3
  const segment = url.split('/').pop() ?? 'unknown.mp3';
  // Strip query params
  return segment.split('?')[0];
}

/** Full local path for a cached audio file */
function getCachePath(url: string): string {
  return AUDIO_CACHE_DIR + urlToFilename(url);
}

// ─── Core functions ───────────────────────────────────────────────────────────

/** Ensure the cache directory exists */
async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, { intermediates: true });
  }
}

/**
 * Get the URI to use for an audio file.
 * If cached locally: return local URI.
 * If not cached: return original URL (streams from Supabase).
 * Also queues a background download for future offline use.
 */
export async function getAudioUri(remoteUrl: string): Promise<string> {
  if (!remoteUrl || remoteUrl.startsWith('assets/')) {
    // Local asset path — return as-is
    return remoteUrl;
  }

  try {
    const localPath = getCachePath(remoteUrl);
    const info      = await FileSystem.getInfoAsync(localPath);

    if (info.exists) {
      return localPath; // Cached!
    }

    // Not cached — return remote URL and trigger background download
    downloadInBackground(remoteUrl, localPath);
    return remoteUrl;

  } catch (error) {
    console.warn('[audioCache] Error checking cache:', error);
    return remoteUrl;
  }
}

/** Download audio to cache in background (non-blocking) */
function downloadInBackground(url: string, localPath: string): void {
  ensureCacheDir()
    .then(() => FileSystem.downloadAsync(url, localPath))
    .then(result => {
      if (result.status !== 200) {
        console.warn('[audioCache] Download failed:', url, result.status);
        FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
        return;
      }
      // Track in FIFO queue — evict oldest if over limit
      _cacheQueue.push(localPath);
      if (_cacheQueue.length > MAX_CACHED_FILES) {
        const oldest = _cacheQueue.shift();
        if (oldest) FileSystem.deleteAsync(oldest, { idempotent: true }).catch(() => {});
      }
    })
    .catch(err => {
      console.warn('[audioCache] Background download error:', url, err);
    });
}

/**
 * Prefetch all audio for a question (7 files) in the background.
 * Called while user is answering the current question.
 */
export function prefetchQuestionAudio(question: {
  question_audio_url?: string;
  explanation_correct_audio_url?: string;
  explanation_wrong_audio_url?: string;
  answers: { audio_url?: string }[];
}): void {
  const urls = [
    question.question_audio_url,
    question.explanation_correct_audio_url,
    question.explanation_wrong_audio_url,
    ...question.answers.map(a => a.audio_url),
  ].filter((u): u is string => !!u && !u.startsWith('assets/'));

  urls.forEach(url => {
    const localPath = getCachePath(url);
    FileSystem.getInfoAsync(localPath).then(info => {
      if (!info.exists) downloadInBackground(url, localPath);
    }).catch(() => {});
  });
}

/**
 * Check if all audio for a question is available locally.
 */
export async function isQuestionAudioReady(question: {
  question_audio_url?: string;
  answers: { audio_url?: string }[];
}): Promise<boolean> {
  const urls = [
    question.question_audio_url,
    ...question.answers.map(a => a.audio_url),
  ].filter((u): u is string => !!u && !u.startsWith('assets/'));

  for (const url of urls) {
    const info = await FileSystem.getInfoAsync(getCachePath(url)).catch(() => ({ exists: false }));
    if (!info.exists) return false;
  }
  return true;
}

/**
 * Get local URI for an audio URL if cached, otherwise return remote URL.
 */
export async function getLocalAudioUri(url: string): Promise<string> {
  if (!url || url.startsWith('assets/')) return url;
  try {
    const localPath = getCachePath(url);
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists ? localPath : url;
  } catch {
    return url;
  }
}

/**
 * Pre-download a batch of audio files.
 * Called when a topic is opened to pre-cache its signs.
 */
export async function preCacheAudioBatch(
  urls: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  await ensureCacheDir();

  let completed = 0;
  const total   = urls.length;

  // Download in batches of 5 to avoid overwhelming the network
  const BATCH_SIZE = 5;

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (url) => {
        if (!url || url.startsWith('assets/')) {
          completed++;
          return;
        }

        const localPath = getCachePath(url);
        const info      = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }));

        if (!(info as any).exists) {
          try {
            const result = await FileSystem.downloadAsync(url, localPath);
            if (result.status !== 200) {
              FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
            }
          } catch (err) {
            console.warn('[audioCache] Batch download failed:', url, err);
          }
        }

        completed++;
        onProgress?.(completed, total);
      })
    );
  }
}

/**
 * Pre-cache system UI audio files.
 * Call on first app launch.
 */
export async function preCacheSystemAudio(
  baseUrl: string
): Promise<void> {
  const systemFiles = [
    'welcome_select_mode.mp3',
    'selected_mode_a.mp3',
    'selected_mode_b.mp3',
    'explain_mode_a.mp3',
    'explain_mode_b.mp3',
    'home_welcome_a.mp3',
    'loading.mp3',
    'starting_quiz.mp3',
    'not_heard_tap_number.mp3',
    'exam_passed.mp3',
    'exam_failed.mp3',
    // Number announcements — must always be cached so answer sequence
    // can play fully offline when question/answer audio is pre-cached.
    'number_1.mp3',
    'number_2.mp3',
    'number_3.mp3',
    'number_4.mp3',
  ];

  const urls = systemFiles.map(f => `${baseUrl}/audio/${f}`);
  await preCacheAudioBatch(urls);
}

/**
 * Get total cache size in MB.
 */
export async function getCacheSize(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR) as any;
    if (info.exists && typeof info.size === 'number') {
      return info.size / (1024 * 1024);
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Clear all cached audio files.
 */
export async function clearAudioCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(AUDIO_CACHE_DIR, { idempotent: true });
    await ensureCacheDir();
    _cacheQueue.length = 0;
    console.log('[audioCache] Cache cleared');
  } catch (error) {
    console.warn('[audioCache] Failed to clear cache:', error);
  }
}

/**
 * Check if a specific audio URL is cached.
 */
export async function isAudioCached(url: string): Promise<boolean> {
  if (!url || url.startsWith('assets/')) return true;
  try {
    const localPath = getCachePath(url);
    const info      = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  } catch {
    return false;
  }
}
