# Estado Atual — Private Studio v9

**Data:** 2026-07-05 (F4 Fase A CORTADA)
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

**Pronto (F4 Fase A CORTADA — 2026-07-05, aprovada no gate técnico + smoke visual do Gabriel):**
- **Engine fiscal granular é o VIGENTE** (commits `0bb9d9d`→`376eb1f` construíram em paralelo; corte em `5713f70`). `gerarCalculo` produz a forma `3.0` (`fiscal_granular`): tributos de saída por `modo_operacao × perfil do cliente × NCM/EX/tratamento × parametro_fiscal vigente`, por dentro do preço, por parcela (material/MO); IPI real por NCM na base do modo. **Os 3 flats (37,5% MP / 9,25% MO / IPI 4,55% global) foram REMOVIDOS** (`calcularCustoPrivate` deletado). NCM efetivo virou OBRIGATÓRIO pra calcular (falha visível 400, regra 6). Comparadores `/comparar-mo` e `/comparar-fiscal` removidos (eram andaime). Banner `fiscais_provisorios` removido + flag `false`. Renderer do resultado **tolera as duas formas**: v1 legado → exibido como histórico com aviso "modelo anterior" (nunca reescreve snapshot — fronteira tese 2); v3 → forma completa (enquadramento, parcelas, fundamentos).
- **Goldens v2** (`custo-engine.golden.spec`): 15 reais + 2 sintéticos (híbrido/industrialização) cobrem os 3 modos; spec reconstrói a matriz + recomputa, tolerância 0. Diff A/B aprovado: ΔA médio +37,9% (perfil típico RPA), dominado por ICMS+PIS/COFINS monofásico que o vigente nunca precificou. Regras de classificação NCM do titular em `docs/fiscal/regras-classificacao-private.md`.
- **Base**: NCM+EX+tratamento+vigência (36 linhas validadas pelo contador); `parametro_fiscal` versionado (CRUD admin); perfil fiscal do cliente; `modo_operacao` no briefing; matriz fiscal pura com fundamentos auditáveis + specs (DANFE Memoire reconstruída).

