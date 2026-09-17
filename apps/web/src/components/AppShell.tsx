import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/cn";
import { StorageBanner } from "./StorageBanner";
import { UpdateBanner } from "./UpdateBanner";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { useUpdateAvailability } from "../hooks/useUpdateAvailability";

const links = [
  { to: "/", label: "Home" },
  { to: "/matches", label: "Matches" },
  { to: "/team", label: "Team" },
  { to: "/settings", label: "Settings" },
];

export function AppShell() {
  const updateAvailable = useUpdateAvailability();
  const active = useLiveQuery(async () => {
    const matches = await db.matches.toArray();
    return matches.some((match) => match.status !== "FINISHED" && match.status !== "NOT_STARTED");
  }, []) ?? false;

  return (
    <div className="min-h-dvh bg-background text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <StorageBanner />
      <UpdateBanner visible={updateAvailable && !active} />
      <header className="border-b-2 border-primary bg-primary pt-[max(0.75rem,env(safe-area-inset-top))] text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))] py-3 pe-[max(1rem,env(safe-area-inset-right))]">
          <p className="text-xl font-bold tracking-wide">Touchline</p>
          <nav aria-label="Main" className="flex flex-wrap gap-2">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "min-h-11 rounded-[var(--radius-control)] px-3 py-2 font-semibold",
                    isActive ? "bg-primary-foreground text-primary" : "text-primary-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-[max(1rem,env(safe-area-inset-left))] py-6 pe-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
}
