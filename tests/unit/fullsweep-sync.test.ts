import { describe, expect, it } from "vitest";
import {
  FULLSWEEP_MAP_HEIGHT,
  FULLSWEEP_MAP_WIDTH,
  normalizeFullSweepLocations,
  validateFullSweepCount,
  validateFullSweepStats,
} from "../../scripts/lib/fullsweep-sync.mjs";

const validLocation = {
  id: "little-havana-market",
  title: "Little Havana Market",
  cat: "businesses",
  region: "vice-city",
  desc: "Community mapped location.",
  x: 1480.5,
  y: 2750,
  source: "community",
  foundBy: "Mapper",
  act: 0,
  character: "lucia",
  sourceUrl: "https://example.org/source",
};

describe("FullSweep location synchronization", () => {
  it("normalizes stable IDs, attribution, evidence, and map pixel coordinates", () => {
    const [location] = normalizeFullSweepLocations({
      locations: [validLocation],
    });

    expect(location).toMatchObject({
      id: "fullsweep:little-havana-market",
      name: "Little Havana Market",
      category: "businesses",
      region: "vice-city",
      evidence: {
        source: "community",
        foundBy: "Mapper",
        activity: 0,
        character: "lucia",
      },
      mapCoordinates: {
        x: 1480.5,
        y: 2750,
        mapWidth: FULLSWEEP_MAP_WIDTH,
        mapHeight: FULLSWEEP_MAP_HEIGHT,
      },
      attribution: "FullSweep, fullsweepmap.com — CC BY 4.0",
    });
  });

  it("sorts normalized rows by stable ID for a reproducible snapshot", () => {
    const second = { ...validLocation, id: "vice-city-harbor" };
    const rows = normalizeFullSweepLocations([second, validLocation]);
    expect(rows.map((location) => location.id)).toEqual([
      "fullsweep:little-havana-market",
      "fullsweep:vice-city-harbor",
    ]);
  });

  it("rejects duplicate IDs, invalid coordinates, and non-HTTPS evidence links", () => {
    expect(() =>
      normalizeFullSweepLocations([validLocation, validLocation]),
    ).toThrow(/duplicate/i);
    expect(() =>
      normalizeFullSweepLocations([
        { ...validLocation, x: FULLSWEEP_MAP_WIDTH + 1 },
      ]),
    ).toThrow(/coordinates/i);
    expect(() =>
      normalizeFullSweepLocations([
        { ...validLocation, sourceUrl: "javascript:alert(1)" },
      ]),
    ).toThrow(/HTTPS/i);
  });

  it("rejects malformed rows and oversized catalogues", () => {
    expect(() =>
      normalizeFullSweepLocations([{ ...validLocation, id: "../secret" }]),
    ).toThrow(/stable ID/i);
    expect(() =>
      normalizeFullSweepLocations(new Array(20_001).fill(validLocation)),
    ).toThrow(/20000/);
  });

  it("requires plausible stats counts, dates, and the documented license", () => {
    expect(
      validateFullSweepStats({
        counts: { locations: 75 },
        dataUpdated: "2026-11-23",
        license: "CC BY 4.0",
        attribution: "FullSweep data CC BY 4.0, https://fullsweepmap.com",
      }),
    ).toEqual({ count: 75, sourceUpdatedAt: "2026-11-23" });
    expect(() =>
      validateFullSweepStats({
        counts: { locations: 0 },
        dataUpdated: "2026-11-23",
        license: "CC BY 4.0",
        attribution: "FullSweep data https://fullsweepmap.com",
      }),
    ).toThrow(/count/i);
    expect(() =>
      validateFullSweepStats({
        counts: { locations: 75 },
        dataUpdated: "bad",
        license: "CC BY 4.0",
        attribution: "FullSweep data https://fullsweepmap.com",
      }),
    ).toThrow(/date/i);
    expect(() =>
      validateFullSweepStats({
        counts: { locations: 75 },
        dataUpdated: "2026-11-23",
        license: "changed",
        attribution: "FullSweep data https://fullsweepmap.com",
      }),
    ).toThrow(/license/i);
  });

  it("refuses an unexpectedly large drop from the previous FullSweep snapshot", () => {
    expect(() => validateFullSweepCount(49, 100)).toThrow(/at least 50/i);
    expect(() => validateFullSweepCount(50, 100)).not.toThrow();
    expect(() => validateFullSweepCount(75, 0)).not.toThrow();
  });
});
