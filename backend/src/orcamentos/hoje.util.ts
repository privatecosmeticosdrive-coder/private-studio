/**
 * "Hoje" para leitura de vigências (parametro_fiscal / parametro_producao).
 *
 * As colunas de vigência são `date` (meia-noite UTC). Comparar com `new Date()`
 * (timestamp) abria um buraco de ~24 h em toda troca de vigência: `fim >= agora`
 * só vale no instante 00:00Z do dia de fim e `inicio <= agora` da linha nova só
 * vale a partir de 00:00Z do dia seguinte — entre 21:00 BRT de D-2 e 21:00 BRT
 * de D-1 nenhuma linha era vigente (red team 22/10/2026, achado C2).
 *
 * Solução: um único "hoje" = data civil de São Paulo, representada à meia-noite
 * UTC, exatamente como o Prisma grava as colunas `@db.Date`.
 */
export function hojeSaoPaulo(agora = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const get = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}
