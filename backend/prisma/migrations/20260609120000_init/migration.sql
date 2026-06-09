-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'comercial', 'pd', 'compras', 'producao');

-- CreateEnum
CREATE TYPE "FormulaOrigem" AS ENUM ('banco_validado', 'ia_gerada', 'pd_manual');

-- CreateEnum
CREATE TYPE "FormulaStatus" AS ENUM ('rascunho', 'em_revisao', 'aprovada', 'em_producao', 'arquivada');

-- CreateEnum
CREATE TYPE "OrcamentoNivel" AS ENUM ('basic', 'inter', 'premium');

-- CreateEnum
CREATE TYPE "OrcamentoStatus" AS ENUM ('rascunho', 'aprovado', 'enviado', 'aceito', 'rejeitado', 'arquivado');

-- CreateEnum
CREATE TYPE "CotacaoStatus" AS ENUM ('aguardando', 'validada_pd', 'validada_compras', 'rejeitada');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materias_primas" (
    "id" SERIAL NOT NULL,
    "codigo" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "preco_kg_brl" DECIMAL(10,2),
    "preco_anterior" DECIMAL(10,2),
    "aumento_pct" DECIMAL(6,2),
    "fornecedor" TEXT,
    "embalagem_minima" TEXT,
    "data_cotacao" DATE,
    "validade_cotacao" TEXT,
    "n_formulas_uso" INTEGER NOT NULL DEFAULT 0,
    "validado_pd" BOOLEAN NOT NULL DEFAULT false,
    "validado_compras" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materias_primas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mp_fornecedores_alt" (
    "id" SERIAL NOT NULL,
    "mp_id" INTEGER NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "preco_kg_brl" DECIMAL(10,2),
    "prazo_entrega" TEXT,
    "observacoes" TEXT,
    "data_cotacao" DATE,

    CONSTRAINT "mp_fornecedores_alt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulas" (
    "id" SERIAL NOT NULL,
    "nome_produto" TEXT NOT NULL,
    "versao_codigo" TEXT,
    "cliente_id" UUID,
    "data_criacao" DATE,
    "responsavel" TEXT,
    "custo_mp_kg" DECIMAL(10,2),
    "origem" "FormulaOrigem" NOT NULL DEFAULT 'banco_validado',
    "status" "FormulaStatus" NOT NULL DEFAULT 'aprovada',
    "categoria" TEXT,
    "observacoes" TEXT,
    "batelada" TEXT,
    "total_ingredientes" INTEGER,
    "cliente_original" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formula_composicao" (
    "id" SERIAL NOT NULL,
    "formula_id" INTEGER NOT NULL,
    "fase" TEXT,
    "ordem" INTEGER,
    "mp_id" INTEGER,
    "mp_nome_original" TEXT,
    "concentracao_pct" DECIMAL(6,3),
    "funcao" TEXT,
    "fornecedor_pref" TEXT,
    "preco_kg_snapshot" DECIMAL(10,2),
    "custo_na_formula_snapshot" DECIMAL(10,4),

    CONSTRAINT "formula_composicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID,
    "produto" TEXT NOT NULL,
    "categoria" TEXT,
    "nivel" "OrcamentoNivel",
    "volume_un" DECIMAL(8,2),
    "quantidade" INTEGER,
    "margem_pct" DECIMAL(5,2),
    "formula_id" INTEGER,
    "embalagem" TEXT,
    "budget_mp" DECIMAL(10,2),
    "produto_referencia" TEXT,
    "status" "OrcamentoStatus" NOT NULL DEFAULT 'rascunho',
    "calculo" JSONB,
    "conteudo_pag1" TEXT,
    "conteudo_pag2" TEXT,
    "conteudo_pag3" TEXT,
    "conteudo_pag4" TEXT,
    "score_global" INTEGER,
    "preco_sipi" DECIMAL(10,2),
    "preco_cipi" DECIMAL(10,2),
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotacoes_pendentes" (
    "id" SERIAL NOT NULL,
    "mp_id" INTEGER,
    "fornecedor" TEXT NOT NULL,
    "quantidade" DECIMAL(10,2),
    "unidade" TEXT,
    "valor" DECIMAL(10,2),
    "prazo_entrega" TEXT,
    "validade_cotacao" DATE,
    "observacoes" TEXT,
    "status" "CotacaoStatus" NOT NULL DEFAULT 'aguardando',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "validada_por" UUID,
    "validada_em" TIMESTAMP(3),

    CONSTRAINT "cotacoes_pendentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidade_id" TEXT,
    "detalhes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mo_folha_mensal" DECIMAL(12,2) NOT NULL DEFAULT 75000,
    "mo_dias_uteis" INTEGER NOT NULL DEFAULT 20,
    "mo_colaboradores" INTEGER NOT NULL DEFAULT 11,
    "imposto_mp_pct" DECIMAL(6,3) NOT NULL DEFAULT 37.5,
    "imposto_mo_pct" DECIMAL(6,3) NOT NULL DEFAULT 9.25,
    "ipi_pct" DECIMAL(6,3) NOT NULL DEFAULT 4.55,
    "desvio_mp_pct" DECIMAL(6,3) NOT NULL DEFAULT 10,
    "frete_un_brl" DECIMAL(8,4) NOT NULL DEFAULT 0.10,
    "produtividade_etapas" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "materias_primas_codigo_key" ON "materias_primas"("codigo");

-- CreateIndex
CREATE INDEX "materias_primas_nome_idx" ON "materias_primas"("nome");

-- CreateIndex
CREATE INDEX "mp_fornecedores_alt_mp_id_idx" ON "mp_fornecedores_alt"("mp_id");

-- CreateIndex
CREATE INDEX "formulas_categoria_idx" ON "formulas"("categoria");

-- CreateIndex
CREATE INDEX "formulas_origem_idx" ON "formulas"("origem");

-- CreateIndex
CREATE INDEX "formula_composicao_formula_id_idx" ON "formula_composicao"("formula_id");

-- CreateIndex
CREATE INDEX "formula_composicao_mp_id_idx" ON "formula_composicao"("mp_id");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_cliente_id_idx" ON "orcamentos"("cliente_id");

-- CreateIndex
CREATE INDEX "cotacoes_pendentes_status_idx" ON "cotacoes_pendentes"("status");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_entidade_entidade_id_idx" ON "audit_log"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mp_fornecedores_alt" ADD CONSTRAINT "mp_fornecedores_alt_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "materias_primas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_composicao" ADD CONSTRAINT "formula_composicao_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "formulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_composicao" ADD CONSTRAINT "formula_composicao_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "materias_primas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacoes_pendentes" ADD CONSTRAINT "cotacoes_pendentes_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "materias_primas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacoes_pendentes" ADD CONSTRAINT "cotacoes_pendentes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacoes_pendentes" ADD CONSTRAINT "cotacoes_pendentes_validada_por_fkey" FOREIGN KEY ("validada_por") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

