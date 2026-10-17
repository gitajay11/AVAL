// Generates every app icon and launch image from the brand logo
// (public/logo/aval-logo-circle.png: a circle on a transparent background).
// Run after changing the logo:  pnpm icons
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BRAND_BG, ICONS, SPLASH_LOGO, STARTUP_DEVICES, startupImage } from "../src/lib/pwa-assets";

const root = path.resolve(import.meta.dirname, "..");
const pub = path.join(root, "public");
const SOURCE = path.join(pub, "logo", "aval-logo-circle.png");
const file = (url: string) => path.join(pub, url.split("?")[0]);

const meta = await sharp(SOURCE).metadata();
if (meta.width !== meta.height || (meta.width ?? 0) < 1024) {
  throw new Error(`The logo must be square and at least 1024px (got ${meta.width}x${meta.height}).`);
}

// Palette PNGs: a fraction of the size, no visible difference at these sizes.
const PNG = { compressionLevel: 9, palette: true, quality: 92, effort: 10 } as const;

// The logo cropped to the circle itself (the source has transparent padding).
const circle = await sharp(SOURCE).trim().png().toBuffer();

// The trimmed logo is not exactly square (the leaf sticks out), so every resize
// fits it inside the square: the default "cover" would cut its edges off.
const CONTAIN = { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } } as const;

/** The circle filling a transparent square ("any" icons, favicon, in-app logo). */
const round = (size: number) => sharp(circle).resize(size, size, { ...CONTAIN, kernel: "lanczos3" }).png(PNG).toBuffer();

/** The circle at `scale` of the width, centred on the brand background (no transparency). */
async function onBackground(size: number, scale: number) {
  const inner = Math.round(size * scale);
  const logo = await sharp(circle).resize(inner, inner, CONTAIN).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BRAND_BG } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: BRAND_BG })
    .png(PNG)
    .toBuffer();
}

/**
 * iOS launch screen: the logo (SPLASH_LOGO CSS px) centred on the brand
 * background with the same soft glow as the in-app splash (app/layout.tsx).
 */
async function startup(width: number, height: number, ratio: number) {
  const logoPx = SPLASH_LOGO * ratio;
  const glowPx = Math.round(logoPx * 2.4);
  const glow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${glowPx}" height="${glowPx}"><defs><radialGradient id="g"><stop offset="0" stop-color="#6ee7c8" stop-opacity="0.28"/><stop offset="0.45" stop-color="#1b4e9e" stop-opacity="0.14"/><stop offset="1" stop-color="#07141a" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const logo = await sharp(circle).resize(logoPx, logoPx, CONTAIN).png().toBuffer();
  return sharp({ create: { width: width * ratio, height: height * ratio, channels: 4, background: BRAND_BG } })
    .composite([
      { input: glow, gravity: "center" },
      { input: logo, gravity: "center" },
    ])
    .flatten({ background: BRAND_BG })
    .png(PNG)
    .toBuffer();
}

/**
 * Android status-bar badge: a white silhouette the OS tints. Made from the logo
 * itself: the circle, with its light shapes (face, chat bubble) cut out.
 */
async function badge(size: number) {
  const { data, info } = await sharp(circle).resize(size * 4, size * 4, CONTAIN).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4, 255);
  for (let i = 0; i < info.width * info.height; i++) {
    const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b >= 170;
    out[i * 4 + 3] = a > 128 && !light ? 255 : 0;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(size, size).png(PNG).toBuffer();
}

/** .ico holding one PNG per size (16, 32, 48): browsers pick the sharpest for the tab. */
function ico(images: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// Start clean: no earlier icon or launch image may linger at any URL.
await rm(path.join(pub, "icons"), { recursive: true, force: true });
await rm(path.join(pub, "splash"), { recursive: true, force: true });
await mkdir(path.join(pub, "icons"), { recursive: true });
await mkdir(path.join(pub, "splash"), { recursive: true });

const outputs: [string, Promise<Buffer>][] = [
  [file(ICONS.any192), round(192)],
  [file(ICONS.any512), round(512)],
  // Maskable: Android draws it as an adaptive icon, which shows only the central
  // two-thirds (the launcher icon and the launch screen, both masked to a circle).
  // At 60% the whole logo, leaf and chat bubble included, stays inside that circle.
  [file(ICONS.maskable512), onBackground(512, 0.6)],
  [file(ICONS.appleTouch), onBackground(180, 0.9)],
  [file(ICONS.favicon32), round(32)],
  [file(ICONS.badge), badge(72)],
  [
    file(ICONS.favicon),
    Promise.all(
      [16, 32, 48].map(async (size) => ({ size, png: await sharp(circle).resize(size, size, { ...CONTAIN, kernel: "lanczos3" }).sharpen({ sigma: 0.5 }).png().toBuffer() })),
    ).then(ico),
  ],
  // In-app logo (components/ui/logo.tsx, the splash, the offline page).
  [path.join(pub, "icons", "logo-256.webp"), sharp(circle).resize(256, 256, CONTAIN).webp({ quality: 90, alphaQuality: 100 }).toBuffer()],
  [path.join(pub, "icons", "logo-512.webp"), sharp(circle).resize(512, 512, CONTAIN).webp({ quality: 88, alphaQuality: 100 }).toBuffer()],
  ...STARTUP_DEVICES.map((d) => [file(startupImage(d).url), startup(d.width, d.height, d.ratio)] as [string, Promise<Buffer>]),
];
for (const [dest, data] of outputs) await writeFile(dest, await data);

console.log(`Wrote ${outputs.length} files:`, (await readdir(path.join(pub, "icons"))).length, "icons,", (await readdir(path.join(pub, "splash"))).length, "launch images.");
