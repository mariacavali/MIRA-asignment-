import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { normalizeBrandUrl, type BrandPage } from "../../shared/miraClientBrief";

// Public page text only. No browser, cookies, scripts, subresources or API key.
// Resolve and pin a public IPv4 address on EVERY hop, including redirects.
// https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
export function isPublicBrandAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function publicBrandUrl(raw: string): URL {
  const url = new URL(normalizeBrandUrl(raw));
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host) || host.includes(":") || /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host)) {
    throw new Error("Public website required");
  }
  return url;
}

function plainText(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^<>]*>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
      const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, entity: string) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ").trim();
}

export function extractBrandPage(html: string) {
  const title = plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 160);
  const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const excerpt = plainText(body).slice(0, 3500);
  if (excerpt.length < 100 || /access denied|just a moment|checking your browser|enable javascript|verify you are human/i.test(`${title} ${excerpt.slice(0, 200)}`)) {
    throw new Error("Page text unavailable");
  }
  return { title, excerpt };
}

const MAX_BYTES = 512 * 1024;
type PageResponse = { status: number; location?: string; html: string };
export async function fetchPinnedBrandPage(url: URL, address: string, signal: AbortSignal): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: address, servername: url.hostname, port: 443, method: "GET", agent: false,
      path: `${url.pathname}${url.search}`, signal, maxHeaderSize: 16 * 1024,
      headers: { Host: url.host, Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": "MIRA-BrandPreview/1.0" },
    }, res => {
      const status = res.statusCode ?? 0;
      res.on("error", reject);
      if ([301, 302, 303, 307, 308].includes(status)) {
        resolve({ status, location: res.headers.location, html: "" }); res.destroy(); return;
      }
      if (status !== 200 || !/^text\/html\b/i.test(res.headers["content-type"] ?? "") ||
        (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") || Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
        reject(new Error("Page unavailable")); res.destroy(); return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { reject(new Error("Page too large")); res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ status, html: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

const defaults = {
  resolve: async (host: string) => (await lookup(host, { all: true, family: 4 })).map(record => record.address),
  fetch: fetchPinnedBrandPage,
};

export async function readBrandPage(raw: string, deps = defaults): Promise<BrandPage> {
  const original = normalizeBrandUrl(raw);
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Race includes DNS: a resolver timeout cannot leave a request hanging.
    const page = await Promise.race([
      (async () => {
        let url = publicBrandUrl(original);
        for (let hop = 0; hop <= 2; hop++) {
          const addresses = await deps.resolve(url.hostname);
          if (controller.signal.aborted || !addresses.length || !addresses.every(isPublicBrandAddress)) throw new Error("Address unavailable");
          const result = await deps.fetch(url, addresses[0], controller.signal);
          if (result.status >= 300 && result.status < 400) {
            if (!result.location || hop === 2) throw new Error("Redirect unavailable");
            url = publicBrandUrl(new URL(result.location, url).toString());
            continue;
          }
          if (result.status !== 200) throw new Error("Page unavailable");
          return extractBrandPage(result.html);
        }
        throw new Error("Page unavailable");
      })(),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Page timed out")), { once: true })),
    ]);
    return { url: original, status: "read", ...page, checkedAt };
  } catch {
    return { url: original, status: "unavailable", title: "", excerpt: "", checkedAt };
  } finally { clearTimeout(timeout); controller.abort(); }
}
