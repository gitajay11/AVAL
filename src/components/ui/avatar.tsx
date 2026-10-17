"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const GRADIENTS = [
  "from-[#1d4ed8] to-[#0f766e]",
  "from-[#0369a1] to-[#047857]",
  "from-[#1e40af] to-[#0e7490]",
  "from-[#0f766e] to-[#15803d]",
  "from-[#1e3a8a] to-[#0d9488]",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return chars.toUpperCase();
}

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  /** Squircle (superellipse) for headers; circles everywhere else. */
  shape?: "circle" | "squircle";
  className?: string;
};

/** Photo when visible to the viewer, otherwise brand-gradient initials. */
export function Avatar({ name, src, size = 40, shape = "circle", className }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src && failed !== src;
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br font-bold text-white select-none",
        shape === "squircle" ? "squircle" : "rounded-full",
        GRADIENTS[hash(name) % GRADIENTS.length],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden={showImage ? undefined : true}
    >
      {showImage ? (
        // Signed, per-viewer URLs: next/image would proxy and cache them server-side.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setFailed(src)}
          draggable={false}
        />
      ) : (
        <span data-initials={initials(name)} className="before:content-[attr(data-initials)]" />
      )}
    </span>
  );
}
