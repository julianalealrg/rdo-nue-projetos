import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Sistema RDO Obras" },
      { name: "description", content: "Configurações do Sistema RDO Obras NUE Projetos" },
      { property: "og:title", content: "Configurações — Sistema RDO Obras" },
      { property: "og:description", content: "Configurações do Sistema RDO Obras NUE Projetos" },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl text-nue-black">Configurações</h1>
      </header>
      <div className="rounded-md border border-nue-taupe bg-white px-6 py-10 text-center text-sm text-nue-graphite">
        Em construção
      </div>
    </div>
  );
}
