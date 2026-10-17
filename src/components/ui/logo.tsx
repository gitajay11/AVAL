import { cn } from "@/lib/cn";

/** The brand logo (public/icons/logo-*.webp, generated from logo/ by `pnpm icons`). */
export function LogoMark({ className }: { className?: string }) {
  return (
    // A static brand image: next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/logo-256.webp"
      srcSet="/icons/logo-256.webp 256w, /icons/logo-512.webp 512w"
      sizes="128px"
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      draggable={false}
      className={cn("size-10 shrink-0 select-none", className)}
    />
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-10" />
      <span className="text-[22px] font-extrabold tracking-tight text-fg">Aval</span>
    </span>
  );
}
