const projectPages = new Set([
  'about',
  'documentation',
  'credits',
  'contributing',
  'changelog',
  'licenses',
]);

const catalogPages = new Set(['characters', 'vehicles']);

export function resolveRoute(
  pathname: string,
  search: string,
): {
  view: 'map' | 'project' | 'catalog' | 'intelligence' | 'progress';
  page: string;
  placeId: string | null;
} {
  const segments = pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(search);
  const tail = params.get('page') ?? segments.at(-1) ?? '';
  const placeIndex = segments.indexOf('place');
  const viewpointIndex = segments.indexOf('viewpoint');

  const oldSlug =
    placeIndex >= 0
      ? segments[placeIndex + 1]
      : viewpointIndex >= 0
        ? segments[viewpointIndex + 1]?.replace(/-regional-entry$/, '')
        : null;

  const view =
    tail === 'progress'
        ? 'progress'
      : projectPages.has(tail)
        ? 'project'
        : catalogPages.has(tail)
          ? 'catalog'
          : tail === 'database'
            ? 'intelligence'
            : 'map';

  return {
    view,
    page: tail,
    placeId: params.get('marker') ?? params.get('place') ?? (oldSlug ? `region:${oldSlug}` : null),
  };
}
