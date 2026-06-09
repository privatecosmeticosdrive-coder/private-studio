# Documento 2 — Spec do Sistema Novo (v9)
**Private Cosméticos · Plataforma de Orçamento Profissional**  
**Data:** 09/06/2026 · **Codinome:** "Private Studio"

> Este documento descreve o sistema novo a ser construído. Use-o como input para o Claude Code.

---

## 1. Visão geral

Plataforma web profissional para a Private Cosméticos gerar, gerenciar e evoluir orçamentos cosméticos com inteligência artificial, banco de dados real e integração futura com ERP/CRM.

**Diferenciais:**
- Sistema interno multi-usuário (5-8 pessoas inicialmente)
- Banco real PostgreSQL com 814 fórmulas + 1.162 MPs editáveis
- Histórico persistente compartilhado entre toda a equipe
- Agente IA com Fase 1 (cálculo único) + Fase 2 (formatação) refinada
- PDF profissional server-side garantindo 4 páginas exatas
- Preparado para integração futura com OMIE, IAPP, CRM

---

## 2. Stack técnica

### Backend
- **NestJS** (Node.js 24, TypeScript)
- **PostgreSQL 13** (servidor pgsql13-farm da KingHost)
- **Prisma ORM** (migrations, type-safe queries)
- **JWT** para auth
- **Bcrypt** para senhas
- **Puppeteer** para geração de PDF server-side

### Frontend
- **Vite + React 18 + TypeScript**
- **TailwindCSS** + componentes shadcn/ui
- **TanStack Query** (cache de queries)
- **React Router** (rotas)
- **React Hook Form + Zod** (formulários e validação)

### Hospedagem
- **KingHost Cloud WEB 4/4** (já contratado): frontend estático + arquivos
- **KingHost Node.js III** (R$27/mês): backend NestJS
- **PostgreSQL 13 KingHost** (incluso): banco de dados
- **Domínio:** `agente.privatecosmeticos.com.br` (subdomínio)

---

## 3. Modelo de dados (PostgreSQL)

### Tabelas principais

