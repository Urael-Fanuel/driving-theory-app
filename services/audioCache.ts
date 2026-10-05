/**
 * AGENT 5 — services/audioCache.ts
 * Local audio caching system for offline support.
 *
 * Storage: expo-file-system DocumentDirectory/audio/
 * Cache invalidation: URL-based (if the file exists locally, use it)
 *
 * ⚠️ CACHE-RETENTION INVARIANT — read before changing anything here.
 *
 * This directory is SHARED by the whole app: system UI audio, sign
 * explanations, sign question/answer audio, and behavioral narrations all
 * live in it side by side. Nothing in a filename says which topic or exam it
 * belongs to. That has three consequences every future change must respect:
 *
 *   1. NEVER delete the directory wholesale to "clean up" after a screen or a
 *      session finishes. Doing so silently destroys audio that belongs to
 *      unrelated topics the user is still studying, and the only symptom is
 *      silence with no internet. (This exact bug shipped once: finishing any
 *      exam wiped every topic's audio plus the number announcements, so
 *      Engine A became unusable offline right after an exam.)
 *      To free space for something that really is finished, pass that
 *      content's own URLs to releaseAudioFiles().
 *
 *   2. Size is bounded by a real budget, not by a file count. MAX_CACHE_BYTES
 *      is enforced against bytes actually on disk, and the tracking index is
 *      PERSISTED — an in-memory-only list resets on every app launch, which
 *      lets the folder grow without limit across sessions.
 *
 *   3. PROTECTED_FILES are never evicted. They are tiny (~0.4 MB total) and
 *      Engine A is unusable without them: the number announcements are how a
 *      non-reading user tells the four answers apart.
 *
 * Eviction is least-recently-used, so the topic the user is actively studying
 * survives and stale content goes first.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { reportError, errorText } from './errorReporter';

// ─── Config ───────────────────────────────────────────────────────────────────

const AUDIO_CACHE_DIR = (FileSystem.documentDirectory ?? '') + 'audio/';
const INDEX_PATH      = (FileSystem.documentDirectory ?? '') + 'audio_cache_index.json';

/**
 * Total on-disk budget for cached audio.
 *
 * The full library is ~351 MB and most users are on low-storage Android
 * phones, so we keep only a working set. 120 MB is chosen so the budget can
 * always hold the topic the user is studying PLUS the next one, even in the
 * worst case (the two largest topics are 62.3 + 55.5 = 117.8 MB). A budget
 * smaller than one topic would make prefetchTopicAudio() pointless — it would
 * evict its own download before the user reached it.
 */
const MAX_CACHE_BYTES = 120 * 1024 * 1024;

/**
 * System UI audio — small, and required for Engine A to function at all.
 * Never evicted, never released.
 */
const PROTECTED_FILES: readonly string[] = [
  // Engine-selection screen (app/index.tsx) — the only way a non-reading user
  // learns what the two engine buttons mean. Without these the very first
  // screen is a dead end, so they matter more than any other audio here.
  'welcome_select_mode.mp3',
  'explain_mode_a.mp3',
  'explain_mode_b.mp3',
  'selected_mode_a.mp3',
  'selected_mode_b.mp3',
  // Engine A home screen.
  'home_welcome_a.mp3',
  // loading.mp3 removed 2026-08-17 — LoadingScreen no longer plays it (see
  // that file's header comment), so pre-caching it here would only spend
  // storage on a file nothing ever uses.
  // Result / quiz-pass feedback. On success the result screen plays
  // crowd_cheer.mp3 and then exam_pass.mp3 ("congratulations, you passed");
  // the topic quizzes play crowd_cheer.mp3 alone. On failure it is
  // exam_failed.mp3 — note the 'ed', which is what the screen actually asks
  // for (the generator produced 'exam_fail.mp3' for months, so that file was
  // missing entirely and failing an exam was silent).
  'crowd_cheer.mp3',
  'exam_pass.mp3',
  'exam_failed.mp3',
  // "Connection problem, press play to retry" messages. These are what a
  // non-reading user hears WHEN audio fails, so they are the last thing that
  // may ever be evicted — losing them turns a recoverable failure into
  // unexplained silence.
  'tts_error_first.mp3',
  'tts_error_retry.mp3',
  // Spoken version of the OfflineBanner sentence, for users who cannot read.
  // Same reasoning: an offline notice that is itself unavailable offline is
  // worse than useless.
  'offline_notice.mp3',
  // Number announcements — how a non-reading user identifies each answer.
  'number_1.mp3',
  'number_2.mp3',
  'number_3.mp3',
  'number_4.mp3',
];

