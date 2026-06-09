# Private Studio (v9)

Plataforma interna de orçamento cosmético da **Private Cosméticos** — sucessora do
agente v8 (Vercel). Multi-usuário, banco de dados real, PDF profissional server-side.

> Migração v8 → v9 conforme `docs/03_plano_implementacao.md` (plano de 15 dias).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | NestJS 11 (Node 24, TypeScript) |
| ORM | Prisma 6 |
| Banco | PostgreSQL 13 (KingHost) |
| Auth | JWT + Bcrypt |
| PDF | Puppeteer (server-side) |
| Frontend | Vite + React 18 + TailwindCSS + shadcn/ui |
| Hospedagem | KingHost (Node.js III + Cloud WEB) |

## Estrutura

```
private-studio/
├── backend/     # API NestJS (Prisma + PostgreSQL)
├── frontend/    # SPA Vite + React (scaffold a partir do Dia 8)
└── docs/        # Specs: sistema atual, sistema novo e plano de 15 dias
```

## Backend — como rodar localmente

```bash
cd backend
npm install
cp .env.example .env      # preencha DATABASE_URL com as credenciais da KingHost
npx prisma generate
npm run start:dev         # http://localhost:3000/api
```

Health check: `GET http://localhost:3000/api/health`
Sem banco configurado, responde `database: "unavailable"` (o backend sobe mesmo assim).

## Progresso

- [x] **Dia 1** — Setup do ambiente: scaffold NestJS, Prisma, health check, repo git
- [x] **Dia 2** — Schema completo (10 tabelas), migration aplicada, seed (admin + config), importação do `kb.json` (1.162 MPs + 814 fórmulas + 12.038 linhas de composição, match MP↔composição 95,3%)
- [x] **Dia 2b** — Laboratório Vivo + Gestão de Preços: +2 tabelas (`mp_historico_precos`, `alertas`), versionamento de fórmulas (mãe+versões), snapshot em orçamentos, alertas de preço. Correção de extração trocada (nome↔versao_codigo em 68 fichas "Folha de Formulação"). Promoção final: **735 mães + 79 versões** (814 validadas). Baseline de histórico: 1.162 registros.
- [x] **Dia 3** — Auth JWT (login/refresh/logout/me) + CRUD de usuários (admin only) + Guards globais (JWT + Roles) + decorators (@Public/@Roles/@CurrentUser). Smoke test 15/15.
- [x] **Dia 4** — CRUD Clientes; CRUD MPs (busca/paginação/filtros, formulas-que-usam); **atualizar-preço** (histórico + audit + alerta em transação); histórico + gráfico; Alertas (listar/marcar-lido/resolver); SystemConfig GET/PATCH. Smoke test 23/23.
- [x] **Dia 5** — Fórmulas: CRUD + composição aninhada; versionamento Lab Vivo (nova-versão, validar, diff JSON, árvore de família); **cálculo de custo em tempo real** (preços atuais + termômetro de assertividade); busca fuzzy (GIN tsvector) + sugerir similares. Smoke test 18/18.
- [x] **Dia 6** — Orçamentos: schema estendido (amostragem Doc 2c, status String); CRUD (criar/listar/detalhe/editar/duplicar); **motor de custo Private determinístico** (Doc 1 §6); `POST /:id/calcular` (Fase 1) com modos MOCK e REAL. Smoke 11/11 (mock) + math validada em real.
- [ ] Dia 7 — Orçamentos Fase 2 (formatação 4 páginas) + pipeline de amostragem (endpoints + tabelas `amostra_eventos`/`integration_events`) + cotações

## Cálculo de orçamento (Fase 1) — modos MOCK e REAL

O endpoint `POST /api/orcamentos/:id/calcular` gera o `JSON_CALC` travado. A
**matemática do modelo Private** (impostos, MO, IPI, produtividade — `custo-engine.ts`)
é sempre determinística em código. O que muda entre os modos é apenas a **estimativa
dos inputs fuzzy** (etapas, embalagem, fragrância, e custo-base de MP quando não há fórmula):

| | MOCK | REAL |
|---|---|---|
| Quando | `ANTHROPIC_API_KEY` vazio no `.env` | `ANTHROPIC_API_KEY` preenchido |
| Estimativa de inputs | heurística local (coerente, sem custo) | Anthropic API (`ANTHROPIC_MODEL`) |
| Campo `calculo._mode` | `"mock"` (+ `_aviso_mock`) | `"real"` |
| Custo de API | R$ 0 | consome tokens |

**Ativar o modo real:** basta preencher `ANTHROPIC_API_KEY` em `backend/.env` e reiniciar.
A troca é automática — nenhum código muda. Se a API falhar, cai em fallback heurístico
(marcado em `calculo.estimativa.fallback_de`).
- [ ] Dias 8-11 — Frontend
- [ ] Dias 12-13 — PDF server-side + telas admin
- [ ] Dias 14-15 — Deploy KingHost + testes
