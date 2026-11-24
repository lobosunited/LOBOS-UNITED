import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fetchSafe, isRobotsPathAllowed, parseRobotsRules, validateHttpsUrl } from "./lib/safe-http.mjs";

const ROOT = process.cwd();
const RUN = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, "data", "database", "import-runs", RUN);
const RAW = path.join(OUT, "raw");
const UA = "LOBOS-UNITED-Leonida-Atlas/1.0";
const PAGE_LIMIT = Number(process.env.ATLAS_PAGE_LIMIT || 100);
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_PAGES = 800;
const MAX_SITEMAPS = 10;
const MIN_REQUEST_INTERVAL_MS = 1000;
const ROBOTS_AGENT = "LOBOS-UNITED-Leonida-Atlas";
const robotsPolicies = new Map();
const lastRequestAt = new Map();

if (!Number.isSafeInteger(PAGE_LIMIT) || PAGE_LIMIT < 1 || PAGE_LIMIT > 300) {
  throw new Error("ATLAS_PAGE_LIMIT must be an integer between 1 and 300.");
}

const report = {
  runId: RUN,
  startedAt: new Date().toISOString(),
  sources: [],
  warnings: [],
  limitations: [],
  counts: {}
};

const records = [];
const visited = new Set();

const sources = [
  { name: "GTABase", base: "https://www.gtabase.com", seeds: ["/gta-6/map/"] },
  { name: "AllThingsGTA", base: "https://allthingsgta.com", seeds: ["/database/"] },
  { name: "GTA6Intel", base: "https://gta6intel.com", seeds: ["/"] },
  { name: "GTA6Replay", base: "https://gta6replay.com", seeds: ["/"] },
  { name: "GTAClub", base: "https://gtaclub.app", seeds: ["/"] },
  { name: "LeonidaWaypoint", base: "https://leonidawaypoint.com", seeds: ["/database"] },
  { name: "GTA-VI.org", base: "https://gta-vi.org", seeds: ["/"] },
  { name: "ViceCityApp", base: "https://vice-city.app", seeds: ["/"] },
  { name: "GTA6Data", base: "https://gta6data.org", seeds: ["/"] },
  { name: "ProjectVice", base: "https://projectvice.com", seeds: ["/explore"] },
  { name: "FiveStarIntel", base: "https://fivestarintel.com", seeds: ["/"] }
];

const hash = value =>
  crypto.createHash("sha1").update(value).digest("hex").slice(0, 14);

const slug = value =>
  String(value || "").toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const clean = value =>
  String(value || "").replace(/\s+/g, " ").trim();

async function save(file, data) {
  const target = path.join(OUT, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data, null, 2), "utf8");
}

async function saveText(file, data) {
  const target = path.join(OUT, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data, "utf8");
}

const ALLOWED_HOSTNAMES = new Set(["www.gtabase.com", "allthingsgta.com", "gta6intel.com", "gta6replay.com", "gtaclub.app", "leonidawaypoint.com", "gta-vi.org", "vice-city.app", "gta6data.org", "projectvice.com", "fivestarintel.com", "fullsweepmap.com", "api.gtadb.org"]);
function allowedHostsForBase(base) {
  const hostname = new URL(base).hostname.toLowerCase();
  if (!ALLOWED_HOSTNAMES.has(hostname)) throw new Error(`Source hostname is not in importer allowlist: ${hostname}`);
  return [hostname];
}
function allowedHostsForUrl(value) { return allowedHostsForBase(value); }

async function get(url, accept = "*/*", allowedHosts = allowedHostsForUrl(url), extraHeaders = {}, options = {}) {
  const response = await fetchSafe(url, {
    allowedHosts, headers: { "user-agent": UA, accept, ...extraHeaders },
    maxResponseBytes: MAX_RESPONSE_BYTES, timeoutMs: 15_000, maxRedirects: 3,
    allowNotFound: options.allowNotFound === true,
    beforeRequest: async (requestUrl) => {
      const policy = robotsPolicies.get(requestUrl.hostname.toLowerCase());
      if (!options.skipRobots && policy && !isRobotsPathAllowed(requestUrl, policy.rules)) throw new Error(`robots.txt disallows ${requestUrl.pathname}`);
      const delay = Math.max(MIN_REQUEST_INTERVAL_MS, policy?.crawlDelayMs ?? 0);
      const hostname = requestUrl.hostname.toLowerCase();
      const wait = (lastRequestAt.get(hostname) ?? 0) + delay - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt.set(hostname, Date.now());
    },
  });
  return { text: response.text, type: response.headers?.["content-type"] || "", finalUrl: response.url, status: response.status, ok: response.status >= 200 && response.status < 300 };
}

