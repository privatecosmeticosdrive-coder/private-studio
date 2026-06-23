-- F1 Matriz de Custo (aditivo): parametros operacionais + fiscais.
-- pis_cofins_* NULLABLE de proposito (null = nao configurado, falha visivel; nunca imposto 0 silencioso).
-- mo_folha_mensal, ipi_pct e mo_dias_uteis NAO sao tocados (legado vive ate F6).
ALTER TABLE "system_config" ADD COLUMN "custo_fixo_mensal" DECIMAL(12,2) NOT NULL DEFAULT 120240,
ADD COLUMN "eficiencia_linha" DECIMAL(4,3) NOT NULL DEFAULT 0.75,
ADD COLUMN "encomendante_simples" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "horas_dia" DECIMAL(4,2) NOT NULL DEFAULT 8,
ADD COLUMN "icms_regime" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN "margem_padrao_pct" DECIMAL(5,2) NOT NULL DEFAULT 30,
ADD COLUMN "pis_cofins_monofasico_pct" DECIMAL(6,3),
ADD COLUMN "pis_cofins_servico_pct" DECIMAL(6,3);
