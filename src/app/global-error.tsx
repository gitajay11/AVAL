"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it brings its own document and
// styles (globals.css and the theme script are not loaded here).
const css = `
:root{--bg:#eef3f8;--text:#0b1b2b;--muted:#46596c;--ring:#059669;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#050d18;--text:#e6eef7;--muted:#a3b3c6;--ring:#34d399;color-scheme:dark}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;-webkit-tap-highlight-color:transparent}
h1{margin:0 0 6px;font-size:22px}p{margin:0;color:var(--muted)}
button{margin-top:24px;height:44px;padding:0 22px;border:0;border-radius:16px;background:linear-gradient(135deg,#1d4ed8,#0f766e);color:#fff;font-family:inherit;font-size:15px;font-weight:600;line-height:1;cursor:pointer}
button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
`;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Aval</title>
        <style>{css}</style>
        <main role="alert">
          <h1>Aval hit a problem</h1>
          <p>Your messages are safe. Try again, or reload the page.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
