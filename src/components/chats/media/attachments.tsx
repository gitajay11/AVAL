"use client";

import { useEffect, useState } from "react";
import { Download, EyeOff, FileText, ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AttachmentDTO, LinkPreviewDTO } from "@/lib/chats/types";
import { formatBytes } from "@/lib/media/policy";
import { useLightbox } from "./lightbox";
import { VoicePlayer } from "./voice-player";

const MAX_W = 320;
const MAX_H = 380;

/** Display box for media with known dimensions, so the list never jumps when it loads. */
function fit(width: number | null, height: number | null) {
  if (!width || !height) return { width: MAX_W, height: Math.round(MAX_W * 0.75) };
  const scale = Math.min(1, MAX_W / width, MAX_H / height);
  return { width: Math.max(160, Math.round(width * scale)), height: Math.max(100, Math.round(height * scale)) };
}

function ImageAttachment({ a, canDownload }: { a: AttachmentDTO; canDownload: boolean }) {
  const open = useLightbox();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // A sent photo switches from the local preview to the server copy: keep
  // showing the preview until the new one has decoded, so it never blanks.
  const [src, setSrc] = useState(a.url);
  useEffect(() => {
    if (a.url === src) return;
    let live = true;
    const next = new Image();
    next.src = a.url;
    const swap = () => live && setSrc(a.url);
    next.decode().then(swap, swap);
    return () => {
      live = false;
    };
  }, [a.url, src]);
  const box = fit(a.width, a.height);
  return (
    <button
      type="button"
      onClick={() => open({ src: a.url, alt: a.fileName ?? "Photo", downloadUrl: canDownload ? `${a.url}?download=1` : null })}
      className="relative block max-w-full overflow-hidden rounded-[14px] bg-surface-3"
      style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}
      aria-label="Open photo"
    >
      {state === "error" ? (
        <span className="absolute inset-0 grid place-items-center text-subtle">
          <ImageOff className="size-7" aria-hidden="true" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed per-viewer media URL
        <img
          src={src}
          alt={a.fileName ?? "Photo"}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          className={cn(
            "size-full object-cover transition-[opacity,filter] duration-300 motion-reduce:transition-none",
            state === "ready" ? "opacity-100 blur-0" : "opacity-0 blur-md",
          )}
        />
      )}
      {state === "loading" && <span className="absolute inset-0 animate-pulse bg-surface-3" aria-hidden="true" />}
    </button>
  );
}

function VideoAttachment({ a, canDownload }: { a: AttachmentDTO; canDownload: boolean }) {
  const box = fit(a.width, a.height);
  return (
    <video
      src={a.url}
      controls
      {...(canDownload ? {} : { controlsList: "nodownload", onContextMenu: (e: React.MouseEvent) => e.preventDefault() })}
      playsInline
      preload="metadata"
      className="block max-w-full rounded-[14px] bg-black"
      style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}
    />
  );
}

function FileAttachment({ a, mine, canDownload }: { a: AttachmentDTO; mine: boolean; canDownload: boolean }) {
  if (!canDownload) {
    return (
      <div className="flex max-w-[300px] items-center gap-3 rounded-[14px] bg-surface-2 p-2 pr-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-3 text-muted">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{a.fileName ?? "File"}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <EyeOff className="size-3" aria-hidden="true" /> Not available in view-only
          </span>
        </span>
      </div>
    );
  }
  return (
    <a
      href={`${a.url}?download=1`}
      className={cn(
        "flex max-w-[300px] items-center gap-3 rounded-[14px] p-2 pr-3 transition-colors",
        mine ? "bg-white/12 hover:bg-white/20" : "bg-surface-2 hover:bg-surface-3",
      )}
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", mine ? "bg-white/20" : "bg-brand text-white")}>
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{a.fileName ?? "File"}</span>
        <span className={cn("block text-xs", mine ? "text-white/75" : "text-muted")}>{formatBytes(a.sizeBytes)}</span>
      </span>
      <Download className="size-[18px] shrink-0 opacity-80" aria-label="Download" />
    </a>
  );
}

export function Attachments({ attachments, mine, canDownload = true }: { attachments: AttachmentDTO[]; mine: boolean; canDownload?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Keyed by position: the id changes when the local preview becomes the sent copy. */}
      {attachments.map((a, i) =>
        a.kind === "IMAGE" ? (
          <ImageAttachment key={i} a={a} canDownload={canDownload} />
        ) : a.kind === "VIDEO" ? (
          <VideoAttachment key={i} a={a} canDownload={canDownload} />
        ) : a.kind === "VOICE" ? (
          <VoicePlayer key={i} a={a} mine={mine} />
        ) : (
          <FileAttachment key={i} a={a} mine={mine} canDownload={canDownload} />
        ),
      )}
    </div>
  );
}

export function LinkPreviewCard({ preview, mine }: { preview: LinkPreviewDTO; mine: boolean }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn(
        "mt-1.5 block max-w-[320px] overflow-hidden rounded-[12px] border-l-[3px] transition-colors",
        mine ? "border-white/70 bg-white/12 hover:bg-white/18" : "border-accent bg-surface-2 hover:bg-surface-3",
      )}
    >
      {preview.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- preview image copied into our storage, signed URL
        <img src={preview.imageUrl} alt="" loading="lazy" className="aspect-[1.91/1] w-full object-cover" />
      )}
      <span className="block px-3 py-2">
        {preview.siteName && (
          <span className={cn("block truncate text-xs font-semibold", mine ? "text-white/80" : "text-accent")}>{preview.siteName}</span>
        )}
        {preview.title && <span className="line-clamp-2 block text-[14px] leading-snug font-semibold">{preview.title}</span>}
        {preview.description && (
          <span className={cn("mt-0.5 line-clamp-2 block text-[13px] leading-snug", mine ? "text-white/80" : "text-muted")}>
            {preview.description}
          </span>
        )}
      </span>
    </a>
  );
}
