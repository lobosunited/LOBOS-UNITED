import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const revision = '2e4a837210f627c5aed6b4159c46961efece17a2';
const rawPath = path.join(root, 'public/assets/leonida-database/catalogs/gta6map-landmarks-source.json');
const outputPath = path.join(root, 'public/assets/leonida-database/catalogs/gta6map-landmarks.json');
const rawText = await readFile(rawPath, 'utf8');
const landmarks = JSON.parse(rawText);
if (!Array.isArray(landmarks) || landmarks.length < 600 || landmarks.length > 2000) {
  throw new Error('The gta6map source snapshot has an unexpected record count.');
}
const seen = new Set();
for (const row of landmarks) {
  if (!Array.isArray(row) || row.length !== 10 || typeof row[0] !== 'string' || seen.has(row[0])) {
    throw new Error('The gta6map snapshot contains a malformed or duplicate landmark.');
  }
  seen.add(row[0]);
  if (row[2].length && (row[2].length !== 2 || !row[2].every(Number.isFinite))) {
    throw new Error(`Invalid map coordinates for ${row[0]}.`);
  }
}
const output = {
  schemaVersion: 1,
  source: {
    name: 'GTA VI Landmarks Map',
    url: 'https://github.com/gta6map/gta6map.github.io',
    dataUrl: 'https://github.com/gta6map/gta6map.github.io/blob/2e4a837210f627c5aed6b4159c46961efece17a2/data/landmarks.json',
    revision,
    license: 'Public domain (upstream declaration)',
    sha256: createHash('sha256').update(rawText).digest('hex'),
    records: landmarks.length,
    positioned: landmarks.filter((row) => row[2].length === 2).length,
    unpositioned: landmarks.filter((row) => row[2].length === 0).length,
  },
  landmarks,
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Imported ${output.source.records} gta6map references (${output.source.positioned} positioned).`);
