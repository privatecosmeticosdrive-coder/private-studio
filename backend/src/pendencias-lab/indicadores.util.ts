/**
 * Fase 4 (Jornada de Laboratório) — cálculo PURO dos tempos solicitação→conclusão.
 * Não toca banco (specável em Jest, padrão do projeto).
 *
 * Decisões travadas (conselheiro):
 * - MEDIANA junto da média: amostra pequena/enviesada (0.0h e 63h na mesma
 *   urgência, medido no recon) faz média solitária virar ficção; mediana resiste
 *   a outlier. Com n<3 nem média nem mediana: o front lista os valores crus.
 * - n=0 → media/mediana NULL, nunca 0 (regra 7: "0h" seria zero falso).
 * - Pendência concluída SEM concluida_em sai do cálculo E é contada em
 *   `excluidas` — nunca some silenciosamente do denominador.
 */

/** Ordem fixa de exibição — sempre as 3 urgências, mesmo com n=0. */
export const URGENCIAS_ORDENADAS = ['mesmo_dia', 'dois_tres_dias', 'ate_sete_dias'] as const;

export interface LinhaConcluida {
  urgencia: string;
  solicitada_em: Date;
  concluida_em: Date | null;
}

export interface TempoUrgencia {
  urgencia: string;
  n: number;
  media_horas: number | null;
  mediana_horas: number | null;
  /** valores crus (horas, 1 casa) — o front os lista quando n<3. */
  valores_horas: number[];
}

export interface ResultadoTempos {
  tempos: TempoUrgencia[];
  /** concluídas sem par de timestamps — excluídas do cálculo, mas visíveis. */
  excluidas: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Mediana clássica: elemento central (ímpar) ou média dos 2 centrais (par). */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}

export function calcularTempos(rows: LinhaConcluida[]): ResultadoTempos {
  let excluidas = 0;
  const porUrgencia = new Map<string, number[]>(URGENCIAS_ORDENADAS.map((u) => [u, []]));

  for (const r of rows) {
    if (r.concluida_em == null) {
      excluidas++; // ajuste 3: fora do cálculo, dentro do retorno
      continue;
    }
    const horas = (r.concluida_em.getTime() - r.solicitada_em.getTime()) / 3_600_000;
    // urgência desconhecida (nunca deveria existir) ganha grupo próprio — não some
    if (!porUrgencia.has(r.urgencia)) porUrgencia.set(r.urgencia, []);
    porUrgencia.get(r.urgencia)!.push(round1(horas));
  }

  const tempos: TempoUrgencia[] = [...porUrgencia.entries()].map(([urgencia, valores]) => ({
    urgencia,
    n: valores.length,
    media_horas:
      valores.length > 0 ? round1(valores.reduce((s, v) => s + v, 0) / valores.length) : null,
    mediana_horas: valores.length > 0 ? round1(mediana(valores)!) : null,
    valores_horas: [...valores].sort((a, b) => a - b),
  }));

  return { tempos, excluidas };
}
