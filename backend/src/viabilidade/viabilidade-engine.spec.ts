/**
 * Specs do engine de VIABILIDADE (função pura sobre o Motor 2 10/26).
 * O preço de referência (Finalizador 50 ml, lote 1.000, emb R$ 6,00 -> R$ 25,41)
 * é o mesmo golden do Motor 2 (docs/precificacao/MOTOR-2-10-26.md, 4.1).
 */
import {
  avaliarViabilidade,
  paraLatin1,
  resumoViabilidade,
  validarPremissas,
  type ContextoViabilidade,
  type PremissasCenario,
} from './viabilidade-engine';
import { calcularCustoMotor2 } from '../orcamentos/custo-engine-motor2';
import { resolverTributosSaida } from '../orcamentos/matriz-fiscal.util';

const PRODUCAO_2026_10 = {
  custo_fixo_producao_mensal: 101305,
  linhas_paralelas: 2.5,
  eficiencia_producao: 0.82,
  setup_minutos: 60,
  dias_uteis_mes: 22,
  horas_dia: 8,
  moq_economico_valor: 2400,
};

const CTX: ContextoViabilidade = {
  producao: PRODUCAO_2026_10,
  fiscal: {
    pis_monofasico_pct: 2.2,
    cofins_monofasico_pct: 10.3,
    pis_comum_pct: 1.65,
    cofins_comum_pct: 7.6,
    icms_carga_art34_pct: 12,
    icms_nominal_padrao_pct: 18,
  },
  caracterizacao: { industrializacao_caracterizada: false },
  escada: {
    lote_pequeno_pct: 45,
    lote_medio_pct: 40,
    lote_grande_pct: 35,
    lote_medio_min_un: 1000,
    lote_grande_min_un: 5000,
  },
  lote_minimo_un: 500,
  vigencias: [
    { chave: 'custo_fixo_producao_mensal', valor: 101305, vigencia_inicio: '2026-10-01', fonte: 'teste' },
  ],
};

/** MP "por unidade" de referência -> R$/kg equivalente para o volume. */
const kgDeUn = (mp_un: number, volume_ml: number) => (mp_un * 1000) / volume_ml;

/** Finalizador capilar 50 ml — exemplo 4.1 do Motor 2. */
const IDEAL: PremissasCenario = {
  produto: 'Finalizador capilar oleo vegetal 50 ml',
  volume_un: 50,
  quantidade: 1000,
  lotes_por_mes: 1,
  un_min: 6,
  cmp_base_mp_kg: kgDeUn(5.5694, 50),
  perda_mp_pct: 10,
  credito_mp_pct: 21.21,
  credito_emb_pct: 13.82,
  embalagem_un: 6,
  taxa_gestao_embalagem_pct: 15,
  frete_un_brl: 0.1,
  modo_operacao: 'full_service',
  perfil_fiscal: {
    regime_fiscal: 'lucro_real_presumido',
    finalidade: 'revenda',
    uf: 'SP',
    contribuinte_icms: true,
  },
  ncm: {
    ncm: '3305.90.00',
    ex_tipi: '',
    ipi_pct: 0,
    monofasico: true,
    tratamento: 'aliquota_zero',
    icms_nominal_pct: null,
  },
  margem_pct: null,
  preco_venda_un: null,
  investimento_brl: 0,
  investimento_meses_depreciacao: 0,
  custo_fixo_incremental_mes: 0,
  horizonte_meses: 12,
  margem_minima_aceitavel_pct: 10,
  pessoas_por_linha: 4,
  ocupacao_atual_pct: null,
  custo_hora_extra_hora: null,
  horas_extra_maximas_mes: null,
};

const avaliar = (ideal: Partial<PremissasCenario> = {}, limite: Partial<PremissasCenario> | null = null) =>
  avaliarViabilidade({ ideal: { ...IDEAL, ...ideal }, limite }, CTX);

