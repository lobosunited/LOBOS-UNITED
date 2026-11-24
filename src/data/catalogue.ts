import type { Category, PersonalMarker, Place, Position } from '../domain/types';
import { ATLAS_REGIONS, COMMUNITY_REGION_SOURCE } from './regions';
import {
  GTADB_LICENSE,
  GTADB_PREFERRED_SOURCE,
  GTADB_REVISION,
  classifyGtadbUncertaintyReasons,
  normalizeGtadbCatalogue,
  type GtadbLandmark,
} from '../features/street-leonida/gtadb';

function categoryFor(tags: readonly string[]): Category {
  if (tags.some((tag) => ['natural', 'agriculture'].includes(tag))) return 'nature';
  if (tags.some((tag) => ['transportation', 'infrastructure', 'infr'].includes(tag)))
    return 'transport';
  if (
    tags.some((tag) =>
      ['hotel', 'restaurant', 'retail', 'service', 'office', 'industrial'].includes(tag),
    )
  )
    return 'business';
  return 'landmark';
}

function landmarkToPlace(landmark: GtadbLandmark, revision: string): Place {
  const reasons = classifyGtadbUncertaintyReasons(landmark.inGameAddress, landmark.tags);
  const uncertain = reasons.length > 0;
  return {
    id: landmark.id,
    title: landmark.inGameAddress.trim() || `Unnamed community place (${landmark.id})`,
    description: [
      landmark.inGameCoordinates
        ? 'Approximate community-mapped position.'
        : 'No game position supplied; this record is searchable only.',
      uncertain ? `Source uncertainty: ${reasons.join(', ').replaceAll('-', ' ')}.` : '',
      landmark.realWorldAddress
        ? `Real-world reference (analogue only): ${landmark.realWorldAddress}`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    category: categoryFor(landmark.tags),
    position: landmark.inGameCoordinates
      ? { x: landmark.inGameCoordinates[0], y: landmark.inGameCoordinates[1] }
      : null,
    layerId: uncertain ? 'uncertain' : 'community',
    tags: [...landmark.tags],
    region: landmark.inGameAddress.split(',').slice(1).join(',').trim(),
    source: {
      title: `GTADB / Map GTA · revision ${revision.slice(0, 7)}`,
      url: GTADB_PREFERRED_SOURCE,
      license: GTADB_LICENSE,
    },
    evidence: uncertain ? 'uncertain' : 'approximate',
  };
}

/** Parse bundled source data through the existing strict evidence/coordinate normalizer. */
export function catalogueFromSnapshot(input: unknown): Place[] {
  if (
    !input ||
    typeof input !== 'object' ||
    !('landmarks' in input) ||
    !Array.isArray(input.landmarks)
  ) {
    throw new Error('The bundled community catalogue is invalid.');
  }
  let revision: string = GTADB_REVISION;
  if ('source' in input && input.source && typeof input.source === 'object') {
    const source = input.source as Record<string, unknown>;
    if (source.revision !== undefined) {
      if (typeof source.revision !== 'string' || !/^[a-f0-9]{40}$/i.test(source.revision)) {
        throw new Error('The bundled community catalogue has an invalid source revision.');
      }
      revision = source.revision;
    }
  }
  const tuples: Record<string, unknown> = {};
  for (const candidate of input.landmarks) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.id !== 'string' ||
      !/^L\d+$/.test(candidate.id)
    ) {
      throw new Error('The community catalogue contains an invalid record.');
    }
    if (Object.hasOwn(tuples, candidate.id))
      throw new Error(`Duplicate community record: ${candidate.id}`);
    tuples[candidate.id] = [
      candidate.inGameAddress,
      candidate.inGameCoordinates === null ? [] : candidate.inGameCoordinates,
      candidate.inGamePhotoSize === null ? [] : candidate.inGamePhotoSize,
      candidate.realWorldAddress,
      candidate.realWorldCoordinates === null ? [] : candidate.realWorldCoordinates,
      candidate.realWorldPhotoSize === null ? [] : candidate.realWorldPhotoSize,
      candidate.tags,
      candidate.color,
      candidate.editedAt,
    ];
  }
  const regions: Place[] = ATLAS_REGIONS.map((region) => ({
    ...region,
    position: region.position ? { ...region.position } : null,
    tags: [...region.tags],
    source: {
      ...region.source,
      title: region.source?.title ?? COMMUNITY_REGION_SOURCE.title,
      url: region.source?.url ?? COMMUNITY_REGION_SOURCE.url,
      license: COMMUNITY_REGION_SOURCE.license,
    },
  }));
  return [...regions, ...normalizeGtadbCatalogue(tuples).map((landmark) => landmarkToPlace(landmark, revision))];
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPosition(value: unknown): Position | null {
  if (!isRecord(value)) return null;
  const x = value.x;
  const y = value.y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function validGamePosition(position: Position | null): position is Position {
  return Boolean(
    position &&
    position.x >= -16000 && position.x <= 4000 &&
    position.y >= -8000 && position.y <= 12000
  );
}

function fullSweepPixelPosition(value: unknown): Position | null {
  const pixel = readPosition(value);
  if (!pixel) return null;

  // Robust affine fit from 1,276 matched GTADB / FullSweep landmarks.
  const position = {
    x: 4.000744279828553 * pixel.x +
       0.0008158482354834184 * pixel.y - 10359.303847749874,
    y: -0.0013437793744242033 * pixel.x -
       3.999520167917056 * pixel.y + 11562.071278992866,
  };

  return validGamePosition(position) ? position : null;
}

function fullSweepCategory(value: unknown): Category {
  const category = typeof value === 'string' ? value.toLowerCase() : '';

  if (['natural', 'wildlife', 'agriculture'].includes(category)) return 'nature';

  if ([
    'transportation', 'infrastructure', 'construction',
    'airport', 'marina', 'bridge', 'rail', 'road'
  ].includes(category)) return 'transport';

  if ([
    'residential', 'retail', 'hotel', 'industrial',
    'restaurant', 'store', 'office', 'government',
    'public', 'business'
  ].includes(category)) return 'business';

  return 'landmark';
}

function fullSweepRecords(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) return input.filter(isRecord);
  if (isRecord(input)) {
    if (Array.isArray(input.locations)) return input.locations.filter(isRecord);
    if (Array.isArray(input.records)) return input.records.filter(isRecord);
  }
  throw new Error('The normalized FullSweep map-locations dataset is invalid.');
}

function regionLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Leonida';
  return value.replaceAll('-', ' ').replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mergeFullSweepCatalogue(
  originalPlaces: Place[],
  input: unknown,
): Place[] {
  const places = [...originalPlaces];
  const indexes = new Map(places.map((place, index) => [place.id, index]));

  for (const record of fullSweepRecords(input)) {
    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id || !name) continue;

    const gtadbId = typeof record.gtadbLandmarkId === 'string'
      ? record.gtadbLandmarkId.trim()
      : '';

    const description = typeof record.description === 'string'
      ? record.description.trim()
      : '';

    const attribution = typeof record.attribution === 'string'
      ? record.attribution
      : 'FullSweep';

    const sourceUrl = typeof record.sourceUrl === 'string'
      ? record.sourceUrl
      : 'https://fullsweepmap.com/api/v1/locations';
    const sourceEvidence =
      record.evidence && typeof record.evidence === 'object' && !Array.isArray(record.evidence)
        ? record.evidence as Record<string, unknown>
        : {};
    const sourceLabel =
      typeof sourceEvidence.source === 'string' &&
      ['official', 'community', 'unverified'].includes(sourceEvidence.source)
        ? sourceEvidence.source
        : 'unverified';
    const research = {
      provider: 'FullSweep' as const,
      referenceName: name,
      reliability: sourceLabel,
      evidenceSource: `${sourceLabel} source badge`,
      foundBy: typeof sourceEvidence.foundBy === 'string' ? sourceEvidence.foundBy : undefined,
      character: typeof sourceEvidence.character === 'string' ? sourceEvidence.character : undefined,
      activity: typeof sourceEvidence.activity === 'number' ? sourceEvidence.activity : undefined,
      region: typeof record.region === 'string' ? record.region : undefined,
      sourceUrl,
      attribution,
      inGameNameIdentified: false,
      referenceCategory: typeof record.category === 'string' ? record.category : undefined,
    };

    // Prefer native GTADB coordinates. Pixel calibration is only a fallback.
    const nativePosition = readPosition(record.inGameCoordinates);
    const position = validGamePosition(nativePosition)
      ? nativePosition
      : fullSweepPixelPosition(record.mapCoordinates);

    const existingIndex = gtadbId ? indexes.get(gtadbId) : undefined;

    if (existingIndex !== undefined) {
      // Enrich the existing GTADB pin. Never create a second marker for it.
      const existing = places[existingIndex];
      if (!existing) continue;

      const additions = [
        description && !existing.description.includes(description)
          ? description
          : '',
        !existing.description.includes('FullSweep reference')
          ? 'FullSweep reference and contributor attribution are available.'
          : '',
      ].filter(Boolean);

      const estimatedFallback = !existing.position && position !== null;
      const estimateNote = estimatedFallback
        ? 'Position estimated from FullSweep map pixels because this GTADB record had no in-game coordinates.'
        : '';

      places[existingIndex] = {
        ...existing,
        position: existing.position ?? position,
        description: [existing.description, ...additions, estimateNote]
          .filter(Boolean)
          .join(' '),
        tags: [...new Set([...existing.tags, 'fullsweep', String(record.category ?? 'landmark')])],
      };
      continue;
    }

    const duplicateIndex = indexes.get(id);
    if (duplicateIndex !== undefined) {
      // Keep curated notes while refreshing source-owned fields from the live snapshot.
      const existing = places[duplicateIndex];
      if (!existing) continue;
      const descriptions = [...new Set([existing.description, description].filter(Boolean))];
      places[duplicateIndex] = {
        ...existing,
        title: name,
        description: descriptions.join(' '),
        category: fullSweepCategory(record.category),
        position: position ?? existing.position,
        layerId: 'fullsweep',
        tags: [...new Set([...existing.tags, 'fullsweep', String(record.category ?? 'landmark')])],
        region: regionLabel(record.region),
        source: {
          title: attribution,
          url: sourceUrl,
          license: 'CC BY 4.0; see source attribution',
        },
        research: { ...existing.research, ...research },
      };
      continue;
    }

    const pixelOnly = !validGamePosition(nativePosition);
    const hasPosition = position !== null;

    const place: Place = {
      id,
      title: name,
      description: [
        description,
        pixelOnly && hasPosition
          ? 'Estimated position derived from FullSweep map pixels; not a directly supplied in-game coordinate.'
          : '',
        !hasPosition
          ? 'No reliable in-game position available; searchable catalogue entry only.'
          : '',
        'FullSweep community research; original attribution retained.',
      ].filter(Boolean).join(' '),
      category: fullSweepCategory(record.category),
      position,
      layerId: 'fullsweep',
      tags: [
        'fullsweep',
        typeof record.category === 'string' ? record.category : 'landmark',
        ...(typeof record.region === 'string' ? [record.region] : []),
      ],
      region: regionLabel(record.region),
      source: {
        title: attribution,
        url: sourceUrl,
        license: 'CC BY 4.0; see source attribution',
      },
      research,
      evidence: gtadbId && hasPosition ? 'approximate' : 'uncertain',
    };

    indexes.set(id, places.length);
    places.push(place);
  }

  return places;
}

