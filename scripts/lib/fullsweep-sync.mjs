export const FULLSWEEP_MAP_WIDTH = 3344;
export const FULLSWEEP_MAP_HEIGHT = 4820;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeSourceUrl(value, index) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error(`FullSweep location ${index} has an invalid source URL.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`FullSweep location ${index} has an invalid source URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(
      `FullSweep location ${index} source URL must use HTTPS without credentials.`,
    );
  }
  return url.href;
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["locations", "data", "results", "items"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

export function normalizeFullSweepLocations(payload) {
  const rows = rowsFrom(payload);
  if (!rows.length || rows.length > 20_000) {
    throw new Error(
      "FullSweep locations must contain between 1 and 20000 records.",
    );
  }

  const ids = new Set();
  const locations = rows.map((row, index) => {
    if (!isRecord(row))
      throw new Error(`FullSweep location ${index + 1} is not an object.`);
    const id = typeof row.id === "string" ? row.id.trim().toLowerCase() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(id)) {
      throw new Error(
        `FullSweep location ${index + 1} has an invalid stable ID.`,
      );
    }
    if (ids.has(id))
      throw new Error(`FullSweep contains duplicate location ID ${id}.`);
    ids.add(id);
    if (!title || title.length > 200) {
      throw new Error(`FullSweep location ${id} has an invalid title.`);
    }
    const description = typeof row.desc === "string" ? row.desc.trim() : "";
    if (description.length > 4000) {
      throw new Error(`FullSweep location ${id} description is too long.`);
    }
    if (
      typeof row.x !== "number" ||
      !Number.isFinite(row.x) ||
      row.x < 0 ||
      row.x > FULLSWEEP_MAP_WIDTH ||
      typeof row.y !== "number" ||
      !Number.isFinite(row.y) ||
      row.y < 0 ||
      row.y > FULLSWEEP_MAP_HEIGHT
    ) {
      throw new Error(
        `FullSweep location ${id} has invalid map-pixel coordinates.`,
      );
    }
    const category =
      typeof row.cat === "string" ? row.cat.trim().toLowerCase() : "";
    const region =
      typeof row.region === "string" ? row.region.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(category)) {
      throw new Error(`FullSweep location ${id} has an invalid category.`);
    }
    if (region && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(region)) {
      throw new Error(`FullSweep location ${id} has an invalid region.`);
    }
    const evidence = ["official", "community", "unverified"].includes(
      row.source,
    )
      ? row.source
      : "unverified";
    const foundBy = typeof row.foundBy === "string" ? row.foundBy.trim() : null;
    const character =
      typeof row.character === "string" ? row.character.trim() : null;

    return {
      id: `fullsweep:${id}`,
      name: title,
      category,
      region: region || null,
      description,
      evidence: {
        source: evidence,
        foundBy: foundBy && foundBy.length <= 160 ? foundBy : null,
        activity: Number.isSafeInteger(row.act) ? row.act : null,
        character: character && character.length <= 80 ? character : null,
      },
      mapCoordinates: {
        x: row.x,
        y: row.y,
        system: "FullSweep map pixels",
        mapWidth: FULLSWEEP_MAP_WIDTH,
        mapHeight: FULLSWEEP_MAP_HEIGHT,
      },
      sourceUrl: safeSourceUrl(row.sourceUrl, id),
      attribution: "FullSweep, fullsweepmap.com — CC BY 4.0",
    };
  });

  return locations.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

export function validateFullSweepStats(value) {
  if (!isRecord(value) || !isRecord(value.counts)) {
    throw new Error("FullSweep stats response is missing its counts.");
  }
  const count = value.counts.locations;
  if (!Number.isSafeInteger(count) || count < 10 || count > 20_000) {
    throw new Error("FullSweep stats reported an unsafe location count.");
  }
  if (
    typeof value.dataUpdated !== "string" ||
    !Number.isFinite(Date.parse(value.dataUpdated))
  ) {
    throw new Error(
      "FullSweep stats returned an invalid upstream update date.",
    );
  }
  if (value.license !== "CC BY 4.0") {
    throw new Error("FullSweep license changed; manual review is required.");
  }
  if (
    typeof value.attribution !== "string" ||
    !value.attribution.toLowerCase().includes("fullsweepmap.com")
  ) {
    throw new Error(
      "FullSweep attribution is missing or changed; manual review is required.",
    );
  }
  return { count, sourceUpdatedAt: value.dataUpdated };
}

export function validateFullSweepCount(nextCount, previousCount) {
  if (
    !Number.isSafeInteger(nextCount) ||
    nextCount < 10 ||
    nextCount > 20_000 ||
    !Number.isSafeInteger(previousCount) ||
    previousCount < 0 ||
    previousCount > 20_000
  ) {
    throw new Error("FullSweep record counts are outside the safe range.");
  }
  const requiredMinimum = Math.max(10, Math.ceil(previousCount * 0.5));
  if (nextCount < requiredMinimum) {
    throw new Error(
      `FullSweep returned ${nextCount} locations; at least ${requiredMinimum} are required to protect the existing snapshot.`,
    );
  }
}
