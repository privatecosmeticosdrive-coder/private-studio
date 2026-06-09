# Documento 1 — Spec do Sistema Atual (v8)
**Private Cosméticos · Agente de Orçamento**  
**Data:** 09/06/2026 · **Versão atual em produção:** v8

> Este documento descreve o sistema atual exatamente como ele é hoje. Serve como base para a migração — tudo que está aqui PRECISA ser preservado (ou intencionalmente substituído) no sistema novo.

---

## 1. Arquitetura atual

```
┌─────────────────┐         ┌─────────────────┐         ┌──────────────┐
│  Frontend HTML  │ ──────► │  /api/chat      │ ──────► │  Anthropic   │
│  (Vercel CDN)   │         │  (serverless)   │         │  API         │
│  index.html     │         │                 │         │  Sonnet 4.5  │
└─────────────────┘         └─────────────────┘         └──────────────┘
        │                            ▲
        │                            │
        │ ┌──────────────────────────┘
        └─►│  /api/kb (serverless)   │
           │  busca em kb.json       │
           │  814 fórmulas + 1162 MPs│
           └─────────────────────────┘
```

**Hospedagem:** Vercel (gratuito por enquanto), domínio `project-5djp3.vercel.app`.

**Repositório:** GitHub privado `privatecosmeticosdrive-coder/private-agente-orcamento` conectado ao Vercel para deploy automático.

---

## 2. Estrutura de arquivos

```
private-agente/
├── api/
│   ├── chat.js              # endpoint para o Claude
│   ├── kb.js                # busca inteligente no KB
│   └── _data/
│       └── kb.json          # 2,5MB · 814 fórmulas + 1.162 MPs
├── public/
│   ├── index.html           # SPA monolítica (76KB)
│   └── assets/
│       └── logo.png         # logo da Private (43KB)
├── vercel.json
└── package.json
```

---

## 3. Banco de dados (kb.json)

