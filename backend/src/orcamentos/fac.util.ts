/**
 * FORMULA AJUSTADA PELO COMERCIAL — FAC (10/26). Funcoes PURAS.
 *
 * O comercial pode ajustar a formula do laboratorio direto no orcamento, dentro
 * de dois limites que valem JUNTOS:
 *  - no maximo FAC_MAX_ITENS itens tocados (alterar, adicionar ou remover);
 *  - a soma das variacoes (|para - de|) dos itens tocados ate FAC_MAX_DELTA_PCT
 *    pontos percentuais da formula.
 * A soma da formula e preservada: a diferenca vai para o MAIOR item nao tocado
 * (o veiculo, normalmente a agua) — a "compensacao", que nao conta nos limites.
 * A formula do lab nunca e alterada: o ajuste e uma camada aplicada no calculo.
 */

export const FAC_MAX_ITENS = 5;
export const FAC_MAX_DELTA_PCT = 5;

export type AcaoFac = 'alterar' | 'adicionar' | 'remover';

/** Item da formula base (composicao do lab). */
export interface ItemBaseFac {
  mp_id: number | null;
  nome: string;
  concentracao_pct: number;
}

/** O que o comercial pede. `para_pct` e ignorado em 'remover' (vira 0). */
export interface PedidoItemFac {
  mp_id: number;
  acao: AcaoFac;
  para_pct?: number;
}

export interface ItemAjusteFac {
  mp_id: number;
  nome: string;
  acao: AcaoFac;
  de_pct: number;
  para_pct: number;
}

export interface AjusteFac {
  itens: ItemAjusteFac[];
  compensacao: { mp_id: number | null; nome: string; de_pct: number; para_pct: number } | null;
  delta_total_pct: number;
  limites: { max_itens: number; max_delta_pct: number };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Valida o pedido contra a formula base e devolve o ajuste pronto para gravar.
 * Lanca Error com mensagem em portugues (vira 400 no service).
 * `nomesNovos`: nome das MPs adicionadas (vindo do cadastro).
 */
export function montarAjusteFac(
  base: ItemBaseFac[],
  pedido: PedidoItemFac[],
  nomesNovos: Map<number, string>,
): AjusteFac {
  if (!pedido.length) throw new Error('Informe ao menos um item para ajustar.');
  if (pedido.length > FAC_MAX_ITENS) {
    throw new Error(`O ajuste pelo comercial aceita no maximo ${FAC_MAX_ITENS} itens (pedido: ${pedido.length}).`);
  }
  const vistos = new Set<number>();
  const itens: ItemAjusteFac[] = [];
  for (const p of pedido) {
    if (vistos.has(p.mp_id)) throw new Error(`MP ${p.mp_id} aparece mais de uma vez no ajuste.`);
    vistos.add(p.mp_id);
    const naBase = base.find((b) => b.mp_id === p.mp_id);
    if (p.acao === 'adicionar') {
      if (naBase) throw new Error(`"${naBase.nome}" ja esta na formula: use alterar.`);
      const nome = nomesNovos.get(p.mp_id);
      if (!nome) throw new Error(`Materia-prima ${p.mp_id} nao encontrada.`);
      const para = r3(p.para_pct ?? 0);
      if (!(para > 0)) throw new Error(`Informe o percentual de "${nome}" (maior que zero).`);
      itens.push({ mp_id: p.mp_id, nome, acao: 'adicionar', de_pct: 0, para_pct: para });
      continue;
    }
    if (!naBase) throw new Error(`MP ${p.mp_id} nao esta na formula: use adicionar.`);
    const de = r3(naBase.concentracao_pct);
    if (p.acao === 'remover') {
      itens.push({ mp_id: p.mp_id, nome: naBase.nome, acao: 'remover', de_pct: de, para_pct: 0 });
      continue;
    }
    const para = r3(p.para_pct ?? -1);
    if (!(para > 0)) throw new Error(`Percentual de "${naBase.nome}" deve ser maior que zero (para tirar, use remover).`);
    if (para === de) throw new Error(`"${naBase.nome}" ja esta em ${de}%.`);
    itens.push({ mp_id: p.mp_id, nome: naBase.nome, acao: 'alterar', de_pct: de, para_pct: para });
  }

  const delta_total_pct = r3(itens.reduce((a, i) => a + Math.abs(i.para_pct - i.de_pct), 0));
  if (delta_total_pct > FAC_MAX_DELTA_PCT) {
    throw new Error(
      `O ajuste move ${delta_total_pct} pontos percentuais da formula; o limite do comercial e ${FAC_MAX_DELTA_PCT}. Acima disso, peca revisao ao laboratorio.`,
    );
  }

  // Compensacao: a diferenca liquida sai/entra no maior item nao tocado.
  const liquido = r3(itens.reduce((a, i) => a + (i.para_pct - i.de_pct), 0));
  let compensacao: AjusteFac['compensacao'] = null;
  if (liquido !== 0) {
    const candidatos = base
      .filter((b) => b.mp_id == null || !vistos.has(b.mp_id))
      .sort((a, b) => b.concentracao_pct - a.concentracao_pct);
    const veiculo = candidatos[0];
    if (!veiculo) throw new Error('Nao ha item livre na formula para compensar a soma.');
    const de = r3(veiculo.concentracao_pct);
    const para = r3(de - liquido);
    if (para < 0) {
      throw new Error(`Nao cabe: "${veiculo.nome}" (${de}%) nao tem percentual para compensar ${liquido} pontos.`);
    }
    compensacao = { mp_id: veiculo.mp_id, nome: veiculo.nome, de_pct: de, para_pct: para };
  }

  return {
    itens,
    compensacao,
    delta_total_pct,
    limites: { max_itens: FAC_MAX_ITENS, max_delta_pct: FAC_MAX_DELTA_PCT },
  };
}

/**
 * Aplica um ajuste gravado sobre linhas de composicao. Linhas da base sao
 * identificadas por mp_id (a compensacao sem mp_id, pelo nome). Itens
 * 'adicionar' viram linhas novas criadas por `novaLinha`. Retorna linhas novas
 * com `fac` marcando o que mudou; nao altera as linhas recebidas.
 */
export function aplicarAjusteFac<L extends { mp_id: number | null; concentracao_pct: number; nome: string }>(
  linhas: L[],
  ajuste: AjusteFac | null | undefined,
  novaLinha: (item: ItemAjusteFac) => L,
): Array<L & { fac?: AcaoFac | 'compensacao' }> {
  if (!ajuste) return linhas.map((l) => ({ ...l }));
  const porMp = new Map(ajuste.itens.map((i) => [i.mp_id, i]));
  const saida: Array<L & { fac?: AcaoFac | 'compensacao' }> = [];
  for (const l of linhas) {
    const item = l.mp_id != null ? porMp.get(l.mp_id) : undefined;
    if (item) {
      if (item.acao === 'remover') continue;
      saida.push({ ...l, concentracao_pct: item.para_pct, fac: item.acao });
      continue;
    }
    const c = ajuste.compensacao;
    if (c && (c.mp_id != null ? c.mp_id === l.mp_id : c.nome === l.nome)) {
      saida.push({ ...l, concentracao_pct: c.para_pct, fac: 'compensacao' });
      continue;
    }
    saida.push({ ...l });
  }
  for (const i of ajuste.itens.filter((x) => x.acao === 'adicionar')) {
    saida.push({ ...novaLinha(i), concentracao_pct: i.para_pct, fac: 'adicionar' });
  }
  return saida;
}
