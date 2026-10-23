# INCIDENTE — banco de produção do Private Studio zerado (22/10/2026, ~22:45 BRT)

## O que aconteceu

Durante a preparação de uma migration nova (tabelas `mp_omie_vinculos` e `projetos_viabilidade`), o agente (Claude) executou:

```
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "<DATABASE_URL de produção>" --script
```

O parâmetro `--shadow-database-url` recebeu a **URL do banco de produção** (KingHost, `pgsql.privatecosmeticos.com.br`, banco `privatecosmeticos`). O Prisma **reseta o shadow database** (apaga o schema `public` e o recria replicando as migrations) antes de calcular a diferença. O comando terminou com erro P3015 (pasta de migration vazia), mas o reset já tinha acontecido.

Isso foi um erro meu. Nenhuma regra do CLAUDE.md autorizava esse comando contra a produção, e a regra 3 ("o banco é PRODUÇÃO") foi violada por descuido na montagem do comando.

## Evidências (lidas em seguida, somente leitura)

| Antes (22/10, 22:20) | Depois (22/10, 22:50) |
|---|---|
| `materias_primas` = 1.255 · `formulas` = 927 · `formula_composicao` = 13.599 · `orcamentos` = 48 · `mp_historico_precos` = 1.623 · `parametro_producao` = 9 · `parametro_fiscal` = 7 | `materias_primas` = 0 (contagem direta com a URL de produção) |
| `prisma migrate status`: 22 migrations, 1 pendente (`20261020120000_motor2_preco_kg_4_casas`) | `prisma migrate status`: **todas** as 23 migrations "não aplicadas" (tabela `_prisma_migrations` sem registros) |

O serviço no Railway (`https://private-studio-production.up.railway.app`) responde `database: connected`, mas o banco está sem dados: **ninguém consegue logar** (tabela `users` vazia) até a restauração.

Depois do diagnóstico, nenhum outro comando foi executado contra a produção. O sincronizador do Omie **não** foi aplicado (só dry-run).

## O que fazer AGORA (só o dono consegue)

1. **KingHost → painel → Banco de dados PostgreSQL → `privatecosmeticos` → Backup / Restaurar.** Restaurar o backup mais recente **anterior a 22/10/2026 22:40 (horário de Brasília)**. A KingHost mantém backups diários dos bancos; se houver opção de "restaurar em novo banco", prefira restaurar em um banco novo e apontar a `DATABASE_URL` do Railway para ele (evita sobrescrever de novo).
2. Se o painel não oferecer o backup, abrir chamado com a KingHost pedindo a restauração do banco `privatecosmeticos` para o estado de 22/10/2026 antes das 22:40 (BRT). Eles costumam ter cópia dos últimos dias.
3. Enquanto o banco não volta: considerar **pausar o serviço no Railway** (Settings → Pause) para a equipe não ver o sistema "vazio" e tentar cadastrar coisas em cima do banco zerado.
4. Depois da restauração, me avisar: eu confiro as contagens acima (1.255 / 927 / 13.599 / 48 / 1.623) antes de qualquer outra coisa.

O que se perde se o backup for de ontem à noite: só o que foi criado em 22/10 depois do backup (pelo banco, havia 1 orçamento em rascunho criado em 22/10 às 21:26 BRT).

## Se NÃO houver backup — o que dá para reconstruir localmente (parcial)

| Dado | Fonte local | Cobertura |
|---|---|---|
| Matérias-primas (1.255) | `scratchpad/studio-mps.json` (exportado às 22:30 de 22/10, antes do incidente): id, código, nome, preço/kg, preço anterior, fornecedor, data da cotação, nº de fórmulas, ativo, observações | **100% das MPs** com preço e data atuais (sem o histórico de cotações) |
| Fórmulas e composição | `backend/prisma/kb-source.json` (814 fórmulas, 12.038 linhas, 1.162 MPs — base de jun/2026) + `backend/prisma/extracao-drive/formulas_staging.json` e `docs/extracao-drive-2026-10/formulas_extraidas.xlsx` (168 fórmulas das fotos do Drive, out/2026) | 814 + 168 = ~982 das 927 do banco (fórmulas criadas pelo laboratório na tela desde junho **não** têm cópia) |
| Histórico de preços (1.623) | `import_inicial` (1.162) reconstruível pelo `baseline-historico-precos.ts`; `extracao_drive` (459) pelo `import-extracao-drive.ts`; `atualizacao_rapida` (2) perdidas | ~99% |
| NCM (36 linhas validadas) e parâmetros fiscais | `backend/prisma/backfill-f4a-fiscal.cjs` + `seed.ts` + documentação em `docs/fiscal/` | reconstruível |
| Parâmetros de produção (9) | `seed-parametro-producao-rodada2.cjs` (7) + chaves `escada_nota_amplitude_pct`, `velocidade_camuflage_light_un_min` (valores anotados em `docs/`) | reconstruível |
| Usuários (5) | nomes em `docs/04_estado_atual.md` (admin Márcio Gabriel; comercial Seba, Roberta, Geovanna; pd Antonio Alves); senhas **não** recuperáveis — recriar | recriável |
| Clientes (2) | Teste Agente (CNPJ 16888447000189) e Bianca Beauty (65.254.006/0001-30) com perfil fiscal em `docs/04_estado_atual.md` | recriável |
| Orçamentos (48: 46 rascunhos, 2 enviados), amostras, pendências do laboratório, alertas, audit_log | **sem cópia local** | **perdidos** sem backup |

Antes de qualquer reconstrução: só com o OK do dono, e depois de esgotar a restauração pela KingHost.

## Regras que passam a valer (para mim e para qualquer agente neste repositório)

- **Nunca** passar a `DATABASE_URL` de produção em `--shadow-database-url`, `--from-url`, `--to-url`, `prisma migrate reset`, `prisma db push` ou qualquer comando que não seja `migrate status` / `migrate deploy` / leitura.
- Migration nova = SQL escrito à mão (ou `migrate diff --from-schema-datamodel` entre dois **arquivos**, sem banco), validado em banco local (`studio-teste`, 127.0.0.1:55432), nunca em produção.
- Antes de rodar qualquer comando `prisma` que aceite URL, conferir se a URL é `127.0.0.1:55432`.
- Backup lógico do banco (`pg_dump`) antes de toda sessão que mexa em schema — e guardar fora do repositório.
