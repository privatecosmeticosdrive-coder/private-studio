-- MOTOR 2 10/26 — pente fino: precos de MP por kg com 4 casas decimais.
-- DECIMAL(10,2) truncava o preco da ultima compra (ex.: 5,5694) na gravacao.
-- Alteracao ADITIVA e nao destrutiva: alargar precisao preserva todos os valores.
-- Os parametros do Motor 2 NAO exigem DDL: entram como novas vigencias em
-- parametro_fiscal / parametro_producao via prisma/seed-motor2-2026-10.cjs.

-- AlterTable
ALTER TABLE "materias_primas" ALTER COLUMN "preco_kg_brl" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "preco_anterior" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "mp_fornecedores_alt" ALTER COLUMN "preco_kg_brl" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "mp_historico_precos" ALTER COLUMN "preco_kg_brl" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "preco_anterior_kg" SET DATA TYPE DECIMAL(12,4);
