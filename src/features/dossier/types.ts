export type DossierCategory =
  | 'character'
  | 'vehicle'
  | 'location'
  | 'wildlife'
  | 'weapon'
  | 'business'
  | 'collectible'
  | 'mission'
  | 'clothing'
  | 'activity';

export type EvidenceStatus = 'confirmed' | 'reported' | 'community' | 'unknown';

export interface DossierImage {
  id: string;
  url: string;
  caption?: string;
  credit?: string;
}

export interface DossierFact {
  label: string;
  value: string;
}

export interface DossierSource {
  label: string;
  url: string;
  accessedAt?: string;
}

export interface DossierEntry {
  id: string;
  placeId?: string;
  category: DossierCategory;
  name: string;
  aliases: string[];
  summary: string;
  description: string;
  region?: string;
  gallery: DossierImage[];
  facts: DossierFact[];
  tags: string[];
  relatedIds: string[];
  sources: DossierSource[];
  evidence: EvidenceStatus;
}

export interface DossierSearchOptions {
  category?: DossierCategory | 'all';
  query?: string;
  region?: string;
}
