/**
 * services/errorReporter.ts
 * Best-effort diagnostics: records real failures that happen on users' phones
 * (audio that did not play, downloads that broke, server calls that failed,
 * JS crashes) in the client_errors table, so they can be found with a plain
 * query instead of waiting for a user to describe them.
 *
 * Why this exists (2026-10-01): users reported audio going silent after the
 * first session, on some phones only. Investigating it showed the app had NO
 * record of any audio failure at all — every playback error was swallowed by
 * a console.warn that only the phone itself ever saw — and the one existing
 * log (API fallbacks) stored "[object Object]" instead of the message.
 *
 * RULES — read before adding a call site:
 *   1. Diagnostic only. reportError() never throws, never blocks, and must
 *      never change what the caller does next. Call it, then carry on exactly
 *      as before.
 *   2. No personal data: no text the user said or typed, no location, no audio
 *      content. Every text field passes through sanitizeText(): URLs are cut to
 *      their host, data: URIs, tokens, e-mail addresses and long keys are
 *      replaced, whatever the caller passed.
 *   3. Throttled per app launch (MAX_PER_KEY / MAX_PER_SESSION / MAX_KEYS), so a
 *      failing loop — e.g. a whole topic's downloads failing — cannot flood the
 *      table or grow memory.
 *   4. Expected offline failures are not reported (skipIfOffline): a download
 *      that fails with no connection is normal, not a bug. They do not use up
 *      the throttle budget either.
 *   5. A row never exceeds what the table accepts. The table caps details at
 *      8000 BYTES of jsonb text; Amharic is 3 bytes per character, so the limit
 *      is measured in bytes (fitDetails), never in string length.
 *   6. The crash path is never delayed. See installGlobalErrorReporting().
 *
 * Rows that cannot be sent right away (no connection, server trouble) are kept
 * ON DISK, ONE FILE PER ROW, and sent on a later launch. One file per row means
 * there is no shared queue file to corrupt and no lock to hold while the
 * network is slow: a torn write loses that one row, never the others. Each row
 * carries a client-generated id, so a row that was both sent and queued is
 * stored once.
 */

import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import * as Application from 'expo-application';
import type { Sound, PlaybackStatus } from './sound';
import { supabase } from '../backend/supabaseClient';

// ─── Types / config ───────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'audio'          // a clip failed to load or play
  | 'audio_stuck'    // a clip "loaded" and the UI shows playing, but no sound is coming out
  | 'audio_slow'     // a clip is still waiting for data long after it was requested
  | 'download'       // an audio file failed to download into the offline cache
  | 'download_hung'  // a download never finished (leaves a partial file behind)
  | 'cache'          // broken files found in the offline audio cache at launch
  | 'tts'            // live text-to-speech (behavioral narration) failed
  | 'stt'            // voice answer recognition failed
  | 'recording'      // microphone recording failed
  | 'api'            // a data call failed while online (falls back to bundled data)
  | 'js_error'       // non-fatal uncaught JS error
  | 'js_fatal'       // uncaught JS error that crashes the app
  | 'promise';       // unhandled promise rejection

interface ReportOptions {
  /** A local file:// URI involved in the failure — its size is recorded. */
  localUri?: string | null;
  /** Do not report when the phone is offline (expected failure). */
  skipIfOffline?: boolean;
}

interface Row {
  id:            string;
  function_name: string;
  error_message: string;
  category:      string;
  details:       Record<string, unknown>;
  app_version:   string;
  platform:      string;
  device:        string;
  user_id:       string | null;
}

const MAX_PER_KEY     = 3;      // same failure, same place: first 3 per launch
const MAX_PER_SESSION = 60;     // everything together, per launch
const MAX_KEYS        = 200;    // distinct failure kinds remembered per launch (memory bound)
const MAX_QUEUE       = 30;     // rows kept on disk while they cannot be sent
const MAX_AGE_MS      = 14 * 24 * 60 * 60 * 1000;  // a queued row older than this is dropped
const SEND_TIMEOUT_MS = 10_000; // one insert may take at most this long
const DETAILS_BUDGET  = 7_000;  // bytes of details; the table guard is 8000 (see fitDetails)

