/**
 * FloatingCard.tsx
 * Shared gentle floating (translateY) animation wrapper.
 * Used on Home screens in both Engine A and Engine B.
 *
 * Each card floats up 5px and back in a smooth sine loop.
 * Staggered by index so cards don't all move together.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

interface FloatingCardProps {
  index: number;
  children: React.ReactNode;
}

export function FloatingCard({ index, children }: FloatingCardProps) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue:         -5,
            duration:         950,
            easing:           Easing.inOut(Easing.sin),
            useNativeDriver:  true,
          }),
          Animated.timing(floatAnim, {
            toValue:         0,
            duration:         950,
            easing:           Easing.inOut(Easing.sin),
            useNativeDriver:  true,
          }),
        ])
      );
      animRef.current.start();
    }, (index % 4) * 270);

    return () => {
      clearTimeout(timer);
      animRef.current?.stop();
    };
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
      {children}
    </Animated.View>
  );
}
