import { describe, expect, it } from 'vitest';
import { getAllDossiers } from '../../src/features/dossier/registry';

describe('dossier artwork', () => {
  it('does not bundle unlicensed artwork in public dossiers', () => {
    expect(getAllDossiers().flatMap((entry) => entry.gallery)).toEqual([]);
  });
});