describe('Viabilidade — reproduz o Motor 2 10/26', () => {
  it('Finalizador 50 ml, lote 1.000, emb 6,00 -> R$ 25,41 sem IPI (produto 16,87 + embalagem 8,55)', () => {
    const r = avaliar();
    const p = r.ideal.preco;
    expect(Number(p.preco_sipi.toFixed(2))).toBe(25.41);
    expect(Number(p.preco_produto_sipi.toFixed(2))).toBe(16.87);
    expect(Number(p.preco_embalagem_sipi.toFixed(2))).toBe(8.55);
    expect(p.ipi_un).toBe(0);
    expect(Number(p.preco_cipi.toFixed(2))).toBe(25.41);
    expect(p.origem).toBe('motor2');
    expect(p.margem_pct).toBe(40);
    expect(p.margem_origem).toBe('escada');
    expect(p.tributos_por_dentro_pct).toBeCloseTo(24.5, 4); // 12 + 2,2 + 10,3
    expect(r.engine).toContain('Motor 2 10/26');
  });

  it('decomposição unitária bate com o Motor 2 (MP líquida 4,8269; fábrica 1,0607; margem em R$)', () => {
    const r = avaliar();
    const u = r.ideal.unitario;
    expect(u.mp_bruta).toBeCloseTo(5.5694, 4);
    expect(u.mp_liquida).toBeCloseTo(4.8269, 4);
    expect(u.embalagem_liquida).toBeCloseTo(5.1708, 4);
    expect(u.fabrica_setup).toBeCloseTo(0.2808, 4);
    expect(u.fabrica_corrida).toBeCloseTo(0.78, 3); // 4,6797 / 6 = 0,77995 (o Motor 2 grava 0,7799)
    expect(u.fabrica_total).toBeCloseTo(1.0607, 3);
    expect(u.tributos_por_dentro).toBeCloseTo(25.4135 * 0.245, 3);
    // margem R$ = preco - tributos - custo total = 25,4135 - 6,2263 - 11,1584
    expect(u.margem_brl).toBeCloseTo(25.4135 - 25.4135 * 0.245 - (4.8269 + 5.1708 + 0.1 + 1.0607), 3);
    expect(u.margem_contribuicao).toBeCloseTo(u.margem_brl + u.fabrica_total, 4);
    expect(r.ideal.motor2.motor).toBe('Motor 2 10/26');
  });

  it('tempo de linha: 60 + 1000/6 = 226,67 min/lote; capacidade 21.648 min; h/h = min x pessoas / 60', () => {
    const t = avaliar().ideal.tempo_linha;
    expect(t.minutos_lote).toBeCloseTo(226.6667, 3);
    expect(t.horas_lote).toBeCloseTo(3.7778, 3);
    expect(t.capacidade_normal_min_mes).toBe(21648);
    expect(t.minutos_produtivos_dia_linha).toBeCloseTo(393.6, 2);
    expect(t.dias_linha_lote).toBeCloseTo(226.6667 / 393.6, 3);
    expect(t.horas_homem_lote).toBeCloseTo((226.6667 * 4) / 60, 3);
    expect(t.ocupacao_projeto_pct).toBeCloseTo((226.6667 / 21648) * 100, 3);
  });
});

