# Extração de fórmulas e preços de MP — Drive "ORÇAMENTOS — MAIO A AGOSTO 2026"

Gerado por Claude Code em 04/10/2026, a pedido do Gabriel. **STAGING: nada foi gravado no banco do Private Studio e nada foi alterado no repositório.** (Este ambiente nem tem acesso ao banco.)

## 1. O que foi processado

| | Qtde |
|---|---|
| Fotos na pasta (57 pastas de cliente) | 236 (todas baixadas; tamanho idêntico ao Drive) |
| Fotos de folha de fórmula | 173 |
| Fotos de tabela de custo / mão de obra (não extraídas — pedido do Gabriel) | 62 |
| Outras (lista de portfólio do cliente Me.Linda) | 1 |
| **Fórmulas únicas** (fotos repetidas da mesma fórmula unidas) | **168** (2.411 linhas de ingrediente) |
| MPs com preço confiável observado | 473 (392 existem no cadastro de referência; 81 não) |

## 2. Resultado

| Status | Fórmulas | O que significa |
|---|---|---|
| ✅ confirmada | **69** | Todas as contas impressas fecham com o lido, todo código bate com o nome do cadastro, preço/fornecedor plausíveis, sem anotação à mão que altere a fórmula. |
| 🟡 pendente_conferencia | **84** | Leitura confiável (contas fecham), mas há item a conferir antes de importar — ver tabela 3. 43 delas só têm "MP fora do cadastro de referência" (provável MP criada depois de mai/2026). |
| 🔵 origem_nao_fecha_100 | **15** | A **própria folha imprime TOTAL ≠ 100%** (ex.: 98%, 100,01%, 101,44%, 103,7%, 108,59%) e a soma lida bate exatamente com esse total. Erro da fórmula de origem, não da leitura. **Nada foi ajustado** — decisão do laboratório. |
| 🔴 revisar | **0** | Nenhuma leitura ficou sem fechar. |

41 das 168 têm composição **idêntica** a uma fórmula que já existe no sistema (kb) — coluna "Já existe no kb".

### 3. Pendências (ocorrências)
| Tipo | Ocorr. | Ação sugerida |
|---|---|---|
| Código de MP fora do cadastro de referência (kb-source.json, mai/2026) | 152 (81 códigos) | Conferir no banco de produção se o código já existe (MP criada depois). Se não existir, cadastrar antes. |
| Nome lido ≠ nome do cadastro para o mesmo código | 21 | MP renomeada? (ex.: 1058 "Dimeticona 350 CST" × cadastro "Silicone 200/350"). 1 caso é código cortado na foto (150 → provável **1150** Aristoflex Tac). |
| Anotação à mão que pode mudar a fórmula | 18 | "DOBRAR" em filtros solares (IMG_1747), "Vaselina Líq. 98" ao lado de MPs (IMG_1909), "X" em Aloe/Hamamelis (IMG_1738–1741), preço riscado (IMG_2013)… Laboratório decide qual é a versão final. |
| Código INFERIDO (impresso coberto/cortado na foto) | 14 | Inferido só quando o nome é idêntico e único no cadastro e os dígitos visíveis batem. Confirmar. |
| Nome do produto corrigido à mão | 9 | Ex.: "Serum Rugas - PDRN" → "EXOSSOMAS"/"NONANO"/"Peptídeos"; "Stick FPS 50" → "30". Decidir o nome. |
| Preço/fornecedor suspeito na folha | 5 linhas (+2 atípicos) | A folha de origem copiou preço de outra linha (ex.: Serum Íntimo IMG_1983: Ác. Hialurônico a R$ 46,80 = preço do Propanediol). **Excluídas** da lista de preços. |

Linhas com **R$ 0,00** (36, quase todas MP fornecida pelo cliente — mel, própolis, apitoxina…) ficam na fórmula mas **fora** da lista de preços.

## 4. Como foi lido e conferido (por que confiar)

1. **OCR** (PaddleOCR PP-OCRv6, CPU) em todas as 236 fotos, com correção automática de orientação.
2. **Reconstrução da tabela** por cabeçalho (2 modelos de folha + variantes "LOTE"/"gr"), linhas casadas por ordem (robusto a folha torta/curvada). Abaixo do TOTAL (contas manuscritas de embalagem) é ignorado.
3. **Cinco conferências independentes** — uma linha só vale se:
   - A. Σ% = 100 (tolerância = arredondamento impresso) — ou = TOTAL impresso (→ origem_nao_fecha_100);
   - B. QTDE(kg) = % × batelada e QTDE(g) = × 1000;
   - C. CUSTO = QTDE × R$/kg;
   - D. código → nome bate com o cadastro (pega código lido errado/cortado);
   - E. preço/fornecedor plausíveis vs. cadastro e vs. outras folhas (pega linha trocada — na folha ou na leitura).
4. **Segunda leitura visual independente** (8 agentes, sem ver o OCR): transcrição completa das 44 folhas difíceis (concordância célula a célula com o OCR: 2.442/2.678) e varredura de **escrita à mão dentro da tabela** nas outras 133.
5. Auditoria manual por amostragem dos casos-limite (Serum Íntimo, Body Splash, Sérum Pele Mista, Shampoo Monari) — em todos a leitura estava certa e a divergência era da folha.

