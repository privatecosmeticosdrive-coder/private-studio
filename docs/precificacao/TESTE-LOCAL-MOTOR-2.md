# Teste local do Motor 2 10/26 — procedimento e resultados

**Data:** 2026-10-21 · **Branch:** `motor-2-10-26` · **Máquina:** estação do TI (Windows 11), sem Docker,
sem psql/pg_dump, sem Railway staging. Nenhum acesso de escrita à produção; nenhum segredo neste documento.

## 1. O que foi montado

Um ambiente completo **100% local**, fora do repositório, em
`C:\Users\TI\AppData\Local\Temp\claude\C--Users-TI-Downloads-NOVO-FINANCEIRO\bb562582-9be8-4dd5-a851-e161adbc42ae\scratchpad\studio-teste\`
(doravante `studio-teste\`):

| Peça | Como |
|---|---|
| PostgreSQL 16 | pacote npm `embedded-postgres@16.14.0-beta.17` (binários zonky, sem admin), porta **55432**, dados em `studio-teste\data\db`, banco `studio_teste` criado em **UTF8** (o `initdb` do Windows cria o cluster em WIN1252 — ver §5). |
| Credenciais | geradas na 1ª execução e gravadas **só** em `studio-teste\.env.teste` (usuário/senha do PG, `DATABASE_URL_TESTE`, `JWT_SECRET_TESTE`, e-mail/senha do usuário de teste). Nunca comitadas, nunca impressas. |
| Schema | `prisma migrate deploy` contra o banco de teste — todas as migrations, inclusive `20261020120000_motor2_preco_kg_4_casas`. |
| Dados | **sem cópia da produção** (ver §4): base mínima determinística via `seed-base-teste.mjs` (system_config, parâmetros fiscais 2026-07-04, NCM 3305.90.00/3305.10.00, cliente RPA/SP, 2 embalagens de referência) + `seed-parametro-producao-rodada2.cjs` (vigência 2026-08) + **`seed-motor2-2026-10.cjs --commit`** (vigência 2026-10, encerra a anterior em 2026-09-30). |
| Usuário | admin de teste `teste.motor2@studio.localhost` (`seed-usuario-teste.mjs`, hash bcrypt do próprio backend). |
| Backend | `backend/dist` (nest build) executado com `DATABASE_URL`/`JWT_SECRET` injetados **na linha de comando** pelo wrapper `com-env-teste.mjs` — o `backend/.env` de produção não é lido (variável de ambiente tem precedência sobre o `.env` no Prisma e no ConfigModule; o wrapper aborta se a URL não for `127.0.0.1:55432`). Serve o `frontend/dist` em `http://localhost:3000`. |

Guardas contra a produção: `.env.teste` só existe na pasta scratch; `com-env-teste.mjs` valida o host;
`copiar-producao.mjs` (não executado — §4) abre a sessão de produção com `SET SESSION CHARACTERISTICS AS
TRANSACTION READ ONLY` antes de qualquer `COPY ... TO STDOUT`.

## 2. Resultados (via API real, `smoke-motor2.mjs`)

Contexto: cliente RPA/SP (ICMS 12% + PIS/COFINS 2,2+10,3 = 24,5% por dentro), NCM 3305.90.00, 6 un/min,
perda 10%, frete 0,10, créditos 21,21%/13,82%, fábrica 2026-10 (taxa R$ 4,68/min, setup R$ 280,78).
Margem **não informada** no cálculo → escada automática.

| Orç. | Caso | Motor | Margem (origem) | Ref. s/ IPI | **Obtido** | Ref. s/ emb | **Obtido s/ emb** | Taxa gestão | Alerta |
|---|---|---|---|---|---|---|---|---|---|
| #1 | Finalizador 50 ml, lote 1.000, emb R$ 6,00 | Motor 2 10/26 | 40% (escada) | 25,41 | **25,41** | 16,87 | **16,87** | 15% | — |
| #2 | Leave-in bruma 150 ml, lote 1.000, emb R$ 14,96 | Motor 2 10/26 | 40% (escada) | 45,65 | **45,65** | 24,34 | **24,34** | 15% | — |
| #3 | Finalizador sem emb, lote 300 | Motor 2 10/26 | 45% (escada) | 21,78 | **21,78** | — | 21,78 | — | **BLOQUEANTE** (< 500) |
| #4 | Finalizador sem emb, lote 500 | Motor 2 10/26 | 45% (escada) | 20,55 | **20,55** | — | 20,55 | — | — |
| #5 | Finalizador sem emb, lote 5.000 | Motor 2 10/26 | 35% (escada) | 14,23 | **14,23** | — | 14,23 | — | — |
| #6 | clone do #1 com **margem manual 33%** | Motor 2 10/26 | 33% (**manual**; escada daria 40%) | — | 22,64 | — | 14,09 | 15% | — |

