/**
 * utils/googleTTS.ts
 * Calls Google Cloud TTS API and plays the result using expo-av.
 *
 * Exports:
 *   speakAmharic(text)      – fire-and-forget TTS (backward compat)
 *   speakAndAwait(text)     – TTS, resolves when audio finishes
 *   playUrlAndAwait(url)    – plays a pre-recorded URL, resolves when done
 *   stopTTS()               – stops current audio; resolves any pending await
 *   pauseTTS()              – pauses current sound
 *   resumeTTS()             – resumes current sound
 */

import { Sound, applyAudioMode } from '../services/sound';
import { supabase } from '../backend/supabaseClient';
import { getCachedTtsUri, storeTtsAudio, releaseAudioFiles, fetchRecordedTts, skipRecordedTts, isRecordedTtsUri } from '../services/audioCache';
import { reportError, describeUri, httpStatusOf } from '../services/errorReporter';

// TTS requests go through a Supabase Edge Function (supabase/functions/tts) —
// the Google API key lives server-side only and is never shipped in the app.

let currentSound:   Sound | null = null;
let pendingResolve: (() => void) | null = null;
let _ttsGeneration = 0;   // Incremented by stopTTS — lets speakAndAwait/playUrlAndAwait detect mid-fetch cancellation

// ─── TTS speaking state ───────────────────────────────────────────────────────
let _isTTSSpeaking = false;
const _speakingListeners = new Set<(speaking: boolean) => void>();

function _emitSpeaking(speaking: boolean) {
  _isTTSSpeaking = speaking;
  _speakingListeners.forEach(fn => fn(speaking));
}

/** Subscribe to TTS speaking state changes. Returns an unsubscribe function. */
export function onTTSSpeakingChange(fn: (speaking: boolean) => void): () => void {
  _speakingListeners.add(fn);
  return () => _speakingListeners.delete(fn);
}

/** Get the current TTS speaking state without subscribing. */
export function getIsTTSSpeaking(): boolean {
  return _isTTSSpeaking;
}

/**
 * Switch the speaking state off, but only for the request that owns playback
 * now. A request that was replaced (or stopped) must leave the state alone: the
 * newer one may already be speaking, and an old request reaching one of its exit
 * paths late used to switch it off over a live voice (CODEX QA 2026-10-08, R1).
 */
function _stopSpeakingIfMine(generation: number): void {
  if (_ttsGeneration === generation) _emitSpeaking(false);
}

// ─── Core controls ────────────────────────────────────────────────────────────

/**
 * Take ownership of TTS playback. Synchronous on purpose, like _claim() in
 * hooks/useAudio.ts: the generation is taken BEFORE any await. Two requests
 * that started together used to capture it only after awaiting stopTTS(), so
 * both got the same number, both played, and stopTTS() could stop only one of
 * them (CODEX QA 2026-10-08, Q01).
 *
 * Also lets any caller still waiting go, and hands back the sound playing now,
 * which the caller must stop with _releaseTTS(). currentSound is read here and
 * never after an await, so a stop that is still finishing can never stop or
 * unload a sound that started after it.
 */
function _claimTTS(): { generation: number; previous: Sound | null } {
  const generation = ++_ttsGeneration;   // invalidates every in-flight request
  const previous   = currentSound;
  currentSound = null;
  _emitSpeaking(false);
  // Resolve any pending speakAndAwait / playUrlAndAwait so the sequence exits
  const res = pendingResolve;
  pendingResolve = null;
  res?.();
  return { generation, previous };
}

async function _releaseTTS(previous: Sound | null): Promise<void> {
  if (!previous) return;
  try { await previous.stopAsync();   } catch {}
  try { await previous.unloadAsync(); } catch {}
}

export async function stopTTS(): Promise<void> {
  const { previous } = _claimTTS();
  await _releaseTTS(previous);
}

export async function pauseTTS(): Promise<void> {
  try { await currentSound?.pauseAsync(); } catch {}
}

