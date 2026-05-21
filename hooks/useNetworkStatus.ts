/**
 * hooks/useNetworkStatus.ts
 * Detects internet connectivity using expo-network.
 */

import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const state = await Network.getNetworkStateAsync();
        if (!cancelled) setIsConnected(!!state.isConnected && state.isInternetReachable !== false);
      } catch {
        if (!cancelled) setIsConnected(false);
      }
    }

    check();
    // 500 ms: fast enough for snappy disconnect detection without excessive battery drain.
    // (300 ms was triggering ~3 async native calls/sec; 500 ms halves that.)
    const interval = setInterval(check, 500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return isConnected;
}
