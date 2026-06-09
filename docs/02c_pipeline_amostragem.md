# Documento 2c — Addendum: Pipeline de Amostragem + Hooks p/ CRM/ClickUp

**Atualização do Doc 2 — Sistema Novo (v9)** · **Data:** 09/06/2026

> Complementa `02_sistema_novo.md` e `02b_laboratorio_vivo.md`. Quando houver conflito, este vence.
>
> Foco: fluxo de amostragem entre Comercial e Laboratório após aprovação do cliente, com schema preparado para integração futura com ClickUp e CRM.

---

## 1. Decisões registradas (Gabriel)

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | Status do pipeline | **B** — Detalhado (6 estados) |
| 2 | Quem solicita amostra | **B** — Comercial clica manualmente |
| 3 | Quem vê o pipeline | **C** — Todos os autenticados |
| 4 | "Aprovado cliente" → amostra automática? | **B** — Dois passos manuais distintos |
| 5 | Campo `requer_amostra`? | **A** — Sim, configurável por orçamento |

---

## 2. Status do pipeline de amostragem

```
[ nao_solicitada ] → [ solicitada ] → [ em_producao ] → [ pronta ]
                                                          ↓
                                                     [ enviada ]
                                                          ↓
                                          ┌───────────────┴───────────────┐
                                          ↓                               ↓
                                [ aprovada_cliente ]            [ rejeitada ]
```

**Significados:**
- `nao_solicitada` — default; orçamento ainda não pediu amostra
- `solicitada` — comercial clicou "Solicitar amostra"; entrou na fila do lab
- `em_producao` — lab começou a produzir
- `pronta` — amostra pronta para envio
- `enviada` — amostra despachada ao cliente
- `aprovada_cliente` — cliente aprovou; pode seguir para produção real
- `rejeitada` — cliente rejeitou; orçamento volta para revisão

## 3. Status do orçamento (revisado)

```
rascunho → aprovado_interno → enviado → aprovado_cliente → em_amostragem → em_producao → concluido
                                              ↓
                                           rejeitado
                                              ↓
                                          arquivado
```

**Importante:** `aprovado_cliente` e amostragem são **independentes**. Comercial pode ter um cliente que aprova direto pra produção (sem amostra) — daí pula `em_amostragem`.

## 4. Campo `requer_amostra` (decisão 5)

No orçamento, campo booleano `requer_amostra`:
- Default: `true` (a maioria dos casos da Private)
- Pode ser desligado no briefing comercial pelo próprio comercial
- Se `false`: botão "Solicitar amostra" fica oculto; orçamento aprovado pode ir direto pra produção

## 5. Modelo de dados — alterações

### 5.1 `orcamentos` — campos novos

```sql
ALTER TABLE orcamentos ADD COLUMN requer_amostra BOOLEAN DEFAULT true;

ALTER TABLE orcamentos ADD COLUMN amostra_status VARCHAR DEFAULT 'nao_solicitada';
-- Valores: nao_solicitada | solicitada | em_producao | pronta | enviada
--        | aprovada_cliente | rejeitada

ALTER TABLE orcamentos ADD COLUMN amostra_solicitada_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_solicitada_por UUID REFERENCES users(id);

ALTER TABLE orcamentos ADD COLUMN amostra_producao_iniciada_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_responsavel_id UUID REFERENCES users(id);
-- usuário do laboratório responsável pela produção

ALTER TABLE orcamentos ADD COLUMN amostra_pronta_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_enviada_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_retorno_em TIMESTAMP;

ALTER TABLE orcamentos ADD COLUMN amostra_qtd INTEGER;
-- Quantos frascos/unidades para amostragem (ex: 3 a 10)

ALTER TABLE orcamentos ADD COLUMN amostra_observacoes_lab TEXT;
ALTER TABLE orcamentos ADD COLUMN amostra_feedback_cliente TEXT;

-- HOOKS para integrações futuras (NULL na v9)
ALTER TABLE orcamentos ADD COLUMN clickup_task_id VARCHAR;
ALTER TABLE orcamentos ADD COLUMN crm_deal_id VARCHAR;

CREATE INDEX idx_orcamentos_amostra_status ON orcamentos(amostra_status)
  WHERE amostra_status != 'nao_solicitada';
CREATE INDEX idx_orcamentos_responsavel ON orcamentos(amostra_responsavel_id);
```

### 5.2 Nova tabela `amostra_eventos` — auditoria do pipeline

Para registrar cada mudança de status, com timestamp e autor:

