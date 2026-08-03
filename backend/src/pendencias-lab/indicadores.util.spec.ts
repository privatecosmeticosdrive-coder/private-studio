/** Specs do cálculo puro de indicadores (Fase 4 — Jornada de Laboratório). */
import { calcularTempos, mediana } from './indicadores.util';

const h = (horas: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + horas * 3_600_000);
const base = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
const linha = (urgencia: string, horas: number | null) => ({
  urgencia,
  solicitada_em: base,
  concluida_em: horas == null ? null : h(horas),
});

describe('mediana', () => {
  it('vazio -> null (nunca 0)', () => expect(mediana([])).toBeNull());
  it('ímpar -> elemento central', () => expect(mediana([63, 0, 1])).toBe(1));
  it('par -> média dos 2 centrais', () => expect(mediana([4, 1, 2, 3])).toBe(2.5));
});

describe('calcularTempos', () => {
  it('base vazia -> 3 urgências com n=0 e media/mediana NULL (nunca 0h)', () => {
    const r = calcularTempos([]);
    expect(r.excluidas).toBe(0);
    expect(r.tempos).toHaveLength(3);
    expect(r.tempos.map((t) => t.urgencia)).toEqual([
      'mesmo_dia',
      'dois_tres_dias',
      'ate_sete_dias',
    ]);
    for (const t of r.tempos) {
      expect(t.n).toBe(0);
      expect(t.media_horas).toBeNull();
      expect(t.mediana_horas).toBeNull();
      expect(t.valores_horas).toEqual([]);
    }
  });

  it('outlier desloca a média mas NÃO a mediana (o porquê do ajuste 1)', () => {
    // caso real do recon: 0.0h, 0.0h e 63h na mesma urgência
    const r = calcularTempos([
      linha('dois_tres_dias', 0),
      linha('dois_tres_dias', 0),
      linha('dois_tres_dias', 63),
    ]);
    const t = r.tempos.find((x) => x.urgencia === 'dois_tres_dias')!;
    expect(t.n).toBe(3);
    expect(t.media_horas).toBe(21); // ficção do outlier
    expect(t.mediana_horas).toBe(0); // realidade
    expect(t.valores_horas).toEqual([0, 0, 63]);
  });

  it('concluída sem concluida_em: excluída do cálculo E contada (ajuste 3)', () => {
    const r = calcularTempos([linha('mesmo_dia', 2), linha('mesmo_dia', null)]);
    expect(r.excluidas).toBe(1);
    const t = r.tempos.find((x) => x.urgencia === 'mesmo_dia')!;
    expect(t.n).toBe(1); // só a válida no denominador
    expect(t.media_horas).toBe(2);
  });

  it('valores_horas sai ordenado (é o que o front lista com n<3)', () => {
    const r = calcularTempos([linha('ate_sete_dias', 5.5), linha('ate_sete_dias', 0.1)]);
    expect(r.tempos.find((x) => x.urgencia === 'ate_sete_dias')!.valores_horas).toEqual([0.1, 5.5]);
  });

  it('urgência desconhecida ganha grupo próprio, não some', () => {
    const r = calcularTempos([linha('urgencia_zumbi', 1)]);
    const t = r.tempos.find((x) => x.urgencia === 'urgencia_zumbi');
    expect(t?.n).toBe(1);
  });

  it('arredonda a 1 casa decimal', () => {
    const r = calcularTempos([linha('mesmo_dia', 1.23456)]);
    expect(r.tempos.find((x) => x.urgencia === 'mesmo_dia')!.valores_horas).toEqual([1.2]);
  });
});
