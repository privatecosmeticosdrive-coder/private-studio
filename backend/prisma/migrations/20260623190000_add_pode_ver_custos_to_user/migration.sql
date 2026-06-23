-- F1 Matriz de Custo (aditivo): flag de acesso a custos no usuario.
ALTER TABLE "users" ADD COLUMN "pode_ver_custos" BOOLEAN NOT NULL DEFAULT false;
