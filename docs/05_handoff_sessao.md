# Handoff de sessão — Private Studio

**Escrito em:** 2026-07-15 · **Para:** um Claude Code que acordou sem memória nenhuma.
**Como usar:** leia `CLAUDE.md` (invariantes) → `docs/04_estado_atual.md` (estado + radar §6) →
este arquivo (o que só existia na conversa anterior). Depois **verifique tudo no disco** antes de agir.

---

## A. ONDE ESTAMOS

**Branch:** `main` (sincronizado com `origin/main`). Deploy: Railway builda automático do `main`.

**Últimos 10 commits** (mais recente primeiro):

| Hash | Assunto |
|---|---|
| `4ea732b` | docs: radar — Jornada de Laboratorio fases 1-2 entregues; restam fases 3 e 4 |
| `e8900f2` | feat(lab): fase 2 — revisao de formula selecionada (assincrona) + melhoria proativa pd/admin |
| `9109c5e` | docs: radar — remove entrada obsoleta do PDF quebrado (v3 entregue em 47957c4) |
| `a52e2e1` | docs: radar — Jornada de Laboratorio fatia 1 ENTREGUE (d9b9db7) + transicoes de status |
| `d9b9db7` | feat(lab): ciclo de vida completo — rascunho in-place, orcamento persiste, transicoes, dropdown, aba Todas, ordem |
| `a07fca6` | docs: radar — busca sem match RESOLVIDA + semente da Jornada |
| `8587d3c` | feat(match): corte de relevancia na busca de formulas + estado vazio honesto |
| `cf0658d` | docs: radar — atribuicao de NCM 540->194 + #436 pendente |
| `89acfba` | chore(ncm): backfill assistido de NCM em 346 formulas validadas |
| `00694d6` | docs: radar red team #50 — motivo de reprovacao, MOQ ideal, edicao na pre-finalizacao |

**Working tree:** limpo de código. **16 arquivos untracked**, todos `backend/prisma/*-rollback-*.sql`.
Isso é **proposital** (invariante 3 do CLAUDE.md): cada migration/backfill aplicado no banco de
PRODUÇÃO gera seu rollback `.sql`, que fica no disco como rede de segurança e **nunca é commitado**.
Não os apague e não os commite.

**Em voo: NADA.** Nenhum arquivo staged, nenhuma fatia a meio. Última fatia (Fase 2 da Jornada)
foi commitada, empurrada e aprovada no smoke visual do Gabriel. Servidores de dev parados.

**Estado dos servidores:** nada rodando. Para smoke: backend `npm run start` em `backend/`
(porta 3000, **sem** `--watch`), frontend `npm run dev` em `frontend/` (porta 5173).

---

## B. DECISÕES TRAVADAS que ainda NÃO viraram código

### B1. Fase 3 da Jornada de Laboratório — motivo de reprovação categorizado

**O QUÊ:** ao reprovar um orçamento (transição `enviado → recusado`, que **já existe**), exigir um
motivo categorizado: `preco_custo` | `formula` | `prazo` | `outro` + texto livre.

**Comportamento por motivo:**
- `preco_custo` → **marcação investigativa** no orçamento (fica registrado que a perda foi por preço).
- `formula` → **cria automaticamente uma pendência de revisão** (`tipo='revisao'`,
  `motivo_origem='reprovado_por_custo'`, `formula_base_id` = a fórmula do orçamento,
  `orcamento_id` = o orçamento reprovado), **com rastreio** da origem.
- `prazo` / `outro` → só registra.

**PORQUÊ (não é capricho):**
- É o **4º gatilho** da Jornada, o único ainda aberto. Os outros 3 já estão em produção.
- Sem motivo categorizado, "perdemos o orçamento" é dado morto. Com ele, vira a matéria-prima da
  tese central do projeto (`docs/00_contexto_estrategico.md`): *quanto custa em cotações perdidas
  um preço 5% acima*. É o elo que fecha o funil LEAD→COTAÇÃO→CONVERSÃO→MARGEM REALIZADA.
- Só na **reprovação**. Aprovado não precisa de motivo — pedir seria fricção sem retorno.

