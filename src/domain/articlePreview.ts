import type { Article } from "./types";

const MAX_BLURB_LENGTH = 360;

export interface ArticlePreview {
  blurb: string | null;
}

export function extractArticlePreview(article: Article): ArticlePreview {
  const document = new DOMParser().parseFromString(article.sanitizedHtml, "text/html");
  const paragraph = [...document.body.querySelectorAll("p")]
    .map((element) => normalizeText(element.textContent ?? ""))
    .find(Boolean) ?? null;
  return {
    blurb: paragraph ? boundBlurb(paragraph) : null,
  };
}

function boundBlurb(value: string): string {
  if (value.length <= MAX_BLURB_LENGTH) return value;
  const candidate = value.slice(0, MAX_BLURB_LENGTH + 1);
  const boundary = candidate.lastIndexOf(" ");
  const bounded = boundary > 0
    ? candidate.slice(0, boundary)
    : candidate.slice(0, MAX_BLURB_LENGTH);
  return `${bounded.trimEnd()}...`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
