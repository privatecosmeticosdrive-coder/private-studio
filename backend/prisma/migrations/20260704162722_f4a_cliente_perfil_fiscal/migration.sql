-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "contribuinte_icms" BOOLEAN,
ADD COLUMN     "finalidade_padrao" TEXT,
ADD COLUMN     "regime_fiscal" TEXT,
ADD COLUMN     "uf" TEXT;

