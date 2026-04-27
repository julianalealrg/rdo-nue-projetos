import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { RdoFoto } from "@/lib/diario";

export function Lightbox({
  fotos,
  indiceInicial,
  onClose,
}: {
  fotos: RdoFoto[];
  indiceInicial: number;
  onClose: () => void;
}) {
  const [indice, setIndice] = useState(indiceInicial);
  const total = fotos.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndice((i) => (i - 1 + total) % total);
      else if (e.key === "ArrowRight") setIndice((i) => (i + 1) % total);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [total, onClose]);

  const foto = fotos[indice];
  if (!foto) return null;

  const nomeAmbiente = foto.ambiente?.nome ?? (foto.ambiente_id ? "" : "Sem ambiente");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-sm bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndice((i) => (i - 1 + total) % total);
            }}
            aria-label="Anterior"
            className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndice((i) => (i + 1) % total);
            }}
            aria-label="Próxima"
            className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      <figure
        className="flex max-h-full max-w-5xl flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={foto.url}
          alt={foto.legenda || `Foto ${indice + 1}`}
          className="max-h-[80vh] max-w-full rounded-sm object-contain"
        />
        {(foto.legenda || nomeAmbiente || total > 1) && (
          <figcaption
            className="mt-3 text-center text-sm text-white/90"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {nomeAmbiente && (
              <div
                className="mb-1 text-white/80"
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                {nomeAmbiente}
              </div>
            )}
            {foto.legenda}
            {total > 1 && (
              <span
                className="ml-3 text-white/60"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {indice + 1}/{total}
              </span>
            )}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
