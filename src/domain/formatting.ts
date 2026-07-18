/**
 * Invariant 1 formatter ("Time AND clicks, always... `0:38 · 5 clk`", UX
 * redesign spec, Global invariants #1). This is the one source of truth for
 * that string wherever a run's outcome is summarized - Results today, and
 * Boards/Home/Challenges as they land in later increments.
 */
export function formatMinutesSeconds(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatTimeAndClicks(elapsedMs: number, clicks: number): string {
  return `${formatMinutesSeconds(elapsedMs)} · ${clicks} clk`;
}
