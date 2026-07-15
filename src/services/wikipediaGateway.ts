import {
  normalizeTitle,
  parseWikipediaArticleInput,
  wikipediaArticleUrl,
} from "../domain/rules";
import type { Article } from "../domain/types";
import {
  sanitizeWikipediaArticleHtml,
  type SanitizedWikipediaArticle,
} from "./wikipediaSanitizer";

const DEFAULT_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const DEFAULT_RULESET = "ranked_classic";
export const WIKIMEDIA_API_USER_AGENT =
  "VWiki Race/0.0 (https://vwikirace.pages.dev; contact: https://github.com/theonenonlyvj/vwiki-race)";

export interface GetWikipediaArticleOptions {
  revisionId?: number;
  ruleset?: string;
  signal?: AbortSignal;
}

export interface WikipediaGateway {
  getArticle(title: string, options?: GetWikipediaArticleOptions): Promise<Article>;
  clear(): void;
}

export class WikipediaGatewayError extends Error {
  constructor(
    readonly code:
      | "bad_status"
      | "invalid_article"
      | "invalid_response"
      | "request_failed",
    message: string,
    readonly status: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WikipediaGatewayError";
  }
}

interface CacheEntry {
  controller: AbortController;
  promise: Promise<Article>;
  settled: boolean;
  subscribers: Set<symbol>;
}

export function createWikipediaGateway(options: {
  fetchImpl: typeof fetch;
  endpoint?: string;
  sanitizeHtml?: (
    rawHtml: string,
    currentTitle: string,
  ) => SanitizedWikipediaArticle;
}): WikipediaGateway {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const sanitizeHtml = options.sanitizeHtml ?? sanitizeWikipediaArticleHtml;
  const articleCache = new Map<string, CacheEntry>();
  const activeEntries = new Set<CacheEntry>();
  let generation = 0;

  return {
    clear() {
      generation += 1;
      const entries = new Set(activeEntries);
      articleCache.clear();
      for (const entry of entries) {
        entry.controller.abort();
      }
    },

    getArticle(title, requestOptions = {}) {
      const normalizedTitle = normalizeTitle(title);
      if (!normalizedTitle) {
        return Promise.reject(
          new WikipediaGatewayError("invalid_article", "Wikipedia title is required."),
        );
      }
      if (
        requestOptions.revisionId !== undefined &&
        (!Number.isSafeInteger(requestOptions.revisionId) || requestOptions.revisionId < 1)
      ) {
        return Promise.reject(
          new WikipediaGatewayError(
            "invalid_article",
            "Wikipedia revision id must be a positive integer.",
          ),
        );
      }
      if (requestOptions.signal?.aborted) {
        return Promise.reject(abortError());
      }

      const ruleset = requestOptions.ruleset?.trim() || DEFAULT_RULESET;
      const cacheKey = articleCacheKey(
        normalizedTitle,
        requestOptions.revisionId,
        ruleset,
      );
      const cached = articleCache.get(cacheKey);
      if (cached?.controller.signal.aborted) {
        evictEntry(articleCache, cached);
      } else if (cached) {
        return subscribeToEntry(cached, requestOptions.signal);
      }

      const requestGeneration = generation;
      const controller = new AbortController();

      let entry!: CacheEntry;
      const articleRequest = raceWithAbort(
        fetchArticle({
          endpoint,
          fetchImpl: options.fetchImpl,
          revisionId: requestOptions.revisionId,
          sanitizeHtml,
          signal: controller.signal,
          title,
        }),
        controller.signal,
      )
        .then((article) => {
          if (controller.signal.aborted || generation !== requestGeneration) {
            throw abortError();
          }
          entry.settled = true;
          if (articleCache.get(cacheKey) === entry) {
            for (const aliasKey of articleAliasCacheKeys(
              article,
              requestOptions.revisionId,
              ruleset,
            )) {
              if (!articleCache.has(aliasKey) || articleCache.get(aliasKey) === entry) {
                articleCache.set(aliasKey, entry);
              }
            }
          }
          return article;
        })
        .catch((caught: unknown) => {
          evictEntry(articleCache, entry);
          if (controller.signal.aborted || generation !== requestGeneration) {
            throw abortError();
          }
          throw normalizeGatewayError(caught);
        })
        .finally(() => {
          activeEntries.delete(entry);
        });

      entry = {
        controller,
        promise: articleRequest,
        settled: false,
        subscribers: new Set(),
      };
      activeEntries.add(entry);
      articleCache.set(cacheKey, entry);
      return subscribeToEntry(entry, requestOptions.signal);
    },
  };
}

