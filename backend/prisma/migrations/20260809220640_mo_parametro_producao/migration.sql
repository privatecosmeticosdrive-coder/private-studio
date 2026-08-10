-- CreateTable
CREATE TABLE "parametro_producao" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "vigencia_inicio" DATE NOT NULL,
    "vigencia_fim" DATE,
    "fonte" TEXT NOT NULL,
    "criado_por" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametro_producao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parametro_producao_chave_vigencia_inicio_idx" ON "parametro_producao"("chave", "vigencia_inicio");

