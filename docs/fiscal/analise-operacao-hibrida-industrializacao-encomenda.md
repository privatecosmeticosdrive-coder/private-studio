# Análise técnica — operação híbrida de industrialização por encomenda

**Empresa analisada:** Private Cosméticos  
**Regime:** Lucro Real  
**UF:** São Paulo  
**Documento analisado:** recorte de DANFE com duas linhas sob o CFOP 5.124  
**Objetivo:** explicar para outra IA a natureza da operação, sua validade jurídica, os cálculos da nota, a origem da economia aparente e os ajustes necessários no modelo de precificação.

---

## 1. Resumo executivo

A estrutura fiscal em duas linhas é **juridicamente possível e, em determinadas situações, obrigatória**:

1. **materiais próprios do industrializador**, tributados conforme o NCM e a natureza do material;
2. **mão de obra/execução da industrialização**, com tratamento tributário próprio.

No ICMS paulista, a Sefaz-SP determina que os materiais do industrializador e a mão de obra sejam discriminados em linhas separadas, ainda que ambos utilizem o CFOP 5.124. A mão de obra pode utilizar NCM `00000000` e CST 51, com diferimento, quando forem cumpridas as condições da Portaria CAT 22/2007.

Entretanto, a nota apresentada **não pode ser considerada integralmente validada apenas pelo DANFE**. Há duas conclusões importantes:

- a separação entre material próprio e mão de obra está coerente com a sistemática paulista;
- o cálculo do IPI somente sobre R$ 25,00 apresenta risco relevante, porque, quando não houver suspensão do IPI e o executor utilizar produto de sua própria industrialização ou importação, a legislação federal indica tributação sobre o **valor total cobrado pela industrialização**, incluindo mão de obra e materiais próprios.

Também é possível reconstruir exatamente os valores de PIS e Cofins do DANFE. A nota aparentemente tributou:

- o material próprio pelo regime monofásico;
- a mão de obra pelo regime comum de 9,25%.

Para produtos abrangidos pela Lei nº 10.147/2000, a Receita Federal reconhece alíquota zero sobre a receita da execução da industrialização por encomenda, ainda que o executor empregue produto próprio, desde que a operação esteja corretamente caracterizada. Assim, a nota pode ter recolhido PIS/Cofins a maior sobre a mão de obra.

---

# 2. Dados objetivos da nota

| Componente | Material/produto próprio | Mão de obra | Total |
|---|---:|---:|---:|
| Descrição | Perfume Flash Back – Memoire 100 ml | Industrialização para terceiros | — |
| CFOP | 5.124 | 5.124 | — |
| NCM | 3303.00.10 | 00000000 | — |
| CST ICMS | 020 | 051 | — |
| Valor | R$ 25,00 | R$ 45,00 | R$ 70,00 |
| Base de ICMS | R$ 15,28 | R$ 45,00 | R$ 60,28 |
| ICMS destacado | R$ 3,82 | R$ 0,00 | R$ 3,82 |
| Alíquota nominal de ICMS | 25% | Diferimento | — |
| IPI destacado | R$ 6,83 | R$ 0,00 | R$ 6,83 |

Outros totais do DANFE:

| Informação | Valor |
|---|---:|
| PIS | R$ 1,21 |
| Cofins | R$ 5,60 |
| Total dos itens | R$ 70,00 |
| Total da nota | R$ 76,83 |

## Participação econômica

- material próprio: **35,71%** do preço antes do IPI;
- mão de obra: **64,29%**;
- IPI acrescentado: **R$ 6,83**;
- total financeiro cobrado do cliente: **R$ 76,83**.

---

# 3. Por que a estrutura híbrida é válida

## 3.1. A operação não representa dois produtos comerciais

Comercialmente, o cliente recebe um único resultado: o perfume acabado.

Fiscalmente, o valor agregado pelo industrializador é formado por parcelas com tratamentos diferentes:

- materiais de propriedade da Private;
- mão de obra e execução industrial;
- eventuais insumos remetidos pelo cliente, que não constituem receita da Private.

