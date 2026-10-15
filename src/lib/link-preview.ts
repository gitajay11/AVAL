import "server-only";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { rebroadcast } from "@/lib/chats/broadcast";
import { db } from "@/lib/db";
import { extensionFor } from "@/lib/media/policy";
import { sniffMime } from "@/lib/media/sniff";
import { putObject } from "@/lib/r2";
import { isPrivateAddress } from "@/lib/security/ip";
import { firstUrl, parseMeta } from "./link-meta";

export { firstUrl };

/**
 * SSRF guard enforced at connect time: every resolved address is checked, so
 * DNS rebinding can't slip a private IP in between "check" and "use".
 */
const agent = new Agent({
  connect: {
    timeout: 4000,
    lookup: (hostname, options, callback) => {
      lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err, [] as never);
        if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
          return callback(new Error(`blocked address for ${hostname}`), [] as never);
        }
        if ((options as { all?: boolean }).all) return callback(null, addresses as never);
        callback(null, addresses[0].address as never, addresses[0].family as never);
      });
    },
  },
  headersTimeout: 4000,
  bodyTimeout: 4000,
});

function allowedUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  if (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".internal")) return null;
  return u;
}

/** GET with manual, re-validated redirects and a hard size cap. */
async function safeFetch(raw: string, accept: string, maxBytes: number) {
  let url = allowedUrl(raw);
  for (let hop = 0; url && hop <= 3; hop++) {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "AvalBot/1.0 (+link previews)", accept },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      url = next ? allowedUrl(new URL(next, url).toString()) : null;
      continue;
    }
    if (!res.ok || !res.body) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) break;
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(Math.min(total, maxBytes));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c.subarray(0, bytes.length - offset), offset);
      offset += c.byteLength;
      if (offset >= bytes.length) break;
    }
    return { url, contentType: res.headers.get("content-type") ?? "", bytes, truncated: total > maxBytes };
  }
  return null;
}

/**
 * Fetch a preview for a message's first link and attach it. The page's image is
 * copied into R2, so the browser only ever loads media from our own storage.
 * Runs after the response; failures just mean no preview.
 */
export async function attachLinkPreview(actorId: string, messageId: string) {
  try {
    const msg = await db.message.findUnique({ where: { id: messageId }, select: { text: true, chatId: true, deletedAt: true } });
    const url = msg?.text ? firstUrl(msg.text) : null;
    if (!msg || msg.deletedAt || !url) return;

    const page = await safeFetch(url, "text/html,application/xhtml+xml", 512 * 1024);
    if (!page || !page.contentType.includes("html")) return;
    const meta = parseMeta(new TextDecoder().decode(page.bytes));
    if (!meta.title && !meta.description) return;

    let image: { key: string; mime: string; size: number } | null = null;
    const imageUrl = meta.image ? allowedUrl(new URL(meta.image, page.url).toString()) : null;
    if (imageUrl) {
      const img = await safeFetch(imageUrl.toString(), "image/*", 3 * 1024 * 1024).catch(() => null);
      const mime = img && !img.truncated ? sniffMime(img.bytes.subarray(0, 32)) : null;
      if (img && mime?.startsWith("image/")) {
        const key = `chats/${msg.chatId}/previews/${randomUUID()}.${extensionFor(mime)}`;
        try {
          await putObject(key, img.bytes, mime);
          image = { key, mime, size: img.bytes.byteLength };
        } catch {
          image = null; // storage not configured: preview without image
        }
      }
    }

    // The message may have been edited or deleted while we were fetching.
    const current = await db.message.findUnique({ where: { id: messageId }, select: { text: true, deletedAt: true } });
    if (!current || current.deletedAt || !current.text || firstUrl(current.text) !== url) return;

    await db.$transaction([
      db.message.update({
        where: { id: messageId },
        data: { linkPreview: { url, title: meta.title, description: meta.description, siteName: meta.siteName ?? page.url.hostname } },
      }),
      ...(image
        ? [
            db.attachment.create({
              data: {
                uploaderId: actorId,
                messageId,
                kind: "LINK_PREVIEW",
                status: "READY",
                objectKey: image.key,
                mimeType: image.mime,
                sizeBytes: image.size,
              },
            }),
          ]
        : []),
    ]);
    await rebroadcast(actorId, messageId);
  } catch (err) {
    const e = err as Error & { cause?: Error };
    console.warn("[link-preview] skipped", messageId, e.cause?.message ?? e.message);
  }
}
