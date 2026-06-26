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

**Falta:**
- **F5 Parte 3:** banner de `fiscais_provisorios` + regra "só admin altera".
- **F5 Blocos B/C/D:** (C inclui revisão manual de NCM; D inclui gating do menu).
- **F4 engine:** ponto único de verdade do cálculo de custo (unificar com o derivado da tela). **Depende de validação do contador.**
- **F6 limpeza:** remoção de provisórios/dados de transição. **Destrutivo** — só após F4 validada.

## 5. Roadmap original (referência)

O plano de 15 dias original está em **`docs/03_plano_implementacao.md`**. Os marcadores **"Dia N"** espalhados no código (`Placeholder dia=...`, comentários) são **referências congeladas** a esse plano antigo — não refletem o estado atual nem incluem a Matriz de Custo.

## 6. Dívidas conhecidas

- **`custo_minuto` duplicado (F3/F4):** hoje calculado na tela só para leitura; na F4 deve virar util compartilhada com o custo-engine (senão tela e cálculo divergem).
- **541 fórmulas sem NCM:** caem no fallback do híbrido; revisão manual na **F5 Bloco C**.
- **Gating do menu Matriz por `pode_ver_custos`:** pendente no **Bloco D**.
