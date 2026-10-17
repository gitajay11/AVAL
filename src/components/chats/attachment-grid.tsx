"use client";

import { Reorder } from "motion/react";
import { Crop, FileText, Play, X } from "lucide-react";
import type { Picked } from "./composer";

/**
 * Picked attachments before sending: drag (or Alt+←/→) to reorder, remove,
 * crop photos. Its own module, loaded once something is picked.
 */
export function AttachmentGrid({
  items,
  onReorder,
  onMove,
  onRemove,
  onCrop,
}: {
  items: Picked[];
  onReorder: (items: Picked[]) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onRemove: (id: string) => void;
  onCrop: (item: Picked) => void;
}) {
  return (
    <Reorder.Group
      axis="x"
      values={items}
      onReorder={onReorder}
      className="flex gap-2 overflow-x-auto overscroll-contain px-1 pt-1 pb-1.5"
      aria-label="Attachments"
    >
      {items.map((item, idx) => (
        <Reorder.Item
          key={item.id}
          value={item}
          tabIndex={0}
          onKeyDown={(e) => {
            // Keyboard reorder: Alt + ←/→.
            if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
              e.preventDefault();
              onMove(item.id, e.key === "ArrowLeft" ? -1 : 1);
            }
            if (e.key === "Delete" || e.key === "Backspace") onRemove(item.id);
          }}
          aria-label={`${item.prepared.fileName ?? item.prepared.kind.toLowerCase()}, ${idx + 1} of ${items.length}. Alt+arrow keys to move, Delete to remove.`}
          className="relative size-[76px] shrink-0 cursor-grab touch-pan-y overflow-hidden rounded-2xl bg-surface-3 select-none active:cursor-grabbing"
          whileDrag={{ scale: 1.06, zIndex: 2 }}
        >
          {item.preview && item.prepared.kind === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked image
            <img src={item.preview} alt="" draggable={false} className="size-full object-cover" />
          ) : item.preview && item.prepared.kind === "VIDEO" ? (
            <>
              <video src={item.preview} muted playsInline preload="metadata" className="size-full object-cover" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-7 place-items-center rounded-full bg-black/45 text-white">
                  <Play className="size-3.5 translate-x-px" fill="currentColor" aria-hidden="true" />
                </span>
              </span>
            </>
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 bg-brand px-1.5 text-white">
              <FileText className="size-5 shrink-0" aria-hidden="true" />
              <span className="w-full truncate text-center text-[10px] font-semibold">{item.prepared.fileName ?? "File"}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/55 text-white"
            aria-label="Remove"
          >
            <X className="size-3.5" />
          </button>
          {item.prepared.kind === "IMAGE" && item.prepared.contentType !== "image/gif" && (
            <button
              type="button"
              onClick={() => onCrop(item)}
              className="absolute bottom-1 left-1 grid size-6 place-items-center rounded-full bg-black/55 text-white"
              aria-label="Crop"
            >
              <Crop className="size-3.5" />
            </button>
          )}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}
