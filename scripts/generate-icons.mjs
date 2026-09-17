import { deflateSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function png(size, r, g, b) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 3;
      const inset = size * 0.18;
      const inBadge = x > inset && x < size - inset && y > inset && y < size - inset;
      if (inBadge) {
        raw[i] = 244;
        raw[i + 1] = 246;
        raw[i + 2] = 248;
      } else {
        raw[i] = r;
        raw[i + 1] = g;
        raw[i + 2] = b;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.resolve("apps/web/public/icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon-192.png"), png(192, 10, 35, 66));
fs.writeFileSync(path.join(outDir, "icon-512.png"), png(512, 10, 35, 66));
fs.copyFileSync(path.join(outDir, "icon-192.png"), path.resolve("apps/web/public/apple-touch-icon.png"));
console.log("Wrote PWA icons");
