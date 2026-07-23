export function compressPathForStrip(
  pathTitles: string[],
  targetTitle: string,
  recentCount = 3,
): string[] {
  const cleanPath = pathTitles.filter(Boolean);
  // MB-1 Part 3 (old-Safari compat): Array.prototype.at is Safari 15.4+.
  const targetIsCurrent = cleanPath[cleanPath.length - 1] === targetTitle;
  const visitedBeforeTarget = targetIsCurrent ? cleanPath.slice(0, -1) : cleanPath;
  const fullPath = [...visitedBeforeTarget, targetTitle];
  const visibleCount = recentCount + 1;

  if (fullPath.length <= visibleCount) {
    return fullPath;
  }

  return ["...", ...visitedBeforeTarget.slice(-recentCount), targetTitle];
}
