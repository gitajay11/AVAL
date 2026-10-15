"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PreparedMedia } from "@/lib/client/media-upload";

const MAX_MS = 5 * 60 * 1000;
const PEAKS = 64;
const MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

export type RecorderState =
  | { status: "idle" }
  | { status: "recording"; startedAt: number; levels: number[] }
  | { status: "error"; message: string };

/**
 * Voice notes with MediaRecorder. While recording it samples the input level
 * (for the live meter and the stored waveform); stop() resolves to an upload-ready
 * blob. Nothing is kept once it's sent or cancelled.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const rec = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    ctx: AudioContext;
    chunks: Blob[];
    samples: number[];
    timer: ReturnType<typeof setInterval>;
    startedAt: number;
  } | null>(null);

  const teardown = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close().catch(() => {});
    rec.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (rec.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({ status: "error", message: "Voice messages aren't supported in this browser." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState({ status: "error", message: "Microphone access was blocked. Allow it in your browser settings." });
      return;
    }
    const mimeType = MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const chunks: Blob[] = [];
    const samples: number[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(250);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      const level = Math.min(1, peak / 64);
      samples.push(level);
      setState({ status: "recording", startedAt, levels: samples.slice(-48) });
      if (Date.now() - startedAt > MAX_MS) recorder.stop();
    }, 100);
    rec.current = { recorder, stream, ctx, chunks, samples, timer, startedAt };
    setState({ status: "recording", startedAt, levels: [] });
  }, []);

  /** Stop and return the recording (null if it was too short). */
  const stop = useCallback(async (): Promise<PreparedMedia | null> => {
    const r = rec.current;
    if (!r) return null;
    const durationMs = Date.now() - r.startedAt;
    await new Promise<void>((resolve) => {
      r.recorder.onstop = () => resolve();
      if (r.recorder.state !== "inactive") r.recorder.stop();
      else resolve();
    });
    const type = (r.recorder.mimeType || "audio/webm").split(";")[0];
    const blob = new Blob(r.chunks, { type });
    const samples = r.samples;
    teardown();
    setState({ status: "idle" });
    if (durationMs < 700 || blob.size === 0) return null;
    const waveform = Array.from({ length: PEAKS }, (_, i) => {
      const from = Math.floor((i / PEAKS) * samples.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / PEAKS) * samples.length));
      const slice = samples.slice(from, to);
      return Math.round(Math.max(0, ...slice) * 31);
    });
    return { kind: "VOICE", blob, contentType: type, fileName: null, durationMs, waveform };
  }, [teardown]);

  const cancel = useCallback(() => {
    const r = rec.current;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
    teardown();
    setState({ status: "idle" });
  }, [teardown]);

  const dismissError = useCallback(() => setState({ status: "idle" }), []);

  return { state, start, stop, cancel, dismissError };
}