describe('Viabilidade — preço imposto (margem derivada por bisseção)', () => {
  it('impor o próprio preço do motor devolve a margem da escada (40%)', () => {
    const r = avaliar({ preco_venda_un: 25.4135 });
    expect(r.ideal.preco.origem).toBe('imposto');
    expect(r.ideal.preco.margem_origem).toBe('derivada');
    expect(r.ideal.preco.margem_pct).toBeCloseTo(40, 2);
    expect(r.ideal.preco.preco_sipi).toBeCloseTo(25.4135, 4);
  });

  it('reaplicar a margem derivada no Motor 2 devolve o preço imposto (tolerância 0,001)', () => {
    const alvo = 22;
    const r = avaliar({ preco_venda_un: alvo });
    const m = r.ideal.preco.margem_pct!;
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(40);
    const trib = resolverTributosSaida('full_service', IDEAL.perfil_fiscal, IDEAL.ncm, CTX.fiscal, CTX.caracterizacao);
    const calc = calcularCustoMotor2(
      {
        cmp_base_mp_kg: IDEAL.cmp_base_mp_kg,
        volume_un: 50,
        quantidade: 1000,
        un_min: 6,
        margem_pct: m,
        embalagem_un: 6,
      },
      {
        producao: PRODUCAO_2026_10,
        perda_mp_pct: 10,
        frete_un_brl: 0.1,
        credito_mp_pct: 21.21,
        credito_emb_pct: 13.82,
        taxa_gestao_embalagem_pct: 15,
        escada: CTX.escada,
        lote_minimo_un: 500,
      },
      trib,
    );
    const soma = calc.parcelas.produto!.preco_un + calc.parcelas.embalagem!.preco_un;
    expect(Math.abs(soma - alvo)).toBeLessThan(0.0015);
    // a embalagem não muda com a margem (taxa de gestão própria)
    expect(r.ideal.preco.preco_embalagem_sipi).toBeCloseTo(8.5468, 3);
  });

  it('preço abaixo do custo + tributos: margem inviável, preço mantido, alerta BLOQUEANTE', () => {
    const r = avaliar({ preco_venda_un: 12 });
    const p = r.ideal.preco;
    expect(p.margem_pct).toBeNull();
    expect(p.margem_origem).toBe('inviavel');
    expect(p.preco_sipi).toBe(12);
    expect(r.ideal.unitario.margem_brl).toBeLessThan(0);
    expect(r.ideal.alertas.map((a) => a.codigo)).toContain('preco_abaixo_do_custo');
    expect(r.ideal.bloqueado).toBe(true);
    // tributos continuam proporcionais ao preço (24,5%)
    expect(p.tributos_por_dentro_pct).toBeCloseTo(24.5, 3);
  });
});

