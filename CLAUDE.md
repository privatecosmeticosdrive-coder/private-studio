# CLAUDE.md — Private Studio v9

## O que é este projeto

Sistema B2B de orçamentos da Private Cosméticos (terceirista de cosméticos, Valinhos/SP, Lucro Real, ANVISA RDC 752/2022). NestJS (3000, prefixo /api) + Vite/React (5173) + PostgreSQL único em produção no KingHost. Deploy Railway. O usuário (Gabriel, dono, não-dev) opera via terminal; um conselheiro externo (chat Claude) atua como auditor de marcos e decisor — decisões de arquitetura/negócio passam por ele.

## Regras INVARIANTES (nunca violar)

1. NENHUM commit ou push sem OK explícito do Gabriel. Sempre: stage por nome de arquivo → git status → PARAR → aguardar OK.
2. Commits de UMA linha (`-m`). Nunca heredoc/printf (bug de duplicação já observado).
3. O banco é PRODUÇÃO. Toda escrita de teste deve ser reversível, com baseline anotado ANTES e restauração/justificativa DEPOIS. Migrations: gerar via `migrate diff` manual (nunca `migrate dev` contra prod), pre-flight com `migrate status`, aplicar com `migrate deploy`, e criar rollback .sql correspondente (os rollback .sql ficam UNTRACKED de propósito — nunca commitar).
4. Type-check REAL: frontend = `npx tsc -p tsconfig.app.json --noEmit` (o `tsc --noEmit` da raiz é NO-OP, `files:[]` — falso verde). Backend = `npx tsc --noEmit` (funciona).
5. Smoke test de comportamento antes de qualquer commit de código (não basta compilar). Endpoints de agregação: conferir soma vs `COUNT(*)` real.
6. Números fiscais NUNCA são estimados/chutados. Valor não validado pelo contador fica nullable + flag provisório (falha visível > imposto zero silencioso). Fonte: `docs/validacao-fiscal-contador.md`.
7. UI nunca mente: card/tela sem dado mostra "sem dados"; query que falha mostra erro — NUNCA zero falso. Todo número exibido tem fonte rastreável (query real).
8. Fronteira de segurança (provada empiricamente): revisar/editar NCM não altera preço de orçamento já calculado (preço congelado em snapshot; engine lê IPI global). Qualquer mudança que ameace essa fronteira exige teste baseline→ação→reconferência de preço.
9. Rotas estáticas ANTES de rotas `:id` nos controllers NestJS.
10. Windows: `--watch` do Nest é instável (instâncias sobrepostas/EADDRINUSE) — para testes, subir single instance sem watch. Matar processo por PID via PowerShell `Stop-Process` (nunca `taskkill /F /IM node.exe`). Frontend SEMPRE na 5173 (proxy).
11. Gating: menu por `roles?:` e `custos?:` no NavItem; `pode_ver_custos || role==='admin'` é o check canônico de custo; autoridade real é sempre o backend (guards) — front é UX.
12. `$queryRaw`: tagged template (não Unsafe) quando não há input do usuário; nomes de TABELA/COLUNA do banco (conferir `@@map`/`@map` no schema antes); `COUNT(*)::int` (BigInt quebra JSON).
13. Em dúvida de produto/arquitetura/fiscal: PARAR e perguntar ao Gabriel (que consulta o conselheiro). Não decidir sozinho o que é tese de negócio.

## Estado e fontes de verdade

- `docs/04_estado_atual.md` → estado do projeto + PENDÊNCIAS NO RADAR (ler ao iniciar sessão).
- `docs/00_contexto_estrategico.md` → o porquê do projeto, teses, gaps, ecossistema, visão.
- `docs/validacao-fiscal-contador.md` (+ .pdf) → perguntas ao contador; F4 passo 3/4 BLOQUEADOS até as respostas.

## Fluxo de trabalho

Recon antes de desenhar → desenhar → autocrítica → aplicar → type-check real → smoke de comportamento → reportar → aguardar OK → commit isolado por fatia. Fatias grandes são bem-vindas (modo Fable), mas os gates (commit, smoke visual do Gabriel) são invioláveis.
