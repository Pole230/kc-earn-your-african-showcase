import type { ReactNode } from "react";

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-border/60 pb-5 pt-7 sm:pt-9">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-brand">KC Earn</p>
        <h1 className="truncate text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
