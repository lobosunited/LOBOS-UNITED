export declare const FULLSWEEP_MAP_WIDTH: 3344;
export declare const FULLSWEEP_MAP_HEIGHT: 4820;

export interface NormalizedFullSweepLocation {
  id: string;
  name: string;
  category: string;
  region: string | null;
  description: string;
  evidence: {
    source: string;
    foundBy: string | null;
    activity: number | null;
    character: string | null;
  };
  mapCoordinates: {
    x: number;
    y: number;
    system: "FullSweep map pixels";
    mapWidth: 3344;
    mapHeight: 4820;
  };
  sourceUrl: string | null;
  attribution: string;
}

export declare function normalizeFullSweepLocations(
  payload: unknown,
): NormalizedFullSweepLocation[];
export declare function validateFullSweepStats(value: unknown): {
  count: number;
  sourceUpdatedAt: string;
};
export declare function validateFullSweepCount(
  nextCount: number,
  previousCount: number,
): void;
