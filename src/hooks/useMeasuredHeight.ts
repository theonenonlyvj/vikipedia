import { useEffect, useRef, useState } from "react";

/**
 * RC-09 (owner-proxy ruling, Judge A item 4 / Judge B amendment 2): measures
 * whichever single child is currently mounted under `contentRef` so a
 * caller (IdentityPrompt's `.identity-form-viewport`) can animate a wrapper
 * element's `height` CSS property across content swaps - WITHOUT ever
 * dual-rendering the outgoing and incoming content. This hook only reads
 * layout; it has no opinion on what's mounted, so callers stay free to keep
 * their existing single-mount-at-a-time conditional rendering exactly as it
 * is (a requirement here, not a suggestion - see App.test.tsx's own
 * regression for the reachable-focus-set invariant this depends on).
 *
 * Feature-detects `ResizeObserver` (absent in jsdom - the whole reason this
 * is a real feature-detect, not an assumed global) and degrades to a
 * permanently-null height (the caller's wrapper falls back to `height:
 * auto`, i.e. no animation) rather than throwing when it's unavailable.
 */
export function useMeasuredHeight<T extends HTMLElement>() {
  const contentRef = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // Set the initial height synchronously too - ResizeObserver's own first
    // callback is guaranteed to fire (per spec, on `observe()`), but only on
    // a later microtask/frame; measuring now avoids one extra render tick
    // where the wrapper would otherwise sit at `height: auto` before its
    // first observed value arrives.
    setHeight(node.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { contentRef, height };
}
