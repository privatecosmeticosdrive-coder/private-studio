# Documento 2b — Addendum: Laboratório Vivo + Gestão de Preços

**Atualização do Doc 2 — Spec do Sistema Novo (v9)**
**Versão:** 2.0 · **Data:** 09/06/2026

> Este documento COMPLEMENTA o `02_sistema_novo.md`. Tudo aqui descrito SUBSTITUI ou ADICIONA ao que está no doc original. Quando houver conflito, este vence.
>
> Duas grandes features:
> 1. **Laboratório Vivo de Fórmulas** — fluxo "buscar → editar → versionar → validar → orçar"
> 2. **Gestão de Preços de MP** — atualização rápida + histórico + alertas

---

# PARTE A — LABORATÓRIO VIVO DE FÓRMULAS

## A1. Visão geral

O sistema agora trata **fórmula** como entidade central do laboratório (independente de orçamento). O fluxo passa a ser:

```
BUSCAR FÓRMULA NO BANCO → EDITAR (vivo) → SALVAR VERSÃO → VALIDAR → ORÇAR
```

Antes: o orçamento "puxava" uma fórmula da IA toda vez. Agora: você consulta o banco, ajusta, salva, e só então gera orçamento — economizando tokens, evitando reinvenção e dando controle ao laboratório.

## A2. Conceito: Fórmula-Mãe + Versões

Toda fórmula é uma **família**:

```
Sérum PDRN Premium (fórmula-mãe id=42)
├── v1.0  Original do banco       [validada]
├── v1.1  Ajuste pH 4.5           [validada]
├── v2.0  Sem niacinamida         [validada]
└── v2.1  PDRN 0,8% (cliente X)   [rascunho]
```

Regras: versionamento livre (texto), versão nasce derivada de outra (exceto v1.0 da mãe), `diff` automático vs anterior em JSONB.

## A3. Status (3 estados)

| Status | Editar? | Orçar? |
|--------|---------|--------|
| `rascunho` | sim | sim, com aviso |
| `validada` | nao (cria nova versao) | sim |
| `arquivada` | nao | nao |

**Regra crítica:** fórmula validada NÃO se edita — cria-se nova versão a partir dela.

## A4. Permissão para validar

Roles `admin` e `pd` (configurável no Admin). Registro obrigatório: quem, quando, observações.

## A5. Diff só auditoria

Em `diff_vs_anterior JSONB`:
```json
{
  "alteracoes": [{"mp":"PDRN","de":1.5,"para":0.8,"tipo":"concentracao"}],
  "custo_anterior_kg": 145.20,
  "custo_novo_kg": 132.40,
  "delta_pct": -8.8
}
```

## A6. Orçar em rascunho (sim, com aviso)

Sistema avisa, PDF marca como "preliminar", salva `formula_status_momento` no orcamento.

## A7. Schema — alterações em `formulas`

```sql
formulas (
  -- IDENTIFICAÇÃO (existente)
  id, nome_produto, categoria, cliente_id,
  
  -- VERSIONAMENTO (NOVO)
  formula_mae_id      INTEGER REFERENCES formulas(id),
  versao_codigo       VARCHAR NOT NULL,
  versao_descricao    VARCHAR,
  derivada_de_id      INTEGER REFERENCES formulas(id),
  
  -- STATUS
  status              VARCHAR NOT NULL DEFAULT 'rascunho',
  origem              VARCHAR NOT NULL,
  
  -- AUDITORIA (parcialmente nova)
  validada_em         TIMESTAMP,
  validada_por        UUID REFERENCES users(id),
  validacao_obs       TEXT,
  diff_vs_anterior    JSONB
)

CREATE INDEX idx_formula_mae ON formulas(formula_mae_id);
CREATE INDEX idx_formula_status ON formulas(status);
CREATE INDEX idx_formula_busca ON formulas USING gin(to_tsvector('portuguese', nome_produto));
```