export async function resumeTTS(): Promise<void> {
  try { await currentSound?.playAsync(); } catch {}
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * How a wait ended:
 *   'done'    — the clip played to the end (or it was audibly playing and only
 *               the finish callback went missing),
 *   'stopped' — stopTTS() or a newer request ended it on purpose,
 *   'failed'  — the user heard nothing: an error after loading, or no sound
 *               at all before the safety clock ran out.
 * 'failed' must never be reported as success: the caller would move on as if
 * the sentence had been heard (CODEX QA 2026-10-08, Q04).
 */
type SoundOutcome = 'done' | 'stopped' | 'failed';

/** Margin on top of a clip's own length before the safety clock gives up on it. */
const SAFETY_MARGIN_MS = 15_000;

/**
 * Attach a playback-finish listener and return a promise that resolves when:
 *   (a) the sound finishes naturally (didJustFinish), OR
 *   (b) stopTTS() is called externally (pendingResolve is resolved from outside),
 *   (c) the safety clock runs out — prevents a permanent wait if didJustFinish
 *       never fires on certain Android devices.
 *
 * The safety clock is the clip's own length plus a margin once that length is
 * known (never less than maxMs). It used to be a flat 30 s, which cut every
 * longer reading off mid-sentence, e.g. a "why?" explanation of up to 950
 * characters (about two minutes).
 */
function awaitSound(sound: Sound, maxMs = 30_000): Promise<SoundOutcome> {
  return new Promise<SoundOutcome>((resolve) => {
    let settled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    let armedFor    = 0;       // the budget the running safety clock was given
    let everPlayed  = false;   // did a status ever say it is actually playing?
    let durationMs  = 0;
    let positionMs  = 0;
    let lastStalled = false;   // the last status said it was stuck (buffering / not playing)

    /**
     * Ends THIS wait, and only this one.
     *
     * ⚠️ DO NOT go back to resolving the module-level `pendingResolve` from
     * inside the status listener. That was a real, months-old latent bug that
     * finally bit on 2026-08-17: a clip's didJustFinish can arrive slightly
     * AFTER the next clip has already started waiting, and the old code read
     * whatever `pendingResolve` held at that moment — by then the NEXT clip's
     * resolve. Consequences, both observed in a device log:
     *   1. The next clip was reported "finished" ~180 ms in (real length
     *      ~3.2 s), so the caller advanced to the following sound immediately.
     *   2. It also set `currentSound = null` while that newer clip was still
     *      playing, leaving an ORPHAN that nothing could stop.
     * Together those play two clips at once. Every guard below exists to make
     * both impossible: a stale clip can only ever end its own wait, and can
     * never touch a newer clip's state.
     */
    const finish = (outcome: SoundOutcome) => {
      if (settled) return;
      settled = true;
      if (safetyTimer) clearTimeout(safetyTimer);
      // Detach first: a unloaded/stopped sound can still emit one last status.
      try { sound.setOnPlaybackStatusUpdate(null); } catch {}
      // Only release the shared slot / current sound if they are still OURS.
      if (pendingResolve === stopWait) pendingResolve = null;
      if (currentSound === sound)       currentSound = null;
      sound.unloadAsync().catch(() => {});
      resolve(outcome);
    };
    const stopWait = () => finish('stopped');

    pendingResolve = stopWait;

    // Safety: give up after the clip's own length plus a margin of PLAYING time
    // (maxMs until the length is known). The clock is held while the sound is
    // paused (by Android during a phone call / another app, or by the user) and
    // restarts on resume; otherwise a call longer than the budget ended the
    // sentence unheard and the lesson walked on. Running out after the clip was
    // audibly playing means the finish callback was dropped: it was heard.
    // Running out with no sound ever: nothing was heard.
    const budget = () => durationMs > 0
      ? Math.max(maxMs, durationMs - positionMs + SAFETY_MARGIN_MS)
      : maxMs;
    // Running out after it played counts as heard when it got (nearly) to its
    // end, or when the last word from the player was that it was playing (the
    // callbacks simply stopped arriving). When the last word was that it was
    // stuck part-way (buffering), it was not heard to the end: a failure
    // (CODEX QA 2026-10-08, R2). Same rule as hooks/useAudio.ts.
    const reachedEnd = () => durationMs > 0 && durationMs - positionMs <= Math.max(3_000, durationMs * 0.1);
    const onSafety   = () => { safetyTimer = undefined; finish(everPlayed && (reachedEnd() || !lastStalled) ? 'done' : 'failed'); };
    const armSafety  = () => {
      if (settled) return;
      const want = budget();
      if (safetyTimer && armedFor >= want) return;   // already armed with enough
      if (safetyTimer) clearTimeout(safetyTimer);
      armedFor    = want;
      safetyTimer = setTimeout(onSafety, want);
    };
    const holdSafety = () => { if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = undefined; armedFor = 0; } };
    armSafety();

    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) {
        // Was playing, then stopped by an error (see services/sound.ts).
        if (s.error) finish('failed');
        return;
      }
      if (s.durationMillis) durationMs = s.durationMillis;
      positionMs = s.positionMillis ?? 0;
      lastStalled = !!s.isBuffering || (!s.isPlaying && !!s.shouldPlay && !s.interrupted && !s.didJustFinish);
      if (s.isPlaying || positionMs > 0) everPlayed = true;
      if (s.didJustFinish) {
        finish('done');
        return;
      }
      if (s.interrupted || !s.shouldPlay) {
        holdSafety();
        // Show ▶️ instead of ⏸ over silence while Android holds the audio.
        if (s.interrupted && currentSound === sound && _isTTSSpeaking) _emitSpeaking(false);
      } else if (s.isPlaying) {
        armSafety();
        if (currentSound === sound && !_isTTSSpeaking) _emitSpeaking(true);
      }
    });
  });
}

