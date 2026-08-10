/** Specs do modelo de MO de 3 componentes (rodada 2) — função pura. */
import { calcularCustoProducao, type ParametrosProducao } from './custo-producao.util';

/** Parâmetros da rodada 2 (ago/2026) — mesmos valores da seed. */
const RODADA2: ParametrosProducao = {
  custo_fixo_producao_mensal: 83084,
  linhas_paralelas: 2.5,
  eficiencia_producao: 0.82,
  setup_minutos: 60,
  dias_uteis_mes: 22,
  horas_dia: 8,
};

describe('calcularCustoProducao — derivação (nunca literal)', () => {
  it('reproduz os números auditados da rodada 2 A PARTIR dos parâmetros', () => {
    const r = calcularCustoProducao(RODADA2, 2, 1000);
    // 2,5 × 22 × 8 × 60 × 0,82 = 21.648
    expect(r.capacidade_normal_min_mes).toBe(21648);
    // 83.084 ÷ 21.648 = 3,8380...
    expect(r.taxa_minuto).toBeCloseTo(3.838, 3);
    // 3,838 × 60 = 230,26 (o número do financeiro)
    expect(r.custo_setup_ordem).toBeCloseTo(230.26, 1);
    // 8 × 60 × 0,82 = 393,6 (substitui o 480)
    expect(r.minutos_produtivos_dia_linha).toBe(393.6);
  });

  it('taxa MUDA quando o parâmetro muda (prova de que não é hardcoded)', () => {
    const r1 = calcularCustoProducao(RODADA2, 2, 1000);
    const r2 = calcularCustoProducao({ ...RODADA2, custo_fixo_producao_mensal: 90000 }, 2, 1000);
    const r3 = calcularCustoProducao({ ...RODADA2, linhas_paralelas: 3 }, 2, 1000);
    expect(r2.taxa_minuto).toBeGreaterThan(r1.taxa_minuto); // custo maior -> taxa maior
    expect(r3.taxa_minuto).toBeLessThan(r1.taxa_minuto); // capacidade maior -> taxa menor
  });

  it('minutos_produtivos_dia_linha deriva de horas×60×eficiência — nunca 480 nem 360', () => {
    expect(calcularCustoProducao(RODADA2, 1, 100).minutos_produtivos_dia_linha).toBe(393.6);
    expect(
      calcularCustoProducao({ ...RODADA2, horas_dia: 7.5, eficiencia_producao: 0.8 }, 1, 100)
        .minutos_produtivos_dia_linha,
    ).toBe(360); // 7,5×60×0,8 — coincide com 360 SÓ porque os parâmetros dão isso
  });
});

describe('diluição do setup (fim do ceil)', () => {
  it('lote 250 vs 3.000: mesmo custo de ordem, peso por unidade 12× menor', () => {
    const p250 = calcularCustoProducao(RODADA2, 2, 250);
    const p3000 = calcularCustoProducao(RODADA2, 2, 3000);
    expect(p250.custo_setup_ordem).toBe(p3000.custo_setup_ordem); // fixo por ORDEM
    // razão ≈ 12 (comparar a razão, não valores ×12: cada setup_un é
    // arredondado a 4 casas independentemente, e o ×12 amplia o resíduo)
    expect(p250.setup_un / p3000.setup_un).toBeCloseTo(12, 1);
    // a corrida NÃO depende do lote (tempo real por unidade)
    expect(p250.corrida_un).toBe(p3000.corrida_un);
  });

  it('setup_un contínuo: lote 1.001 NÃO paga um "dia inteiro" a mais (vs ceil)', () => {
    const a = calcularCustoProducao(RODADA2, 2, 1000);
    const b = calcularCustoProducao(RODADA2, 2, 1001);
    // diferença marginal, não degrau — o vício do ceil era o degrau
    expect(Math.abs(a.custo_producao_un - b.custo_producao_un)).toBeLessThan(0.001);
  });
});

describe('anti-dupla-contagem da eficiência', () => {
  it('corrida_un = taxa/un_min SEM eficiência (ela mora só na capacidade)', () => {
    const r = calcularCustoProducao(RODADA2, 2, 1000);
    // se alguém multiplicar un_min pela eficiência, corrida vira taxa/(2×0,82) — ERRADO
    expect(r.corrida_un).toBeCloseTo(r.taxa_minuto / 2, 4);
    expect(r.corrida_un).not.toBeCloseTo(r.taxa_minuto / (2 * 0.82), 3);
  });

  it('producao_dia_linha usa minutos PRODUTIVOS (un_min × 393,6 — não ×480)', () => {
    const r = calcularCustoProducao(RODADA2, 2, 1000);
    expect(r.producao_dia_linha).toBe(2 * 393.6);
  });
});

describe('guards', () => {
  it('un_min <= 0 falha visível (nunca custo silencioso)', () => {
    expect(() => calcularCustoProducao(RODADA2, 0, 100)).toThrow(/un_min/);
    expect(() => calcularCustoProducao(RODADA2, -1, 100)).toThrow(/un_min/);
  });
  it('quantidade <= 0 falha', () => {
    expect(() => calcularCustoProducao(RODADA2, 2, 0)).toThrow(/quantidade/);
  });
  it('parâmetros que zeram a capacidade falham (nunca divisão por zero muda)', () => {
    expect(() =>
      calcularCustoProducao({ ...RODADA2, eficiencia_producao: 0 }, 2, 100),
    ).toThrow(/Capacidade/);
  });
});