describe('Viabilidade — DRE, ponto de equilíbrio, payback e preços mínimos', () => {
  it('PE incremental: fixos / MC; produção mínima arredonda para cima em lotes', () => {
    // margem de contribuicao ~ R$ 9,09/un -> 1 lote de 1.000 nao paga R$ 15.000 de fixo
    const r = avaliar({ custo_fixo_incremental_mes: 15000, lotes_por_mes: 1 });
    const pe = r.ideal.ponto_equilibrio;
    const mc = r.ideal.unitario.margem_contribuicao;
    expect(pe.custos_fixos_incrementais_mes).toBe(15000);
    expect(pe.unidades_mes).toBeCloseTo(15000 / mc, 2);
    expect(pe.unidades_mes!).toBeGreaterThan(1000);
    expect(pe.producao_minima_lotes_mes).toBe(Math.ceil(pe.unidades_mes! / 1000));
    expect(pe.producao_minima_unidades_mes).toBe(pe.producao_minima_lotes_mes! * 1000);
    expect(pe.producao_minima_unidades_mes!).toBeGreaterThanOrEqual(pe.unidades_mes!);
    // com absorção: MC menor -> PE maior
    expect(pe.com_absorcao.unidades_mes!).toBeGreaterThan(pe.unidades_mes!);
    // DRE mensal: 1 lote de 1.000 não paga R$ 15.000 de fixo -> prejuízo + alerta
    expect(r.ideal.dre_mensal.lucro_operacional).toBeLessThan(0);
    expect(r.ideal.alertas.map((a) => a.codigo)).toContain('prejuizo_mensal');
  });

  it('DRE mensal fecha: receita - tributos - variáveis - fábrica - fixos = lucro; horizonte = x meses', () => {
    const r = avaliar({ custo_fixo_incremental_mes: 1000, lotes_por_mes: 2, horizonte_meses: 6 });
    const d = r.ideal.dre_mensal;
    expect(d.unidades).toBe(2000);
    expect(d.receita_bruta_sipi).toBeCloseTo(25.4135 * 2000, 0);
    expect(d.receita_liquida).toBeCloseTo(d.receita_bruta_sipi - d.tributos_por_dentro, 2);
    expect(d.custos_variaveis).toBeCloseTo(d.mp_liquida + d.embalagem_liquida + d.frete, 2);
    expect(d.fabrica_setup).toBeCloseTo(280.78 * 2, 1);
    expect(d.lucro_operacional).toBeCloseTo(
      d.receita_liquida - d.custos_variaveis - d.fabrica - d.custo_fixo_incremental - d.depreciacao,
      1,
    );
    const h = r.ideal.dre_horizonte;
    expect(h.meses).toBe(6);
    expect(h.unidades).toBe(12000);
    expect(h.lucro_operacional).toBeCloseTo(d.lucro_operacional * 6, 0);
  });

  it('payback = investimento / (lucro + depreciação); alerta quando passa do horizonte', () => {
    // lucro ~ R$ 5.500/mes + depreciacao 6.250 -> fluxo ~ 11.750 -> payback ~ 12,8 meses > 12
    const r = avaliar({ investimento_brl: 150000, investimento_meses_depreciacao: 24, horizonte_meses: 12, lotes_por_mes: 1 });
    const inv = r.ideal.investimento;
    expect(inv.depreciacao_mes).toBe(6250);
    const fluxo = r.ideal.dre_mensal.lucro_operacional + r.ideal.dre_mensal.depreciacao;
    expect(inv.payback_meses).toBeCloseTo(150000 / fluxo, 2);
    expect(inv.payback_meses!).toBeGreaterThan(12);
    expect(inv.payback_dentro_do_horizonte).toBe(false);
    expect(r.ideal.alertas.map((a) => a.codigo)).toContain('payback_acima_do_horizonte');
    // sem investimento: payback 0 e sem alerta
    const s = avaliar();
    expect(s.ideal.investimento.payback_meses).toBe(0);
    expect(s.ideal.alertas.map((a) => a.codigo)).not.toContain('payback_acima_do_horizonte');
  });

  it('preço mínimo viável (bisseção): imposto como preço, o lucro do horizonte zera', () => {
    const base = { custo_fixo_incremental_mes: 3000, investimento_brl: 24000, investimento_meses_depreciacao: 24, lotes_por_mes: 3 };
    const r = avaliar(base);
    const pMin = r.ideal.precos_minimos.viavel!;
    expect(pMin).toBeGreaterThan(0);
    expect(pMin).toBeLessThan(r.ideal.preco.preco_sipi);
    const z = avaliar({ ...base, preco_venda_un: pMin });
    // pMin sai com 4 casas: o erro no lucro do horizonte e limitado por 0,00005 x unidades
    const tolerancia = 0.00005 * z.ideal.dre_horizonte.unidades + 0.02;
    expect(Math.abs(z.ideal.dre_horizonte.lucro_operacional)).toBeLessThan(tolerancia);
    expect(Math.abs(z.ideal.dre_horizonte.lucro_operacional)).toBeLessThan(2);
  });

  it('preço mínimo com margem mínima: imposto como preço, a margem do projeto bate a mínima', () => {
    const base = { custo_fixo_incremental_mes: 3000, lotes_por_mes: 3, margem_minima_aceitavel_pct: 15 };
    const r = avaliar(base);
    const pMm = r.ideal.precos_minimos.com_margem_minima!;
    expect(pMm).toBeGreaterThan(r.ideal.precos_minimos.viavel!);
    const z = avaliar({ ...base, preco_venda_un: pMm });
    expect(z.ideal.dre_mensal.margem_sobre_receita_pct).toBeCloseTo(15, 2);
    // abaixo da mínima -> alerta de atenção com o preço sugerido
    const baixo = avaliar({ ...base, preco_venda_un: pMm - 1 });
    const a = baixo.ideal.alertas.find((x) => x.codigo === 'margem_abaixo_da_minima');
    expect(a?.nivel).toBe('atencao');
  });
});

