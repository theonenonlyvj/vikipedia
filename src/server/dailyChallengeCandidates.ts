import { isAllowedArticleHref, parseWikipediaArticleInput } from "../domain/rules";
import type { WikipediaGateway } from "../services/wikipediaGateway";

const DEFAULT_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const REQUEST_TIMEOUT_MS = 5_000;
const PHASE_TIMEOUT_MS = 25_000;
const MAX_PAIRS = 3;
const USER_AGENT =
  "VWikiRaceDailyBot/0.0 (https://vwikirace.pages.dev; https://github.com/theonenonlyvj/vwiki-race)";

export interface DailyChallengeCandidate {
  startTitle: string;
  startPageId: number;
  targetTitle: string;
  targetPageId: number;
}

export class DailyChallengeCandidateError extends Error {
  constructor(readonly code: "daily_candidate_unavailable" | "daily_candidate_timeout") {
    super("Wikipedia did not provide a usable daily challenge candidate.");
    this.name = "DailyChallengeCandidateError";
  }
}

type DailyChallengeDiagnosticEvent =
  | "random_bad_status"
  | "random_invalid_payload"
  | "random_request_failed"
  | "random_request_timeout"
  | "render_failed"
  | "render_mismatch";

export function createDailyChallengeCandidateSource(options: {
  fetchImpl: typeof fetch;
  gateway: WikipediaGateway;
  endpoint?: string;
  now?: () => number;
  requestTimeoutMs?: number;
  phaseTimeoutMs?: number;
  onDiagnostic?: (
    event: DailyChallengeDiagnosticEvent,
    fields: Record<string, string | number | boolean>,
  ) => void;
}) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = options.fetchImpl;
  const now = options.now ?? Date.now;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const phaseTimeoutMs = options.phaseTimeoutMs ?? PHASE_TIMEOUT_MS;

  return {
    async findCandidate(): Promise<DailyChallengeCandidate> {
      const phase = new AbortController();
      const phaseTimer = setTimeout(() => phase.abort(), phaseTimeoutMs);
      const deadline = now() + phaseTimeoutMs;
      try {
        for (let attempt = 0; attempt < MAX_PAIRS; attempt += 1) {
          const attemptNumber = attempt + 1;
          const start = await randomPage(phase.signal, attemptNumber, "start");
          const target = await randomPage(phase.signal, attemptNumber, "target");
          if (!start || !target || start.pageId === target.pageId) continue;
          if (now() >= deadline) throw new DailyChallengeCandidateError("daily_candidate_timeout");
          const renderController = new AbortController();
          const renderTimeout = setTimeout(() => renderController.abort(), requestTimeoutMs);
          const abortRender = () => renderController.abort();
          if (phase.signal.aborted) {
            abortRender();
          } else {
            phase.signal.addEventListener("abort", abortRender, { once: true });
          }
          try {
            const article = await options.gateway.getArticle(start.title, {
              signal: renderController.signal,
            });
            const pageIdMatches = article.pageId === start.pageId;
            const canonicalTitleMatches =
              parseWikipediaArticleInput(article.canonicalTitle)?.title === start.title;
            const hasPlayableLink = article.links.some((link) =>
              isAllowedArticleHref(link.href));
            if (!pageIdMatches || !canonicalTitleMatches || !hasPlayableLink) {
              diagnostic("render_mismatch", {
                attempt: attemptNumber,
                canonicalTitleMatches,
                hasPlayableLink,
                pageIdMatches,
              });
              continue;
            }
          } catch (caught) {
            if (phase.signal.aborted) throw new DailyChallengeCandidateError("daily_candidate_timeout");
            diagnostic("render_failed", {
              attempt: attemptNumber,
              code: diagnosticErrorCode(caught),
              detail: diagnosticErrorDetail(caught),
            });
            continue;
          } finally {
            clearTimeout(renderTimeout);
            phase.signal.removeEventListener("abort", abortRender);
          }
          return {
            startTitle: start.title,
            startPageId: start.pageId,
            targetTitle: target.title,
            targetPageId: target.pageId,
          };
        }
        throw new DailyChallengeCandidateError("daily_candidate_unavailable");
      } finally {
        clearTimeout(phaseTimer);
      }
    },
  };

  async function randomPage(
    signal: AbortSignal,
    attempt: number,
    role: "start" | "target",
  ): Promise<{ title: string; pageId: number } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        action: "query", format: "json", formatversion: "2", origin: "*",
        generator: "random", grnnamespace: "0", grnfilterredir: "nonredirects",
        grnlimit: "1", prop: "info|pageprops",
      }).toString();
      const response = await fetchImpl(url.toString(), {
        headers: { "Api-User-Agent": USER_AGENT, "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        diagnostic("random_bad_status", { attempt, role, status: response.status });
        return null;
      }
      const payload = await response.json() as { query?: { pages?: unknown } };
      const pages = payload.query?.pages;
      const page = Array.isArray(pages) ? pages[0] : Object.values(pages ?? {})[0];
      if (!page || typeof page !== "object") {
        diagnostic("random_invalid_payload", { attempt, role });
        return null;
      }
      const candidate = page as {
        pageid?: unknown;
        title?: unknown;
        ns?: unknown;
        missing?: unknown;
        redirect?: unknown;
        pageprops?: { disambiguation?: unknown };
      };
      if (candidate.ns !== 0 || candidate.missing !== undefined || candidate.redirect !== undefined ||
          candidate.pageprops?.disambiguation !== undefined ||
          !Number.isSafeInteger(candidate.pageid) || Number(candidate.pageid) < 1 ||
          typeof candidate.title !== "string") {
        diagnostic("random_invalid_payload", { attempt, role });
        return null;
      }
      const title = parseWikipediaArticleInput(candidate.title)?.title;
      if (!title) {
        diagnostic("random_invalid_payload", { attempt, role });
        return null;
      }
      return { title, pageId: Number(candidate.pageid) };
    } catch (caught) {
      if (signal.aborted) throw new DailyChallengeCandidateError("daily_candidate_timeout");
      diagnostic(controller.signal.aborted ? "random_request_timeout" : "random_request_failed", {
        attempt,
        role,
        code: diagnosticErrorCode(caught),
        detail: diagnosticErrorDetail(caught),
      });
      return null;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }

  function diagnostic(
    event: DailyChallengeDiagnosticEvent,
    fields: Record<string, string | number | boolean>,
  ): void {
    try {
      options.onDiagnostic?.(event, fields);
    } catch {
      // Diagnostics must never change candidate selection behavior.
    }
  }
}

function diagnosticErrorCode(caught: unknown): string {
  if (caught && typeof caught === "object") {
    if ("code" in caught && typeof (caught as { code?: unknown }).code === "string") {
      return (caught as { code: string }).code.slice(0, 64);
    }
    if ("name" in caught && typeof (caught as { name?: unknown }).name === "string") {
      return (caught as { name: string }).name.slice(0, 64);
    }
  }
  return "unknown";
}

function diagnosticErrorDetail(caught: unknown): string {
  if (caught && typeof caught === "object" && "message" in caught &&
      typeof (caught as { message?: unknown }).message === "string") {
    return (caught as { message: string }).message
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .trim()
      .slice(0, 128);
  }
  return "unavailable";
}
