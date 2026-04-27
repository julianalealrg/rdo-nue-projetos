/**
 * Helpers de geração de IDs para Obras (OB-NNNN) e RDOs (RDO-NNNNNN).
 *
 * ABORDAGEM ESCOLHIDA: RPC no Postgres.
 *
 * As duas funções abaixo apenas invocam funções PL/pgSQL declaradas no banco
 * (`gerar_proximo_id_obra` e `gerar_proximo_id_rdo`). Cada função usa
 * `pg_advisory_xact_lock` para serializar a leitura do MAX(id) e garantir
 * que dois cadastros simultâneos não recebam o mesmo ID — o que seria
 * impossível de evitar de forma confiável calculando no client.
 *
 * Estes helpers são seguros para chamar tanto do client quanto de um
 * loader/route do TanStack Start; a atomicidade vive no banco.
 */
import { supabase } from "@/integrations/supabase/client";

export async function gerarProximoIdObra(): Promise<string> {
  const { data, error } = await supabase.rpc("gerar_proximo_id_obra");
  if (error) {
    throw new Error(`Falha ao gerar próximo ID de obra: ${error.message}`);
  }
  return (data as string) ?? "OB-0001";
}

export async function gerarProximoIdRdo(): Promise<string> {
  const { data, error } = await supabase.rpc("gerar_proximo_id_rdo");
  if (error) {
    throw new Error(`Falha ao gerar próximo ID de RDO: ${error.message}`);
  }
  return (data as string) ?? "RDO-000001";
}
