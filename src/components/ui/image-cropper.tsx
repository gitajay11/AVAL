"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { RotateCcw, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CropArea } from "@/lib/client/crop";

export type AspectOption = { label: string; value: number | "original" };

type Props = {
  src: string;
  title: string;
  /** Avatars: fixed 1:1 with a squircle mask. Media: aspect chips. */
  shape?: "squircle" | "rect";
  aspects?: AspectOption[];
  /** Natural size, for the "Original" aspect. */
  natural?: { width: number; height: number };
  saveLabel?: string;
  onCancel: () => void;
  onSave: (area: CropArea, rotation: number) => void;
};

/**
 * Crop step before an upload (react-easy-crop): drag to move, pinch / wheel /
 * slider to zoom, rotate in 90° steps, reset. Keyboard: arrow keys move the crop.
 * Load it with next/dynamic: it's only needed once a photo is picked.
 */
export function ImageCropper({ src, title, shape = "rect", aspects, natural, saveLabel = "Save", onCancel, onSave }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectIdx, setAspectIdx] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  const chosen = aspects?.[aspectIdx]?.value ?? 1;
  const turned = rotation % 180 !== 0;
  const aspect =
    shape === "squircle" ? 1 : chosen === "original" ? (natural ? (turned ? natural.height / natural.width : natural.width / natural.height) : 4 / 3) : chosen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onCancel());
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onCancel]);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };
  const iconBtn = "grid size-11 place-items-center rounded-2xl text-fg hover:bg-surface-3 disabled:opacity-40";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
        className="glass-3 glass-flat relative z-10 flex w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:max-w-lg sm:rounded-[28px] sm:pt-0 sm:pb-0"
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button type="button" onClick={onCancel} className={iconBtn} aria-label="Cancel">
            <X className="size-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold">{title}</h2>
          <button type="button" onClick={reset} className="rounded-xl px-3 py-2 text-[15px] font-semibold text-accent hover:bg-surface-3">
            Reset
          </button>
        </div>

        <div className={cn("relative min-h-0 flex-1 bg-black/80 sm:h-[min(60dvh,460px)] sm:flex-none", shape === "squircle" && "cropper-squircle")}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            minZoom={1}
            maxZoom={5}
            zoomSpeed={0.4}
            showGrid={shape === "rect"}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onComplete}
          />
        </div>

        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
          {aspects && shape === "rect" && (
            <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Aspect ratio">
              {aspects.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  role="radio"
                  aria-checked={i === aspectIdx}
                  onClick={() => setAspectIdx(i)}
                  className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold", i === aspectIdx ? "glass-primary" : "glass-1 text-muted")}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRotation((r) => (r + 270) % 360)} className={iconBtn} aria-label="Rotate left">
              <RotateCcw className="size-5" />
            </button>
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <span className="sr-only">Zoom</span>
              <input
                type="range"
                min={1}
                max={5}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-11 min-w-0 flex-1 accent-[var(--accent)]"
                aria-valuetext={`${Math.round(zoom * 100)}%`}
              />
            </label>
            <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} className={iconBtn} aria-label="Rotate right">
              <RotateCw className="size-5" />
            </button>
          </div>
          <button
            type="button"
            disabled={!area}
            onClick={() => area && onSave(area, rotation)}
            className="glass-primary h-12 rounded-2xl text-[16px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
