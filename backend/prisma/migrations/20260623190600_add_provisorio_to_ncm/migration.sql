-- F2-prep (aditivo): flag de estado por linha de NCM (valida-se NCM a NCM com o contador).
-- default true = NCM nasce provisoria; vira false quando validada.
ALTER TABLE "ncm" ADD COLUMN "provisorio" BOOLEAN NOT NULL DEFAULT true;
