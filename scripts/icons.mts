// Generates every app icon from the brand logo (logo/Aval logo circle.png: a
// circle on a transparent background). Run after changing the logo:  pnpm icons
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "icons");
const SOURCE = path.join(root, "logo", "Aval logo circle.png");
// The app's dark background (manifest background_color): behind the logo where
// an icon can't be transparent (maskable, Apple touch).
const BACKGROUND = "#07141a";

// Palette PNGs: a fraction of the size, no visible difference at icon sizes.
const PNG = { compressionLevel: 9, palette: true, quality: 92, effort: 10 } as const;

// The logo cropped to the circle itself (the source has transparent padding).
const circle = await sharp(SOURCE).trim().png().toBuffer();

/** The circle filling a transparent square ("any" purpose icons, favicon, in-app logo). */
const round = (size: number) => sharp(circle).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png(PNG).toBuffer();

/** The circle at `scale` of the width on a solid square (maskable: inside the 80% safe zone; Apple touch). */
async function onBackground(size: number, scale: number) {
  const inner = Math.round(size * scale);
  const logo = await sharp(circle).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: "center" }])
    .png(PNG)
    .toBuffer();
}

// Android status-bar badge: a white silhouette the OS tints. The detailed logo has
// no usable single-colour form, so the badge keeps the simple chat-arch glyph.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g transform="translate(-2 -2) scale(1.08)"><path d="M14 31.5c0-7.5 4.6-15 10-15s10 7.5 10 15M18.5 26h11" stroke="#fff" stroke-width="3.4" stroke-linecap="round" fill="none"/><circle cx="34.5" cy="33" r="3" fill="#fff"/></g></svg>`;

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
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/** Small favicon sizes: scaled straight from the full logo, lightly sharpened. */
const tiny = (size: number) => sharp(circle).resize(size, size, { kernel: "lanczos3" }).sharpen({ sigma: 0.5 }).png().toBuffer();

await mkdir(out, { recursive: true });
const files: [string, Promise<Buffer>][] = [
  ["icon-192.png", round(192)],
  ["icon-512.png", round(512)],
  // Maskable: the launcher crops to its own shape; the logo stays inside the central 80% circle.
  ["maskable-512.png", onBackground(512, 0.8)],
  ["maskable-192.png", onBackground(192, 0.8)],
  ["badge-72.png", sharp(Buffer.from(badge), { density: 72 * (72 / 48) * 2 }).resize(72, 72).png().toBuffer()],
  // In-app logo and the launch screen (components/ui/logo.tsx, app/layout.tsx).
  ["logo-256.webp", sharp(circle).resize(256, 256).webp({ quality: 90, alphaQuality: 100 }).toBuffer()],
  ["logo-512.webp", sharp(circle).resize(512, 512).webp({ quality: 88, alphaQuality: 100 }).toBuffer()],
];
for (const [name, data] of files) await writeFile(path.join(out, name), await data);

// App Router metadata files: <link rel="icon"> (PNG + .ico fallback) and apple-touch-icon.
await rm(path.join(root, "src", "app", "icon.svg"), { force: true });
await writeFile(path.join(root, "src", "app", "icon.png"), await round(192));
await writeFile(path.join(root, "src", "app", "apple-icon.png"), await onBackground(180, 0.9));
await writeFile(path.join(root, "src", "app", "favicon.ico"), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await tiny(size) })))));

console.log("Icons written to public/icons and src/app.");
