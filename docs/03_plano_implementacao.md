# Documento 3 — Plano de Implementação (15 dias)
**Private Cosméticos · Migração v8 → v9 (Private Studio)**

> Cronograma detalhado para construir o sistema novo em 15 dias com Claude Code, com checkpoints diários.

---

## Premissas

- ✅ Stack confirmada: NestJS + React + PostgreSQL na KingHost
- ✅ Custo total adicional: R$ 80-180/mês
- ✅ Claude Code instalado no Windows
- ✅ Gabriel disponível ~2h/dia para validações e testes
- ✅ Sistema atual (v8) continua rodando durante a migração — só desliga no dia 15

---

## Fase 1 — Preparação (Dias 1-2)

### Dia 1 — Setup do ambiente

**Manhã:**
- [ ] Ativar SSH no painel KingHost
- [ ] Contratar plano Node.js III (R$27/mês)
- [ ] Criar banco PostgreSQL 13 no painel
- [ ] Anotar credenciais (host, user, senha, banco)
- [ ] Criar subdomínio `agente.privatecosmeticos.com.br`

**Tarde:**
- [ ] Criar repositório GitHub novo: `private-studio`
- [ ] Estrutura monorepo: `/backend` (NestJS) e `/frontend` (Vite React)
- [ ] Claude Code: gerar scaffold do backend NestJS
- [ ] Conectar PostgreSQL via Prisma
- [ ] Primeiro commit

**Entregável dia 1:**
- Backend NestJS rodando localmente
- Conexão ao PostgreSQL da KingHost OK
- Repo no GitHub
- Subdomínio configurado

### Dia 2 — Modelo de dados + migrations

**Manhã:**
- [ ] Schema Prisma completo (todas as tabelas do Doc 2 seção 3)
- [ ] Migrations: criar todas as tabelas
- [ ] Script de seed: usuário admin inicial + parâmetros do sistema

**Tarde:**
- [ ] Script de importação do `kb.json`
- [ ] Rodar importação: validar 1.162 MPs + 814 fórmulas no Postgres
- [ ] Verificar joins MP↔fórmula (taxa de match)

**Entregável dia 2:**
- Banco com schema completo
- 1.162 MPs + 814 fórmulas importadas
- Usuário admin (Gabriel) criado
- Configurações default carregadas

---

## Fase 2 — Backend essencial (Dias 3-7)

### Dia 3 — Auth + Users

- [ ] Módulo de Auth (JWT)
- [ ] POST /api/auth/login + middleware
- [ ] CRUD de usuários (admin only)
- [ ] Guards de role (admin, comercial, pd, compras, producao)
- [ ] Testes Postman/Insomnia

### Dia 4 — Clientes + MPs

- [ ] CRUD Clientes
- [ ] CRUD Matérias-primas (com busca, paginação, filtros)
- [ ] Endpoint histórico de preços
- [ ] Endpoint MPs por fórmula

### Dia 5 — Fórmulas

- [ ] CRUD Fórmulas + composição aninhada
- [ ] Endpoint busca fuzzy por similaridade
- [ ] Cálculo de custo MP em tempo real (com preços atuais)
- [ ] Endpoint sugerir fórmulas similares

### Dia 6 — Orçamentos (Fase 1 - cálculo único)

- [ ] CRUD Orçamentos
- [ ] Endpoint POST /orcamentos/:id/calcular
  - [ ] Busca KB no Postgres (não mais JSON estático)
  - [ ] Monta prompt enxuto (50% menos tokens que v8)
  - [ ] Chama Anthropic API
  - [ ] Extrai e valida JSON_CALC
  - [ ] Salva no banco

### Dia 7 — Orçamentos (Fase 2 - formatação) + Cotações

- [ ] Endpoint POST /orcamentos/:id/formatar
  - [ ] 4 chamadas paralelas
  - [ ] Conteúdo enxuto (sem repetição)
  - [ ] Salva pag1..4 no banco
- [ ] CRUD cotacoes_pendentes
- [ ] Fluxo de validação P&D → Compras
- [ ] **Backend COMPLETO ✅**

**Entregável fase 2:**
- API REST funcional com todos os endpoints
- Auth + roles ativos
- KB no Postgres com queries otimizadas
- Geração de orçamento funcionando (cálculo + formatação)

---

## Fase 3 — Frontend (Dias 8-11)

### Dia 8 — Setup + Login + Layout

- [ ] Vite + React + TypeScript + Tailwind + shadcn/ui
- [ ] Estrutura de rotas (React Router)
- [ ] Tela de login
- [ ] Layout principal (sidebar + header com logo)
- [ ] Tema com cores da Private (dourado/preto/areia)
- [ ] Cliente HTTP (axios + interceptors JWT)

### Dia 9 — Dashboard + Orçamentos (lista)

- [ ] Tela dashboard com KPIs e gráficos básicos
- [ ] Lista de orçamentos com filtros
- [ ] Lista de fórmulas (3 abas)
- [ ] Lista de MPs

### Dia 10 — Formulário de orçamento (6 abas)

- [ ] Tab 1: Briefing comercial
- [ ] Tab 2: Configuração técnica
- [ ] Tab 3: Cálculo (visualização do JSON_CALC)
- [ ] Tab 4: Laboratório (fórmula editável)
- [ ] Tab 5: Compras (cotações)
- [ ] Tab 6: PDF e envio
- [ ] Botões "Calcular" e "Formatar 4 páginas"

### Dia 11 — Detalhes + Edição

- [ ] Tela detalhe de fórmula
- [ ] Tela detalhe de MP (com gráfico de histórico)
- [ ] Edição inline
- [ ] Formulário de nova cotação
- [ ] Chat IA
- [ ] **Frontend COMPLETO ✅**

