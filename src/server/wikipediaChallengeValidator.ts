import {
  normalizeTitle,
  parseWikipediaArticleInput,
} from "../domain/rules";
import { sanitizeWikipediaArticleHtml } from "../services/wikipediaSanitizer";
import { DOMParser as WorkerDOMParser } from "linkedom/worker";
import { ApiError } from "./http";

export interface ValidatedWikipediaArticle {
  title: string;
  pageId: number;
  allowedLinkCount: number;
}

export interface ValidateChallengeArticlesInput {
  startTitle: string;
  targetTitle: string;
}

export interface ValidateChallengeArticlesResult {
  start: ValidatedWikipediaArticle;
  target: ValidatedWikipediaArticle;
}

export type ValidateChallengeArticles = (
  input: ValidateChallengeArticlesInput,
) => Promise<ValidateChallengeArticlesResult>;

export interface WikipediaChallengeValidator {
  validateChallengeArticles: ValidateChallengeArticles;
}

interface WikipediaPage {
  pageid?: number;
  ns?: number;
  title?: string;
  missing?: unknown;
  pageprops?: Record<string, unknown>;
}

interface WikipediaQueryResponse {
  query?: {
    pages?: Record<string, WikipediaPage> | WikipediaPage[];
  };
}

interface WikipediaParseResponse {
  parse?: {
    pageid?: number;
    revid?: number;
    title?: string;
    text?: string;
  };
}

const WIKIMEDIA_API_USER_AGENT =
  "VWiki Race/0.0 (https://vwikirace.pages.dev; contact: https://github.com/theonenonlyvj/vwiki-race)";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_ARTICLE_HTML_BYTES = 1_500 * 1024;

