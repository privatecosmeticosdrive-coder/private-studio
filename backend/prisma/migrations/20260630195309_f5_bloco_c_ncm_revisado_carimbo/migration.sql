-- F5 Bloco C (aditivo): carimbo de auditoria in-row da revisao humana da
-- ASSOCIACAO formula->NCM (espelha o padrao de validada_em/validada_por).
-- Duas colunas NULLABLE, escalares puras (sem relation/FK):
--   ncm_revisado_em  = quando a associacao foi confirmada por humano
--   ncm_revisado_por = quem confirmou (user.sub, UUID; mesmo tipo de validada_por)
-- Nenhuma coluna existente e tocada; sem NOT NULL, sem DEFAULT, sem constraint.
ALTER TABLE "formulas" ADD COLUMN "ncm_revisado_em" TIMESTAMP(3),
ADD COLUMN "ncm_revisado_por" UUID;
