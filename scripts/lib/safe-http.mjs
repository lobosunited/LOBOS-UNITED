import dns from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";

const privateV4 = new BlockList();
for (const [range, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) privateV4.addSubnet(range, prefix, "ipv4");

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const privateV6 = new BlockList();
for (const [range, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16],
  ["3fff::", 20], ["64:ff9b:1::", 48], ["100::", 64],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) privateV6.addSubnet(range, prefix, "ipv6");

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !privateV4.check(address, "ipv4");
  if (family === 6) return globalV6.check(address, "ipv6") && !privateV6.check(address, "ipv6");
  return false;
}

function hostSet(allowedHosts) {
  return new Set([...allowedHosts].map((host) => String(host).toLowerCase()));
}

export function validateHttpsUrl(input, allowedHosts) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Request URL is invalid.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS request URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials in request URLs are not allowed.");
  if (url.port && url.port !== "443") throw new Error("Only the standard HTTPS port is allowed.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname.endsWith(".") || isIP(hostname) || !hostSet(allowedHosts).has(hostname)) {
    throw new Error("Request hostname is outside the explicit allowlist.");
  }
  url.hash = "";
  return url;
}

async function resolvePublicAddresses(hostname, resolver) {
  const addresses = await resolver(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error("Request host did not resolve.");
  if (addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Request host resolved to a private, reserved, or non-public IP address.");
  }
  return addresses;
}

function requestHttps(url, addresses, { headers, timeoutMs, maxResponseBytes }) {
  return new Promise((resolve, reject) => {
    const lookup = (hostname, options, callback) => {
      if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
        callback(new Error("Unexpected hostname in HTTPS lookup."));
        return;
      }
      if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    };
    const request = https.request(url, {
      method: "GET",
      agent: false,
      maxHeaderSize: 16 * 1024,
      lookup,
      headers: { ...headers, "accept-encoding": "identity" },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          request.destroy(new Error(`Response exceeds the ${maxResponseBytes}-byte safety limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: {
          location: response.headers.location,
          "content-type": response.headers["content-type"] ?? "",
          "content-length": response.headers["content-length"],
        },
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchSafe(input, {
  allowedHosts,
  headers = {},
  resolver = dns.lookup,
  request = requestHttps,
  beforeRequest,
  maxRedirects = 3,
  timeoutMs = 15_000,
  maxResponseBytes = 10 * 1024 * 1024,
  allowNotFound = false,
} = {}) {
  if (!allowedHosts || allowedHosts.length === 0) throw new Error("An explicit hostname allowlist is required.");
  let url = validateHttpsUrl(input, allowedHosts);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const addresses = await resolvePublicAddresses(url.hostname, resolver);
    await beforeRequest?.(url);
    const response = await request(url, addresses, { headers, timeoutMs, maxResponseBytes });
    const location = response.headers?.location;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!location) throw new Error("Redirect response did not include a location.");
      if (hop === maxRedirects) throw new Error("Request exceeded the redirect limit.");
      url = validateHttpsUrl(new URL(location, url).href, allowedHosts);
      continue;
    }
    if (allowNotFound && response.status === 404) {
      return { ...response, url: url.href };
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request failed with HTTP ${response.status}.`);
    }
    if (Buffer.byteLength(response.text, "utf8") > maxResponseBytes) {
      throw new Error(`Response exceeds the ${maxResponseBytes}-byte safety limit.`);
    }
    const contentLength = Number(response.headers?.["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new Error(`Response exceeds the ${maxResponseBytes}-byte safety limit.`);
    }
    return { ...response, url: url.href };
  }
  throw new Error("Request redirect handling failed safely.");
}

export function parseRobotsRules(text, productToken = "LOBOS-UNITED-Leonida-Atlas") {
  const groups = [];
  let group = null;
  let hasDirective = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === "user-agent") {
      if (!group || hasDirective) {
        if (group) groups.push(group);
        group = { agents: [], rules: [], crawlDelayMs: 0 };
        hasDirective = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (name === "allow" || name === "disallow") && value) {
      group.rules.push({ type: name, path: value });
      hasDirective = true;
    } else if (group && name === "crawl-delay") {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) {
        throw new Error("robots.txt contains an invalid Crawl-delay.");
      }
      group.crawlDelayMs = Math.max(group.crawlDelayMs, seconds * 1000);
      hasDirective = true;
    }
  }
  if (group) groups.push(group);
  const token = productToken.toLowerCase();
  const matching = groups.filter((candidate) => candidate.agents.some((agent) =>
    agent === "*" || (agent && token.includes(agent)),
  ));
  return {
    rules: matching.flatMap((candidate) => candidate.rules),
    crawlDelayMs: Math.max(0, ...matching.map((candidate) => candidate.crawlDelayMs)),
  };
}

function robotsPatternMatches(path, pattern) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

export function isRobotsPathAllowed(url, rules = []) {
  const parsed = url instanceof URL ? url : new URL(url);
  const target = `${parsed.pathname}${parsed.search}`;
  const matches = rules
    .filter((rule) => robotsPatternMatches(target, rule.path))
    .sort((left, right) => right.path.replace(/[*$]/g, "").length - left.path.replace(/[*$]/g, "").length);
  if (!matches.length) return true;
  const specificity = matches[0].path.replace(/[*$]/g, "").length;
  return matches.filter((rule) => rule.path.replace(/[*$]/g, "").length === specificity)
    .some((rule) => rule.type === "allow");
}
