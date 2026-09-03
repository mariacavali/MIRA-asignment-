const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function isDevOrTestEnvironment() {
  return process.env.NODE_ENV !== "production";
}

/**
 * Validates and normalizes a configured public base URL (e.g. MIRA_PUBLIC_APP_BASE_URL,
 * or a request Origin used as a fallback). Every MIRA-generated absolute URL — email
 * links, signed access links, Stripe portal/checkout returns, calendar links — should
 * be built from the result of this function rather than a hand-rolled string.
 *
 * Throws on anything unsafe to redirect a browser to: credentials, a query string or
 * fragment (which could smuggle an open-redirect target), or a non-HTTPS origin outside
 * localhost in development/test. Trailing slashes are stripped so callers can safely
 * append a leading-slash path without producing "//".
 */
export function normalizePublicBaseUrl(rawBaseUrl: string): string {
  if (!rawBaseUrl) throw new Error("Public base URL is empty");
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error("Public base URL is not a valid absolute URL");
  }
  if (url.username || url.password) throw new Error("Public base URL must not contain credentials");
  if (url.search || url.hash) throw new Error("Public base URL must not contain a query string or fragment");
  const isLocalHost = LOCAL_HOSTNAMES.has(url.hostname);
  if (url.protocol !== "https:" && !(isDevOrTestEnvironment() && isLocalHost)) {
    throw new Error("Public base URL must use HTTPS");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Joins a normalized public base URL with a path, collapsing any doubled slash at the seam. */
export function buildPublicUrl(baseUrl: string, path: string): string {
  const base = normalizePublicBaseUrl(baseUrl);
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  return `${base}${normalizedPath}`;
}

/**
 * True only when `candidate` resolves (against `baseUrl`) to the exact same origin as
 * `baseUrl`. Use this to reject an open redirect before ever sending a browser to a
 * caller-influenced URL (e.g. a return/cancel path echoed back from a query string).
 */
export function isSameOriginUrl(candidate: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(candidate, base);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}
