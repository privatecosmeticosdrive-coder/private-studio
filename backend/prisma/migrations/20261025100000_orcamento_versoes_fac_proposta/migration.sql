-- ORCAMENTO (10/26): versoes derivadas (versao_de_id -> raiz), exclusao logica e
-- formula ajustada pelo comercial (FAC). PROPOSTA COMERCIAL: agrupa orcamentos de
-- um cliente num documento padronizado com assinatura. ADITIVA: nenhuma coluna
-- existente muda; orcamentos atuais ficam versao 1, nao excluidos, sem FAC.
-- SQL escrito a partir de `prisma migrate diff` ENTRE ARQUIVOS de schema (sem banco).

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "ajuste_fac" JSONB,
ADD COLUMN     "ajuste_fac_em" TIMESTAMP(3),
ADD COLUMN     "ajuste_fac_por" UUID,
ADD COLUMN     "excluido_em" TIMESTAMP(3),
ADD COLUMN     "excluido_por" UUID,
ADD COLUMN     "exclusao_motivo" TEXT,
ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "versao_de_id" UUID;

-- CreateTable
CREATE TABLE "propostas" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'emitida',
    "condicoes" JSONB NOT NULL,
    "observacoes" TEXT,
    "vendedor_nome" TEXT,
    "emitida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitida_por" UUID,
    "assinada_em" TIMESTAMP(3),
    "assinada_por_nome" TEXT,
    "assinada_por_documento" TEXT,
    "assinatura_registrada_por" UUID,
    "cancelada_em" TIMESTAMP(3),
    "cancelada_por" UUID,
    "cancelamento_motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_itens" (
    "id" SERIAL NOT NULL,
    "proposta_id" UUID NOT NULL,
    "orcamento_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "proposta_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "propostas_numero_key" ON "propostas"("numero");

-- CreateIndex
CREATE INDEX "propostas_cliente_id_idx" ON "propostas"("cliente_id");

-- CreateIndex
CREATE INDEX "propostas_status_idx" ON "propostas"("status");

-- CreateIndex
CREATE INDEX "proposta_itens_orcamento_id_idx" ON "proposta_itens"("orcamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposta_itens_proposta_id_orcamento_id_key" ON "proposta_itens"("proposta_id", "orcamento_id");

-- CreateIndex
CREATE INDEX "orcamentos_versao_de_id_idx" ON "orcamentos"("versao_de_id");

-- CreateIndex
CREATE INDEX "orcamentos_excluido_em_idx" ON "orcamentos"("excluido_em");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_versao_de_id_fkey" FOREIGN KEY ("versao_de_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_proposta_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Numeracao das propostas continua a do Canva (ultimas ~3055): primeira = 3100.
SELECT setval(pg_get_serial_sequence('propostas', 'numero'), 3099, true);
