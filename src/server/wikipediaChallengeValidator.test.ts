import { afterEach, describe, expect, it, vi } from "vitest";
import { createWikipediaChallengeValidator } from "./wikipediaChallengeValidator";

describe("Wikipedia challenge validator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("V1a resolves redirects and returns canonical page IDs plus allowed start moves", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "parse") {
        return parseArticleResponse({
          pageid: 1,
          title: "Moon",
          links: [
            { ns: 0, title: "Gravity", exists: true },
            { ns: 0, title: "AC/DC", exists: "" },
            { ns: 6, title: "File:Moon.jpg", exists: true },
            { ns: 0, title: "Missing page" },
          ],
        });
      }

      const title = url.searchParams.get("titles");
      if (title === "Luna") {
        return queryResponse({ pageid: 1, ns: 0, title: "Moon" });
      }
      if (title === "Gravity") {
        return queryResponse({ pageid: 2, ns: 0, title: "Gravity" });
      }
      throw new Error(`Unexpected title ${title}`);
    });
    const validator = createWikipediaChallengeValidator({ fetchImpl });

    await expect(
      validator.validateChallengeArticles({
        startTitle: "https://en.wikipedia.org/wiki/Luna#History",
        targetTitle: "Gravity",
      }),
    ).resolves.toEqual({
      start: { title: "Moon", pageId: 1, allowedLinkCount: 2 },
      target: { title: "Gravity", pageId: 2, allowedLinkCount: 0 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const urls = fetchImpl.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.searchParams.get("action"))).toEqual([
      "query",
      "query",
      "parse",
    ]);
    expect(urls[0].searchParams.get("redirects")).toBe("1");
    expect(urls[0].searchParams.get("prop")).toBe("info|pageprops");
    expect(urls[2].searchParams.get("prop")).toBe("text|revid");
    expect(urls[2].searchParams.get("page")).toBe("Moon");
    expect(urls.every((url) => !url.searchParams.has("generator"))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("https://en.wikipedia.org/w/api.php?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Api-User-Agent": expect.stringContaining("VWiki Race"),
          "User-Agent": expect.stringContaining("VWiki Race"),
        }),
      }),
    );
  });

  it.each([
    "http://en.wikipedia.org/wiki/Moon",
    "//en.wikipedia.org/wiki/Moon",
    "https://en.wikipedia.org.evil.test/wiki/Moon",
    "https://fr.wikipedia.org/wiki/Moon",
    "https://en.wikipedia.org/wiki/Moon?oldid=1",
    "/wiki/Bad%ZZ",
    "fIlE:Moon.jpg",
  ])("V1b rejects an invalid manual start before any Wikipedia call: %s", async (startTitle) => {
    const fetchImpl = vi.fn();
    const validator = createWikipediaChallengeValidator({ fetchImpl });

    await expect(
      validator.validateChallengeArticles({
        startTitle,
        targetTitle: "Gravity",
      }),
    ).rejects.toMatchObject({
      code: "invalid_start_article",
      status: 400,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("V1c preserves encoded slash titles when resolving manual input", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "parse") {
        return parseArticleResponse({
          pageid: 1,
          title: "AC/DC",
          links: [{ ns: 0, title: "Rock music", exists: true }],
        });
      }
      const title = url.searchParams.get("titles");
      return title === "AC/DC"
        ? queryResponse({ pageid: 1, ns: 0, title: "AC/DC" })
        : queryResponse({ pageid: 2, ns: 0, title: "Gravity" });
    });
    const validator = createWikipediaChallengeValidator({ fetchImpl });

    await validator.validateChallengeArticles({
      startTitle: "https://en.wikipedia.org/wiki/AC%2FDC",
      targetTitle: "Gravity",
    });

    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(firstUrl.searchParams.get("titles")).toBe("AC/DC");
  });

  it.each([
    ["missing", { ns: 0, title: "Missing", missing: true }, "invalid_start_article"],
    ["namespace", { pageid: 1, ns: 6, title: "File:Moon.jpg" }, "invalid_start_article"],
    [
      "disambiguation",
      { pageid: 1, ns: 0, title: "Mercury", pageprops: { disambiguation: "" } },
      "disambiguation_start_article",
    ],
  ])("V1d rejects a %s source page", async (_case, page, code) => {
    const validator = createWikipediaChallengeValidator({
      fetchImpl: vi.fn(async () => queryResponse(page)),
    });

    await expect(
      validator.validateChallengeArticles({
        startTitle: "Moon",
        targetTitle: "Gravity",
      }),
    ).rejects.toMatchObject({ code, status: 400 });
  });

  it("V1e rejects equal canonical page IDs without requesting outgoing links", async () => {
    const fetchImpl = vi.fn(async () =>
      queryResponse({ pageid: 1, ns: 0, title: "Moon" }),
    );
    const validator = createWikipediaChallengeValidator({ fetchImpl });

    await expect(
      validator.validateChallengeArticles({
        startTitle: "Moon",
        targetTitle: "https://en.wikipedia.org/wiki/Moon",
      }),
    ).rejects.toMatchObject({
      code: "same_challenge_article",
      status: 400,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("V1f rejects a start with no allowed existing outgoing move", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "parse") {
        return parseArticleResponse({
          pageid: 1,
          title: "Moon",
          links: [
            { ns: 6, title: "File:Moon.jpg", exists: true },
            { ns: 0, title: "File:Moon.jpg", exists: true },
            { ns: 0, title: "Missing page" },
            { ns: 0, title: "Moon", exists: true },
          ],
        });
      }
      const title = url.searchParams.get("titles");
      return title === "Moon"
        ? queryResponse({ pageid: 1, ns: 0, title: "Moon" })
        : queryResponse({ pageid: 2, ns: 0, title: "Gravity" });
    });
    const validator = createWikipediaChallengeValidator({ fetchImpl });

    await expect(
      validator.validateChallengeArticles({
        startTitle: "Moon",
        targetTitle: "Gravity",
      }),
    ).rejects.toMatchObject({
      code: "start_has_no_allowed_links",
      status: 400,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("V1g rejects a rendered dead start whose only links are removed by game rules", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "parse") {
        return Response.json({
          parse: {
            pageid: 1,
            title: "Moon",
            revid: 10,
            text: `
              <div class="navbox"><a href="/wiki/Gravity">Gravity</a></div>
              <h2 id="See_also">See also</h2>
              <p><a href="/wiki/Physics">Physics</a></p>
              <h2 id="References">References</h2>
              <p><a href="/wiki/Astronomy">Astronomy</a></p>
            `,
          },
        });
      }
      return url.searchParams.get("titles") === "Moon"
        ? queryResponse({ pageid: 1, ns: 0, title: "Moon" })
        : queryResponse({ pageid: 2, ns: 0, title: "Gravity" });
    });
    const validator = createWikipediaChallengeValidator({ fetchImpl });

    await expect(validator.validateChallengeArticles({
      startTitle: "Moon",
      targetTitle: "Gravity",
    })).rejects.toMatchObject({
      code: "start_has_no_allowed_links",
      status: 400,
    });
  });

  it("V1h returns a typed upstream error without reading or logging its body", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let bodyRead = false;
    const response = new Response("SECRET_WIKIPEDIA_RESPONSE_BODY", {
      status: 403,
      statusText: "STATUS_SECRET",
    });
    Object.defineProperty(response, "text", {
      value: async () => {
        bodyRead = true;
        return "SECRET_WIKIPEDIA_RESPONSE_BODY";
      },
    });
    const validator = createWikipediaChallengeValidator({
      fetchImpl: vi.fn(async () => response),
    });

    await expect(
      validator.validateChallengeArticles({
        startTitle: "Moon",
        targetTitle: "Gravity",
      }),
    ).rejects.toMatchObject({
      code: "wikipedia_validation_failed",
      status: 502,
    });
    expect(bodyRead).toBe(false);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "SECRET_WIKIPEDIA_RESPONSE_BODY",
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("STATUS_SECRET");
  });

  it("V1i attaches a deadline signal to every Wikipedia request", async () => {
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "parse") {
        return parseArticleResponse({
          pageid: 1,
          title: "Moon",
          links: [{ ns: 0, title: "Gravity", exists: true }],
        });
      }
      return url.searchParams.get("titles") === "Moon"
        ? queryResponse({ pageid: 1, ns: 0, title: "Moon" })
        : queryResponse({ pageid: 2, ns: 0, title: "Gravity" });
    });
    const validator = createWikipediaChallengeValidator({ fetchImpl, timeoutMs: 5_000 });

    await validator.validateChallengeArticles({ startTitle: "Moon", targetTitle: "Gravity" });

    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it("V1j aborts a Wikipedia request at its configured deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const validator = createWikipediaChallengeValidator({
      timeoutMs: 10,
      fetchImpl: vi.fn((_input, init) => {
        signal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }),
    });

    const pending = validator.validateChallengeArticles({
      startTitle: "Moon",
      targetTitle: "Gravity",
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "wikipedia_validation_failed",
      status: 502,
    });
    await vi.advanceTimersByTimeAsync(11);

    expect(signal?.aborted).toBe(true);
    await rejection;
  });

  it("V1k rejects oversized Wikipedia responses before parsing their body", async () => {
    const response = new Response(JSON.stringify({ query: { pages: {} } }), {
      headers: { "Content-Length": "101", "Content-Type": "application/json" },
    });
    const jsonSpy = vi.spyOn(response, "json");
    const validator = createWikipediaChallengeValidator({
      fetchImpl: vi.fn(async () => response),
      maxResponseBytes: 100,
    });

    await expect(validator.validateChallengeArticles({
      startTitle: "Moon",
      targetTitle: "Gravity",
    })).rejects.toMatchObject({ code: "wikipedia_validation_failed", status: 502 });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("V1l rejects oversized rendered HTML before Worker DOM parsing", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "parse") {
        return Response.json({
          parse: {
            pageid: 1,
            title: "Moon",
            revid: 10,
            text: `<p>${"x".repeat(101)}<a href="/wiki/Gravity">Gravity</a></p>`,
          },
        });
      }
      return url.searchParams.get("titles") === "Moon"
        ? queryResponse({ pageid: 1, ns: 0, title: "Moon" })
        : queryResponse({ pageid: 2, ns: 0, title: "Gravity" });
    });
    const validator = createWikipediaChallengeValidator({
      fetchImpl,
      maxArticleHtmlBytes: 100,
    });

    await expect(validator.validateChallengeArticles({
      startTitle: "Moon",
      targetTitle: "Gravity",
    })).rejects.toMatchObject({ code: "wikipedia_validation_failed", status: 502 });
  });

  it("V1m converts malformed JSON and network failures to typed boundary errors without logging exception text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const malformed = createWikipediaChallengeValidator({
      fetchImpl: vi.fn(async () =>
        new Response("BODYLEAK", {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });
    const network = createWikipediaChallengeValidator({
      fetchImpl: vi.fn(async () => {
        throw new Error("NETWORK_SECRET");
      }),
    });

    await expect(
      malformed.validateChallengeArticles({ startTitle: "Moon", targetTitle: "Gravity" }),
    ).rejects.toMatchObject({ code: "wikipedia_validation_failed", status: 502 });
    await expect(
      network.validateChallengeArticles({ startTitle: "Moon", targetTitle: "Gravity" }),
    ).rejects.toMatchObject({ code: "wikipedia_validation_failed", status: 502 });
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "BODYLEAK",
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "NETWORK_SECRET",
    );
  });
});

function queryResponse(page: Record<string, unknown>): Response {
  return Response.json({
    query: {
      pages: {
        [String(page.pageid ?? "-1")]: page,
      },
    },
  });
}

function parseArticleResponse(parse: Record<string, unknown>): Response {
  const links = Array.isArray(parse.links) ? parse.links : [];
  const text = links.map((value) => {
    const link = value as Record<string, unknown>;
    const title = String(link.title ?? link["*"] ?? "");
    const encodedTitle = title
      .split("/")
      .map((segment) => encodeURIComponent(segment.replaceAll(" ", "_")))
      .join("/");
    const missingClass = Object.prototype.hasOwnProperty.call(link, "exists")
      ? ""
      : ' class="new"';
    return `<a${missingClass} href="/wiki/${encodedTitle}">${title}</a>`;
  }).join(" ");
  const { links: _links, ...rest } = parse;
  return Response.json({ parse: { ...rest, revid: 10, text } });
}
