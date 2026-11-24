import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const importRunsRoot = path.join(ROOT, "data/database/import-runs");
const requestedRunId = process.argv[2];
const runId = requestedRunId ?? fs.readdirSync(importRunsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right))
  .at(-1);
if (!runId || path.basename(runId) !== runId) {
  throw new Error("Provide a valid import run directory, or create one before normalizing.");
}
const RUN = path.resolve(importRunsRoot, runId);
const importRunsPrefix = `${path.resolve(importRunsRoot)}${path.sep}`;
if (!RUN.startsWith(importRunsPrefix)) {
  throw new Error("Import run must stay inside data/database/import-runs.");
}
if (!fs.statSync(RUN, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Import run directory not found: ${runId}`);
}
const OUT = path.join(ROOT, "data/database/normalized");

fs.mkdirSync(OUT, { recursive: true });

function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(RUN, file), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  const target = path.join(OUT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf8");
}

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value;
}

const imported = readJSON("records.json", []);
const gtadb = readJSON("raw/gtadb-landmarks.json", {});
const fullLocations = readJSON("raw/fullsweep-locations.json", {});
const fullLandmarks = readJSON("raw/fullsweep-landmarks.json", {});

const entities = new Map();
const mapLocations = [];
const coordinateOnly = [];
const researchPages = [];
const rejected = [];

function addEntity(record) {
  const name = clean(record.name);
  if (!name || name.length < 2) return;

  const category = slug(record.category || "uncategorized");
  const key = `${category}:${slug(name)}`;

  if (!entities.has(key)) {
    entities.set(key, {
      id: `entity:${key}`,
      name,
      category,
      description: clean(record.description) || "",
      aliases: [],
      attributes: {},
      relations: [],
      sources: [],
      images: [],
      reliability: null,
      verifiedInGame: null,
      spoiler: false,
      mapCoordinates: null,
      gtadbLandmarkId: null
    });
  }

  const entity = entities.get(key);

  if (record.name && record.name !== entity.name &&
      !entity.aliases.includes(record.name)) {
    entity.aliases.push(record.name);
  }

  if (record.description && !entity.description) {
    entity.description = record.description;
  }

  if (record.attributes && typeof record.attributes === "object") {
    entity.attributes = { ...entity.attributes, ...record.attributes };
  }

  if (Array.isArray(record.relations)) {
    entity.relations.push(...record.relations);
  }

  if (Array.isArray(record.sources)) {
    entity.sources.push(...record.sources);
  }

  if (Array.isArray(record.images)) {
    entity.images.push(...record.images);
  }

  if (record.image) entity.images.push(record.image);

  if (record.source || record.sourceUrl) {
    entity.sources.push({
      site: record.source || "Unknown",
      url: record.sourceUrl || record.externalUrl || null,
      attribution: record.attribution || null
    });
  }

  if (record.externalUrl) {
    entity.sources.push({
      site: record.source || "External",
      url: record.externalUrl
    });
  }

  if (record.reliability) entity.reliability = record.reliability;
  if (record.verifiedInGame !== undefined) {
    entity.verifiedInGame = record.verifiedInGame;
  }
  if (record.spoiler) entity.spoiler = true;

  if (record.externalId && !entity.attributes.externalIds) {
    entity.attributes.externalIds = [];
  }
  if (record.externalId) {
    entity.attributes.externalIds.push(record.externalId);
  }

  if (record.landmarkId) entity.gtadbLandmarkId = record.landmarkId;
}

function dedupeArray(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 1. Import genuine structured records.
// Website page metadata is retained separately as research.
for (const record of imported) {
  if (!record || typeof record !== "object") continue;

  if (record.pageType === "public-page" || record.schemaType) {
    researchPages.push(record);
    continue;
  }

  if (record.source === "GTADB.org") {
    coordinateOnly.push(record);
    continue;
  }

  addEntity(record);
}

// 2. FullSweep named locations.
// These coordinates belong to the FullSweep map projection.
for (const item of (fullLocations.locations || [])) {
  if (!item.title || !Number.isFinite(item.x) || !Number.isFinite(item.y)) {
    rejected.push({ source: "FullSweep locations", item });
    continue;
  }

  const location = {
    id: `fullsweep:${item.id}`,
    name: item.title,
    category: slug(item.cat || "location"),
    region: item.region || null,
    description: item.desc || "",
    evidence: {
      source: item.source || "unknown",
      foundBy: item.foundBy || null,
      activity: item.act ?? null,
      character: item.character || null
    },
    mapCoordinates: {
      x: item.x,
      y: item.y,
      system: "FullSweep map pixels",
      mapWidth: 3344,
      mapHeight: 4820
    },
    sourceUrl: item.sourceUrl || null,
    attribution: "FullSweep"
  };

  mapLocations.push(location);
  addEntity({
    name: location.name,
    category: location.category,
    description: location.description,
    source: "FullSweep",
    sourceUrl: location.sourceUrl,
    attributes: {
      region: location.region,
      evidence: location.evidence
    }
  });
}

// 3. FullSweep landmarks.
// Match GTADB in-game coordinates only when a GTADB ID is explicitly
// present in the landmark source note.
const gtadbById = new Map(
  (gtadb.results || []).map(item => [String(item.id), item])
);

for (const item of (fullLandmarks.landmarks || [])) {
  if (!item.title || !Number.isFinite(item.x) || !Number.isFinite(item.y)) {
    rejected.push({ source: "FullSweep landmarks", item });
    continue;
  }

  const note = item.sourceNote || "";
  const match = note.match(/\bL\d+\b/);
  const gtadbId = match ? match[0] : null;
  const original = gtadbId ? gtadbById.get(gtadbId) : null;

  const location = {
    id: `fullsweep:${item.id}`,
    name: item.title,
    category: slug(item.kind || "landmark"),
    description: note,
    reliability: item.reliability || "unknown",
    mapCoordinates: {
      x: item.x,
      y: item.y,
      system: "FullSweep map pixels",
      mapWidth: 3344,
      mapHeight: 4820
    },
    gtadbLandmarkId: gtadbId,
    inGameCoordinates: original?.ig_coordinates
      ? {
          x: original.ig_coordinates[0],
          y: original.ig_coordinates[1],
          system: "GTADB in-game coordinates"
        }
      : null,
    sourceUrl: "https://fullsweepmap.com/api/v1/landmarks",
    attribution: "GTADB.org and contributors — CC BY 4.0"
  };

  mapLocations.push(location);

  addEntity({
    name: location.name,
    category: location.category,
    description: location.description,
    source: "FullSweep / GTADB contributors",
    sourceUrl: location.sourceUrl,
    attribution: location.attribution,
    attributes: {
      reliability: location.reliability,
      regionEvidence: note
    },
    landmarkId: gtadbId
  });
}

// 4. Keep anonymous GTADB coordinate records independently.
// Never pretend an ID such as L1 is a confirmed place name. The imported
// records already carry their source coordinates; do not mutate them here.

// 5. Clean and deduplicate source references and relationships.
const normalizedEntities = [...entities.values()].map(entity => ({
  ...entity,
  aliases: dedupeArray(entity.aliases, slug),
  sources: dedupeArray(
    entity.sources,
    source => source.url || `${source.site}:${source.attribution || ""}`
  ),
  relations: dedupeArray(
    entity.relations,
    relation => `${relation.rel || ""}:${relation.id || relation.name || ""}`
  ),
  images: dedupeArray(entity.images, image =>
    typeof image === "string" ? image : JSON.stringify(image)
  )
}));

const categoryGroups = {};
for (const entity of normalizedEntities) {
  (categoryGroups[entity.category] ||= []).push(entity);
}

const sourceCounts = {};
for (const entity of normalizedEntities) {
  for (const source of entity.sources) {
    const name = source.site || "Unknown";
    sourceCounts[name] = (sourceCounts[name] || 0) + 1;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  originalImport: "2026-11-22T16-53-23-983Z",
  totals: {
    importedRecords: imported.length,
    normalizedEntities: normalizedEntities.length,
    mapLocations: mapLocations.length,
    fullSweepNamedLocations: (fullLocations.locations || []).length,
    fullSweepLandmarks: (fullLandmarks.landmarks || []).length,
    gtadbCoordinateRecords: coordinateOnly.length,
    researchPages: researchPages.length,
    rejectedRecords: rejected.length,
    categories: Object.keys(categoryGroups).length
  },
  coordinateSystems: {
    fullSweep: "Map pixel coordinates, 3344 x 4820",
    gtadb: "In-game coordinates; not interchangeable with map pixels"
  },
  sourceCounts,
  attribution: [
    "FullSweep map data",
    "GTADB.org and contributors — CC BY 4.0",
    "ViceCityApp and its cited community sources",
    "Rockstar Games official artwork remains separately credited"
  ]
};

writeJSON("entities.json", normalizedEntities);
writeJSON("map-locations.json", mapLocations);
writeJSON("gtadb-coordinate-records.json", coordinateOnly);
writeJSON("research-pages.json", researchPages);
writeJSON("rejected-records.json", rejected);
writeJSON("report.json", report);

for (const [category, items] of Object.entries(categoryGroups)) {
  writeJSON(`categories/${category}.json`, items);
}

writeJSON("manifest.json", {
  version: 1,
  generatedAt: report.generatedAt,
  files: [
    "entities.json",
    "map-locations.json",
    "gtadb-coordinate-records.json",
    "research-pages.json",
    "rejected-records.json",
    "report.json"
  ],
  coordinateSystems: report.coordinateSystems
});

console.log("\n========== NORMALIZATION COMPLETE ==========");
console.log(JSON.stringify(report.totals, null, 2));
console.log("\nOutput:", path.relative(ROOT, OUT));
console.log("Original import preserved.");