**Falta:**
- **Preço estimado na ficha da fórmula** (ideia): expor um "preço estimado" (não só custo de MP/kg) direto na tela de detalhe da fórmula, sem abrir o wizard. Agora **destravado pela F4** — consumidora do engine (custo MP + MO + impostos granulares + margem). Endpoint `GET /formulas/:id/preco` reusando `calcularCustoFiscal` + card "Preço estimado". Depende de resolver perfil/modo default (fórmula não tem cliente). **Não** construir cálculo paralelo.
- **F6 limpeza:** remover colunas fiscais legadas da `system_config` (`imposto_mp_pct`/`imposto_mo_pct`/`ipi_pct`, hoje inertes) + `FormFiscal` da Matriz (edita esses campos mortos) + provisórios de transição. **Destrutivo** — por último.

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
- **Atribuição de NCM às fórmulas validadas — 540→194 sem NCM (2026-07-07).** Backfill assistido gravou **346** (`274→620 com NCM`, `revisado=false`) via `backend/prisma/backfill-ncm-formulas-lote.cjs` (commit `89acfba`): regras do titular + candidatas aprovadas + overrides do Gabriel (PET, reclassificados, DEO) + fallback por categoria (cabelos/skincare). Rollback: `backfill-ncm-formulas-lote-rollback-2026-07-07.sql` (untracked). **Resto = 194 manuais sob demanda:** nomes ilegíveis/pessoa (#474 já resolvido→DEO), fórmulas sem categoria, casos onde a categoria "mente" (ex.: "Protetor contra mosca" catalogado como solar), e o **#436**. Todos `revisado=false` → passam pela fila `revisao-ncm` normal.
- **#436 "Multiuso Pet":** ficou de FORA do lote — o NCM proposto `3402.31.00` (cap. 34, surfactante) NÃO existe no cadastro. Decisão do Gabriel: **cadastrar 3402.31.00 com campos fiscais completos (EX/tratamento/vigência/fundamento) em ato próprio, OU reclassificar** se for tratado como cosmético. Pendente.
- **Revisão de NCM ainda não tem "dentes" no preço:** o engine de orçamento lê o `ipi_pct` da `system_config` (global), NÃO o NCM da fórmula (`carregarFormula` nem inclui a relação `ncm`). Por isso revisar/trocar NCM hoje é só classificação/auditoria — não muda preço. Quando a **F4** ligar NCM→IPI (Opção A, `resolverNcmEfetivo` no consumo — util já existe, falta chamar no engine), a revisão passa a influenciar **recálculos futuros** (nunca resultados já congelados).

### PENDÊNCIAS NO RADAR (não feitas — por prioridade)

*Lista consolidada para retomar sem perder contexto (algumas detalhadas acima).*

- **✅ PDF do orçamento migrado pro v3 (2026-07-06, commit `47957c4`):** `pdf.service.ts` reescrito — **2 páginas fixas** (pág. 1 resumo + enquadramento fiscal/parcelas/tributos por dentro/IPI real/fundamentos; pág. 2 formulação + embalagem), acentuação corrigida, **tolera v1 como histórico** (banner "modelo anterior") igual ao renderer da tela, fix do `embalagem_snapshot` (bug #50), rótulo "Custo/kg". Aprovado no smoke visual do Gabriel. *(Entrada anterior "PDF quebrado" era obsoleta — escrita antes do fix.)*
- **✅ FRENTE ESTRUTURAL de NCM — em grande parte RESOLVIDA (2026-07-07):** o backfill assistido atribuiu **346 de 540** (`274→620 com NCM`); restam **194 manuais** sob demanda. Detalhe na dívida "Atribuição de NCM" acima. A saída do wizard (botão Atribuir NCM, `a0ca9d1`) cobre os 194 caso a caso; a Jornada de Laboratório (fórmula nasce com NCM) fecha o fluxo pra frente.
- **✅ Jornada de Laboratório — FATIA 1 ENTREGUE (2026-07-15, commit `d9b9db7`):** fila PÚBLICA (`/laboratorio`, abas Na fila / Concluídas / Todas), pendência (`pendencias_lab`) VINCULADA à fórmula — o **Atender** cria/versiona a fórmula (nascendo com o NCM proposto, D6) e grava `formula_resultado_id`; **Concluir** só a fórmula vinculada e validada (impossível associar outra). Editor de composição com **modo rascunho in-place** (mesma versão; validada é imutável; nova versão só de validada); **save parcial** liberado, faixa 99,5–100,5% exigida só na validação. **Orçamento persiste** como rascunho ao "Solicitar ao Laboratório" (só nesse ponto) + reabre no wizard (`/orcamentos/:id/editar`, "Continuar edição"); ao concluir, o rascunho oferece a fórmula nova em 1 clique. Prazo em **dias úteis** (corte 14h; +2/+7; pula sáb/dom; feriados fora do escopo). Role do lab = `pd`. **Transições de status do orçamento** (rascunho→enviado exige cálculo; enviado→aprovado/recusado; máquina com specs). `aprovado_interno`: só rótulo histórico, não exposto. Fronteira D4 provada (nova versão não altera orçamento fechado).
- **✅ Jornada de Laboratório — FASE 2 ENTREGUE (2026-07-15, commit `e8900f2`):** os 4 gatilhos fechados — (a) `formulacao_nova` (fase 1); (b) **revisão de fórmula selecionada** (qualquer usuário: botão no detalhe da fórmula validada + no wizard etapa 2; **assíncrono** — não trava o orçamento; sem NCM, herda da base); (c) **melhoria proativa** (pd/admin: `POST /pendencias-lab/revisao-proativa` nasce `em_atendimento` com a versão já vinculada, cai direto no editor); (d) reprovado por custo = **fase 3**. Invariantes: revisão exige `formula_base_id` + base validada (rascunho barrada no atender); concluir só a vinculada validada.
- **Próximas FASES da Jornada de Laboratório:** (3) **motivo de reprovação categorizado** (preço/custo, fórmula, prazo, outro + texto) + gatilho automático `custo_formula`→pendência de revisão — as transições de status do orçamento já existem como pré-requisito (hooks comentados em `status-orcamento.util.ts` e `mudar-status.dto.ts`); (4) **indicadores** de prazo/atraso e tempos médios solicitação→conclusão por urgência (D5 já grava todos os timestamps).
- **✅ Busca sem match RESOLVIDA (2026-07-07, commit `8587d3c`):** corte de relevância `rank_textual > 0` no backend separa match real de fallback; sem match → estado vazio honesto ("Nenhuma fórmula corresponde ao briefing") + sugestões por uso SÓ sob clique, rotuladas "sem correspondência ao briefing" com "N usos" no lugar do score (o "14 Crítico" não aparece mais como falsa relevância). Com match: comportamento inalterado.
- **Renomear menu "Cotações" → "Cotações externas"** (desambiguar de Orçamentos). Fatia rápida (label + rota).
- *(Motivo de reprovação: consolidado como **FASE 3 da Jornada de Laboratório** — ver a entrada "Próximas FASES" acima. Desenho completo e mandato de recon prontos em `docs/05_handoff_sessao.md` §B1/§F. Escopo aprovado: marcação + gatilho + filtro, SEM tela analítica.)*
- **MOQ ideal / lote eficiente** *(aprovado pelo conselheiro — fatia pequena de alto valor)*: o `ceil` de dia inteiro encarece lote pequeno (#50: 0,52 dia real → cobra 1 dia = R$1,63/un de excesso). Mostrar no cálculo o "lote ideal" (múltiplo da produção diária, ex.: 1.920) + MO/un nesse lote — venda consultiva (oferecer lote maior). Evolui junto com o modelo de MO de 3 componentes.
- **Edição de fórmula na pré-finalização do orçamento** *(2 justificativas do red team #50)*: (a) ajustar composição sem sair do fluxo do wizard; (b) MP com preço R$0,00 na fórmula (caso real: Blend Isa Santini) — corrigir o preço da MP sem abandonar o orçamento. Hoje o usuário precisa sair, editar em outra tela e voltar.
- **Perfil fiscal dos demais clientes:** só o "Teste Agente" tem perfil preenchido; os demais caem no conservador (sem art.34) até serem preenchidos.
- **Recalcular os 15 de teste pro v3 (opcional):** hoje guardam snapshot v1 e o renderer os exibe como histórico; recalcular é write deliberado em dado fictício — só se o Gabriel quiser vê-los em v3 por padrão.
- **Goldens com orçamentos REAIS:** os 15 v2 são de cliente fictício/full_service — quando houver orçamentos representativos (incl. híbrido/industrialização reais), rodar diff comercial e re-baseline.
- **DIFAL/interestadual:** FORA da Fase A por decisão explícita — matriz cobre SP interno.
- **DELETE de orçamento não existe:** limpeza de smoke foi via prisma com guarda; avaliar endpoint (ou decisão de nunca deletar).
- **F4 etapa futura:** modelo de MO de 3 componentes (MP + setup/ordem + corrida s/ capacidade normal) + auditoria do histórico financeiro (detalhada acima).
- **F6:** remover colunas fiscais legadas da `system_config` + `FormFiscal` inerte da Matriz + campos provisórios — **destrutivo, por último**.
- **622 associações fórmula→NCM a revisar** na fila (`revisao-ncm`) — medido em 2026-07-15. Subiu de 273 porque o backfill em lote (`89acfba`) gravou as 346 atribuições com `ncm_revisado=false` **de propósito**: atribuição automática entra na fila de confirmação humana, não é cravada como revisada.
- **196 fórmulas validadas sem NCM (resto manual, medido em 2026-07-15):** ver a dívida "Atribuição de NCM" — 346/540 já atribuídas em lote assistido; o resto é sob demanda + o #436. *(Era 194 logo após o lote; subiu com fórmulas criadas nos testes de smoke. Meça antes de citar.)*
- **Guard de inativo do `revisar-ncm`:** código revisado + branch "não existe" testada (400); caminho "NCM inativo" NÃO exercitado em runtime (0 inativos no banco). Testar quando houver um.
- **Hardening opcional do modal de troca:** travar o botão quando o NCM selecionado não está entre os ativos (1 linha) — hoje depende do 400 do backend.
- **🔐 AÇÃO DE SEGURANÇA (Gabriel):** ROTACIONAR A SENHA DO ADMIN — usada várias vezes nos testes desta sessão. Trocar o quanto antes.
