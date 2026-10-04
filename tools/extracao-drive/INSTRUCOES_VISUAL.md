# Instruções — leitura visual de folhas de formulação (Private Cosméticos)

Você vai OLHAR fotos de folhas de formulação cosmética e registrar o que está escrito. É uma segunda leitura
INDEPENDENTE de um OCR: não procure nem leia resultados de OCR (dados/ocr/*.json, out/extracao.json) — a
independência é o que dá valor ao seu trabalho. Seus dados vão passar por conferências aritméticas automáticas
depois (Σ% = 100, QTDE = % × batelada, CUSTO = QTDE × R$/kg), então **copie exatamente o que está impresso,
nunca calcule, complete, corrija ou "arrume" um número**. Se não der para ler, escreva null e explique.

Escopo: só ler imagens e escrever arquivos JSON nas pastas indicadas. Não altere nenhum outro arquivo, não
acesse a internet, não toque no Google Drive nem no repositório.

## Como ver a imagem
- Use a ferramenta Read no caminho `imagem` (já está girada com o texto em pé, ~2400 px de largura).
- Se algum número estiver pequeno/duvidoso, faça um recorte ampliado com Python e leia o recorte:
  `/home/user/PaddleOCR/.venv/bin/python -c "from PIL import Image; im=Image.open('<imagem>'); im.crop((x0,y0,x1,y1)).resize((largura*2, altura*2)).save('tools/extracao-drive/crops/<lote>_<n>.jpg')"`
  (coordenadas em pixels da imagem de 2400 px; a Read mostra a imagem reduzida — multiplique pela razão informada).
  Salve recortes só dentro de tools/extracao-drive/crops/ (use nomes ÚNICOS por agente — a pasta é compartilhada).
- `original` é a foto em resolução total (não girada) — use se a girada não bastar.

## Modelos de folha que existem
- Modelo A: CÓDIGO | DESCRIÇÃO | QTDE.(KG) | % | CUSTO | Valor (Kg) | Fornecedor | Embal.
- Modelo B: CÓDIGO (às vezes "LOTE") | DESCRIÇÃO | FASE | QTDE.(Kg) | % | QTDE.(g) ou "gr" | Valor (un) | Valor (Kg) | EMBL.MINIMA (fornecedor + embalagem)
- Topo: nome do produto (célula grande), BATELADA (número em amarelo, em kg, ex. "0,030"), às vezes data (dd/mm/aa), cliente/elaboração.
- Rodapé: linha TOTAL (QTDE total, % total — pode NÃO ser 100%, copie como está —, custo total). Pode haver uma 2ª linha de total; registre a primeira.
- Abaixo da tabela costuma haver contas manuscritas de embalagem (frasco, rótulo...): NÃO fazem parte da fórmula.

## Tarefa "transcrever" -> escreva dados/revisao/<arquivo>.json
(<arquivo> = valor do campo `arquivo` do lote, exatamente; o JSON vai em
tools/extracao-drive/dados/revisao/<arquivo>.json)

```json
{
  "arquivo": "<igual ao lote>",
  "tipo": "formula",                       // ou "custo" (planilha de custo/mão de obra) ou "outro" (descreva em observacoes)
  "produto": "Sabonete Liquido Facial",
  "data_folha": "02/07/26",                // como impresso, ou null
  "batelada_kg": "0,100",                  // como impresso no topo
  "linhas": [
    {"codigo": "0", "codigo_parcial": false, "descricao": "Agua Desmineralizada", "fase": "01",
     "qtde_kg": "0,06160", "pct": "61,6000%", "qtde_g": "61,6000", "custo": "R$ 0,015", "valor_kg": "R$ 0,250",
     "fornecedor": "Private", "embal": "Private", "manuscrito": null}
  ],
  "total_pct": "100,000%", "total_qtde_kg": "0,1000",
  "continua_em_outra_foto": false,
  "anotacoes_tabela": [],
  "legibilidade": "boa",                   // boa | parcial | ruim
  "observacoes": ""
}
```
Regras:
- Uma entrada em `linhas` por ingrediente, NA ORDEM da folha, de cima para baixo. Não inclua TOTAL nem cabeçalho.
- Campos: copie o texto exatamente como impresso (vírgula decimal, "R$", "%"). Coluna que não existe no modelo: omita.
  Modelo A: a coluna CUSTO vai em "custo". Modelo B: "Valor (un)" vai em "custo".
- `codigo`: só dígitos impressos. Se o código estiver cortado/dobrado/coberto e você só vê parte, escreva os dígitos visíveis e `"codigo_parcial": true`. Nunca adivinhe dígitos.
- `manuscrito`: qualquer escrita à mão DENTRO da linha da tabela (valor riscado, nome trocado, seta, nota). Descreva: "riscado 1,0000% e escrito 0,5000%" / "ao lado: Vaselina Liq. 98". Valores impressos continuam nos campos normais.
- Linha impressa riscada inteira: transcreva e diga em `manuscrito`.
- Se a tabela continua em outra foto (sem TOTAL visível), `continua_em_outra_foto: true`.

## Tarefa "anotacoes" -> escreva dados/anotacoes/<arquivo>.json
Não transcreva a tabela. Só procure ESCRITA À MÃO / marcas DENTRO da tabela de ingredientes (entre o cabeçalho e a linha TOTAL, incluindo topo com produto/batelada).
```json
{
  "arquivo": "<igual ao lote>",
  "tipo": "formula",
  "manuscrito_na_tabela": [
    {"codigo": "147", "descricao": "Triglicérides Cáprico Caprílico", "texto": "VASELINA Liq. 98", "tipo": "nota_ao_lado"}
  ],
  "topo_manuscrito": "ex.: 'Tremell' escrito ao lado do cliente",
  "abaixo_da_tabela": "resumo curto (ex.: contas de embalagem)",
  "observacoes": ""
}
```
`tipo` ∈ riscado | valor_substituido | nota_ao_lado | circulado | marca_texto | outro. Lista vazia se não houver nada.
Marca-texto amarelo impresso/realce (sem escrita) não conta como manuscrito; registre só se parecer intencional e diferente do padrão (opcional, tipo "marca_texto").

## Ao terminar
Confirme com Bash que existe um JSON válido para cada item do seu lote (`python3 -c "import json; json.load(open(...))"`).
Responda curto: nº de itens, nº de JSONs escritos, e uma lista dos casos com legibilidade parcial/ruim, códigos parciais e manuscritos relevantes.