## A8. Snapshot em `orcamentos`

```sql
orcamentos (
  ...
  formula_id                  INTEGER REFERENCES formulas(id),
  formula_versao_codigo       VARCHAR,
  formula_status_momento      VARCHAR,
  formula_composicao_snapshot JSONB
)
```

Por que snapshot: orçamento antigo continua refletindo o que foi cotado na época.

## A9. Tela `/laboratorio`

Hub com lista de fórmulas-mãe (uma linha por família). Filtros: categoria, cliente, status. Busca semântica via tsvector.

## A10. Editor vivo

Tela de detalhe da versão (`/laboratorio/:maeId/v/:formulaId`):
- Tabela inline editável (fase, MP, %, fornecedor, R$/kg, R$/un)
- Custo recalcula em tempo real (debounced 500ms)
- Adicionar/remover MP via autocomplete
- Avisos automáticos (soma ≠ 100%, pH, incompatibilidades)
- Botões: [Salvar] [Validar] [Duplicar nova versão] [Usar em orçamento]

## A11. Fluxo refinado

```
[Buscar Fórmula] → escolhe v2.0 → ajusta → sistema cria v2.1 (rascunho)
  → edita → salva → [opcional: validar] → [Usar em orçamento]
  → briefing pré-preenchido → Fase 1 → Fase 2 → PDF
```

## A12. IA muda de papel

- **Encontrar:** busca semântica + ranking IA top 3
- **Ajustar:** propõe modificação na composição
- **Criar:** modo formulador mestre (do zero, quando nada similar no banco)

Cada modo é endpoint separado. "Criar" é o mais caro em tokens.

## A13. Promoção das 814 fórmulas existentes

Script `promote-formulas-to-maes.ts`:

1. Agrupa por `nome_produto + cliente_id` (normalizado)
2. Por família, ordena por `data_criacao` ASC
3. A mais antiga vira mãe (`formula_mae_id = NULL`, `versao_codigo = '1.0'`)
4. As outras: versões (`'1.1'`, `'1.2'`, ...)
5. Todas: `status = 'validada'`, `origem = 'banco_original'`
6. `derivada_de_id` = anterior cronologicamente

Esperado: ~250-400 mães a partir das 814 fórmulas.

---

# PARTE B — GESTÃO DE PREÇOS DE MP

## B1. Dois caminhos paralelos

| | 🟢 Atualização Direta | 🟡 Cotação Formal |
|---|---|---|
| Velocidade | 30s | dias |
| Quem | TODOS autenticados | apenas compras/admin |
| Quando | dia a dia | cotação formal |
| Score após | 98 | 98 |

Ambos usam a mesma `materias_primas` final + sempre criam histórico.

## B2. Atualização Direta — fluxo

Modal acionado pelo botão "Atualizar Preço" na tela de detalhe da MP:

```
Atual: R$ 1,85/kg (Mapric, há 47d)
Novo:  R$ [____1,50___] /kg
Fornecedor: [Mapric ▼]
Data: [09/06/2026]
Fonte: [ligacao ▼]
  - ligacao
  - email
  - whatsapp
  - pedido_formal
  - painel_fornecedor
  - ultima_compra (OMIE/IAPP)
  - outro
Observação: [opcional______________]

[Cancelar]  [Salvar e zerar score]
```

Ao salvar:
1. Cria registro em `mp_historico_precos` (sempre)
2. Atualiza `materias_primas` (preco_anterior, preco_atual, data_cotacao=hoje, aumento_pct)
3. Cria `audit_log`
4. Se variação ≥ threshold: dispara alerta in-app

## B3. Permissão: TODOS roles autenticados (decisão D)

Velocidade > controle. Rastreio obrigatório compensa: cada atualização tem autor, fonte, data, observação. Sem restrição artificial.

## B4. Histórico sempre (decisão A)

Toda mudança gera linha em `mp_historico_precos`. Custo trivial. Rastreabilidade total.