**ESCOPO RECOMENDADO (decisão do conselheiro):** Fase 3 = **marcação + filtro**, **SEM tela
analítica**. Ou seja: campo no banco, obrigatoriedade na transição, gatilho automático, e no
máximo um filtro por motivo na lista de orçamentos. **Análise/gráficos são Fase 4 / Dashboard.**
*Porquê:* misturar captura de dado com análise numa fatia só atrasa a captura — e sem dado
capturado a análise não existe. Captura primeiro, análise depois.

**Hooks já plantados no código** (procure por eles, estão comentados):
- `backend/src/orcamentos/status-orcamento.util.ts` — comentário `[HOOK fase 4 — motivo de reprovação]`
  descrevendo a regra (o comentário diz "fase 4" mas a numeração consolidada é **fase 3**).
- `backend/src/orcamentos/dto/mudar-status.dto.ts` — `[HOOK fase 4]` no ponto onde o motivo entra.

### B2. Fase 4 — indicadores do laboratório
Prazo/atraso e tempos médios solicitação→conclusão **por urgência**. Todos os timestamps já são
gravados (`solicitada_em`, `atendida_em`, `concluida_em`, `prazo_limite`). **Atraso é DERIVADO**
na leitura, nunca coluna — não persista. *Porquê:* atraso muda com o relógio; coluna persistida
mente no dia seguinte.

### B3. Itens do radar com decisão tomada mas sem código
- **#436 "Multiuso Pet"**: ficou fora do backfill de NCM porque `3402.31.00` (cap. 34, surfactante)
  **não existe no cadastro**. Decisão: cadastrar o NCM com campos fiscais completos
  (EX/tratamento/vigência/fundamento) **em ato próprio**, OU reclassificar. *Porquê de não ter
  forçado:* não misturar cadastro fiscal novo com gravação em lote — regra 6 (número fiscal não se chuta).
- **"Cotações" → "Cotações externas"**: renomear o menu para desambiguar de Orçamentos. Fatia rápida.
- **MOQ ideal / lote eficiente**: mostrar no cálculo o lote múltiplo da produção diária e o MO/un
  nesse lote. *Porquê:* o `ceil` de dia inteiro encarece lote pequeno (no #50: 0,52 dia real →
  cobrado 1 dia = R$1,63/un de excesso). Vira ferramenta de venda consultiva.
- **Edição de fórmula na pré-finalização**: 2 justificativas reais — ajustar composição sem sair do
  wizard, e corrigir MP com preço R$0,00 (caso real: "Blend Isa Santini").

---

## C. GOTCHAS DE AMBIENTE (com a causa — não só o sintoma)

| Gotcha | Causa real | O que fazer |
|---|---|---|
| `position: fixed` renderiza **deslocado** do elemento | Um **ancestral com `transform`** cria containing block novo e quebra o `fixed` | Renderizar em **portal no `document.body`** (`createPortal`) + medir com `getBoundingClientRect`. Foi o fix do dropdown de MP em `mp-autocomplete.tsx` |
| Background task retorna **exit 255** | Você matou o processo por PID (`Stop-Process`) | **É ruído, não falha.** Não investigue, não "conserte". Só verifique se o smoke rodou antes |
| Backend com `--watch` no Windows | Instâncias sobrepostas / EADDRINUSE | Sempre `npm run start` (single instance, sem watch) |
| Código novo não aparece no smoke | **Instância zumbi na 3000** servindo build velho (EADDRINUSE silencioso) | **Matar por PID ANTES de subir** (`Get-NetTCPConnection -LocalPort 3000` → `Stop-Process`). Já causou um diagnóstico falso |
| Commit multi-linha duplica blocos | Bug observado com heredoc/printf | Commits de **UMA linha** com `-m` |
| `tsc --noEmit` na raiz do front dá **falso verde** | `files: []` no tsconfig raiz — é NO-OP | Front: `npx tsc -p tsconfig.app.json --noEmit`. Back: `npx tsc --noEmit` |
| `$queryRaw` quebra ou vaza | Nome de tabela/coluna do **banco** ≠ do Prisma; BigInt não serializa | Tagged template (não `Unsafe`); conferir `@@map`/`@map` no schema; `COUNT(*)::int` |
| `Out-File`/`ConvertTo-Json` do PowerShell corrompe JSON | PS 5.1 grava **BOM**; `JSON.parse` do Node falha | Editar JSON com o tool `Edit`, nunca via PowerShell. Já causou um "teste vermelho pelo motivo errado" |
| Rollback `.sql` aparecendo no `git status` | Proposital | **Nunca commitar.** São a rede de segurança das migrations em produção |
| Teste unitário não cobre a regra | **Jest aqui só cobre funções PURAS** (`custo-engine`, `matriz-fiscal`, `dias-uteis`, `status-orcamento`, `soma-composicao`) | Regras que tocam Prisma vão pro **smoke de integração** (script `.cjs` no scratchpad, com limpeza). Não force mock de Prisma |
| Variável PowerShell com `:` no meio da string | `"porta $p: livre"` → parse error | Use `${p}` ou renomeie a variável |

