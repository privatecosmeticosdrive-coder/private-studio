# Deploy — Private Studio (Railway, serviço único)

Roteiro de deploy do Private Studio no **Railway** como **um único serviço Node**:
o backend NestJS serve também o build do frontend (Vite), e o banco PostgreSQL
**permanece na KingHost** (acesso remoto). Sem plugin Postgres do Railway, sem
seed, sem reimport de KB — os dados já existem e ficam na KingHost.

## Arquitetura

- **Um serviço Node** no Railway. O backend serve `frontend/dist` via
  `ServeStaticModule` (fallback de SPA para `index.html`); a API fica sob `/api`
  (excluída do catch-all do SPA).
- **Banco na KingHost**: o app conecta remotamente. Já validado que o Postgres da
  KingHost é acessível de fora (`/api/health` → `database: connected`).
- **Config-as-code**:
  - `railway.json` — builder Nixpacks, `buildCommand: npm run build`,
    `startCommand: npm start`, `healthcheckPath: /api/health`.
  - `package.json` (raiz) — `build` (frontend + backend, com `--include=dev`) e
    `start` (`prisma migrate deploy` → `node backend/dist/main.js`).

## Pré-requisitos

- Conta no Railway conectada ao GitHub.
- Os valores reais em mãos, copiados do `backend/.env` local (gitignored):
  `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`.

## Passo a passo

### 1. Criar o projeto
Railway → **New Project** → **Deploy from GitHub repo** →
`privatecosmeticosdrive-coder/private-studio`, branch **main**.
O `railway.json` já define build, start e healthcheck — não precisa configurar
comandos no painel.

### 2. NÃO adicionar plugin PostgreSQL
O banco é o da **KingHost**. Não provisione o Postgres do Railway.

### 3. Variáveis do serviço (Settings → Variables)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | A **mesma** string do `backend/.env` local (Postgres da KingHost). Formato: `postgresql://USUARIO:SENHA@pgsql.privatecosmeticos.com.br:5432/privatecosmeticos?schema=public`. Copie o valor real do `.env`. |
| `JWT_SECRET` | Ver nota abaixo. |
| `JWT_EXPIRES_IN` | `1d` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `ANTHROPIC_API_KEY` | A chave real do `.env` (sem ela, as features de IA caem em mock). |

**Não** setar `PORT` (o Railway injeta) nem `CORS_ORIGIN` (mesma origem em
serviço único).

> **Nota sobre `JWT_SECRET`:** use o **mesmo** valor do `.env` atual se quiser que
> tokens/sessões emitidos hoje continuem válidos. Se gerar um novo
> (`openssl rand -base64 48`), os usuários apenas precisam **logar de novo** — as
> **senhas no banco continuam válidas**, porque o hash é bcrypt e independe do
> `JWT_SECRET`.

### 4. Sobre o `prisma migrate deploy` no start (não destrutivo)

O `start` roda `prisma migrate deploy` antes de subir o app. Como o banco da
KingHost **já tem o schema e os dados** (foi criado por essas mesmas migrations
durante o desenvolvimento), o `migrate deploy` apenas aplica **migrations
pendentes** — e, estando o banco em dia, será um **no-op seguro**.

> `prisma migrate deploy` **nunca dropa dados**: ele só aplica migrations ainda
> não aplicadas, registradas na tabela `_prisma_migrations`. Não recria tabelas
> existentes nem apaga conteúdo. É o comando correto e seguro para produção.

### 5. Primeiro deploy
Acompanhe os **build logs** no Railway. Quando o serviço subir, abra a **URL
pública** e cheque `https://SEU-APP.up.railway.app/api/health` → deve responder
`{"status":"ok", ..., "database":"connected"}`.

### 6. Login
Use as credenciais que **já existem** no banco da KingHost (o admin já está
cadastrado — **sem seed**). E-mail do admin: `privatecosmeticosdrive@gmail.com`;
a senha é a que já está em uso (não versionada aqui).

### 7. Pós-deploy
Crie os demais logins da equipe pela tela **Admin → Usuários** (Dia 13).

---

## Troubleshooting

### Build falha por devDependencies podadas
**Sintoma:** o build quebra com "`nest: not found`", "`vite: not found`" ou
"`tsc: not found`".
**Causa:** `NODE_ENV=production` faz o `npm ci` pular as devDependencies (onde
moram nest CLI, vite e typescript).
**Mitigação (já aplicada):** o `build` do `package.json` raiz usa
`npm ci --include=dev` no frontend e no backend, forçando a instalação das
ferramentas de build mesmo em produção. Se mexer nesses comandos, mantenha o
`--include=dev`.

### Healthcheck falha (deploy fica "unhealthy")
- Confirme que o `healthcheckPath` é `/api/health` (no `railway.json`).
- O app **deve** ouvir em `process.env.PORT` (o Railway injeta a porta). O código
  já faz `const port = process.env.PORT ?? 3000`. **Não** fixe `PORT` nas
  Variables.
- Olhe os **deploy logs**: se o app não chegou a "Nest application successfully
  started", o erro está antes (provavelmente conexão com o banco — veja abaixo).
- O healthcheck responde 200 mesmo com o banco fora (`database: unavailable`),
  então um healthcheck vermelho normalmente indica app que **não subiu**, não
  banco indisponível.

### Erro de conexão com o banco (`database: unavailable` ou crash no migrate)
- Confira a `DATABASE_URL` (usuário, senha, host, porta `5432`, nome do banco e
  `?schema=public`) — copie exatamente do `.env` que funciona localmente.
- Verifique se a **KingHost aceita conexões externas** do IP de saída do Railway
  (firewall / whitelist de IP no painel da KingHost). Diferente da sua máquina, o
  Railway sai por outro IP; se a KingHost restringe por IP, é preciso liberar.
- Se a KingHost exigir SSL, acrescente `&sslmode=require` (ou o modo apropriado) à
  `DATABASE_URL`.
- Teste rápido: `/api/health` com `database: connected` confirma que a conexão
  está de pé.

### A SPA carrega mas as chamadas de API dão 404 / HTML
- O frontend usa `baseURL: '/api'` (relativa) — correto para serviço único.
- Se uma rota de API retornar o `index.html` em vez de JSON, revise o `exclude`
  do `ServeStaticModule` em `backend/src/app.module.ts`
  (`exclude: ['/api/{*splat}']`).
