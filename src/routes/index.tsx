import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obras — Sistema RDO Obras" },
      { name: "description", content: "Lista de obras do Sistema RDO Obras NUE Projetos" },
      { property: "og:title", content: "Obras — Sistema RDO Obras" },
      { property: "og:description", content: "Lista de obras do Sistema RDO Obras NUE Projetos" },
    ],
  }),
  component: ObrasPage,
});

function ObrasPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl text-nue-black">Obras</h1>
      </header>
      <div className="rounded-md border border-nue-taupe bg-white px-6 py-10 text-center text-sm text-nue-graphite">
        Em construção
      </div>
    </div>
  );
}
