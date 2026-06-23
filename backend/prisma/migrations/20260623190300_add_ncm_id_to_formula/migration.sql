-- F1 Matriz de Custo (aditivo): associacao Formula -> NCM (nullable; backfill na F3.5).
-- FK ON DELETE SET NULL: apagar uma NCM nao apaga a formula.
ALTER TABLE "formulas" ADD COLUMN "ncm_id" INTEGER;

CREATE INDEX "formulas_ncm_id_idx" ON "formulas"("ncm_id");

ALTER TABLE "formulas" ADD CONSTRAINT "formulas_ncm_id_fkey" FOREIGN KEY ("ncm_id") REFERENCES "ncm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
