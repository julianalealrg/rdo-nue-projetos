/**
 * Reexporta o cliente Supabase tipado para uso em todo o projeto.
 *
 * O cliente real (com tipos `Database`) é gerado automaticamente em
 * `src/integrations/supabase/client.ts` e os tipos vivem em
 * `src/integrations/supabase/types.ts`. Este módulo apenas centraliza o
 * import para que o restante do código use sempre `@/lib/supabase`.
 */
export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";
