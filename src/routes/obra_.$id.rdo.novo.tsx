import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { fetchObra, ObraNaoEncontradaError } from "@/lib/rdo";
import { FormularioRdo } from "@/components/FormularioRdo";

export const Route = createFileRoute("/obra_/$id/rdo/novo")({
  component: NovoRdo,
});

function NovoRdo() {
  const { id } = Route.useParams();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["obra", id],
    queryFn: () => fetchObra(id),
    retry: (count, err) => !(err instanceof ObraNaoEncontradaError) && count < 2,
  });

  if (isLoading) return <Esqueleto />;

  if (isError && error instanceof ObraNaoEncontradaError) {
    return <ObraNaoEncontrada />;
  }
  if (isError) {
    return (
      <div className="rounded-md border border-[#8C3A2E]/30 bg-[#F1DDD8] px-4 py-3 text-sm text-[#8C3A2E]">
        {error instanceof Error ? error.message : "Erro ao carregar obra."}{" "}
        <button
          type="button"
          onClick={() => refetch()}
          className="ml-2 underline underline-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;
  return <FormularioRdo modo="criar" obra={data} />;
}

function ObraNaoEncontrada() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl text-nue-black">Obra não encontrada</h1>
      <p className="mt-2 text-sm text-nue-graphite">
        Não é possível criar um RDO para uma obra que não existe.
      </p>
      <div className="mt-6">
        <Link
          to="/obras"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-nue-black px-4 text-sm font-medium text-nue-offwhite transition-opacity hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Obras
        </Link>
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <div className="h-3 w-40 animate-pulse rounded-sm bg-nue-taupe/60" />
      <div className="h-7 w-64 animate-pulse rounded-sm bg-nue-taupe/60" />
      <div className="h-4 w-1/2 animate-pulse rounded-sm bg-nue-taupe/40" />
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-64 rounded-sm border border-nue-taupe bg-white lg:col-span-3" />
        <div className="h-64 rounded-sm border border-nue-taupe bg-white lg:col-span-2" />
      </div>
    </div>
  );
}
