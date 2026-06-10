-- AlterTable
ALTER TABLE "cotacoes_pendentes" DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'aguardando';

-- DropEnum
DROP TYPE "CotacaoStatus";

-- CreateTable
CREATE TABLE "amostra_eventos" (
    "id" SERIAL NOT NULL,
    "orcamento_id" UUID NOT NULL,
    "status_anterior" TEXT,
    "status_novo" TEXT NOT NULL,
    "observacao" TEXT,
    "registrado_por" UUID,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amostra_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidade_tipo" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clickup_status" TEXT NOT NULL DEFAULT 'pending',
    "clickup_response" JSONB,
    "clickup_processado_em" TIMESTAMP(3),
    "crm_status" TEXT NOT NULL DEFAULT 'pending',
    "crm_response" JSONB,
    "crm_processado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amostra_eventos_orcamento_id_idx" ON "amostra_eventos"("orcamento_id");

-- CreateIndex
CREATE INDEX "amostra_eventos_registrado_em_idx" ON "amostra_eventos"("registrado_em" DESC);

-- CreateIndex
CREATE INDEX "integration_events_clickup_status_crm_status_idx" ON "integration_events"("clickup_status", "crm_status");

-- CreateIndex
CREATE INDEX "cotacoes_pendentes_status_idx" ON "cotacoes_pendentes"("status");

-- AddForeignKey
ALTER TABLE "amostra_eventos" ADD CONSTRAINT "amostra_eventos_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amostra_eventos" ADD CONSTRAINT "amostra_eventos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

