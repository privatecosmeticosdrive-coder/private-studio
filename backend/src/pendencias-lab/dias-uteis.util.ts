/**
 * Cálculo de prazo em DIAS ÚTEIS (Jornada de Laboratório, D5 — Ajuste 1).
 * Dias úteis = seg–sex; sábado/domingo pulados. Feriados FORA do escopo por ora
 * (só fim de semana). Motivo: o atraso vira indicador de produtividade — prazo
 * em dia corrido poluiria os dados com fins de semana.
 *
 * Regras por urgência:
 *  - mesmo_dia: fim do expediente de HOJE (18:00). Se `agora` já passou do CORTE
 *    (14:00), joga pro fim do expediente do PRÓXIMO dia útil (não dá pra exigir
 *    "mesmo dia" às 17h).
 *  - dois_tres_dias: +2 dias úteis (fim do expediente).
 *  - ate_sete_dias: +7 dias úteis (fim do expediente).
 *
 * Tudo em America/Sao_Paulo via aritmética de horas locais no Date (o servidor
 * roda em UTC; usamos os getters/setters UTC com offset fixo -3 para SP).
 */
export type UrgenciaLab = 'mesmo_dia' | 'dois_tres_dias' | 'ate_sete_dias';

const HORA_CORTE = 14; // após 14h local, "mesmo dia" vira próximo dia útil
const FIM_EXPEDIENTE = 18; // 18:00 local
const OFFSET_SP_MS = 3 * 60 * 60 * 1000; // SP = UTC-3 (sem horário de verão desde 2019)

/** true se o instante (em horário SP) cai em sábado(6) ou domingo(0). */
function ehFimDeSemanaSP(d: Date): boolean {
  const diaSP = new Date(d.getTime() - OFFSET_SP_MS).getUTCDay();
  return diaSP === 0 || diaSP === 6;
}

/** Avança para o próximo dia útil e crava o horário local (SP) informado. */
function proximoDiaUtilAs(base: Date, horaLocal: number): Date {
  // meia-noite SP do dia de `base`, em UTC:
  const sp = new Date(base.getTime() - OFFSET_SP_MS);
  let ano = sp.getUTCFullYear();
  let mes = sp.getUTCMonth();
  let dia = sp.getUTCDate();
  // monta o instante desejado (horaLocal SP) e avança até cair em dia útil
  let alvo: Date;
  do {
    dia += 1;
    alvo = new Date(Date.UTC(ano, mes, dia, horaLocal, 0, 0) + OFFSET_SP_MS);
    // normaliza componentes (overflow de mês/ano é tratado pelo Date.UTC)
    const norm = new Date(alvo.getTime() - OFFSET_SP_MS);
    ano = norm.getUTCFullYear();
    mes = norm.getUTCMonth();
    dia = norm.getUTCDate();
  } while (ehFimDeSemanaSP(alvo));
  return alvo;
}

/** Horário `horaLocal` SP do MESMO dia de `base`. */
function mesmoDiaAs(base: Date, horaLocal: number): Date {
  const sp = new Date(base.getTime() - OFFSET_SP_MS);
  return new Date(
    Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), horaLocal, 0, 0) + OFFSET_SP_MS,
  );
}

/** Adiciona N dias ÚTEIS a partir de `base`, cravando o fim do expediente. */
function somaDiasUteis(base: Date, n: number): Date {
  let atual = base;
  for (let i = 0; i < n; i++) atual = proximoDiaUtilAs(atual, FIM_EXPEDIENTE);
  return atual;
}

/**
 * Calcula o prazo-limite a partir da urgência e do instante da solicitação.
 * `agora` injetável para testes determinísticos.
 */
export function calcularPrazoLimite(urgencia: UrgenciaLab, agora: Date): Date {
  switch (urgencia) {
    case 'mesmo_dia': {
      const spHora = new Date(agora.getTime() - OFFSET_SP_MS).getUTCHours();
      // fim de semana OU após o corte -> fim do expediente do próximo dia útil
      if (ehFimDeSemanaSP(agora) || spHora >= HORA_CORTE) {
        return proximoDiaUtilAs(agora, FIM_EXPEDIENTE);
      }
      return mesmoDiaAs(agora, FIM_EXPEDIENTE);
    }
    case 'dois_tres_dias':
      return somaDiasUteis(agora, 2);
    case 'ate_sete_dias':
      return somaDiasUteis(agora, 7);
  }
}

/** Uma pendência está ATRASADA se passou do prazo e não foi concluída/cancelada. */
export function estaAtrasada(prazoLimite: Date, status: string, agora: Date): boolean {
  return agora > prazoLimite && status !== 'concluida' && status !== 'cancelada';
}