## B5. Nova tabela `mp_historico_precos`

```sql
mp_historico_precos (
  id              SERIAL PRIMARY KEY,
  mp_id           INTEGER REFERENCES materias_primas(id) ON DELETE CASCADE,
  
  preco_kg_brl    DECIMAL(10,2) NOT NULL,
  preco_anterior_kg DECIMAL(10,2),
  variacao_pct    DECIMAL(6,2),
  
  fornecedor      VARCHAR NOT NULL,
  data_cotacao    DATE NOT NULL,
  
  origem          VARCHAR NOT NULL,
                  -- 'import_inicial' | 'atualizacao_rapida' | 'cotacao_validada'
                  -- | 'integracao_omie' | 'integracao_iapp'
  
  fonte_info      VARCHAR,
                  -- 'ligacao' | 'email' | 'whatsapp' | 'pedido_formal'
                  -- | 'painel_fornecedor' | 'ultima_compra' | 'outro'
  
  observacoes     TEXT,
  registrado_por  UUID REFERENCES users(id),
  registrado_em   TIMESTAMP DEFAULT NOW()
)

CREATE INDEX idx_hist_mp ON mp_historico_precos(mp_id);
CREATE INDEX idx_hist_data ON mp_historico_precos(data_cotacao DESC);
```

## B6. Alertas configuráveis (decisão C)

Em `system_config`:
```sql
ALTER TABLE system_config ADD COLUMN alerta_aumento_mp_pct DECIMAL(5,2) DEFAULT 20.0;
ALTER TABLE system_config ADD COLUMN alertas_ativos BOOLEAN DEFAULT true;
```

Comportamento: quando variação ≥ threshold:
1. Notificação in-app para `comercial`, `pd`, `admin`:
   "Glicerina subiu 35% (R$1,85 → R$2,50). Esta MP está em 47 fórmulas."
2. Marca `materias_primas.flag_aumento_relevante = true`
3. Dashboard mostra contador
4. Admin configura threshold + on/off

Nova tabela `alertas`:
```sql
alertas (
  id              SERIAL PRIMARY KEY,
  tipo            VARCHAR NOT NULL,  -- 'aumento_mp', futuro: 'cotacao_vencendo', etc
  titulo          VARCHAR NOT NULL,
  mensagem        TEXT,
  entidade_tipo   VARCHAR,           -- 'mp', 'formula', etc
  entidade_id     INTEGER,
  severidade      VARCHAR DEFAULT 'info',  -- info | warn | critical
  lido_por        JSONB DEFAULT '[]',  -- array de user_ids que leram
  resolvido       BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW(),
  created_for     VARCHAR[]          -- array de roles que devem ver
)

CREATE INDEX idx_alerta_resolvido ON alertas(resolvido, created_at DESC);
```

## B7. Histórico visual (timeline)

Na tela `/materias-primas/:codigo`:

```
Glicerina · MP#234
Score: 98 (atualizado há 0 dias)

[Atualizar Preço]  [Ver fórmulas que usam (47)]

Histórico:
●  R$ 1,50/kg  Mapric        09/06/2026  Gabriel (ligação)
●  R$ 1,85/kg  Mapric        23/04/2026  Eduardo (cotação formal)
●  R$ 1,72/kg  Importação    11/01/2026  Sistema
```

Gráfico de linha opcional (Recharts).

## B8. Fonte "ultima_compra" — preparação para OMIE/IAPP (decisão 4)

Fonte `ultima_compra` significa: preço extraído de compra real. Manualmente agora, automático no futuro.

**Plano para fase 3 (não entra v9):**
```
Job CRON semanal (a cada 7 dias):
1. Conecta API OMIE/IAPP
2. Lê notas de entrada da semana
3. Para cada MP com NF nova:
   - Calcula preço unitário (valor_total / quantidade)
   - Compara com preco_kg_brl atual
   - Se diferença > 5%: cria entrada em mp_historico_precos
     com origem='integracao_omie' ou 'integracao_iapp'
   - Atualiza materias_primas
4. Gera relatório semanal: "X MPs atualizadas automaticamente"
5. Marca campo system_config.ultima_sync_erp
```