## 5. Limites (honestos)

- **Preço sem data de cotação**: o R$/kg é o valor impresso na folha daquele orçamento; a folha não traz data da cotação (só às vezes a data da folha). Pela regra 6, não é preço cotado/validado.
- **Cadastro de referência = `backend/prisma/kb-source.json` (mai/2026)**, não o banco de produção. Antes de importar, cruzar com o banco real.
- **Precisão do banco**: `formula_composicao.concentracao_pct` é Decimal(6,3) → 22 concentrações em 7 fórmulas têm 4 casas (ex.: 0,0075%) e seriam arredondadas; `materias_primas.preco_kg_brl` é Decimal(10,2) → 22 preços têm 3 casas. Decidir antes.
- Tabelas de custo (62 fotos) não foram extraídas (pedido); estão listadas na aba "Outras fotos".

## 6. Plano de importação proposto (NÃO executado — precisa do OK do Gabriel/conselheiro)

1. **Nunca** usar `npm run import:kb` (apaga MPs e composições de todas as fórmulas).
2. Pré-flight read-only no banco: conferir os 81 códigos fora do kb, os 21 nomes divergentes e quais das 168 já existem (as 41 idênticas ao kb provavelmente não precisam entrar).
3. Fórmulas: script novo, idempotente, inserindo só `confirmada` (e pendentes após resolução) como `status='rascunho'`, `origem` nova (ex.: `extracao_drive_2026_10`), `cliente_original` = pasta, `batelada`, composição por **`mp_id` via código** (nunca por nome), com baseline e rollback `.sql` (regra 3). Fórmula nova sem `ncm_id` não é cotável — prever.
4. Preços: decidir o caminho (docs/04 §7.3 aponta o fluxo de Cotações/`integrar`, que grava data = hoje e cria alerta ≥20%). As 93 MPs com preço da folha ≠ cadastro estão na aba "Preços MP" com Δ% e onde apareceram.
5. Smoke: baseline → importação → reconferência de preço de orçamento já calculado (regra 8).

## 7. Arquivos

- `formulas_extraidas.xlsx` — conferência humana (LEIA-ME, Fórmulas, Composição, Preços MP, MPs fora do cadastro, Revisar, Outras fotos), com link para a foto de cada fórmula.
- `formulas_staging.json` — formato de máquina para o futuro script de importação.
- `biblioteca_extraida.md` — uma seção por fórmula (formato da skill private-formula-extractor; INCI "_a definir_").

## 8. Implementado nesta branch (não executado em produção)

Decisões do Gabriel (04/10/2026): **% com 4 casas → arredondar a 3**; **fórmulas com TOTAL ≠ 100% → subir mesmo assim** (margem para ajuste); **preço da folha = preço atualizado na data da cotação impressa; sem data → maio/2026 (01/05/2026)**.

`backend/prisma/import-extracao-drive.ts` (`npm run import:extracao-drive`; PREVIEW por padrão, `--apply` grava tudo em UMA transação e escreve o rollback `.sql` untracked; opções `--sem-precos`, `--sem-formulas`):

- **Fórmulas** (novas, `status='rascunho'`, `origem='extracao_drive'`, MP por código): entram `confirmada`, `origem_nao_fecha_100` e `pendente_conferencia` desde que **não haja pendência** ou a única seja "MP fora do kb de maio" (conferida no banco). Manuscrito, nome rasurado, código inferido, preço suspeito ou nome divergente **bloqueiam**. Nome do produto só com **dupla leitura** do título impresso (visual + OCR; 1 caso visual + conferência manual). Concentrações arredondadas e TOTAL ≠ 100% ficam anotados em `observacoes`.
- **Preços**: 462 candidatos (5 códigos ambíguos — mesma data, preços diferentes — não entram). Atualiza só se a data da folha for **mais recente** que a `data_cotacao` gravada; grava `mp_historico_precos` (`origem='extracao_drive'`), `preco_anterior`, `aumento_pct`, `flag_aumento_relevante`; fornecedor só muda se o da folha for claramente outro. Não gera alerta in-app em lote.

Smoke em Postgres local (cópia do kb de maio + seed + 1 orçamento "enviado" com snapshot):
- 45 fórmulas importadas (38 confirmadas, 7 com TOTAL ≠ 100% anotadas), 685 linhas, 10 concentrações arredondadas; 77 puladas (44 MP inexistente **na cópia de maio** — em produção tendem a existir —, 31 composição idêntica a fórmula existente, 2 nome divergente no banco).
- 369 preços atualizados (26 sobem, 10 descem, 333 só renovam a data; 13 com alta ≥ 20%; 259 com data da folha, 110 com referência maio; 5 trocas de fornecedor); 93 não (13 o banco já tinha cotação igual/mais recente, 80 MP inexistente na cópia de maio).
- Orçamento (snapshot) e fórmulas pré-existentes **byte a byte inalterados**; 2ª execução = 0; rollback devolve MPs, fórmulas e histórico ao estado exato anterior.
- **Em produção os números vão diferir** (banco real ≠ kb de maio): rodar o PREVIEW primeiro e conferir a saída antes do `--apply`.