```sql
CREATE TABLE amostra_eventos (
  id              SERIAL PRIMARY KEY,
  orcamento_id    UUID REFERENCES orcamentos(id) ON DELETE CASCADE,
  status_anterior VARCHAR,
  status_novo     VARCHAR NOT NULL,
  observacao      TEXT,
  registrado_por  UUID REFERENCES users(id),
  registrado_em   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_amostra_eventos_orc ON amostra_eventos(orcamento_id);
CREATE INDEX idx_amostra_eventos_data ON amostra_eventos(registrado_em DESC);
```

### 5.3 Nova tabela `integration_events` — fila p/ integrações futuras

Eventos que **serão** disparados quando integração ClickUp/CRM ativar:

```sql
CREATE TABLE integration_events (
  id              SERIAL PRIMARY KEY,
  tipo            VARCHAR NOT NULL,
  -- amostra_solicitada | amostra_pronta | amostra_enviada
  -- orcamento_aprovado_cliente | orcamento_rejeitado_cliente
  
  entidade_tipo   VARCHAR NOT NULL,  -- 'orcamento'
  entidade_id     VARCHAR NOT NULL,
  payload         JSONB NOT NULL,
  
  -- Status de processamento por integração
  clickup_status  VARCHAR DEFAULT 'pending',
  -- pending | sent | error | skipped
  clickup_response JSONB,
  clickup_processado_em TIMESTAMP,
  
  crm_status      VARCHAR DEFAULT 'pending',
  crm_response    JSONB,
  crm_processado_em TIMESTAMP,
  
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integration_pending ON integration_events(clickup_status, crm_status)
  WHERE clickup_status = 'pending' OR crm_status = 'pending';
```

Na v9, os eventos **são criados** mas nenhum processador roda — ficam acumulando para quando a integração for ativada. Quando ativar, um job CRON processa o backlog.

## 6. Endpoints novos

### 6.1 Pipeline de amostragem

```
# Comercial — solicita amostra
POST /api/orcamentos/:id/amostra/solicitar
  body: { qtd: 5, observacoes?: 'amostrar com cor laranja' }
  permissão: comercial, admin
  pré-requisito: orcamento.status='aprovado_cliente' && requer_amostra=true
  efeito:
    - amostra_status = 'solicitada'
    - amostra_solicitada_em = now()
    - amostra_solicitada_por = currentUser.id
    - cria amostra_eventos
    - cria integration_events (tipo='amostra_solicitada')

# Lab — assume responsabilidade e inicia produção
POST /api/orcamentos/:id/amostra/iniciar
  body: { observacoes?: '...' }
  permissão: pd, admin
  pré-requisito: amostra_status='solicitada'
  efeito:
    - amostra_status = 'em_producao'
    - amostra_responsavel_id = currentUser.id
    - amostra_producao_iniciada_em = now()

# Lab — marca como pronta
POST /api/orcamentos/:id/amostra/pronta
  body: { observacoes?: '...' }
  permissão: pd, admin
  pré-requisito: amostra_status='em_producao'
  efeito:
    - amostra_status = 'pronta'
    - amostra_pronta_em = now()
    - cria integration_events (tipo='amostra_pronta')

# Comercial — marca como enviada
POST /api/orcamentos/:id/amostra/enviar
  body: { observacoes?: 'enviada via Correios cód XYZ' }
  permissão: comercial, admin
  pré-requisito: amostra_status='pronta'
  efeito:
    - amostra_status = 'enviada'
    - amostra_enviada_em = now()

# Comercial — registra retorno do cliente
POST /api/orcamentos/:id/amostra/feedback
  body: { aprovada: true|false, feedback: '...' }
  permissão: comercial, admin
  pré-requisito: amostra_status='enviada'
  efeito:
    - amostra_status = 'aprovada_cliente' OU 'rejeitada'
    - amostra_retorno_em = now()
    - amostra_feedback_cliente = body.feedback

# Listar pipeline (kanban)
GET /api/amostras/pipeline
  query: ?responsavel_id=&cliente_id=
  permissão: qualquer autenticado
  retorna: grupos por status com orçamentos correspondentes

# Histórico de eventos de um orçamento
GET /api/orcamentos/:id/amostra/eventos
  permissão: qualquer autenticado
```

### 6.2 Fluxo de aprovação do cliente (separado)

