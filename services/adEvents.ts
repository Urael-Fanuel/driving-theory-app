/**
 * services/adEvents.ts
 *
 * Counting views and presses of OUR OWN sponsor ads (driving instructors)
 * so a sponsor can be shown real numbers. Google AdMob banners are not counted
 * here: AdMob reports those itself.
 *
 * Three parts:
 *   - sendSponsorAdEvent: one insert into sponsor_ad_events. Fire-and-forget:
 *     a failure or no connection just means one event is not counted. It never
 *     reaches the learner and never delays anything. The server adds the city
 *     (backend/migration_sponsor_ad_events.sql); the app sends none, only which
 *     location the user allows right now (city_source, see locationSource).
 *   - createViewTracker: decides when an ad card counts as SEEN. Pure logic
 *     (clock and measurements are passed in) so it can be tested.
 *   - the covering-overlay registry: a full-screen dialog (location, disclaimer,
 *     video) that is open hides every ad card under it.
 *
 * A view = at least half of the card inside the visible part of the screen for
 * one second, measured from the first time it was SEEN there (never credited
 * for time before that), while its screen is in front, the app is in the
 * foreground and no dialog covers it. Anything that changes in between (screen
 * left, app backgrounded, dialog opened, rotation) starts the second over.
 * Counted once per mount of the card.
 * A click = any tap on the ad (its text, its picture, a 🔊 button that plays it).
 * A call = the tap on "call now" specifically (the most valuable click). A report
 * shows clicks as click + call, and calls on their own.
 */
import { supabase } from '../backend/supabaseClient';
import { reportError, errorText } from './errorReporter';
import { getLocationConsentState } from '../hooks/useLocationPrompt';

export type SponsorAdEvent = 'view' | 'click' | 'call';

/**
 * Which stored city the server may copy into the event, read from the user's
 * own location answer at the moment the event is sent:
 *   'gps'  user said yes: only their GPS city (users.city), never the IP estimate
 *   'ip'   never asked yet: GPS city if any, else the coarse IP city
 *   'none' user said no: no city at all, even if an IP city is still on the
 *          server because its wipe has not gone through yet
 * The "no" is saved on the phone before the wipe is even tried
 * (useLocationPrompt handleNotNow), so every event sent after it carries 'none'.
 * An event sent BEFORE the "no" (its request already on the way) keeps the
 * answer it was sent with: it happened before the decision.
 */
export type CitySource = 'gps' | 'ip' | 'none';

export async function locationSource(): Promise<CitySource> {
  try {
    const state = await getLocationConsentState();
    return state === 'approved' ? 'gps' : state === 'unknown' ? 'ip' : 'none';
  } catch {
    return 'none';   // cannot tell: the safe answer
  }
}

export async function sendSponsorAdEvent(
  adId: string,
  event: SponsorAdEvent,
  screen: string,
  engine: 'A' | 'B' | null,
): Promise<boolean> {
  if (!adId) return false;
  try {
    const city_source = await locationSource();
    const { error } = await (supabase.from('sponsor_ad_events') as any)
      .insert({ ad_id: adId, event, screen: screen.slice(0, 80), engine, city_source });
    if (error) throw error;
    return true;
  } catch (err) {
    // Offline is normal and uninteresting; anything else is worth knowing.
    reportError('api', 'sendSponsorAdEvent', errorText(err), { event }, { skipIfOffline: true });
    return false;
  }
}

// ─── dialogs that cover ad cards ──────────────────────────────────────────────

const covering = new Set<object>();
const coverListeners = new Set<() => void>();

/** A full-screen dialog opened (returns the function that closes it). */
export function openCoveringOverlay(): () => void {
  const token = {};
  covering.add(token);
  coverListeners.forEach(fn => { try { fn(); } catch {} });
  return () => {
    if (!covering.delete(token)) return;
    coverListeners.forEach(fn => { try { fn(); } catch {} });
  };
}

export function isCoveredByOverlay(): boolean { return covering.size > 0; }

/** Called whenever a dialog opens or closes. Returns the unsubscribe. */
export function onOverlayChange(fn: () => void): () => void {
  coverListeners.add(fn);
  return () => { coverListeners.delete(fn); };
}

// ─── when does an ad count as seen ────────────────────────────────────────────

export interface ViewRect { x: number; y: number; width: number; height: number }

/** The part of the window that can actually show content (no status bar, no tab bar). */
export interface Viewport { top: number; bottom: number; left: number; right: number }

