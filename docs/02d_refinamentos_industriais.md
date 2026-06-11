# Documento 2d — Refinamentos Industriais

**Atualização do Doc 2 — Sistema Novo (v9)** · **Data:** 10/06/2026

> Complementa Docs 2, 2b, 2c. Quando houver conflito, este vence.
>
> Cinco refinamentos críticos para o sistema funcionar com rigor industrial.

---

## 1. Decisões registradas (Gabriel)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Chat embutido no sistema | **Removido** — economia de API + simplicidade |
| 2 | Produtividade | **Input direto un/min** (sem inferência fuzzy de etapas) |
| 3 | Embalagem | Catálogo dedicado + input livre + alerta sem cotação |
| 4 | Match de fórmulas | **Híbrido (GIN + filtros)** + botão "Refinar com IA" opcional |
| 5 | Mestre Formulador | Botão pontual + aba dedicada (2 modos) |
| 6 | UL Prospector | **Descartado** — banco Private + fabricantes legítimos |
| 7 | "Mestre Treinado" externo | **Sim** — projeto Claude.ai com knowledge da Private (sem API) |

---

# PARTE A — Produtividade Direta

## A1. O problema atual

Sistema inferia produtividade a partir de "etapas" fuzzy (IA chuta quantas etapas tem). Resultado: shampoo 140ml virou "4un/min" quando o real é 7un/min. Erro de ~75% no custo de MO.

## A2. Nova abordagem — input direto

Campo único no formulário de orçamento:

```
Produtividade estimada por minuto:

Selecione um preset:
 ○ 8 un/min  — Envase simples (frasco + tampa apenas)
 ○ 6 un/min  — Envase + tampa + rótulo
 ○ 4 un/min  — Linha com pump/válvula ou cartucho
 ○ 2 un/min  — Linha complexa (stick FPS, gloss)
 ○ 1 un/min  — Manual / linha premium artesanal

Ou personalizado:
 ● [____] un/min
```

## A3. Cálculo determinístico

```
producao_diaria = un_min × 60 × 8h = un_min × 480
dias_necessarios = ceil(quantidade / producao_diaria)
mo_lote = dias_necessarios × R$ 3.750
mo_un = mo_lote / quantidade
```

**100% determinístico.** Zero IA. Zero gasto de tokens nesse cálculo.

## A4. Impacto no backend (Dia 9)

- Remover do `OrcamentosService.calcular()` toda a lógica de "estimar etapas via IA"
- O endpoint `/calcular` recebe `un_min` do front (obrigatório)
- O `JSON_CALC.mao_de_obra.un_min` agora vem do usuário, não de inferência
- Fase 1 (Anthropic) deixa de ser chamada para esta finalidade — só é chamada para gerar texto (Fase 2)
- **Economia esperada:** ~70% de redução nas chamadas de API

## A5. Migração de orçamentos antigos

Não há orçamentos no banco (tabela vazia). Sem ajuste necessário.

---

# PARTE B — Catálogo de Embalagens

## B1. Por que tela dedicada

Embalagens são um universo separado das MPs (frascos, pumps, tampas, cartuchos, válvulas, celofane, caixas). Compartilham estrutura (preço/un, fornecedor) mas têm campos próprios (volume, cor, material).

## B2. Tabela `embalagens`

