import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalogue = JSON.parse(
  readFileSync(
    new URL(
      "../../public/assets/leonida-database/catalogs/vehicles.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { count: number; vehicles: Array<Record<string, unknown>> };

describe("expanded vehicle catalogue", () => {
  it("contains source-backed, deduplicated vehicle records", () => {
    expect(catalogue.count).toBeGreaterThanOrEqual(300);
    expect(catalogue.vehicles).toHaveLength(catalogue.count);
    expect(new Set(catalogue.vehicles.map((vehicle) => vehicle.slug)).size).toBe(
      catalogue.count,
    );
    for (const vehicle of catalogue.vehicles) {
      expect(vehicle.name).toEqual(expect.any(String));
      expect(vehicle.source).toEqual(expect.any(String));
      expect(vehicle.sourceUrl).toMatch(/^https:\/\//);
      expect(["reported", "community verified in game"]).toContain(
        vehicle.evidence,
      );
    }
  });
});
