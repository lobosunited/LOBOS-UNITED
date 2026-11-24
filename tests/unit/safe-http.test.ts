import { describe, expect, it } from "vitest";
import {
  fetchSafe,
  isPublicAddress,
  isRobotsPathAllowed,
  parseRobotsRules,
  validateHttpsUrl,
} from "../../scripts/lib/safe-http.mjs";

const safeFetch = (url: string, options: Record<string, unknown>) =>
  Reflect.apply(fetchSafe, undefined, [url, options]) as Promise<{ text: string }>;
const hosts = ["example.com", "www.example.com"];
const publicResolver = async (): Promise<Array<{ address: string; family: number }>> => [{ address: "93.184.216.34", family: 4 }];
const resolver = publicResolver as unknown;

describe("safe external research requests", () => {
  it.each([
    "http://example.com/robots.txt",
    "file:///etc/passwd",
    "https://user:pass@example.com/",
    "https://example.com:8443/",
    "https://evil.example/",
    "https://127.0.0.1/",
    "https://localhost/",
  ])("rejects invalid or non-allowlisted URL %s", (url) => {
    expect(() => validateHttpsUrl(url, hosts)).toThrow();
  });

  it("rejects private, reserved, and link-local DNS results", () => {
    for (const address of [
      "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
      "172.16.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "::1",
      "fc00::1", "fe80::1", "ff02::1", "2001:db8::1",
    ]) expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("validates a sitemap URL before any request is made", async () => {
    let requests = 0;
    await expect(safeFetch("https://127.0.0.1/sitemap.xml", {
      allowedHosts: hosts,
      request: async () => { requests += 1; return { status: 200, headers: {}, text: "" }; },
      resolver,
    })).rejects.toThrow();
    await expect(safeFetch("https://other.example/sitemap.xml", {
      allowedHosts: hosts,
      request: async () => { requests += 1; return { status: 200, headers: {}, text: "" }; },
      resolver,
    })).rejects.toThrow(/allowlist/);
    expect(requests).toBe(0);
  });

  it("blocks redirects to internal targets before following them", async () => {
    let requests = 0;
    await expect(safeFetch("https://example.com/start", {
      allowedHosts: hosts,
      resolver: publicResolver,
      request: async () => {
        requests += 1;
        return { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" }, text: "" };
      },
    })).rejects.toThrow();
    expect(requests).toBe(1);
  });

  it("allows a validated HTTPS request and a validated same-source redirect", async () => {
    const seen: string[] = [];
    const result = await safeFetch("https://example.com/start", {
      allowedHosts: hosts,
      resolver,
      request: async (url: URL) => {
        seen.push(url.href);
        return seen.length === 1
          ? { status: 301, headers: { location: "https://www.example.com/final" }, text: "" }
          : { status: 200, headers: { "content-type": "text/plain" }, text: "ok" };
      },
    });
    expect(seen).toEqual(["https://example.com/start", "https://www.example.com/final"]);
    expect(result.text).toBe("ok");
  });

  it("honors user-agent disallow rules, allow exceptions, wildcards, and crawl delay", () => {
    const rules = parseRobotsRules(`User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.zip$\nCrawl-delay: 2`);
    expect(rules.crawlDelayMs).toBe(2000);
    expect(isRobotsPathAllowed("https://example.com/private/item", rules.rules)).toBe(false);
    expect(isRobotsPathAllowed("https://example.com/private/public/item", rules.rules)).toBe(true);
    expect(isRobotsPathAllowed("https://example.com/assets/archive.zip", rules.rules)).toBe(false);
    expect(isRobotsPathAllowed("https://example.com/public", rules.rules)).toBe(true);
  });
});
