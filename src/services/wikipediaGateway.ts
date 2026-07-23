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

// MB-1 Part 2: the article fetch used to carry no timeout at all - a
// stalled connection on a bad mobile network hung `fetchArticle` (and every
// awaiter of it - see followLink in useRaceController.ts) forever, wedging
// phase="syncing" with no way out. Mirrors the shipped login leash
// (apiRequest.ts firstAttemptTimeoutMs, commit 6d54452): a short first
// attempt, one automatic retry with the full budget (this is the biggest
// single payload the app fetches on a slow phone, so the retry gets more
// room than a plain API read), then a real, honest failure that lets the
// caller revert out of "syncing" instead of hanging.
const ARTICLE_FIRST_ATTEMPT_TIMEOUT_MS = 5_000;
const ARTICLE_RETRY_TIMEOUT_MS = 15_000;
const ARTICLE_RETRY_DELAY_MS = 250;

export interface GetWikipediaArticleOptions {
  revisionId?: number;
  ruleset?: string;
  signal?: AbortSignal;
  /** Notified once, only when the FIRST attempt stalls past
   *  ARTICLE_FIRST_ATTEMPT_TIMEOUT_MS and the automatic retry starts - lets
   *  a caller with a "loading..." affordance switch to honest "still
   *  loading" copy instead of an unchanging spinner (see useRaceController's
   *  navigationRetrying). Multiple concurrent callers deduped onto the same
   *  in-flight request (see the cache below) each get their own
   *  notification. Never fired for a real, fast failure (bad status/invalid
   *  response/network error) - only for a genuine stall. */
  onRetry?: () => void;
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
      | "request_failed"
      | "timeout",
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
  retryListeners: Set<() => void>;
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
        return subscribeToEntry(cached, requestOptions.signal, requestOptions.onRetry);
      }

      const requestGeneration = generation;
      const controller = new AbortController();

      let entry!: CacheEntry;
      // Referencing `entry` here (assigned synchronously right below, before
      // this ever actually runs) is the same forward-reference trick the
      // `.then`/`.catch` handlers just below already rely on.
      const notifyRetry = () => {
        for (const listener of entry.retryListeners) {
          listener();
        }
      };
      const articleRequest = raceWithAbort(
        fetchArticleWithLeash({
          endpoint,
          fetchImpl: options.fetchImpl,
          revisionId: requestOptions.revisionId,
          sanitizeHtml,
          signal: controller.signal,
          title,
        }, notifyRetry),
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
        retryListeners: new Set(),
      };
      activeEntries.add(entry);
      articleCache.set(cacheKey, entry);
      return subscribeToEntry(entry, requestOptions.signal, requestOptions.onRetry);
    },
  };
}

// MB-1 Part 2: two attempts at most - a short first leash, then one
// automatic retry with the full budget. Only a genuine STALL (this
// function's own timeout firing) is retried; a real, fast failure (bad
// status/invalid response/a network error the underlying fetch rejects
// with quickly) is not - it propagates immediately, same as before this
// fix (see wikipediaGateway.test.ts P12d: a 503 must still reject the
// FIRST getArticle call outright, not be silently retried away, so a caller
// that wants to try again gets an honest "it failed" first).
async function fetchArticleWithLeash(
  params: {
    endpoint: string;
    fetchImpl: typeof fetch;
    revisionId?: number;
    sanitizeHtml: (
      rawHtml: string,
      currentTitle: string,
    ) => SanitizedWikipediaArticle;
    signal: AbortSignal;
    title: string;
  },
  notifyRetry: () => void,
): Promise<Article> {
  const attempts = 2;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (params.signal.aborted) {
      throw abortError();
    }
    const attemptTimeoutMs = attempt === 0
      ? ARTICLE_FIRST_ATTEMPT_TIMEOUT_MS
      : ARTICLE_RETRY_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), attemptTimeoutMs);
    unrefTimeout(timeout);
    const attemptSignal = combineSignals([params.signal, timeoutController.signal]);
    try {
      return await fetchArticle({ ...params, signal: attemptSignal });
    } catch (caught) {
      if (params.signal.aborted) {
        // External cancellation (nav superseded, gateway cleared) - never
        // retried, propagate whatever fetchArticle threw as-is.
        throw caught;
      }
      if (!timeoutController.signal.aborted) {
        // A real, fast failure - not the stall this leash exists for.
        throw caught;
      }
      if (attempt + 1 >= attempts) {
        throw articleTimeoutError();
      }
      notifyRetry();
      await delay(ARTICLE_RETRY_DELAY_MS);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw articleTimeoutError();
}

function articleTimeoutError(): WikipediaGatewayError {
  return new WikipediaGatewayError(
    "timeout",
    "The Wikipedia article took too long to load.",
    504,
  );
}

// No AbortSignal.any() (Safari 15.4+, MB-1 Part 3 compat floor is ~14-15) -
// a plain listener-based combinator works everywhere AbortController does.
function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
  }
  for (const signal of signals) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Node-only escape hatch so a leash timer that never fires (the common
// case - the request settles well before it) can't keep a process/test
// worker alive waiting on it. No-op (and harmless) in real browsers, where
// setTimeout doesn't return an unref-able handle at all.
function unrefTimeout(timeout: ReturnType<typeof setTimeout>): void {
  (timeout as unknown as { unref?: () => void }).unref?.();
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
  onRetry?: () => void,
): Promise<Article> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  const subscriber = Symbol("wikipedia-request-subscriber");
  entry.subscribers.add(subscriber);
  if (onRetry) {
    entry.retryListeners.add(onRetry);
  }
  return new Promise<Article>((resolve, reject) => {
    let finished = false;
    const finish = (aborted: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      signal?.removeEventListener("abort", handleAbort);
      entry.subscribers.delete(subscriber);
      if (onRetry) {
        entry.retryListeners.delete(onRetry);
      }
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
