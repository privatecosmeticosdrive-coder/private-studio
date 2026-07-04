# Validação fiscal objetiva — Private Studio

**Empresa:** Private Cosméticos  
**Regime:** Lucro Real  
**UF:** São Paulo  
**Data-base normativa:** 04/07/2026  
**Objetivo:** responder, na mesma ordem, às perguntas do documento de validação fiscal e definir regras implementáveis no engine de custos.

> **Limite da validação:** este documento valida as alíquotas e os tratamentos tributários associados aos NCMs e cenários informados. A classificação fiscal de cada SKU depende de composição, finalidade, apresentação e rotulagem; portanto, a alíquota indicada só é válida se o NCM/EX do produto estiver correto.

---

## Conclusão executiva

| Parâmetro atual | Resultado técnico |
|---|---|
| MP com imposto flat de 37,5% | **Não validar. Remover.** |
| ICMS fixo de 12% | **Não validar como regra única.** |
| PIS/Cofins monofásico de 12,5% | **Validar somente nas vendas tributadas pelo fabricante/importador dos produtos abrangidos.** |
| PIS/Cofins comum de 9,25% | **Validar como alíquota nominal das receitas não monofásicas no regime não cumulativo.** |
| Mão de obra com 9,25% flat | **Não validar como regra universal.** |
| IPI fixo de 4,55% | **Não validar. Usar NCM + EX + tratamento da operação.** |
| Campo “cliente do Simples” | **Manter e ampliar, pois interfere no ICMS paulista.** |
| NCM 0000.00.00 | **Não usar como classificação fiscal de produto.** |

---

# 1. Matéria-prima — decomposição dos 37,5%

## **Existe uma alíquota fiscal de 37,5% sobre a matéria-prima?**

**Não.** Não há fundamento para aplicar um percentual único de 37,5% sobre todas as matérias-primas.

Esse percentual mistura tributos da compra, créditos recuperáveis e tributos da futura venda. O engine deve calcular o **custo líquido de aquisição**, e não adicionar um imposto flat.

### Fórmula correta

```text
Custo líquido da MP =
valor da mercadoria
+ frete, seguro e despesas incorporáveis
+ tributos não recuperáveis
− crédito de ICMS admitido
− crédito de IPI admitido
− crédito de PIS admitido
− crédito de Cofins admitido
```

## **Quanto é ICMS, PIS/Cofins e IPI na matéria-prima?**

Não existe um percentual único. O cálculo deve usar a nota fiscal de cada compra e a natureza do insumo.

| Tributo na entrada | Tratamento para a Private |
|---|---|
| ICMS | Crédito pelo valor juridicamente aproveitável, conforme destaque, origem, CST e vínculo com a operação de saída. |
| PIS | Em regra, crédito de **1,65%** sobre a base legalmente admitida para insumos elegíveis. |
| Cofins | Em regra, crédito de **7,60%** sobre a base legalmente admitida para insumos elegíveis. |
| IPI | Crédito quando houver entrada tributada de matéria-prima, produto intermediário ou embalagem com direito ao creditamento. |
| ICMS-ST | Tratar separadamente; pode integrar o custo quando não houver recuperação. |
| Imposto de Importação | Em regra, compõe o custo por não ser crédito fiscal ordinário recuperável. |
| Frete | Pode integrar o custo e, conforme o caso, gerar créditos próprios. |

**Regra importante:** o ICMS incidente na aquisição deve ser excluído da base dos créditos de PIS/Cofins, conforme a Lei nº 14.592/2023.

## **O que é custo definitivo?**

É custo definitivo apenas o valor que **não puder ser recuperado** pela Private, considerando a operação efetiva e a documentação fiscal.

### Regra para implementação

O cadastro da compra deve armazenar, separadamente:

- valor bruto da aquisição;
- frete e despesas;
- ICMS recuperável;
- IPI recuperável;
- PIS recuperável;
- Cofins recuperável;
- tributos não recuperáveis;
- custo líquido final.

---

# 2. Valores atuais do sistema

## **O ICMS é 12% para todas as operações?**

**Não.**

Em São Paulo, o engine deve separar:

1. **alíquota nominal do produto**, definida conforme NCM, descrição e operação;
2. **redução de base de cálculo**, quando aplicável;
3. **carga efetiva**, calculada após o benefício.

O artigo 34 do Anexo II do RICMS/SP permite, em determinadas saídas internas realizadas por fabricante ou atacadista, redução da base para que a carga efetiva seja **12%**.