const PROTECTED_SET = new Set(PROTECTED_FILES);

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

/** Ensure the cache directory exists */
async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, { intermediates: true });
  }
}

// ─── Persistent cache index ───────────────────────────────────────────────────
// Tracks size + last-access time per cached file so eviction can be
// least-recently-used and the byte budget can survive app restarts.

interface CacheEntry {
  bytes:      number;
  lastAccess: number;
}

/** filename → entry. Authoritative once _indexLoaded is true. */
let _index: Map<string, CacheEntry> = new Map();
let _indexLoaded = false;
let _loadPromise: Promise<void> | null = null;

/** Serializes index writes so concurrent background downloads can't lose entries. */
let _writeLock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = _writeLock.then(fn, fn);
  _writeLock = run.catch(() => {});
  return run;
}

/** Debounced flush — playback touches the index constantly; disk writes must not. */
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void flushIndex();
  }, 2000);
}

async function flushIndex(): Promise<void> {
  await withLock(async () => {
    try {
      const plain: Record<string, CacheEntry> = {};
      for (const [file, entry] of _index) plain[file] = entry;
      await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(plain));
    } catch (err) {
      console.warn('[audioCache] Failed to write index:', err);
    }
  });
}

/**
 * Rebuild index entries for files that exist on disk but aren't tracked.
 * Needed after an app update (previous versions kept no persistent index) and
 * as a self-heal if the index file is ever lost — without this, untracked
 * files would never be counted or evicted and the budget would not hold.
 */
async function reconcileIndex(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR);
    if (!info.exists) return;

    const files = await FileSystem.readDirectoryAsync(AUDIO_CACHE_DIR);
    const now   = Date.now();
    let changed = false;

    // Drop index entries whose file is gone.
    for (const file of Array.from(_index.keys())) {
      if (!files.includes(file)) { _index.delete(file); changed = true; }
    }

    // Add entries for files present on disk but missing from the index.
    for (const file of files) {
      // Leftover temp files from an interrupted TTS write — not cache content.
      if (file.endsWith('.part')) {
        // A download that is running right now owns a .part file; only sweep
        // ones that have not been touched for a while (killed mid-download).
        const pi: any = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR + file).catch(() => null);
        const ageMs = pi?.exists && typeof pi.modificationTime === 'number'
          ? Date.now() - pi.modificationTime * 1000
          : Infinity;
        if (ageMs > STALE_PART_MS) {
          FileSystem.deleteAsync(AUDIO_CACHE_DIR + file, { idempotent: true }).catch(() => {});
        }
        continue;
      }
      if (_index.has(file)) continue;
      const fi = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR + file).catch(() => null);
      const bytes = fi && (fi as any).exists ? ((fi as any).size ?? 0) : 0;
      // Unknown last-access: treat as old so genuinely-used files outlive it.
      _index.set(file, { bytes, lastAccess: now - 7 * 24 * 60 * 60 * 1000 });
      changed = true;
    }

    if (changed) scheduleFlush();
  } catch (err) {
    console.warn('[audioCache] reconcileIndex failed:', err);
  }
}

async function loadIndex(): Promise<void> {
  if (_indexLoaded) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      const info = await FileSystem.getInfoAsync(INDEX_PATH);
      if (info.exists) {
        const raw   = await FileSystem.readAsStringAsync(INDEX_PATH);
        const plain = JSON.parse(raw) as Record<string, CacheEntry>;
        _index = new Map(Object.entries(plain));
      }
    } catch {
      _index = new Map();
    }
    await reconcileIndex();
    // Set only AFTER reconcile: callers that arrive mid-load must await the
    // shared _loadPromise, otherwise a download finishing during reconcile
    // could record an entry that reconcile's stale directory listing then drops.
    _indexLoaded = true;
  })();

  return _loadPromise;
}

