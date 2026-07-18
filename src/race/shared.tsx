import { useCallback, useEffect, useRef, useState } from "react";
import { writeTextWithTimeout } from "../services/challengeShare";

/**
 * Small pieces shared across the race-flow beats (PreRacePreview, RaceMode,
 * RaceResults) and the still-App.tsx-owned idle/home views. Kept dependency-
 * free of App.tsx to avoid a circular import (App renders RaceFlow, which
 * renders these).
 */

export function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function challengeShareUrl(challengeId: string): string {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("challenge", challengeId);
  return url.toString();
}

export function copyTextFallback(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export type ClipboardShareStatus = "idle" | "copying" | "copied" | "failed";

/**
 * Clipboard-write machinery shared by every "copy/share" affordance in the
 * race flow (challenge-link copy today, Results' composed share line). One
 * place owns the timeout + legacy-execCommand fallback + stale-request
 * guarding so beats don't reimplement it.
 */
export function useClipboardShare(text: string): {
  status: ClipboardShareStatus;
  copy: () => Promise<void>;
} {
  const [status, setStatus] = useState<ClipboardShareStatus>("idle");
  const activeText = useRef(text);
  const copyGeneration = useRef(0);
  activeText.current = text;

  useEffect(() => {
    copyGeneration.current += 1;
    setStatus("idle");
  }, [text]);

  const copy = useCallback(async () => {
    const generation = ++copyGeneration.current;
    const requestIsCurrent = () =>
      generation === copyGeneration.current && activeText.current === text;
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable.");
      }
      await writeTextWithTimeout(
        (value) => navigator.clipboard.writeText(value),
        text,
        1_200,
      );
      if (!requestIsCurrent()) return;
      setStatus("copied");
    } catch {
      if (!requestIsCurrent()) return;
      const fallbackCopied = copyTextFallback(text);
      if (!requestIsCurrent()) return;
      setStatus(fallbackCopied ? "copied" : "failed");
    }
  }, [text]);

  return { status, copy };
}

export function ChallengeShareButton({ challengeId }: { challengeId: string }) {
  const shareUrl = challengeShareUrl(challengeId);
  const { status, copy } = useClipboardShare(shareUrl);

  return (
    <div className="challenge-share">
      <button
        className="secondary-button"
        disabled={status === "copying"}
        onClick={() => void copy()}
        type="button"
      >
        Copy challenge link
      </button>
      {status !== "idle" ? (
        <span aria-live="polite" role="status">
          {status === "copying"
            ? "Copying challenge link..."
            : status === "copied"
              ? "Challenge link copied."
              : "Automatic copy was blocked. Select the link below."}
        </span>
      ) : null}
      {status === "failed" ? (
        <input
          aria-label="Challenge link"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={shareUrl}
        />
      ) : null}
    </div>
  );
}
