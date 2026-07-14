export function compressPathForStrip(
  pathTitles: string[],
  targetTitle: string,
  recentCount = 3,
): string[] {
  const cleanPath = pathTitles.filter(Boolean);
  const targetIsCurrent = cleanPath.at(-1) === targetTitle;
  const fullPath = targetIsCurrent ? cleanPath : [...cleanPath, targetTitle];
  const visibleCount = targetIsCurrent ? recentCount : recentCount + 1;

  if (fullPath.length <= visibleCount) {
    return fullPath;
  }

  return ["...", ...fullPath.slice(-1 * visibleCount)];
}