---

## D. NÚMEROS MEDIDOS (com a fonte — e o que NÃO foi medido)

### Medidos no disco/banco nesta sessão
- **Corte fiscal F4A — divergência de preço** (comparador read-only, 15 orçamentos-golden):
  **+37,9% no perfil A** (RPA, art.34 aplicável) e **+58,9% no perfil B** (Simples, sem art.34).
  *Causa:* o engine antigo **nunca precificou ICMS + PIS/COFINS de saída** — não é o IPI.
  *Fonte:* `backend/prisma/gerar-goldens.ts` + goldens em `backend/test/goldens/`.
- **NCM — atribuição em lote** (`89acfba`): de **274 → 620** fórmulas com NCM; validadas sem NCM
  caíram de **540 → 194**. *Fonte:* `backend/prisma/backfill-ncm-formulas-lote.cjs`.
- **⚠️ Contagem ATUALIZADA (medida em 2026-07-15):** **626 com NCM / 196 validadas sem NCM**.
  A diferença (+6/+2) são fórmulas criadas pelos testes de smoke visual da Jornada de Laboratório.
  Se o número divergir de novo, **meça, não assuma**.
- **Parâmetros fiscais vigentes no banco:** PIS mono 2,2 · COFINS mono 10,3 · PIS comum 1,65 ·
  COFINS comum 7,6 · ICMS art.34 12 · ICMS nominal padrão 18 · `industrializacao_caracterizada`=1.
- **`system_config` (operacional):** `mo_folha_mensal`=75.000 · `custo_fixo_mensal`=120.240 ·
  `mo_dias_uteis`=22 · `horas_dia`=8 · `mo_colaboradores`=11.

### ⚠️ Externos — informados pelo Gabriel/conselheiro, NÃO verificados no disco
Registrados aqui para não se perderem, mas **marcados como não-verificados** (regra anti-alucinação):
- **Custo MO mensal da planilha antiga: R$96.584,83** = salários R$48.292,42 + despesas
  administrativas de igual valor (o "dobrar a folha"). **Não existe no disco** — o banco tem
  `mo_folha_mensal=75.000` e `custo_fixo_mensal=120.240`. **Antes de usar, reconcilie com o Gabriel:**
  qual é o número vigente e qual campo deve carregá-lo.
- **Multiplicador 2,051×** = 1 ÷ (1 − 21,25% − 30%), onde 21,25% = PIS/COFINS comum 9,25% + ICMS
  art.34 12%, e 30% = margem padrão. A aritmética **confere** com os parâmetros do banco, mas o
  uso desse multiplicador como regra de precificação **não está implementado nem validado** —
  o engine calcula por parcela, não por multiplicador único.

---

## E. ARMADILHAS — o que NÃO fazer

1. **NUNCA reescrever o snapshot de orçamento fechado.** O preço congela em `calculo` +
   `formula_composicao_snapshot`. Nova versão de fórmula, revisão de NCM e mudança de parâmetro
   **não podem** tocar orçamento já calculado/enviado. Isso foi **provado empiricamente** (smoke de
   fronteira D4: preço 29,26 → 29,26 após versionar a fórmula-base). Qualquer mudança que ameace
   essa fronteira exige teste baseline→ação→reconferência.
2. **NUNCA chutar NCM** (nem alíquota, nem tratamento). Número fiscal não validado = nullable +
   flag provisório. O #436 ficou de fora do lote justamente por isso.