async function getJson(url, allowedHosts = allowedHostsForUrl(url)) {
  const response = await get(url, "application/json,*/*", allowedHosts);
  return JSON.parse(response.text);
}

function add(source, url, category, item) {
  const name = clean(item.name || item.title || item.headline);
  if (!name) return;

  records.push({
    id: `${slug(source)}:${hash(url + name)}`,
    name,
    category: slug(category) || "uncategorized",
    description: clean(item.description || item.summary || item.desc),
    source,
    sourceUrl: url,
    importedAt: new Date().toISOString(),
    ...item.extra
  });
}

function getRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  for (const key of ["data", "results", "locations", "landmarks", "items"]) {
    if (Array.isArray(value[key])) return value[key];
  }

  return [];
}

function textFromHtml(html) {
  return clean(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

function metadata(html, key) {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)`,
    "i"
  );
  return clean(html.match(regex)?.[1]);
}

function titleFromHtml(html) {
  return clean(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]*>/g, "")
  );
}

function parseJsonLd(html) {
  const output = [];

  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const value = JSON.parse(match[1]);
      const stack = [value];

      while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;

        if (Array.isArray(current)) {
          stack.push(...current);
          continue;
        }

        output.push(current);

        if (current["@graph"]) stack.push(...current["@graph"]);
      }
    } catch {
      // Malformed JSON-LD is skipped; page text and other structured data remain usable.
    }
  }

  return output;
}

function parseSitemap(xml) {
  return [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map(x => x[1].replace(/&amp;/g, "&").trim());
}

function categoryFor(url, schemaType = "") {
  const value = `${url} ${schemaType}`.toLowerCase();

  const categories = [
    ["vehicles", /vehicle|car|truck|boat|aircraft/],
    ["weapons", /weapon|gun|firearm/],
    ["characters", /character|person|cast/],
    ["missions", /mission|story|walkthrough/],
    ["collectibles", /collectible|hidden-package|treasure/],
    ["businesses", /business|shop|store|restaurant/],
    ["activities", /activity|race|challenge|sport/],
    ["wildlife", /wildlife|animal|species/],
    ["locations", /location|landmark|map|region|district/],
    ["properties", /property|garage|safehouse/],
    ["radio", /radio|station|soundtrack|music/],
    ["cheats", /cheat|code/]
  ];

  return categories.find(([, regex]) => regex.test(value))?.[0] || "articles";
}

async function importFullSweep() {
  console.log("Importing FullSweep...");

  const base = "https://fullsweepmap.com/api/v1";

  for (const endpoint of ["stats", "locations", "landmarks"]) {
    try {
      const data = await getJson(`${base}/${endpoint}`);
      await save(`raw/fullsweep-${endpoint}.json`, data);

      if (endpoint === "stats") {
        report.fullSweepStats = data;
        continue;
      }

      const rows = getRows(data);

      for (const item of rows) {
        if (endpoint === "locations") {
          add("FullSweep", `${base}/locations/${item.id || ""}`,
            item.cat || "locations", {
              name: item.title || item.name,
              description: item.desc,
              extra: {
                region: item.region || null,
                coordinates: item.x != null && item.y != null
                  ? { x: Number(item.x), y: Number(item.y),
                      system: "FullSweep basemap pixels 3344x4820" }
                  : null,
                evidence: item.source || "unverified",
                evidenceUrl: item.sourceUrl || null,
                contributor: item.foundBy || null,
                character: item.character || null,
                act: item.act ?? null,
                attribution: "FullSweep, fullsweepmap.com — CC BY 4.0"
              }
            });
        } else {
          add("FullSweep / GTADB contributors", base + "/landmarks",
            (item.types || ["landmark"]).join("-"), {
              name: item.ig_address || item.name || item.id,
              extra: {
                landmarkId: item.id || null,
                coordinates: item.ig_coordinates
                  ? { x: Number(item.ig_coordinates[0]),
                      y: Number(item.ig_coordinates[1]),
                      system: "GTADB in-game coordinates" }
                  : null,
                realWorldAddress: item.rl_address || null,
                realWorldCoordinates: item.rl_coordinates || null,
                images: [item.ig_photo, item.rl_photo].filter(Boolean),
                attribution: "GTADB.org and contributors — CC BY 4.0"
              }
            });
        }
      }

      report.counts[`fullSweep_${endpoint}`] = rows.length;
      console.log(`  ${endpoint}: ${rows.length}`);
    } catch (error) {
      report.warnings.push(`FullSweep ${endpoint}: ${error.message}`);
    }
  }
}

async function importGTADB() {
  console.log("Importing GTADB landmarks...");

  const url = "https://api.gtadb.org/landmarks?gta=6";

  try {
    const data = await getJson(url);
    await save("raw/gtadb-landmarks.json", data);

    const rows = getRows(data);

    for (const item of rows) {
      add("GTADB.org", url, (item.types || ["landmark"]).join("-"), {
        name: item.ig_address || item.id,
        extra: {
          landmarkId: item.id || null,
          coordinates: item.ig_coordinates
            ? { x: Number(item.ig_coordinates[0]),
                y: Number(item.ig_coordinates[1]),
                system: "GTADB in-game coordinates" }
            : null,
          realWorldAddress: item.rl_address || null,
          realWorldCoordinates: item.rl_coordinates || null,
          images: [item.ig_photo, item.rl_photo].filter(Boolean),
          attribution: "GTADB.org and contributors"
        }
      });
    }

    report.counts.gtadbLandmarks = rows.length;
    console.log(`  GTADB: ${rows.length}`);
  } catch (error) {
    report.warnings.push(`GTADB: ${error.message}`);
  }
}

async function importViceCityDemo() {
  console.log("Importing Vice City API demonstration data...");

  const collections = [
    "characters", "locations", "vehicles", "weapons", "missions",
    "businesses", "activities", "collectibles", "wildlife",
    "radio-stations", "properties", "factions", "secrets",
    "trophies", "cheats", "manufacturers", "phone-apps"
  ];

  const apiKey = process.env.VICE_CITY_API_KEY || "vc_demo";
  const limited = apiKey === "vc_demo";

  if (limited) {
    report.limitations.push(
      "Vice City API vc_demo is demonstration access and returns only a small sample. A free registered key is required for larger catalogue retrieval."
    );
  }

  for (const collection of collections) {
    try {
      const url = `https://vice-city.app/api/v1/${collection}?lang=en&limit=25`;
      const response = await get(url, "application/json,*/*", allowedHostsForBase("https://vice-city.app"), { "x-api-key": apiKey });

      if (!response.ok) {
        report.warnings.push(`Vice City ${collection}: HTTP ${response.status}`);
        continue;
      }

      const data = JSON.parse(response.text);
      await save(`raw/vice-city/${collection}.json`, data);

      const rows = getRows(data);

      for (const item of rows) {
        add("ViceCityApp", item.url || url, collection, {
          name: item.name,
          description: item.summary,
          extra: {
            externalId: item.id || null,
            attributes: item.attributes || {},
            relations: item.relations || [],
            reliability: item.reliability || null,
            verifiedInGame: item.verified_in_game ?? null,
            spoiler: item.spoiler ?? false,
            sources: item.sources || [],
            externalUrl: item.url || null
          }
        });
      }

      report.counts[`viceCity_${collection}`] = rows.length;
      console.log(`  ${collection}: ${rows.length}`);
    } catch (error) {
      report.warnings.push(`Vice City ${collection}: ${error.message}`);
    }
  }
}