/** Mark a file as just used — keeps the active topic from being evicted. */
function touch(filename: string): void {
  const entry = _index.get(filename);
  if (!entry) return;
  entry.lastAccess = Date.now();
  scheduleFlush();
}

/** Record a newly downloaded file, then bring the cache back under budget. */
async function record(filename: string, bytes: number): Promise<void> {
  await loadIndex();
  _index.set(filename, { bytes, lastAccess: Date.now() });
  scheduleFlush();
  await enforceBudget();
}

/** Current tracked cache size in bytes. */
function trackedBytes(): number {
  let total = 0;
  for (const entry of _index.values()) total += entry.bytes;
  return total;
}

/**
 * Evict least-recently-used files until the cache is under MAX_CACHE_BYTES.
 * Protected system audio is never considered.
 */
async function enforceBudget(): Promise<void> {
  let total = trackedBytes();
  if (total <= MAX_CACHE_BYTES) return;

  const candidates = Array.from(_index.entries())
    .filter(([file]) => !PROTECTED_SET.has(file))
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess); // oldest first

  for (const [file, entry] of candidates) {
    if (total <= MAX_CACHE_BYTES) break;
    try {
      await FileSystem.deleteAsync(AUDIO_CACHE_DIR + file, { idempotent: true });
    } catch {
      // Deletion failed — drop it from the index anyway so we stop counting it.
    }
    _index.delete(file);
    total -= entry.bytes;
  }

  scheduleFlush();
}

// ─── Core functions ───────────────────────────────────────────────────────────

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
    const filename  = urlToFilename(remoteUrl);
    const localPath = AUDIO_CACHE_DIR + filename;

    if (await hasUsableCopy(localPath)) {
      void loadIndex().then(() => touch(filename));
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

// ─── Downloads ────────────────────────────────────────────────────────────────
//
// INVARIANT: a file at its final name in the cache folder is COMPLETE.
//
// Why this matters (found 2026-10-01, confirmed by an independent review): the
// native download used to write straight to the final name while bytes arrived.
// A connection that dropped part-way, or an app killed mid-download, left a
// truncated file that every later check ("does it exist?") accepted as a good
// copy: silence, or a clip that stops half-way, on every play, forever (it only
// went away with "Clear data"). Now every download goes to a private temporary
// name, is checked, and only then renamed into place in one step. A crash at any
// moment leaves at worst a stray .part file, never a bad real one.
//
// All network-to-cache writes go through downloadAtomic(); do not add another
// writer. It also guarantees one download per file at a time.

/** Smallest real clip in the app is ~6 KB; anything under this is not audio. */
const MIN_VALID_BYTES     = 1024;
/** Per-file limit; the native download is cancelled (really stopped) when it passes. */
const DOWNLOAD_TIMEOUT_MS = 90_000;
/** A .part file older than this belongs to a download that no longer exists. */
const STALE_PART_MS       = 10 * 60 * 1000;

interface DownloadOutcome { ok: boolean; bytes: number }

/** One download per final path at a time; later callers share its result. */
const _inFlight = new Map<string, Promise<DownloadOutcome>>();

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

/**
 * True when there is a file at localPath that can be trusted as a cached clip.
 * A file that exists but is empty or tiny is a leftover of a failed download
 * (older app versions could create them): it is removed so it gets fetched again.
 */
async function hasUsableCopy(localPath: string): Promise<boolean> {
  const info: any = await FileSystem.getInfoAsync(localPath);
  if (!info.exists) return false;
  if ((info.size ?? 0) >= MIN_VALID_BYTES) return true;
  await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
  _index.delete(urlToFilename(localPath));
  return false;
}

function downloadAtomic(url: string, where: string): Promise<DownloadOutcome> {
  const filename  = urlToFilename(url);
  const finalPath = AUDIO_CACHE_DIR + filename;

  const running = _inFlight.get(finalPath);
  if (running) return running;

  const job = (async (): Promise<DownloadOutcome> => {
    const tmpPath = finalPath + '.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.part';

    const fail = async (reason: string, extra?: Record<string, unknown>): Promise<DownloadOutcome> => {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
      // Offline is expected; everything else is worth knowing about.
      reportError('download', where, reason, { file: filename, ...extra }, { skipIfOffline: true });
      return { ok: false, bytes: 0 };
    };

    let task: FileSystem.DownloadResumable | null = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      task?.cancelAsync().catch(() => {});
    }, DOWNLOAD_TIMEOUT_MS);

    try {
      await ensureCacheDir();

      // The "resumable" download is used on purpose: unlike the plain one, its
      // promise ALWAYS settles (result, error, or undefined when cancelled), so
      // a dropped connection cannot leave a caller waiting forever.
      task = FileSystem.createDownloadResumable(url, tmpPath);
      const result = await task.downloadAsync();

      if (!result) {
        return await fail(timedOut ? 'download timed out after ' + (DOWNLOAD_TIMEOUT_MS / 1000) + 's' : 'download cancelled');
      }
      if (result.status !== 200) {
        return await fail('HTTP ' + result.status, { status: result.status });
      }

      const info: any = await FileSystem.getInfoAsync(tmpPath);
      const bytes = info.exists ? (info.size ?? 0) : 0;
      if (bytes < MIN_VALID_BYTES) {
        return await fail('downloaded file too small (' + bytes + ' bytes)', { bytes });
      }

      // The server states how long the file is; a shorter file was cut off.
      const declared = Number(headerValue(result.headers, 'content-length'));
      if (Number.isFinite(declared) && declared > 0 && declared !== bytes) {
        return await fail('downloaded size differs from the size the server declared', { bytes, declared });
      }

      // Complete. Only now does it get its real name (a rename: one step).
      await FileSystem.moveAsync({ from: tmpPath, to: finalPath });
      return { ok: true, bytes };
    } catch (err) {
      return await fail(errorText(err));
    } finally {
      clearTimeout(timer);
    }
  })();

  _inFlight.set(finalPath, job);
  void job.then(() => { if (_inFlight.get(finalPath) === job) _inFlight.delete(finalPath); });
  return job;
}

