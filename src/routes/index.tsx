import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: ObrasPage,
});

function ObrasPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl text-nue-black">Relatório Diário de Obra</h1>
        <p className="text-sm text-nue-graphite">
          Acompanhamento das obras em medição e montagem
        </p>
      </header>
      <div className="rounded-md border border-nue-taupe bg-white px-6 py-10 text-center text-sm text-nue-graphite">
        Em construção
      </div>
    </div>
  );
}
