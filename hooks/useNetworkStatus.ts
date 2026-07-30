/**
 * hooks/useNetworkStatus.ts
 * Detects internet connectivity using expo-network.
 *
 * ONE shared poll for the whole app. The hook used to start its own 500 ms
 * interval per component, so every extra consumer multiplied the native calls.
 * Now the timer lives at module level and only runs while something is
 * subscribed — the target audience is on old, low-battery Android phones, and
 * the offline banner is mounted on nearly every screen.
 *
 * Public API is unchanged: call useNetworkStatus() and get a boolean.
 */

import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

/** 500 ms: fast enough for snappy disconnect detection without draining battery. */
const POLL_MS = 500;

let _isConnected = true;
let _timer: ReturnType<typeof setInterval> | null = null;
const _subscribers = new Set<(connected: boolean) => void>();

async function check(): Promise<void> {
  let connected: boolean;
  try {
    const state = await Network.getNetworkStateAsync();
    connected = !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    connected = false;
  }
  if (connected === _isConnected) return; // no change — don't re-render anyone
  _isConnected = connected;
  _subscribers.forEach(fn => fn(connected));
}

function subscribe(fn: (connected: boolean) => void): () => void {
  _subscribers.add(fn);
  if (!_timer) {
    void check();                        // immediate first reading
    _timer = setInterval(() => void check(), POLL_MS);
  }
  return () => {
    _subscribers.delete(fn);
    // Nothing is listening — stop polling entirely rather than burning battery
    // in the background.
    if (_subscribers.size === 0 && _timer) {
      clearInterval(_timer);
      _timer = null;
    }
  };
}

/** Read connectivity without subscribing (for use inside async callbacks). */
export function getIsConnected(): boolean {
  return _isConnected;
}

export function useNetworkStatus(): boolean {
  const [isConnected, setIsConnected] = useState(_isConnected);

  useEffect(() => subscribe(setIsConnected), []);

  return isConnected;
}