---

## Fase 4 — PDF + Integrações (Dias 12-13)

### Dia 12 — PDF server-side definitivo

- [ ] Setup Puppeteer no backend
- [ ] Template HTML profissional das 4 páginas
- [ ] Lógica de truncamento (tabelas grandes)
- [ ] Layout A4 garantido (4 páginas exatas)
- [ ] Logo + identidade visual
- [ ] Endpoint POST /orcamentos/:id/pdf
- [ ] Armazenamento do PDF (KingHost FTP)
- [ ] Botão "Baixar PDF" no frontend

### Dia 13 — Polimentos + Telas Admin

- [ ] Tela Admin: gestão de usuários
- [ ] Tela Admin: parâmetros do sistema (MO, impostos)
- [ ] Tela Admin: logs de auditoria
- [ ] Tela Clientes (CRUD)
- [ ] Notificações in-app básicas (toasts)
- [ ] Estados de loading bem feitos
- [ ] Mensagens de erro amigáveis

---

## Fase 5 — Deploy e validação (Dias 14-15)

### Dia 14 — Deploy KingHost

- [ ] Build do frontend (Vite build → dist/)
- [ ] Subir dist/ via FTP ou Git para KingHost
- [ ] Build do backend (NestJS build)
- [ ] Subir backend no plano Node.js III via Git
- [ ] Configurar variáveis de ambiente no KingHost
- [ ] Apontar `agente.privatecosmeticos.com.br` para o backend
- [ ] Configurar SSL (Let's Encrypt via KingHost)
- [ ] Testar tudo em produção

### Dia 15 — Testes finais + treinamento

- [ ] Bateria de testes E2E:
  - [ ] Login com cada role
  - [ ] Criar orçamento completo
  - [ ] Gerar PDF
  - [ ] Editar fórmula
  - [ ] Validar cotação pendente
- [ ] Sessão com equipe Private (treinamento 1h)
- [ ] Documentação de uso (PDF de 5 páginas)
- [ ] Backup inicial do banco
- [ ] **Sistema NO AR ✅**

---

## Checkpoints com Gabriel

Para garantir alinhamento sem retrabalho, validações específicas em:

- **Dia 2:** validar que importação trouxe dados corretos
- **Dia 5:** demo do backend funcionando via Insomnia/Postman
- **Dia 7:** geração de orçamento via API funcionando ponta a ponta
- **Dia 10:** demo do frontend (formulário de orçamento)
- **Dia 12:** validar layout do PDF
- **Dia 14:** sistema em produção, primeira geração real
- **Dia 15:** treinamento da equipe

---

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| KingHost ter limitação no NestJS | Média | Plano B: deploy no Railway (~R$30/mês) |
| 512MB RAM ser pouca | Baixa | Migrar para plano Node.js superior |
| Puppeteer pesado para PDF | Média | Alternativa: PDFKit ou pdfmake |
| Importação do KB falhar | Baixa | Script idempotente + log detalhado |
| Atrasos por bugs complexos | Alta | Buffer de 1-2 dias no cronograma |
| Gabriel sem tempo para validar | Média | Acumular validações em sessões de 2h |

---

## Como usar este plano no Claude Code

### Setup inicial (faça uma vez)

No terminal:

```bash
# Criar pasta do projeto
mkdir C:\Users\TI\private-studio
cd C:\Users\TI\private-studio

# Salvar os 3 documentos aqui
# (copie os arquivos .md gerados para esta pasta)

# Iniciar Claude Code
claude
```

### Comando inicial para o Claude Code

Quando o Claude Code abrir, cole:

```
Leia os 3 documentos na pasta atual:
- 01_sistema_atual.md
- 02_sistema_novo.md  
- 03_plano_implementacao.md

Vamos construir o "Private Studio" seguindo o plano de 15 dias.

Comece pelo Dia 1: setup do ambiente. Antes de gerar qualquer código, 
me confirme o que entendeu e o que vai construir hoje.

Eu sou o Gabriel, dono da Private Cosméticos. Sistema atual em produção 
v8 (Vercel). Vamos para v9 (KingHost).
```

A partir daí, o Claude Code conduz o trabalho dia a dia.

---

## Comunicação durante os 15 dias

**Esta conversa (Claude.ai)** continua viva para:
- Decisões estratégicas que aparecem durante o desenvolvimento
- Refinamento de specs caso surjam dúvidas
- Análise de problemas complexos
- Validação de outputs do Claude Code

**Claude Code (terminal)** é onde o código acontece:
- Geração de arquivos
- Execução de comandos
- Migrations, testes, deploy

Use os dois em paralelo conforme a necessidade.

---

## Sucesso = quando você puder

1. Acessar `agente.privatecosmeticos.com.br`
2. Fazer login com seu usuário admin
3. Criar um orçamento de Stick FPS 50 com cor
4. Receber proposta consistente em 4 páginas
5. Baixar PDF profissional
6. Convidar 7 colegas e cada um logar com seu acesso
7. Ver histórico compartilhado entre todos

---

**FIM DO DOCUMENTO 3**

---

## Notas finais

- **Não é trivial.** 15 dias é apertado. Vai dar trabalho. Mas é factível.
- **Vai ter bugs.** Software novo sempre tem. Tenha paciência nos primeiros dias após o lançamento.
- **Vai melhorar.** O sistema vai evoluir após o dia 15. Esta é a versão 1.0, não a final.
- **OMIE e UL Prospector** ficaram para depois. Não tente fazer tudo de uma vez.

Bora!
