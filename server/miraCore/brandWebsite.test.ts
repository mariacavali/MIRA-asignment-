import { describe, expect, it, vi } from "vitest";
import { extractBrandPage, isPublicBrandAddress, publicBrandUrl, readBrandPage } from "./brandWebsite";
import { clientBriefInputSchema } from "../../shared/miraClientBrief";

const html = '<html><title>Studio &amp; craft</title><body><main><h1>Thoughtful furniture for small homes</h1><p>We make adaptable furniture by hand, working with local materials and helping people feel at home in smaller spaces.</p><script>private code must not enter the text</script></main></body></html>';

describe("public brand page reader", () => {
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "198.18.0.1", "192.0.2.1", "224.0.0.1", "::1", "::ffff:127.0.0.1"])("refuses non-public or unsupported address %s", address => {
    expect(isPublicBrandAddress(address)).toBe(false);
  });
  it("accepts public IPv4 but rejects credentials, custom ports and alternate URL schemes", () => {
    expect(isPublicBrandAddress("93.184.216.34")).toBe(true);
    for (const url of ["http://brand.com", "https://a:b@brand.com", "https://brand.com:444", "file:///etc/passwd", "https://127.1", "https://metadata.internal", "https://[::1]"]) expect(() => publicBrandUrl(url)).toThrow();
    expect(clientBriefInputSchema.parse({ brandFeel: [], posingSupport: null, comfortNote: "", brandUrls: ["www.brand.com"] }).brandUrls).toEqual(["https://www.brand.com/"]);
  });
  it("extracts bounded page text, without scripts or markup", () => {
    const page = extractBrandPage(html);
    expect(page.title).toBe("Studio & craft");
    expect(page.excerpt).toContain("adaptable furniture");
    expect(page.excerpt).not.toContain("private code");
    expect(page.excerpt).not.toContain("<");
    expect(() => extractBrandPage("<title>Just a moment</title>" + "checking your browser ".repeat(20))).toThrow();
  });
  it("never fetches when any DNS answer is private", async () => {
    const fetch = vi.fn();
    const result = await readBrandPage("https://brand.com", { resolve: async () => ["93.184.216.34", "127.0.0.1"], fetch });
    expect(result.status).toBe("unavailable");
    expect(result.excerpt).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("pins the resolved address and checks redirect DNS again", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 302, location: "https://other.com/private", html: "" });
    const resolve = vi.fn().mockResolvedValueOnce(["93.184.216.34"]).mockResolvedValueOnce(["169.254.169.254"]);
    expect((await readBrandPage("https://brand.com", { resolve, fetch })).status).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toBe("93.184.216.34");
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it("reads one page, and does not visit the links embedded in it", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, html });
    const result = await readBrandPage("https://brand.com", { resolve: async () => ["93.184.216.34"], fetch });
    expect(result).toMatchObject({ status: "read", url: "https://brand.com/", title: "Studio & craft" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds redirect chains", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 302, location: "/again", html: "" });
    const result = await readBrandPage("https://brand.com", { resolve: async () => ["93.184.216.34"], fetch });
    expect(result.status).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
