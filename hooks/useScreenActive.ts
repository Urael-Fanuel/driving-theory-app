/**
 * hooks/useScreenActive.ts
 *
 * A ref that says whether this screen is still the one the learner is on: true while the
 * screen is focused, false from the moment the learner leaves it (back button, another
 * screen, unmount).
 *
 * Used by the transitions that wait for a full-screen ad (CODEX round 6, R6-4): the wait can
 * outlive the screen, and then the ad must not be shown over another screen and the old
 * "go to the next question" must not run. A ref (not state), so the check is exact at the
 * moment it is made.
 */
import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

export function useScreenActive() {
  const activeRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      return () => { activeRef.current = false; };
    }, [])
  );
  return activeRef;
}