Arquivo JSON estático com schema versionado 1.0:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-05-19T02:50:45",
  "stats": {
    "total_mps": 1162,
    "total_mps_cotadas_2024_plus": 703,
    "total_formulas": 814,
    "total_linhas_composicao": 12038
  },
  "materias_primas": [...1162 objetos...],
  "formulas": [...814 objetos com composicao aninhada...]
}
```

**Origem dos dados:**
- `biblioteca_consolidada.md` — extração de `BIBLIOTECA_TECNICA_*.xlsb` e `MRP*.xlsx`
- `MP_master.md` — preços Ptax atuais com fornecedores

**Atualização:** manual, via re-upload do JSON e push no GitHub.

---

## 4. Schema das entidades

### Matéria-prima (1.162 registros)
```typescript
{
  codigo: number,              // código interno Private (chave única)
  nome: string,                // nome comercial
  preco_kg_brl: number,        // PREÇO ATUAL (Ptax)
  preco_anterior_brl: number,
  aumento_pct: number,
  fornecedor: string,          // fornecedor principal
  fornecedores_alternativos: string[],  // observados em outras fórmulas
  embalagem_minima: string,
  data_cotacao: string,        // YYYY-MM-DD
  validade_cotacao: string,
  n_formulas_uso: number
}
```

### Fórmula (814 registros)
```typescript
{
  id: number,
  nome_produto: string,
  versao_codigo: string,
  cliente: string | null,
  batelada: string,
  data_detectada: string,      // YYYY-MM-DD
  responsavel: string,
  custo_mp_total_brl_kg: number,
  total_ingredientes: number,
  composicao: [
    {
      fase: string,
      materia_prima: string,     // texto, join por nome com MP
      concentracao_pct: number,
      preco_kg_brl_snapshot: number,  // congelado, NÃO USAR como atual
      custo_na_formula: number,
      fornecedor_snapshot: string
    }
  ]
}
```

---

## 5. Fluxo de uso atual

### 5.1 Geração de orçamento (Fase 1 → Fase 2)

1. Usuário preenche formulário (categoria, nível, volume, qtd, ativos, fragrância, embalagem, etapas, budget)
2. **Fase 0:** frontend chama `/api/kb?q=...` para buscar fórmulas similares
3. **Fase 1:** frontend chama `/api/chat` com prompt de cálculo único — IA retorna JSON_CALC com todos os números travados
4. **Fase 2:** frontend dispara 4 chamadas paralelas a `/api/chat` para formatar as 4 páginas (cada uma recebe o calcStr com os números prontos)
5. PDF é gerado client-side via `window.print()` (com problemas — gera 8-9 páginas físicas em vez das 4 lógicas)

### 5.2 Chat livre
Conversa em linguagem natural, com busca automática no KB quando a pergunta menciona fórmula/ativo/preço.

### 5.3 Histórico
20 últimos orçamentos em `localStorage` do navegador (perde ao trocar dispositivo).

---

## 6. Modelo de cálculo de custo (Private)

**Parâmetros fixos:**
- Folha mensal + provisões: **R$ 75.000,00** (11 colaboradores)
- MO diário: R$ 3.750 (R$75.000 / 20 dias úteis)
- Imposto MP: 37,5% (ICMS 25% + PIS 10,3% + COFINS 2,2%)
- Imposto MO: 9,25% (PIS 1,65% + COFINS 7,60%)
- IPI: 4,55% (somente na nota)
- Desvio MP: 10%
- Frete: R$ 0,10/un

**Produtividade por etapas:**
| Etapas | un/min | un/dia |
|--------|--------|--------|
| 2-3 | 6 | 2.880 |
| 4-5 | 4 | 1.920 |
| 6-7 | 2,5 | 1.200 |
| 8+ | 1,5 | 720 |

**Fórmula de preço:**
```
CMP_simp     = MP_base + MP_frag + Desvio10% + Embalagem + R$0,10
CMP_cimp     = CMP_simp × 1,375
MO_lote      = MO_diario × dias_necessarios
MO_un        = MO_lote / qtd
CMO_cimp     = MO_un × 1,0925
CUSTO_TOTAL  = CMP_cimp + CMO_cimp
PRECO_SIPI   = CUSTO_TOTAL / (1 - margem/100)
IPI_un       = PRECO_SIPI × 0,0455
PRECO_CIPI   = PRECO_SIPI + IPI_un
```

---

## 7. Termômetro de assertividade (score 0-100)

Score por matéria-prima baseado em idade da cotação:
- ≤ 3 meses: **98**
- 3-6 meses: **88**
- 6-12 meses: **74**
- > 12 meses: **60**
- MP estimada (sem cotação real): **45-72** conforme % na fórmula

Score do orçamento = média ponderada pelo peso de custo de cada MP.

**Visualização:**
- ≥ 90: Verde (Alta Confiança)
- 75-89: Amarelo (Boa Confiança)
- 60-74: Laranja (Atenção)
- < 60: Vermelho (Baixa Confiança)

**Regra:** nunca bloqueia geração — apenas reduz score.

---

## 8. Categorias de produto suportadas

24 categorias agrupadas em 4 segmentos:

**Hair Care:** shampoo, condicionador, máscara capilar, leave-in, tônico capilar, ampola capilar, óleo capilar, camuflagem

**Skin Care:** sérum facial, hidratante facial, stick/bastão facial, gel clareador, creme facial, sabonete/espuma, gloss labial, protetor solar

**Body Care:** body splash, hidratante corporal, gel redutor, creme íntimo, óleo corporal, esfoliante

**Kids:** shampoo kids, desembaraçador infantil

---

## 9. PDF atual — problemas conhecidos

**O que funciona:**
- 4 páginas lógicas: Comercial, Industrial, Fórmula P&D, Cotações
- Logo da Private no header
- Score colorido no canto superior direito da pág 1
- Badges [VALIDADA] vs [SUGERIDA] na fórmula-base

**O que NÃO funciona (precisa ser resolvido no sistema novo):**
- Gera 8-9 páginas físicas no navegador em vez das 4 lógicas
- Conteúdo redundante entre páginas (rios de tokens)
- Depende de `window.print()` — bloqueado em alguns navegadores corporativos
- Sem controle preciso de layout
- Tabelas estouram em conteúdo grande

---

## 10. O que NÃO existe hoje (gaps)

- ❌ Login / autenticação (qualquer pessoa com a URL acessa)
- ❌ Banco de dados real (apenas JSON estático)
- ❌ Histórico persistente entre dispositivos
- ❌ Interface para editar/criar MPs e fórmulas
- ❌ Integração com OMIE/IAPP
- ❌ Sistema de roles e permissões
- ❌ Logs de auditoria (quem fez o quê e quando)
- ❌ Notificações
- ❌ Multi-usuário simultâneo
- ❌ Backup automático
- ❌ Dashboard de métricas

---

## 11. Custos atuais

| Item | Valor |
|------|-------|
| Vercel | R$ 0 (free tier) |
| GitHub | R$ 0 (private free) |
| Anthropic API | ~R$ 50-100/mês (uso atual) |
| **Total atual** | **~R$ 50-100/mês** |

---

## 12. O que NÃO PODE quebrar no sistema novo

1. **Modelo de cálculo Private** — todas as fórmulas e impostos precisam ser idênticos
2. **MO fixa R$ 75.000/mês com 11 colaboradores** — premissa de negócio
3. **Acesso ao kb.json com 814 fórmulas + 1.162 MPs** — banco de conhecimento atual
4. **Arquitetura Fase 1 (cálculo único) + Fase 2 (formatação)** — resolve o problema de números divergentes
5. **Termômetro de assertividade por idade de cotação** — diferencial do produto
6. **Logo + identidade visual** (dourado #B8832A, preto #1C1712)
7. **Capacidade de gerar orçamento profissional em PDF**
8. **Chat livre com o agente sobre o KB**

---

## 13. Métricas de uso (estimativa)

- Usuários ativos atuais: 1-2 (apenas testes)
- Orçamentos gerados por dia: 2-5 (em teste)
- Tokens Anthropic por orçamento: ~15-25k input + ~8-12k output (alto — precisa otimizar)
- Tempo médio de geração: 30-60s (Fase 1 + 4 chamadas paralelas)

---

**FIM DO DOCUMENTO 1**
