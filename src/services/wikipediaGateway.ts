import {
  extractTitleFromHref,
  isAllowedArticleHref,
  normalizeTitle,
} from "../domain/rules";
import type { Article, ArticleLink } from "../domain/types";

const DEFAULT_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const REMOVE_SELECTORS = [
  ".navbox",
  ".vertical-navbox",
  ".metadata",
  ".reference",
  ".mw-editsection",
  ".reflist",
  ".refbegin",
  ".ambox",
  ".sistersitebox",
];

export interface WikipediaGateway {
  getArticle(title: string): Promise<Article>;
}

export function createWikipediaGateway(options: {
  fetchImpl: typeof fetch;
  endpoint?: string;
}): WikipediaGateway {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const articleCache = new Map<string, Promise<Article>>();

  return {
    async getArticle(title) {
      const cacheKey = normalizeTitle(title);
      const cached = articleCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const request = fetchArticle(options.fetchImpl, endpoint, title);
      articleCache.set(cacheKey, request);
      return request;
    },
  };
}

async function fetchArticle(
  fetchImpl: typeof fetch,
  endpoint: string,
  title: string,
): Promise<Article> {
  const url = buildParseUrl(endpoint, title);
  const response = await fetchImpl(url, {
    headers: {
      "Api-User-Agent": "Vikipedia/0.1 (local development)",
    },
  });
  if (!response.ok) {
    throw new Error(`Wikipedia fetch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as MediaWikiParseResponse;
  if (!payload.parse) {
    throw new Error("Wikipedia response did not include parse data");
  }

  const rawHtml = readParseHtml(payload.parse);
  const { html, links } = sanitizeArticleHtml(rawHtml, payload.parse.title);

  return {
    pageId: payload.parse.pageid,
    canonicalTitle: payload.parse.title,
    revisionId: payload.parse.revid,
    html,
    links,
    attribution: "Content from Wikipedia, available under CC BY-SA.",
  };
}

function buildParseUrl(endpoint: string, title: string): string {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "text|revid",
    redirects: "1",
    disableeditsection: "1",
    format: "json",
    origin: "*",
  }).toString();
  return url.toString();
}

function readParseHtml(parse: MediaWikiParsePayload): string {
  if (typeof parse.text === "string") {
    return parse.text;
  }

  const legacyText = parse.text?.["*"];
  if (typeof legacyText === "string") {
    return legacyText;
  }

  throw new Error("Wikipedia parse payload did not include article HTML");
}

function sanitizeArticleHtml(
  rawHtml: string,
  currentTitle: string,
): {
  html: string;
  links: ArticleLink[];
} {
  const document = new DOMParser().parseFromString(
    `<div class="vikipedia-article-root">${rawHtml}</div>`,
    "text/html",
  );
  const root = document.querySelector(".vikipedia-article-root");
  if (!root) {
    throw new Error("Could not parse article HTML");
  }

  for (const element of root.querySelectorAll(REMOVE_SELECTORS.join(","))) {
    element.remove();
  }

  const links: ArticleLink[] = [];
  for (const anchor of root.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!isAllowedArticleHref(href)) {
      anchor.replaceWith(document.createTextNode(anchor.textContent ?? ""));
      continue;
    }

    const title = extractTitleFromHref(href);
    if (!title) {
      anchor.replaceWith(document.createTextNode(anchor.textContent ?? ""));
      continue;
    }

    if (normalizeTitle(title) === normalizeTitle(currentTitle)) {
      anchor.replaceWith(document.createTextNode(anchor.textContent ?? ""));
      continue;
    }

    const anchorText = anchor.textContent?.trim() || title;
    links.push({
      href,
      title,
      anchorText,
      sourceSection: closestSectionTitle(anchor),
    });
    anchor.setAttribute("href", `#article:${encodeURIComponent(title)}`);
    anchor.setAttribute("data-vikipedia-title", title);
    anchor.setAttribute("data-vikipedia-href", href);
  }

  return {
    html: root.innerHTML,
    links,
  };
}

function closestSectionTitle(anchor: Element): string | undefined {
  let node: Element | null = anchor;
  while (node) {
    const heading = node.previousElementSibling;
    if (heading?.matches("h2, h3, h4")) {
      return heading.textContent?.trim() || undefined;
    }
    node = node.parentElement;
  }
  return undefined;
}

interface MediaWikiParseResponse {
  parse?: MediaWikiParsePayload;
}

interface MediaWikiParsePayload {
  title: string;
  pageid: number;
  revid?: number;
  text?: string | { "*": string };
}