```sql
CREATE TABLE embalagens (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR UNIQUE,
  nome            VARCHAR NOT NULL,
  tipo            VARCHAR NOT NULL,   -- 'frasco' | 'pump' | 'tampa' | 'cartucho' | 'valvula' | 'celofane' | 'caixa' | 'rotulo' | 'outro'
  volume_ml       DECIMAL(8,2),       -- relevante para frascos
  material        VARCHAR,            -- 'PET' | 'vidro' | 'PEAD' | 'aluminio' | 'papel'
  cor             VARCHAR,
  preco_un_brl    DECIMAL(8,4),
  fornecedor      VARCHAR,
  prazo_entrega   VARCHAR,
  preco_estimado  BOOLEAN DEFAULT false,  -- TRUE quando valor foi chutado, false quando cotado
  observacoes     TEXT,
  ativo           BOOLEAN DEFAULT true,
  data_cotacao    DATE,
  
  created_at      TIMESTAMP DEFAULT NOW(),
  created_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_embalagens_tipo ON embalagens(tipo);
CREATE INDEX idx_embalagens_volume ON embalagens(volume_ml);
CREATE INDEX idx_embalagens_busca ON embalagens USING gin(to_tsvector('portuguese', nome));
```

## B3. Histórico de preços de embalagens

Mesma estrutura de `mp_historico_precos`, mas para embalagens (tabela `emb_historico_precos`). Comportamento idêntico.

## B4. Fluxo no orçamento (refinado)

```
Embalagem do produto:

 ○ Selecionar do catálogo
    [autocomplete: digite 'frasco 60ml' ou 'pump preta']
    Sugere: "Frasco PET 60ml Âmbar — R$ 1,85/un" (cotação validada)
    
 ○ Adicionar nova:
    Tipo:        [Frasco PET ▼]
    Volume:      [60] mL
    Cor:         [Âmbar ▼]
    Material:    [PET]
    Fornecedor:  [_________]
    Preço/un:    [R$ ____]  (deixe vazio para alerta)
    Prazo:       [_____]
    [✓] Salvar no catálogo para próximos orçamentos
    
 ○ Sem embalagem (apenas a fórmula a granel)
```

**Comportamentos:**

| Cenário | Comportamento |
|---------|---------------|
| Selecionar do catálogo com preço cotado | Usa direto, score normal |
| Selecionar do catálogo com preço estimado | Avisa "preço estimado, pode variar" |
| Adicionar nova com preço informado | Salva (opcional) + usa |
| Adicionar nova SEM preço | ⚠️ Alerta amarelo "Embalagem sem cotação — risco no orçamento". Pede confirmação. Sistema usa R$0 e marca o orçamento como "preliminar" |
| Sem embalagem | Pula etapa. Salva como "Apenas fórmula" |

## B5. Tela `/embalagens` — CRUD dedicado

Estrutura idêntica a `/materias-primas`:
- Lista com filtros (tipo, volume, fornecedor, status de cotação)
- Botão "Nova Embalagem"
- Detalhe: histórico de preços + tela "embalagens que usaram" (orçamentos)
- Permissões: ler = todos autenticados; criar/editar = admin + compras + comercial

## B6. Migração inicial

Sistema começa vazio. Cada orçamento alimenta o catálogo automaticamente quando user marca "Salvar no catálogo".

**Crescimento esperado:** Mês 1 = 10-20 SKUs · Mês 6 = 80-150 · Mês 12 = 200+

---

# PARTE C — Match Inteligente de Fórmulas

## C1. Fluxo refinado de criação de orçamento