/** Adds the public-domain gta6map landmark index as a separate, explicitly approximate layer. */
export function gta6MapPlacesFromSnapshot(input: unknown): Place[] {
  if (!input || typeof input !== 'object' || !('landmarks' in input) || !Array.isArray(input.landmarks)) {
    throw new Error('The gta6map landmark catalogue is invalid.');
  }
  const rows = input.landmarks as unknown[];
  const places: Place[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 10) continue;
    const [sourceId, area, coordinates, , realWorldAddress, , , rawTags] = row;
    if (typeof sourceId !== 'string' || typeof area !== 'string') continue;
    const tags = Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === 'string') : [];
    const point = Array.isArray(coordinates) && coordinates.length === 2 &&
      coordinates.every((value) => typeof value === 'number' && Number.isFinite(value))
      ? { x: coordinates[0] as number, y: coordinates[1] as number }
      : null;
    if (point && !validGamePosition(point)) continue;
    const analogue = typeof realWorldAddress === 'string' && realWorldAddress !== '?'
      ? realWorldAddress.replace(/\?$/, '').trim()
      : '';
    const analogueName = analogue.split(',')[0]?.trim();
    const region = area.replace(/^\?,?\s*/, '').trim() || 'Leonida';
    const businessTags = ['hotel', 'residential', 'commercial', 'entertainment', 'service', 'government', 'industrial'];
    const category = tags.some((tag) => ['nature', 'agriculture'].includes(tag))
      ? 'nature'
      : tags.some((tag) => ['transport', 'transportation', 'infrastructure'].includes(tag))
        ? 'transport'
        : tags.some((tag) => businessTags.includes(tag))
          ? 'business'
          : 'landmark';
    places.push({
      id: `gta6map:${sourceId}`,
      title: analogueName ? `${region} · Analogue: ${analogueName}` : `${region} landmark · ${sourceId}`,
      description: [
        `Community-mapped point associated with ${region}; placement is approximate and unverified.`,
        analogue ? `Real-world analogue listed by the source: ${analogue}.` : '',
        'This record does not establish a confirmed in-game business, mission, objective, or collectible.',
        tags.length ? `Source categories: ${tags.join(', ')}.` : '',
      ].filter(Boolean).join(' '),
      category,
      position: point,
      layerId: 'gta6map',
      tags: [...tags, 'community-reference', 'approximate'],
      region,
      source: {
        title: 'GTA VI Landmarks Map · community data',
        url: 'https://github.com/gta6map/gta6map.github.io/blob/2e4a837210f627c5aed6b4159c46961efece17a2/data/landmarks.json',
        license: 'Public domain (upstream declaration)',
      },
      evidence: 'uncertain',
    });
  }
  return places;
}

