/**
 * Regra de HERANCA de NCM do orcamento (Opcao A — resolver no CONSUMO, nunca
 * congelar na escrita: formula.ncm_id so popula na F3.5, e copiar agora geraria
 * snapshot stale).
 *
 * ncm_efetivo = override do orcamento  ??  NCM da formula  ??  null
 *
 * PONTO UNICO da regra. Em F3, apenas o findOne do orcamento chama isto (para
 * devolver ncm_efetivo READ-ONLY no GET). Na F4, o custo-engine/calculo DEVE
 * chamar ESTA MESMA funcao para resolver o NCM usado no IPI — nao reimplementar
 * a regra em outro lugar (senao a heranca pode divergir entre tela e calculo).
 */
export function resolverNcmEfetivo(
  orcamentoNcmId: number | null | undefined,
  formulaNcmId: number | null | undefined,
): number | null {
  return orcamentoNcmId ?? formulaNcmId ?? null;
}