3. **NUNCA apagar fórmula/pendência sem inspecionar o vínculo POR ID antes.** Caso real: a
   pendência de teste #2 apontava para a fórmula **#280 "Shampoo Organika"**, que é **REAL**
   (33 ingredientes, 4 orçamentos usando). Um `delete` ingênuo teria destruído dado de produção.
   Padrão correto: inspecionar → escrever script com **asserções por id** → rodar → confirmar que
   o alvo real ficou intacto.
4. **NUNCA commitar sem o smoke visual do Gabriel** em `localhost:5173`. Type-check verde e smoke
   de API verde **não bastam** — três bugs desta sessão (dropdown deslocado, aba "Todas" incoerente,
   campo Ordem não editável) passaram por tsc+API e só apareceram na tela.
5. **NUNCA afirmar estado do projeto sem ver o disco.** Aconteceu nesta sessão: o radar listava
   "PDF quebrado" quando o PDF já tinha sido reescrito e commitado (`47957c4`). Entrada obsoleta
   virou desinformação.
6. **NUNCA rodar `migrate dev` contra produção.** `migrate diff` manual → `migrate status` →
   `migrate deploy` → rollback `.sql`.

---

## F. PRÓXIMO PASSO — mandato pronto (RECON da Fase 3)

**Leitura pura, nada de código.** Reportar os 7 blocos, então PARAR para o desenho ser aprovado.

- **(A) Transição atual:** ler `backend/src/orcamentos/status-orcamento.util.ts` +
  `dto/mudar-status.dto.ts` + o endpoint `POST /orcamentos/:id/status`. Onde exatamente o motivo
  entraria? Os hooks comentados ainda batem com o código?
- **(B) Schema:** o model `Orcamento` tem algum campo de motivo/observação de recusa? O que falta
  (proposta mínima: `recusado_motivo` + `recusado_observacao` + `recusado_em`)? Migration aditiva.
- **(C) Gatilho automático:** como o `PendenciasLabService.criar` é chamado hoje e como o
  `OrcamentosService` chamaria (import cruzado? `PendenciasLabModule` já exporta o service?).
  Verificar se há risco de dependência circular entre os módulos.
- **(D) Rastreio:** `pendencia_lab` já tem `motivo_origem` e `orcamento_id` — confirmar que ambos
  bastam para responder "esta revisão nasceu de qual orçamento reprovado?".
- **(E) Frontend:** onde vive o botão "Recusado" hoje (`orcamento-detalhe.tsx`) e como o
  `ConfirmDialog` viraria um form com select de motivo + texto.
- **(F) Filtro:** a lista de orçamentos (`orcamentos.tsx` + `findAll` no service) já filtra por
  status — o que falta para filtrar por motivo de recusa?
- **(G) Fronteira:** confirmar que criar pendência a partir de orçamento reprovado **não altera**
  o orçamento (só marca) — o snapshot continua intocado.

**Escopo aprovado:** marcação + gatilho + filtro. **SEM tela analítica** (Fase 4/Dashboard).

---

## G. MAPA RÁPIDO — onde as coisas moram

| Assunto | Arquivo |
|---|---|
| Engine de preço (puro, v3 fiscal) | `backend/src/orcamentos/custo-engine-fiscal.ts` |
| Matriz fiscal (modo × perfil × NCM) | `backend/src/orcamentos/matriz-fiscal.util.ts` |
| Montagem do cálculo (toca banco) | `backend/src/orcamentos/calculo.service.ts` |
| Regressão de preço (goldens, 3 modos) | `backend/src/orcamentos/custo-engine.golden.spec.ts` + `backend/test/goldens/` |
| Jornada de Laboratório (backend) | `backend/src/pendencias-lab/` |
| Máquina de status do orçamento | `backend/src/orcamentos/status-orcamento.util.ts` |
| PDF interno (2 páginas, v1+v3) | `backend/src/orcamentos/pdf.service.ts` |
| Editor de composição (in-place / nova versão) | `frontend/src/components/data/editor-composicao.tsx` |
| Fila do laboratório | `frontend/src/pages/laboratorio.tsx` |
| Wizard de orçamento (+ modo edição) | `frontend/src/pages/orcamento-wizard.tsx` |
| Regras de classificação NCM do titular | `docs/fiscal/regras-classificacao-private.md` |
| Parecer do contador | `docs/fiscal/*.md` |