```
POST /api/orcamentos/:id/marcar-aprovado-cliente
  body: { observacoes?: '...' }
  permissão: comercial, admin
  efeito:
    - status = 'aprovado_cliente'
    - cria integration_events (tipo='orcamento_aprovado_cliente')
    
    Se requer_amostra=true:
      mensagem na resposta: 'Próximo passo: solicitar amostra ao laboratório'
    Se requer_amostra=false:
      mensagem: 'Pronto para produção'

POST /api/orcamentos/:id/marcar-rejeitado-cliente
  body: { motivo: '...' }
  permissão: comercial, admin
  efeito:
    - status = 'rejeitado'
    - cria integration_events (tipo='orcamento_rejeitado_cliente')
```

## 7. Tela `/amostras` — Pipeline (kanban)

```
┌─ Pipeline de Amostras ──────────────────────────────────────────────────┐
│ Filtros: [Todos] [Minhas] [Cliente: ▼] [Responsável Lab: ▼]            │
├──────────────────────────────────────────────────────────────────────────┤
│ SOLICITADAS (3)  │ EM PRODUÇÃO (2) │ PRONTAS (1)    │ ENVIADAS (4)     │
│ ────────────────│ ────────────────│ ────────────────│ ────────────────  │
│ #245 PDRN Beleza│ #243 Stick FPS  │ #240 Argão     │ #238 Niacina X   │
│  Cliente X      │  Resp: Eduardo  │  Resp: Marcos  │  Cliente Y       │
│  há 2 dias      │  há 1 dia       │  há 4 horas    │  enviada ontem   │
│  [Iniciar →]    │  [Marcar pronta]│  [Enviar →]    │  [Feedback →]    │
└──────────────────────────────────────────────────────────────────────────┘
```

Cada card mostra orçamento + cliente + tempo no estado + ação contextual (botão muda conforme o status).

Cards clicáveis abrem detalhe do orçamento na aba "Amostragem".

## 8. Tab "Amostragem" no detalhe do orçamento

Nova aba quando `requer_amostra=true`:

```
┌─ Amostragem ─────────────────────────────────────────────────────────────┐
│ Status: [Em produção]                Iniciada: 08/06 às 14h32           │
│ Responsável Lab: Eduardo Santos                                          │
│                                                                          │
│ Quantidade de amostras: 5 frascos                                       │
│                                                                          │
│ Timeline:                                                                │
│  ● 07/06 16:20  Solicitada por Gabriel "Cor laranja vibrante"          │
│  ● 08/06 09:15  Eduardo assumiu                                         │
│  ● 08/06 14:32  Produção iniciada                                       │
│                                                                          │
│ Observações do Lab: [_______________________________________]           │
│ [Marcar como Pronta]  [Voltar para Solicitada]                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Botões mudam conforme status e role do usuário.

## 9. Integration events — como funciona na v9 e depois

### Na v9 (apenas registro)

Toda transição relevante cria registro em `integration_events`:

```typescript
// Exemplo: comercial solicita amostra
await prisma.amostraEvento.create({...});
await prisma.integrationEvent.create({
  data: {
    tipo: 'amostra_solicitada',
    entidade_tipo: 'orcamento',
    entidade_id: orc.id,
    payload: {
      orcamento_numero: orc.numero,
      produto: orc.produto,
      cliente: orc.cliente.nome,
      qtd_amostras: body.qtd,
      observacoes: body.observacoes,
      responsavel_solicitacao: currentUser.nome,
      data_limite_sugerida: addDays(new Date(), 5).toISOString()
    }
  }
});
```

Esses registros ficam no banco em `clickup_status='pending'` e `crm_status='pending'`. Nenhum processador roda — só acumula.

### Na fase 2 (quando integração ativar)

Um job CRON a cada 5 minutos:
1. Busca `integration_events` com `clickup_status='pending'`
2. Para cada um: chama API ClickUp criando task na lista configurada
3. Marca `clickup_status='sent'` + grava `clickup_response`
4. Em caso de erro: `clickup_status='error'` + retry com backoff
5. Mesma lógica para CRM

**Benefício:** quando integração for ligada, o backlog histórico é processado automaticamente. E se ClickUp/CRM cair, os eventos não se perdem.

## 10. Configuração das integrações futuras

Em `system_config` (campos a adicionar mais tarde, não na v9):

```sql
-- Adicionado quando integração for ativada (fase 2)
ALTER TABLE system_config ADD COLUMN clickup_ativo BOOLEAN DEFAULT false;
ALTER TABLE system_config ADD COLUMN clickup_api_token VARCHAR;
ALTER TABLE system_config ADD COLUMN clickup_lista_id VARCHAR;
ALTER TABLE system_config ADD COLUMN clickup_workspace_id VARCHAR;