Essa carga de 12% **não é uma alíquota universal** e não deve ser aplicada automaticamente.

### Impedimentos relevantes

O benefício do artigo 34 não se aplica, entre outras hipóteses, à saída:

- destinada a estabelecimento optante pelo Simples Nacional;
- destinada a consumidor final.

Portanto, o sistema deve exigir NCM, UF, natureza da operação, regime do destinatário, condição de consumidor final e finalidade da compra.

---

## **PIS/Cofins monofásico de 12,5% está correto?**

**Sim, mas apenas no cenário correto.**

Para fabricantes e importadores dos produtos abrangidos pela Lei nº 10.147/2000:

- PIS: **2,20%**
- Cofins: **10,30%**
- Total: **12,50%**

Aplica-se, em síntese, às posições **3303 a 3307, exceto 3306**, e aos códigos expressamente abrangidos da posição 3401.

### Aplicar 12,5% quando

- a Private vender produto próprio abrangido pelo regime;
- o full service estiver fiscalmente caracterizado como venda de produto;
- houver fornecimento tributado de produto ou insumo de fabricação própria abrangido.

### Não aplicar 12,5% sobre

A receita exclusiva da **execução de industrialização por encomenda** de produto monofásico, quando corretamente caracterizada. Nessa parcela, a legislação federal admite:

- PIS: **0%**
- Cofins: **0%**

Materiais próprios fabricados ou importados pela Private, quando cobrados separadamente, devem receber o tratamento tributário próprio.

---

## **PIS/Cofins comum de 9,25% está correto?**

**Sim, como alíquota nominal de débito das receitas sujeitas ao regime não cumulativo ordinário.**

- PIS: **1,65%**
- Cofins: **7,60%**
- Total: **9,25%**

Não deve ser tratado automaticamente como custo líquido, pois o valor mensal devido corresponde a:

```text
PIS/Cofins a recolher =
débitos sobre receitas
− créditos legalmente admitidos
```

---

## **A mão de obra deve ter 9,25% flat?**

**Não.**

O tratamento depende da natureza fiscal da operação:

| Situação | PIS/Cofins | ICMS/ISS |
|---|---|---|
| Execução de industrialização por encomenda de produto monofásico | **0%**, quando atendidos os requisitos | ICMS sobre a mão de obra pode ser diferido em SP, se atendidas as condições |
| Industrialização de produto não monofásico | Em regra, **9,25%** no regime não cumulativo | ICMS conforme a operação; possível diferimento em SP |
| Venda full service | Tributação da venda do produto | ICMS e IPI da mercadoria |
| Serviço autônomo que não configure industrialização tributada pelo ICMS | Análise específica | Pode haver ISS |

### Condições do diferimento paulista da mão de obra

A Portaria CAT 22/2007 é aplicável, em síntese, quando:

- autor da encomenda e industrializador estão em São Paulo;
- a operação se enquadra nos artigos 402 e seguintes do RICMS/SP;
- o cliente fornece todas ou, ao menos, as principais matérias-primas;
- ocorre o retorno no prazo regulamentar;
- o autor da encomenda está no Regime Periódico de Apuração, e não no Simples Nacional.

Os materiais próprios aplicados pela Private permanecem com tributação própria.

### ISS

O ISS não deve ser parametrizado como regra padrão sobre a industrialização intermediária destinada à posterior industrialização ou comercialização. O STF, no Tema 816, afastou o ISS nesse cenário.

### Encargos trabalhistas

Encargos sobre a folha são componentes do custo da mão de obra, mas **não são alíquota fiscal da NF-e** e devem ficar em módulo de custo operacional separado.

---

## **O cliente encomendante ser do Simples muda a tributação?**

**Muda pontos específicos de ICMS; não altera automaticamente os tributos federais da Private.**

### Não muda apenas pelo regime do cliente

- PIS/Cofins da Private;
- IPI da Private;
- enquadramento monofásico do produto.

### Pode mudar

- aplicação da redução de base do artigo 34 do RICMS/SP;
- diferimento do ICMS sobre a mão de obra da industrialização;
- possibilidade de créditos do cliente;
- tratamento de consumidor final e DIFAL;
- formação comercial do preço.

### Campos mínimos no sistema

- regime tributário do cliente;
- inscrição estadual;
- contribuinte ou não contribuinte;
- consumidor final;
- finalidade: revenda, industrialização ou uso/consumo;
- UF de origem e destino;
- operação interna ou interestadual.