A legislação paulista exige a segregação porque cada parcela possui NCM, CST e tributação próprios.

## 3.2. Forma documental esperada

Em uma industrialização por encomenda paulista corretamente caracterizada:

- o cliente remete as matérias-primas sob CFOP 5.901;
- a Private retorna os materiais incorporados sob CFOP 5.902;
- materiais próprios e mão de obra são cobrados sob CFOP 5.124;
- a mão de obra pode utilizar NCM `00000000` e CST 51;
- materiais próprios devem ser individualizados com seus NCMs e CSTs.

O recorte apresentado mostra somente as linhas do CFOP 5.124. Para validar a operação completa, deve-se conferir se a NF-e integral também contém o retorno dos insumos do cliente ou se existe documentação fiscal compatível com o fluxo efetivo.

## 3.3. Condições materiais para o tratamento paulista

O enquadramento como industrialização por conta de terceiro exige, em síntese:

- operação interna em São Paulo;
- autor da encomenda contribuinte do ICMS;
- fornecimento direto e preponderante das matérias-primas principais pelo encomendante;
- posterior revenda ou industrialização do produto pelo encomendante;
- retorno no prazo regulamentar;
- autor da encomenda enquadrado no Regime Periódico de Apuração para utilização do diferimento da mão de obra.

Se o cliente fornecer apenas embalagem e a Private fornecer predominantemente o conteúdo cosmético, há risco de a operação ser tratada, para o ICMS paulista, como **venda de produção própria**, e não como industrialização por conta de terceiro.

---

# 4. Reconstrução exata dos cálculos

## 4.1. IPI informado

```text
R$ 25,00 × 27,30% = R$ 6,825
Arredondamento = R$ 6,83
```

A alíquota de 27,30% corresponde ao NCM 3303.00.10 na TIPI vigente.

Matematicamente, a nota aplicou o IPI apenas sobre o componente de R$ 25,00.

## 4.2. ICMS do material próprio

```text
Base reduzida: R$ 15,28
Alíquota nominal: 25%
ICMS: R$ 15,28 × 25% = R$ 3,82
```

### Correção da análise anterior

A redução não deve ser calculada comparando simplesmente R$ 15,28 com R$ 25,00.

A base de R$ 15,28 corresponde praticamente a:

```text
Valor do material: R$ 25,00
+ IPI: R$ 6,83
= base anterior à redução: R$ 31,83

R$ 31,83 × 48% = R$ 15,2784
Base arredondada = R$ 15,28
```

Portanto, o sistema aparentemente:

1. incluiu o IPI na base anterior à redução;
2. tributou 48% dessa base;
3. aplicou a alíquota nominal de 25%.

Isso produz uma carga efetiva de 12%:

```text
R$ 31,83 × 12% = R$ 3,8196
ICMS = R$ 3,82
```

A redução legal utilizada é, portanto, de **52% da base**, para resultar em carga efetiva de 12%.

## 4.3. Ponto de validação sobre a inclusão do IPI no ICMS

O IPI não integra a base do ICMS quando, cumulativamente:

- remetente e destinatário são contribuintes;
- a operação gera ICMS e IPI;
- o produto é destinado à industrialização ou comercialização.

Se essas condições forem atendidas, o cálculo alternativo seria:

```text
R$ 25,00 × 48% = R$ 12,00
R$ 12,00 × 25% = R$ 3,00 de ICMS
```

Nesse cenário, o ICMS destacado de R$ 3,82 estaria R$ 0,82 acima do cálculo sem inclusão do IPI.

A confirmação depende do regime do destinatário, da finalidade da aquisição e do XML.

## 4.4. ICMS da mão de obra

A linha de R$ 45,00 apresenta:

- base de ICMS: R$ 45,00;
- CST 051;
- imposto destacado: R$ 0,00.

Isso significa **diferimento**, e não isenção.

O tributo não é necessariamente eliminado da cadeia. A responsabilidade é transferida para etapa posterior, quando o encomendante promover a saída subsequente do produto.

## 4.5. Reconstrução do PIS e da Cofins

