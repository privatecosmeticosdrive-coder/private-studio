/**
 * Máquina de estados do STATUS do orçamento (P1 — transições básicas).
 *
 * rascunho -> enviado            (exige orçamento CALCULADO)
 * enviado  -> aprovado_cliente | recusado
 *
 * `aprovado_interno` existe como rótulo histórico mas NÃO tem uso real no fluxo
 * atual (nenhum código o atribui) — decisão: não expor transição até ganhar
 * significado de negócio.
 *
 * [HOOK fase 4 — motivo de reprovação]: quando `recusado` ganhar motivo
 * categorizado (preço/custo, fórmula, prazo, outro + texto), a transição
 * enviado->recusado passa a exigir o motivo, e motivo='custo_formula' auto-cria
 * pendência de revisão no Laboratório (gatilho D2d). Não construído aqui.
 */
export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado_cliente' | 'recusado';

const TRANSICOES: Record<string, StatusOrcamento[]> = {
  rascunho: ['enviado'],
  enviado: ['aprovado_cliente', 'recusado'],
  aprovado_cliente: [],
  recusado: [],
};

export interface ResultadoTransicao {
  ok: boolean;
  erro?: string;
}

export function validarTransicao(
  de: string,
  para: string,
  temCalculo: boolean,
): ResultadoTransicao {
  const destinos = TRANSICOES[de];
  if (!destinos) return { ok: false, erro: `Status atual desconhecido: ${de}.` };
  if (!destinos.includes(para as StatusOrcamento)) {
    return { ok: false, erro: `Transicao invalida: ${de} -> ${para}.` };
  }
  if (de === 'rascunho' && para === 'enviado' && !temCalculo) {
    return { ok: false, erro: 'Calcule o orcamento antes de enviar ao cliente.' };
  }
  return { ok: true };
}
