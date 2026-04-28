import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Settings, Menu, Search, X, Home } from "lucide-react";
import logoUrl from "@/assets/logo-nue-projetos.svg";
import { fetchPainelObras } from "@/lib/painel";
import type { ObraComResumo } from "@/lib/painel";

type NavItem = {
  to: "/" | "/obras" | "/configuracoes";
  label: string;
  icon: typeof Building2;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Início", icon: Home },
  { to: "/obras", label: "Obras", icon: Building2 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full w-60 flex-col bg-nue-black text-nue-offwhite">
      <div className="flex justify-center px-4 py-4">
        <img
          src={logoUrl}
          alt="NUE Projetos"
          className="h-12 w-auto"
          style={{ filter: "invert(1)" }}
        />
      </div>
      <nav className="mt-2 flex-1 px-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  className={[
                    "relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-nue-offwhite"
                      : "text-nue-offwhite/70 hover:bg-white/5 hover:text-nue-offwhite",
                  ].join(" ")}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-warning" />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-4 py-3 text-[11px] tracking-wider text-nue-offwhite/40 uppercase">
        NUE Projetos
      </div>
    </div>
  );
}

function getBreadcrumb(pathname: string): string {
  if (pathname === "/") return "Início";
  if (pathname.startsWith("/configuracoes")) return "Configurações";
  if (pathname.startsWith("/obras")) return "Obras";
  if (pathname.startsWith("/obra/")) return "Obras / Diário";
  if (pathname.startsWith("/rdo/")) return "Obras / RDO";
  return "Início";
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function BuscaTopbar() {
  const navigate = useNavigate();
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termoDebounced = useDebounced(termo, 200);

  const { data } = useQuery({
    queryKey: ["painel-obras-busca"],
    queryFn: fetchPainelObras,
    enabled: termoDebounced.trim().length > 0,
    staleTime: 30_000,
  });

  const matches = useMemo<ObraComResumo[]>(() => {
    const t = termoDebounced.trim().toLowerCase();
    if (!t || !data) return [];
    return data.obras
      .filter(
        (o) =>
          o.nome_cliente.toLowerCase().includes(t) ||
          o.id.toLowerCase().includes(t),
      )
      .slice(0, 8);
  }, [data, termoDebounced]);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  useEffect(() => {
    setFoco(0);
  }, [matches]);

  function selecionar(o: ObraComResumo) {
    setAberto(false);
    setTermo("");
    navigate({ to: "/obra/$id", params: { id: o.id } });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setFoco((f) => Math.min(f + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFoco((f) => Math.max(f - 1, 0));
    } else if (e.key === "Enter") {
      if (matches[foco]) {
        e.preventDefault();
        selecionar(matches[foco]);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const mostrarDropdown =
    aberto && termoDebounced.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-44 sm:w-64 md:w-80">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-nue-graphite/60" />
      <input
        type="search"
        placeholder="Buscar obras..."
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onFocus={() => {
          if (termo.trim().length > 0) setAberto(true);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-sm border border-nue-taupe bg-nue-offwhite pl-8 pr-3 text-sm text-nue-black placeholder:text-nue-graphite/60 focus:border-nue-graphite focus:outline-none"
      />
      {mostrarDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-sm border border-nue-taupe bg-white shadow-md">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-nue-graphite/70">
              Nenhuma obra encontrada.
            </p>
          ) : (
            <ul>
              {matches.map((o, idx) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionar(o)}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                      idx === foco
                        ? "bg-nue-offwhite"
                        : "hover:bg-nue-offwhite",
                    ].join(" ")}
                  >
                    <span className="min-w-0 flex-1 truncate text-nue-black">
                      {o.nome_cliente}
                    </span>
                    <span className="shrink-0 text-[11px] text-nue-graphite/70">
                      {o.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const breadcrumb = getBreadcrumb(pathname);

  return (
    <div className="flex min-h-screen w-full bg-nue-offwhite">
      {/* Desktop sidebar */}
      <aside className="hidden md:block fixed inset-y-0 left-0 z-30">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-nue-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="relative">
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-[-44px] rounded-sm bg-nue-black p-2 text-nue-offwhite"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-h-screen w-full flex-col md:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between border-b border-nue-taupe bg-white px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden -ml-1 rounded-sm p-2 text-nue-graphite hover:bg-nue-taupe/40"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Breadcrumb" className="text-sm text-nue-graphite">
              <span className="text-nue-black">{breadcrumb}</span>
            </nav>
          </div>
          <BuscaTopbar />
        </header>

        {/* Content area */}
        <main className="flex-1 px-4 py-4 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  );
}
