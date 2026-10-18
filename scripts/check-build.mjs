// Runs after `next build` (package.json "build"): fails the build, and so the
// deploy, when the built CSS is missing the rules that keep the signed-in app a
// fixed screen (globals.css → .app-shell). A build once shipped a stale
// stylesheet without them, and the chat composer could end up off-screen.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const STATIC = path.join(process.cwd(), ".next", "static");

/** Each rule the app can't work without, as it appears in the minified CSS. */
const REQUIRED = [
  ["the page lock", /html:has\(\.app-shell\)/],
  ["the fixed app shell", /\.app-shell\{[^}]*position:fixed/],
  ["the keyboard-aware height", /\.app-shell\{[^}]*height:var\(--vv-height\)/],
];

async function cssFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return cssFiles(full);
      return e.name.endsWith(".css") ? [full] : [];
    }),
  );
  return nested.flat();
}

const files = await cssFiles(STATIC);
if (files.length === 0) {
  console.error(`check-build: no CSS found under ${STATIC}. Run it after \`next build\`.`);
  process.exit(1);
}
const css = (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("\n");
const missing = REQUIRED.filter(([, pattern]) => !pattern.test(css));
if (missing.length > 0) {
  console.error(
    `check-build: the built CSS is missing ${missing.map(([name]) => name).join(", ")} (src/app/globals.css, .app-shell).\n` +
      "The build used a stale stylesheet; rebuild without the build cache.",
  );
  process.exit(1);
}
console.log(`check-build: app-shell styles present (${files.length} CSS file${files.length === 1 ? "" : "s"}).`);
