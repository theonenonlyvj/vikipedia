export function compressPathForStrip(
  pathTitles: string[],
  targetTitle: string,
  recentCount = 3,
): string[] {
  const cleanPath = pathTitles.filter(Boolean);
  const targetIsCurrent = cleanPath.at(-1) === targetTitle;
  const visitedBeforeTarget = targetIsCurrent ? cleanPath.slice(0, -1) : cleanPath;
  const fullPath = [...visitedBeforeTarget, targetTitle];
  const visibleCount = recentCount + 1;

  if (fullPath.length <= visibleCount) {
    return fullPath;
  }

  return ["...", ...visitedBeforeTarget.slice(-recentCount), targetTitle];
}