---

# 3. IPI e monofásico — validação dos 32 registros

A tabela foi confrontada com a TIPI oficial atualizada pelo ADE nº 001/2026 e com a Lei nº 10.147/2000.

| NCM/EX informado | IPI | Monofásico | Validação objetiva |
|---|---:|:---:|---|
| 0000.00.00 | N/A | N/A | **Não é classificação fiscal de produto.** Pode existir apenas como código técnico em situação específica de NF-e; não deve dirigir IPI ou monofásico. |
| 3303.00.10 | 27,30% | Sim | Confirmado |
| 3303.00.20 | 7,80% | Sim | Confirmado |
| 3304.10.00 | 14,30% | Sim | Confirmado |
| 3304.20.10 | 14,30% | Sim | Confirmado |
| 3304.20.90 | 14,30% | Sim | Confirmado |
| 3304.30.00 | 14,30% | Sim | Confirmado |
| 3304.91.00 | 14,30% | Sim | Confirmado |
| 3304.91.00 Ex 01 | 7,80% | Sim | Confirmado |
| 3304.99.10 | 14,30% | Sim | Confirmado |
| 3304.99.90 | 14,30% | Sim | Confirmado |
| 3304.99.90 Ex 01 | 7,80% | Sim | Confirmado |
| 3304.99.90 Ex 02 | 0% | Sim | Confirmado |
| 3305.10.00 | 4,55% | Sim | Confirmado |
| 3305.20.00 | 14,30% | Sim | Confirmado |
| 3305.30.00 | 14,30% | Sim | Confirmado |
| 3305.90.00 | 14,30% | Sim | Confirmado |
| 3305.90.00 Ex 01 | 4,55% | Sim | Confirmado |
| 3307.10.00 | 14,30% | Sim | Confirmado |
| 3307.20.10 | 4,55% | Sim | Confirmado |
| 3307.20.90 | 4,55% | Sim | Confirmado |
| 3307.30.00 | 14,30% | Sim | Confirmado |
| 3307.41.00 | 14,30% | Sim | Confirmado |
| 3307.49.00 | 22,00% | Sim | Confirmado |
| 3307.90.00 | 14,30% | Sim | Confirmado **sem EX**. Cadastrar também o Ex 01, com IPI de 7,80%, quando aplicável. |
| 3401.11.10 | 3,25% | Não | Confirmado |
| 3401.11.90 | 3,25% | Sim | Confirmado |
| 3401.11.90 Ex 01 | 0% | Não | Confirmado |
| 3401.19.00 | 3,25% | Não | Confirmado **sem EX**. Cadastrar Ex 01 e Ex 02 com 6,50% e Ex 03 com 0%, quando aplicáveis. |
| 3401.20.10 | 3,25% | Sim | Confirmado |
| 3401.20.90 | 3,25% | Não | Confirmado |
| 3401.30.00 | 6,50% | Não | Confirmado |

## Correção necessária no cadastro

O sistema não pode guardar apenas “NCM + alíquota”. Deve guardar:

- NCM;
- EX TIPI;
- descrição fiscal;
- alíquota;
- tratamento: tributado, alíquota zero, suspenso, isento ou não tributado;
- data inicial e final de vigência;
- fundamento legal.

---

# 4. IPI na industrialização por encomenda

## **O IPI pode ser calculado sempre em 4,55%?**

**Não.**

A regra é:

```text
IPI =
base tributável da operação
× alíquota vigente do NCM/EX
```

A incidência efetiva ainda depende do tratamento da operação: tributação normal, alíquota zero, suspensão, isenção ou não tributação.

A suspensão na industrialização por encomenda **não é automática**. Deve ser validada segundo os requisitos do RIPI e a forma de fornecimento dos insumos. Quando a Private emprega produtos de sua própria fabricação ou importação, a hipótese de suspensão exige análise específica.

---

# 5. Regras definitivas para o engine

## Cenário A — venda full service

| Tributo | Regra |
|---|---|
| ICMS | NCM + descrição + UF + destinatário + benefício aplicável |
| PIS/Cofins | 12,5% se monofásico; 9,25% se regime comum |
| IPI | NCM + EX + tratamento da operação |
| Entradas | Registrar créditos separadamente e calcular custo líquido |

## Cenário B — industrialização por encomenda

