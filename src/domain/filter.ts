import type { Collection, Filters, Place, PlaceNote } from "./types";

export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCategoryTag(tag: string): string {
  return normalizeSearch(tag.replace(/^#/, '').replaceAll('-', ' ').replaceAll('_', ' '))
    .replace(/\s+/g, ' ');
}

export function matchesSearch(text: string, query: string): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearch(text);
  return terms.every((term) => haystack.includes(term));
}

function searchRank(
  place: Place,
  query: string,
  terms: string[],
  note: string,
): number {
  const title = normalizeSearch(place.title);
  const region = normalizeSearch(place.region);
  const category = normalizeSearch(place.category);
  const tags = place.tags.map(normalizeSearch);
  const description = normalizeSearch(place.description);
  const normalizedQuery = normalizeSearch(query);
  let score = 0;

  if (title === normalizedQuery) score += 1_000;
  else if (title.startsWith(normalizedQuery)) score += 700;
  else if (title.includes(normalizedQuery)) score += 450;

  for (const term of terms) {
    if (title === term) score += 160;
    else if (title.startsWith(term)) score += 120;
    else if (title.includes(term)) score += 80;
    if (region.includes(term)) score += 35;
    if (tags.some((tag) => tag.includes(term))) score += 25;
    if (category.includes(term)) score += 15;
    if (description.includes(term)) score += 10;
    if (normalizeSearch(note).includes(term)) score += 5;
  }

  return score;
}

/** All filters intersect. Unpositioned entries remain searchable. */
export function filterPlaces(
  places: Place[],
  filters: Filters,
  favoriteIds: string[],
  notes: PlaceNote[],
  collections: Collection[],
): Place[] {
  const favorites = new Set(favoriteIds);
  const members = filters.collectionId
    ? new Set(
        collections.find((c) => c.id === filters.collectionId)?.placeIds ?? [],
      )
    : null;
  const noteIndex = new Map(notes.map((n) => [n.placeId, n.text]));
  const terms = normalizeSearch(filters.query).split(/\s+/).filter(Boolean);
  const categoryTags = filters.categoryTags ?? [];
  const selectedCategoryTags = new Set(categoryTags.map(normalizeCategoryTag));
  const matches = places.filter((place) => {
    if (filters.category !== "all" && filters.category !== place.category)
      return false;
    if (selectedCategoryTags.size && !place.tags.some((tag) => selectedCategoryTags.has(normalizeCategoryTag(tag))))
      return false;
    if (filters.favoritesOnly && !favorites.has(place.id)) return false;
    if (filters.personalOnly && place.evidence !== "personal") return false;
    if (filters.evidence !== "all" && filters.evidence !== place.evidence)
      return false;
    if (members && !members.has(place.id)) return false;
    if (!terms.length) return true;
    const haystack = normalizeSearch(
      [
        place.title,
        place.category,
        place.region,
        place.description,
        ...place.tags,
        noteIndex.get(place.id) ?? "",
      ].join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });

  if (!terms.length) return matches;
  return matches
    .map((place, index) => ({
      place,
      index,
      rank: searchRank(
        place,
        filters.query,
        terms,
        noteIndex.get(place.id) ?? "",
      ),
    }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map(({ place }) => place);
}
