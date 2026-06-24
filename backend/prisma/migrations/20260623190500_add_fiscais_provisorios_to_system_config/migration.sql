-- F2-prep (aditivo): flag de estado "fiscais ainda nao validados pelo contador".
-- default true = nasce provisorio; vira false (1 clique na F5) quando validado. Badge da tela le este campo.
ALTER TABLE "system_config" ADD COLUMN "fiscais_provisorios" BOOLEAN NOT NULL DEFAULT true;
