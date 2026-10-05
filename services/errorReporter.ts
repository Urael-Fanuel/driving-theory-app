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
 *      content (data: URIs are reduced to their length), no full URLs.
 *   3. Throttled per app launch (MAX_PER_KEY / MAX_PER_SESSION), so a failing
 *      loop — e.g. a whole topic's downloads failing — cannot flood the table.
 *   4. Expected offline failures are not reported (skipIfOffline): a download
 *      that fails with no connection is normal, not a bug.
 *
 * Rows that cannot be sent right away (no connection, or the app is crashing)
 * are kept in a small file and sent on a later launch. Each row carries a
 * client-generated id, so a row that was both sent and queued is stored once.
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

const MAX_PER_KEY     = 3;   // same failure, same place: first 3 per launch
const MAX_PER_SESSION = 60;  // everything together, per launch
const MAX_QUEUE       = 30;  // rows kept on disk while they cannot be sent
const QUEUE_PATH      = (FileSystem.documentDirectory ?? '') + 'diagnostics_queue.json';

const _startedAt  = Date.now();
const _sessionId  = uuid();
const _keyCounts  = new Map<string, number>();
let   _sessionCount = 0;

// ─── Small helpers ────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
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

// ─── Sending / queue ──────────────────────────────────────────────────────────

/** true = stored on the server (or already there). */
async function send(row: Row): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await (supabase.from('client_errors') as any).insert(row);
    if (!error) return true;
    // 23505 = this id is already stored (it was sent before being re-queued).
    return (error as any)?.code === '23505';
  } catch {
    return false;
  }
}

async function readQueue(): Promise<Row[]> {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_PATH);
    if (!info.exists) return [];
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(QUEUE_PATH));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(rows: Row[]): Promise<void> {
  try {
    if (!rows.length) {
      await FileSystem.deleteAsync(QUEUE_PATH, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(QUEUE_PATH, JSON.stringify(rows.slice(-MAX_QUEUE)));
  } catch {}
}

/** Serializes queue file access (reports can arrive in parallel). */
let _queueLock: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = _queueLock.then(fn, fn);
  _queueLock = run.catch(() => {});
  return run;
}

function enqueue(row: Row): Promise<void> {
  return withQueueLock(async () => {
    const rows = await readQueue();
    if (!rows.some(r => r.id === row.id)) rows.push(row);
    await writeQueue(rows);
  });
}

let _flushing = false;

/**
 * Send rows saved by an earlier launch (offline at the time, or the app was
 * crashing). Call once after startup; safe to call repeatedly.
 */
export async function flushPendingReports(): Promise<void> {
  if (_flushing) return;
  _flushing = true;
  try {
    await withQueueLock(async () => {
      const rows = await readQueue();
      if (!rows.length) return;
      const remaining: Row[] = [];
      for (const row of rows) {
        if (!(await send(row))) remaining.push(row);
      }
      await writeQueue(remaining);
    });
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
  persistFirst: boolean,
): Promise<void> {
  try {
    const message = clip(errorText(error), 500);

    // Throttle BEFORE any async work, so a burst costs nothing.
    const key = `${category}|${where}|${message.slice(0, 80)}`;
    const count = (_keyCounts.get(key) ?? 0) + 1;
    _keyCounts.set(key, count);
    if (count > MAX_PER_KEY || _sessionCount >= MAX_PER_SESSION) return;
    _sessionCount++;

    const net = await networkState();
    if (opts?.skipIfOffline && !net.online) {
      _sessionCount--; // an expected offline failure must not use up the budget
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
        const fi: any = await FileSystem.getInfoAsync(opts.localUri);
        extra.local_exists = !!fi.exists;
        if (fi.exists) extra.local_bytes = fi.size ?? null;
      } catch {}
    }

    let detailsJson = JSON.stringify(extra);
    if (detailsJson.length > 4000) {
      delete extra.stack;
      detailsJson = JSON.stringify(extra);
      if (detailsJson.length > 4000) extra.truncated = true;
    }

    const row: Row = {
      id:            uuid(),
      function_name: clip(where, 150),
      error_message: message,
      category,
      details:       detailsJson.length > 4000 ? { truncated: true, session: _sessionId } : extra,
      ...deviceInfo(),
      user_id:       await currentUserId(),
    };

    if (persistFirst) {
      // The app may be torn down any moment: put it on disk first.
      await enqueue(row);
      if (await send(row)) {
        await withQueueLock(async () => writeQueue((await readQueue()).filter(r => r.id !== row.id)));
      }
      return;
    }

    if (await send(row)) {
      void flushPendingReports(); // we're online — also send anything left over
    } else {
      await enqueue(row);
    }
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
  void deliver(category, where, error, details, opts, false);
}

/**
 * Watches a clip that was just started with shouldPlay:true and reports it if,
 * a few seconds later, nothing is actually playing — the UI shows "playing"
 * but the user hears silence.
 *
 * This is the one failure that produces no error at all: on Android, expo-av
 * can load a sound successfully but silently refuse to start it (for example
 * when it believes the app is still in the background and will not request
 * audio focus). The load "succeeds", our code marks the clip as playing, and
 * nothing is ever heard. Read-only: it only looks at the status.
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
      if (!isCurrent() || !st.isLoaded) return;
      if (!st.shouldPlay || st.isPlaying || st.didJustFinish || st.positionMillis > 0) return;

      const snapshot = {
        ...describeUri(uri),
        attempt,
        is_buffering: st.isBuffering,
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

let _globalInstalled = false;

/**
 * Report uncaught JS errors (including the ones that crash the app) and
 * unhandled promise rejections. Keeps the existing behavior: the original
 * handler still runs, so a fatal error still ends the app exactly as before —
 * it just gets up to 1.5 s to save the report first.
 */
export function installGlobalErrorReporting(): void {
  if (_globalInstalled) return;
  _globalInstalled = true;

  const EU = (global as any).ErrorUtils;
  if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
    const previous = EU.getGlobalHandler();
    EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      const details = { stack: stackOf(error), is_fatal: !!isFatal };
      if (isFatal) {
        const saved = deliver('js_fatal', 'global', error, details, undefined, true);
        Promise.race([saved, new Promise(r => setTimeout(r, 1_500))])
          .finally(() => previous?.(error, isFatal));
      } else {
        reportError('js_error', 'global', error, details);
        previous?.(error, isFatal);
      }
    });
  }

  // Production only: React Native installs its own tracker in development.
  const hermes = (global as any).HermesInternal;
  if (!__DEV__ && hermes?.enablePromiseRejectionTracker) {
    try {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (_id: number, rejection: unknown) => {
          reportError('promise', 'unhandled', rejection, { stack: stackOf(rejection) });
        },
        onHandled: () => {},
      });
    } catch {}
  }
}