// ─── Public playback functions ────────────────────────────────────────────────

/** Play a pre-recorded audio URL and await completion.
 *  Returns true if audio played successfully, false if it failed. */
export async function playUrlAndAwait(url: string): Promise<boolean> {
  const { generation: myGeneration, previous } = _claimTTS();   // FIRST, before any await
  await _releaseTTS(previous);
  if (_ttsGeneration !== myGeneration) return false;   // replaced while the old clip was stopping
  try {
    _emitSpeaking(true);
    await applyAudioMode();
    const { sound } = await Sound.createAsync({ uri: url });
    if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); _stopSpeakingIfMine(myGeneration); return false; }
    currentSound = sound;
    await sound.playAsync();
    // stopTTS() can land in the gap between the check above and playback
    // actually starting. Without this second check the clip would keep
    // playing with currentSound already nulled — audible, and unstoppable.
    if (_ttsGeneration !== myGeneration) {
      sound.stopAsync().catch(() => {});
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      _stopSpeakingIfMine(myGeneration);
      return false;
    }
    const outcome = await awaitSound(sound);
    // A newer request owns the speaking state now; don't switch it off.
    _stopSpeakingIfMine(myGeneration);
    if (outcome === 'failed') {
      if (_ttsGeneration === myGeneration) {
        reportError('audio', 'playUrlAndAwait:playback', 'stopped by an error or never made a sound',
          describeUri(url), { localUri: url });
      }
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[googleTTS] playUrlAndAwait error:', e);
    if (_ttsGeneration === myGeneration) {  // not when stopTTS() cancelled it
      reportError('audio', 'playUrlAndAwait', e, describeUri(url), { localUri: url });
    }
    _stopSpeakingIfMine(myGeneration);
    return false;
  }
}

