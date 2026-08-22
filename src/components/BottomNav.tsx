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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/90 shadow-[0_-12px_32px_oklch(0.06_0.01_45_/_0.45)] backdrop-blur-xl">
      <ul className="mx-auto grid max-w-2xl grid-cols-5 items-end px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
        {items.map(({ to, label, icon: Icon, ...rest }) => {
          const primary = "primary" in rest && rest.primary;
          return (
            <li key={to} className="flex justify-center">
              <Link
                to={to}
                aria-label={label}
                className="group flex min-w-14 flex-col items-center gap-1 rounded-xl px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
                activeOptions={{ exact: to === "/" }}
                activeProps={{ className: "text-brand" }}
              >
                {primary ? (
                  <span className="gradient-brand -mt-5 grid size-13 place-items-center rounded-2xl text-brand-foreground shadow-lift ring-4 ring-background">
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
