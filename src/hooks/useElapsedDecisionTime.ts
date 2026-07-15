import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_MS = 100;
const defaultNow = () => performance.now();

export function useElapsedDecisionTime(options: {
  active: boolean;
  now?: () => number;
}) {
  const now = options.now ?? defaultNow;
  const baseMs = useRef(0);
  const startedAt = useRef<number | null>(null);
  const mounted = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const readElapsed = useCallback(() => {
    if (startedAt.current === null) return baseMs.current;
    return baseMs.current + Math.max(0, now() - startedAt.current);
  }, [now]);

  const refresh = useCallback(() => {
    if (mounted.current) setElapsedMs(Math.round(readElapsed()));
  }, [readElapsed]);

  const reset = useCallback((value = 0) => {
    baseMs.current = Math.max(0, value);
    startedAt.current = options.active ? now() : null;
    if (mounted.current) setElapsedMs(Math.round(baseMs.current));
  }, [now, options.active]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!options.active) {
      if (startedAt.current !== null) {
        baseMs.current = readElapsed();
        startedAt.current = null;
      }
      if (mounted.current) setElapsedMs(Math.round(baseMs.current));
      return;
    }

    if (startedAt.current === null) {
      startedAt.current = now();
    }
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      if (startedAt.current !== null) {
        baseMs.current = readElapsed();
        startedAt.current = null;
      }
    };
  }, [now, options.active, readElapsed, refresh]);

  return { elapsedMs, readElapsed, refresh, reset };
}
