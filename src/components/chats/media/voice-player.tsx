"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AttachmentDTO } from "@/lib/chats/types";

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const BARS = 40;

/** Resample stored peaks (0–31) to a fixed bar count. */
function bars(waveform: number[] | null): number[] {
  if (!waveform?.length) return Array.from({ length: BARS }, (_, i) => 6 + ((i * 7) % 11));
  return Array.from({ length: BARS }, (_, i) => waveform[Math.floor((i / BARS) * waveform.length)] ?? 0);
}

// Only one voice note plays at a time.
let current: HTMLAudioElement | null = null;

/** Voice note: play/pause, scrubbable waveform, elapsed/total time, playback speed. */
export function VoicePlayer({ a, mine }: { a: AttachmentDTO; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const total = a.durationMs ?? 0;
  const peaks = bars(a.waveform);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    if (current && current !== el) current.pause();
    current = el;
    el.playbackRate = rate;
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const el = audio.current;
    if (!el?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * el.duration;
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  return (
    <div className="flex w-[260px] max-w-full items-center gap-2.5 py-0.5">
      <audio ref={audio} src={a.url} preload="none" />
      <button
        type="button"
        onClick={toggle}
        className={cn("grid size-10 shrink-0 place-items-center rounded-full", mine ? "bg-white text-[#0f3d6e]" : "bg-brand text-white")}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-7 cursor-pointer items-center gap-[2px]"
          onPointerDown={seek}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onKeyDown={(e) => {
            const el = audio.current;
            if (!el?.duration) return;
            if (e.key === "ArrowRight") el.currentTime = Math.min(el.duration, el.currentTime + 3);
            if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 3);
          }}
        >
          {peaks.map((p, i) => (
            <span
              key={i}
              className={cn(
                "w-[3px] flex-1 rounded-full transition-colors",
                i / BARS < progress ? (mine ? "bg-white" : "bg-accent") : mine ? "bg-white/40" : "bg-line-strong",
              )}
              style={{ height: `${Math.max(12, (p / 31) * 100)}%` }}
            />
          ))}
        </div>
        <div className={cn("mt-0.5 flex items-center justify-between text-[11px]", mine ? "text-white/75" : "text-subtle")}>
          <span>{clock(progress > 0 ? progress * total : total)}</span>
          <button type="button" onClick={cycleRate} className="rounded px-1 font-semibold" aria-label="Playback speed">
            {rate}×
          </button>
        </div>
      </div>
    </div>
  );
}