/** Download audio to cache in background (non-blocking) */
function downloadInBackground(url: string, _localPath: string): void {
  downloadAtomic(url, 'downloadInBackground')
    .then(async ({ ok, bytes }) => {
      if (ok) await record(urlToFilename(url), bytes);
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
  const urls = collectQuestionUrls(question);

  urls.forEach(url => {
    const localPath = getCachePath(url);
    FileSystem.getInfoAsync(localPath).then(info => {
      if (!info.exists) downloadInBackground(url, localPath);
    }).catch(() => {});
  });
}

/** Base URL for audio stored in Supabase Storage. */
const STORAGE_AUDIO_BASE =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/audio';

/**
 * All cacheable audio URLs belonging to one question.
 *
 * ⚠️ This MUST stay in step with how the playback screens build their URLs.
 * They use `question.question_audio_url || <constructed fallback>` and
 * `answer.audio_url || <constructed fallback>`. If this function only collected
 * the stored fields, then every question whose stored URL happens to be empty
 * would be requested from a URL that was never prefetched — cached in theory,
 * silent in practice. So we queue BOTH forms; the constructed one is skipped
 * cheaply if it turns out not to exist on the server.
 */
function collectQuestionUrls(question: {
  id?: string;
  question_audio_url?: string;
  explanation_correct_audio_url?: string;
  explanation_wrong_audio_url?: string;
  answers?: { id?: string; audio_url?: string }[];
}): string[] {
  const urls: (string | undefined)[] = [
    question.question_audio_url,
    question.explanation_correct_audio_url,
    question.explanation_wrong_audio_url,
    ...(question.answers ?? []).map(a => a.audio_url),
  ];

  // Mirror the screens' fallbacks, but only where the stored URL is missing.
  if (question.id && STORAGE_AUDIO_BASE) {
    if (!question.question_audio_url) {
      urls.push(`${STORAGE_AUDIO_BASE}/${question.id.toLowerCase()}.mp3`);
    }
    for (const answer of question.answers ?? []) {
      if (!answer.audio_url && answer.id) {
        urls.push(`${STORAGE_AUDIO_BASE}/answer_${question.id}_${answer.id}.mp3`);
      }
    }
  }

  return urls.filter((u): u is string => !!u && !u.startsWith('assets/'));
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
 * This is the hot path — called before every playback — so it only touches
 * the in-memory index and lets the debounced flush handle disk.
 */
export async function getLocalAudioUri(url: string): Promise<string> {
  if (!url || url.startsWith('assets/')) return url;
  try {
    const filename  = urlToFilename(url);
    const localPath = AUDIO_CACHE_DIR + filename;

    if (!(await hasUsableCopy(localPath))) {
      // Not cached: stream it now, and save a copy for next time.
      //
      // This is the safety net for the whole cache. Playback used to have NO
      // caching side effect at all, so any file a prefetch list happened to
      // miss — the number announcements were missed for exactly this reason —
      // stayed uncached forever, no matter how many times the user heard it.
      // Now anything actually played becomes available offline afterwards,
      // even if no prefetch path knows about it.
      downloadInBackground(url, localPath);
      return url;
    }

    void loadIndex().then(() => touch(filename));
    return localPath;
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
  await loadIndex();

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

        const filename  = urlToFilename(url);
        const localPath = AUDIO_CACHE_DIR + filename;
        const usable    = await hasUsableCopy(localPath).catch(() => false);

        if (usable) {
          touch(filename);
        } else {
          const { ok, bytes } = await downloadAtomic(url, 'preCacheAudioBatch');
          // Track without enforcing per file: one sweep after the batch.
          if (ok) _index.set(filename, { bytes, lastAccess: Date.now() });
        }

        completed++;
        onProgress?.(completed, total);
      })
    );
  }

  scheduleFlush();
  await enforceBudget();
}

