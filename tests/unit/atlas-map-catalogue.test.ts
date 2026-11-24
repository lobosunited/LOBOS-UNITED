import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogueFromSnapshot, markerToPlace } from '../../src/data/catalogue';

const snapshot = JSON.parse(readFileSync(new URL('../../public/assets/street-leonida/maps/gtadb-landmarks-5c1d69f.json', import.meta.url), 'utf8'));

describe('Atlas searchable catalogue', () => {
  it('retains all 3,431 community records and six regions, including 91 unpositioned records', () => {
    const places = catalogueFromSnapshot(snapshot);
    expect(places).toHaveLength(3437);
    expect(places.filter(p => p.position === null)).toHaveLength(91);
    expect(places.filter(p => p.layerId === 'regions')).toHaveLength(6);
    expect(new Set(places.map(p => p.id)).size).toBe(3437);
  });
  it('uses only source game coordinates and keeps approximate and uncertain evidence explicit', () => {
    const places = catalogueFromSnapshot(snapshot);
    for (const record of snapshot.landmarks) {
      const result = places.find(place => place.id === record.id)!;
      expect(result.position).toEqual(record.inGameCoordinates ? { x: record.inGameCoordinates[0], y: record.inGameCoordinates[1] } : null);
      expect(result.source.license).toBe('CC BY 4.0');
      expect(result.evidence).not.toBe('personal');
    }
    expect(places.find(p => p.id === 'L1')).toMatchObject({ evidence: 'uncertain', layerId: 'uncertain' });
    expect(places.find(p => p.id === 'region:vice-city')).toMatchObject({ title: 'Vice City', evidence: 'approximate' });
  });
  it('preserves all six approximate regional pins in the shared map coordinate frame', () => {
    const places = catalogueFromSnapshot(snapshot);
    const expected = {
      'region:vice-city': { x: -424.9069999999997, y: -325.61 },
      'region:leonida-keys': { x: -4915.480985674199, y: -3338.6224041633122 },
      'region:grassrivers': { x: -3548.973455306624, y: -3592.623227653312 },
      'region:port-gellhorn': { x: -6240.705097588649, y: 4560.714992493181 },
      'region:ambrosia': { x: -2966.5107043822245, y: 3386.662355484881 },
      'region:mount-kalaga-national-park': { x: -3471.9823036223092, y: 6428.146163637521 },
    };
    for (const [id, position] of Object.entries(expected))
      expect(places.find((place) => place.id === id)?.position).toEqual(position);
  });
  it('uses the synced snapshot revision in community source attribution', () => {
    const revision = 'a123456789012345678901234567890123456789';
    const places = catalogueFromSnapshot({ ...snapshot, source: { revision } });
    expect(places.find(place => place.id === snapshot.landmarks[0].id)?.source.title)
      .toContain(`revision ${revision.slice(0, 7)}`);
    expect(() => catalogueFromSnapshot({ ...snapshot, source: { revision: 'invalid' } }))
      .toThrow(/revision/i);
  });
  it('rejects malformed or duplicate source records instead of manufacturing empty data', () => {
    expect(() => catalogueFromSnapshot({ landmarks: null })).toThrow();
    expect(() => catalogueFromSnapshot({ ...snapshot, landmarks: [snapshot.landmarks[0], snapshot.landmarks[0]] })).toThrow(/duplicate/i);
    expect(() => catalogueFromSnapshot({ ...snapshot, landmarks: [{ ...snapshot.landmarks[0], inGameCoordinates: [0, Infinity] }] })).toThrow();
  });
  it('maps personal markers to their own selectable layer without changing persisted identity', () => {
    const marker = { id: 'personal-1', title: 'My stop', description: 'Visit later', category: 'personal' as const, position: { x: 100, y: -90 }, icon: 'star' as const, createdAt: '2026-09-05', updatedAt: '2026-09-05' };
    expect(markerToPlace(marker)).toMatchObject({ id: marker.id, title: marker.title, position: marker.position, layerId: 'personal', evidence: 'personal' });
  });
});
