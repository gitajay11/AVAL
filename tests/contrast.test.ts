import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast for the glass theme, read straight from globals.css.
// Glass is see-through, so every check composites the surface over the worst
// spots of the backdrop: the plain base and the peak of each drifting blob.
const css = readFileSync(path.join(__dirname, "..", "src", "app", "globals.css"), "utf8");

type RGBA = [number, number, number, number];

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\/\*.*?\*\//g, "").trim()]));
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function color(tokens: Record<string, string>, name: string): RGBA {
  let v = tokens[name];
  for (let i = 0; v?.startsWith("var("); i++) v = tokens[v.slice(6, -1)];
  if (!v) throw new Error(`no --${name}`);
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGBA;
  const rgb = v.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`can't parse --${name}: ${v}`);
}

const over = ([r, g, b, a]: RGBA, [R, G, B]: RGBA): RGBA => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const withAlpha = ([r, g, b]: RGBA, a: number): RGBA => [r, g, b, a];

function luminance([r, g, b]: RGBA) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrast(a: RGBA, b: RGBA) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The base, and the base under each blob at its peak opacity. */
function backdrops(t: Record<string, string>): RGBA[] {
  const base = color(t, "bg");
  return [base, ...(["jade", "ocean", "mint"] as const).map((b) => over(withAlpha(color(t, b), Number(t[`blob-${b}`])), base))];
}

const TEXT = 4.5; // AA, normal text
const UI = 3; // AA, focus indicators
const WHITE: RGBA = [255, 255, 255, 1];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_, t) => {
  const backs = backdrops(t);
  const card = color(t, "glass-1");
  // Every glass level straight over the backdrop, plus chips/inputs (surface-3) sitting on a card.
  const surfaces: Record<string, RGBA[]> = Object.fromEntries(
    ["glass-1", "glass-1-hover", "glass-2", "glass-2-hover", "glass-3", "surface-3"].map((s) => [s, backs.map((b) => over(color(t, s), b))]),
  );
  surfaces["surface-3 on a card"] = backs.map((b) => over(color(t, "surface-3"), over(card, b)));

  it.each(["text", "text-muted", "text-subtle", "accent", "danger", "primary"])("%s is AA on every glass surface over every blob", (fg) => {
    for (const [name, list] of Object.entries(surfaces))
      for (const bg of list) expect(contrast(color(t, fg), bg), `${fg} on ${name}`).toBeGreaterThanOrEqual(TEXT);
  });

  it("focus ring stands out from every glass surface", () => {
    for (const [name, list] of Object.entries(surfaces))
      for (const bg of list) expect(contrast(color(t, "ring"), bg), `ring on ${name}`).toBeGreaterThanOrEqual(UI);
  });

  it("white text on sent bubbles (tinted glass) over every blob", () => {
    const alpha = Number(t["bubble-alpha"]);
    for (const stop of ["grad-from", "grad-to"])
      for (const b of backs) expect(contrast(WHITE, over(withAlpha(color(t, stop), alpha), b)), stop).toBeGreaterThanOrEqual(TEXT);
  });

  it("white text on primary buttons and the active capsule (92% gradient glass)", () => {
    for (const stop of ["grad-from", "grad-to"])
      for (const b of backs) expect(contrast(WHITE, over(withAlpha(color(t, stop), 0.92), b)), stop).toBeGreaterThanOrEqual(TEXT);
  });
});
