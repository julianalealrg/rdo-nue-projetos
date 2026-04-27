import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/obra/$id")({
  component: DiarioObraPlaceholder,
});

function DiarioObraPlaceholder() {
  const { id } = Route.useParams();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl text-nue-black">Diário da obra</h1>
        <p className="text-[15px] text-nue-graphite">
          Obra:{" "}
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-nue-black">
            {id}
          </span>
        </p>
      </header>
      <div className="rounded-md border border-nue-taupe bg-white px-6 py-10 text-center text-sm text-nue-graphite">
        Em construção
      </div>
      <div>
        <Link
          to="/"
          className="inline-flex h-9 items-center justify-center rounded-sm border border-nue-taupe bg-white px-4 text-sm text-nue-black transition-colors hover:bg-nue-taupe/40"
        >
          Voltar para Obras
        </Link>
      </div>
    </div>
  );
}