async function getSitemapUrls(source) {
  const allowedHosts = allowedHostsForBase(source.base);
  const sourceHost = new URL(source.base).hostname.toLowerCase();
  let robots;
  try { robots = await get(`${source.base}/robots.txt`, "text/plain,*/*", allowedHosts, {}, { allowNotFound: true, skipRobots: true }); }
  catch (error) { report.warnings.push(`${source.name} robots.txt unavailable; source skipped: ${error.message}`); return { pages: [], crawlable: false }; }
  const policy = parseRobotsRules(robots.status === 404 ? "" : robots.text, ROBOTS_AGENT);
  robotsPolicies.set(sourceHost, policy);
  if (robots.status !== 404) await saveText(`raw/robots/${slug(source.name)}.txt`, robots.text);
  const sitemapUrls = new Set([
    `${source.base}/sitemap.xml`,
    `${source.base}/sitemap_index.xml`
  ]);

  try {
    for (const match of robots.text.matchAll(/^sitemap:\s*(\S+)/gim)) {
      sitemapUrls.add(match[1]);
    }
  } catch {
    // 404 robots.txt has no sitemap directives.
  }

  const queue = [...sitemapUrls];
  const visitedMaps = new Set();
  const pages = new Set();

  while (queue.length && visitedMaps.size < MAX_SITEMAPS && pages.size < PAGE_LIMIT) {
    const candidate = queue.shift();
    let sitemap;
    try { sitemap = validateHttpsUrl(candidate, allowedHosts); } catch { continue; }
    if (sitemap.hostname.toLowerCase() !== sourceHost || visitedMaps.has(sitemap.href)) continue;
    visitedMaps.add(sitemap.href);

    try {
      if (!isRobotsPathAllowed(sitemap, policy.rules)) continue;
      const xml = (await get(sitemap.href, "application/xml,text/xml,*/*", allowedHosts)).text;
      const urls = parseSitemap(xml);

      for (const value of urls) {
        let url;
        try { url = validateHttpsUrl(value, allowedHosts); } catch { continue; }
        if (url.hostname.toLowerCase() !== sourceHost) continue;
        if (/\.xml$/i.test(url.pathname)) { if (queue.length + visitedMaps.size < MAX_SITEMAPS) queue.push(url.href); }
        else if (isRobotsPathAllowed(url, policy.rules)) pages.add(url.href);
        if (pages.size >= PAGE_LIMIT) break;
      }
    } catch (error) {
      report.warnings.push(`${source.name} sitemap: ${error.message}`);
    }
  }

  return { pages: [...pages], crawlable: true, policy };
}

