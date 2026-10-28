// Generates the PWA icons as pixel art PNGs (no image tools needed).
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const ART = [
  '................................',
  '................................',
  '...............##...............',
  '..............#..#..............',
  '.............#....#.............',
  '............#......#............',
  '...........#........#...........',
  '..........#..........#..........',
  '.........#............#.........',
  '........#..............#........',
  '.......#.....oooooo.....#.......',
  '......#....oo......oo....#......',
  '.....#....o...cccc...o....#.....',
  '....#....o...cccccc...o....#....',
  '...#....o...cccrrccc...o....#...',
  '..#.....o..cccrrrrccc..o.....#..',
  '..#.....o..cccrrrrccc..o.....#..',
  '...#....o...cccrrccc...o....#...',
  '....#....o...cccccc...o....#....',
  '.....#....o...cccc...o....#.....',
  '......#....oo......oo....#......',
  '.......#.....oooooo.....#.......',
  '........#..............#........',
  '.........#............#.........',
  '..........#..........#..........',
  '...........#........#...........',
  '............#......#............',
  '.............#....#.............',
  '..............#..#..............',
  '...............##...............',
  '................................',
  '................................',
];

const PAL = {
  '.': [10, 6, 16],
  '#': [201, 162, 74],
  o: [233, 223, 199],
  c: [143, 240, 255],
  r: [226, 40, 60],
};

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pad = 0) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const inner = size - pad * 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = PAL['.'];
      const ix = x - pad;
      const iy = y - pad;
      if (ix >= 0 && iy >= 0 && ix < inner && iy < inner) {
        const ax = Math.floor((ix / inner) * 32);
        const ay = Math.floor((iy / inner) * 32);
        col = PAL[ART[ay][ax]] ?? PAL['.'];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192));
writeFileSync('public/icons/icon-512.png', png(512));
writeFileSync('public/icons/maskable-512.png', png(512, 64));
writeFileSync('public/icons/apple-touch-icon.png', png(180, 12));
console.log('icons written to public/icons');
