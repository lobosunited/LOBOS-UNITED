import type { LayerDefinition, Place } from '../../domain/types';

export const DEFAULT_LAYERS: LayerDefinition[] = [
  {
    id: 'regions',
    name: 'Named regions',
    description: 'Official names with approximate community positions.',
    category: 'reference',
    visible: true,
    order: 0,
    source: 'Rockstar Games / GTADB',
    style: { color: '#f2d897', radius: 9 },
    icon: 'region',
    interactive: true,
  },
  {
    id: 'community',
    name: 'Community places',
    description: 'Named community records; placement remains approximate.',
    category: 'community',
    visible: true,
    order: 10,
    source: 'GTADB / Map GTA · CC BY 4.0',
    style: { color: '#73cbbb', radius: 6 },
    icon: 'pin',
    interactive: true,
  },
  {
    id: 'uncertain',
    name: 'Uncertain records',
    description: 'Unknown names or explicit uncertainty signals in the source.',
    category: 'community',
    visible: true,
    order: 20,
    source: 'GTADB / Map GTA · CC BY 4.0',
    style: { color: '#cba980', radius: 5 },
    icon: 'question',
    interactive: true,
  },
  {
    id: 'fullsweep',
    name: 'FullSweep locations',
    description: 'Additional named locations and landmarks. Pixel-derived positions are estimated.',
    category: 'community',
    visible: true,
    order: 25,
    source: 'FullSweep / GTADB contributors · CC BY 4.0',
    style: { color: '#8fa8ed', radius: 6 },
    icon: 'pin',
    interactive: true,
  },
  {
    id: 'gta6map',
    name: 'GTA6Map references',
    description: 'Community landmark and real-world analogue references. Positions are approximate and unverified.',
    category: 'community reference',
    visible: false,
    order: 28,
    source: 'GTA6Map contributors · public domain',
    style: { color: '#efad68', radius: 6 },
    icon: 'pin',
    interactive: true,
  },
  {
    id: 'personal',
    name: 'My markers',
    description: 'Your own local map annotations.',
    category: 'personal',
    visible: true,
    order: 30,
    source: 'Your local atlas',
    style: { color: '#c9a9ef', radius: 8 },
    icon: 'pin',
    interactive: true,
  },
];

/** Unpositioned records remain available to the catalogue; the spatial index omits them. */
export function getVisiblePlaces(
  places: readonly Place[],
  layers: readonly LayerDefinition[],
  zoom?: number,
): Place[] {
  const orderedLayers = layers
    .filter(
      (layer) =>
        layer.visible &&
        (zoom === undefined || layer.minZoom === undefined || zoom >= layer.minZoom) &&
        (zoom === undefined || layer.maxZoom === undefined || zoom <= layer.maxZoom),
    )
    .sort((a, b) => a.order - b.order);
  const buckets = new Map(orderedLayers.map((layer) => [layer.id, [] as Place[]]));
  for (const place of places) buckets.get(place.layerId)?.push(place);
  return orderedLayers.flatMap((layer) => buckets.get(layer.id) ?? []);
}