/** Minimal shape needed to prefetch a question's audio. */
interface PrefetchableQuestion {
  sign_id?: string;
  question_audio_url?: string;
  explanation_correct_audio_url?: string;
  explanation_wrong_audio_url?: string;
  answers?: { audio_url?: string }[];
}

/**
 * Audio for ONE sign: its explanation plus all of its questions and answers.
 * About 22 files / ~1.2 MB, so it lands in a few seconds even on a slow
 * connection.
 *
 * Call this for the sign the user is looking at RIGHT NOW. The topic-wide
 * prefetch below takes minutes to finish; this covers the gap so a user who
 * opens a sign and loses reception seconds later is still fine.
 *
 * Fire-and-forget.
 */
export async function prefetchSignAudio(
  sign: { audio_explanation_url?: string } | null | undefined,
  questions: PrefetchableQuestion[],
): Promise<void> {
  const urls = [
    sign?.audio_explanation_url,
    ...questions.flatMap(collectQuestionUrls),
  ].filter((u): u is string => !!u && !u.startsWith('assets/'));

  if (!urls.length) return;
  await preCacheAudioBatch(urls);
}

/**
 * Download, in the background, all audio for a topic the user has just opened.
 *
 * This is what makes a mid-lesson disconnection unnoticeable: by the time the
 * user reaches sign 5, its audio is already on disk, so losing reception does
 * not interrupt anything.
 *
 * Note this is REACTIVE, not speculative — it downloads the topic the user
 * actually entered, not a guess about which topics they might open next. That
 * keeps both the download size and the data cost bounded to one topic
 * (11-62 MB depending on the topic), and the order the user studies in does not
 * matter.
 *
 * ⚠️ ORDER MATTERS AND IS NOT ARBITRARY. URLs are emitted sign by sign, in the
 * order the signs are displayed: sign 1's explanation, then sign 1's questions
 * and answers, then sign 2, and so on. A whole topic is 11-62 MB and takes
 * MINUTES; one sign is ~1.2 MB and takes SECONDS. Grouping by sign means the
 * content the user reaches first is complete almost immediately, instead of
 * being stuck at the back of the queue. An earlier version listed every sign
 * explanation first and every question afterwards, which meant the first sign's
 * questions were among the LAST things downloaded — the exact opposite of what
 * the user needs.
 *
 * Fire-and-forget: never await this from a screen, it can take minutes.
 */
