import { createHash, randomUUID } from "node:crypto";
import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FULLSWEEP_MAP_HEIGHT,
  FULLSWEEP_MAP_WIDTH,
  normalizeFullSweepLocations,
  validateFullSweepCount,
  validateFullSweepStats,
} from "./lib/fullsweep-sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = "https://fullsweepmap.com/api/v1";
const maxResponseBytes = 32 * 1024 * 1024;
const outputPath = path.join(
  root,
  "public/assets/leonida-database/fullsweep-locations.json",
);
const manifestPath = path.join(
  root,
  "public/assets/leonida-database/fullsweep-manifest.json",
);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "LOBOS-UNITED-Leonida-Atlas/1.0",
    },
    signal: globalThis.AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`FullSweep request failed with HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxResponseBytes) {
    throw new Error("FullSweep response exceeded the 32 MiB safety limit.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxResponseBytes) {
    throw new Error("FullSweep response exceeded the 32 MiB safety limit.");
  }
  return JSON.parse(text);
}

async function fileExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readPreviousSnapshot() {
  const [hasSnapshot, hasManifest] = await Promise.all([
    fileExists(outputPath),
    fileExists(manifestPath),
  ]);
  if (hasSnapshot !== hasManifest) {
    throw new Error(
      "Existing FullSweep snapshot and manifest are incomplete; refusing to replace data.",
    );
  }
  if (!hasSnapshot) return null;

  let snapshot;
  let manifest;
  try {
    [snapshot, manifest] = await Promise.all([
      readFile(outputPath, "utf8").then(JSON.parse),
      readFile(manifestPath, "utf8").then(JSON.parse),
    ]);
  } catch {
    throw new Error(
      "Existing FullSweep sync files are unreadable; refusing to replace data.",
    );
  }
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    snapshot.schemaVersion !== 1 ||
    snapshot.source !== "fullsweepmap.com/api/v1/locations" ||
    !Array.isArray(snapshot.locations) ||
    snapshot.locations.length < 10 ||
    snapshot.locations.length > 20_000 ||
    !manifest ||
    typeof manifest !== "object" ||
    manifest.schemaVersion !== 1 ||
    manifest.source !== snapshot.source ||
    manifest.records !== snapshot.locations.length ||
    manifest.positioned !==
      snapshot.locations.filter((row) => row?.mapCoordinates).length ||
    manifest.sourceUpdatedAt !== snapshot.sourceUpdatedAt ||
    manifest.upstreamRevision !== snapshot.upstreamRevision ||
    manifest.sha256 !== snapshot.sha256 ||
    !/^[a-f0-9]{64}$/i.test(String(snapshot.sha256 ?? "")) ||
    createHash("sha256")
      .update(JSON.stringify(snapshot.locations))
      .digest("hex") !== snapshot.sha256
  ) {
    throw new Error(
      "Existing FullSweep sync files failed integrity checks; refusing to replace data.",
    );
  }
  return snapshot;
}

async function writeTemporary(target, value) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return temporary;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeAtomic(target, value) {
  const temporary = await writeTemporary(target, value);
  try {
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeSnapshotAndManifest(snapshot, manifest, previousSnapshot) {
  let snapshotTemporary;
  let manifestTemporary;
  let snapshotReplaced = false;
  try {
    snapshotTemporary = await writeTemporary(outputPath, snapshot);
    manifestTemporary = await writeTemporary(manifestPath, manifest);
    await rename(snapshotTemporary, outputPath);
    snapshotReplaced = true;
    await rename(manifestTemporary, manifestPath);
  } catch (error) {
    if (snapshotReplaced) {
      if (previousSnapshot) await writeAtomic(outputPath, previousSnapshot);
      else await rm(outputPath, { force: true });
    }
    throw error;
  } finally {
    if (snapshotTemporary) await rm(snapshotTemporary, { force: true });
    if (manifestTemporary) await rm(manifestTemporary, { force: true });
  }
}

const [stats, sourcePayload] = await Promise.all([
  fetchJson(`${baseUrl}/stats`),
  fetchJson(`${baseUrl}/locations`),
]);
const { count: expectedCount, sourceUpdatedAt } = validateFullSweepStats(stats);
const locations = normalizeFullSweepLocations(sourcePayload);
if (locations.length !== expectedCount) {
  throw new Error(
    `FullSweep count mismatch: stats reported ${expectedCount}, received ${locations.length}.`,
  );
}
const positioned = locations.filter(
  (location) => location.mapCoordinates,
).length;
if (!positioned || positioned !== locations.length) {
  throw new Error(
    "FullSweep returned locations without valid map-pixel coordinates.",
  );
}

const previousSnapshot = await readPreviousSnapshot();
const previousCount = previousSnapshot?.locations.length ?? 0;
validateFullSweepCount(locations.length, previousCount);

const sha256 = createHash("sha256")
  .update(JSON.stringify(locations))
  .digest("hex");
if (
  previousSnapshot?.sha256 === sha256 &&
  previousSnapshot.sourceUpdatedAt === sourceUpdatedAt
) {
  console.log(
    `FullSweep locations unchanged: ${locations.length} records, revision ${sha256.slice(0, 12)}.`,
  );
} else {
  const syncedAt = new Date().toISOString();
  const snapshot = {
    schemaVersion: 1,
    source: "fullsweepmap.com/api/v1/locations",
    sourceUpdatedAt,
    upstreamRevision: sha256,
    sha256,
    updatedAt: syncedAt,
    map: { width: FULLSWEEP_MAP_WIDTH, height: FULLSWEEP_MAP_HEIGHT },
    attribution: "FullSweep, fullsweepmap.com — CC BY 4.0",
    license: "CC BY 4.0",
    locations,
  };
  const manifest = {
    schemaVersion: 1,
    source: "fullsweepmap.com/api/v1/locations",
    sourceUpdatedAt,
    updatedAt: syncedAt,
    upstreamRevision: sha256,
    sha256,
    records: locations.length,
    positioned,
    license: "CC BY 4.0",
    sourceUrl: baseUrl,
  };

  await writeSnapshotAndManifest(snapshot, manifest, previousSnapshot);
  console.log(
    `FullSweep locations validated: ${locations.length} records, revision ${sha256.slice(0, 12)}.`,
  );
}
