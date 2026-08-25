"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ClientDataResult<T> {
  /** Loaded value; null until the client has mounted and read the store */
  data: T | null;
  /** false during SSR and the first render, true after the load effect ran */
  ready: boolean;
  /** Re-run the loader (e.g. after a delete) */
  refresh: () => void;
}

/**
 * Read client-persisted data (localStorage-backed services) safely:
 * - SSR never touches localStorage — first render is deterministic
 *   ({ data: null, ready: false }), so there is no hydration mismatch;
 * - data is loaded once after mount;
 * - refresh() re-reads it on demand.
 */
function useClientData<T>(loader: () => T): ClientDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);

  // Keep the latest loader without making the load effect depend on its identity
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    setData(loaderRef.current());
    setReady(true);
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, ready, refresh };
}

export { useClientData };
export type { ClientDataResult };