describe('Viabilidade — hora extra e capacidade', () => {
  it('sem ocupação atual: HE não avaliada + alerta de atenção', () => {
    const r = avaliar({ lotes_por_mes: 50 });
    expect(r.ideal.hora_extra.avaliada).toBe(false);
    expect(r.ideal.hora_extra.custo_mes).toBeNull();
    expect(r.ideal.alertas.map((a) => a.codigo)).toContain('ocupacao_desconhecida');
    expect(r.ideal.alertas.map((a) => a.codigo)).not.toContain('capacidade_insuficiente');
  });

  it('ocupação + projeto > 100%: minutos excedentes e custo da HE só com custo informado', () => {
    // 10 lotes x 226,67 min = 2.266,7 min = 10,47% da capacidade; ocupação atual 95% -> 5,47% excedente
    const semCusto = avaliar({ lotes_por_mes: 10, ocupacao_atual_pct: 95, custo_hora_extra_hora: null });
    const he = semCusto.ideal.hora_extra;
    expect(he.avaliada).toBe(true);
    expect(semCusto.ideal.tempo_linha.ocupacao_total_pct).toBeCloseTo(95 + (2266.6667 / 21648) * 100, 3);
    expect(he.minutos_excedentes_mes!).toBeCloseTo(((semCusto.ideal.tempo_linha.ocupacao_total_pct! - 100) / 100) * 21648, 1);
    expect(he.horas_linha_extra_mes).toBeCloseTo(he.minutos_excedentes_mes! / 60 / 0.82, 3);
    expect(he.horas_pessoa_extra_mes).toBeCloseTo(he.horas_linha_extra_mes! * 4, 3);
    expect(he.custo_mes).toBeNull();
    expect(semCusto.ideal.dre_mensal.hora_extra).toBeNull();
    expect(semCusto.ideal.alertas.map((a) => a.codigo)).toContain('custo_he_nao_informado');

    const comCusto = avaliar({ lotes_por_mes: 10, ocupacao_atual_pct: 95, custo_hora_extra_hora: 50 });
    const he2 = comCusto.ideal.hora_extra;
    expect(he2.custo_mes).toBeCloseTo(he2.horas_pessoa_extra_mes! * 50, 1);
    expect(comCusto.ideal.dre_mensal.hora_extra).toBeCloseTo(he2.custo_mes!, 1);
    expect(comCusto.ideal.alertas.map((a) => a.codigo)).not.toContain('custo_he_nao_informado');
    // HE entra nos fixos incrementais do PE
    expect(comCusto.ideal.ponto_equilibrio.custos_fixos_incrementais_mes).toBeCloseTo(he2.custo_mes!, 1);
    // e reduz o lucro em relação ao cenário sem custo
    expect(comCusto.ideal.dre_mensal.lucro_operacional).toBeLessThan(semCusto.ideal.dre_mensal.lucro_operacional);
  });

  it('dentro da capacidade: zero HE, sem alerta', () => {
    const r = avaliar({ lotes_por_mes: 2, ocupacao_atual_pct: 50, custo_hora_extra_hora: 50 });
    expect(r.ideal.hora_extra.avaliada).toBe(true);
    expect(r.ideal.hora_extra.minutos_excedentes_mes).toBe(0);
    expect(r.ideal.hora_extra.custo_mes).toBe(0);
    expect(r.ideal.dre_mensal.hora_extra).toBe(0);
  });

  it('HE acima do teto: alerta BLOQUEANTE "capacidade insuficiente"', () => {
    const r = avaliar({ lotes_por_mes: 10, ocupacao_atual_pct: 95, custo_hora_extra_hora: 50, horas_extra_maximas_mes: 1 });
    expect(r.ideal.hora_extra.excede_teto).toBe(true);
    const a = r.ideal.alertas.find((x) => x.codigo === 'capacidade_insuficiente');
    expect(a?.nivel).toBe('bloqueante');
    expect(r.ideal.bloqueado).toBe(true);
    const ok = avaliar({ lotes_por_mes: 10, ocupacao_atual_pct: 95, custo_hora_extra_hora: 50, horas_extra_maximas_mes: 1000 });
    expect(ok.ideal.hora_extra.excede_teto).toBe(false);
    expect(ok.ideal.bloqueado).toBe(false);
  });
});

