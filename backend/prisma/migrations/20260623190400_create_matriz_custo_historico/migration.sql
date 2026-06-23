-- F1 Matriz de Custo (aditivo): log de auditoria granular (antes -> depois) por campo.
-- FK ON DELETE SET NULL: apagar um usuario preserva o historico (user_id vira null).
CREATE TABLE "matriz_custo_historico" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "bloco" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "campo" TEXT NOT NULL,
    "valor_antes" TEXT,
    "valor_depois" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matriz_custo_historico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "matriz_custo_historico_entidade_entidade_id_idx" ON "matriz_custo_historico"("entidade", "entidade_id");

CREATE INDEX "matriz_custo_historico_created_at_idx" ON "matriz_custo_historico"("created_at");

ALTER TABLE "matriz_custo_historico" ADD CONSTRAINT "matriz_custo_historico_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
