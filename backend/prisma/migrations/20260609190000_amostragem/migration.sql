-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "amostra_enviada_em" TIMESTAMP(3),
ADD COLUMN     "amostra_feedback_cliente" TEXT,
ADD COLUMN     "amostra_observacoes_lab" TEXT,
ADD COLUMN     "amostra_producao_iniciada_em" TIMESTAMP(3),
ADD COLUMN     "amostra_pronta_em" TIMESTAMP(3),
ADD COLUMN     "amostra_qtd" INTEGER,
ADD COLUMN     "amostra_responsavel_id" UUID,
ADD COLUMN     "amostra_retorno_em" TIMESTAMP(3),
ADD COLUMN     "amostra_solicitada_em" TIMESTAMP(3),
ADD COLUMN     "amostra_solicitada_por" UUID,
ADD COLUMN     "amostra_status" TEXT NOT NULL DEFAULT 'nao_solicitada',
ADD COLUMN     "clickup_task_id" TEXT,
ADD COLUMN     "crm_deal_id" TEXT,
ADD COLUMN     "requer_amostra" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'rascunho';

-- DropEnum
DROP TYPE "OrcamentoStatus";

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_amostra_status_idx" ON "orcamentos"("amostra_status");

-- CreateIndex
CREATE INDEX "orcamentos_amostra_responsavel_id_idx" ON "orcamentos"("amostra_responsavel_id");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_amostra_solicitada_por_fkey" FOREIGN KEY ("amostra_solicitada_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_amostra_responsavel_id_fkey" FOREIGN KEY ("amostra_responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

