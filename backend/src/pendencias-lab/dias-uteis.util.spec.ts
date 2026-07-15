/**
 * Specs do cálculo de prazo em DIAS ÚTEIS (Jornada de Laboratório, D5/Ajuste 1).
 * Datas fixas (SP = UTC-3). Referências:
 *  - qui 2026-07-09 10:00 SP = 2026-07-09T13:00:00Z
 *  - sex 2026-07-10, sáb 2026-07-11, dom 2026-07-12, seg 2026-07-13
 */
import { calcularPrazoLimite, estaAtrasada } from './dias-uteis.util';

// helper: instante SP (UTC-3) -> Date
const sp = (iso: string) => new Date(`${iso}-03:00`);
// getters em horário SP para asserção legível
const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600e3).getUTCDate();
const horaSP = (d: Date) => new Date(d.getTime() - 3 * 3600e3).getUTCHours();

describe('calcularPrazoLimite — dias úteis', () => {
  describe('mesmo_dia', () => {
    it('antes do corte (10h qui) → fim do expediente (18h) do MESMO dia', () => {
      const p = calcularPrazoLimite('mesmo_dia', sp('2026-07-09T10:00:00'));
      expect(diaSP(p)).toBe(9);
      expect(horaSP(p)).toBe(18);
    });
    it('após o corte (15h qui) → 18h do PRÓXIMO dia útil (sex 10)', () => {
      const p = calcularPrazoLimite('mesmo_dia', sp('2026-07-09T15:00:00'));
      expect(diaSP(p)).toBe(10);
      expect(horaSP(p)).toBe(18);
    });
    it('sexta após o corte → pula fim de semana → segunda 18h', () => {
      const p = calcularPrazoLimite('mesmo_dia', sp('2026-07-10T16:00:00'));
      expect(diaSP(p)).toBe(13); // segunda
      expect(horaSP(p)).toBe(18);
    });
    it('sábado (fim de semana) → próximo dia útil (segunda 18h)', () => {
      const p = calcularPrazoLimite('mesmo_dia', sp('2026-07-11T10:00:00'));
      expect(diaSP(p)).toBe(13);
    });
  });

  describe('dois_tres_dias (+2 úteis)', () => {
    it('quinta → segunda (pula sáb/dom)', () => {
      const p = calcularPrazoLimite('dois_tres_dias', sp('2026-07-09T10:00:00'));
      expect(diaSP(p)).toBe(13); // qui→sex(1)→seg(2)
      expect(horaSP(p)).toBe(18);
    });
    it('segunda → quarta', () => {
      const p = calcularPrazoLimite('dois_tres_dias', sp('2026-07-13T09:00:00'));
      expect(diaSP(p)).toBe(15);
    });
  });

  describe('ate_sete_dias (+7 úteis)', () => {
    it('quinta 09/07 → segunda 20/07 (2 fins de semana pulados)', () => {
      const p = calcularPrazoLimite('ate_sete_dias', sp('2026-07-09T10:00:00'));
      // qui→ sex10,seg13,ter14,qua15,qui16,sex17,seg20
      expect(diaSP(p)).toBe(20);
      expect(horaSP(p)).toBe(18);
    });
  });
});

describe('estaAtrasada', () => {
  const prazo = sp('2026-07-09T18:00:00');
  it('depois do prazo, ainda aberta → atrasada', () => {
    expect(estaAtrasada(prazo, 'aberta', sp('2026-07-09T19:00:00'))).toBe(true);
  });
  it('antes do prazo → não atrasada', () => {
    expect(estaAtrasada(prazo, 'aberta', sp('2026-07-09T17:00:00'))).toBe(false);
  });
  it('concluída, mesmo após o prazo → não atrasada', () => {
    expect(estaAtrasada(prazo, 'concluida', sp('2026-07-10T10:00:00'))).toBe(false);
  });
  it('cancelada → não atrasada', () => {
    expect(estaAtrasada(prazo, 'cancelada', sp('2026-07-10T10:00:00'))).toBe(false);
  });
});
