/**
 * hooks/useSponsorAdTracking.ts
 * Wires services/adEvents.ts into an ad card: attach `ref` to the card's outer
 * View, call `onClick()` for any tap on the ad and `onCall()` for the "call now"
 * button. Does nothing without an adId.
 *
 * `views: false` gives only the tap counters, for a wrapper (SponsorAdBanner)
 * whose inner AdCard already counts the view: one card, one view tracker.
 *
 * Also `useCoversAds(visible)`: a full-screen dialog calls it so no ad card under
 * it can be counted as seen while it is open.
 */
import { useCallback, useContext, useEffect, useRef } from 'react';
import { AppState, Dimensions, View } from 'react-native';
import { useFocusEffect, useSegments } from 'expo-router';
// The tab bar's height, from the same navigator expo-router's <Tabs> uses.
// Undefined outside the tab screens (a result screen has no tab bar).
import { BottomTabBarHeightContext } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEngine } from '../contexts/EngineContext';
import {
  EMPTY_FRAME, clipViewport, createViewTracker, isCoveredByOverlay, onOverlayChange, openCoveringOverlay, sendSponsorAdEvent,
} from '../services/adEvents';
import type { ViewRect } from '../services/adEvents';
import { AdClipContext } from '../components/shared/AdClip';

export function useSponsorAdTracking(adId?: string, opts: { views?: boolean } = {}) {
  const trackViews = opts.views !== false;
  const ref = useRef<View>(null);
  const segments = useSegments();
  const { engineType } = useEngine();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const focused = useRef(false);
  // The card's OWN screen, fixed when it mounts, as a route template
  // ("/result/[sessionId]", never a real session id). A later screen opened on
  // top cannot relabel it.
  const screenRef = useRef('/' + segments.join('/'));
  const engineRef = useRef<'A' | 'B' | null>(null);
  engineRef.current = engineType === 'A' || engineType === 'B' ? engineType : null;
  const edgesRef = useRef({ top: 0, bottom: 0 });
  edgesRef.current = { top: insets.top, bottom: tabBarHeight ?? insets.bottom };
  const resetRef = useRef<() => void>(() => {});
  // The scroll area holding the card, when the screen provides one (components/shared/AdClip.tsx).
  const measureClip = useContext(AdClipContext);
  const measureClipRef = useRef(measureClip);
  measureClipRef.current = measureClip;
  const clipRef = useRef<ViewRect | null>(null);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    resetRef.current();
    return () => { focused.current = false; resetRef.current(); };
  }, []));

  useEffect(() => {
    if (!adId || !trackViews) return;
    const tracker = createViewTracker({
      measure: async () => {
        // the scroll area first, then the card, so both describe the same moment
        // A screen WITH a scroll-area frame that cannot be measured right now gets an empty
        // frame (nothing visible this look), never the whole screen (CODEX round 4, R4-3).
        clipRef.current = measureClipRef.current
          ? ((await measureClipRef.current().catch(() => null)) ?? EMPTY_FRAME)
          : null;
        return new Promise<ViewRect | null>(resolve => {
          const node = ref.current;
          if (!node) { resolve(null); return; }
          node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
        });
      },
      viewport: () => {
        const { width, height } = Dimensions.get('window');
        return clipViewport(
          { top: edgesRef.current.top, bottom: height - edgesRef.current.bottom, left: 0, right: width },
          clipRef.current,
        );
      },
      isActive: () => focused.current && AppState.currentState === 'active' && !isCoveredByOverlay(),
      onSeen: () => { sendSponsorAdEvent(adId, 'view', screenRef.current, engineRef.current).catch(() => {}); },
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
    });
    resetRef.current = () => tracker.reset();
    const app = AppState.addEventListener('change', () => tracker.reset());
    const dims = Dimensions.addEventListener('change', () => tracker.reset());
    const offOverlay = onOverlayChange(() => tracker.reset());
    tracker.start();
    return () => {
      tracker.stop();
      resetRef.current = () => {};
      app.remove(); dims.remove(); offOverlay();
    };
  }, [adId, trackViews]);

  const onCall = useCallback(() => {
    if (adId) sendSponsorAdEvent(adId, 'call', screenRef.current, engineRef.current).catch(() => {});
  }, [adId]);

  // Any other tap on the ad. A tap on a button inside the card is reported by
  // that button and does not reach the card's own handler, so nothing is counted twice.
  const onClick = useCallback(() => {
    if (adId) sendSponsorAdEvent(adId, 'click', screenRef.current, engineRef.current).catch(() => {});
  }, [adId]);

  return { ref, onCall, onClick };
}

/** For a full-screen dialog: while `visible`, ad cards under it are not "seen". */
export function useCoversAds(visible: boolean) {
  useEffect(() => (visible ? openCoveringOverlay() : undefined), [visible]);
}
