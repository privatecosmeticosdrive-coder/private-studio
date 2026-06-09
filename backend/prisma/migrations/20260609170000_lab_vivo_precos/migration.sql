-- AlterTable: novos campos de versionamento/auditoria (Lab Vivo)
ALTER TABLE "formulas" ADD COLUMN     "derivada_de_id" INTEGER,
ADD COLUMN     "diff_vs_anterior" JSONB,
ADD COLUMN     "formula_mae_id" INTEGER,
ADD COLUMN     "validacao_obs" TEXT,
ADD COLUMN     "validada_em" TIMESTAMP(3),
ADD COLUMN     "validada_por" UUID,
ADD COLUMN     "versao_descricao" TEXT;

-- Converte origem (enum -> text) preservando os valores existentes
ALTER TABLE "formulas" ALTER COLUMN "origem" DROP DEFAULT;
ALTER TABLE "formulas" ALTER COLUMN "origem" TYPE TEXT USING "origem"::text;
ALTER TABLE "formulas" ALTER COLUMN "origem" SET DEFAULT 'banco_original';

-- Converte status (enum -> text) preservando os valores existentes
ALTER TABLE "formulas" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "formulas" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "formulas" ALTER COLUMN "status" SET DEFAULT 'rascunho';

-- AlterTable
ALTER TABLE "materias_primas" ADD COLUMN     "flag_aumento_relevante" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "formula_composicao_snapshot" JSONB,
ADD COLUMN     "formula_status_momento" TEXT,
ADD COLUMN     "formula_versao_codigo" TEXT;

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "alerta_aumento_mp_pct" DECIMAL(5,2) NOT NULL DEFAULT 20.0,
ADD COLUMN     "alertas_ativos" BOOLEAN NOT NULL DEFAULT true;

-- DropEnum
DROP TYPE "FormulaOrigem";

-- DropEnum
DROP TYPE "FormulaStatus";

-- CreateTable
CREATE TABLE "mp_historico_precos" (
    "id" SERIAL NOT NULL,
    "mp_id" INTEGER NOT NULL,
    "preco_kg_brl" DECIMAL(10,2) NOT NULL,
    "preco_anterior_kg" DECIMAL(10,2),
    "variacao_pct" DECIMAL(6,2),
    "fornecedor" TEXT NOT NULL,
    "data_cotacao" DATE NOT NULL,
    "origem" TEXT NOT NULL,
    "fonte_info" TEXT,
    "observacoes" TEXT,
    "registrado_por" UUID,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mp_historico_precos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT,
    "entidade_tipo" TEXT,
    "entidade_id" INTEGER,
    "severidade" TEXT NOT NULL DEFAULT 'info',
    "lido_por" JSONB NOT NULL DEFAULT '[]',
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_for" TEXT[],

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mp_historico_precos_mp_id_idx" ON "mp_historico_precos"("mp_id");

-- CreateIndex
CREATE INDEX "mp_historico_precos_data_cotacao_idx" ON "mp_historico_precos"("data_cotacao" DESC);

-- CreateIndex
CREATE INDEX "alertas_resolvido_created_at_idx" ON "alertas"("resolvido", "created_at" DESC);

-- (formulas_origem_idx ja existe da migration inicial — origem foi convertida
--  in-place via ALTER TYPE, entao o indice nao foi derrubado; nao recriar)

-- CreateIndex
CREATE INDEX "formulas_formula_mae_id_idx" ON "formulas"("formula_mae_id");

-- CreateIndex
CREATE INDEX "formulas_status_idx" ON "formulas"("status");

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_validada_por_fkey" FOREIGN KEY ("validada_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_formula_mae_id_fkey" FOREIGN KEY ("formula_mae_id") REFERENCES "formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_derivada_de_id_fkey" FOREIGN KEY ("derivada_de_id") REFERENCES "formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mp_historico_precos" ADD CONSTRAINT "mp_historico_precos_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "materias_primas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mp_historico_precos" ADD CONSTRAINT "mp_historico_precos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex (busca semantica — Doc 2b §A7)
-- indice GIN funcional sobre to_tsvector; nao expressavel no datamodel Prisma,
-- por isso adicionado manualmente nesta migration.
CREATE INDEX "idx_formula_busca" ON "formulas" USING gin(to_tsvector('portuguese', "nome_produto"));
