import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const entitiesPath = path.join(root, "data/database/normalized/entities.json");
const normalizationReportPath = path.join(root, "data/database/normalized/report.json");
const outputDir = path.join(root, "public/assets/leonida-database/catalogs");
const vehiclesOnly = process.argv.includes("--vehicles-only");

for (const file of [entitiesPath]) {
  if (!fs.existsSync(file)) throw new Error(`Required file missing: ${file}`);
}

const entities = JSON.parse(fs.readFileSync(entitiesPath, "utf8"));
if (!Array.isArray(entities)) throw new Error("Unexpected entity database format.");

fs.mkdirSync(outputDir, { recursive: true });

const clean = (value) => String(value ?? "").trim();
const slug = (value) => clean(value).toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const vehicleMap = new Map();
const importedRun = fs.existsSync(normalizationReportPath)
  ? JSON.parse(fs.readFileSync(normalizationReportPath, "utf8")).originalImport
  : null;
const importedVehiclesPath = importedRun
  ? path.join(root, "data/database/import-runs", importedRun, "records.json")
  : null;
const importedRecords = importedVehiclesPath && fs.existsSync(importedVehiclesPath)
  ? JSON.parse(fs.readFileSync(importedVehiclesPath, "utf8"))
  : [];
const vehicleCandidates = [
  ...entities.filter((item) => String(item?.category ?? "").toLowerCase().includes("vehicle")),
  ...importedRecords.filter((item) =>
    String(item?.category ?? "").toLowerCase().includes("vehicle") &&
    item?.schemaType === "Thing" &&
    !item?.pageType,
  ),
];
function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
for (const item of vehicleCandidates) {
  if (!item || !clean(item.name)) continue;
  const key = slug(item.name);
  if (!key) continue;
  const previous = vehicleMap.get(key);
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const sourceUrl = clean(
    item.sourceUrl || item.url || sources.find((source) => /^https:\/\//.test(source?.url ?? ""))?.url,
  );
  const validSourceUrl = safeHttpsUrl(sourceUrl);
  if (!validSourceUrl) continue;
  const candidate = {
      id: clean(item.id) || `vehicle-${key}`,
      slug: key,
      name: clean(item.name),
      category: "vehicle",
      summary: clean(item.summary),
      description: clean(item.description),
      manufacturer: clean(item.manufacturer || item.make),
      vehicleClass: clean(item.vehicleClass || item.class || item.attributes?.class),
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      attributes: item.attributes ?? {},
      source: clean(item.source || sources.find((source) => source?.site)?.site),
      sourceUrl: validSourceUrl,
      evidence: item.verifiedInGame === true || item.verified === true
        ? "community verified in game"
        : "reported",
      verified: item.verifiedInGame === true || item.verified === true,
    };
  const quality = (record) =>
    Number(Boolean(record.description)) * 4 +
    Number(Boolean(record.sourceUrl)) * 3 +
    Number(Boolean(record.source)) * 2 +
    Number(record.verified) * 1;
  if (!previous || quality(candidate) > quality(previous)) {
    vehicleMap.set(key, candidate);
  }
}

const vehicles = [...vehicleMap.values()]
  .map(({ verified: _verified, ...vehicle }) => vehicle)
  .sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(
  path.join(outputDir, "vehicles.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), count: vehicles.length, vehicles }, null, 2)
);

if (vehiclesOnly) {
  const reportPath = path.join(outputDir, "catalog-build-report.json");
  const prior = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : {};
  const report = {
    ...prior,
    vehicleRecordsBeforeDeduplication: vehicleCandidates.length,
    uniqueVehicleRecords: vehicles.length,
    schemaVehicleRecords: importedRecords.filter((item) =>
      String(item?.category ?? "").toLowerCase().includes("vehicle") &&
      item?.schemaType === "Thing" &&
      !item?.pageType,
    ).length,
    vehicleSample: vehicles.slice(0, 12).map(({ name, manufacturer, vehicleClass, source }) => ({
      name,
      manufacturer,
      vehicleClass,
      source,
    })),
    generatedFiles: [
      ...(prior.generatedFiles ?? []),
      "public/assets/leonida-database/catalogs/vehicles.json",
    ].filter((file, index, files) => files.indexOf(file) === index),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const report = {
  vehicleRecordsBeforeDeduplication: entities.filter((x) => String(x?.category ?? "").toLowerCase().includes("vehicle")).length,
  uniqueVehicleRecords: vehicles.length,
  vehicleSample: vehicles.slice(0, 12).map(({ name, manufacturer, vehicleClass }) => ({ name, manufacturer, vehicleClass })),
  generatedFiles: [
    "public/assets/leonida-database/catalogs/vehicles.json",
    "src/features/dossier/registry.ts"
  ]
};
fs.writeFileSync(path.join(outputDir, "catalog-build-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
