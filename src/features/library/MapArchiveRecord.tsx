import { useEffect, useState } from 'react';
import { CarFront, Database, ImageOff } from 'lucide-react';
import type { Place } from '../../domain/types';

type ArchiveSource = {
  site?: string | null;
  title?: string | null;
  url?: string | null;
  attribution?: string | null;
};

type ArchiveEntity = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  sources?: ArchiveSource[];
  images?: string[];
  reliability?: string | null;
  verifiedInGame?: boolean;
  gtadbLandmarkId?: string | null;
};

type VehicleRecord = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  summary?: string;
  manufacturer?: string;
  vehicleClass?: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  evidence?: string;
  source?: string;
  sourceUrl?: string;
};

type ArchiveCatalogs = { entities: ArchiveEntity[]; vehicles: VehicleRecord[] };
let catalogRequest: Promise<ArchiveCatalogs> | undefined;

function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}assets/leonida-database/catalogs/${path}`;
}

function loadCatalogs(): Promise<ArchiveCatalogs> {
  if (!catalogRequest) {
    catalogRequest = Promise.all([
      fetch(publicAsset('encyclopedia.json')),
      fetch(publicAsset('vehicles.json')),
    ])
      .then(async ([encyclopediaResponse, vehicleResponse]) => {
        if (!encyclopediaResponse.ok || !vehicleResponse.ok) throw new Error('The game database is unavailable.');
        const [encyclopedia, vehicleCatalog] = await Promise.all([
          encyclopediaResponse.json() as Promise<{ entities?: ArchiveEntity[] }>,
          vehicleResponse.json() as Promise<{ vehicles?: VehicleRecord[] }>,
        ]);
        return {
          entities: Array.isArray(encyclopedia.entities) ? encyclopedia.entities : [],
          vehicles: Array.isArray(vehicleCatalog.vehicles) ? vehicleCatalog.vehicles : [],
        };
      })
      .catch((error: unknown) => {
        catalogRequest = undefined;
        throw error;
      });
  }
  return catalogRequest;
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function matchEntity(entities: ArchiveEntity[], place: Place): ArchiveEntity | null {
  const byId = entities.find((entity) => entity.gtadbLandmarkId === place.id || entity.id === place.id);
  if (byId) return byId;
  const title = normalizeName(place.title);
  return entities.find((entity) => [entity.name, ...(entity.aliases ?? [])]
    .some((name) => typeof name === 'string' && normalizeName(name) === title)) ?? null;
}

function matchVehicle(vehicles: VehicleRecord[], place: Place): VehicleRecord | null {
  const title = normalizeName(place.title);
  const exact = vehicles.filter((vehicle) => [vehicle.name, ...(vehicle.aliases ?? [])]
    .some((name) => typeof name === 'string' && normalizeName(name) === title));
  if (exact.length === 1) return exact[0] ?? null;

  // Community map names sometimes include a livery/variant between make and model.
  // Link only a unique catalog name whose full set of name tokens exists in this marker.
  const words = new Set(title.split(' '));
  const candidates = vehicles.map((vehicle) => {
    const name = normalizeName(vehicle.name ?? '');
    const tokens = name.split(' ').filter((word) => word.length > 2);
    return { vehicle, tokens };
  }).filter(({ tokens }) => tokens.length >= 2 && tokens.every((token) => words.has(token)));
  const maxTokens = Math.max(0, ...candidates.map((candidate) => candidate.tokens.length));
  const best = candidates.filter((candidate) => candidate.tokens.length === maxTokens);
  if (best.length === 1) return best[0]?.vehicle ?? null;
  return null;
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return null;
}

function factLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function evidenceLabel(entity: ArchiveEntity | null, vehicle: VehicleRecord | null): string {
  if (entity?.verifiedInGame) return 'In-game verified';
  const evidence = vehicle?.evidence?.toLowerCase() || entity?.reliability?.toLowerCase() || '';
  if (evidence.includes('official') || evidence.includes('confirmed')) return 'Officially confirmed';
  if (evidence.includes('community')) return 'Community reported';
  return 'Research record · check source';
}

export default function MapArchiveRecord({ place }: { place: Place }) {
  const [catalogs, setCatalogs] = useState<ArchiveCatalogs | null>(null);

  useEffect(() => {
    let active = true;
    setCatalogs(null);
    void loadCatalogs().then((value) => {
      if (active) setCatalogs(value);
    }).catch(() => {
      if (active) setCatalogs({ entities: [], vehicles: [] });
    });
    return () => { active = false; };
  }, []);

  if (!catalogs) return <section className="map-archive-record is-loading" aria-label="Game database record"><span>Loading linked database records…</span></section>;
  const entity = matchEntity(catalogs.entities, place);
  const vehicle = matchVehicle(catalogs.vehicles, place);
  if (!entity && !vehicle) return null;

  const images = (entity?.images ?? []).flatMap((value) => {
    const url = safeHttpsUrl(value);
    return url ? [url] : [];
  });
  const sources = (entity?.sources ?? []).filter((source) => safeHttpsUrl(source.url));
  const vehicleUrl = safeHttpsUrl(vehicle?.sourceUrl);
  const description = entity?.description?.trim() || vehicle?.summary?.trim() || vehicle?.description?.trim();
  const extraDescription = Boolean(description && description !== place.description.trim());
  const attributes = Object.entries(vehicle?.attributes ?? {})
    .filter(([key, value]) => key !== 'stats' && key !== 'externalIds' && scalar(value) !== null)
    .map(([key, value]) => [factLabel(key), scalar(value)!] as const);
  const stats = vehicle?.attributes?.stats && typeof vehicle.attributes.stats === 'object'
    ? Object.entries(vehicle.attributes.stats as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    : [];
  const manufacturer = vehicle?.manufacturer || scalar(vehicle?.attributes?.manufacturer);
  const vehicleClass = vehicle?.vehicleClass || scalar(vehicle?.attributes?.class);

  return (
    <section className="map-archive-record" aria-label="Game database record">
      <div className="map-archive-heading">
        <span><Database size={13} aria-hidden="true" /> LEONIDA DATABASE</span>
        <span>{evidenceLabel(entity, vehicle)}</span>
      </div>
      {(vehicle || entity?.category) && (
        <div className="map-archive-kicker">
          {vehicle ? <CarFront size={14} aria-hidden="true" /> : null}
          <span>{vehicle ? [manufacturer, vehicleClass || 'Vehicle'].filter(Boolean).join(' · ') : entity?.category}</span>
        </div>
      )}
      {images[0] ? (
        <a className="map-archive-hero" href={images[0]} target="_blank" rel="noreferrer" aria-label={`Open source image of ${place.title}`}>
          <img src={images[0]} alt={`${place.title} reference`} loading="lazy" referrerPolicy="no-referrer" />
          <span>REFERENCE IMAGE</span>
        </a>
      ) : (
        <div className="map-archive-image-empty"><ImageOff size={20} /><span>No source image is attached to this record yet.</span></div>
      )}
      {extraDescription && <p className="map-archive-description">{description}</p>}
      {!!vehicle?.aliases?.length && <p className="map-archive-aliases">Also known as: {vehicle.aliases.join(' · ')}</p>}
      {!!attributes.length && (
        <dl className="map-archive-facts">
          {attributes.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
      {!!stats.length && (
        <div className="map-archive-stats" aria-label="Vehicle stats">
          <strong>VEHICLE STATS</strong>
          {stats.map(([label, value]) => <div className="map-archive-stat" key={label}><span>{factLabel(label)}</span><span className="map-archive-stat-track"><i style={{ width: `${Math.min(10, Math.max(0, value)) * 10}%` }} /></span><b>{value.toFixed(1)}</b></div>)}
        </div>
      )}
      {entity?.reliability && <p className="map-archive-reliability">Evidence: {entity.reliability}</p>}
      {!!sources.length && (
        <div className="map-archive-sources">
          <strong>LOCATION SOURCES</strong>
          {sources.map((source, index) => <a href={safeHttpsUrl(source.url)!} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}>{source.site || source.title || 'Open source'} ↗</a>)}
        </div>
      )}
      {vehicleUrl && <a className="map-archive-database-link" href={vehicleUrl} target="_blank" rel="noreferrer">Open full {vehicle?.name} record ↗</a>}
      {!!vehicle && <p className="map-archive-source-note">Vehicle details are community sourced. Spawn locations and unreported game stats are left blank until documented.</p>}
    </section>
  );
}