```
ETAPA 1 — Briefing mínimo (~30s):
   Nome do projeto:   [___]
   Cliente:           [autocomplete ▼]
   Categoria:         [Sérum facial ▼]
   Nível:             [Premium ▼]
   Volume unitário:   [50 mL]
   Quantidade:        [2.000 un]
   Margem alvo:       [35%]
   Budget MP/un:      [R$ ___] (opcional)
   Briefing técnico:  [textarea livre]
   
   [Próximo →]

ETAPA 2 — Match de fórmulas:
   🔍 Buscamos fórmulas similares no banco
   
   ┌──────────────────────────────────────────────────────────────────┐
   │ Similaridade: 92%       ─── Sérum PDRN Premium                  │
   │ 4 versões · Cat: Sérum facial · Nível: Premium                  │
   │ Custo MP: R$ 152,30/kg · Usada em 5 orçamentos                  │
   │ Ativos principais: PDRN, Niacinamida, Ácido Hialurônico         │
   │ Última versão validada: v2.0 (20/09/2025)                       │
   │ [Ver detalhes]  [Selecionar →]                                  │
   ├──────────────────────────────────────────────────────────────────┤
   │ Similaridade: 87%       ─── Sérum Niacinamida 10%               │
   │ ... outras 4 candidatas                                         │
   └──────────────────────────────────────────────────────────────────┘
   
   [○ Nenhuma serve — criar fórmula do zero]
   [⚡ Refinar com IA (R$ 0,15 por uso)]  ← opcional

ETAPA 3 — Editor Vivo (já definido no Doc 2b):
   Fórmula carregada, editável
   
   [Manter e Gerar Orçamento]  [Ajustar fórmula (cria v.N)]

ETAPA 4 — Configuração comercial:
   Produtividade:  [7 un/min]
   Embalagem:      [Frasco 50ml]
   Aprovação adicional: ...
   
   [Calcular Orçamento →]
```

## C2. Algoritmo de Match Híbrido (gratuito)

```
1. Filtros estritos (SQL WHERE):
   - categoria = briefing.categoria
   - (nivel = briefing.nivel) OR (briefing.nivel = null)
   - status IN ('validada', 'rascunho')
   - custo_mp_kg <= budget_mp × 20  (margem de 20% de tolerância)

2. Score textual (PostgreSQL ts_rank com índice GIN):
   - briefing.briefing_tecnico + briefing.nome_projeto
   - vs. nome_produto + composição + observações
   - Resultado: score 0-1

3. Boost por uso:
   - Fórmulas usadas em N orçamentos: +N% no score
   - Fórmulas validadas recentemente: +10%

4. Retorna top 10 ordenado por score
```

## C3. Botão "Refinar com IA" (opcional, custo controlado)

Para casos onde o match textual não encontrou nada bom:

- Usuário clica "Refinar com IA"
- Sistema envia: briefing completo + top 20 fórmulas (apenas metadados) para Anthropic
- IA reranqueia e justifica top 5 escolhas
- Custo: ~R$0,10-0,15 por uso (só metadados, sem composição completa)
- Mostrado claramente "Esta busca consome créditos API"

## C4. Endpoints

```
POST /api/orcamentos/match-formulas
  body: { categoria, nivel, briefing_tecnico, budget_mp }
  retorna: { candidatas: [...top 10 com score], modo: 'hibrido' }
  custo: zero (SQL + GIN)

POST /api/orcamentos/match-formulas/refinar-ia
  body: { match_id: 'uuid-do-match-anterior' }
  retorna: { top_5_reranqueado: [...], justificativas: [...] }
  custo: ~R$0,10-0,15 por uso
```

---

# PARTE D — Mestre Formulador (2 modos)

## D1. Modo 1 — Botão "Resolver Dor" no Editor Vivo

Dentro do editor de fórmula existente (Doc 2b §A10), adicionar botão:

```
[⚡ Mestre Formulador]
```

Ao clicar, abre modal:

```
┌──────────────────────────────────────────────────────────────────┐
│ Mestre Formulador — resolver dor específica                      │
├──────────────────────────────────────────────────────────────────┤
│ Qual dor você quer resolver nesta fórmula?                       │
│                                                                  │
│ [textarea: ex.: "Cliente quer 90% de ativos naturais para claim"]│
│                                                                  │
│ Considerar:                                                      │
│ [✓] Composição atual desta fórmula                              │
│ [✓] Banco de MPs validadas Private (1.162)                      │
│ [✓] Banco de fórmulas-mãe validadas (735)                       │
│ [ ] Conhecimento técnico geral (não validado, alta criatividade)│
│                                                                  │
│ Custo estimado: ~R$ 0,20                                         │
│                                                                  │
│ [Pedir sugestão]  [Cancelar]                                     │
└──────────────────────────────────────────────────────────────────┘
```

