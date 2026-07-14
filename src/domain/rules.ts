const DISALLOWED_NAMESPACES = new Set([
  "category",
  "file",
  "help",
  "module",
  "portal",
  "special",
  "talk",
  "template",
  "user",
  "wikipedia",
]);

export function isAllowedArticleHref(href: string): boolean {
  return extractTitleFromHref(href) !== null;
}

export function extractTitleFromHref(href: string): string | null {
  if (!href.startsWith("/wiki/")) {
    return null;
  }

  const rawTitle = href.slice("/wiki/".length).split("#")[0];
  if (!rawTitle || rawTitle.includes("/")) {
    return null;
  }

  const decodedTitle = decodeURIComponent(rawTitle).replaceAll("_", " ");
  const namespace = decodedTitle.split(":", 1)[0]?.toLowerCase();
  if (namespace && DISALLOWED_NAMESPACES.has(namespace)) {
    return null;
  }

  return decodedTitle;
}

export function normalizeTitle(title: string): string {
  return title.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase();
}
