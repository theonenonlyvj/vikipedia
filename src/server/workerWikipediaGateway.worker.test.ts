import { describe, expect, it, vi } from "vitest";
import { createWorkerWikipediaGateway } from "./workerWikipediaGateway";

describe("Worker Wikipedia gateway", () => {
  it("sanitizes playable article HTML without a browser DOMParser global", async () => {
    const fetchImpl = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(JSON.stringify({
      parse: {
        title: "Random start",
        pageid: 42,
        revid: 84,
        text: '<p>Move to <a href="/wiki/Target" title="Target">Target</a>.</p>',
      },
    }), {
      headers: { "Content-Type": "application/json" },
    }));
    const gateway = createWorkerWikipediaGateway(fetchImpl);

    const article = await gateway.getArticle("Random start");

    expect(article).toMatchObject({
      canonicalTitle: "Random start",
      pageId: 42,
      revisionId: 84,
    });
    expect(article.links).toEqual([
      expect.objectContaining({
        href: "https://en.wikipedia.org/wiki/Target",
        title: "Target",
      }),
    ]);
    expect(fetchImpl.mock.contexts).toEqual([undefined]);
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Api-User-Agent")).toContain("VWiki Race");
    expect(headers.get("User-Agent")).toContain("VWiki Race");
  });
});