```sql
-- USUÁRIOS
users (
  id              UUID PRIMARY KEY,
  email           VARCHAR UNIQUE NOT NULL,
  nome            VARCHAR NOT NULL,
  password_hash   VARCHAR NOT NULL,
  role            ENUM ('admin', 'comercial', 'pd', 'compras', 'producao'),
  ativo           BOOLEAN DEFAULT true,
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)

-- CLIENTES
clientes (
  id              UUID PRIMARY KEY,
  nome            VARCHAR NOT NULL,
  cnpj            VARCHAR,
  email           VARCHAR,
  telefone        VARCHAR,
  observacoes     TEXT,
  created_at      TIMESTAMP,
  created_by      UUID REFERENCES users(id)
)

-- MATÉRIAS-PRIMAS (importadas do kb.json)
materias_primas (
  id              SERIAL PRIMARY KEY,
  codigo          INTEGER UNIQUE,
  nome            VARCHAR NOT NULL,
  preco_kg_brl    DECIMAL(10,2),
  preco_anterior  DECIMAL(10,2),
  aumento_pct     DECIMAL(5,2),
  fornecedor      VARCHAR,
  embalagem_minima VARCHAR,
  data_cotacao    DATE,
  validade_cotacao VARCHAR,
  n_formulas_uso  INTEGER DEFAULT 0,
  validado_pd     BOOLEAN DEFAULT false,
  validado_compras BOOLEAN DEFAULT false,
  ativo           BOOLEAN DEFAULT true,
  observacoes     TEXT,
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)

-- FORNECEDORES ALTERNATIVOS (many-to-many)
mp_fornecedores_alt (
  id              SERIAL PRIMARY KEY,
  mp_id           INTEGER REFERENCES materias_primas(id),
  fornecedor      VARCHAR NOT NULL,
  preco_kg_brl    DECIMAL(10,2),
  prazo_entrega   VARCHAR,
  observacoes     TEXT,
  data_cotacao    DATE
)

-- FÓRMULAS
formulas (
  id              SERIAL PRIMARY KEY,
  nome_produto    VARCHAR NOT NULL,
  versao_codigo   VARCHAR,
  cliente_id      UUID REFERENCES clientes(id),
  data_criacao    DATE,
  responsavel     VARCHAR,
  custo_mp_kg     DECIMAL(10,2),
  origem          ENUM ('banco_validado', 'ia_gerada', 'pd_manual'),
  status          ENUM ('rascunho', 'em_revisao', 'aprovada', 'em_producao', 'arquivada'),
  categoria       VARCHAR,
  observacoes     TEXT,
  created_at      TIMESTAMP,
  created_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMP
)

-- COMPOSIÇÃO DAS FÓRMULAS
formula_composicao (
  id              SERIAL PRIMARY KEY,
  formula_id      INTEGER REFERENCES formulas(id) ON DELETE CASCADE,
  fase            VARCHAR,
  ordem           INTEGER,
  mp_id           INTEGER REFERENCES materias_primas(id),
  mp_nome_original VARCHAR,  -- para casos sem match no banco
  concentracao_pct DECIMAL(6,3),
  funcao          VARCHAR,
  fornecedor_pref VARCHAR
)

-- ORÇAMENTOS
orcamentos (
  id              UUID PRIMARY KEY,
  numero          SERIAL UNIQUE,  -- contador sequencial
  cliente_id      UUID REFERENCES clientes(id),
  produto         VARCHAR NOT NULL,
  categoria       VARCHAR,
  nivel           ENUM ('basic', 'inter', 'premium'),
  volume_un       DECIMAL(8,2),
  quantidade      INTEGER,
  margem_pct      DECIMAL(5,2),
  formula_id      INTEGER REFERENCES formulas(id),
  embalagem       VARCHAR,
  budget_mp       DECIMAL(10,2),
  produto_referencia VARCHAR,
  status          ENUM ('rascunho', 'aprovado', 'enviado', 'aceito', 'rejeitado', 'arquivado'),
  
  -- Dados do cálculo (JSON_CALC travado)
  calculo         JSONB NOT NULL,
  
  -- Conteúdo das 4 páginas geradas pela IA
  conteudo_pag1   TEXT,  -- Comercial
  conteudo_pag2   TEXT,  -- Industrial
  conteudo_pag3   TEXT,  -- Fórmula
  conteudo_pag4   TEXT,  -- Cotações
  
  score_global    INTEGER,
  preco_sipi      DECIMAL(10,2),
  preco_cipi      DECIMAL(10,2),
  
  pdf_url         VARCHAR,  -- URL do PDF gerado armazenado
  
  created_at      TIMESTAMP,
  created_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMP
)

-- COTAÇÕES DE MP/EMBALAGEM (alimentação manual)
cotacoes_pendentes (
  id              SERIAL PRIMARY KEY,
  mp_id           INTEGER REFERENCES materias_primas(id),
  fornecedor      VARCHAR NOT NULL,
  quantidade      DECIMAL(10,2),
  unidade         VARCHAR,  -- kg, L, un
  valor           DECIMAL(10,2),
  prazo_entrega   VARCHAR,
  validade_cotacao DATE,
  observacoes     TEXT,
  status          ENUM ('aguardando', 'validada_pd', 'validada_compras', 'rejeitada'),
  created_at      TIMESTAMP,
  created_by      UUID REFERENCES users(id),
  validada_por    UUID REFERENCES users(id),
  validada_em     TIMESTAMP
)

-- AUDITORIA
audit_log (
  id              SERIAL PRIMARY KEY,
  user_id         UUID REFERENCES users(id),
  acao            VARCHAR,
  entidade        VARCHAR,
  entidade_id     VARCHAR,
  detalhes        JSONB,
  created_at      TIMESTAMP
)
```