Os totais do DANFE permitem reconstruir exatamente a provável parametrização.

### Parcela do material próprio

A base aparentemente excluiu o ICMS:

```text
R$ 25,00 − R$ 3,82 = R$ 21,18
```

Aplicação das alíquotas monofásicas:

```text
PIS: R$ 21,18 × 2,20% = R$ 0,47
Cofins: R$ 21,18 × 10,30% = R$ 2,18
```

### Parcela da mão de obra

A nota aparentemente aplicou o regime comum:

```text
PIS: R$ 45,00 × 1,65% = R$ 0,74
Cofins: R$ 45,00 × 7,60% = R$ 3,42
```

### Fechamento

```text
PIS: R$ 0,47 + R$ 0,74 = R$ 1,21
Cofins: R$ 2,18 + R$ 3,42 = R$ 5,60
```

A reconciliação matemática é exata. O XML deve confirmar os CSTs e as bases.

---

# 5. Ponto crítico: PIS/Cofins da mão de obra

Para produtos abrangidos pela Lei nº 10.147/2000, a Solução de Consulta Cosit nº 53/2022 reconhece:

- tributação própria do produto ou insumo fabricado/importado pelo executor;
- alíquota zero sobre a receita da execução da industrialização por encomenda.

Aplicando esse entendimento ao exemplo:

| Parcela | PIS | Cofins | Total |
|---|---:|---:|---:|
| Material próprio, base de R$ 21,18 | R$ 0,47 | R$ 2,18 | R$ 2,65 |
| Mão de obra de R$ 45,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 |
| Total esperado no modelo simplificado | R$ 0,47 | R$ 2,18 | R$ 2,65 |

A nota apresenta R$ 6,81 de PIS/Cofins.

Diferença potencial:

```text
R$ 6,81 − R$ 2,65 = R$ 4,16
```

Assim, caso todos os requisitos federais estejam atendidos, a nota aparenta ter tributado a mão de obra em 9,25% quando poderia aplicar alíquota zero.

Essa diferença representa possível **tributação federal a maior**, não economia.

---

# 6. Ponto crítico: base do IPI

A nota tributou somente R$ 25,00 pelo IPI.

Contudo, a legislação federal do IPI trata a saída do produto industrializado pelo executor como uma operação cujo valor tributável, quando não houver suspensão, compreende o valor total cobrado.

A Receita Federal já esclareceu que, quando o executor utiliza insumos de sua própria industrialização ou importação e o IPI é devido, o imposto deve ser calculado sobre:

- mão de obra;
- materiais próprios;
- demais despesas cobradas;
- aplicando-se a alíquota correspondente ao produto resultante.

Nesse entendimento:

```text
Base total: R$ 70,00
IPI: R$ 70,00 × 27,30% = R$ 19,11
```

Comparação:

| Situação | IPI |
|---|---:|
| IPI destacado na nota | R$ 6,83 |
| IPI sobre o valor total da operação | R$ 19,11 |
| Diferença potencial | R$ 12,28 |

Portanto, a “economia” de R$ 12,28 identificada no IPI pode representar **subcálculo**, e não benefício fiscal legítimo.

A suspensão do IPI exige requisitos próprios. Em especial, não se aplica automaticamente quando o executor utiliza produtos de sua própria industrialização ou importação.

---

# 7. Por que a operação parecia gerar grande economia

## 7.1. Carga indicada na nota

| Tributo | Valor | Percentual sobre R$ 70,00 |
|---|---:|---:|
| ICMS | R$ 3,82 | 5,46% |
| PIS | R$ 1,21 | 1,73% aparente |
| Cofins | R$ 5,60 | 8,00% aparente |
| IPI | R$ 6,83 | 9,76% |
| Total | R$ 17,46 | 24,94% |

## 7.2. Comparação meramente aparente com uma venda integral de R$ 70,00

Se os R$ 70,00 fossem tratados integralmente como venda de perfume:

