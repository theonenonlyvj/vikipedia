import { describe, expect, it } from "vitest";
import { extractTitleFromHref, isAllowedArticleHref } from "./rules";

describe("ranked classic link rules", () => {
  it("allows regular article links and extracts normalized titles", () => {
    expect(isAllowedArticleHref("/wiki/Philosophy")).toBe(true);
    expect(isAllowedArticleHref("/wiki/New_York_City#History")).toBe(true);
    expect(extractTitleFromHref("/wiki/New_York_City#History")).toBe(
      "New York City",
    );
  });

  it("blocks same-page anchors and non-article urls", () => {
    expect(isAllowedArticleHref("#History")).toBe(false);
    expect(isAllowedArticleHref("https://example.com/wiki/Philosophy")).toBe(
      false,
    );
    expect(isAllowedArticleHref("/w/index.php?title=Apple&action=edit")).toBe(
      false,
    );
    expect(extractTitleFromHref("#History")).toBeNull();
  });

  it("blocks disallowed namespaces", () => {
    const blocked = [
      "/wiki/Category:Physics",
      "/wiki/File:Apple.jpg",
      "/wiki/Help:Contents",
      "/wiki/Portal:Current_events",
      "/wiki/Special:Random",
      "/wiki/Talk:Philosophy",
      "/wiki/Template:Infobox",
      "/wiki/User:Example",
      "/wiki/Wikipedia:About",
    ];

    for (const href of blocked) {
      expect(isAllowedArticleHref(href)).toBe(false);
      expect(extractTitleFromHref(href)).toBeNull();
    }
  });
});
