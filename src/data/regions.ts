import type { Place, Position } from '../domain/types';
import { RESEARCH_REGIONS, RESEARCH_REVIEWED_AT } from '../features/street-leonida/leonida-research';
import { GTADB_LICENSE, GTADB_PREFERRED_SOURCE } from '../features/street-leonida/gtadb';
import type { AtlasRegionSlug } from './region-types';

const GTADB_SOURCE = {
  title: 'GTADB / Map GTA community reconstruction, approximate position',
  url: GTADB_PREFERRED_SOURCE,
  license: GTADB_LICENSE,
};

const regionPositions: Record<AtlasRegionSlug, Position> = {
  'vice-city': { x: -424.9069999999997, y: -325.61 },
  'leonida-keys': { x: -4915.480985674199, y: -3338.6224041633122 },
  grassrivers: { x: -3548.973455306624, y: -3592.623227653312 },
  'port-gellhorn': { x: -6240.705097588649, y: 4560.714992493181 },
  ambrosia: { x: -2966.5107043822245, y: 3386.662355484881 },
  'mount-kalaga-national-park': { x: -3471.9823036223092, y: 6428.146163637521 },
};

const rockstarSources: Record<AtlasRegionSlug, string> = {
  'vice-city': 'https://www.rockstargames.com/VI/media/screenshots',
  'leonida-keys': 'https://www.rockstargames.com/VI/only-in-leonida',
  grassrivers: 'https://www.rockstargames.com/VI/only-in-leonida',
  'port-gellhorn': 'https://www.rockstargames.com/VI/only-in-leonida',
  ambrosia: 'https://www.rockstargames.com/VI/only-in-leonida',
  'mount-kalaga-national-park': 'https://www.rockstargames.com/VI/only-in-leonida',
};

export const ATLAS_REGIONS: Place[] = RESEARCH_REGIONS.map((region) => ({
  id: `region:${region.slug}`,
  title: region.name,
  description: `${region.summary} Atlas placement remains approximate.`,
  category: 'region',
  position: { ...regionPositions[region.slug] },
  layerId: 'regions',
  tags: ['Official place name', 'Community-mapped position', 'Approximate position'],
  region: region.name,
  source: {
    title: `Rockstar Games · reviewed ${RESEARCH_REVIEWED_AT}`,
    url: rockstarSources[region.slug],
    license: GTADB_SOURCE.license,
  },
  evidence: 'approximate',
}));

export const COMMUNITY_REGION_SOURCE = GTADB_SOURCE;
