# Estado Atual — Private Studio v9

**Data:** 2026-07-04
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

- **Dashboard:** COMPLETO (commit `5565c1f`) — endpoint `/orcamentos/stats` + camada de dados + página com 4 cards (recentes, volume, status, pendentes). Aprovado em smoke visual.

## 4. Em andamento — Matriz de Custo

*(trabalho posterior ao plano de 15 dias; não constava no roadmap original)*

**Pronto:**
- **F1–F3.5 (backend):** módulo `matriz-custo`, guard de acesso (`AcessoCustoGuard` + `pode_ver_custos`), config operacional/fiscal, NCM (CRUD + seed), valores fiscais provisórios, override de NCM por orçamento, backfill de `ncm_id` por token e `formulas.ncm_revisado`.
- **F5 Bloco A (frontend):** tela `matriz-custo` — gate de acesso, 2 forms (Operacional/Fiscal), derivados read-only, ajuste de layout do campo. Commit `7112c50`.
- **F5 Parte 3 (backend + frontend):** banner de `fiscais_provisorios` + regra "só admin altera" (gate por campo, role do banco). Commits `8ba5b22` (backend) + `9c02735` (frontend).
- **F5 Bloco B (CRUD de NCM, frontend):** tela `ncm` — lista, criar/editar/excluir (soft-delete) + reativar, toggle "incluir inativos", badge "provisório". Reusa endpoints NCM da F1. Commit `dc57d83`.
- **F5 Bloco C (revisão fórmula→NCM):** schema aditivo `ncm_revisado_em`/`_por` (migration aplicada no produção — `8a3cf2f`); backend `GET /formulas/pendentes-ncm` + `PATCH /formulas/:id/revisar-ncm` (confirma/troca + carimbo in-row, guard de NCM inativo — `39197a2`); frontend tela `revisao-ncm` (fila das 274 pendentes, confirmar/trocar via seletor de NCM ativo, menu gated `admin/pd` — `2f48b04`). **Fronteira validada em runtime:** revisar o NCM NÃO altera orçamento já calculado (preço congelado no snapshot + engine lê IPI global, não o NCM da fórmula).

- **F5 Bloco D (gating + NCM no orçamento):** D1 — flag `custos?` no `NavItem` esconde Matriz e NCM de quem não tem `pode_ver_custos` (ou admin), commit `59f8fd8`. D2 — NCM editável no orçamento: campo read-only no Briefing (efetivo + origem) + botão "Editar NCM" gated, modal com Select de NCMs ativos (setar override) e "usar o NCM da fórmula" (limpa via `ncm_id: null`), commit `a5284d6`. Backend já aceitava o override (F3); **null-clear validado em runtime** (reversível, sem lixo).

> **F5 planejada COMPLETA** — Blocos A, Parte 3, B, C e D entregues. O que resta da Matriz (F4/F6) depende de negócio/contador, não de código.

**Falta:**
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
- **F4 — etapa futura: modelo de MO de 3 componentes + auditoria do histórico financeiro.** A análise do passo 2 (comparador, rodado sobre os orçamentos reais + simulação paramétrica de quantidade) revelou que a divergência grande entre os modelos (−8% a −50%) é ARTEFATO do `ceil` de dia inteiro em lotes pequenos — toda a base real hoje é sub-lote de 1 dia. A diferença ESTRUTURAL real entre vigente e Matriz, com o desperdício do `ceil` diluído (lotes grandes), é ~4,7% e estável (os modelos convergem e até invertem: Matriz fica levemente mais caro em escala). Conclusão de NEGÓCIO: o alvo não é escolher vigente vs Matriz, e sim um modelo de 3 partes — (a) **MP** direto; (b) taxa de **SETUP** por ordem (setup real medido ≈ 1h/troca de SKU, fixa por pedido — protege o lote pequeno sem a régua grosseira do `ceil`); (c) taxa de **CORRIDA** proporcional ao tempo real, calculada sobre **capacidade NORMAL** (não plena), pra embutir a sazonalidade (Private tem meses ociosos). Validação pendente: cruzar com o histórico financeiro real (faturamento/mês, custo fixo, volume) via o agente financeiro, pra medir onde a precificação atual peca (super ou subfaturamento) e a margem orçada vs realizada. **Esta etapa é posterior** à entrega da Matriz funcionando.
- **Hardcode a corrigir:** o "480" (8h) cravado no engine não lê `horas_dia` da config.
- **541 fórmulas sem NCM (atribuição do zero):** o Bloco C cobriu só as **274 COM NCM derivado** (confirmar/trocar). As 541 sem `ncm_id` precisam de ATRIBUIÇÃO (escolher NCM, não confirmar) — ficou como **fase separada**, ainda pendente.
- **Revisão de NCM ainda não tem "dentes" no preço:** o engine de orçamento lê o `ipi_pct` da `system_config` (global), NÃO o NCM da fórmula (`carregarFormula` nem inclui a relação `ncm`). Por isso revisar/trocar NCM hoje é só classificação/auditoria — não muda preço. Quando a **F4** ligar NCM→IPI (Opção A, `resolverNcmEfetivo` no consumo — util já existe, falta chamar no engine), a revisão passa a influenciar **recálculos futuros** (nunca resultados já congelados).

### PENDÊNCIAS NO RADAR (não feitas — por prioridade)

*Lista consolidada para retomar sem perder contexto (algumas detalhadas acima).*

- **F4 passo 3:** imposto granular (ICMS + PIS/COFINS + NCM) validado contra os flats atuais.
- **F4 passo 4:** corte do engine pro modelo novo — **DEPENDE do contador + decisão de modelo**.
- **F4 etapa futura:** modelo de MO de 3 componentes (MP + setup/ordem + corrida s/ capacidade normal) + auditoria do histórico financeiro (detalhada acima).
- **F6:** remover `system_config` antiga + campos legados/provisórios — **destrutivo, por último**, só após F4 validada.
- **Golden files de regressão de preço (EM ANDAMENTO):** suite que congela o comportamento atual do engine de preço, pré-requisito do corte da F4 (gate "preço novo == preço velho OU divergência explicada").
- **273 associações fórmula→NCM restantes** a revisar na fila (`revisao-ncm`) — a 280 "Shampoo Organika" foi revisada no smoke test desta sessão.
- **541 fórmulas sem NCM:** atribuição do zero (escolher NCM) — fase separada do Bloco C.
- **Guard de inativo do `revisar-ncm`:** código revisado + branch "não existe" testada (400); caminho "NCM inativo" NÃO exercitado em runtime (0 inativos no banco). Testar quando houver um.
- **Hardening opcional do modal de troca:** travar o botão quando o NCM selecionado não está entre os ativos (1 linha) — hoje depende do 400 do backend.
- **🔐 AÇÃO DE SEGURANÇA (Gabriel):** ROTACIONAR A SENHA DO ADMIN — usada várias vezes nos testes desta sessão. Trocar o quanto antes.