export function createWikipediaChallengeValidator(options: {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxArticleHtmlBytes?: number;
} = {}): WikipediaChallengeValidator {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://en.wikipedia.org/w/api.php";
  const timeoutMs = positiveBound(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = positiveBound(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
  );
  const maxArticleHtmlBytes = positiveBound(
    options.maxArticleHtmlBytes,
    DEFAULT_MAX_ARTICLE_HTML_BYTES,
  );

  return {
    async validateChallengeArticles(input) {
      const startInput = parseManualArticleInput("start", input.startTitle);
      const targetInput = parseManualArticleInput("target", input.targetTitle);
      const start = await loadArticle("start", startInput);
      const target = await loadArticle("target", targetInput);

      if (start.pageId === target.pageId) {
        throw new ApiError(
          "same_challenge_article",
          "Start and target must be different Wikipedia articles.",
        );
      }

      const allowedLinkCount = await loadAllowedStartLinkCount(start);
      if (allowedLinkCount < 1) {
        throw new ApiError(
          "start_has_no_allowed_links",
          "The start article has no allowed links.",
        );
      }

      return {
        start: { ...start, allowedLinkCount },
        target,
      };
    },
  };

  async function loadArticle(
    label: "start" | "target",
    title: string,
  ): Promise<ValidatedWikipediaArticle> {
    const url = wikipediaApiUrl(endpoint, {
      action: "query",
      format: "json",
      formatversion: "2",
      origin: "*",
      ppprop: "disambiguation",
      prop: "info|pageprops",
      redirects: "1",
      titles: title,
    });
    const payload = (await requestWikipediaJson(
      fetchImpl,
      url,
      label,
      timeoutMs,
      maxResponseBytes,
    )) as WikipediaQueryResponse;
    const pages = payload.query?.pages;
    const page = Array.isArray(pages)
      ? pages[0] ?? null
      : Object.values(pages ?? {})[0] ?? null;

    if (
      !page ||
      page.missing !== undefined ||
      !Number.isSafeInteger(page.pageid) ||
      Number(page.pageid) < 1
    ) {
      throw new ApiError(
        `invalid_${label}_article`,
        `That ${label} article does not exist on Wikipedia.`,
      );
    }
    if (page.ns !== 0) {
      throw new ApiError(
        `invalid_${label}_article`,
        `Use a main Wikipedia article for the ${label}.`,
      );
    }
    if (page.pageprops?.disambiguation !== undefined) {
      throw new ApiError(
        `disambiguation_${label}_article`,
        `Choose a specific Wikipedia article for the ${label}, not a disambiguation page.`,
      );
    }

    const canonicalTitle =
      typeof page.title === "string" ? page.title.trim() : "";
    const canonicalTarget = parseWikipediaArticleInput(canonicalTitle);
    if (!canonicalTarget) {
      throw invalidWikipediaResponse();
    }

    return {
      allowedLinkCount: 0,
      pageId: Number(page.pageid),
      title: canonicalTarget.title,
    };
  }

  async function loadAllowedStartLinkCount(
    start: ValidatedWikipediaArticle,
  ): Promise<number> {
    const url = wikipediaApiUrl(endpoint, {
      action: "parse",
      format: "json",
      formatversion: "2",
      origin: "*",
      page: start.title,
      prop: "text|revid",
      redirects: "1",
    });
    const payload = (await requestWikipediaJson(
      fetchImpl,
      url,
      "start_links",
      timeoutMs,
      maxResponseBytes,
    )) as WikipediaParseResponse;
    const parse = payload.parse;
    if (
      !parse ||
      parse.pageid !== start.pageId ||
      typeof parse.title !== "string" ||
      normalizeTitle(parse.title) !== normalizeTitle(start.title) ||
      !Number.isSafeInteger(parse.revid) ||
      typeof parse.text !== "string"
    ) {
      throw invalidWikipediaResponse();
    }
    if (new TextEncoder().encode(parse.text).byteLength > maxArticleHtmlBytes) {
      throw wikipediaBoundaryError();
    }
    try {
      return sanitizeWikipediaArticleHtml(parse.text, start.title, {
        parseDocument: parseWorkerDocument,
      }).links.length;
    } catch {
      throw invalidWikipediaResponse();
    }
  }
}

function parseManualArticleInput(
  label: "start" | "target",
  rawTitle: string,
): string {
  const target = parseWikipediaArticleInput(rawTitle);
  if (!target) {
    throw new ApiError(
      `invalid_${label}_article`,
      `Use a valid English Wikipedia article for the ${label}.`,
    );
  }
  return target.title;
}

async function requestWikipediaJson(
  fetchImpl: typeof fetch,
  url: string,
  label: "start" | "target" | "start_links",
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        "Api-User-Agent": WIKIMEDIA_API_USER_AGENT,
        "User-Agent": WIKIMEDIA_API_USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch {
    console.error(
      "wikipedia_validation_fetch_failed",
      JSON.stringify({ label }),
    );
    clearTimeout(timeout);
    throw wikipediaBoundaryError();
  }

  if (!response.ok) {
    console.error(
      "wikipedia_validation_bad_status",
      JSON.stringify({
        label,
        status: response.status,
      }),
    );
    clearTimeout(timeout);
    throw new ApiError(
      "wikipedia_validation_failed",
      `Could not verify those Wikipedia articles right now. Wikipedia returned status ${response.status}.`,
      502,
    );
  }

  try {
    return await readBoundedJson(response, maxResponseBytes);
  } catch {
    console.error(
      "wikipedia_validation_invalid_json",
      JSON.stringify({ label }),
    );
    throw wikipediaBoundaryError();
  } finally {
    clearTimeout(timeout);
  }
}

function wikipediaApiUrl(
  endpoint: string,
  parameters: Record<string, string>,
): string {
  const url = new URL(endpoint);
  url.search = new URLSearchParams(parameters).toString();
  return url.toString();
}

function invalidWikipediaResponse(): ApiError {
  return new ApiError(
    "wikipedia_validation_failed",
    "Wikipedia returned an invalid article response.",
    502,
  );
}

function wikipediaBoundaryError(): ApiError {
  return new ApiError(
    "wikipedia_validation_failed",
    "Could not verify those Wikipedia articles right now.",
    502,
  );
}

function parseWorkerDocument(rawHtml: string): Document {
  const document = new WorkerDOMParser().parseFromString(
    "<!doctype html><html><head></head><body></body></html>",
    "text/html",
  );
  document.body.innerHTML = rawHtml;
  return document as unknown as Document;
}

async function readBoundedJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = response.headers.get("Content-Length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)
  ) {
    throw new Error("Wikipedia response exceeded the validation limit.");
  }

  if (!response.body) {
    throw new Error("Wikipedia response body was missing.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Wikipedia response exceeded the validation limit.");
    }
    chunks.push(next.value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

function positiveBound(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}