export async function prefetchTopicAudio(
  signs: Array<{ id?: string; audio_explanation_url?: string }>,
  questions: PrefetchableQuestion[],
): Promise<void> {
  const bySign = new Map<string, PrefetchableQuestion[]>();
  for (const q of questions) {
    const key = q.sign_id ?? '';
    const list = bySign.get(key);
    if (list) list.push(q);
    else bySign.set(key, [q]);
  }

  const urls: string[] = [];
  const seenSignKeys = new Set<string>();

  for (const sign of signs) {
    const key = sign.id ?? '';
    seenSignKeys.add(key);
    if (sign.audio_explanation_url) urls.push(sign.audio_explanation_url);
    for (const q of bySign.get(key) ?? []) urls.push(...collectQuestionUrls(q));
  }

  // Questions whose sign is not in the list (e.g. behavioral questions, which
  // have no sign_id) still get queued, just last.
  for (const [key, list] of bySign) {
    if (seenSignKeys.has(key)) continue;
    for (const q of list) urls.push(...collectQuestionUrls(q));
  }

  const filtered = urls.filter(u => !!u && !u.startsWith('assets/'));
  if (!filtered.length) return;
  await preCacheAudioBatch(filtered);
}

/**
 * Pre-cache system UI audio files.
 * Call on first app launch.
 */
export async function preCacheSystemAudio(
  baseUrl: string
): Promise<void> {
  const urls = PROTECTED_FILES.map(f => `${baseUrl}/audio/${f}`);
  await preCacheAudioBatch(urls);
}

// ─── TTS cache ────────────────────────────────────────────────────────────────
// Behavioral questions and answers have NO pre-recorded audio files: they are
// spoken by live Google TTS through a Supabase Edge Function. That made every
// behavioral question silent without a connection, and no amount of file
// caching could fix it because there was no file to cache.
//
// So we cache the TTS result itself, keyed by the exact text. First read needs
// a connection; every read after that plays from disk and works offline.
//
// These files live in the SAME directory and the SAME index as everything else
// on purpose — one budget, one eviction policy. A separate folder would be a
// second unbounded cache, which is the bug this file exists to prevent.

/**
 * Stable filename for a piece of TTS text.
 * Two independent 32-bit hashes plus the length: enough to make a collision
 * between the app's few hundred strings effectively impossible, with no
 * dependency on a crypto library.
 */
function ttsFilename(text: string): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = ((fnv ^ c) * 0x01000193) >>> 0;
    djb = ((djb * 33) ^ c) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `tts_${text.length}_${hex(fnv)}${hex(djb)}.mp3`;
}

/**
 * Local URI for previously cached TTS of this text, or null if not cached.
 * Marks it as recently used so active content survives eviction.
 */
export async function getCachedTtsUri(text: string): Promise<string | null> {
  if (!text) return null;
  try {
    const filename  = ttsFilename(text);
    const localPath = AUDIO_CACHE_DIR + filename;
    const info      = await FileSystem.getInfoAsync(localPath);
    if (!info.exists) return null;
    void loadIndex().then(() => touch(filename));
    return localPath;
  } catch {
    return null;
  }
}

/**
 * Persist a TTS result (base64 mp3, exactly what the Edge Function returns)
 * so the same text can be spoken offline next time.
 * Failures are non-fatal: the caller has already played the audio.
 */
export async function storeTtsAudio(text: string, base64: string): Promise<void> {
  if (!text || !base64) return;
  try {
    await ensureCacheDir();
    const filename  = ttsFilename(text);
    const localPath = AUDIO_CACHE_DIR + filename;

    const existing = await FileSystem.getInfoAsync(localPath).catch(() => null);
    if (existing && (existing as any).exists) {
      await loadIndex();
      touch(filename);
      return;
    }

    // Write to a temp path and move into place. A file at the real path is
    // therefore always complete — an interrupted write can never leave a
    // truncated file that later looks like a valid cache hit and plays as
    // silence or an error.
    const tmpPath = localPath + '.part';
    await FileSystem.writeAsStringAsync(tmpPath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    try {
      await FileSystem.moveAsync({ from: tmpPath, to: localPath });
    } catch (err) {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
      throw err;
    }

    const fi    = await FileSystem.getInfoAsync(localPath).catch(() => null);
    const bytes = fi && (fi as any).exists ? ((fi as any).size ?? 0) : 0;
    await record(filename, bytes);
  } catch (err) {
    console.warn('[audioCache] Failed to store TTS audio:', err);
  }
}

/**
 * Release the cached audio for content the user has FINISHED — a completed
 * topic, or a finished exam. This is the correct way to free space: it takes
 * the specific URLs that are done with, so audio belonging to whatever else
 * the user is still studying is left untouched.
 *
 * Protected system audio is ignored even if passed in.
 */
export async function releaseAudioFiles(urls: string[]): Promise<void> {
  if (!urls.length) return;
  await loadIndex();

  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || url.startsWith('assets/')) continue;
    const filename = urlToFilename(url);
    if (PROTECTED_SET.has(filename) || seen.has(filename)) continue;
    seen.add(filename);

    try {
      await FileSystem.deleteAsync(AUDIO_CACHE_DIR + filename, { idempotent: true });
    } catch {
      // Already gone — fall through and untrack it.
    }
    _index.delete(filename);
  }

  scheduleFlush();
}