describe('Viabilidade — bloqueios e alertas herdados do Motor 2', () => {
  it('lote 300 < 500: alerta bloqueante de lote mínimo (reuso do Motor 2) e margem 45% da escada', () => {
    const r = avaliar({ quantidade: 300 });
    expect(r.ideal.preco.margem_pct).toBe(45);
    const a = r.ideal.alertas.find((x) => x.codigo === 'lote_minimo');
    expect(a?.nivel).toBe('bloqueante');
    expect(r.ideal.bloqueado).toBe(true);
    expect(r.ideal.motor2.alertas.lote_minimo).not.toBeNull();
  });

  it('MP sem preço (R$ 0/kg) e MOQ são alertas de atenção, não bloqueiam', () => {
    const r = avaliar({ cmp_base_mp_kg: 0, quantidade: 500 });
    const codigos = r.ideal.alertas.map((a) => a.codigo);
    expect(codigos).toContain('mp_sem_preco');
    expect(r.ideal.alertas.find((a) => a.codigo === 'mp_sem_preco')?.nivel).toBe('atencao');
    expect(r.ideal.bloqueado).toBe(false);
  });

  it('preço imposto acima do teto do Motor 2 (markup + tributos <= 85%): margem no teto + alerta, sem lançar', () => {
    const r = avaliar({ preco_venda_un: 500 });
    expect(r.ideal.preco.preco_sipi).toBe(500);
    expect(r.ideal.preco.margem_pct!).toBeLessThanOrEqual(85 - 24.5);
    expect(r.ideal.preco.margem_pct!).toBeGreaterThan(60);
    const a = r.ideal.alertas.find((x) => x.codigo === 'margem_acima_do_teto');
    expect(a?.nivel).toBe('atencao');
    expect(r.ideal.unitario.margem_brl).toBeGreaterThan(0);
  });

  it('cliente fora de SP: alerta de atenção uf_fora_sp (matriz só cobre operação interna)', () => {
    const r = avaliar({ perfil_fiscal: { ...IDEAL.perfil_fiscal, uf: 'MG' } });
    expect(r.ideal.alertas.find((a) => a.codigo === 'uf_fora_sp')?.nivel).toBe('atencao');
    expect(avaliar().ideal.alertas.map((a) => a.codigo)).not.toContain('uf_fora_sp');
  });

  it('modo híbrido: embalagem informada é ignorada com alerta; MO tributada separadamente', () => {
    const r = avaliar({ modo_operacao: 'hibrido' });
    expect(r.ideal.unitario.embalagem_liquida).toBe(0);
    expect(r.ideal.alertas.map((a) => a.codigo)).toContain('embalagem_ignorada');
    expect(r.ideal.motor2.parcelas.mo).not.toBeNull();
    expect(r.ideal.preco.preco_embalagem_sipi).toBe(0);
    // preço imposto no híbrido também converge
    const imp = avaliar({ modo_operacao: 'hibrido', preco_venda_un: 15 });
    expect(imp.ideal.preco.margem_origem).toBe('derivada');
    expect(imp.ideal.preco.preco_sipi).toBe(15);
  });
});

describe('Viabilidade — cenários ideal x limite', () => {
  it('o cenário ideal é INVARIANTE quando só o limite muda; limite herda e sobrescreve', () => {
    const a = avaliar();
    const b = avaliar({}, { margem_pct: 25, lotes_por_mes: 4, preco_venda_un: null });
    expect(b.ideal).toEqual(a.ideal);
    expect(b.limite.premissas.margem_pct).toBe(25);
    expect(b.limite.premissas.lotes_por_mes).toBe(4);
    expect(b.limite.premissas.produto).toBe(IDEAL.produto);
    expect(b.limite.premissas.cmp_base_mp_kg).toBe(IDEAL.cmp_base_mp_kg);
    expect(b.limite.preco.margem_origem).toBe('manual');
    expect(b.limite.preco.margem_pct).toBe(25);
    expect(b.limite.preco.preco_sipi).toBeLessThan(a.ideal.preco.preco_sipi);
    // sem limite informado: limite == ideal
    expect(a.limite.preco).toEqual(a.ideal.preco);
  });

  it('espelho: diferença = limite - ideal nos principais números', () => {
    const r = avaliar({ custo_fixo_incremental_mes: 1000 }, { margem_pct: 30, lotes_por_mes: 3 });
    const linha = (campo: string) => r.espelho.find((l) => l.campo === campo)!;
    expect(linha('preco_sipi').diferenca).toBeCloseTo(r.limite.preco.preco_sipi - r.ideal.preco.preco_sipi, 4);
    expect(linha('preco_sipi').diferenca!).toBeLessThan(0);
    expect(linha('margem_pct').ideal).toBe(40);
    expect(linha('margem_pct').limite).toBe(30);
    expect(linha('lucro_mes').diferenca).toBeCloseTo(
      r.limite.dre_mensal.lucro_operacional - r.ideal.dre_mensal.lucro_operacional,
      2,
    );
    expect(linha('ocupacao_pct').limite).toBeCloseTo(linha('ocupacao_pct').ideal! * 3, 3);
    expect(r.espelho.map((l) => l.campo)).toEqual(
      expect.arrayContaining(['preco_sipi', 'margem_pct', 'lucro_mes', 'pe_un_mes', 'ocupacao_pct', 'payback_meses']),
    );
  });

  it('determinístico: duas avaliações iguais produzem resultados idênticos', () => {
    const p = { custo_fixo_incremental_mes: 1500, ocupacao_atual_pct: 90, lotes_por_mes: 8, custo_hora_extra_hora: 40 };
    expect(avaliar(p, { preco_venda_un: 20 })).toEqual(avaliar(p, { preco_venda_un: 20 }));
  });
});

