// Generates the PWA icons (crescent moon on a rounded indigo tile) as PNGs
// with zero image dependencies: per-pixel rasterizer + minimal PNG encoder.
//   public/icon-192.png           launcher icon
//   public/icon-512.png           launcher icon
//   public/icon-maskable-512.png  full-bleed background, moon inside safe zone
//   public/icon-mono-512.png      white-on-transparent (Android themed icons)
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---- minimal PNG encoder (RGBA8, no filtering) ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const encodePng = (size, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

// ---- rasterizer ----
// Coverage functions take normalized coords (0..1) and return 0..1.
const inCircle = (x, y, cx, cy, r) => {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};
const inRoundedRect = (x, y, radius) => {
  const r = radius;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};
// Crescent: main disc minus an offset "bite" disc; plus one small star dot.
const inMoon = (x, y, scale) => {
  const cx = 0.5;
  const cy = 0.52;
  const r = 0.27 * scale;
  if (inCircle(x, y, cx - 0.01 * scale, cy, r) && !inCircle(x, y, cx + 0.13 * scale, cy - 0.09 * scale, r * 0.92)) return true;
  if (inCircle(x, y, cx + 0.16 * scale, cy - 0.17 * scale, 0.035 * scale)) return true;
  return false;
};

const SS = 4; // supersampling factor
const render = (size, { bg, fg, shape, moonScale }) => {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgCov = 0;
      let fgCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const inBg = shape === "none" ? false : shape === "square" ? true : inRoundedRect(x, y, 0.22);
          if (inBg) bgCov++;
          if (inMoon(x, y, moonScale) && (shape === "none" || inBg)) fgCov++;
        }
      }
      bgCov /= SS * SS;
      fgCov /= SS * SS;
      const i = (py * size + px) * 4;
      // composite: fg over bg over transparent
      const outA = fgCov + bgCov * (1 - fgCov);
      if (outA === 0) continue;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round((fg[c] * fgCov + bg[c] * bgCov * (1 - fgCov)) / outA);
      }
      rgba[i + 3] = Math.round(outA * 255);
    }
  }
  return encodePng(size, rgba);
};

const BG = [0x41, 0x5f, 0x91]; // MD3 primary (light) from the generated theme family
const FG = [0xd6, 0xe3, 0xff]; // MD3 primary-container tint for the moon
const WHITE = [0xff, 0xff, 0xff];

mkdirSync(new URL("../public", import.meta.url), { recursive: true });
const out = (name, buf) => {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), buf);
  console.log(`Wrote public/${name}`);
};
out("icon-192.png", render(192, { bg: BG, fg: FG, shape: "rounded", moonScale: 1 }));
out("icon-512.png", render(512, { bg: BG, fg: FG, shape: "rounded", moonScale: 1 }));
// Maskable: full-bleed bg; keep the moon within the central 80% safe zone.
out("icon-maskable-512.png", render(512, { bg: BG, fg: FG, shape: "square", moonScale: 0.8 }));
// Monochrome: white glyph on transparency; Android tints it.
out("icon-mono-512.png", render(512, { bg: [0, 0, 0], fg: WHITE, shape: "none", moonScale: 1.15 }));
