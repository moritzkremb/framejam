import { Film, LayoutGrid, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AppShell() {
  const location = useLocation();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      api
        .presets()
        .then(({ selected, presets }) => {
          if (cancelled) return;
          const p = presets.find((x) => x.id === selected);
          setSelected(p ? { id: p.id, name: p.name } : null);
        })
        .catch(() => {});
    void refresh();
    window.addEventListener("framecut:preset-selected", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("framecut:preset-selected", refresh);
    };
  }, [location.pathname]);

  const navItem = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
      isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Film className="size-3.5" />
            </span>
            framecut
          </Link>
          <nav className="ml-2 flex items-center gap-1">
            <NavLink to="/" end className={navItem}>
              <MessageSquareText className="size-4" />
              <span className="hidden sm:inline">Reviews</span>
            </NavLink>
            <NavLink to="/presets" className={navItem}>
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">Presets</span>
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {selected ? (
              <Link
                to={`/presets/${selected.id}`}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 hover:text-foreground"
              >
                <span className="size-1.5 rounded-full bg-primary" />
                Style: <span className="text-foreground">{selected.name}</span>
              </Link>
            ) : (
              <Link to="/presets" className="hidden rounded-full border border-dashed px-2.5 py-1 hover:text-foreground sm:block">
                No style selected
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
