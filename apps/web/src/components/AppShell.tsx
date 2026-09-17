import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/cn";

const links = [
  { to: "/", label: "Home" },
  { to: "/matches", label: "Matches" },
  { to: "/team", label: "Team" },
  { to: "/settings", label: "Settings" },
];

export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b-2 border-primary bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-xl font-bold tracking-wide">Tyloo Live</p>
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
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
