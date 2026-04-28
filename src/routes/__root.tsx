import {
  Outlet,
  Link,
  Navigate,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { AppShell } from "@/components/AppShell";
import { useSessao } from "@/lib/auth";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-nue-offwhite px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl text-nue-black">404</h1>
        <h2 className="mt-4 text-xl text-nue-black">Página não encontrada</h2>
        <p className="mt-2 text-sm text-nue-graphite">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-sm bg-nue-black px-4 py-2 text-sm font-medium text-nue-offwhite transition-colors hover:opacity-90"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sistema RDO Obras — NUE Projetos" },
      { name: "description", content: "Relatório Diário de Obra — NUE Projetos" },
      { name: "author", content: "NUE Projetos" },
      { property: "og:title", content: "Sistema RDO Obras — NUE Projetos" },
      { property: "og:description", content: "Relatório Diário de Obra — NUE Projetos" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sistema RDO Obras — NUE Projetos" },
      { name: "twitter:description", content: "Relatório Diário de Obra — NUE Projetos" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bc5b59c0-6109-4821-8166-7c0ebcdd532f/id-preview-f010c75a--45fa305b-bf85-46ad-96d9-bca3277db871.lovable.app-1777339331300.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bc5b59c0-6109-4821-8166-7c0ebcdd532f/id-preview-f010c75a--45fa305b-bf85-46ad-96d9-bca3277db871.lovable.app-1777339331300.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RotaPublica(pathname: string): boolean {
  return (
    pathname.startsWith("/print/") ||
    pathname.startsWith("/p/") ||
    pathname === "/login"
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sessao = useSessao();

  if (RotaPublica(pathname)) {
    return <>{children}</>;
  }

  if (sessao === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nue-offwhite">
        <p className="text-sm text-nue-graphite">Carregando…</p>
      </div>
    );
  }

  if (sessao === null) {
    return <Navigate to="/login" replace />;
  }

  if (!sessao.ativo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nue-offwhite px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl text-nue-black">Conta desativada</h1>
          <p className="mt-2 text-sm text-nue-graphite">
            Sua conta está desativada. Entre em contato com o admin.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const semChrome = pathname.startsWith("/print/") || pathname.startsWith("/p/") || pathname === "/login";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        {semChrome ? (
          <Outlet />
        ) : (
          <AppShell>
            <Outlet />
          </AppShell>
        )}
      </AuthGate>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#FFFFFF",
            color: "#141412",
            border: "1px solid #D6D1CC",
            borderRadius: "4px",
            fontFamily: "'IBM Plex Sans', sans-serif",
          },
        }}
      />
    </QueryClientProvider>
  );
}
