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
    const interval = setInterval(check, 300);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return isConnected;
}
