import { cn } from "@/lib/cn";

/** Three bouncing dots. Static under prefers-reduced-motion (handled globally). */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-[3px]", className)} aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-[5px] animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}