/** Call Google TTS API and await completion.
 *  Returns true if the text was spoken successfully, false if it failed
 *  (network timeout, API error, no audio content).
 *  Callers MUST check the return value — if false, the user heard nothing
 *  and the sequence should stop rather than continue to the next step.
 *
 *  ⚠️ OFFLINE: behavioral questions and answers are spoken only through here
 *  (from a recorded clip of the exact text when one is published, otherwise
 *  live TTS). Every rendering is therefore cached to disk
 *  keyed by the exact text, so the FIRST read of a given sentence needs a
 *  connection and every read after it works offline. Do not remove the cache
 *  lookup below — without it the whole behavioral side of the app goes silent
 *  the moment reception drops. */
export async function speakAndAwait(text: string): Promise<boolean> {
  const { generation: myGeneration, previous } = _claimTTS();   // FIRST, before any await
  await _releaseTTS(previous);
  if (_ttsGeneration !== myGeneration) return false;   // replaced while the old clip was stopping
  try {
    _emitSpeaking(true);
    await applyAudioMode();

    // ── 1. Offline-first: a previous rendering of this exact text ────────────
    let uri = await getCachedTtsUri(text);
    let source: TtsSource = 'cache';
    if (_ttsGeneration !== myGeneration) { _stopSpeakingIfMine(myGeneration); return false; }

    // ── 2. Not cached — a recorded clip of this exact text, when there is one
    //       (same voice and settings as the live call, see fetchRecordedTts).
    //       No recording, a failed download, or a slow one all go to live TTS.
    if (!uri) {
      uri = await withRecordedDeadline(fetchRecordedTts(text, 'now'));
      source = 'recording';
      if (_ttsGeneration !== myGeneration) { _stopSpeakingIfMine(myGeneration); return false; }
    }

    let failedUri: string | null = null;
    if (uri) {
      const outcome = await _playTtsUri(uri, text, source, myGeneration);
      if (outcome !== 'failed') return outcome === 'done';
      failedUri = uri;
      // The saved clip (a cached rendering or a recording) would not play and
      // has been thrown away. Say the sentence live instead, once, in this same
      // request, so a bad file never leaves the user in silence (CODEX QA
      // 2026-10-24, R1).
      if (_ttsGeneration !== myGeneration) return false;
      _emitSpeaking(true);
    }

    // ── 3. Live — ask the Edge Function proxy (not Google directly), so the API
    //       key stays server-side.
    const liveUri = await _fetchLiveTts(text, myGeneration, failedUri);
    if (!liveUri) { _stopSpeakingIfMine(myGeneration); return false; }
    const heard = (await _playTtsUri(liveUri, text, 'live', myGeneration)) === 'done';
    // No further try after this one: switch the speaking state off (only if this
    // request still owns it), or the screens keep showing ⏸ over silence
    // (CODEX QA 2026-10-24, S1).
    if (!heard) _stopSpeakingIfMine(myGeneration);
    return heard;
  } catch (e) {
    console.warn('[googleTTS] speakAndAwait error:', e);
    if (_ttsGeneration === myGeneration) {
      reportError('audio', 'speakAndAwait', e, { text_len: text.length });
    }
    _stopSpeakingIfMine(myGeneration);
    return false;
  }
}

/** Where the clip being played came from (reported with any failure). */
type TtsSource = 'cache' | 'recording' | 'live';

/**
 * How long speakAndAwait (and the offline pre-rendering) waits for a recorded
 * clip before using live TTS instead. The download keeps going and fills the
 * recording's own cache slot for next time; it can never replace the live
 * rendering, which has a separate slot (services/audioCache.ts getCachedTtsUri).
 */
const RECORDED_WAIT_MS = 8_000;

