"use client";

import { cn } from "@/lib/cn";

/** Rough strength estimate: length plus character variety. Guidance only; the server enforces the minimum. */
export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (pw.length < 8) return 0;
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/\d/.test(pw)) variety++;
  if (/[^A-Za-z0-9]/.test(pw)) variety++;
  const lengthBonus = pw.length >= 16 ? 2 : pw.length >= 12 ? 1 : 0;
  return Math.min(4, Math.max(1, variety - 1 + lengthBonus)) as 1 | 2 | 3 | 4;
}

const LABELS = ["Too short", "Weak", "Okay", "Strong", "Excellent"];
const COLORS = ["bg-line-strong", "bg-danger", "bg-amber-500", "bg-accent", "bg-accent"];

export function PasswordMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= score ? COLORS[score] : "bg-surface-3")}
          />
        ))}
      </div>
      <span className="w-20 text-right text-xs font-semibold text-muted">{LABELS[score]}</span>
    </div>
  );
}