Observações verificadas no snapshot (`resultados\snapshot-orc-N.json`): `motor: "Motor 2 10/26"`,
`_modelo_versao: "4.0"`, `margem{aplicada_pct, origem, escada_pct, faixa}`, `material{mp_bruta, perda,
credito_mp, mp_liquida, embalagem_bruta, credito_emb, embalagem_liquida}`, `parcelas{produto, embalagem, mo}`
com `markup_pct`, `vigencias_parametros` (17 chaves com data 2026-10-01), `premissas[]`. No #6 o preço da
embalagem (R$ 8,55) **não mudou** com a margem — prova de que a embalagem não leva a margem do produto.
Seed re-executada em dry-run após o commit: 18 chaves **PULA** (idempotente).

Evidências em `studio-teste\resultados\`:
`01-orcamento-1-motor2.png` (tela do orçamento, carimbo Motor 2 + escada + taxa de gestão),
`02-orcamento-3-lote-minimo.png` (banner BLOQUEANTE), `03-matriz-custo-fabrica-vigente.png` (cartão
"Fábrica vigente" + parâmetros versionados), `04-pdf-orcamento-1-pag1/2.png` e `04-pdf-orcamento-3-pag1/2.png`
(PDFs de 2 páginas), `orcamento-1.pdf`, `orcamento-3.pdf`, `tabela.json`.

## 3. Correções que o teste local revelou (já na branch)

1. **22P05 ao gravar o snapshot** em banco sem UTF8: o Motor 2 usava `−` (U+2212), `≥` e `≠` em
   strings gravadas (`faixa_descricao`, `premissas`, alerta de composição). Trocadas por `-`, `>=`,
   "diferente de" — só caracteres Latin-1 no JSON_CALC (produção é UTF8, mas o custo de não depender
   disso é zero). Goldens regerados (mesmos preços).
2. **PDF do Motor 2 saía com 3 páginas** (detalhe maior estourava a página 1 antes do `pageBreak`
   fixo da formulação) e o briefing mostrava "Margem —" quando a escada se aplica. Agora: margem
   do cálculo no briefing (`40% (escada por lote)`), enquadramento em 1 linha, tabelas mais justas,
   fundamentos + premissas + vigências no pé da página 2 → **2 páginas** como antes.

## 4. O que ficou bloqueado

- **Cópia da produção não executada.** O script `copiar-producao.mjs` (COPY read-only tabela a tabela,
  sem pg_dump) está pronto, mas a execução que lê a produção foi **barrada pela política de permissões
  do agente** ("Production Reads"). Por isso não há contagens de `orcamentos`/`formulas`/`materias_primas`
  da produção neste teste — os orçamentos de referência foram criados do zero (sem fórmula, `budget_mp`
  = preço da última compra convertido para R$/kg). Para copiar, o dono roda (com o PG de teste de pé):
  `node copiar-producao.mjs C:\Users\TI\private-studio\backend\.env` — a sessão de produção é READ ONLY
  e o script imprime prod × local por tabela.
- Fórmulas reais com composição ≠ 100% e MP sem preço não foram exercitadas (dependem da cópia).

## 5. Como subir de novo (ordem)

```
cd C:\Users\TI\AppData\Local\Temp\claude\C--Users-TI-Downloads-NOVO-FINANCEIRO\bb562582-9be8-4dd5-a851-e161adbc42ae\scratchpad\studio-teste

node start-teste.mjs                     # PostgreSQL 16 em 127.0.0.1:55432 (fica em primeiro plano; Ctrl+C para parar)
#   (em outro terminal)
node com-env-teste.mjs C:\Users\TI\private-studio\backend node dist/main.js   # backend em http://localhost:3000 (SPA incluída)
node smoke-motor2.mjs                    # recria os 5 orçamentos de referência e compara
node screenshots.mjs                     # PNGs em resultados\ (usa o Chrome instalado)
node gerar-pdf.mjs 0                     # PDF + PNG das páginas do 1º orçamento de ids.json
node stop-teste.mjs                      # para o PostgreSQL
```

Reconstruir do zero (apaga o banco local): `node recriar-db-utf8.mjs` → `node com-env-teste.mjs <backend> npx prisma migrate deploy`
→ `node seed-usuario-teste.mjs <backend>` → `node seed-base-teste.mjs` → `node com-env-teste.mjs <backend> node prisma/seed-parametro-producao-rodada2.cjs`
→ `node com-env-teste.mjs <backend> node prisma/seed-motor2-2026-10.cjs --commit`. Se `backend/dist` estiver
desatualizado: `npm run build` em `backend/` (e `npm run build` em `frontend/` para a SPA).

Estado ao final desta sessão: backend e PostgreSQL de teste **parados**; dados preservados em `studio-teste\data\db`.