function withRecordedDeadline(fetching: Promise<string | null>): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), RECORDED_WAIT_MS); });
  return Promise.race([fetching.catch(() => null), deadline]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Live TTS through the Edge Function, saved to the live cache slot.
 * Returns the URI to play, or null when the user would hear nothing (reported).
 * Races a timeout so a hung function can never freeze the app (ANR).
 */
async function _fetchLiveTts(text: string, myGeneration: number, failedUri: string | null = null): Promise<string | null> {
  const invokePromise = supabase.functions.invoke('tts', { body: { text } });
  const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
    setTimeout(() => resolve({ data: null, error: new Error('tts timeout') }), 8_000)
  );
  const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

  if (error || !data?.audioContent) {
    if (error) console.warn('[googleTTS] tts function error:', error);
    // Only a real failure — a stop/cancel during the fetch is not one.
    if (_ttsGeneration === myGeneration) {
      reportError('tts', 'speakAndAwait:invoke', error ?? 'empty audioContent',
        { status: httpStatusOf(error), text_len: text.length }, { skipIfOffline: true });
    }
    return null;
  }
  // Cancelled during fetch — another stopTTS() was called while we were waiting
  if (_ttsGeneration !== myGeneration) return null;

  // Save it first and play the saved file. That is exactly the path a cached
  // sentence takes, so a freshly fetched one behaves like a replay (and the
  // saved copy is there for offline use either way). The base64 data: URI is
  // only a last resort if writing to disk fails.
  await storeTtsAudio(text, data.audioContent);
  if (_ttsGeneration !== myGeneration) return null;
  const saved = await getCachedTtsUri(text);
  // Play the LIVE rendering just fetched: never a recording in its own slot, and
  // never the saved file that just failed (if it could not be deleted, the save
  // above kept it and skipped the fresh audio; CODEX QA 2026-10-24, S2).
  return saved && !isRecordedTtsUri(saved) && saved !== failedUri ? saved : `data:audio/mp3;base64,${data.audioContent}`;
}

/**
 * Play one clip of this request to the end.
 *   'done'    — heard, or stopped on purpose while it was playing (the old
 *               behaviour of speakAndAwait: true);
 *   'stopped' — stopTTS() or a newer request took over BEFORE it played (false);
 *   'failed'  — not heard: it would not load, start, or play. A saved file that
 *               would not load, start or play is deleted (and a recording is not
 *               used again this session), so it is never retried forever.
 * Leaves the speaking state on after 'failed' so the caller can try live TTS;
 * the caller MUST switch it off when it does not try again.
 */
async function _playTtsUri(uri: string, text: string, source: TtsSource, myGeneration: number): Promise<'done' | 'stopped' | 'failed'> {
  const recorded = isRecordedTtsUri(uri);
  const details  = () => ({ ...describeUri(uri), from_cache: source === 'cache', from_recording: recorded, text_len: text.length });
  const discard  = async () => {
    if (!uri.startsWith('file:')) return;
    if (recorded) await skipRecordedTts(text).catch(() => {});
    else await releaseAudioFiles([uri]).catch(() => {});
  };

  let sound: Sound;
  try {
    ({ sound } = await Sound.createAsync({ uri }));
  } catch (err) {
    if (_ttsGeneration !== myGeneration) { _stopSpeakingIfMine(myGeneration); return 'stopped'; }
    reportError('audio', 'speakAndAwait:load', err, details(), { localUri: uri.startsWith('file:') ? uri : null });
    // A saved file that cannot be loaded is a dud: drop it rather than failing
    // the same way on every try.
    console.warn('[googleTTS] saved TTS unreadable, discarding:', err);
    await discard();
    return 'failed';
  }

  if (_ttsGeneration !== myGeneration) { sound.unloadAsync().catch(() => {}); _stopSpeakingIfMine(myGeneration); return 'stopped'; }
  currentSound = sound;
  try {
    await sound.playAsync();
  } catch (err) {
    // playAsync() refused to start, so nothing was heard. The cause cannot be
    // told apart reliably (audio focus, or a file the player cannot start), so
    // it is treated like any clip that will not play: the saved file is
    // dropped and the caller says the sentence live, once (CODEX QA
    // 2026-10-24, S2). Skipped when stopTTS() ran meanwhile: that is a cancel.
    sound.unloadAsync().catch(() => {});
    if (currentSound === sound) currentSound = null;
    if (_ttsGeneration !== myGeneration) { _stopSpeakingIfMine(myGeneration); return 'stopped'; }
    console.warn('[googleTTS] speakAndAwait error:', err);
    reportError('audio', 'speakAndAwait', err, details(), { localUri: uri.startsWith('file:') ? uri : null });
    await discard();
    return 'failed';
  }
  // stopTTS() can land in the gap between the check above and playback
  // actually starting. Without this second check the clip would keep
  // playing with currentSound already nulled — audible, and unstoppable.
  if (_ttsGeneration !== myGeneration) {
    sound.stopAsync().catch(() => {});
    sound.unloadAsync().catch(() => {});
    if (currentSound === sound) currentSound = null;
    _stopSpeakingIfMine(myGeneration);
    return 'stopped';
  }
  const outcome = await awaitSound(sound);
  if (outcome === 'failed') {
    // Not heard. When a newer request already took over, that one owns the
    // audio now: no report, no retry, just "not heard" (false, as before).
    if (_ttsGeneration !== myGeneration) return 'stopped';
    reportError('audio', 'speakAndAwait:playback', 'stopped by an error or never made a sound',
      details(), { localUri: uri.startsWith('file:') ? uri : null });
    // A saved rendering that cannot be played is a dud: drop it so the next
    // try fetches a fresh one instead of failing the same way forever.
    await discard();
    return 'failed';
  }
  // A newer request owns the speaking state now; don't switch it off.
  _stopSpeakingIfMine(myGeneration);
  // Stopped while it was playing counts as 'done', exactly as before this
  // function existed: an interrupted reading is not a failure, and callers
  // must not report one or retry (only a stop BEFORE playback is 'stopped').
  return 'done';
}

