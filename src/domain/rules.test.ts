import { describe, expect, it } from "vitest";
import {
  extractTitleFromHref,
  isAllowedArticleHref,
  parseWikipediaArticleInput,
} from "./rules";

describe("ranked classic link rules", () => {
  it.each([
    ["/wiki/Philosophy", "Philosophy"],
    ["./New_York_City", "New York City"],
    ["AC/DC", "AC/DC"],
    ["/wiki/AC/DC", "AC/DC"],
    ["/wiki/AC%2FDC", "AC/DC"],
    ["https://en.wikipedia.org/wiki/AC%2FDC", "AC/DC"],
  ])("P1 preserves slash titles and decodes each segment once: %s", (href, title) => {
    expect(extractTitleFromHref(href)).toBe(title);
    expect(isAllowedArticleHref(href)).toBe(true);
  });

  it("P2 strips fragments while rejecting fragment-only navigation", () => {
    expect(extractTitleFromHref("/wiki/New_York_City#History")).toBe(
      "New York City",
    );
    expect(extractTitleFromHref("#History")).toBeNull();
  });

  it.each([
    "/wiki/Apple?oldid=1",
    "./Apple?action=edit",
    "https://en.wikipedia.org/wiki/Apple?redirect=no#History",
    "/w/index.php?title=Apple&action=edit",
  ])("P3 rejects every query-bearing candidate: %s", (href) => {
    expect(extractTitleFromHref(href)).toBeNull();
  });

  it.each([
    "http://en.wikipedia.org/wiki/Apple",
    "//en.wikipedia.org/wiki/Apple",
    "https://en.wikipedia.org.evil.test/wiki/Apple",
    "https://notwikipedia.org/wiki/Apple",
    "https://fr.wikipedia.org/wiki/Apple",
    "https://EN.WIKIPEDIA.ORG.evil.test/wiki/Apple",
    "https://en.wikipedia.org/w/index.php/title/Apple",
    "ftp://en.wikipedia.org/wiki/Apple",
  ])("P4 requires an explicit exact English Wikipedia HTTPS article URL: %s", (href) => {
    expect(extractTitleFromHref(href)).toBeNull();
  });

  it.each(["/wiki/Bad%", "/wiki/Bad%2", "/wiki/Bad%ZZ"])(
    "P5 rejects malformed percent escapes: %s",
    (href) => {
      expect(extractTitleFromHref(href)).toBeNull();
    },
  );

  it.each([
    "/w/index.php?title=Missing_article&action=edit&redlink=1",
    "/wiki/Missing_article?redlink=1",
  ])("P6 rejects MediaWiki red-link targets: %s", (href) => {
    expect(extractTitleFromHref(href)).toBeNull();
  });

  it("P7 blocks every recognized English Wikipedia non-main namespace", () => {
    const blocked = [
      "Media:Example.ogg",
      "Special:Random",
      "Talk:Philosophy",
      "User:Example",
      "User talk:Example",
      "Wikipedia:About",
      "Wikipedia talk:About",
      "WP:About",
      "WT:About",
      "Project:About",
      "Project talk:About",
      "File:Apple.jpg",
      "File talk:Apple.jpg",
      "Image:Apple.jpg",
      "Image talk:Apple.jpg",
      "MediaWiki:Common.css",
      "MediaWiki talk:Common.css",
      "Template:Infobox",
      "Template talk:Infobox",
      "TM:Infobox",
      "Help:Contents",
      "Help talk:Contents",
      "Category:Physics",
      "Category talk:Physics",
      "Portal:Current events",
      "Portal talk:Current events",
      "Draft:Example",
      "Draft talk:Example",
      "MOS:Example",
      "MOS talk:Example",
      "Event:Example",
      "Event talk:Example",
      "Education Program:Example",
      "Education Program talk:Example",
      "TimedText:Example.ogv.en.srt",
      "TimedText talk:Example.ogv.en.srt",
      "Module:Example",
      "Module talk:Example",
      "Gadget:Example",
      "Gadget talk:Example",
      "Gadget definition:Example",
      "Gadget definition talk:Example",
      "Topic:Example",
    ];

    for (const [index, title] of blocked.entries()) {
      const href = `/wiki/${title.replaceAll(" ", index % 2 === 0 ? "_" : "%20")}`;
      const caseVariant =
        index % 2 === 0
          ? href.toUpperCase().replace("/WIKI/", "/wiki/")
          : href;
      expect(isAllowedArticleHref(caseVariant), caseVariant).toBe(false);
      expect(extractTitleFromHref(caseVariant), caseVariant).toBeNull();
    }
  });

  it.each([
    "/wiki/User__talk:Example",
    "/wiki/USER_%20_TALK:Example",
    "/wiki/Project__talk:About",
    "/wiki/Education__Program:Example",
    "/wiki/education_%20_program_TALK:Example",
  ])(
    "collapses MediaWiki-equivalent namespace whitespace before classification: %s",
    (href) => {
      expect(isAllowedArticleHref(href)).toBe(false);
      expect(extractTitleFromHref(href)).toBeNull();
    },
  );

  it.each([
    "/wiki/:Category:Physics",
    "/wiki/:%20User__talk:Example",
    "/wiki/::Template:Infobox",
  ])("rejects leading-colon namespace escapes: %s", (href) => {
    expect(isAllowedArticleHref(href)).toBe(false);
    expect(extractTitleFromHref(href)).toBeNull();
  });

  it("does not treat a colon in an ordinary mainspace title as a namespace", () => {
    const allowed = [
      "/wiki/Star_Trek:_The_Next_Generation",
      "/wiki/2001:_A_Space_Odyssey_(film)",
    ];

    for (const href of allowed) {
      expect(isAllowedArticleHref(href)).toBe(true);
    }
  });

  it.each([
    ["Mission: Impossible", "Mission: Impossible"],
    ["Star Trek: The Next Generation", "Star Trek: The Next Generation"],
    ["AC%2FDC", "AC/DC"],
    ["https://en.wikipedia.org/wiki/Mission:_Impossible#Cast", "Mission: Impossible"],
  ])("accepts valid manual mainspace titles with colons: %s", (input, title) => {
    expect(parseWikipediaArticleInput(input)?.title).toBe(title);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "mailto:editor@example.com",
    "ftp://en.wikipedia.org/wiki/Moon",
    "http://en.wikipedia.org/wiki/Moon",
    "https://fr.wikipedia.org/wiki/Moon",
    "https://en.wikipedia.org.evil.test/wiki/Moon",
    "https:Moon",
    "Education__Program:Example",
    "User__talk:Example",
  ])("rejects unsafe, external, and namespaced manual input: %s", (input) => {
    expect(parseWikipediaArticleInput(input)).toBeNull();
  });

  it("retains the original namespace regression examples", () => {
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
