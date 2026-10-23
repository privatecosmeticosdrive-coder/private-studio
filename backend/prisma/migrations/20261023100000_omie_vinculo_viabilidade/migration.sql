-- INTEGRACAO OMIE (10/26): vinculo entre materias-primas do Studio e produtos do ERP,
-- com retrato da ultima compra (NF de entrada). ADITIVA: nenhuma coluna existente muda.
-- ANALISE DE VIABILIDADE DE PROJETOS (Matriz de Custo): projetos impares com premissas
-- e resultado em JSON. ADITIVA.

-- CreateTable
CREATE TABLE "mp_omie_vinculos" (
    "id" SERIAL NOT NULL,
    "codigo_omie" TEXT NOT NULL,
    "omie_id" TEXT NOT NULL,
    "descricao_omie" TEXT NOT NULL,
    "unidade_omie" TEXT,
    "ncm_omie" TEXT,
    "familia_omie" TEXT,
    "mp_id" INTEGER,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "origem" TEXT NOT NULL,
    "score" DECIMAL(5,3),
    "ultima_compra" JSONB,
    "motivo_sem_preco" TEXT,
    "sincronizado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mp_omie_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projetos_viabilidade" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cliente_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "premissas" JSONB NOT NULL,
    "resultado" JSONB,
    "observacoes" TEXT,
    "calculado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projetos_viabilidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mp_omie_vinculos_codigo_omie_key" ON "mp_omie_vinculos"("codigo_omie");

-- CreateIndex
CREATE INDEX "mp_omie_vinculos_mp_id_idx" ON "mp_omie_vinculos"("mp_id");

-- CreateIndex
CREATE INDEX "mp_omie_vinculos_origem_idx" ON "mp_omie_vinculos"("origem");

-- CreateIndex
CREATE INDEX "projetos_viabilidade_status_idx" ON "projetos_viabilidade"("status");

-- CreateIndex
CREATE INDEX "projetos_viabilidade_cliente_id_idx" ON "projetos_viabilidade"("cliente_id");

-- AddForeignKey
ALTER TABLE "mp_omie_vinculos" ADD CONSTRAINT "mp_omie_vinculos_mp_id_fkey" FOREIGN KEY ("mp_id") REFERENCES "materias_primas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projetos_viabilidade" ADD CONSTRAINT "projetos_viabilidade_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
