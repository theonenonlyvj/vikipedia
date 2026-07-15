export interface ResolveApiOriginOptions {
  production?: boolean;
}

export function resolveApiOrigin(
  value: string | undefined,
  options: ResolveApiOriginOptions = {},
): string {
  const configured = (value ?? "").trim();

  if (!configured && !options.production) {
    return "";
  }
  const origin = readCanonicalApiOrigin(configured, !options.production);
  if (!origin) {
    throw new Error(
      options.production
        ? "VITE_VWIKI_RACE_API_URL must be a configured HTTPS Worker origin for production builds."
        : "VITE_VWIKI_RACE_API_URL must be a canonical HTTPS or loopback HTTP origin.",
    );
  }

  return origin;
}

function readCanonicalApiOrigin(value: string, allowLoopbackHttp: boolean): string | null {
  try {
    const url = new URL(value);
    const validProtocol = url.protocol === "https:" ||
      (allowLoopbackHttp && url.protocol === "http:" && isLoopback(url.hostname));
    const valid = validProtocol &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      (value === url.origin || value === `${url.origin}/`);
    return valid ? url.origin : null;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
