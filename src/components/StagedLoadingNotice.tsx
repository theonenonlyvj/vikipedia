import {
  useStagedLoading,
  type StagedLoadingThresholds,
} from "../hooks/useStagedLoading";

/**
 * RC-06 ("One honest loading/error system"): the shared RENDER half of the
 * staged-loading primitive (see useStagedLoading.ts's own doc comment for
 * the timing half) - every data gate this package stages (Boards' daily
 * board, Challenge Detail's LeaderboardList, You's account stats, RaceFlow's
 * preview interstitial) renders this exact copy/markup shape instead of five
 * hand-rolled variants, so the escalation reads as one system (Judge A
 * amendment 4).
 *
 * Renders nothing for the first `showAfterMs` (the caller is expected to
 * already be showing last-known content or its own skeleton shape for that
 * window - this component only ever owns the "still nothing to show, and
 * it's been a while" copy). At `showAfterMs` it says so plainly; at
 * `escalateAfterMs` it stops pretending this might resolve any second now
 * and offers a manual way out.
 */
export default function StagedLoadingNotice({
  active,
  className = "muted",
  onRetry,
  pendingLabel,
  thresholds,
}: {
  /** True while a fetch is genuinely in flight with nothing to show yet. */
  active: boolean;
  className?: string;
  /** Offered only once truly stalled (>= escalateAfterMs) - never sooner. */
  onRetry?: () => void;
  pendingLabel: string;
  thresholds?: StagedLoadingThresholds;
}) {
  const stage = useStagedLoading(active, thresholds);

  if (stage === "hidden") return null;

  return (
    <p className={className}>
      {stage === "stalled" ? "Still working on it…" : pendingLabel}
      {stage === "stalled" && onRetry ? (
        <>
          {" "}
          <button onClick={onRetry} type="button">
            Retry
          </button>
        </>
      ) : null}
    </p>
  );
}
