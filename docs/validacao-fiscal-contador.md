# Validação fiscal — engine de custo Private Studio (o que precisamos confirmar)

**Empresa:** Private Cosméticos | **Regime:** Lucro Real | Documento gerado pelo Private Studio para validação das alíquotas de custo.

## Contexto

O sistema calcula o preço dos orçamentos e, hoje, aplica **3 impostos "achatados" (flat)** — um sobre a matéria-prima (37,5%), um sobre a mão de obra (9,25%) e o IPI (4,55% para tudo). Esses percentuais foram estimados e **precisam ser validados e decompostos nos tributos reais** antes de ligá-los no cálculo oficial. Abaixo estão os valores que já existem no sistema (marcados como provisórios) e as perguntas para o contador confirmar. Enquanto não validados, o preço pode estar sub ou superestimado — por isso a validação é o passo que destrava a próxima fase.

---

## 1. A pergunta central — a decomposição do imposto de MP (37,5%)

Hoje o custo da **matéria-prima** leva um imposto único de **37,5%**. Precisamos entender como esse número se decompõe nos tributos reais:

- **Quanto é ICMS?**
- **Quanto é PIS/COFINS?**
- **O que mais compõe** esse 37,5% (IPI? outros)?
- **CRÍTICO (Lucro Real):** desse imposto, **o que é creditável (recuperável)** e **o que é custo definitivo**? No Lucro Real, ICMS e PIS/COFINS costumam gerar crédito — se hoje tratamos os 37,5% como custo cheio, podemos estar inflando o custo (e o preço).

**Pedido:** mostre a **conta** que o contador usaria para chegar ao imposto real sobre a MP — quais tributos entram, quais alíquotas, e o que se recupera como crédito. É essa fórmula que vamos implementar e comparar contra o flat de 37,5%.

---

## 2. Valores no sistema — confirmar cada um

| Campo | Valor atual no sistema | Confirma? (contador preenche) |
|-------|------------------------|-------------------------------|
| **ICMS** (regime) | **12%** — é 12% mesmo? Aplica a todas as operações, ou algumas são 18%? | |
| **PIS/COFINS monofásico** | **12,5%** — correto? | |
| **PIS/COFINS serviço / não-monofásico** | **9,25%** — correto? | |
| **Imposto sobre MO (mão de obra)** | **9,25% flat** — como se decompõe? A MO tem tributação diferente da MP (não tem ICMS/IPI; incide ISS? encargos?). | |
| **Encomendante do Simples Nacional** | O sistema distingue se o cliente encomendante é do Simples (campo hoje = não) | Operações para encomendantes do Simples mudam alguma alíquota ou o creditamento? Se sim, como? |

---

## 3. IPI por NCM — a maior divergência

Hoje o sistema cobra **4,55% de IPI em tudo**. Mas os NCMs cadastrados têm alíquotas reais que **variam de 0% a 27,3%** (a maioria em **14,3%**). Isso sugere que **o IPI está subcalculado hoje** para a maior parte dos produtos.

Abaixo os **32 NCMs cadastrados** (todos marcados como *provisórios* — aguardando validação). Por favor, **valide linha a linha**: confirme a alíquota de IPI e o enquadramento monofásico, ou aponte as que estão erradas.

| NCM | Descrição | IPI% (atual) | Monofásico |
|-----|-----------|--------------|------------|
| 0000.00.00 | Industrialização | 0 | Não |
| 3303.00.10 | Perfumes | 27.3 | Sim |
| 3303.00.20 | Aguas-de-colonia | 7.8 | Sim |
| 3304.10.00 | Maquiagem labios | 14.3 | Sim |
| 3304.20.10 | Maquiagem olhos | 14.3 | Sim |
| 3304.20.90 | Maquiagem olhos outros | 14.3 | Sim |
| 3304.30.00 | Unhas/esmaltes | 14.3 | Sim |
| 3304.91.00 | Pos/compactos | 14.3 | Sim |
| 3304.91.00-Ex01 | Talco | 7.8 | Sim |
| 3304.99.10 | Cremes/locoes | 14.3 | Sim |
| 3304.99.90 | Outros pele | 14.3 | Sim |
| 3304.99.90-Ex01 | Bronzeador | 7.8 | Sim |
| 3304.99.90-Ex02 | Antissolar | 0 | Sim |
| 3305.10.00 | Xampu | 4.55 | Sim |
| 3305.20.00 | Alisamento | 14.3 | Sim |
| 3305.30.00 | Laques | 14.3 | Sim |
| 3305.90.00 | Outras capilares | 14.3 | Sim |
| 3305.90.00-Ex01 | Condicionador | 4.55 | Sim |
| 3307.10.00 | Barbear | 14.3 | Sim |
| 3307.20.10 | Desodorante liquido | 4.55 | Sim |
| 3307.20.90 | Desodorante outros | 4.55 | Sim |
| 3307.30.00 | Sais banho | 14.3 | Sim |
| 3307.41.00 | Ambiente combustao | 14.3 | Sim |
| 3307.49.00 | Ambiente outros | 22 | Sim |
| 3307.90.00 | Outros/intimo | 14.3 | Sim |
| 3401.11.10 | Saboes medicinais | 3.25 | Não |
| 3401.11.90 | Sabonete barra | 3.25 | Sim |
| 3401.11.90-Ex01 | Sabao | 0 | Não |
| 3401.19.00 | Saboes/tensoativos | 3.25 | Não |
| 3401.20.10 | Sabao toucador | 3.25 | Sim |
| 3401.20.90 | Sabao outros | 3.25 | Não |
| 3401.30.00 | Sabonete liquido | 6.5 | Não |

*(32 NCMs — todos ativos, todos aguardando validação da alíquota.)*

---

## 4. Fechamento

Quando esses valores estiverem confirmados, **o preço de alguns produtos vai mudar** — em vários casos o IPI real é maior que o flat de 4,55% usado hoje, então o preço tende a subir para esses itens.

Precisamos que o contador **valide que a nova conta está fiscalmente correta**, mesmo que o preço final mude. O objetivo não é manter o preço atual, e sim **cobrar o imposto certo**. Com o "ok" do contador nas alíquotas e na fórmula de decomposição (Seção 1), ligamos o cálculo granular no sistema e mostramos, produto a produto, a diferença entre o cálculo antigo (flat) e o novo (real) para conferência final.
