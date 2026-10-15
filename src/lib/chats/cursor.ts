// Opaque keyset cursor over (created_at, id). Ties on created_at are broken by
// id, so pagination never skips or repeats a message. Works in the browser and
// on the server (the content is plain ASCII).

export type Cursor = { createdAt: Date; id: string };

export function encodeCursor(c: { createdAt: Date | string; id: string }): string {
  const iso = typeof c.createdAt === "string" ? c.createdAt : c.createdAt.toISOString();
  return btoa(`${iso}|${c.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 128 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let decoded: string;
  try {
    decoded = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const [iso, id] = decoded.split("|");
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !id || !UUID.test(id)) return null;
  return { createdAt, id };
}