const _docs      = FileSystem.documentDirectory ?? '';
const QUEUE_DIR  = _docs + 'diagnostics/';
const FATAL_PATH = _docs + 'diag_fatal.json';
const OLD_QUEUE  = _docs + 'diagnostics_queue.json';   // single-file queue of earlier test builds

const _startedAt    = Date.now();
const _sessionId    = uuid();
const _keyCounts    = new Map<string, number>();
let   _sessionCount = 0;

// ─── Small helpers ────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Cut to `max` characters, never splitting a surrogate pair in half. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max;
  const c = s.charCodeAt(end - 1);
  if (c >= 0xD800 && c <= 0xDBFF) end--;
  return s.slice(0, end) + '…';
}

/** Resolves with `fallback` instead of waiting longer than `ms` (or on error). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/** UTF-8 size of a string (JS strings are UTF-16). */
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80)       n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }   // surrogate pair = one 4-byte character
    else                n += 3;
  }
  return n;
}

/**
 * Size the table will measure for `details`: octet_length(details::text).
 * Amharic characters are 3 bytes each, and jsonb::text writes a space after
 * every ':' and ',' — both are counted (the spaces conservatively, including
 * ones inside strings). A 3000-character Amharic message is ~9 KB: measuring
 * string length instead of bytes let rows through that the table then refused.
 */
function jsonbBytes(obj: unknown): number {
  const json = JSON.stringify(obj);
  let spaces = 0;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (c === 58 || c === 44) spaces++;
  }
  return utf8Bytes(json) + spaces;
}

/**
 * Removes what must never be stored from ANY text that goes into a row. Order
 * matters: a data: URI is taken whole before URL handling, and URLs are cut to
 * their host before anything else could match inside them.
 */
