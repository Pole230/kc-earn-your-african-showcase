import { Link } from "@tanstack/react-router";
import { Home, Compass, Plus, Bell, User } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/upload", label: "Upload", icon: Plus, primary: true },
  { to: "/notifications", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/92 shadow-[0_-18px_40px_oklch(0.03_0.03_255_/_0.8)] backdrop-blur-xl">
      <ul className="mx-auto grid max-w-2xl grid-cols-5 items-end px-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2">
        {items.map(({ to, label, icon: Icon, ...rest }) => {
          const primary = "primary" in rest && rest.primary;
          return (
            <li key={to} className="flex justify-center">
              <Link
                to={to}
                aria-label={label}
                className="group flex min-w-14 flex-col items-center gap-1 rounded-2xl px-3 py-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                activeOptions={{ exact: to === "/" }}
                activeProps={{ className: "text-brand" }}
              >
                {primary ? (
                  <span className="gradient-brand -mt-5 grid size-14 place-items-center rounded-[1.15rem] text-brand-foreground shadow-lift ring-4 ring-background transition-transform group-hover:-translate-y-0.5">
                    <Icon className="size-6" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon className="size-[22px]" strokeWidth={2} />
                )}
                <span className="text-[10px] font-semibold tracking-wide">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
