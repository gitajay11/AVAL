// Generates every app icon from the brand mark (same drawing as <LogoMark>).
// Run after changing the mark:  pnpm icons
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "icons");

const GRADIENT = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0f766e"/></linearGradient>`;
// The glyph on a 48×48 grid: an arch with a crossbar, plus the emerald dot.
const glyph = (stroke = "#fff", dot = "#6ee7b7") =>
  `<path d="M14 31.5c0-7.5 4.6-15 10-15s10 7.5 10 15M18.5 26h11" stroke="${stroke}" stroke-width="3.4" stroke-linecap="round" fill="none"/>` +
  `<circle cx="34.5" cy="33" r="3" fill="${dot}"/>`;

/** Rounded tile with transparent corners ("any" purpose, favicon). */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs>${GRADIENT}</defs><rect width="48" height="48" rx="15" fill="url(#g)"/>${glyph()}</svg>`;

/** Full-bleed square, glyph inside the central safe zone (maskable, Apple touch). */
const fullBleed = (scale: number) => {
  const offset = (48 - 48 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs>${GRADIENT}</defs><rect width="48" height="48" fill="url(#g)"/><g transform="translate(${offset} ${offset}) scale(${scale})">${glyph()}</g></svg>`;
};

/** Android status-bar badge: white silhouette on transparent (the OS tints it). */
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g transform="translate(-2 -2) scale(1.08)">${glyph("#fff", "#fff")}</g></svg>`;

const png = (svg: string, size: number) => sharp(Buffer.from(svg), { density: 72 * (size / 48) * 2 }).resize(size, size).png().toBuffer();

/** Minimal .ico holding one PNG image (supported by every current browser). */
function ico(pngData: Buffer, size: number) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(pngData.length, 14);
  header.writeUInt32LE(22, 18); // data offset
  return Buffer.concat([header, pngData]);
}

await mkdir(out, { recursive: true });
const files: [string, Promise<Buffer>][] = [
  ["icon-192.png", png(rounded, 192)],
  ["icon-512.png", png(rounded, 512)],
  // Maskable: the glyph must sit inside the central 80% circle.
  ["maskable-512.png", png(fullBleed(0.72), 512)],
  ["maskable-192.png", png(fullBleed(0.72), 192)],
  ["badge-72.png", png(badge, 72)],
];
for (const [name, data] of files) await writeFile(path.join(out, name), await data);

// App Router metadata files: <link rel="icon"> (SVG + .ico fallback) and apple-touch-icon.
await writeFile(path.join(root, "src", "app", "icon.svg"), rounded + "\n");
await writeFile(path.join(root, "src", "app", "apple-icon.png"), await png(fullBleed(0.8), 180));
await writeFile(path.join(root, "src", "app", "favicon.ico"), ico(await png(rounded, 32), 32));

console.log("Icons written to public/icons and src/app.");
