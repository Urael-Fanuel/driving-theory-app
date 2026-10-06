/**
 * services/bundledAudio.ts
 * System audio that ships INSIDE the app, so it plays with no connection and
 * no offline cache at all.
 *
 * Why (2026-10-06, independent review): these are the clips a non-reading
 * user needs to operate the app and to recover when something fails — the
 * mode-selection screen, the spoken numbers 1–4 that identify every answer,
 * "try again, say the number", the connection-problem and offline notices,
 * and the exam pass/fail result. They used to be downloaded on first launch
 * into the cache like everything else, so when the network or the cache was
 * the problem, the instructions explaining the problem were silent too.
 *
 * services/sound.ts plays a bundled copy whenever a request names one of these
 * files (by file name, whatever the URL), so no screen needed to change, and
 * services/audioCache.ts never downloads or keeps a second copy of them (that
 * would only spend the phone's storage).
 *
 * ⚠️ Changing one of these clips on the server does NOT change what the app
 * plays: replace the file in assets/system-audio/ too (same name), and the
 * new version ships with the next build. The copies were taken from the
 * server's audio bucket on 2026-10-06 (try_again.mp3 = the 2026-10-01 version
 * that names all four numbers).
 *
 * crowd_cheer.mp3 is deliberately NOT bundled: it is a 658 KB celebration
 * sound, not an instruction, and stays an ordinary cached file.
 *
 * Metro needs a literal require() per file — keep this map static.
 */

const BUNDLED: Record<string, number> = {
  'welcome_select_mode.mp3': require('../assets/system-audio/welcome_select_mode.mp3'),
  'explain_mode_a.mp3':      require('../assets/system-audio/explain_mode_a.mp3'),
  'explain_mode_b.mp3':      require('../assets/system-audio/explain_mode_b.mp3'),
  'selected_mode_a.mp3':     require('../assets/system-audio/selected_mode_a.mp3'),
  'selected_mode_b.mp3':     require('../assets/system-audio/selected_mode_b.mp3'),
  'home_welcome_a.mp3':      require('../assets/system-audio/home_welcome_a.mp3'),
  'exam_pass.mp3':           require('../assets/system-audio/exam_pass.mp3'),
  'exam_failed.mp3':         require('../assets/system-audio/exam_failed.mp3'),
  'tts_error_first.mp3':     require('../assets/system-audio/tts_error_first.mp3'),
  'tts_error_retry.mp3':     require('../assets/system-audio/tts_error_retry.mp3'),
  'offline_notice.mp3':      require('../assets/system-audio/offline_notice.mp3'),
  'number_1.mp3':            require('../assets/system-audio/number_1.mp3'),
  'number_2.mp3':            require('../assets/system-audio/number_2.mp3'),
  'number_3.mp3':            require('../assets/system-audio/number_3.mp3'),
  'number_4.mp3':            require('../assets/system-audio/number_4.mp3'),
  'try_again.mp3':           require('../assets/system-audio/try_again.mp3'),
};

/** File names that ship inside the app. */
export const BUNDLED_AUDIO_NAMES: ReadonlySet<string> = new Set(Object.keys(BUNDLED));

/** "…/audio/number_1.mp3?x=1" → "number_1.mp3" */
export function audioFileName(uri: string): string {
  return (uri.split('/').pop() ?? '').split('?')[0];
}

/** The bundled copy for this URL / path / cache file, or null if there is none. */
export function bundledAudioFor(uri: string | null | undefined): number | null {
  if (!uri || uri.startsWith('data:')) return null;
  return BUNDLED[audioFileName(uri)] ?? null;
}
