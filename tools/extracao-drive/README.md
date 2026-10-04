# Extração de fórmulas a partir de fotos (Drive)

Pipeline que leu as 236 fotos da pasta do Drive **"ORÇAMENTOS — MAIO A AGOSTO 2026"** e gerou o staging
`backend/prisma/extracao-drive/formulas_staging.json`. Relatório, planilha de conferência e biblioteca:
`docs/extracao-drive-2026-10/`.

**Nada aqui escreve no banco.** A importação é feita por `backend/prisma/import-extracao-drive.ts`
(PREVIEW por padrão; ver seção Importação).

## Conteúdo

| Caminho | O que é |
|---|---|
| `bin/ocr_worker.py` | Fila de OCR (PaddleOCR PP-OCRv6, 2400 px, classificador de orientação, `enable_mkldnn=False`). Lê `raw/`, grava `dados/ocr/<id>.json`. |
| `bin/parse_v2.py` | Reconstrói a tabela da folha (modelos A e B, variantes "LOTE"/"gr"); linhas casadas por ordem (âncora = coluna %). |
| `bin/validate.py` | 5 conferências + integração da leitura visual → `out/extracao.json`. |
| `bin/gerar_saida.py` | Gera `out/entrega/` (xlsx de conferência, staging JSON, biblioteca .md). |
| `bin/decode.py` | Decodifica downloads do Drive (base64) para `raw/`. |
| `INSTRUCOES_VISUAL.md` | Instruções da 2ª leitura visual independente (transcrição / varredura de manuscrito). |
| `dados/inventario_drive.json` | Inventário da pasta (236 arquivos, ids, tamanhos). |
| `dados/ocr/*.json` | Saída bruta do OCR por foto (texto, confiança, caixas, sha256 da foto). |
| `dados/revisao/*.json` | 44 transcrições visuais completas (folhas que o OCR não fechou). |
| `dados/anotacoes/*.json` | 133 varreduras de escrita à mão dentro da tabela. |

`raw/` (fotos, ~570 MB, dados de cliente) e `out/` não são versionados.

## As 5 conferências (uma linha só vale se passar)

1. Σ% = 100 (tolerância = arredondamento impresso) — ou = TOTAL impresso → `origem_nao_fecha_100`.
2. QTDE(kg) = % × batelada; QTDE(g) = × 1000 (tolerância propaga o arredondamento do %).
3. CUSTO = QTDE × R$/kg.
4. Código → nome bate com o cadastro (`backend/prisma/kb-source.json`).
5. Preço/fornecedor plausíveis vs. cadastro e vs. outras folhas (pega linha trocada na folha de origem).

Status: `confirmada` · `pendente_conferencia` · `origem_nao_fecha_100` · `revisar`. Nada é corrigido automaticamente.

## Reproduzir (sem refazer OCR)

```bash
cd tools/extracao-drive
python3 bin/validate.py              # -> out/extracao.json
python3 bin/gerar_saida.py           # -> out/entrega/  (precisa openpyxl)
```
Saída verificada idêntica (byte a byte) à entregue em 2026-10-04.

Refazer do zero: baixar as fotos para `raw/` (`<driveId>__<titulo>`), instalar PaddleOCR (paddlepaddle 3.3.1 CPU,
paddlex 3.7.2) e rodar `python bin/ocr_worker.py 1` (e `2` em paralelo). ~75 s/foto/processo em CPU.

## Importação (backend)

```bash
cd backend
npm run import:extracao-drive              # PREVIEW: fórmulas e preços que entrariam / seriam pulados, e por quê
npm run import:extracao-drive -- --apply   # grava em UMA transação + escreve rollback .sql (untracked)
# opções: --sem-precos | --sem-formulas
```
Regras completas e números do smoke: `docs/extracao-drive-2026-10/RELATORIO_EXTRACAO.md` §8.
O nome do produto vem de `dados/titulos/` (leitura visual dedicada do título impresso, conferida contra o OCR;
instruções em `INSTRUCOES_TITULO.md`).
