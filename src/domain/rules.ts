const WIKIPEDIA_ARTICLE_BASE = "https://en.wikipedia.org/wiki/";

const DISALLOWED_NAMESPACES = new Set([
  "category",
  "category talk",
  "draft",
  "draft talk",
  "education program",
  "education program talk",
  "event",
  "event talk",
  "file",
  "file talk",
  "gadget",
  "gadget definition",
  "gadget definition talk",
  "gadget talk",
  "help",
  "help talk",
  "image",
  "image talk",
  "media",
  "mediawiki",
  "mediawiki talk",
  "module",
  "module talk",
  "mos",
  "mos talk",
  "portal",
  "portal talk",
  "project",
  "project talk",
  "special",
  "talk",
  "template",
  "template talk",
  "tm",
  "timedtext",
  "timedtext talk",
  "topic",
  "user",
  "user talk",
  "wikipedia",
  "wikipedia talk",
  "wp",
  "wt",
]);

export interface WikipediaArticleTarget {
  title: string;
  sourceUrl: string;
}

export function parseWikipediaArticleTarget(
  candidate: string,
  options: { redLink?: boolean } = {},
): WikipediaArticleTarget | null {
  const trimmed = candidate.trim();
  if (!trimmed || options.redLink || trimmed.startsWith("//")) {
    return null;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https:\/\//i.test(trimmed)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed, WIKIPEDIA_ARTICLE_BASE);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "en.wikipedia.org" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.startsWith("/wiki/") ||
    url.search !== ""
  ) {
    return null;
  }

  const encodedSegments = url.pathname.slice("/wiki/".length).split("/");
  if (!encodedSegments[0]) {
    return null;
  }

  let decodedSegments: string[];
  try {
    decodedSegments = encodedSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  const title = normalizeMediaWikiTitle(decodedSegments.join("/"));
  if (!isAllowedMainspaceTitle(title)) {
    return null;
  }

  return {
    title,
    sourceUrl: wikipediaArticleUrl(title),
  };
}

export function parseWikipediaArticleInput(
  candidate: string,
): WikipediaArticleTarget | null {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith(".") ||
    trimmed.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ||
    /^(?:blob|data|file|ftp|http|https|javascript|mailto|tel|vbscript):/i.test(trimmed)
  ) {
    return parseWikipediaArticleTarget(trimmed);
  }

  let decodedSegments: string[];
  try {
    decodedSegments = trimmed
      .split("/")
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  const title = normalizeMediaWikiTitle(decodedSegments.join("/"));
  if (!isAllowedMainspaceTitle(title)) {
    return null;
  }
  return { title, sourceUrl: wikipediaArticleUrl(title) };
}

export function isAllowedArticleHref(href: string): boolean {
  return parseWikipediaArticleTarget(href) !== null;
}

export function extractTitleFromHref(href: string): string | null {
  return parseWikipediaArticleTarget(href)?.title ?? null;
}

export function wikipediaArticleUrl(title: string): string {
  const encodedTitle = title
    .split("/")
    .map((segment) => encodeURIComponent(segment.replaceAll(" ", "_")))
    .join("/");
  return `${WIKIPEDIA_ARTICLE_BASE}${encodedTitle}`;
}

export function normalizeTitle(title: string): string {
  return title.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase();
}

function normalizeMediaWikiTitle(title: string): string {
  return title.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function isAllowedMainspaceTitle(title: string): boolean {
  if (!title || /[\u0000-\u001f\u007f]/.test(title)) {
    return false;
  }
  const namespaceTitle = title.replace(/^:+\s*/, "");
  const namespace = namespaceTitle.split(":", 1)[0]?.trim().toLowerCase();
  return !namespace || !DISALLOWED_NAMESPACES.has(namespace);
}
