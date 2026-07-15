import { describe, expect, it } from "vitest";
import type { Article, SanitizedWikipediaHtml } from "./types";
import { extractArticlePreview } from "./articlePreview";

describe("extractArticlePreview", () => {
  it("returns the first meaningful lead as plain text without embedded media", () => {
    const preview = extractArticlePreview(article(`
      <div class="mw-parser-output">
        <p> </p>
        <table class="infobox"><tbody><tr><td>
          <img src="https://upload.wikimedia.org/example.jpg" alt="Target landmark" />
        </td></tr></tbody></table>
        <p>The <a href="#article:Target">target</a> is a notable place with useful context.</p>
        <p>A second paragraph should not be included.</p>
      </div>
    `));

    expect(preview).toEqual({
      blurb: "The target is a notable place with useful context.",
    });
    expect(preview.blurb).not.toContain("<a");
  });

  it("bounds a long lead at a word boundary", () => {
    const longLead = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" ");
    const preview = extractArticlePreview(article(`<p>${longLead}</p>`));

    expect(preview.blurb?.length).toBeLessThanOrEqual(363);
    expect(preview.blurb).toMatch(/\.\.\.$/);
    const finalWord = preview.blurb?.slice(0, -3).split(" ").at(-1);
    expect(longLead.split(" ")).toContain(finalWord);
  });

  it("returns null fields when the sanitized article has no preview content", () => {
    expect(extractArticlePreview(article("<div><br /></div>"))).toEqual({ blurb: null });
  });
});

function article(sanitizedHtml: string): Article {
  return {
    pageId: 1,
    canonicalTitle: "Target",
    revisionId: 2,
    sourceUrl: "https://en.wikipedia.org/wiki/Target",
    attributionUrl: "https://en.wikipedia.org/w/index.php?title=Target&oldid=2",
    sanitizedHtml: sanitizedHtml as SanitizedWikipediaHtml,
    links: [],
    attribution: "Wikipedia revision 2",
  };
}
