/**
 * AGENT 5 — hooks/useVideoPlayer.ts
 * Video playback state management for Engine A.
 *
 * Manages:
 * - Playback state (playing/paused/ended/error)
 * - Progress tracking (watched 80%+ = "viewed")
 * - Auto-advance to quiz when video ends
 * - Replay functionality
 */

import { useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoPlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export interface UseVideoPlayerReturn {
  playbackState: VideoPlaybackState;
  progress: number;         // 0-1, how much of video has been watched
  hasWatchedEnough: boolean; // true if watched > 80%
  isEnded: boolean;

  onLoad: () => void;
  onProgress: (position: number, duration: number) => void;
  onEnd: () => void;
  onError: () => void;
  onPauseToggle: () => void;
  onReplay: () => void;

  // For parent component to subscribe to events
  onVideoViewed: (() => void) | null;
  setOnVideoViewed: (cb: () => void) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEWED_THRESHOLD = 0.8; // 80% of video = "viewed"

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVideoPlayer(): UseVideoPlayerReturn {
  const [playbackState, setPlaybackState] = useState<VideoPlaybackState>('loading');
  const [progress,      setProgress]      = useState(0);
  const [hasWatchedEnough, setHasWatchedEnough] = useState(false);
  const [isEnded,       setIsEnded]       = useState(false);

  const onVideoViewedRef  = useRef<(() => void) | null>(null);
  const viewedFiredRef    = useRef(false);

  const setOnVideoViewed = useCallback((cb: () => void) => {
    onVideoViewedRef.current = cb;
  }, []);

  const onLoad = useCallback(() => {
    setPlaybackState('playing');
  }, []);

  const onProgress = useCallback((position: number, duration: number) => {
    if (duration <= 0) return;
    const pct = position / duration;
    setProgress(pct);

    // Fire "viewed" callback once when threshold reached
    if (pct >= VIEWED_THRESHOLD && !viewedFiredRef.current) {
      viewedFiredRef.current = true;
      setHasWatchedEnough(true);
      onVideoViewedRef.current?.();
    }
  }, []);

  const onEnd = useCallback(() => {
    setPlaybackState('ended');
    setIsEnded(true);
    setProgress(1);

    // Mark as viewed on end
    if (!viewedFiredRef.current) {
      viewedFiredRef.current = true;
      setHasWatchedEnough(true);
      onVideoViewedRef.current?.();
    }
  }, []);

  const onError = useCallback(() => {
    setPlaybackState('error');
  }, []);

  const onPauseToggle = useCallback(() => {
    setPlaybackState(prev =>
      prev === 'playing' ? 'paused' : 'playing'
    );
  }, []);

  const onReplay = useCallback(() => {
    setPlaybackState('loading');
    setProgress(0);
    setIsEnded(false);
    viewedFiredRef.current = false;
    setHasWatchedEnough(false);
  }, []);

  return {
    playbackState,
    progress,
    hasWatchedEnough,
    isEnded,
    onLoad,
    onProgress,
    onEnd,
    onError,
    onPauseToggle,
    onReplay,
    onVideoViewed: onVideoViewedRef.current,
    setOnVideoViewed,
  };
}
