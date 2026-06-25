-- F3.5-prep (aditivo): flag de revisao humana da ASSOCIACAO formula->NCM.
-- Eixo distinto de ncm.provisorio (aliquota validada pelo contador).
-- Nasce false; o backfill grava o NCM derivado MANTENDO false (foi a maquina);
-- vira true na revisao humana (F5).
ALTER TABLE "formulas" ADD COLUMN "ncm_revisado" BOOLEAN NOT NULL DEFAULT false;
