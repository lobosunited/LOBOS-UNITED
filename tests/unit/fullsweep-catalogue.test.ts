import { describe, expect, it } from "vitest";
import { mergeFullSweepCatalogue } from "../../src/data/catalogue";
import type { Place } from "../../src/domain/types";

const curatedPlace: Place = {
  id: "fullsweep:vice-city-market",
  title: "Curated Market Name",
  description: "Locally retained research context.",
  category: "business",
  position: null,
  layerId: "fullsweep",
  tags: ["curated"],
  region: "Vice City",
  source: { title: "Curated source", url: "https://example.org" },
  evidence: "uncertain",
};

const sourceLocation = (name: string, description: string) => ({
  id: "fullsweep:vice-city-market",
  name,
  category: "retail",
  region: "vice-city",
  description,
  evidence: {
    source: "community",
    foundBy: "Mapper",
    activity: 0,
    character: "lucia",
  },
  mapCoordinates: {
    x: 1500,
    y: 2400,
    system: "FullSweep map pixels",
    mapWidth: 3344,
    mapHeight: 4820,
  },
  sourceUrl: "https://fullsweepmap.com/locations/vice-city-market",
  attribution: "FullSweep, fullsweepmap.com — CC BY 4.0",
});

describe("FullSweep catalogue refresh", () => {
  it("refreshes upstream fields without discarding curated description or stable ID", () => {
    const places = mergeFullSweepCatalogue(
      [curatedPlace],
      [sourceLocation("Updated Market", "Current source description.")],
    );

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      id: curatedPlace.id,
      title: "Updated Market",
      description:
        "Locally retained research context. Current source description.",
      layerId: "fullsweep",
      tags: ["curated", "fullsweep", "retail"],
      source: {
        title: "FullSweep, fullsweepmap.com — CC BY 4.0",
        url: "https://fullsweepmap.com/locations/vice-city-market",
      },
      research: {
        provider: "FullSweep",
        reliability: "community",
        foundBy: "Mapper",
        character: "lucia",
        inGameNameIdentified: false,
      },
    });
    expect(places[0]?.position).not.toBeNull();
  });

  it("adds new locations alongside existing catalogue entries", () => {
    const newLocation = {
      ...sourceLocation("New Market", "New place."),
      id: "fullsweep:new-market",
    };
    const places = mergeFullSweepCatalogue([curatedPlace], [newLocation]);
    expect(places.map((place) => place.id)).toEqual([
      curatedPlace.id,
      "fullsweep:new-market",
    ]);
  });
});
