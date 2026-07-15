import { describe, expect, it, vi } from "vitest";
import type { Article } from "../domain/types";
import { createDailyChallengeCandidateSource } from "./dailyChallengeCandidates";

describe("daily challenge candidates", () => {
  it("uses independent one-page random requests and validates only the start render", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(randomResponse({ pageid: 11, title: "Start" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 22, title: "Target" }));
    const getArticle = vi.fn(async () => article({ pageId: 11, canonicalTitle: "Start" }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
    });

    await expect(source.findCandidate()).resolves.toEqual({
      startTitle: "Start",
      startPageId: 11,
      targetTitle: "Target",
      targetPageId: 22,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.contexts).toEqual([undefined, undefined]);
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(typeof input).toBe("string");
      const url = new URL(String(input));
      expect(url.searchParams.get("action")).toBe("query");
      expect(url.searchParams.get("generator")).toBe("random");
      expect(url.searchParams.get("grnnamespace")).toBe("0");
      expect(url.searchParams.get("grnfilterredir")).toBe("nonredirects");
      expect(url.searchParams.get("grnlimit")).toBe("1");
      expect(url.searchParams.get("prop")).toBe("info|pageprops");
      const headers = new Headers(init?.headers);
      expect(headers.get("Api-User-Agent")).toContain("VWikiRaceDailyBot");
      expect(headers.get("User-Agent")).toContain("VWikiRaceDailyBot");
    }
    expect(getArticle).toHaveBeenCalledWith("Start", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("retries invalid pairs within three pairs and nine total Wikipedia calls", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(randomResponse({ pageid: 11, title: "Same" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 11, title: "Same" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 12, title: "Dead" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 13, title: "Target" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 14, title: "Good" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 15, title: "Goal" }));
    const getArticle = vi
      .fn()
      .mockResolvedValueOnce(article({ pageId: 12, canonicalTitle: "Dead", links: [] }))
      .mockResolvedValueOnce(article({ pageId: 14, canonicalTitle: "Good" }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
    });

    await expect(source.findCandidate()).resolves.toMatchObject({
      startTitle: "Good",
      targetTitle: "Goal",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(getArticle).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed, missing, redirect, and non-mainspace random records within the fixed budget", async () => {
    const onDiagnostic = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(randomResponse({ pageid: 2, title: "Target" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 3, title: "Redirect", redirect: true }))
      .mockResolvedValueOnce(randomResponse({ pageid: 4, title: "Target" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 5, title: "Talk:No", ns: 1 }))
      .mockResolvedValueOnce(randomResponse({ pageid: 6, title: "Target" }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle: vi.fn(), clear: () => undefined },
      onDiagnostic,
    });

    await expect(source.findCandidate()).rejects.toMatchObject({ code: "daily_candidate_unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(onDiagnostic).toHaveBeenCalledWith("random_invalid_payload", {
      attempt: 1,
      role: "start",
    });
  });

  it("rejects disambiguation starts and targets before accepting a later pair", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(randomResponse({ pageid: 11, title: "Disambiguation start", pageprops: { disambiguation: "" } }))
      .mockResolvedValueOnce(randomResponse({ pageid: 12, title: "Target" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 13, title: "Start" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 14, title: "Disambiguation target", pageprops: { disambiguation: "" } }))
      .mockResolvedValueOnce(randomResponse({ pageid: 15, title: "Good" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 16, title: "Goal" }));
    const pageIds: Record<string, number> = {
      "Disambiguation start": 11,
      Start: 13,
      Good: 15,
    };
    const getArticle = vi.fn(async (title: string) => article({
      pageId: pageIds[title] ?? 0,
      canonicalTitle: title,
    }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
    });

    await expect(source.findCandidate()).resolves.toMatchObject({
      startTitle: "Good",
      targetTitle: "Goal",
    });
    expect(getArticle).toHaveBeenCalledTimes(1);
  });

  it("rejects gateway page-id and canonical-title mismatches before accepting a later pair", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(randomResponse({ pageid: 10, title: "Expected" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 11, title: "Target" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 12, title: "Good" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 13, title: "Goal" }));
    const getArticle = vi
      .fn()
      .mockResolvedValueOnce(article({ pageId: 999, canonicalTitle: "Unexpected" }))
      .mockResolvedValueOnce(article({ pageId: 12, canonicalTitle: "Good" }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
    });

    await expect(source.findCandidate()).resolves.toMatchObject({ startTitle: "Good", targetTitle: "Goal" });
    expect(getArticle).toHaveBeenCalledTimes(2);
  });

  it("stops after three dead start renders", async () => {
    let pageId = 0;
    const fetchImpl = vi.fn(async () => {
      pageId += 1;
      return randomResponse({ pageid: pageId, title: `Page ${pageId}` });
    });
    const getArticle = vi.fn(async (title: string) => article({
      pageId: Number(title.replace("Page ", "")), canonicalTitle: title, links: [],
    }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
    });

    await expect(source.findCandidate()).rejects.toMatchObject({ code: "daily_candidate_unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(getArticle).toHaveBeenCalledTimes(3);
  });

  it("treats a five-second request abort as a failed candidate request, not an unbounded call", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle: vi.fn(), clear: () => undefined },
      requestTimeoutMs: 1,
      phaseTimeoutMs: 100,
    });

    await expect(source.findCandidate()).rejects.toMatchObject({ code: "daily_candidate_unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("reports a bounded request failure message without changing retry behavior", async () => {
    const onDiagnostic = vi.fn();
    const source = createDailyChallengeCandidateSource({
      fetchImpl: vi.fn(async () => {
        throw new TypeError(`synthetic\n${"x".repeat(200)}`);
      }),
      gateway: { getArticle: vi.fn(), clear: () => undefined },
      onDiagnostic,
    });

    await expect(source.findCandidate()).rejects.toMatchObject({
      code: "daily_candidate_unavailable",
    });
    expect(onDiagnostic).toHaveBeenCalledWith("random_request_failed", {
      attempt: 1,
      role: "start",
      code: "TypeError",
      detail: `synthetic ${"x".repeat(118)}`,
    });
  });

  it("fails at the phase deadline when canonical validation remains in flight", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(randomResponse({ pageid: 31, title: "Start" }))
      .mockResolvedValueOnce(randomResponse({ pageid: 32, title: "Target" }));
    const getArticle = vi.fn((_title: string, options?: { signal?: AbortSignal }) => new Promise<Article>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
      phaseTimeoutMs: 5,
    });

    await expect(source.findCandidate()).rejects.toMatchObject({ code: "daily_candidate_timeout" });
  });

  it("aborts each start render at the request timeout and keeps attempts bounded", async () => {
    let pageId = 40;
    const fetchImpl = vi.fn(async () => {
      pageId += 1;
      return randomResponse({ pageid: pageId, title: `Page ${pageId}` });
    });
    const renderSignals: AbortSignal[] = [];
    const getArticle = vi.fn((_title: string, options?: { signal?: AbortSignal }) => {
      const signal = options?.signal;
      if (!signal) throw new Error("Missing render signal");
      renderSignals.push(signal);
      return new Promise<Article>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const source = createDailyChallengeCandidateSource({
      fetchImpl,
      gateway: { getArticle, clear: () => undefined },
      requestTimeoutMs: 5,
      phaseTimeoutMs: 100,
    });

    await expect(source.findCandidate()).rejects.toMatchObject({
      code: "daily_candidate_unavailable",
    });
    expect(getArticle).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(renderSignals).toHaveLength(3);
    expect(renderSignals.every((signal) => signal.aborted)).toBe(true);
  });
});

function randomResponse(page: {
  pageid: number;
  title: string;
  ns?: number;
  redirect?: boolean;
  pageprops?: { disambiguation?: string };
}): Response {
  return new Response(JSON.stringify({ query: { pages: { [page.pageid]: { ...page, ns: page.ns ?? 0 } } } }), {
    headers: { "Content-Type": "application/json" },
  });
}

function article(overrides: Partial<Article> & Pick<Article, "pageId" | "canonicalTitle">): Article {
  const { pageId, canonicalTitle, ...rest } = overrides;
  return {
    pageId,
    canonicalTitle,
    revisionId: 1,
    sourceUrl: "https://en.wikipedia.org/wiki/Start",
    attributionUrl: "https://en.wikipedia.org/w/index.php?title=Start&oldid=1",
    sanitizedHtml: "<p>Start</p>" as Article["sanitizedHtml"],
    links: [{ href: "/wiki/Move", title: "Move", anchorText: "Move" }],
    attribution: "Wikipedia revision 1",
    ...rest,
  };
}
