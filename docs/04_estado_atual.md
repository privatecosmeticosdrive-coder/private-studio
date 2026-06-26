# Estado Atual — Private Studio v9

**Data:** 2026-06-26
**Nota:** Este documento reflete o **código real** (não o plano). Atualizar a cada marco.

---

## 1. Núcleo pronto (backend + frontend ligados)

- **Login / Auth** — JWT, guards de role; tela `login`.
- **Admin** — abas Usuários, Configurações (`system-config`) e Alertas (`alertas`).
- **Clientes** — CRUD (`clientes`).
- **Matérias-primas** — lista/busca/filtros (`materias-primas`).
- **Embalagens** — CRUD (`embalagens`).
- **Fórmulas** — lista, detalhe e nova-versão (`formulas`).
- **Orçamentos** — lista, wizard de 4 etapas (Briefing/Fórmula/Embalagem/Cálculo) e detalhe (`orcamentos`).
- **Match de fórmulas** — usado na etapa de match do wizard (`match-formulas`).
- **PDF** — geração da proposta via pdfmake (deploy-safe, sem Puppeteer).
- **Deploy** — Railway (single service: backend NestJS serve o build do frontend via ServeStaticModule). PostgreSQL hospedado na KingHost. Ver `DEPLOY.md`.

## 2. Gaps — backend pronto, frontend faltando

- **Amostras:** backend completo (máquina de estados do pipeline: solicitar → iniciar → pronta → enviar → feedback; Kanban em `GET /amostras/pipeline`). **Frontend = placeholder** (`/amostras`, "Dia 11").
- **Cotações:** backend completo (validar-pd → validar-compras → integrar; `integrar` aplica o preço real na MP). **Frontend = placeholder** (`/cotacoes`, "Dia 11").
- **Auditoria:** módulo `audit/` no backend, **sem tela** (aba prevista no Dia 13, nunca criada).

## 3. Incompleto

- **Dashboard:** stub (tela de boas-vindas, sem KPIs/gráficos/últimos orçamentos).

## 4. Em andamento — Matriz de Custo

*(trabalho posterior ao plano de 15 dias; não constava no roadmap original)*

**Pronto:**
- **F1–F3.5 (backend):** módulo `matriz-custo`, guard de acesso (`AcessoCustoGuard` + `pode_ver_custos`), config operacional/fiscal, NCM (CRUD + seed), valores fiscais provisórios, override de NCM por orçamento, backfill de `ncm_id` por token e `formulas.ncm_revisado`.
- **F5 Bloco A (frontend):** tela `matriz-custo` — gate de acesso, 2 forms (Operacional/Fiscal), derivados read-only, ajuste de layout do campo. Commit `7112c50`.
- **F5 Parte 3 (backend + frontend):** banner de `fiscais_provisorios` + regra "só admin altera" (gate por campo, role do banco). Commits `8ba5b22` (backend) + `9c02735` (frontend).

**Falta:**
- **F5 Blocos B/C/D:** (C inclui revisão manual de NCM; D inclui gating do menu).
- **F4 engine:** ponto único de verdade do cálculo de custo (unificar com o derivado da tela). **Depende de validação do contador.**
- **Preço estimado na ficha da fórmula** (ideia): expor um "preço estimado" (não só custo de MP/kg) direto na tela de detalhe da fórmula, sem abrir o wizard. **Depende da F4** — é consumidora do engine de preço (custo MP + MO + embalagem + impostos + margem). Hoje a tela já mostra custo de MP/kg (`GET /formulas/:id/custo`); falta o preço completo, que só existe no fluxo de orçamento. Quando a F4 existir: endpoint `GET /formulas/:id/preco` reusando o engine + card "Preço estimado" na tela. **Não** construir um cálculo paralelo (recriaria a dívida do `custo_minuto` duplicado).
- **F6 limpeza:** remoção de provisórios/dados de transição. **Destrutivo** — só após F4 validada.

## 5. Roadmap original (referência)

O plano de 15 dias original está em **`docs/03_plano_implementacao.md`**. Os marcadores **"Dia N"** espalhados no código (`Placeholder dia=...`, comentários) são **referências congeladas** a esse plano antigo — não refletem o estado atual nem incluem a Matriz de Custo.

## 6. Dívidas conhecidas

- **F4 = reconciliar dois modelos de MO (não "deduplicar"):** o engine de orçamento (`custo-engine.ts`) e a Matriz usam filosofias DIFERENTES de custo de mão de obra, lendo campos diferentes da mesma `system_config`:
  - Engine atual: `mo_folha_mensal ÷ mo_dias_uteis`, distribuído por produtividade do lote (`un_min × 480`, com 8h cravado no código).
  - Matriz: `custo_fixo_mensal ÷ minutos_produtivos` (usa `horas_dia` + `eficiencia_linha`).
  - Os dois dão números potencialmente DIFERENTES. Qual reflete o custo real da Private é decisão de NEGÓCIO (Gabriel + contador), não técnica. O engine não usa `custo_minuto` hoje.
- **Estratégia F4 (paralelo, nunca troca às cegas):** (1) util de parâmetros canônico [não toca preço]; (2) rodar os dois modelos de MO lado a lado em orçamentos reais e COMPARAR os preços, atrás de flag [não troca o vigente]; (3) imposto granular (ICMS+PIS/COFINS+NCM) validado contra os flats atuais; (4) cortar pro modelo novo só quando Gabriel aprovar a diferença. Gate: preço novo == preço velho OU divergência explicada e aprovada.
- **Hardcode a corrigir:** o "480" (8h) cravado no engine não lê `horas_dia` da config.
- **541 fórmulas sem NCM:** caem no fallback do híbrido; revisão manual na **F5 Bloco C**.
- **Gating do menu Matriz por `pode_ver_custos`:** pendente no **Bloco D**.
