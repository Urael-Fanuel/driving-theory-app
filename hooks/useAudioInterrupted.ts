/**
 * hooks/useAudioInterrupted.ts
 * True while Android has paused the app's audio (phone call, another app,
 * the system assistant) although the app still wants it playing.
 *
 * Use it on any ⏸/▶️ button whose icon comes from the screen's own "playing"
 * flag:
 *   icon:  playing && !interrupted ? '⏸' : '▶️'
 *   tap:   if (interrupted) { resumeInterruptedAudio(); return; }   // first
 * Without it such a button shows ⏸ over silence, and a tap cancels the
 * sequence instead of continuing it. See services/sound.ts.
 */

import { useEffect, useState } from 'react';
import { isAudioInterrupted, onAudioInterruptedChange } from '../services/sound';

export { resumeInterruptedAudio } from '../services/sound';

export function useAudioInterrupted(): boolean {
  const [interrupted, setInterrupted] = useState(isAudioInterrupted);
  useEffect(() => {
    setInterrupted(isAudioInterrupted());   // it may have changed before mount
    return onAudioInterruptedChange(setInterrupted);
  }, []);
  return interrupted;
}
