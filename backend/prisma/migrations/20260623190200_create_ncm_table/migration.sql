-- F1 Matriz de Custo (aditivo): tabela de NCMs (IPI e monofasico por NCM).
CREATE TABLE "ncm" (
    "id" SERIAL NOT NULL,
    "ncm" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ipi_pct" DECIMAL(6,3) NOT NULL,
    "monofasico" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ncm_ncm_key" ON "ncm"("ncm");
