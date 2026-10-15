import { cn } from "@/lib/cn";

export function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <h2 id={`${id}-h`} className="px-1 text-[13px] font-bold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {description && <p className="mt-0.5 px-1 text-[13px] text-subtle">{description}</p>}
      <div className={cn("mt-2.5 rounded-[20px] border border-line bg-surface px-4 py-2 shadow-[var(--shadow-sm)] sm:px-5", className)}>
        {children}
      </div>
    </section>
  );
}

export function Divider() {
  return <div className="h-px bg-line" />;
}