let catalogueRequest: Promise<Place[]> | undefined;

/** Loads GTADB as the base catalogue and adds FullSweep research when available. */
export function loadCatalogue(): Promise<Place[]> {
  if (!catalogueRequest) {
    const base = import.meta.env.BASE_URL ?? '/';
    const root = base.endsWith('/') ? base : `${base}/`;

    const gtadbUrl = `${root}assets/street-leonida/maps/gtadb-landmarks-5c1d69f.json`;
    const fullSweepUrl = `${root}assets/leonida-database/map-locations.json`;
    const refreshedFullSweepUrl = `${root}assets/leonida-database/fullsweep-locations.json`;
    const gta6MapUrl = `${root}assets/leonida-database/catalogs/gta6map-landmarks.json`;

    const loadJson = async (url: string, label: string): Promise<unknown> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not load ${label} (${response.status}).`);
      }
      return response.json();
    };

    catalogueRequest = loadJson(gtadbUrl, 'the GTADB community catalogue')
      .then(async (gtadbSnapshot) => {
        let places = catalogueFromSnapshot(gtadbSnapshot);
        try {
          const fullSweepSnapshot = await loadJson(
            fullSweepUrl,
            'the curated FullSweep locations catalogue',
          );
          places = mergeFullSweepCatalogue(places, fullSweepSnapshot);
        } catch (error) {
          console.warn(
            'The curated FullSweep catalogue is unavailable; loading the GTADB catalogue only.',
            error,
          );
        }
        try {
          const refreshedSnapshot = await loadJson(
            refreshedFullSweepUrl,
            'the refreshed FullSweep locations catalogue',
          );
          places = mergeFullSweepCatalogue(places, refreshedSnapshot);
        } catch (error) {
          console.warn(
            'The refreshed FullSweep snapshot is unavailable; using the bundled catalogue.',
            error,
          );
        }
        try {
          const gta6MapSnapshot = await loadJson(gta6MapUrl, 'the gta6map landmark index');
          places.push(...gta6MapPlacesFromSnapshot(gta6MapSnapshot));
        } catch (error) {
          console.warn('The optional gta6map reference layer is unavailable.', error);
        }
        return places;
      })
      .catch((error: unknown) => {
        catalogueRequest = undefined;
        throw error;
      });
  }

  return catalogueRequest;
}

export function markerToPlace(marker: PersonalMarker): Place {
  return {
    id: marker.id,
    title: marker.title,
    description: marker.description,
    category: marker.category,
    position: marker.position,
    layerId: 'personal',
    tags: [marker.icon],
    region: 'My markers',
    source: { title: 'Your local atlas', url: '' },
    evidence: 'personal',
  };
}
