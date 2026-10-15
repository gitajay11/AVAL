import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast for the brand tokens, read straight from globals.css so a
// colour change that breaks AA fails here.
const css = readFileSync(path.join(__dirname, "..", "src", "app", "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg", "surface", "surface-2", "surface-3"];
const TEXT = 4.5; // AA, normal text
const UI = 3; // AA, focus rings and other non-text indicators

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_, t) => {
  it.each(["text", "text-muted", "text-subtle", "accent", "danger"])("%s is readable on every surface", (fg) => {
    for (const bg of SURFACES) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(TEXT);
  });

  it("primary links and icons are readable on surfaces", () => {
    for (const bg of SURFACES) expect(contrast(t.primary, t[bg]), `primary on ${bg}`).toBeGreaterThanOrEqual(TEXT);
  });

  it("focus ring stands out from every surface", () => {
    for (const bg of SURFACES) expect(contrast(t.ring, t[bg]), `ring on ${bg}`).toBeGreaterThanOrEqual(UI);
  });

  it("white text works across the whole brand gradient (sent bubbles, primary buttons)", () => {
    expect(contrast("#ffffff", t["grad-from"])).toBeGreaterThanOrEqual(TEXT);
    expect(contrast("#ffffff", t["grad-to"])).toBeGreaterThanOrEqual(TEXT);
  });
});