Resposta vem estruturada:

```
┌──────────────────────────────────────────────────────────────────┐
│ Mestre Formulador — sugestão                                     │
├──────────────────────────────────────────────────────────────────┤
│ Análise: "Para atingir 90% naturais, identifiquei 3 ajustes:"   │
│                                                                  │
│ ✏️ Substituir Carbomer (sintético) por Goma Xantana (natural)   │
│    Concentração: 0,3% → 0,4%                                     │
│    Impacto: +R$ 0,02/un | Mantém viscosidade similar             │
│    [✓ Aceitar]  [✗ Rejeitar]                                    │
│                                                                  │
│ ✏️ Trocar PEG-7 por Lecitina Vegetal                            │
│    Concentração: 2,0% → 2,5%                                     │
│    Impacto: -R$ 0,15/un | Função: emulsificante natural          │
│    [✓ Aceitar]  [✗ Rejeitar]                                    │
│                                                                  │
│ ✏️ Adicionar Vitamina E (tocoferol natural)                      │
│    Concentração: 0,5% | Função: antioxidante natural             │
│    [✓ Aceitar]  [✗ Rejeitar]                                    │
│                                                                  │
│ Resultado se aceitar todos: 91% naturais · Custo: +R$ 0,08/un   │
│                                                                  │
│ [Aplicar selecionados]  [Cancelar]                               │
└──────────────────────────────────────────────────────────────────┘
```

Ao aplicar, sistema:
1. Cria nova versão da fórmula (rascunho derivada de atual)
2. Aplica os ajustes aceitos
3. Recalcula custo
4. Registra no diff_vs_anterior

**Custo:** ~R$0,15-0,30 por uso. Frequência baixa.

## D2. Modo 2 — Tela dedicada `/mestre-formulador`

Tela separada do laboratório, para criar fórmulas do zero.

```
┌──────────────────────────────────────────────────────────────────┐
│ Mestre Formulador — criar fórmula nova                           │
├──────────────────────────────────────────────────────────────────┤
│ Categoria do produto:        [Sérum facial ▼]                   │
│ Posicionamento:              [Premium ▼]                        │
│ Objetivo / Claim principal:  [hidratação profunda + antiidade]  │
│ Ativos desejados:            [PDRN, Argireline]                 │
│ Restrições:                  [vegano, sem álcool, pH > 5]       │
│ Inspiração / referência:     [La Mer Concentrate]               │
│ Budget MP/un:                [R$ 8,00]                          │
│ Volume:                      [30 mL]                            │
│ Cliente (opcional):          [Beleza Pura LTDA ▼]              │
│                                                                  │
│ Custo estimado: ~R$ 0,50                                         │
│                                                                  │
│ [Criar fórmula]  [Cancelar]                                      │
└──────────────────────────────────────────────────────────────────┘
```

Resposta:

```
Fórmula proposta:
- Nome sugerido: "Sérum Renovador Profundo Premium"
- Tabela completa de composição (fase, %, função, fornecedor sugerido)
- Custo MP calculado: R$ 7,82/kg ✓ dentro do budget
- Justificativa técnica de cada escolha
- Alertas de estabilidade (se houver)
- Próximos passos sugeridos para o lab validar

[Salvar como rascunho]  [Salvar e abrir no Editor Vivo]  [Descartar]
```

Status inicial: `rascunho`, origem: `ia_gerada`, status do Mestre: `aguardando_validacao_lab`.

## D3. Endpoints

```
POST /api/mestre-formulador/resolver-dor
  body: { formula_id, dor, considerar: {...flags} }
  retorna: { analise, sugestoes: [...], custo_aplicado }

POST /api/mestre-formulador/criar-nova
  body: { categoria, nivel, claim, ativos, restricoes, budget_mp, volume }
  retorna: { formula_sugerida, justificativa, alertas }
```

