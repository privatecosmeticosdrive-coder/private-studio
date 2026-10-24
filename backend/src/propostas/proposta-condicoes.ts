/**
 * Textos e condicoes padrao da PROPOSTA COMERCIAL (10/26), tirados do modelo do
 * Canva usado pelo comercial (propostas 3035/3055) e revisados:
 *  - MANTIDO: pedido minimo, prazo de entrega, forma de pagamento, validade, frete,
 *    reajustes (dissidio, impostos, materiais >= 2%, variacao +-10%) e consideracoes
 *    finais (desenvolvimento de formula, artes, microbiologia, ANVISA, laudos).
 *  - RETIRADO: data fixa "Novembro de 2022" da capa; paragrafos duplicados em ingles;
 *    tabela de composicao (INCI e percentuais) — e propriedade intelectual da
 *    Private e aparecia rotulada como "material fornecido pelo cliente"; precos
 *    digitados a mao (vem do orcamento calculado).
 *  - NOVO: amostragem ("podera haver encargos", tratados em documento a parte) e
 *    aceite com assinatura do cliente — amostra so depois da proposta assinada.
 * O comercial pode editar qualquer texto ao emitir; o que for usado fica congelado
 * na proposta (coluna `condicoes`).
 */
export interface CondicoesProposta {
  pedido_minimo: string;
  prazo_entrega: string;
  forma_pagamento: string;
  validade_dias: number;
  frete: string;
  reajustes: string[];
  consideracoes: string[];
  amostras: string;
  local: string;
}

export const CONDICOES_PADRAO: CondicoesProposta = {
  pedido_minimo: 'Pedido mínimo de 1.000 unidades por SKU.',
  prazo_entrega:
    'A programação é agendada após o aceite formal desta proposta (assinatura) e/ou o envio do pedido de compra. Após o recebimento de todos os insumos, o prazo de produção é de até 25 dias.',
  forma_pagamento: '70% antecipado e 30% na entrega do pedido. Sujeito a análise e aprovação de crédito.',
  validade_dias: 30,
  frete: 'FOB',
  reajustes: [
    'Custo de fabricação: reajustado no mês do dissídio da categoria (novembro), conforme a composição do dissídio. Havendo antecipação salarial por negociação sindical igual ou superior a 3%, o aumento é aplicado nessa data e descontado do reajuste do dissídio.',
    'Impostos: sempre que houver alteração na legislação ou nas alíquotas.',
    'Materiais: sempre que a variação de preço das matérias-primas e/ou do material de embalagem for igual ou superior a 2% do valor total dos materiais, inclusive após a colocação do pedido — os preços dos insumos são os praticados na data da compra.',
    'Variação de quantidade: a quantidade entregue pode variar 10% para mais ou para menos, em virtude das características do processo de fabricação.',
    'Após a validade, esta proposta e todos os custos devem ser revistos, inclusive variação cambial e frete.',
  ],
  consideracoes: [
    'Quando a fórmula é desenvolvida pela Private Cosméticos, há custo de desenvolvimento de R$ 297,00 por SKU, cobrado somente na primeira produção.',
    'O desenvolvimento dos materiais específicos (artes do produto) e a negociação de preço desses materiais são definidos e aprovados pelo cliente.',
    'Havendo necessidade de análise externa (ex.: microbiologia), os custos são repassados ao cliente.',
    'A responsabilidade técnica pela fabricação é da Private Cosméticos. Honorários de assessoria, laboratório e taxa federal da ANVISA são do cliente: R$ 650,00 por SKU no Grau I e R$ 1.800,00 por SKU no Grau II (produtos com comprovação de eficácia).',
    'Laudos de laboratório podem custar de R$ 5.000,00 a R$ 10.000,00, conforme o ensaio. Os valores são referência de trabalhos anteriores e podem variar na cotação atual.',
  ],
  amostras:
    'A elaboração das amostras começa somente após a assinatura desta proposta. Poderá haver encargos decorrentes da elaboração das amostras; valores e quantidades, quando aplicáveis, são tratados em documento à parte, após aprovação e negociação com o comercial. Ao assinar, o cliente declara ciência de que a amostragem poderá ser cobrada.',
  local: 'Valinhos',
};

/** Mescla o que o comercial editou com o padrao (campos ausentes = padrao). */
export function montarCondicoes(parcial?: Partial<CondicoesProposta> | null): CondicoesProposta {
  const p = parcial ?? {};
  const lista = (v: unknown, padrao: string[]) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : padrao;
  const texto = (v: unknown, padrao: string) => (typeof v === 'string' && v.trim() ? v.trim() : padrao);
  return {
    pedido_minimo: texto(p.pedido_minimo, CONDICOES_PADRAO.pedido_minimo),
    prazo_entrega: texto(p.prazo_entrega, CONDICOES_PADRAO.prazo_entrega),
    forma_pagamento: texto(p.forma_pagamento, CONDICOES_PADRAO.forma_pagamento),
    validade_dias:
      typeof p.validade_dias === 'number' && p.validade_dias > 0
        ? Math.round(p.validade_dias)
        : CONDICOES_PADRAO.validade_dias,
    frete: texto(p.frete, CONDICOES_PADRAO.frete),
    reajustes: lista(p.reajustes, CONDICOES_PADRAO.reajustes),
    consideracoes: lista(p.consideracoes, CONDICOES_PADRAO.consideracoes),
    amostras: texto(p.amostras, CONDICOES_PADRAO.amostras),
    local: texto(p.local, CONDICOES_PADRAO.local),
  };
}

/** Quem fornece o que, pelo modo de operacao do orcamento (substitui o texto a mao). */
export function textoFornecimento(modo: string | null, semEmbalagem: boolean): string {
  const m = modo ?? 'full_service';
  if (m === 'industrializacao') return 'Matérias-primas e embalagens fornecidas pelo cliente';
  if (m === 'hibrido') return 'Matérias-primas pela Private; embalagens pelo cliente';
  return semEmbalagem ? 'Matérias-primas pela Private (a granel)' : 'Matérias-primas e embalagens pela Private';
}
