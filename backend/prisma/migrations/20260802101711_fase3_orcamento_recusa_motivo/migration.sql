-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "recusa_em" TIMESTAMP(3),
ADD COLUMN     "recusa_motivo" TEXT,
ADD COLUMN     "recusa_observacao" TEXT;

-- CreateIndex
CREATE INDEX "orcamentos_recusa_motivo_idx" ON "orcamentos"("recusa_motivo");