---

# PARTE E — Projeto Claude.ai "Mestre Treinado" (sem API)

## E1. O que é

Um Projeto criado no Claude.ai (acessível via claude.ai/projects) com:
- Knowledge: base de conhecimento Private (fórmulas + MPs + regras)
- Instructions: define o Mestre como persona
- Modelo: Opus 4.8 ou superior, do seu plano

**Custo:** zero adicional. Funciona via assinatura, sem tocar na API.

## E2. Quando usar

- Fórmulas muito complexas ou ambiciosas
- Pesquisa exploratória ("e se eu fizer uma linha vegana?")
- Brainstorming de novos produtos antes de virar projeto
- Validação cruzada de propostas do Mestre interno (Parte D)

## E3. Arquivos de knowledge a serem gerados (após Dia 9)

Pacote `mestre-treinado-knowledge.zip`:

1. **`formulas-master.md`** — 735 fórmulas-mãe em formato condensado:
   ```
   ## Sérum PDRN Premium (mae_id: 42)
   - Categoria: Sérum facial
   - Versões: 4 (todas validadas)
   - Custo MP atual: R$ 152,30/kg
   - Composição principal (v2.0):
     - Água deionizada 65.2%
     - PDRN 0.8% (Summit, R$6.000/kg)
     - Niacinamida 4% (Chemyunion, R$165/kg)
     - ... (resto)
   - Cliente associado: —
   - Usada em: 5 orçamentos
   ```

2. **`mps-master.md`** — 1.162 MPs:
   ```
   ## PDRN (cod: 1087)
   - Preço atual: R$ 6.000,00/kg
   - Fornecedor principal: Summit
   - Alternativos: —
   - Função técnica: regenerador celular
   - Faixa típica de uso: 0.5-2.0%
   - Compatibilidades: niacinamida, hialurônico
   - Restrições: incompatível com ácidos fortes
   ```

3. **`regras-private.md`** — regras de cálculo e operação:
   - Modelo de custo (impostos, MO, IPI)
   - Faixas de produtividade típicas
   - Categorias e níveis
   - Validações de estabilidade (pH, conservantes, incompatibilidades)

4. **`template-output.md`** — JSON estruturado que o Mestre deve produzir:
   ```json
   {
     "nome_sugerido": "...",
     "categoria": "serum_facial",
     "nivel": "premium",
     "composicao": [
       { "fase": "A", "mp_nome": "...", "concentracao_pct": 65.2, "funcao": "veiculo" }
     ],
     "justificativa": "...",
     "alertas": [...],
     "custo_estimado_kg": 152.30
   }
   ```

5. **`INSTRUÇÕES.md`** — texto para colar nas configurações do Projeto:
   ```
   Você é o Mestre Formulador da Private Cosméticos, indústria de
   terceirização cosmética em Valinhos/SP.
   
   Sua base de conhecimento contém 735 fórmulas validadas e 1.162 MPs
   com preços atuais. Use SEMPRE essas referências antes de propor.
   
   Regras críticas:
   - Soma de concentração = 100%
   - Considere compatibilidades técnicas
   - Considere o custo (cliente sempre tem budget)
   - Considere estabilidade (pH, conservantes)
   - Use preços REAIS da base sempre que possível
   
   Output: sempre JSON estruturado conforme template-output.md
   
   Quando criar fórmula nova:
   1. Analise briefing
   2. Busque fórmulas similares na base
   3. Combine elementos validados
   4. Justifique cada escolha
   5. Liste alertas
   6. Retorne JSON
   ```

## E4. Workflow de uso