| Tributo | Cálculo comparativo |
|---|---:|
| IPI a 27,30% | R$ 19,11 |
| PIS a 2,20% | R$ 1,54 |
| Cofins a 10,30% | R$ 7,21 |
| ICMS com carga efetiva de 12%, sem IPI na base | R$ 8,40 |
| ICMS com carga efetiva de 12%, com IPI na base | R$ 10,69 |

Carga comparativa total:

- sem IPI na base do ICMS: **R$ 36,26**;
- com IPI na base do ICMS: **R$ 38,55**.

Diferença contra os R$ 17,46 indicados no DANFE:

- **R$ 18,80 a R$ 21,09**.

Essa diferença não pode ser classificada integralmente como economia tributária válida porque:

1. parte do ICMS foi apenas diferida;
2. o IPI pode estar subcalculado;
3. o PIS/Cofins da mão de obra parece ter sido tributado a maior;
4. a validade depende de a operação real corresponder à industrialização por encomenda.

---

# 8. Economia efetiva, diferimento e risco

| Efeito | Natureza |
|---|---|
| ICMS não destacado sobre a mão de obra | **Diferimento:** melhora o caixa imediato, mas não significa eliminação definitiva do imposto |
| PIS/Cofins zero sobre a execução, se aplicável | **Economia tributária efetiva** |
| Tributação monofásica somente sobre material próprio | **Segregação válida**, se o valor e a operação forem reais |
| IPI apenas sobre R$ 25,00 | **Risco de subcálculo** se o IPI for devido sobre o valor total |
| Distribuição de R$ 25,00/R$ 45,00 | Válida somente se sustentada por contrato, ficha de custos e realidade operacional |

## Conclusão econômica correta

A operação híbrida pode gerar economia legítima principalmente por:

- diferimento do ICMS da mão de obra;
- alíquota zero de PIS/Cofins sobre a execução da encomenda;
- segregação da tributação dos materiais próprios.

Não é tecnicamente seguro afirmar que há economia legítima de IPI apenas porque o preço foi dividido entre material e mão de obra.

---

# 9. Associação ao modelo de precificação

## 9.1. Estrutura comercial

```text
Preço antes do IPI =
materiais próprios
+ execução industrial
```

No exemplo:

```text
R$ 25,00 + R$ 45,00 = R$ 70,00
```

O total financeiro da nota foi:

```text
R$ 70,00 + R$ 6,83 de IPI = R$ 76,83
```

## 9.2. Como o sistema deve formar cada parcela

### Materiais próprios

Devem incluir:

- custo líquido dos insumos próprios;
- perdas técnicas;
- custo industrial associado;
- frete e despesas;
- margem;
- ICMS aplicável;
- PIS/Cofins aplicável;
- IPI conforme a base juridicamente correta.

### Execução industrial

Deve incluir:

- horas de mão de obra;
- encargos de folha;
- energia e utilidades;
- controle de qualidade;
- desenvolvimento e documentação;
- depreciação;
- custos indiretos;
- margem industrial;
- PIS/Cofins conforme o enquadramento;
- ICMS da mão de obra, diferido ou tributado conforme o cenário.

## 9.3. O rateio não pode ser arbitrário

O sistema não deve permitir que o usuário transfira livremente valor do material para a mão de obra apenas para reduzir tributos.

O rateio deve ser sustentado por:

- contrato de industrialização;
- ordem de produção;
- ficha técnica;
- BOM/lista de materiais;
- custos reais dos insumos;
- tempos e custos de fabricação;
- critérios consistentes de overhead;
- margem definida para cada componente.

## 9.4. Fórmula recomendada para o engine

```text
Valor material próprio =
custo líquido dos materiais próprios
+ custos industriais atribuíveis
+ margem da parcela material
+ tributos embutidos da parcela

Valor execução =
mão de obra direta
+ overhead fabril
+ qualidade e regulatório
+ margem da execução
+ tributos aplicáveis à execução

Total dos itens =
valor material próprio
+ valor execução

Total da NF =
total dos itens
+ IPI destacado
+ outras parcelas externas, quando aplicáveis
```

---

# 10. Regras recomendadas para o Private Studio

