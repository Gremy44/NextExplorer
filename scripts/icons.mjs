import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
function crc32(b) {
  let c = 0xffffffff;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    n = Buffer.alloc(4),
    c = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([n, t, data, c]);
}
for (const n of [16, 48, 128]) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const X = x / n,
        Y = y / n;
      const base = X > 0.03 && X < 0.97 && Y > 0.03 && Y < 0.97;
      const line =
        Math.abs(Y - (0.35 + Math.abs(X - 0.5) * 0.45)) < 0.035 ||
        Math.abs(Y - (0.5 + Math.abs(X - 0.5) * 0.45)) < 0.035 ||
        Math.abs(Y - (0.65 + Math.abs(X - 0.5) * 0.45)) < 0.035;
      const mark = X > 0.23 && X < 0.77 && line;
      const i = y * (n * 4 + 1) + 1 + x * 4;
      raw.set(
        mark ? [28, 23, 15, 255] : base ? [245, 158, 11, 255] : [0, 0, 0, 0],
        i,
      );
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(n);
  header.writeUInt32BE(n, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icon${n}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
