-- Adiciona coluna onedrive_url em obras pra link da pasta de arquivos do cliente
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS onedrive_url text NOT NULL DEFAULT '';
