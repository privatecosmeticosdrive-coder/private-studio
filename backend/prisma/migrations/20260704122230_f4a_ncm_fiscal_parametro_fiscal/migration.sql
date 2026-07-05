-- DropIndex
DROP INDEX "ncm_ncm_key";

-- AlterTable
ALTER TABLE "ncm" ADD COLUMN     "ex_tipi" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fundamento_legal" TEXT,
ADD COLUMN     "icms_nominal_pct" DECIMAL(5,2),
ADD COLUMN     "tratamento" TEXT NOT NULL DEFAULT 'tributado',
ADD COLUMN     "vigencia_fim" DATE,
ADD COLUMN     "vigencia_inicio" DATE;

-- CreateTable
CREATE TABLE "parametro_fiscal" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" DECIMAL(8,4) NOT NULL,
    "vigencia_inicio" DATE NOT NULL,
    "vigencia_fim" DATE,
    "fundamento_legal" TEXT NOT NULL,
    "criado_por" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametro_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parametro_fiscal_chave_vigencia_inicio_idx" ON "parametro_fiscal"("chave", "vigencia_inicio");

-- CreateIndex
CREATE UNIQUE INDEX "ncm_ncm_ex_tipi_key" ON "ncm"("ncm", "ex_tipi");