const REDACTIONS: Array<[RegExp, string]> = [
  [/data:[^\s,'")]*,[^\s'")]*/gi,                                             'data:<redacted>'],
  [/https?:\/\/([^\s/'")?#]+)[^\s'")]*/gi,                                    'url:$1'],
  [/file:\/\/[^\s'")]*\/([^\s/'")]*)/gi,                                      'file:<…>/$1'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,                                          'Bearer <redacted>'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g,           '<jwt>'],
  [/(?:sb_(?:publishable|secret)_|AIza)[A-Za-z0-9_-]{10,}/g,                  '<key>'],
  [/([?&;](?:apikey|api_key|key|token|access_token|refresh_token|auth|authorization|signature|sig)=)[^&\s'")]+/gi, '$1<redacted>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,                         '<email>'],
  // Long letters+digits-only runs (hex / base64 tokens). Underscores and dots
  // are excluded on purpose so audio file names stay readable.
  [/\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{32,}\b/g,         '<token>'],
];

export function sanitizeText(s: string): string {
  let out = s;
  for (const [re, to] of REDACTIONS) out = out.replace(re, to);
  return out;
}

/** One details value: strings are sanitized and clipped, objects flattened to text. */
function sanitizeValue(v: unknown): unknown {
  if (v == null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'string') return clip(sanitizeText(v), 300);
  try { return clip(sanitizeText(JSON.stringify(v) ?? ''), 300); } catch { return '<unserializable>'; }
}

/** Fields that are kept even when a row has to be cut down to fit. */
const ESSENTIAL_KEYS = new Set([
  'truncated', 'session', 'occurred_at', 'ms_since_launch', 'app_state',
  'online', 'network', 'count_this_launch', 'is_fatal', 'source', 'file',
]);

/**
 * Sanitize `raw` and make it fit the table: first by clipping each value, then
 * by dropping the stack, then by shortening everything, then by dropping the
 * caller's fields one by one, and as the very last resort by keeping only the
 * session id. The result is ALWAYS within DETAILS_BUDGET
 * bytes, so the table's size guard can never reject it (a rejected row would
 * otherwise be retried forever).
 */
function fitDetails(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    out[clip(k, 40)] = k === 'stack' && typeof v === 'string'
      ? clip(sanitizeText(v), 1200)
      : sanitizeValue(v);
  }
  if (jsonbBytes(out) <= DETAILS_BUDGET) return out;

  delete out.stack;
  out.truncated = true;
  if (jsonbBytes(out) <= DETAILS_BUDGET) return out;

  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string') out[k] = clip(out[k] as string, 80);
  }
  if (jsonbBytes(out) <= DETAILS_BUDGET) return out;

  // Still too big: drop the caller's fields from the last one backwards, and
  // keep the ones that say when / where / on which launch it happened.
  for (const k of Object.keys(out).reverse()) {
    if (ESSENTIAL_KEYS.has(k)) continue;
    delete out[k];
    if (jsonbBytes(out) <= DETAILS_BUDGET) return out;
  }
  return { truncated: true, session: _sessionId };
}

/**
 * Readable text for ANY thrown value. Supabase errors are plain objects, not
 * Error instances — String() turns them into "[object Object]", which is
 * exactly what the old API log stored for every row.
 */
export function errorText(err: unknown): string {
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'object') {
    const o = err as Record<string, any>;
    const parts = [
      o.message,
      o.code    != null ? `code=${o.code}`     : null,
      o.status  != null ? `status=${o.status}` : null,
      o.details,
      o.hint,
    ].filter(p => p != null && p !== '');
    if (parts.length) return parts.map(String).join(' | ');
    try { return JSON.stringify(o); } catch { return Object.prototype.toString.call(o); }
  }
  return String(err);
}

/** HTTP status from a Supabase Functions error (it wraps the Response). */
export function httpStatusOf(err: unknown): number | undefined {
  const o = err as any;
  const s = o?.context?.status ?? o?.status;
  return typeof s === 'number' ? s : undefined;
}

function stackOf(err: unknown): string | undefined {
  const s = (err as any)?.stack;
  return typeof s === 'string' ? clip(s, 1500) : undefined;
}

/**
 * Where a clip came from, without the full URL and never the audio itself.
 *   local  = a file in the phone's offline cache
 *   remote = streamed from the server
 *   data   = live TTS audio held in memory
 */
export function describeUri(uri?: string | null): Record<string, unknown> {
  if (!uri) return {};
  if (uri.startsWith('data:')) return { source: 'data', uri_len: uri.length };
  const file = clip(uri.split('/').pop()?.split('?')[0] ?? '', 120);
  if (uri.startsWith('file:')) return { source: 'local', file };
  if (uri.startsWith('http'))  return { source: 'remote', file };
  return { source: 'other', file };
}

function deviceInfo(): { app_version: string; platform: string; device: string } {
  const pc: Record<string, any> = (Platform as any).constants ?? {};
  const device = [pc.Manufacturer ?? pc.Brand, pc.Model].filter(Boolean).join(' ');
  const platform = Platform.OS === 'android'
    ? `android ${pc.Release ?? '?'} (API ${Platform.Version})`
    : `${Platform.OS} ${Platform.Version}`;
  let app_version = '?';
  try {
    app_version = `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;
  } catch {}
  return {
    app_version: clip(app_version, 100),
    platform:    clip(platform, 100),
    device:      clip(device || 'unknown', 100),
  };
}

async function networkState(): Promise<{ online: boolean; network?: string }> {
  try {
    const s = await Network.getNetworkStateAsync();
    return {
      online:  !!s.isConnected && s.isInternetReachable !== false,
      network: s.type ? String(s.type) : undefined,
    };
  } catch {
    return { online: true };
  }
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Sending ──────────────────────────────────────────────────────────────────

type SendResult =
  | 'sent'    // stored on the server (or was already there)
  | 'retry'   // network / server trouble: worth trying again later
  | 'drop';   // the table will never accept this row: do not keep it

/**
 * One insert, bounded in time and cancellable. The result tells the caller
 * whether to keep the row: before, every failure was treated as "try again
 * later", so a row the table would always refuse (too big, wrong identity)
 * stayed in the queue for good.
 */
async function send(row: Row): Promise<SendResult> {
  if (!supabase) return 'retry';
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const abortTimer = setTimeout(() => controller?.abort(), SEND_TIMEOUT_MS);
  try {
    let query = (supabase.from('client_errors') as any).insert(row);
    if (controller && typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
    // Second bound in case the client ignores the abort signal.
    const res: any = await withTimeout(
      Promise.resolve(query),
      SEND_TIMEOUT_MS + 1_000,
      { error: { message: 'timeout', code: '' }, status: 0 },
    );
    const error = res?.error;
    if (!error) return 'sent';

    const code   = String(error.code ?? '');
    const status = Number(res?.status ?? 0);
    if (code === '23505') return 'sent';                        // this id is already stored
    if (code === '42501' || code === '23514') return 'drop';    // row-level security / size guard: never will
    if (status === 0 || status === 408 || status === 429 || status >= 500) return 'retry';
    if (status === 401) return 'retry';                          // session may recover (expired token)
    return 'drop';                                               // any other 4xx: the row itself is the problem
  } catch {
    return 'retry';
  } finally {
    clearTimeout(abortTimer);
  }
}

// ─── Queue: one file per row ──────────────────────────────────────────────────

let _dirReady: Promise<void> | null = null;
function ensureQueueDir(): Promise<void> {
  if (!_dirReady) {
    _dirReady = FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true })
      .catch(() => { _dirReady = null; });
  }
  return _dirReady;
}

/** Queue file names, oldest first (the name starts with the time it was written). */
async function listQueue(): Promise<string[]> {
  try {
    return (await FileSystem.readDirectoryAsync(QUEUE_DIR)).filter(n => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

function removeFile(path: string): Promise<void> {
  return FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
}

async function enqueue(row: Row): Promise<void> {
  try {
    await ensureQueueDir();
    await FileSystem.writeAsStringAsync(`${QUEUE_DIR}${Date.now()}_${row.id}.json`, JSON.stringify(row));
    const names = await listQueue();
    for (const name of names.slice(0, Math.max(0, names.length - MAX_QUEUE))) {
      await removeFile(QUEUE_DIR + name);   // keep the newest MAX_QUEUE
    }
  } catch {}
}

/** Read and re-validate one stored row; null = unreadable, discard it. */
async function readRow(path: string): Promise<Row | null> {
  try {
    const o = JSON.parse(await FileSystem.readAsStringAsync(path));
    if (!o || typeof o.id !== 'string' || typeof o.function_name !== 'string' || typeof o.category !== 'string') return null;
    return {
      id:            o.id,
      function_name: clip(sanitizeText(String(o.function_name)), 150),
      error_message: clip(sanitizeText(String(o.error_message ?? '')), 500),
      category:      clip(String(o.category), 50),
      // Re-fitted on every read: a row written by older code can never be oversized.
      details:       fitDetails(o.details && typeof o.details === 'object' ? o.details : {}),
      app_version:   clip(String(o.app_version ?? '?'), 100),
      platform:      clip(String(o.platform ?? '?'), 100),
      device:        clip(String(o.device ?? '?'), 100),
      user_id:       typeof o.user_id === 'string' ? o.user_id : null,
    };
  } catch {
    return null;
  }
}

/**
 * The table accepts a row only if user_id is empty or the CURRENT user. A row
 * queued under an earlier anonymous identity would be refused for good, so it
 * is sent without an id instead of being lost.
 */
async function withCurrentIdentity(row: Row): Promise<Row> {
  if (!row.user_id) return row;
  const now = await withTimeout(currentUserId(), 1_500, null);
  return now === row.user_id ? row : { ...row, user_id: null };
}

/** A crash report written during a crash (see persistFatalNow) joins the queue. */
async function adoptFatalReport(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(FATAL_PATH);
    if (!info.exists) return;
    const row = await readRow(FATAL_PATH);
    if (row) await enqueue(row);
    await removeFile(FATAL_PATH);
  } catch {}
}

let _flushing = false;

/**
 * Send rows saved by an earlier launch (offline at the time, or the app was
 * crashing). Call once after startup; safe to call repeatedly. The network is
 * never used while anything is locked: each row is read, sent (bounded by
 * SEND_TIMEOUT_MS) and deleted on its own, so new reports can always be saved.
 */
export async function flushPendingReports(): Promise<void> {
  if (_flushing) return;
  _flushing = true;
  try {
    void removeFile(OLD_QUEUE);
    await adoptFatalReport();
    const names = await listQueue();
    for (const name of names.slice(0, MAX_QUEUE)) {
      const path = QUEUE_DIR + name;
      const stamp = Number(name.split('_')[0]);
      if (Number.isFinite(stamp) && Date.now() - stamp > MAX_AGE_MS) { await removeFile(path); continue; }

      const row = await readRow(path);
      if (!row) { await removeFile(path); continue; }          // torn / unreadable: only this row is lost

      const result = await send(await withCurrentIdentity(row));
      if (result === 'retry') break;                           // offline or server trouble: try next launch
      await removeFile(path);                                  // sent, or can never be accepted
    }
  } catch {
    // never a source of failures
  } finally {
    _flushing = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function deliver(
  category: ErrorCategory,
  where: string,
  error: unknown,
  details: Record<string, unknown> | undefined,
  opts: ReportOptions | undefined,
): Promise<void> {
  try {
    const message = clip(sanitizeText(errorText(error)), 500);

    // Throttle BEFORE any async work, so a burst costs nothing. The session
    // cap is checked first: once it is reached nothing new may even be
    // remembered (MAX_KEYS also bounds the memory of distinct failures).
    if (_sessionCount >= MAX_PER_SESSION) return;
    const key = `${category}|${where}|${message.slice(0, 80)}`;
    if (!_keyCounts.has(key) && _keyCounts.size >= MAX_KEYS) return;
    const count = (_keyCounts.get(key) ?? 0) + 1;
    _keyCounts.set(key, count);
    if (count > MAX_PER_KEY) return;
    _sessionCount++;

    const net = await withTimeout(networkState(), 1_000, { online: true });
    if (opts?.skipIfOffline && !net.online) {
      // An expected offline failure must use up NEITHER budget: before, only the
      // session counter was given back, so three offline attempts silenced the
      // first identical error that happened online.
      _sessionCount--;
      _keyCounts.set(key, count - 1);
      return;
    }

    const extra: Record<string, unknown> = {
      ...details,
      occurred_at: new Date().toISOString(),
      ms_since_launch: Date.now() - _startedAt,
      session: _sessionId,
      app_state: AppState.currentState,
      online: net.online,
      network: net.network,
      count_this_launch: count,
      dev: __DEV__ || undefined,
    };

    if (opts?.localUri && opts.localUri.startsWith('file:')) {
      try {
        const fi: any = await withTimeout(FileSystem.getInfoAsync(opts.localUri), 1_000, null);
        if (fi) {
          extra.local_exists = !!fi.exists;
          if (fi.exists) extra.local_bytes = fi.size ?? null;
        }
      } catch {}
    }

    const row: Row = {
      id:            uuid(),
      function_name: clip(sanitizeText(where), 150),
      error_message: message,
      category,
      details:       fitDetails(extra),
      ...deviceInfo(),
      user_id:       await withTimeout(currentUserId(), 1_500, null),
    };

    const result = await send(row);
    if (result === 'sent')       void flushPendingReports();   // we're online — also send anything left over
    else if (result === 'retry') await enqueue(row);
    // 'drop': the table will never take this row; keeping it would only retry forever
  } catch {
    // Diagnostics must never become a source of failures themselves.
  }
}

/**
 * Record a failure. Fire-and-forget: never throws, never awaits, does not
 * change anything for the caller.
 */
export function reportError(
  category: ErrorCategory,
  where: string,
  error: unknown,
  details?: Record<string, unknown>,
  opts?: ReportOptions,
): void {
  void deliver(category, where, error, details, opts);
}

/**
 * Watches a clip that was just started with shouldPlay:true and reports it if,
 * a few seconds later, nothing is actually playing — the UI shows "playing"
 * but the user hears silence.
 *
 * This is the one failure that produces no error at all: on Android a sound can
 * load successfully but silently refuse to start (for example when the app is
 * still treated as being in the background and cannot get audio focus). The
 * load "succeeds", our code marks the clip as playing, and nothing is heard.
 * Read-only: it only looks at the status.
 *
 * It is a SIGNAL, not proof: it cannot know whether a progressing sound is
 * audible through the actual route and volume, and a pause made by Android
 * (a call, another app: status.interrupted) is legitimate, not a fault.
 * Nothing may ever be deleted or "repaired" because this fired.
 */
export function watchPlaybackStart(
  sound: Sound,
  isCurrent: () => boolean,
  where: string,
  uri: string,
): void {
  const check = async (attempt: 1 | 2) => {
    try {
      if (!isCurrent() || AppState.currentState !== 'active') return;
      const st: PlaybackStatus = await sound.getStatusAsync();
      // The app can have gone to the background while we waited for the status.
      if (!isCurrent() || !st.isLoaded || AppState.currentState !== 'active') return;
      if (!st.shouldPlay || st.isPlaying || st.didJustFinish || st.positionMillis > 0) return;
      if (st.interrupted) return;   // Android paused it (call / other app): not a fault

      const snapshot = {
        ...describeUri(uri),
        attempt,
        waited_ms:    attempt === 1 ? 2_500 : 10_000,
        is_buffering: st.isBuffering,
        position_ms:  st.positionMillis,
        duration_ms:  st.durationMillis ?? null,
      };

      if (st.isBuffering) {
        if (attempt === 1) { setTimeout(() => void check(2), 7_500); return; }
        reportError('audio_slow', where, 'still waiting for audio data 10s after start', snapshot, { localUri: uri });
        return;
      }
      reportError('audio_stuck', where, 'loaded but not playing (silent)', snapshot, { localUri: uri });
    } catch {}
  };
  setTimeout(() => void check(1), 2_500);
}

// ─── Global handlers ──────────────────────────────────────────────────────────

let _globalInstalled = false;

/**
 * Save a crash report from INSIDE the crash handler. It must not wait for
 * anything: no network state, no sign-in lookup, no queue, no timers — the JS
 * runtime may be in a state where none of that ever completes. It builds the
 * row synchronously and hands ONE write to the native side (one file, fixed
 * name); the next launch moves it into the queue (adoptFatalReport) and sends
 * it. Whether the write finishes before the process dies is up to the system:
 * this is best effort, and deliberately costs the crash path no time at all.
 */
function persistFatalNow(error: unknown): void {
  const details = fitDetails({
    stack:             stackOf(error),
    is_fatal:          true,
    session:           _sessionId,
    occurred_at:       new Date().toISOString(),
    ms_since_launch:   Date.now() - _startedAt,
    app_state:         AppState.currentState,
    count_this_launch: 1,
  });
  const row: Row = {
    id:            uuid(),
    function_name: 'global',
    error_message: clip(sanitizeText(errorText(error)), 500),
    category:      'js_fatal',
    details,
    ...deviceInfo(),
    user_id:       null,   // no sign-in lookup during a crash; the table accepts an empty id
  };
  void FileSystem.writeAsStringAsync(FATAL_PATH, JSON.stringify(row)).catch(() => {});
}

/**
 * Report uncaught JS errors (including the ones that crash the app) and
 * unhandled promise rejections.
 *
 * The original handler is called IMMEDIATELY and SYNCHRONOUSLY, in the same
 * place and with the same exceptions as without this file: a fatal error ends
 * the app exactly as it always did. (An earlier version held the original
 * handler for up to 1.5 s while the report was saved; that changed crash
 * behavior in production — timers need a healthy JS loop, and a throw from the
 * delayed call became a rejected promise instead of the normal crash.)
 */
export function installGlobalErrorReporting(): void {
  if (_globalInstalled) return;
  _globalInstalled = true;

  const EU = (globalThis as any).ErrorUtils;
  if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
    const previous = EU.getGlobalHandler();
    EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      try {
        if (isFatal) persistFatalNow(error);
        else         reportError('js_error', 'global', error, { stack: stackOf(error), is_fatal: false });
      } catch {
        // reporting must never get in the way of the original handler
      }
      previous?.(error, isFatal);
    });
  }

  // Production only: React Native installs its own tracker in development.
  // A rejection that is handled a moment later (common: a promise created
  // first, awaited second) is not a fault, so each one waits briefly for
  // onHandled before it is reported.
  const hermes = (globalThis as any).HermesInternal;
  if (!__DEV__ && hermes?.enablePromiseRejectionTracker) {
    const waiting = new Map<number, ReturnType<typeof setTimeout>>();
    try {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (id: number, rejection: unknown) => {
          waiting.set(id, setTimeout(() => {
            waiting.delete(id);
            reportError('promise', 'unhandled', rejection, { stack: stackOf(rejection) });
          }, 3_000));
        },
        onHandled: (id: number) => {
          const t = waiting.get(id);
          if (t) { clearTimeout(t); waiting.delete(id); }
        },
      });
    } catch {}
  }
}
