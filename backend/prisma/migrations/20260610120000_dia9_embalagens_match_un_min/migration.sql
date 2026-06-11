-- Dia 9 (Doc 2d) — Produtividade direta (un_min), Catalogo de Embalagens e Match de Formulas.

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "embalagem_id" INTEGER,
ADD COLUMN     "embalagem_snapshot" JSONB,
ADD COLUMN     "sem_embalagem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "un_min" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "embalagens" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "volume_ml" DECIMAL(8,2),
    "material" TEXT,
    "cor" TEXT,
    "preco_un_brl" DECIMAL(8,4),
    "fornecedor" TEXT,
    "prazo_entrega" TEXT,
    "preco_estimado" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "data_cotacao" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embalagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emb_historico_precos" (
    "id" SERIAL NOT NULL,
    "embalagem_id" INTEGER NOT NULL,
    "preco_un_brl" DECIMAL(8,4) NOT NULL,
    "preco_anterior_un" DECIMAL(8,4),
    "variacao_pct" DECIMAL(6,2),
    "fornecedor" TEXT,
    "data_cotacao" DATE NOT NULL,
    "origem" TEXT NOT NULL,
    "fonte_info" TEXT,
    "observacoes" TEXT,
    "registrado_por" UUID,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emb_historico_precos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formula_matches" (
    "id" SERIAL NOT NULL,
    "orcamento_id" UUID,
    "query_hash" TEXT,
    "candidatas" JSONB NOT NULL,
    "modo" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formula_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "embalagens_codigo_key" ON "embalagens"("codigo");

-- CreateIndex
CREATE INDEX "embalagens_tipo_idx" ON "embalagens"("tipo");

-- CreateIndex
CREATE INDEX "embalagens_volume_ml_idx" ON "embalagens"("volume_ml");

-- CreateIndex
CREATE INDEX "emb_historico_precos_embalagem_id_idx" ON "emb_historico_precos"("embalagem_id");

-- CreateIndex
CREATE INDEX "emb_historico_precos_data_cotacao_idx" ON "emb_historico_precos"("data_cotacao" DESC);

-- CreateIndex
CREATE INDEX "formula_matches_orcamento_id_idx" ON "formula_matches"("orcamento_id");

-- CreateIndex
CREATE INDEX "formula_matches_query_hash_idx" ON "formula_matches"("query_hash");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_embalagem_id_fkey" FOREIGN KEY ("embalagem_id") REFERENCES "embalagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embalagens" ADD CONSTRAINT "embalagens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emb_historico_precos" ADD CONSTRAINT "emb_historico_precos_embalagem_id_fkey" FOREIGN KEY ("embalagem_id") REFERENCES "embalagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emb_historico_precos" ADD CONSTRAINT "emb_historico_precos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_matches" ADD CONSTRAINT "formula_matches_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Indices GIN full-text (Doc 2d §B/C) — busca textual sem custo de IA.
-- A expressao do idx_formulas_busca DEVE ser identica a usada no ts_rank
-- do MatchFormulasService (to_tsvector portuguese sobre nome+categoria+obs).
-- ============================================================

-- CreateIndex (GIN busca de embalagens por nome)
CREATE INDEX "idx_embalagens_busca" ON "embalagens" USING gin (to_tsvector('portuguese', coalesce("nome", '')));

-- CreateIndex (GIN match de formulas: nome_produto + categoria + observacoes)
CREATE INDEX "idx_formulas_busca" ON "formulas" USING gin (to_tsvector('portuguese', coalesce("nome_produto", '') || ' ' || coalesce("categoria", '') || ' ' || coalesce("observacoes", '')));
