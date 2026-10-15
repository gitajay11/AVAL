import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden="true">
      <defs>
        <linearGradient id="aval-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill="url(#aval-g)" />
      <path
        d="M14 31.5c0-7.5 4.6-15 10-15s10 7.5 10 15M18.5 26h11"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="34.5" cy="33" r="3" fill="#6ee7b7" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-9" />
      <span className="text-[22px] font-extrabold tracking-tight text-fg">Aval</span>
    </span>
  );
}