/** Fire-and-forget TTS — kept for backward compatibility. */
export function speakAmharic(text: string): void {
  speakAndAwait(text).catch(() => {});
}

/**
 * The tts Edge Function refuses text longer than 1000 characters
 * (supabase/functions/tts), so a long text is spoken in parts. Parts end at a
 * sentence end where possible, never in the middle of a word.
 */
const TTS_PART_MAX_CHARS = 900;

/** Ethiopic full stop and question mark, plus ? ! and line breaks. */
const SENTENCE_END = /[።፧?!\n]/;

/** Split a long text into parts the tts function accepts, keeping every word. */
export function splitForTts(text: string, maxChars = TTS_PART_MAX_CHARS): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];

  // Sentences, each keeping its own end mark.
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    if (SENTENCE_END.test(clean[i])) {
      sentences.push(clean.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < clean.length) sentences.push(clean.slice(start));

  const parts: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) parts.push(current.trim()); current = ''; };
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // One sentence too long on its own: break it between words.
      flush();
      let rest = sentence.trim();
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(' ', maxChars);
        const at  = cut > 0 ? cut : maxChars;
        parts.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest;
      continue;
    }
    if ((current + sentence).length > maxChars) flush();
    current += sentence;
  }
  flush();
  return parts;
}

/**
 * Speak a text of any length (e.g. a "why?" explanation) and await the end.
 * Short text is a single speakAndAwait(). Long text is spoken part after part;
 * if stopTTS() or another request interrupts a part, the rest is not started.
 * Returns false only if a part could not be heard.
 */
export async function speakLongAndAwait(text: string): Promise<boolean> {
  for (const part of splitForTts(text)) {
    const speaking = speakAndAwait(part);
    const myGeneration = _ttsGeneration;   // speakAndAwait claims synchronously
    const heard = await speaking;
    if (_ttsGeneration !== myGeneration) return true;   // stopped or replaced: not a failure
    if (!heard) return false;
  }
  return true;
}

// ─── Offline pre-rendering ────────────────────────────────────────────────────

