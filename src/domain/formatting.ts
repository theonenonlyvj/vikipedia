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

/**
 * RC-1: the race HUD's target chip sits side by side with the Run chip in
 * one flex row that must never wrap to a second line (the sticky race-hud's
 * rendered height feeds fixed scroll-margin-top values elsewhere - see the
 * ghost-HUD regression guard raceHudScrollMargin.test.ts documents). CSS
 * text-overflow: ellipsis on the chip's title element is a second line of
 * defense, but the display string itself is hard-capped here first so the
 * chip's natural (un-ellipsized) width stays predictable at every viewport.
 */
export function truncateTitle(title: string, maxLength = 16): string {
  return title.length > maxLength ? `${title.slice(0, maxLength)}…` : title;
}
