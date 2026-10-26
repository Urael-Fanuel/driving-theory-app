/**
 * components/shared/AdClip.tsx
 *
 * Tells the sponsor-ad view counter (hooks/useSponsorAdTracking.ts) where the real
 * edges of the scroll area holding an ad card are, so a card hidden under a header or
 * below the bottom buttons is not counted as seen (CODEX round 2/3, A4).
 *
 * It adds NO view and NO layout: it only provides, through React context, a way to
 * measure the screen's own ScrollView or FlatList (passed in `target`).
 *
 *   const listRef = useRef<any>(null);
 *   <AdClip target={listRef}>
 *     <ScrollView ref={listRef}> ... <AdCard adId=... /> ... </ScrollView>
 *   </AdClip>
 */
import React, { createContext, useCallback } from 'react';

export interface ClipRect { x: number; y: number; width: number; height: number }

/** Measures the visible frame of the scroll area, in window coordinates; null when it cannot. */
export const AdClipContext = createContext<(() => Promise<ClipRect | null>) | null>(null);

export function AdClip({ target, children }: { target: React.RefObject<any>; children: React.ReactNode }) {
  const measure = useCallback(() => new Promise<ClipRect | null>(resolve => {
    try {
      let node = target.current;
      if (node && typeof node.getNativeScrollRef === 'function') node = node.getNativeScrollRef();   // FlatList
      if (!node || typeof node.measureInWindow !== 'function') { resolve(null); return; }
      node.measureInWindow((x: number, y: number, width: number, height: number) => resolve({ x, y, width, height }));
    } catch {
      resolve(null);
    }
  }), [target]);
  return <AdClipContext.Provider value={measure}>{children}</AdClipContext.Provider>;
}