/**
 * Throw away the saved copy of ONE clip because it could not be played, so the
 * next play fetches a fresh one (getLocalAudioUri re-saves anything it has to
 * stream). Unlike releaseAudioFiles() this also works for PROTECTED system
 * audio: protection means "never evict to make room", not "keep even if broken".
 */
export async function discardCachedCopy(url: string): Promise<void> {
  if (!url || url.startsWith('assets/')) return;
  const filename = urlToFilename(url);
  try { await FileSystem.deleteAsync(AUDIO_CACHE_DIR + filename, { idempotent: true }); } catch {}
  await loadIndex().catch(() => {});
  _index.delete(filename);
  scheduleFlush();
}

/**
 * Release the cached audio for a set of questions (a finished exam or quiz).
 * Convenience wrapper over releaseAudioFiles().
 */
export async function releaseQuestionAudio(
  questions: Array<{
    question_audio_url?: string;
    explanation_correct_audio_url?: string;
    explanation_wrong_audio_url?: string;
    answers?: { audio_url?: string }[];
  }>
): Promise<void> {
  const urls = questions.flatMap(collectQuestionUrls);
  await releaseAudioFiles(urls);
}

/**
 * Diagnostic only — changes nothing in the cache.
 *
 * Reports cached files too small to be real audio. The smallest genuine clip
 * in the app is number_1.mp3 at ~6.5 KB, so anything under 1 KB is a broken
 * leftover (an empty file from a download that died right after it began, or
 * an error page saved under an .mp3 name). Such a file is treated as a valid
 * cache hit and plays as silence, so counting them on each launch shows
 * whether that is happening on real phones.
 */
const SUSPICIOUS_BYTES = 1024;

export async function reportCacheHealth(): Promise<void> {
  try {
    await loadIndex();
    const suspicious: string[] = [];
    for (const [file, entry] of _index) {
      if (entry.bytes < SUSPICIOUS_BYTES) suspicious.push(`${file}:${entry.bytes}`);
    }
    if (!suspicious.length) return;
    reportError('cache', 'reportCacheHealth',
      `${suspicious.length} cached audio file(s) under ${SUSPICIOUS_BYTES} bytes`,
      {
        files:       suspicious.slice(0, 15),
        total_files: _index.size,
        tracked_mb:  Math.round(trackedBytes() / (1024 * 1024)),
      });
  } catch {}
}

/**
 * Get total cache size in MB (from the tracked index).
 */
export async function getCacheSize(): Promise<number> {
  await loadIndex();
  return trackedBytes() / (1024 * 1024);
}

/**
 * Clear ALL cached audio, including protected system files.
 *
 * ⚠️ This is a full reset — it destroys offline availability for every topic
 * in the app. It exists for an explicit user-facing "clear storage" action
 * only. Do NOT call it as cleanup when a screen, quiz, or exam finishes; use
 * releaseAudioFiles() / releaseQuestionAudio() for that. See the
 * CACHE-RETENTION INVARIANT at the top of this file.
 */
export async function clearAudioCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(AUDIO_CACHE_DIR, { idempotent: true });
    await ensureCacheDir();
    _index.clear();
    _indexLoaded = true;
    await flushIndex();
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
