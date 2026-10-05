/**
 * services/recorder.ts
 * Microphone recording for Engine A voice answers, on expo-audio.
 *
 * Replaces expo-av's `Audio.Recording` (removed from Expo in SDK 55). Keeps the
 * behaviour hooks/useVoiceRecognition.ts was tuned against:
 *   - Android: AMR-WB, 16 kHz, mono (what Google STT is asked to decode)
 *   - iOS:     16 kHz mono 16-bit PCM .wav
 *   - a level reading every `intervalMs` while recording, for silence detection
 *
 * ⚠️ METERING SCALE. expo-av computed the level as 20 * ln(amp / 32767) — the
 * NATURAL log — so its values were 2.3026 times more negative than real dBFS.
 * hooks/useVoiceRecognition.ts' SILENCE_THRESHOLD_DB (-45) was tuned on that
 * scale. expo-audio reports real dBFS (20 * log10). tick.metering below is
 * converted back to the old scale (x ln 10) so the threshold, and therefore the
 * auto-stop behaviour, is unchanged. Do not "fix" one without the other.
 */

import { Platform } from 'react-native';
import { AudioModule, AudioQuality, IOSOutputFormat } from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';

export interface RecordingTick {
  isRecording:    boolean;
  /** Level on the legacy (natural-log) dB scale; -160 or below means silence. */
  metering:       number;
  durationMillis: number;
}

/** Options as expo-audio's native recorder expects them (already flattened per platform). */
function recorderOptions(): Record<string, unknown> {
  if (Platform.OS === 'android') {
    return {
      extension:         '.amr',
      sampleRate:        16000,
      numberOfChannels:  1,
      // bitRate deliberately omitted — AMR-WB has fixed internal bitrates and
      // a value that does not match one makes MediaRecorder.prepare() fail.
      isMeteringEnabled: true,
      outputFormat:      'amrwb',
      audioEncoder:      'amr_wb',
      audioSource:       'default',   // what expo-av used
    };
  }
  return {
    extension:            '.wav',
    sampleRate:           16000,
    numberOfChannels:     1,
    bitRate:              128000,
    isMeteringEnabled:    true,
    outputFormat:         IOSOutputFormat.LINEARPCM,
    audioQuality:         AudioQuality.HIGH,
    linearPCMBitDepth:    16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat:     false,
  };
}

export class ActiveRecording {
  private rec:   AudioRecorder | null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private uri:   string | null = null;

  private constructor(rec: AudioRecorder) {
    this.rec = rec;
  }

  /** Prepare the recorder and start recording immediately. */
  static async start(onTick: (tick: RecordingTick) => void, intervalMs: number): Promise<ActiveRecording> {
    const rec = new AudioModule.AudioRecorder(recorderOptions() as any);
    try {
      await rec.prepareToRecordAsync();
      rec.record();
    } catch (err) {
      try { rec.release(); } catch {}
      throw err;
    }

    const active = new ActiveRecording(rec);
    active.timer = setInterval(() => {
      const r = active.rec;
      if (!r) return;
      try {
        const st = r.getStatus();
        onTick({
          isRecording:    st.isRecording,
          metering:       (st.metering ?? -160) * Math.LN10,   // see header
          durationMillis: st.durationMillis,
        });
      } catch {
        // A reading can fail while the recorder is being torn down — skip it.
      }
    }, intervalMs);
    return active;
  }

  /** Local URI of the recording (valid after stopAndUnload). */
  getURI(): string | null {
    return this.uri ?? this.rec?.uri ?? null;
  }

  /**
   * Stop and release the recorder. Resolves with the file's URI.
   * Rejects when the recorder produced no usable audio (e.g. stopped at once).
   */
  async stopAndUnload(): Promise<string> {
    const r = this.rec;
    if (!r) throw new Error('Cannot unload a Recording that has already been unloaded.');
    if (this.timer) { clearInterval(this.timer); this.timer = null; }

    let failure: Error | null = null;
    try {
      // Native resolves with { url, ... }; `url` is absent when the stop failed.
      const result: any = await r.stop();
      if (result && typeof result === 'object' && !('url' in result) && 'canRecord' in result) {
        failure = new Error('E_AUDIO_NODATA: no valid audio data has been received');
      }
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    }

    this.uri = r.uri || null;
    this.rec = null;
    try { r.release(); } catch {}

    if (failure) throw failure;
    if (!this.uri) throw new Error('No recording URI');
    return this.uri;
  }

  /** Stop and throw the recording away (no result wanted). */
  async cancel(): Promise<void> {
    try { await this.stopAndUnload(); } catch {}
  }
}
