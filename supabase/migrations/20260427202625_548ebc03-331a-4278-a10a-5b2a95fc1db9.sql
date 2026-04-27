ALTER TABLE public.rdo_fotos ADD COLUMN ambiente text NOT NULL DEFAULT '';
ALTER TABLE public.rdo_fotos DROP COLUMN categoria;
DROP TYPE IF EXISTS public.categoria_foto;
CREATE INDEX IF NOT EXISTS idx_rdo_fotos_rdo_ambiente ON public.rdo_fotos (rdo_id, ambiente);