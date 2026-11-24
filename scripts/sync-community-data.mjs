import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRepo = 'https://github.com/rolux/gtadb.org.git';
const upstreamPath = 'map/data/6/landmarks.json';
const assetPath = path.join(root, 'public/assets/street-leonida/maps/gtadb-landmarks-5c1d69f.json');
const syncScript = path.join(root, 'scripts/sync-gtadb-landmarks.mjs');
const staging = await mkdtemp(path.join(tmpdir(), 'lobos-community-sync-'));
const tempSyncScript = path.join(
  path.dirname(syncScript),
  `.sync-gtadb-dynamic-${randomUUID()}.mjs`,
);
let ownsTempSyncScript = false;

function replaceOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Could not update importer ${label}; pattern missing.`);
  return source.replace(pattern, replacement);
}


try {
  await exec('git', ['init', staging]);
  await exec('git', ['-C', staging, 'remote', 'add', 'origin', upstreamRepo]);
  await exec('git', ['-C', staging, 'config', 'core.sparseCheckout', 'true']);
  await writeFile(path.join(staging, '.git/info/sparse-checkout'), `${upstreamPath}\n`);
  await exec('git', ['-C', staging, 'pull', '--depth=1', 'origin', 'main']);
  const { stdout: revision } = await exec('git', ['-C', staging, 'rev-parse', 'HEAD']);
  const rawFile = path.join(staging, upstreamPath);
  const rawText = await readFile(rawFile, 'utf8');
  const sha = createHash('sha256').update(rawText).digest('hex');
  const source = await readFile(syncScript, 'utf8');
  let dynamicSource = replaceOnce(source, /const GTADB_REVISION = '[^']+';/, `const GTADB_REVISION = '${revision.trim()}';`, 'revision');
  dynamicSource = replaceOnce(dynamicSource, /const GTADB_SNAPSHOT_SHA256 = '[^']+';/, `const GTADB_SNAPSHOT_SHA256 = '${sha}';`, 'sha256');
  dynamicSource = replaceOnce(dynamicSource, /const GTADB_RAW_URL = `[^`]+`;/, `const GTADB_RAW_URL = 'https://github.com/rolux/gtadb.org';`, 'raw url');
  dynamicSource = replaceOnce(dynamicSource, /const response = await globalThis\.fetch\(GTADB_RAW_URL\);[\s\S]*?const landmarks = normalizeLandmarks\(JSON\.parse\(rawText\)\);/, `const rawText = await readFile(${JSON.stringify(rawFile)}, 'utf8');\nassertRawPayloadSize(rawText);\nconst actualSha256 = createHash('sha256').update(rawText).digest('hex');\nif (actualSha256 !== GTADB_SNAPSHOT_SHA256) throw new Error('Local upstream SHA mismatch.');\nconst landmarks = normalizeLandmarks(JSON.parse(rawText));`, 'download/validation block');
  await writeFile(tempSyncScript, dynamicSource, { encoding: 'utf8', flag: 'wx' });
  ownsTempSyncScript = true;
  // Existing importer validates the schema, tags, coordinates and tuple layout before output.
  await exec(process.execPath, [tempSyncScript], { cwd: root });
  const snapshot = JSON.parse(await readFile(assetPath, 'utf8'));
  const manifest = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: 'rolux/gtadb.org',
    upstreamRevision: revision.trim(),
    sha256: sha,
    records: snapshot.counts.recordCount,
    positioned: snapshot.counts.positionedCount,
    unpositioned: snapshot.counts.unpositionedCount,
    license: 'CC BY 4.0',
    sourceUrl: 'https://map.gtadb.org',
  };
  const manifestPath = path.join(root, 'public/assets/street-leonida/maps/community-manifest.json');
  const temporaryManifest = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryManifest, manifestPath);
  } finally {
    await rm(temporaryManifest, { force: true });
  }
  console.log(`Community sync validated: ${manifest.records} records at ${manifest.upstreamRevision}`);
} finally {
  if (ownsTempSyncScript) await rm(tempSyncScript, { force: true });
  await rm(staging, { recursive: true, force: true });
}