ALTER TABLE system_config ADD COLUMN crm_ativo BOOLEAN DEFAULT false;
ALTER TABLE system_config ADD COLUMN crm_tipo VARCHAR;  -- 'hubspot', 'pipedrive', 'rdstation'
ALTER TABLE system_config ADD COLUMN crm_api_token VARCHAR;
ALTER TABLE system_config ADD COLUMN crm_pipeline_id VARCHAR;
```

Tela admin terá seção "Integrações" com formulário para preencher esses campos (mascarado pois são segredos).

## 11. Impacto no cronograma

**Dia 4 (concluído ✅)** — sem mudança

**Dia 5 (Fórmulas)** — sem mudança

**Dia 6 (Orçamentos Fase 1):**
- 🔄 Adicionar: campos `requer_amostra` e `amostra_*` na criação
- 🔄 Status do orçamento revisado (rascunho → aprovado_interno → enviado → aprovado_cliente → ...)

**Dia 7 (Orçamentos Fase 2 + módulo amostras):**
- 🔄 Adicionar: endpoints de pipeline (solicitar, iniciar, pronta, enviar, feedback)
- 🔄 Adicionar: tabelas `amostra_eventos` e `integration_events`
- 🔄 Adicionar: endpoint `GET /api/amostras/pipeline`

**Dia 10-11 (Frontend):**
- 🔄 Adicionar: aba "Amostragem" no detalhe do orçamento
- 🔄 Adicionar: tela `/amostras` (kanban)

**Sem atraso no cronograma de 15 dias** — todas essas adições encaixam dentro dos dias previstos.

## 12. O que NÃO entra na v9

❌ Integração real com ClickUp (API + webhooks)
❌ Integração real com CRM
❌ Sincronização bidirecional
❌ Notificações push/email automáticas
❌ Tela de configuração de integrações (vem na fase 2 com o conector)

✅ **Toda a base está pronta** — quando integrar (fase 2), só precisa escrever os conectores e o job CRON que processa `integration_events`. Schema, eventos, fluxo interno já estão prontos.

## 13. Migration adicional

Uma migration `add_amostragem.sql`:

```sql
-- 1. Campos em orcamentos
ALTER TABLE orcamentos ADD COLUMN requer_amostra BOOLEAN DEFAULT true;
ALTER TABLE orcamentos ADD COLUMN amostra_status VARCHAR DEFAULT 'nao_solicitada';
ALTER TABLE orcamentos ADD COLUMN amostra_solicitada_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_solicitada_por UUID REFERENCES users(id);
ALTER TABLE orcamentos ADD COLUMN amostra_producao_iniciada_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_responsavel_id UUID REFERENCES users(id);
ALTER TABLE orcamentos ADD COLUMN amostra_pronta_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_enviada_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_retorno_em TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN amostra_qtd INTEGER;
ALTER TABLE orcamentos ADD COLUMN amostra_observacoes_lab TEXT;
ALTER TABLE orcamentos ADD COLUMN amostra_feedback_cliente TEXT;
ALTER TABLE orcamentos ADD COLUMN clickup_task_id VARCHAR;
ALTER TABLE orcamentos ADD COLUMN crm_deal_id VARCHAR;

-- 2. Índices
CREATE INDEX idx_orcamentos_amostra_status ON orcamentos(amostra_status)
  WHERE amostra_status != 'nao_solicitada';
CREATE INDEX idx_orcamentos_responsavel ON orcamentos(amostra_responsavel_id);

-- 3. Tabela de eventos do pipeline
CREATE TABLE amostra_eventos (...);

-- 4. Tabela de fila de integração
CREATE TABLE integration_events (...);
```

---

**FIM DO DOCUMENTO 2c**

> Para colar no Claude Code (após Dia 5, antes de Dia 6):
>
> 1. Reler Docs 2, 2b, 2c
> 2. Atualizar schema com campos de amostragem em `orcamentos`
> 3. Criar tabelas `amostra_eventos` e `integration_events`
> 4. Gerar migration adicional ALTER TABLE
> 5. Aplicar no Postgres KingHost
> 6. Atualizar enum/validador de `status` do orçamento (incluir 'aprovado_interno', 'aprovado_cliente', 'em_amostragem')
> 7. Não implementar endpoints ainda — só schema (endpoints entram no Dia 7)
