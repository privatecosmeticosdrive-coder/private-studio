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
- [ ] Dias 4-7 — Backend (CRUDs MP/fórmulas/clientes, orçamentos Fase 1 + Fase 2)
- [ ] Dias 8-11 — Frontend
- [ ] Dias 12-13 — PDF server-side + telas admin
- [ ] Dias 14-15 — Deploy KingHost + testes