async function crawlPage(source, url) {
  if (visited.has(url)) return;
  visited.add(url);

  try {
    const response = await get(url);
    if (!/html|xhtml/i.test(response.type) &&
        !response.text.slice(0, 500).includes("<html")) return;

    const html = response.text;
    const title = titleFromHtml(html);
    const description = metadata(html, "description") ||
      metadata(html, "og:description");
    const image = metadata(html, "og:image");
    const body = textFromHtml(html);

    const category = categoryFor(url);
    const canonical = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i
    )?.[1];

    add(source.name, canonical || url, category, {
      name: title,
      description: description || body.slice(0, 500),
      extra: {
        pageType: "public-page",
        image: image ? new URL(image, url).href : null
      }
    });

    for (const item of parseJsonLd(html)) {
      const name = item.name || item.headline;
      if (!name) continue;

      add(source.name, url, categoryFor(url, item["@type"]), {
        name,
        description: item.description || "",
        extra: {
          schemaType: item["@type"] || null,
          image: typeof item.image === "string"
            ? item.image
            : item.image?.url || null,
          sameAs: item.sameAs || []
        }
      });
    }

    // Preserve discoverable links to map and media resources.
    if (source.name === "GTABase") {
      const scripts = [...html.matchAll(
        /<script[^>]+src=["']([^"']+)["']/gi
      )].map(x => new URL(x[1], url).href);

      await save("raw/gtabase-script-references.json", scripts);
    }
  } catch (error) {
    report.warnings.push(`${source.name} ${url}: ${error.message}`);
  }
}

async function crawlSources() {
  for (const source of sources) {
    console.log(`Crawling ${source.name}...`);

    const discovery = await getSitemapUrls(source);
    if (!discovery.crawlable) continue;
    const discovered = discovery.pages;
    const seedUrls = source.seeds.map(p => new URL(p, source.base).href);
    const allowedHosts = allowedHostsForBase(source.base);
    const urls = [...new Set([...seedUrls, ...discovered])].filter((value) => {
      try { const url = validateHttpsUrl(value, allowedHosts); return url.hostname === new URL(source.base).hostname && isRobotsPathAllowed(url, discovery.policy.rules); } catch { return false; }
    }).slice(0, Math.min(PAGE_LIMIT, MAX_TOTAL_PAGES - visited.size));

    let successful = 0;
    for (const url of urls) { const before = visited.size; await crawlPage(source, url); if (visited.size > before) successful++; }

    report.sources.push({
      name: source.name,
      base: source.base,
      discoveredPages: discovered.length,
      attemptedPages: urls.length,
      readPages: successful
    });

    console.log(`  ${successful} pages read`);
  }
}

async function captureGTABaseMapResources() {
  console.log("Capturing GTABase map resources...");

  const base = "https://www.gtabase.com";
  const targets = [
    ["map-page.html", `${base}/gta-6/map/`],
    ["map-service-worker.js", `${base}/gtab-map-sw.js`]
  ];

  for (const [filename, url] of targets) {
    try {
      const result = await get(url);
      await saveText(`raw/gtabase/${filename}`, result.text);
    } catch (error) {
      report.warnings.push(`GTABase ${filename}: ${error.message}`);
    }
  }
}