async function fetchArticle(options: {
  endpoint: string;
  fetchImpl: typeof fetch;
  revisionId?: number;
  sanitizeHtml: (
    rawHtml: string,
    currentTitle: string,
  ) => SanitizedWikipediaArticle;
  signal: AbortSignal;
  title: string;
}): Promise<Article> {
  const url = buildParseUrl(options.endpoint, options.title, options.revisionId);
  const fetchImpl = options.fetchImpl;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        "Api-User-Agent": WIKIMEDIA_API_USER_AGENT,
      },
      signal: options.signal,
    });
  } catch (caught) {
    if (options.signal.aborted || isAbortError(caught)) {
      throw abortError();
    }
    throw new WikipediaGatewayError(
      "request_failed",
      "Could not load that Wikipedia article.",
      null,
      { cause: caught },
    );
  }

  if (options.signal.aborted) {
    throw abortError();
  }
  if (!response.ok) {
    throw new WikipediaGatewayError(
      "bad_status",
      `Wikipedia fetch failed with status ${response.status}.`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (caught) {
    throw new WikipediaGatewayError(
      "invalid_response",
      "Wikipedia returned an invalid article response.",
      502,
      { cause: caught },
    );
  }
  if (options.signal.aborted) {
    throw abortError();
  }

  const parse = readParsePayload(payload);
  const canonicalTarget = parseWikipediaArticleInput(parse.canonicalTitle);
  if (!canonicalTarget) {
    throw new WikipediaGatewayError(
      "invalid_response",
      "Wikipedia returned a non-article destination.",
      502,
    );
  }
  if (
    options.revisionId !== undefined &&
    parse.revisionId !== options.revisionId
  ) {
    throw new WikipediaGatewayError(
      "invalid_response",
      "Wikipedia returned a different article revision than requested.",
      502,
    );
  }

  let sanitized: SanitizedWikipediaArticle;
  try {
    sanitized = options.sanitizeHtml(parse.rawHtml, parse.canonicalTitle);
  } catch (caught) {
    throw new WikipediaGatewayError(
      "invalid_response",
      "Wikipedia returned article HTML that could not be processed.",
      502,
      { cause: caught },
    );
  }

  const sourceUrl = wikipediaArticleUrl(canonicalTarget.title);
  return {
    attribution: `Wikipedia revision ${parse.revisionId}, available under CC BY-SA 4.0.`,
    attributionUrl: revisionAttributionUrl(
      canonicalTarget.title,
      parse.revisionId,
    ),
    canonicalTitle: canonicalTarget.title,
    links: sanitized.links,
    pageId: parse.pageId,
    revisionId: parse.revisionId,
    sanitizedHtml: sanitized.sanitizedHtml,
    sourceUrl,
  };
}

function buildParseUrl(
  endpoint: string,
  title: string,
  revisionId?: number,
): string {
  const url = new URL(endpoint);
  const search = new URLSearchParams({
    action: "parse",
    disableeditsection: "1",
    format: "json",
    formatversion: "2",
    origin: "*",
    prop: "text|revid",
    redirects: "1",
  });
  if (revisionId === undefined) {
    search.set("page", title);
  } else {
    search.set("oldid", String(revisionId));
  }
  url.search = search.toString();
  return url.toString();
}

function readParsePayload(payload: unknown): {
  canonicalTitle: string;
  pageId: number;
  rawHtml: string;
  revisionId: number;
} {
  if (!isRecord(payload) || !isRecord(payload.parse)) {
    throw new WikipediaGatewayError(
      "invalid_response",
      "Wikipedia response did not include parse data.",
      502,
    );
  }

  const parse = payload.parse;
  const canonicalTitle =
    typeof parse.title === "string" ? parse.title.trim() : "";
  const rawHtml =
    typeof parse.text === "string"
      ? parse.text
      : isRecord(parse.text) && typeof parse.text["*"] === "string"
        ? parse.text["*"]
        : null;
  if (
    !canonicalTitle ||
    !Number.isSafeInteger(parse.pageid) ||
    Number(parse.pageid) < 1 ||
    !Number.isSafeInteger(parse.revid) ||
    Number(parse.revid) < 1 ||
    rawHtml === null
  ) {
    throw new WikipediaGatewayError(
      "invalid_response",
      "Wikipedia returned incomplete article metadata.",
      502,
    );
  }

  return {
    canonicalTitle,
    pageId: Number(parse.pageid),
    rawHtml,
    revisionId: Number(parse.revid),
  };
}

function revisionAttributionUrl(title: string, revisionId: number): string {
  const url = new URL("https://en.wikipedia.org/w/index.php");
  url.search = new URLSearchParams({
    title,
    oldid: String(revisionId),
  }).toString();
  return url.toString();
}

function articleCacheKey(
  normalizedTitle: string,
  revisionId: number | undefined,
  ruleset: string,
): string {
  return `${ruleset}\u0000${revisionId ?? "latest"}\u0000${normalizedTitle}`;
}

function articleAliasCacheKeys(
  article: Article,
  requestedRevisionId: number | undefined,
  ruleset: string,
): string[] {
  const canonicalTitle = normalizeTitle(article.canonicalTitle);
  return [
    articleCacheKey(canonicalTitle, requestedRevisionId, ruleset),
    articleCacheKey(canonicalTitle, article.revisionId, ruleset),
  ];
}

function evictEntry(cache: Map<string, CacheEntry>, entry: CacheEntry): void {
  for (const [key, value] of cache) {
    if (value === entry) {
      cache.delete(key);
    }
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (caught: unknown) => {
        cleanup();
        reject(caught);
      },
    );
  });
}

function subscribeToEntry(
  entry: CacheEntry,
  signal?: AbortSignal,
): Promise<Article> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  const subscriber = Symbol("wikipedia-request-subscriber");
  entry.subscribers.add(subscriber);
  return new Promise<Article>((resolve, reject) => {
    let finished = false;
    const finish = (aborted: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      signal?.removeEventListener("abort", handleAbort);
      entry.subscribers.delete(subscriber);
      if (aborted && !entry.settled && entry.subscribers.size === 0) {
        entry.controller.abort();
      }
    };
    const handleAbort = () => {
      finish(true);
      reject(abortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    entry.promise.then(
      (article) => {
        finish(false);
        resolve(article);
      },
      (caught: unknown) => {
        finish(false);
        reject(caught);
      },
    );
  });
}

function abortError(): Error {
  const error = new Error("The Wikipedia request was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(caught: unknown): caught is Error {
  return caught instanceof Error && caught.name === "AbortError";
}

function normalizeGatewayError(caught: unknown): Error {
  if (caught instanceof WikipediaGatewayError || isAbortError(caught)) {
    return caught;
  }
  return new WikipediaGatewayError(
    "request_failed",
    "Could not load that Wikipedia article.",
    null,
    { cause: caught },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
