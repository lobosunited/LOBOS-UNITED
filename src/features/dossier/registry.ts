import type { DossierEntry, DossierSearchOptions } from './types';
import { officialCharacterDossiers } from './entries';

/**
 * Central dossier registry.
 * Map places and encyclopedia records can reference the same entry via placeId.
 * No unverified GTA VI facts are seeded here.
 */
const entries: DossierEntry[] = officialCharacterDossiers.map((entry) => ({ ...entry, gallery: [] }));

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getAllDossiers(): DossierEntry[] {
  return [...entries];
}

export function getDossierById(id: string): DossierEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

export function getDossierForPlace(placeId: string): DossierEntry | undefined {
  return entries.find((entry) => entry.placeId === placeId);
}

export function searchDossiers(options: DossierSearchOptions = {}): DossierEntry[] {
  const query = normalize(options.query ?? '');
  const region = normalize(options.region ?? '');

  return entries.filter((entry) => {
    if (options.category && options.category !== 'all' && entry.category !== options.category) {
      return false;
    }

    if (region && normalize(entry.region ?? '') !== region) {
      return false;
    }

    if (!query) return true;

    const searchable = normalize(
      [
        entry.name,
        entry.category,
        entry.summary,
        entry.description,
        entry.region ?? '',
        ...entry.aliases,
        ...entry.tags,
        ...entry.facts.flatMap((fact) => [fact.label, fact.value]),
      ].join(' '),
    );

    return searchable.includes(query);
  });
}

/** Validate an incoming entry before adding it to the registry. */
export function validateDossier(entry: DossierEntry): string[] {
  const errors: string[] = [];

  if (!entry.id.trim()) errors.push('ID is required.');
  if (!entry.name.trim()) errors.push('Name is required.');
  if (!entry.category) errors.push('Category is required.');
  if (!Array.isArray(entry.gallery)) errors.push('Gallery must be an array.');
  if (!Array.isArray(entry.facts)) errors.push('Facts must be an array.');
  if (!Array.isArray(entry.sources)) errors.push('Sources must be an array.');
  if (!Array.isArray(entry.relatedIds)) errors.push('Related IDs must be an array.');

  return errors;
}

/** Safe registration: rejects invalid or duplicate IDs without replacing records. */
export function registerDossier(entry: DossierEntry): void {
  const errors = validateDossier(entry);
  if (errors.length) throw new Error(`Invalid dossier: ${errors.join(' ')}`);

  if (entries.some((existing) => existing.id === entry.id)) {
    throw new Error(`Duplicate dossier ID: ${entry.id}`);
  }

  entries.push(entry);
}

/** Clears the in-memory registry; intended for tests and controlled data reloads. */
export function clearDossierRegistry(): void {
  entries.length = 0;
}