describe('Viabilidade — regra 6 (sem defaults silenciosos) e rastreabilidade', () => {
  it('campos obrigatórios ausentes: erro listando o que falta', () => {
    const { volume_un: _v, un_min: _u, horizonte_meses: _h, ...semCampos } = IDEAL;
    void _v; void _u; void _h;
    expect(() => avaliarViabilidade({ ideal: semCampos as PremissasCenario }, CTX)).toThrow(
      /cenario ideal: .*volume_un.*un_min.*horizonte_meses/,
    );
    expect(() => validarPremissas({ ...IDEAL, investimento_brl: 1000, investimento_meses_depreciacao: 0 }, 'x')).toThrow(
      /investimento_meses_depreciacao/,
    );
    expect(() => validarPremissas({ ...IDEAL, modo_operacao: 'outro' as never }, 'x')).toThrow(/modo_operacao/);
    expect(() => avaliarViabilidade({ ideal: IDEAL, limite: { quantidade: 0 } }, CTX)).toThrow(/cenario limite: .*quantidade/);
    expect(() => avaliarViabilidade({} as never, CTX)).toThrow(/cenario ideal/);
  });

  it('premissas_usadas, fundamentos e vigências declarados; strings só em Latin-1', () => {
    const r = avaliar({ custo_fixo_incremental_mes: 500 }, { preco_venda_un: 12, ocupacao_atual_pct: 99, lotes_por_mes: 10 });
    expect(r.premissas_usadas.length).toBeGreaterThan(5);
    expect(r.fundamentos.some((f) => f.includes('art. 34'))).toBe(true);
    expect(r.vigencias_parametros).toEqual(CTX.vigencias);
    expect(r.contexto.lote_minimo_un).toBe(500);
    // tudo que vai para o JSON gravado precisa caber em Latin-1 (sem "−", "≥", "→", "—");
    // os fundamentos da matriz fiscal trazem travessão e são convertidos, não perdidos.
    const json = JSON.stringify(r);
    expect(/^[\u0000-ÿ]*$/.test(json)).toBe(true);
    expect(r.fundamentos.some((f) => f.includes('RICMS/SP - cliente RPA'))).toBe(true);
    expect(r.ideal.alertas.length).toBeGreaterThan(0);
  });

  it('paraLatin1 converte pontuação fora do Latin-1 e marca o resto com "?"', () => {
    expect(paraLatin1('a — b → c ≥ d ≠ e … “f”')).toBe('a - b -> c >= d != e ... "f"');
    expect(paraLatin1('ação ç ã × R$')).toBe('ação ç ã × R$');
    expect(paraLatin1('emoji \u{1F600} fim')).toBe('emoji ?? fim');
  });

  it('resumo para lista/audit: preços e lucro dos dois cenários; tolerante a null', () => {
    const r = avaliar({}, { margem_pct: 30 });
    const s = resumoViabilidade(r);
    expect(s.ideal?.preco_sipi).toBe(r.ideal.preco.preco_sipi);
    expect(s.limite?.margem_pct).toBe(30);
    expect(s.ideal?.lucro_mes).toBe(r.ideal.dre_mensal.lucro_operacional);
    expect(resumoViabilidade(null)).toEqual({ ideal: null, limite: null });
  });
});
