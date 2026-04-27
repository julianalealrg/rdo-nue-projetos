/**
 * Tipos do banco de dados.
 *
 * Os tipos canônicos são gerados automaticamente em
 * `src/integrations/supabase/types.ts` a partir do schema do Supabase.
 * Este arquivo apenas reexporta-os com o caminho pedido pelo briefing
 * (`src/lib/database.types.ts`) para que possam ser importados como
 * `import type { Database } from "@/lib/database.types"`.
 *
 * NÃO editar manualmente — toda mudança vem do schema do banco.
 */
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "@/integrations/supabase/types";
