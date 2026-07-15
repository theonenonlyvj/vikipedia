import { DOMParser as WorkerDOMParser } from "linkedom/worker";
import {
  createWikipediaGateway,
  type WikipediaGateway,
  WIKIMEDIA_API_USER_AGENT,
} from "../services/wikipediaGateway";
import { sanitizeWikipediaArticleHtml } from "../services/wikipediaSanitizer";

export function createWorkerWikipediaGateway(
  fetchImpl: typeof fetch,
): WikipediaGateway {
  const workerFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", WIKIMEDIA_API_USER_AGENT);
    return fetchImpl(input, { ...init, headers });
  };
  return createWikipediaGateway({
    fetchImpl: workerFetch,
    sanitizeHtml: (rawHtml, currentTitle) => sanitizeWikipediaArticleHtml(
      rawHtml,
      currentTitle,
      { parseDocument: parseWorkerDocument },
    ),
  });
}

function parseWorkerDocument(rawHtml: string): Document {
  const document = new WorkerDOMParser().parseFromString(
    "<!doctype html><html><head></head><body></body></html>",
    "text/html",
  );
  document.body.innerHTML = rawHtml;
  return document as unknown as Document;
}
