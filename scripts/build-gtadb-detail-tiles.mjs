import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'public/assets/street-leonida/maps/gtadb-yanis-16-z5');
const output = resolve(root, 'public/assets/gtadb-original-chunks');

await mkdir(output, { recursive: true });

const minX = 21;
const maxX = 79;
const minY = 21;
const maxY = 95;
const chunkSize = 8;

let built = 0;

for (let y = minY; y <= maxY; y += chunkSize) {
  for (let x = minX; x <= maxX; x += chunkSize) {
    const columns = Math.min(chunkSize, maxX - x + 1);
    const rows = Math.min(chunkSize, maxY - y + 1);

    const layers = [];

    for (let ty = y; ty < y + rows; ty++) {
      for (let tx = x; tx < x + columns; tx++) {
        layers.push({
          input: resolve(source, `5,${ty},${tx}.jpg`),
          left: (tx - x) * 256,
          top: (ty - y) * 256,
        });
      }
    }

    const width = columns * 256;
    const height = rows * 256;
    const filename = `x${x}-y${y}.jpg`;

    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(layers)
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(resolve(output, filename));

    built++;
  }

  console.log(`Completed source row ${y}; ${built} chunks built.`);
}

console.log(`Finished: ${built} original GTADB detail chunks.`);
