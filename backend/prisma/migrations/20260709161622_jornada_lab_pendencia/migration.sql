-- CreateTable
CREATE TABLE "pendencias_lab" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "urgencia" TEXT NOT NULL,
    "prazo_limite" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "ncm_proposto_id" INTEGER,
    "orcamento_id" UUID,
    "formula_base_id" INTEGER,
    "formula_resultado_id" INTEGER,
    "motivo_origem" TEXT,
    "solicitada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solicitada_por" UUID,
    "atendida_em" TIMESTAMP(3),
    "atendida_por" UUID,
    "concluida_em" TIMESTAMP(3),
    "concluida_por" UUID,
    "cancelada_em" TIMESTAMP(3),
    "cancelada_por" UUID,
    "cancelamento_motivo" TEXT,

    CONSTRAINT "pendencias_lab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pendencias_lab_status_idx" ON "pendencias_lab"("status");

-- CreateIndex
CREATE INDEX "pendencias_lab_urgencia_idx" ON "pendencias_lab"("urgencia");

-- AddForeignKey
ALTER TABLE "pendencias_lab" ADD CONSTRAINT "pendencias_lab_ncm_proposto_id_fkey" FOREIGN KEY ("ncm_proposto_id") REFERENCES "ncm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencias_lab" ADD CONSTRAINT "pendencias_lab_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencias_lab" ADD CONSTRAINT "pendencias_lab_formula_base_id_fkey" FOREIGN KEY ("formula_base_id") REFERENCES "formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencias_lab" ADD CONSTRAINT "pendencias_lab_formula_resultado_id_fkey" FOREIGN KEY ("formula_resultado_id") REFERENCES "formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