| Campo/regra | Tratamento |
|---|---|
| Operação interna em SP | Sim/Não |
| Cliente no RPA | Sim/Não |
| Cliente optante pelo Simples | Sim/Não |
| Cliente fornece matérias-primas principais | Sim/Não |
| Percentual de insumos do cliente | Obrigatório |
| Retorno sob CFOP 5.902 | Obrigatório quando houver insumos remetidos |
| Materiais próprios | Linhas individualizadas no CFOP 5.124 |
| Mão de obra | Linha própria, NCM 00000000 |
| ICMS da mão de obra | Diferido somente quando atendidas as condições |
| PIS/Cofins do material próprio | Monofásico quando abrangido |
| PIS/Cofins da execução | Zero quando atendido o regime específico |
| IPI | Definir se suspenso ou tributado |
| Base do IPI | Total da operação quando exigido pela legislação |
| Base do ICMS inclui IPI | Decisão conforme destinatário e finalidade |
| Rateio material/mão de obra | Derivado da ficha de custos, nunca manual e arbitrário |
| Vigência da regra | Data inicial e final obrigatórias |

---

# 11. Parecer final sobre a nota apresentada

## Pontos coerentes

- utilização do CFOP 5.124 nas duas linhas;
- segregação entre material próprio e mão de obra;
- NCM `00000000` para mão de obra;
- CST 051 para diferimento da mão de obra, se as condições forem atendidas;
- aplicação de tributação própria ao material;
- IPI de 27,30% compatível com o NCM 3303.00.10.

## Pontos que precisam de correção ou validação

1. **IPI:** provável necessidade de cálculo sobre os R$ 70,00, e não apenas R$ 25,00, se não houver suspensão.
2. **PIS/Cofins:** a nota aparenta tributar a mão de obra em 9,25%; pode haver direito à alíquota zero.
3. **ICMS:** confirmar se o IPI deveria integrar a base; se o destino for industrialização ou comercialização entre contribuintes, pode haver exclusão.
4. **ICMS paulista:** confirmar que o cliente forneceu direta e preponderantemente as matérias-primas principais.
5. **Documentação:** conferir NF-e de remessa 5.901, retorno 5.902, XML, contrato e ficha de custos.
6. **Cliente:** confirmar se está no RPA, se é contribuinte e se não é consumidor final.

## Conclusão

A operação híbrida é uma estrutura fiscal reconhecida e válida quando representa a realidade da industrialização por encomenda.

A separação entre material e mão de obra não é, por si só, planejamento abusivo. Ela é exigida para que cada componente receba o tratamento correto.

Contudo, a economia mostrada pela nota não está integralmente validada:

- o benefício de PIS/Cofins pode ter sido subutilizado;
- o ICMS sobre a mão de obra é diferimento, não isenção;
- o IPI pode ter sido subcalculado em R$ 12,28.

A implementação segura no Private Studio deve buscar a menor carga **legalmente aplicável**, sem transformar o rateio de preço em mecanismo artificial de redução tributária.

---

# 12. Fontes oficiais

1. Sefaz-SP — RC 30616/2024: segregação de mão de obra e materiais próprios no CFOP 5.124  
   https://legislacao.fazenda.sp.gov.br/Paginas/RC30616_2024.aspx

2. Sefaz-SP — RC 32445/2025: requisitos da industrialização por conta de terceiro e diferimento  
   https://legislacao.fazenda.sp.gov.br/Paginas/RC32445_2025.aspx

3. Sefaz-SP — artigo 402 do RICMS/SP  
   https://legislacao.fazenda.sp.gov.br/Paginas/art402.aspx

4. Sefaz-SP — artigo 34 do Anexo II do RICMS/SP  
   https://legislacao.fazenda.sp.gov.br/Paginas/an2art034.aspx

5. Receita Federal — Solução de Consulta Cosit nº 53/2022  
   https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=68099

6. Receita Federal — Solução de Consulta Disit/SRRF08 nº 2/2004  
   https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=78171

7. Planalto — Decreto nº 7.212/2010, Regulamento do IPI  
   https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/decreto/d7212.htm

8. Receita Federal — TIPI vigente  
   https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.pdf