/**
 * Spoken-number prefixes Engine B puts in front of each answer.
 * ⚠️ Must stay identical to the AMHARIC_NUMBERS arrays in
 * app/(engineB)/behavioral-subtopic/[id].tsx and
 * app/(engineB)/topic-quiz/[topicId].tsx. The TTS cache is keyed by the exact
 * string spoken, so any drift here silently turns every Engine B answer into a
 * cache miss and it goes back to needing a live connection.
 */
const TTS_NUMBER_PREFIXES = ['አንድ', 'ሁለት', 'ሶስት', 'አራት'];

/**
 * Collect the sentences that can ONLY be voiced by TTS.
 *
 * A question with a `question_audio_url` has pre-recorded files and is handled
 * by the normal audio cache. A question without one is behavioral: its text is
 * the only source, so it must be rendered and stored ahead of time or it will
 * be silent the moment reception drops.
 *
 * The two engines say answers differently: Engine A reads the answer text on
 * its own, Engine B prefixes it with the spoken number. Those are separate
 * cache entries, so pass `engine` to render only the wording that will
 * actually be spoken. When it is unknown, BOTH are collected — caching a
 * little extra is cheap, guessing wrong means silence offline.
 */
export function collectTtsTexts(
  questions: Array<{
    question_amharic?: string;
    question_audio_url?: string;
    answers?: Array<{ text_amharic?: string; audio_url?: string }>;
  }>,
  engine?: 'A' | 'B' | null
): string[] {
  const texts: string[] = [];
  for (const q of questions) {
    if (q.question_audio_url) continue; // has real audio files
    if (q.question_amharic) texts.push(q.question_amharic);
    (q.answers ?? []).forEach((a, i) => {
      if (a.audio_url || !a.text_amharic) return;
      if (engine !== 'B') texts.push(a.text_amharic);                     // Engine A
      if (engine !== 'A') {
        const prefix = TTS_NUMBER_PREFIXES[i];
        if (prefix) texts.push(`${prefix}። ${a.text_amharic}`);            // Engine B
      }
    });
  }
  return texts;
}

/**
 * True when every text already has a saved rendering, i.e. it can be spoken
 * with no connection. Empty texts are skipped.
 */
export async function areTtsTextsCached(texts: string[]): Promise<boolean> {
  for (const text of texts) {
    if (!text) continue;
    if (!(await getCachedTtsUri(text).catch(() => null))) return false;
  }
  return true;
}

/**
 * Render and store TTS for the given texts so they can be spoken offline later.
 *
 * Deliberately isolated from playback: it never touches currentSound,
 * _ttsGeneration or the speaking state, so it cannot interfere with audio the
 * user is listening to right now. Failures are silent — this is an
 * optimisation, and a miss simply means falling back to a live call later.
 */
export async function prefetchTtsForTexts(texts: string[]): Promise<void> {
  const pending: string[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const cached = await getCachedTtsUri(text).catch(() => null);
    if (!cached) pending.push(text);
  }

  // Small batches: an exam can need ~40 renderings, and firing them all at
  // once would hammer the Edge Function.
  const BATCH_SIZE = 3;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    await Promise.all(
      pending.slice(i, i + BATCH_SIZE).map(async (text) => {
        try {
          // A recorded clip, when there is one, is the same sentence at no cost.
          // Bounded like the foreground path, so a slow recording cannot hold up
          // the live pre-rendering (CODEX QA 2026-10-24, R5).
          if (await withRecordedDeadline(fetchRecordedTts(text, 'background'))) return;
          const { data, error } = await supabase.functions.invoke('tts', { body: { text } });
          if (error || !data?.audioContent) {
            reportError('tts', 'prefetchTtsForTexts', error ?? 'empty audioContent',
              { status: httpStatusOf(error), text_len: text.length }, { skipIfOffline: true });
            return;
          }
          await storeTtsAudio(text, data.audioContent);
        } catch (err) {
          // Offline or rate-limited — nothing to do, the live path still works.
          reportError('tts', 'prefetchTtsForTexts', err, { text_len: text.length }, { skipIfOffline: true });
        }
      })
    );
  }
}