Schema já suporta. UI: botão "Sincronizar com ERP" aparece quando integração ativar.

## B9. Endpoints

```
# Atualização rápida (TODOS roles autenticados)
POST   /api/mps/:codigo/atualizar-preco
  body: { preco_kg_brl, fornecedor, data_cotacao, fonte_info, observacoes }
  
# Histórico
GET    /api/mps/:codigo/historico
GET    /api/mps/:codigo/historico/grafico

# Cotações formais (apenas compras/admin) — JÁ EXISTIA
POST   /api/cotacoes
PATCH  /api/cotacoes/:id/validar-pd
PATCH  /api/cotacoes/:id/validar-compras
PATCH  /api/cotacoes/:id/integrar

# Alertas
GET    /api/alertas?lido=false
PATCH  /api/alertas/:id/marcar-lido
PATCH  /api/alertas/:id/resolver

# Configuração (admin)
PATCH  /api/system-config
  body: { alerta_aumento_mp_pct, alertas_ativos }
```

## B10. Baseline de histórico das 1.162 MPs

Script `baseline-historico-precos.ts`:

Para cada MP existente, cria registro inicial:
- `preco_kg_brl` = preço atual
- `data_cotacao` = data_cotacao da MP
- `origem` = `'import_inicial'`
- `fornecedor` = fornecedor principal
- `registrado_por` = admin

Resultado: 1.162 entradas baseline.

---

# PARTE C — IMPACTO NO CRONOGRAMA

**Dia 2 (concluído ✅) → agora vamos ESTENDER:**
- Adicionar campos novos em `formulas`, `orcamentos`, `system_config`
- Criar tabelas `mp_historico_precos` e `alertas`
- Migration ALTER TABLE (não refazer init)
- Rodar promoção 814 → mães+versões
- Rodar baseline histórico 1.162 MPs

**Dia 3:** auth + users (sem mudança)

**Dia 4:** CRUD MPs + endpoint `atualizar-preco` + histórico + alertas

**Dia 5:** Fórmulas com versionamento + modos da IA

**Dia 10-11:** Frontend laboratório + editor vivo + modal "Atualizar Preço" + timeline

---

# PARTE D — O QUE NÃO ENTRA NA V9

❌ Editor drag-and-drop
❌ Diff visual lado a lado
❌ Versionamento Git-style
❌ Atualização de preço em lote (paste planilha) — fase 2
❌ Integração OMIE/IAPP automática — fase 3 (schema preparado)
❌ Notificações por e-mail — apenas in-app

---

**FIM DO DOCUMENTO 2b**

> Quando colar no Claude Code, peça para ele:
>
> 1. Reler o Doc 2 original + este 2b
> 2. Atualizar o schema Prisma com TODOS os campos novos:
>    - `formulas`: formula_mae_id, derivada_de_id, versao_descricao, origem, validada_em, validada_por, validacao_obs, diff_vs_anterior
>    - `orcamentos`: formula_versao_codigo, formula_status_momento, formula_composicao_snapshot
>    - NOVA tabela `mp_historico_precos`
>    - NOVA tabela `alertas`
>    - `system_config`: alerta_aumento_mp_pct, alertas_ativos
>    - `materias_primas`: flag_aumento_relevante
> 3. Gerar UMA migration adicional (ALTER TABLE — não refazer a inicial)
> 4. Aplicar no Postgres KingHost
> 5. Rodar script de "promoção" das 814 fórmulas para mães + versões
> 6. Rodar script de "baseline" do histórico (1.162 entradas import_inicial)
> 7. Mostrar estatísticas finais
> 8. SÓ DEPOIS partir para o Dia 3 (auth + users)