export interface ViewTrackerOptions {
  /** Where the card is in the window right now; null when it cannot be measured. */
  measure:      () => Promise<ViewRect | null>;
  viewport:     () => Viewport;
  /** Screen in front, app in the foreground and no dialog over it. */
  isActive:     () => boolean;
  onSeen:       () => void;
  now:          () => number;
  setTimeout:   (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  stepMs?:      number;   // how often it looks (default 250)
  maxGapMs?:    number;   // looks further apart than this do not join into one exposure (default 2 x stepMs)
  needMs?:      number;   // how long it must stay visible (default 1000)
  minVisible?:  number;   // share of the card that must be inside (default 0.5)
  measureTimeoutMs?: number;   // a measurement that never answers counts as "not visible" (default 1000)
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Share (0..1) of the card's area inside the viewport, in both directions. */
export function visibleShare(rect: ViewRect | null, vp: Viewport): number {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(finite)) return 0;
  if (rect.width <= 0 || rect.height <= 0) return 0;
  if (![vp.top, vp.bottom, vp.left, vp.right].every(finite)) return 0;
  const w = Math.min(rect.x + rect.width, vp.right) - Math.max(rect.x, vp.left);
  const h = Math.min(rect.y + rect.height, vp.bottom) - Math.max(rect.y, vp.top);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (rect.width * rect.height);
}

/**
 * The visible part of the screen narrowed to the scroll area that holds the card
 * (components/shared/AdClip.tsx), so a card under a header or below the bottom buttons
 * is not "visible" just because it is inside the window (CODEX round 2/3, A4).
 *   clip === null  -> the screen has NO scroll-area frame: its own visible part is used.
 *   a frame that is empty or unusable (zero size, not a number) -> NOTHING is visible:
 *   a frame that cannot show anything must not widen what counts (CODEX round 4, R4-3).
 * The hook (useSponsorAdTracking) passes an empty frame when a screen HAS a frame but it
 * could not be measured, so only "no frame at all" falls back to the whole screen.
 */
export const EMPTY_FRAME: ViewRect = { x: 0, y: 0, width: 0, height: 0 };

export function clipViewport(vp: Viewport, clip: ViewRect | null): Viewport {
  if (!clip) return vp;
  if (![clip.x, clip.y, clip.width, clip.height].every(finite) || clip.width <= 0 || clip.height <= 0) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  return {
    top:    Math.max(vp.top, clip.y),
    bottom: Math.min(vp.bottom, clip.y + clip.height),
    left:   Math.max(vp.left, clip.x),
    right:  Math.min(vp.right, clip.x + clip.width),
  };
}

export function createViewTracker(o: ViewTrackerOptions) {
  // Looks about 4 times a second. The next look is scheduled after a measurement ends, so
  // a slow measurement makes the looks further apart; therefore two visible looks more than
  // maxGap apart are NOT joined into one exposure: the second starts over (CODEX round 4,
  // R4-2). The true rule: a card away for more than maxGap (default half a second) always
  // restarts the second; a shorter absence between two looks can be missed.
  const step = o.stepMs ?? 250;
  const maxGap = o.maxGapMs ?? step * 2;
  const need = o.needMs ?? 1000;
  const min = o.minVisible ?? 0.5;
  const measureTimeout = o.measureTimeoutMs ?? 1000;
  let since: number | null = null;   // first moment it was SEEN visible in this unbroken run
  let lastSeen: number | null = null; // the previous visible look of this run
  let generation = 0;                // bumped by reset(): an older measurement no longer counts
  let timer: unknown = null;
  let done = false;
  let stopped = false;

  const measureBounded = () => new Promise<ViewRect | null>(resolve => {
    let settled = false;
    const t = o.setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, measureTimeout);
    o.measure().then(
      r => { if (!settled) { settled = true; o.clearTimeout(t); resolve(r); } },
      () => { if (!settled) { settled = true; o.clearTimeout(t); resolve(null); } },
    );
  });

  const tick = async () => {
    timer = null;
    if (done || stopped) return;
    const gen = generation;
    let visible = false;
    try {
      if (o.isActive()) {
        const rect = await measureBounded();
        // Re-checked AFTER the measurement: the screen may have been left or the
        // app backgrounded while it was being measured.
        visible = o.isActive() && visibleShare(rect, o.viewport()) >= min;
      }
    } catch {
      visible = false;
    }
    if (done || stopped) return;
    if (gen !== generation) visible = false;   // something changed while measuring
    const t = o.now();
    if (!visible) { since = null; lastSeen = null; }
    else if (since === null || lastSeen === null || t - lastSeen > maxGap) { since = t; lastSeen = t; }
    else {
      lastSeen = t;
      if (t - since >= need) { done = true; o.onSeen(); return; }
    }
    timer = o.setTimeout(tick, step);
  };

  return {
    start() { if (!timer && !done && !stopped) timer = o.setTimeout(tick, step); },
    stop()  { stopped = true; if (timer) o.clearTimeout(timer); timer = null; },
    /** Screen left/returned, app backgrounded/foregrounded, dialog, rotation: start the second over. */
    reset() { generation++; since = null; lastSeen = null; },
    get seen() { return done; },
  };
}