| Parcela | Regra |
|---|---|
| Retorno dos insumos do cliente | Suspensão do ICMS quando atendidos os requisitos |
| Mão de obra | PIS/Cofins 0% no produto monofásico, quando caracterizado; ICMS possivelmente diferido em SP |
| Material próprio aplicado | Tributação própria, separada da mão de obra |
| IPI | Verificar NCM/EX e requisitos de eventual suspensão |
| Predominância de matéria-prima própria da Private | Tratar, para o ICMS paulista, como forte indicativo de venda de produção própria, e não como industrialização por conta de terceiro |

## Cenário C — cliente do Simples

| Ponto | Regra |
|---|---|
| Artigo 34 do RICMS/SP | Não aplicar o benefício da carga efetiva de 12% |
| Diferimento da mão de obra | Não aplicar quando o autor da encomenda estiver no Simples |
| PIS/Cofins da Private | Não muda apenas pelo regime do cliente |
| IPI da Private | Não muda apenas pelo regime do cliente |

---

# 6. Parametrização aprovada

| Regra | Decisão |
|---|---|
| Remover flat de 37,5% da matéria-prima | **Sim** |
| Calcular custo líquido após créditos | **Sim** |
| Manter ICMS único de 12% | **Não** |
| Manter PIS/Cofins monofásico de 12,5% | **Somente na receita tributada pelo fabricante/importador** |
| Manter 9,25% sobre toda mão de obra | **Não** |
| Aplicar 0% na execução monofásica por encomenda | **Sim, quando juridicamente caracterizada e documentada** |
| Manter IPI único de 4,55% | **Não** |
| Aplicar IPI por NCM e EX | **Sim** |
| Usar 0000.00.00 como NCM de produto | **Não** |
| Separar mão de obra e materiais próprios | **Obrigatório** |
| Separar regra federal e estadual | **Obrigatório** |
| Versionar regras por data de vigência | **Obrigatório** |

---

# 7. Atualização relevante para 2026

Desde **1º de abril de 2026**, os produtos de perfumaria e higiene pessoal anteriormente relacionados no Anexo XI da Portaria CAT 68/2019 deixaram, em regra, de se submeter ao ICMS-ST em São Paulo, em razão da Portaria SRE 94/2025.

O engine deve aplicar regras por período de vigência, e não manter alíquotas ou regimes fixos no código.

---

# 8. Pontos que exigem validação operacional por escrito

Antes da ativação definitiva, o contador deve confirmar, com base no fluxo real de cada contrato:

1. quem fornece as matérias-primas principais;
2. se a operação paulista é venda de produção própria ou industrialização por conta de terceiro;
3. como serão discriminados mão de obra e materiais próprios na NF-e;
4. NCM e EX de cada SKU;
5. CST, CFOP e tratamento de IPI de cada cenário;
6. destino da mercadoria e regime do cliente.

---

# Fontes oficiais principais

- [Receita Federal — TIPI atualizada pelo ADE nº 001/2026](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.pdf/view)
- [Lei nº 10.147/2000 — regime monofásico de PIS/Cofins](https://www.planalto.gov.br/ccivil_03/leis/l10147.htm)
- [Receita Federal — Solução de Consulta Cosit nº 53/2022](https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=68099)
- [Lei nº 14.592/2023 — exclusão do ICMS da base dos créditos de PIS/Cofins](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14592.htm)
- [Sefaz-SP — artigo 34 do Anexo II do RICMS/SP](https://legislacao.fazenda.sp.gov.br/Paginas/an2art034.aspx)
- [Sefaz-SP — artigo 402 do RICMS/SP](https://legislacao.fazenda.sp.gov.br/Paginas/art402.aspx)
- [Sefaz-SP — Portaria CAT 22/2007](https://legislacao.fazenda.sp.gov.br/Paginas/pcat222007.aspx)
- [Sefaz-SP — RC 32021/2025, matérias-primas principais](https://legislacao.fazenda.sp.gov.br/Paginas/RC32021_2025.aspx)
- [Sefaz-SP — RC 31220/2025, predominância de matéria-prima própria](https://legislacao.fazenda.sp.gov.br/Paginas/RC31220_2025.aspx)
- [STF — Tema 816](https://portal.stf.jus.br/jurisprudenciaRepercussao/verAndamentoProcesso.asp?incidente=4755293&numeroProcesso=882461&numeroTema=816)
- [Sefaz-SP — Portaria SRE 94/2025](https://legislacao.fazenda.sp.gov.br/Paginas/Portaria-SRE-94-de-2025.aspx)
