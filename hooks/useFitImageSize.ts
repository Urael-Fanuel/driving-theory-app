/**
 * hooks/useFitImageSize.ts
 *
 * Engine A question screens stack a sign image, the question dots, the audio row,
 * the 2x2 answer cards and the 🎤 button. On a typical phone that is a little
 * taller than the screen, so the 🎤 button (the main control for users who cannot
 * read) sat below the fold and had to be scrolled to every single time.
 *
 * This keeps the screen as scrollable as before, but makes the image just small
 * enough that everything fits when the phone can manage it. It measures instead
 * of guessing: if the content is taller than the visible area, the image gives up
 * exactly that much height (never below `min`). It only ever SHRINKS: the 🎤
 * button disappears after an answer, and growing the image back then would make
 * the layout jump.
 *
 * Usage (inside the screen):
 *   const fit = useFitImageSize(200);
 *   <ScrollView onLayout={e => fit.onLayout(e, hasImage)}
 *               onContentSizeChange={(_w, h) => fit.onContent(h, hasImage)} ...>
 *   <View style={[styles.signImageContainer, fit.style]}>
 * `hasImage` must be true only while an image is on screen, otherwise shrinking
 * it would change nothing.
 */
import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export function useFitImageSize(max: number, min = 120) {
  const [size, setSize] = useState(max);
  const viewportH = useRef(0);
  const contentH  = useRef(0);

  const refit = useCallback((active: boolean) => {
    if (!active || !viewportH.current || !contentH.current) return;
    const overflow = contentH.current - viewportH.current;
    if (overflow <= 1) return;                       // fits: leave it alone
    setSize(cur => {
      const next = Math.max(min, Math.floor(cur - overflow));
      return next < cur ? next : cur;
    });
  }, [min]);

  const onLayout = useCallback((e: LayoutChangeEvent, active: boolean) => {
    viewportH.current = e.nativeEvent.layout.height;
    refit(active);
  }, [refit]);

  const onContent = useCallback((h: number, active: boolean) => {
    contentH.current = h;
    refit(active);
  }, [refit]);

  return { size, style: { width: size, height: size }, onLayout, onContent };
}