```
Gabriel abre claude.ai → Projeto "Mestre Private"
  ↓
Inicia nova conversa: "Quero criar um sérum com 90% naturais
                       para cliente Beleza Pura, budget R$8/un"
  ↓
Mestre analisa knowledge, propõe JSON estruturado
  ↓
Gabriel revisa, refina por chat se quiser
  ↓
Mestre entrega JSON final
  ↓
Gabriel: copia JSON
  ↓
Private Studio → tela "Importar Fórmula" → cola JSON → valida → salva
  ↓
Fórmula entra no banco como rascunho, origem: 'ia_gerada' (Mestre externo)
```

## E5. Endpoint de importação

```
POST /api/formulas/importar-mestre
  body: { json_mestre: {...} }
  retorna: { formula_criada, validacoes_passadas, alertas }
  permissão: admin, pd
```

---

# PARTE F — Impacto no Cronograma

| Dia | O que muda |
|-----|------------|
| 8 (concluído) | Sem alteração |
| **9** | Frontend incorpora: campo `un_min` direto, tela `/embalagens`, fluxo de briefing com match, sem inferência de etapas |
| **9** | Backend: ajusta `/calcular` para receber `un_min`, adiciona schema `embalagens` + `emb_historico_precos`, endpoints de match |
| **10-11** | Tela do Mestre Formulador (modo botão + tela dedicada) |
| **Pós-Dia 9** | Geração do pacote `mestre-treinado-knowledge.zip` |
| **Pós-MVP** | Coleta legítima de fórmulas de fabricantes (BASF, Croda, etc) |

---

# PARTE G — O que NÃO entra na v9

❌ Scraping UL Prospector  
❌ Chat IA embutido no sistema  
❌ Inferência fuzzy de etapas (REMOVIDO)  
❌ Drag-and-drop visual de fórmulas  
❌ Marketplace de fórmulas externas  

---

# PARTE H — Migrations adicionais

```sql
-- 1. Embalagens
CREATE TABLE embalagens (...);
CREATE TABLE emb_historico_precos (...);
CREATE INDEX idx_embalagens_busca ON embalagens USING gin(to_tsvector('portuguese', nome));

-- 2. Orcamentos
ALTER TABLE orcamentos ADD COLUMN embalagem_id INTEGER REFERENCES embalagens(id);
ALTER TABLE orcamentos ADD COLUMN embalagem_snapshot JSONB;  -- nome+preço no momento
ALTER TABLE orcamentos ADD COLUMN un_min DECIMAL(6,2);  -- produtividade informada
ALTER TABLE orcamentos ADD COLUMN sem_embalagem BOOLEAN DEFAULT false;

-- Remove campos não usados (etapas fuzzy)
-- (manter por compatibilidade, mas não usar)

-- 3. Match
CREATE TABLE formula_matches (
  id              SERIAL PRIMARY KEY,
  orcamento_id    UUID,
  query_hash      VARCHAR,
  candidatas      JSONB,  -- top 10 fórmulas com score
  modo            VARCHAR,  -- 'hibrido' | 'ia_refinado'
  created_at      TIMESTAMP DEFAULT NOW()
);
```

---

**FIM DO DOCUMENTO 2d**

> Quando colar no Claude Code (antes do Dia 9):
>
> 1. Reler Docs 2, 2b, 2c, 2d
> 2. Atualizar schema: criar tabelas `embalagens`, `emb_historico_precos`, `formula_matches`
> 3. ALTER `orcamentos` adicionando `embalagem_id`, `embalagem_snapshot`, `un_min`, `sem_embalagem`
> 4. Migration ALTER aplicada
> 5. Backend: remover inferência fuzzy do `OrcamentosService.calcular()` — `un_min` agora é input obrigatório
> 6. Backend: módulos `EmbalagensModule` + `MestreFormuladorModule` + `MatchFormulasModule`
> 7. Frontend (Dia 9): formulário de orçamento refinado conforme Parte C
> 8. Frontend: tela `/embalagens` (CRUD)
> 9. Frontend (Dia 10-11): tela `/mestre-formulador` + botão "Resolver Dor" no editor
> 10. Smoke test cobrindo todos os novos fluxos
