import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const input = path.join(root, 'data/database/normalized');
const output = path.join(root, 'public/assets/leonida-database/catalogs');

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Required file missing: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
function unwrap(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

const entityData = readJson(path.join(input, 'entities.json'));
const researchData = readJson(path.join(input, 'research-pages.json'));
const entities = unwrap(entityData, ['entities', 'records', 'items']);
const pages = unwrap(researchData, ['records', 'pages', 'researchPages', 'items']);

if (!entities.length) throw new Error('No normalized entities found. Refusing to write an empty archive.');

const categories = {};
const entityRecords = entities.map((e, i) => {
  const category = e.category ?? 'uncategorized';
  categories[category] = (categories[category] ?? 0) + 1;
  return {
    id: e.id ?? `entity-${i + 1}`,
    name: e.name ?? 'Unnamed record',
    category,
    description: e.description ?? '',
    aliases: Array.isArray(e.aliases) ? e.aliases : [],
    attributes: e.attributes && typeof e.attributes === 'object' ? e.attributes : {},
    relations: Array.isArray(e.relations) ? e.relations : [],
    sources: Array.isArray(e.sources) ? e.sources : [],
    images: Array.isArray(e.images) ? e.images : [],
    reliability: e.reliability ?? null,
    verifiedInGame: e.verifiedInGame === true,
    spoiler: e.spoiler === true,
    mapCoordinates: e.mapCoordinates ?? null,
    gtadbLandmarkId: e.gtadbLandmarkId ?? null
  };
});

const seenResearchUrls = new Set();
const researchRecords = pages.map((p, i) => {
  const title = p.title ?? p.name ?? 'Untitled research record';
  const url = p.url ?? p.sourceUrl ?? p.link ?? '';
  const text = `${title} ${url}`;
  const explicitGta6 = /\b(gta\s?6|gta\s?vi|grand theft auto vi)\b/i.test(text);
  const other = /\b(red dead|gta online|gta\s?v\b|gta\s?5\b|grand theft auto v)\b/i.test(text);
  let normalizedUrl = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) normalizedUrl = parsed.href;
  } catch { /* Invalid source URL is omitted. */ }
  const relevant = explicitGta6 && !other && normalizedUrl && !seenResearchUrls.has(normalizedUrl) && (p.pageType === 'public-page' || p.type === 'public-page');
  if (relevant) seenResearchUrls.add(normalizedUrl);
  return relevant ? {
    id: p.id ?? `research-${i + 1}`,
    title,
    name: p.name ?? title,
    url: normalizedUrl,
    sourceUrl: normalizedUrl,
    source: p.source ?? p.domain ?? '',
    description: '',
    snippet: '',
    pageType: p.pageType ?? p.type ?? '',
    relevance: explicitGta6 ? 'explicit GTA VI reference' :
      other ? 'other Rockstar / GTA reference' : 'unclassified research'
  } : null;
}).filter(Boolean);

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'encyclopedia.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: entityRecords.length,
  categories,
  entities: entityRecords
}, null, 2), 'utf8');

fs.writeFileSync(path.join(output, 'research-index.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: researchRecords.length,
  records: researchRecords
}, null, 2), 'utf8');

console.log(`Created archive: ${entityRecords.length} entities; ${researchRecords.length} research records; ${Object.keys(categories).length} categories.`);