function deduplicate(items) {
  const map = new Map();

  for (const item of items) {
    const key = `${slug(item.name)}|${item.category}`;

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const existing = map.get(key);
    existing.alsoFoundAt ||= [];

    existing.alsoFoundAt.push({
      source: item.source,
      sourceUrl: item.sourceUrl
    });

    if (!existing.description && item.description) {
      existing.description = item.description;
    }

    if (!existing.coordinates && item.coordinates) {
      existing.coordinates = item.coordinates;
    }

    if (!existing.image && item.image) {
      existing.image = item.image;
    }
  }

  return [...map.values()];
}

async function importExistingArtwork() {
  const manifestPath = path.join(
    ROOT, "ROCKSTAR_OFFICIAL_ARTWORK", "manifest.json"
  );

  try {
    const artwork = JSON.parse(
      await fs.readFile(manifestPath, "utf8")
    );

    await save("rockstar-artwork-index.json", {
      attribution: "Rockstar Games — Official Artwork",
      manifestPath: "ROCKSTAR_OFFICIAL_ARTWORK/manifest.json (local archive)",
      assets: artwork
    });

    console.log("Rockstar artwork manifest indexed.");
  } catch {
    report.warnings.push(
      "Rockstar optimized artwork manifest was not found."
    );
  }
}

console.log("\n========================================");
console.log("LOBOS UNITED — LEONIDA DATABASE IMPORT");
console.log("========================================\n");

await fs.mkdir(RAW, { recursive: true });

await importFullSweep();
await importGTADB();
await importViceCityDemo();
await captureGTABaseMapResources();
await crawlSources();
await importExistingArtwork();

console.log("\nNormalizing database...");

const requiredSourceCounts = [
  ["FullSweep locations", report.counts.fullSweep_locations],
  ["FullSweep landmarks", report.counts.fullSweep_landmarks],
  ["GTADB landmarks", report.counts.gtadbLandmarks],
];
const missingRequiredSources = requiredSourceCounts
  .filter(([, count]) => !Number.isSafeInteger(count) || count < 1)
  .map(([name]) => name);
if (missingRequiredSources.length || records.length === 0 || records.length > 200_000) {
  report.finishedAt = new Date().toISOString();
  report.counts.totalBeforeDeduplication = records.length;
  report.validationError = missingRequiredSources.length
    ? `Required sources returned no valid rows: ${missingRequiredSources.join(", ")}.`
    : records.length === 0
      ? "Import produced no records."
      : "Import exceeded the 200000-record safety limit.";
  await save("import-report.json", report);
  throw new Error(`${report.validationError} LATEST.json was not changed.`);
}

const unique = deduplicate(records);
const categories = {};

for (const item of unique) {
  categories[item.category] ||= [];
  categories[item.category].push(item);
}

await save("records.json", unique);
await save("sources.json", {
  generatedAt: new Date().toISOString(),
  sources: report.sources,
  attributions: [
    "FullSweep data: CC BY 4.0 — credit FullSweep, fullsweepmap.com.",
    "GTADB landmarks: GTADB.org and contributors, CC BY 4.0.",
    "Other site records are source-linked research metadata. Their original content and images remain subject to their publishers' terms.",
    "Rockstar official artwork remains credited to Rockstar Games."
  ]
});

for (const [category, items] of Object.entries(categories)) {
  await save(`categories/${category}.json`, items);
}

report.finishedAt = new Date().toISOString();
report.counts.totalBeforeDeduplication = records.length;
report.counts.totalAfterDeduplication = unique.length;
report.counts.categoryCount = Object.keys(categories).length;
report.counts.categories = Object.fromEntries(
  Object.entries(categories).map(([k, v]) => [k, v.length])
);

await save("import-report.json", report);
await save("manifest.json", {
  schemaVersion: "1.0.0",
  runId: RUN,
  generatedAt: new Date().toISOString(),
  recordCount: unique.length,
  categories: Object.keys(categories),
  records: "records.json",
  report: "import-report.json"
});

await save(
  path.join("..", "..", "LATEST.json"),
  {
    runId: RUN,
    path: path.relative(ROOT, OUT).replaceAll("\\", "/")
  }
);

console.log("\n========================================");
console.log("IMPORT COMPLETE");
console.log("========================================");
console.log(`Records: ${unique.length}`);
console.log(`Categories: ${Object.keys(categories).length}`);
console.log(`Output: ${path.relative(ROOT, OUT)}`);
console.log(`Warnings: ${report.warnings.length}`);
console.log("\nRead import-report.json for source coverage.");
