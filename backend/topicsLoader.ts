/**
 * backend/topicsLoader.ts
 * Loads the topic list so the home screen is never held up by the network.
 *
 * Order of preference, for every call:
 *   1. memory               — already loaded this launch
 *   2. last list the server gave us (saved on the phone) — returned AT ONCE,
 *      and the server is asked again in the background for next time
 *   3. the server           — only on the very first launch, with a deadline
 *   4. the bundled list     — if the server cannot be reached
 *
 * Why (2026-10-05): the topics screen waited for the server on every launch.
 * On a slow or blocked connection that meant a long spinner for data that
 * almost never changes. The saved copy makes every launch after the first
 * instant; the background refresh keeps it current (a changed topic shows from
 * the next launch on).
 *
 * Kept free of React Native imports on purpose: storage, server and fallback
 * are passed in, so the logic can be tested on its own.
 */

export interface TopicsLoaderDeps<T> {
  /** Ask the server. Must reject on any failure (including an empty list). */
  fetchFromServer: () => Promise<T[]>;
  /** The last list saved on this phone, or null. */
  readStored: () => Promise<T[] | null>;
  /** Save a fresh list. Failures are ignored by the loader. */
  writeStored: (topics: T[]) => Promise<void>;
  /** The list shipped inside the app. */
  bundled: () => T[];
  /** Called when a server request failed (for diagnostics). */
  onServerFailure: (err: unknown) => void;
}

export function createTopicsLoader<T>(deps: TopicsLoaderDeps<T>) {
  let memory: T[] | null = null;
  let refreshing: Promise<T[] | null> | null = null;

  /** One server request at a time; resolves null (never rejects) on failure. */
  function refresh(): Promise<T[] | null> {
    if (!refreshing) {
      refreshing = deps.fetchFromServer()
        .then(async data => {
          // An empty list is never a real answer: treat it as a failure so the
          // saved copy or the bundled list is used instead of an empty screen.
          if (!Array.isArray(data) || data.length === 0) throw new Error('server returned an empty topic list');
          memory = data;
          try { await deps.writeStored(data); } catch {}
          return data;
        })
        .catch(err => {
          try { deps.onServerFailure(err); } catch {}
          return null;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function get(): Promise<T[]> {
    if (memory) return memory;

    let stored: T[] | null = null;
    try { stored = await deps.readStored(); } catch {}
    if (stored && stored.length > 0) {
      memory = stored;
      void refresh();          // keep it current for next time; nobody waits for it
      return stored;
    }

    return (await refresh()) ?? deps.bundled();
  }

  return { get };
}