---

## 4. Telas do sistema

### 4.1 Login (`/login`)
- Email + senha
- Admin cria usuários manualmente (não há cadastro público)

### 4.2 Dashboard (`/dashboard`)
- Cards de KPIs: orçamentos do mês, aprovados, em produção, ticket médio
- Últimos 10 orçamentos
- Gráfico de evolução mensal
- Alertas: MPs com cotação > 12 meses, fórmulas em revisão

### 4.3 Orçamentos (`/orcamentos`)
- Lista com filtros (status, cliente, data, categoria)
- Botão "Novo Orçamento"
- Cada linha: número, cliente, produto, preço, status, ações (ver/editar/duplicar/PDF)

### 4.4 Novo/Editar Orçamento (`/orcamentos/novo`, `/orcamentos/:id`)

Layout com **tabs (abas)**:

**Aba 1 — Briefing comercial:**
- Cliente (autocomplete + criar novo)
- Produto (categoria + nome livre)
- Nível (basic/inter/premium)
- Quantidade, volume, margem alvo
- Budget MP (opcional)
- Produto referência do cliente
- Observações comerciais

**Aba 2 — Configuração técnica:**
- Etapas de produção (checklist)
- Embalagem (select + opções de rótulo/cartucho)
- Ativos solicitados (autocomplete com MPs do banco)
- Fragrância (nível + %)
- NCM
- Cotações externas (textarea)

**Aba 3 — Cálculo (visualização):**
- Após gerar: mostra JSON_CALC interpretado
- Tabela de custos (MP, MO, impostos, margem, preço final)
- Score do termômetro
- Alertas de cotação

**Aba 4 — Laboratório:**
- Fórmula-base escolhida com origem (banco/IA/PD)
- Tabela de ingredientes editável
- Botão "Sugerir alternativas" (consulta IA)
- Salvar como nova fórmula no banco

**Aba 5 — Compras:**
- Lista de MPs com status de cotação
- Alertas de urgência
- Botão "Solicitar cotação" → cria entrada em `cotacoes_pendentes`

**Aba 6 — PDF e envio:**
- Preview das 4 páginas
- Botão "Gerar PDF" (server-side)
- Botão "Marcar como enviado"

### 4.5 Fórmulas (`/formulas`)
- Lista de fórmulas do banco
- Filtros: categoria, origem, status, cliente
- Tabs:
  - **Validadas (banco original)** — 814 fórmulas
  - **Geradas por IA** — sugestões do agente
  - **Em desenvolvimento P&D**
- Cada fórmula: ver, editar, duplicar, arquivar

### 4.6 Detalhe da fórmula (`/formulas/:id`)
- Header com origem, status, cliente
- Tabela completa de composição
- Preço total da fórmula (calculado em tempo real com preços atuais das MPs)
- Histórico de versões
- Botão "Usar em orçamento"

### 4.7 Matérias-primas (`/materias-primas`)
- Lista com filtros (fornecedor, faixa de preço, status de cotação)
- Coluna de score de validade da cotação
- Filtro: cotações > 12 meses (urgentes)
- Botão "Nova MP" / "Importar cotação"

### 4.8 Detalhe de MP (`/materias-primas/:codigo`)
- Dados principais editáveis
- Histórico de preços (gráfico)
- Fornecedores alternativos
- Fórmulas que usam esta MP
- Botão "Atualizar cotação"

### 4.9 Cotações pendentes (`/cotacoes`)
- Lista de cotações aguardando validação
- Fluxo: criada → validada P&D → validada Compras → integrada ao banco
- Cada cotação: MP, fornecedor, qtd, valor, prazo, status, ações

### 4.10 Clientes (`/clientes`)
- CRUD básico
- Histórico de orçamentos por cliente

