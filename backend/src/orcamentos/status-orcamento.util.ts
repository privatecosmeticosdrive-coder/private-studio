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
 * FASE 3 (ex-"HOOK fase 4") — motivo de reprovação CATEGORIZADO: a transição
 * enviado->recusado exige `motivo`. O gatilho motivo='formula' -> pendência de
 * revisão no Laboratório NÃO mora aqui (esta função é PURA, não toca banco):
 * ele vive em `OrcamentosService.mudarStatus`.
 */
export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado_cliente' | 'recusado';

/**
 * Motivos de recusa. `formula` é o único que dispara pendência de revisão.
 * `preco_custo` é marcação investigativa (matéria-prima da tese: quanto custa
 * em cotações perdidas um preço X% acima).
 */
export const MOTIVOS_RECUSA = ['preco_custo', 'formula', 'prazo', 'outro'] as const;
export type MotivoRecusa = (typeof MOTIVOS_RECUSA)[number];

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
  motivo?: string | null,
): ResultadoTransicao {
  const destinos = TRANSICOES[de];
  if (!destinos) return { ok: false, erro: `Status atual desconhecido: ${de}.` };
  if (!destinos.includes(para as StatusOrcamento)) {
    return { ok: false, erro: `Transicao invalida: ${de} -> ${para}.` };
  }
  if (de === 'rascunho' && para === 'enviado' && !temCalculo) {
    return { ok: false, erro: 'Calcule o orcamento antes de enviar ao cliente.' };
  }
  // FASE 3: recusar exige motivo categorizado. Sem ele, "perdemos o orçamento"
  // é dado morto — a captura do motivo é o elo que fecha o funil.
  if (para === 'recusado') {
    if (!motivo) {
      return { ok: false, erro: 'Informe o motivo da recusa.' };
    }
    if (!MOTIVOS_RECUSA.includes(motivo as MotivoRecusa)) {
      return { ok: false, erro: `Motivo de recusa invalido: ${motivo}.` };
    }
  }
  return { ok: true };
}
