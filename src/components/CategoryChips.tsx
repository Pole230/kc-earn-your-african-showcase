import { CATEGORIES } from "@/data/content";
import { cn } from "@/lib/utils";

export function CategoryChips({
  active,
  onSelect,
  includeAll = true,
}: {
  active: string;
  onSelect: (value: string) => void;
  includeAll?: boolean;
}) {
  const values = includeAll ? ["All", ...CATEGORIES] : [...CATEGORIES];

  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
            active === value
              ? "border-transparent bg-brand text-brand-foreground shadow-[0_6px_18px_oklch(0.72_0.17_55_/_0.18)]"
              : "border-border/80 bg-surface/80 text-muted-foreground hover:border-brand/50 hover:text-foreground",
          )}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
