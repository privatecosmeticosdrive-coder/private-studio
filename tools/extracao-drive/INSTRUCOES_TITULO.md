# Instruções — leitura do NOME DO PRODUTO (título) das folhas de formulação

Tarefa curta e precisa: para cada foto do seu lote, ler o **nome do produto impresso** no título da folha e
registrar as escritas à mão relacionadas ao nome. Não leia resultados de OCR. Não altere nenhum outro arquivo.

## Onde está o nome
- **Modelo B (mais comum):** célula grande à direita do logo PRIVATE, texto impresso em negrito
  (ex.: "Sabonete Liquido Facial", "Serum com GH", "Hidratante Facial Stick").
- **Modelo A:** linha "PRODUTO: <NOME>" abaixo do logo, e às vezes "Folha de Formulação" como cabeçalho
  (nesse caso o nome é o que vem depois de "PRODUTO:").
- O logo "PRIVATE / COSMÉTICOS" NÃO é nome de produto. Datas, "Cotação", "Elab 3", "BATELADA", nome do
  cliente na linha "Produto"/"Cliente" também NÃO são o nome do produto.

## Saída: um JSON por foto
Arquivo: `/home/user/private-studio/tools/extracao-drive/dados/titulos/<arquivo>.json`
(`<arquivo>` = campo `arquivo` do lote, exatamente)

```json
{
  "arquivo": "<igual ao lote>",
  "nome_impresso": "Sabonete Liquido Facial",
  "nome_impresso_legivel": true,
  "nome_manuscrito": null,
  "nome_impresso_riscado": false,
  "linha_produto_cliente": "elab 3 /Anita",
  "observacoes": ""
}
```
Regras:
- `nome_impresso`: copie EXATAMENTE como impresso (maiúsculas/minúsculas, acentos, hífens, parênteses).
  Se estiver parcialmente coberto/ilegível, copie o que dá para ler, marque `nome_impresso_legivel: false` e explique.
- `nome_manuscrito`: qualquer nome/complemento escrito à mão perto do título (ex.: "Tremell", "/ ascórbico",
  "CUPUACU CLOUD - NMF CREAM"). null se não houver.
- `nome_impresso_riscado`: true se o nome impresso (ou parte dele) foi riscado à mão.
- `linha_produto_cliente`: texto da linha "Produto"/"Cliente" da folha, se houver (é o cliente/elaboração, não o nome).
- Veja primeiro `imagem_topo` (recorte do topo, já girado). Se não bastar, use `imagem_inteira`.

Ao terminar: confirme com Bash que há um JSON válido por item do lote e responda curto (nº itens, nº JSONs,
casos ilegíveis).