### 4.11 Chat IA (`/chat`)
- Conversa livre com o agente sobre o KB
- Contexto persistente por sessão
- Pode citar fórmulas (#id) e MPs (código)

### 4.12 Admin (`/admin`) — apenas role admin
- Gestão de usuários
- Logs de auditoria
- Configurações do sistema (parâmetros de custo: MO, impostos, etc)

---

## 5. Endpoints da API (NestJS)

### Auth
```
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
```

### Users (admin)
```
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id
```

### Clientes
```
GET    /api/clientes
POST   /api/clientes
GET    /api/clientes/:id
PATCH  /api/clientes/:id
DELETE /api/clientes/:id
```

### Matérias-primas
```
GET    /api/mps?q=&fornecedor=&page=
GET    /api/mps/:codigo
POST   /api/mps
PATCH  /api/mps/:codigo
GET    /api/mps/:codigo/historico    # histórico de preços
GET    /api/mps/:codigo/formulas     # fórmulas que usam
```

### Fórmulas
```
GET    /api/formulas?categoria=&origem=&page=
POST   /api/formulas
GET    /api/formulas/:id
PATCH  /api/formulas/:id
DELETE /api/formulas/:id
GET    /api/formulas/buscar?q=        # busca fuzzy
POST   /api/formulas/sugerir-similar  # IA sugere similares
```

### Orçamentos
```
GET    /api/orcamentos?status=&cliente=&page=
POST   /api/orcamentos                # rascunho
GET    /api/orcamentos/:id
PATCH  /api/orcamentos/:id

POST   /api/orcamentos/:id/calcular   # Fase 1 (cálculo único)
POST   /api/orcamentos/:id/formatar   # Fase 2 (4 páginas)
POST   /api/orcamentos/:id/pdf        # gera PDF

POST   /api/orcamentos/:id/duplicar
POST   /api/orcamentos/:id/aprovar
POST   /api/orcamentos/:id/arquivar
```

### Cotações
```
GET    /api/cotacoes?status=
POST   /api/cotacoes
PATCH  /api/cotacoes/:id/validar-pd
PATCH  /api/cotacoes/:id/validar-compras
PATCH  /api/cotacoes/:id/rejeitar
```

### Chat
```
POST   /api/chat                      # mensagem livre
POST   /api/chat/buscar-kb            # busca inteligente no KB
```

### Dashboard
```
GET    /api/dashboard/kpis
GET    /api/dashboard/recentes
GET    /api/dashboard/alertas
```

---

## 6. Fluxo crítico: geração de orçamento (refinado)

```
USUÁRIO PREENCHE BRIEFING + CONFIG
         │
         ▼
  POST /orcamentos (cria rascunho)
         │
         ▼
  POST /orcamentos/:id/calcular  ◄── FASE 1
         │  ├── busca fórmulas candidatas (Postgres)
         │  ├── busca MPs com preços atuais (Postgres)
         │  ├── monta prompt enxuto (apenas dados relevantes)
         │  ├── chama Anthropic API
         │  ├── extrai JSON_CALC
         │  └── salva em orcamentos.calculo
         │
         ▼
  POST /orcamentos/:id/formatar  ◄── FASE 2
         │  ├── 4 chamadas paralelas à API
         │  ├── cada uma com JSON_CALC + contexto específico
         │  ├── retorna conteúdo das 4 páginas
         │  └── salva em conteudo_pag1..4
         │
         ▼
  Usuário revisa nas abas (cálculo/lab/compras)
  Pode editar fórmula, adicionar cotação, etc.
         │
         ▼
  POST /orcamentos/:id/pdf       ◄── PDF SERVER-SIDE
         │  ├── Puppeteer renderiza HTML em PDF
         │  ├── Layout fixo, 4 páginas A4 exatas
         │  ├── Logo, score, fórmula-base
         │  └── Salva arquivo, retorna URL
         │
         ▼
  Download / Envio ao cliente
```

---

## 7. Roles e permissões

| Role | Pode ver | Pode editar | Notas |
|------|---------|-------------|-------|
| **admin** | tudo | tudo + usuários + parâmetros | dono |
| **comercial** | orçamentos, clientes, fórmulas | orçamentos próprios + clientes | aba comercial |
| **pd** | fórmulas, MPs, orçamentos | fórmulas + validar cotações | aba laboratório |
| **compras** | MPs, cotações, fornecedores | cotações + cadastro de fornecedores | aba compras |
| **producao** | orçamentos aprovados + dados PCP | apenas leitura + ajustes PCP | aba industrial |

Implementação via **CASL.js** ou **NestJS Guards** + decorators.

---

## 8. Geração de PDF — solução definitiva

**Problema atual:** `window.print()` gera 8-9 páginas físicas em vez de 4.

**Solução:**
- **Puppeteer no backend** (NestJS) renderiza HTML em PDF com controle total
- Layout A4 fixo com `page-break-after: always` controlado por CSS
- Cada página tem altura máxima fixa em mm
- Tabelas que estourariam são truncadas com "ver detalhes no anexo"
- 4 páginas garantidas

**Vantagens:**
- Funciona em qualquer navegador (download direto)
- Layout consistente sempre
- PDF armazenado e versionado
- Pode ser enviado por e-mail diretamente

---

## 9. Integrações futuras (preparar interfaces)

### 9.1 OMIE (fase 2)
- App Key + Secret armazenados em `.env` no backend
- Job diário sincroniza preços de MP via NF de compra
- Atualiza `materias_primas.preco_kg_brl` + `data_cotacao`

### 9.2 IAPP (fase 3)
- Sincronização de ordens de produção
- Status de produção aparece no orçamento aprovado

### 9.3 CRM (fase 3)
- Webhook quando orçamento é enviado
- Status do funil de vendas

---

## 10. Importação inicial do banco

**Script único de migração** que lê o `kb.json` atual e popula:
- `materias_primas` (1.162 registros)
- `formulas` + `formula_composicao` (814 fórmulas)
- Cria usuário admin inicial (Gabriel)
- Define parâmetros padrão de custo (MO R$75k, impostos, etc)

Script idempotente — pode rodar múltiplas vezes sem duplicar.

---

## 11. Configurações do sistema (editáveis pelo admin)

Tabela `system_config` com:
- `mo_folha_mensal` (default 75000)
- `mo_dias_uteis` (default 20)
- `mo_colaboradores` (default 11)
- `imposto_mp_pct` (default 37.5)
- `imposto_mo_pct` (default 9.25)
- `ipi_pct` (default 4.55)
- `desvio_mp_pct` (default 10)
- `frete_un_brl` (default 0.10)
- `produtividade_etapas` (JSON com regras)

Mudanças aqui afetam novos cálculos.

---

## 12. Identidade visual

- **Logo:** PNG transparente (já temos)
- **Cores principais:** Dourado #B8832A · Preto #1C1712 · Areia #FAF7F2
- **Tipografia:** Playfair Display (títulos) · DM Sans (corpo)
- **Componentes:** shadcn/ui customizado com essas cores

---

## 13. O que NÃO entra na v9 (escopo claro)

❌ Scraping UL Prospector (registrado para fase 3)  
❌ Integração OMIE completa (estrutura preparada, mas sincronização vem depois)  
❌ App mobile  
❌ Multi-tenant (apenas Private por enquanto, mas modelo de dados já suporta)  
❌ Notificações push/email automáticas  
❌ Editor de fórmulas com drag-and-drop visual  

---

## 14. Métricas de sucesso

- ✅ Sistema rodando em `agente.privatecosmeticos.com.br`
- ✅ 5-8 usuários internos cadastrados e usando
- ✅ Importação completa dos 814 fórmulas + 1.162 MPs
- ✅ Tempo de geração de orçamento < 60s
- ✅ PDF com exatamente 4 páginas A4
- ✅ Histórico persistente compartilhado
- ✅ Custo mensal total < R$ 200

---

**FIM DO DOCUMENTO 2**
