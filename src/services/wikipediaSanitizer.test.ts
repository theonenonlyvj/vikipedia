import { describe, expect, it } from "vitest";
import { sanitizeWikipediaArticleHtml } from "./wikipediaSanitizer";

// QF-02 (Judge B amendment 4): wikipediaSanitizer had zero test coverage
// despite being the HTML sanitizer for untrusted Wikipedia content. These
// guard the one behavior change QF-02 makes to it: every article <img>
// unconditionally carries loading + decoding hints, with the lead (first,
// document-order) image kept eager so it doesn't regress the game's own
// LCP element (Judge A amendment 1, folded into the binding ruling).
describe("wikipediaSanitizer: img loading/decoding hints (QF-02)", () => {
  it("sets loading=lazy decoding=async on every img regardless of source markup", () => {
    const { sanitizedHtml } = sanitizeWikipediaArticleHtml(
      `<div class="mw-parser-output">
        <p><img src="//upload.wikimedia.org/a.jpg" alt="a"></p>
        <p><img src="//upload.wikimedia.org/b.jpg" alt="b" loading="eager" decoding="sync"></p>
      </div>`,
      "Article",
    );
    const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");
    const images = [...document.querySelectorAll("img")];
    expect(images).toHaveLength(2);

    // First image = lead image: stays eager.
    expect(images[0].getAttribute("loading")).toBe("eager");
    expect(images[0].getAttribute("decoding")).toBe("async");

    // Second image: not the lead - goes lazy, even though the source
    // markup asked for eager/sync (unconditional override, not a whitelist).
    expect(images[1].getAttribute("loading")).toBe("lazy");
    expect(images[1].getAttribute("decoding")).toBe("async");
  });

  it("keeps only the first document-order img eager when more than two images are present", () => {
    const { sanitizedHtml } = sanitizeWikipediaArticleHtml(
      `<div class="mw-parser-output">
        <p><img src="//upload.wikimedia.org/lead.jpg" alt="lead"></p>
        <table class="infobox"><tbody><tr><td>
          <img src="//upload.wikimedia.org/infobox.jpg" alt="infobox">
        </td></tr></tbody></table>
        <p><img src="//upload.wikimedia.org/third.jpg" alt="third"></p>
      </div>`,
      "Article",
    );
    const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");
    const images = [...document.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("alt"))).toEqual([
      "lead",
      "infobox",
      "third",
    ]);
    expect(images.map((image) => image.getAttribute("loading"))).toEqual([
      "eager",
      "lazy",
      "lazy",
    ]);
  });
});

// MB-1 Part 1: a wide "wikitable"/"sortable" stats grid can't shrink below
// its own min-content width - without its own local scroll container it
// either drags the WHOLE article sideways (one shared `.article-content`
// horizontal scroll, "really hard to navigate" per the brief) or, on a
// layout that doesn't contain it at all, blows the page out to Safari's
// "shrink to fit" crazy scale. Each non-infobox table gets wrapped in its
// own `.table-scroll` div so ONLY the table scrolls.
describe("wikipediaSanitizer: table containment (MB-1 Part 1)", () => {
  it("wraps a non-infobox table in its own .table-scroll container, leaving prose/paragraphs untouched", () => {
    const { sanitizedHtml } = sanitizeWikipediaArticleHtml(
      `<div class="mw-parser-output">
        <p>Lead paragraph.</p>
        <table class="wikitable sortable"><tbody><tr><th>Year</th><th>Matches</th></tr>
          <tr><td>2019</td><td>4</td></tr>
        </tbody></table>
        <p>Trailing paragraph.</p>
      </div>`,
      "Apple",
    );
    const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");

    const dataTable = document.querySelector("table.wikitable");
    expect(dataTable).not.toBeNull();
    const wrapper = dataTable?.closest(".table-scroll");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.parentElement?.className).toBe("mw-parser-output");
    expect([...document.querySelectorAll(".table-scroll")]).toHaveLength(1);

    expect(sanitizedHtml).toContain("Lead paragraph");
    expect(sanitizedHtml).toContain("Trailing paragraph");
  });

  it("leaves an infobox table (and any table nested inside one) unwrapped - it already has its own float/width handling", () => {
    const { sanitizedHtml } = sanitizeWikipediaArticleHtml(
      `<div class="mw-parser-output">
        <table class="infobox"><tbody><tr><td>
          <table class="infobox-nested"><tbody><tr><td>nested fact</td></tr></tbody></table>
        </td></tr></tbody></table>
      </div>`,
      "Apple",
    );
    const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");

    expect(document.querySelectorAll(".table-scroll")).toHaveLength(0);
    expect(document.querySelector("table.infobox")).not.toBeNull();
    expect(document.querySelector("table.infobox-nested")).not.toBeNull();
  });

  it("wraps every top-level data table independently when an article has more than one", () => {
    const { sanitizedHtml } = sanitizeWikipediaArticleHtml(
      `<div class="mw-parser-output">
        <table class="wikitable"><tbody><tr><td>first</td></tr></tbody></table>
        <table class="wikitable"><tbody><tr><td>second</td></tr></tbody></table>
      </div>`,
      "Apple",
    );
    const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");

    const wrappers = [...document.querySelectorAll(".table-scroll")];
    expect(wrappers).toHaveLength(2);
    expect(wrappers.every((wrapper) => wrapper.querySelector("table.wikitable"))).toBe(true);
  });
});
