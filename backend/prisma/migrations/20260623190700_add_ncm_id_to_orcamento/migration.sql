-- F3-prep (aditivo): override de NCM por orcamento (herda da formula se null; regra na F4).
-- FK ON DELETE SET NULL: apagar/soft-delete de uma NCM nao quebra o orcamento.
ALTER TABLE "orcamentos" ADD COLUMN "ncm_id" INTEGER;

CREATE INDEX "orcamentos_ncm_id_idx" ON "orcamentos"("ncm_id");

ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_ncm_id_fkey" FOREIGN KEY ("ncm_id") REFERENCES "ncm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
