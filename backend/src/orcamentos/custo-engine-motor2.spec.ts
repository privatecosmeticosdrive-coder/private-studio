/**
 * Specs do MOTOR 2 10/26 — função pura. Os números de referência foram
 * validados pelo dono e pela auditoria financeira de 19–20/10/2026
 * (docs/precificacao/MOTOR-2-10-26.md, seção "Exemplos").
 */
import {
  calcularCustoMotor2,
  margemPorEscada,
  resolverMargem,
  type EscadaMargem,
  type ParametrosMotor2,
} from './custo-engine-motor2';
import {
  resolverTributosSaida,
  type NcmFiscal,
  type PerfilClienteFiscal,
} from './matriz-fiscal.util';

/** Vigência 2026-10 (mesmos valores do seed-motor2-2026-10.cjs). */
const PRODUCAO_2026_10 = {
  custo_fixo_producao_mensal: 101305,
  linhas_paralelas: 2.5,
  eficiencia_producao: 0.82,
  setup_minutos: 60,
  dias_uteis_mes: 22,
  horas_dia: 8,
  moq_economico_valor: 2400,
};

const ESCADA: EscadaMargem = {
  lote_pequeno_pct: 45,
  lote_medio_pct: 40,
  lote_grande_pct: 35,
  lote_medio_min_un: 1000,
  lote_grande_min_un: 5000,
};

const PARAMS: ParametrosMotor2 = {
  producao: PRODUCAO_2026_10,
  perda_mp_pct: 10,
  frete_un_brl: 0.1,
  credito_mp_pct: 21.21,
  credito_emb_pct: 13.82,
  taxa_gestao_embalagem_pct: 15,
  escada: ESCADA,
  lote_minimo_un: 500,
};

const FISCAL = {
  pis_monofasico_pct: 2.2,
  cofins_monofasico_pct: 10.3,
  pis_comum_pct: 1.65,
  cofins_comum_pct: 7.6,
  icms_carga_art34_pct: 12,
  icms_nominal_padrao_pct: 18,
};

/** cliente RPA (lucro real) em SP, revenda, contribuinte — art. 34 → ICMS 12%. */
const RPA_SP: PerfilClienteFiscal = {
  regime_fiscal: 'lucro_real_presumido',
  finalidade: 'revenda',
  uf: 'SP',
  contribuinte_icms: true,
};

const NCM_3305_90: NcmFiscal = {
  ncm: '3305.90.00',
  ex_tipi: '',
  ipi_pct: 0,
  monofasico: true,
  tratamento: 'aliquota_zero',
  icms_nominal_pct: null,
};

const tributosFull = () =>
  resolverTributosSaida('full_service', RPA_SP, NCM_3305_90, FISCAL, {
    industrializacao_caracterizada: false,
  });

/** MP "por unidade" de referência → R$/kg equivalente para o volume. */
const kgDeUn = (mp_un: number, volume_ml: number) => (mp_un * 1000) / volume_ml;

describe('Motor 2 — parâmetros de fábrica da vigência 2026-10', () => {
  it('taxa/minuto ≈ R$ 4,68 e setup/ordem ≈ R$ 280,78', () => {
    const r = calcularCustoMotor2(
      { cmp_base_mp_kg: 100, volume_un: 50, quantidade: 1000, un_min: 6 },
      PARAMS,
      tributosFull(),
    );
    expect(r.mao_de_obra.taxa_minuto).toBeCloseTo(4.68, 2);
    expect(r.mao_de_obra.custo_setup_ordem).toBeCloseTo(280.78, 2);
    expect(r.motor).toBe('Motor 2 10/26');
  });
});

describe('Motor 2 — exemplos de referência (6 un/min, RPA SP, 3305.90)', () => {
  it('Finalizador capilar 50 ml: MP 5,5694/un + embalagem 6,00 → R$ 25,41 (sem embalagem R$ 16,87)', () => {
    const t = tributosFull();
    const com = calcularCustoMotor2(
      {
        cmp_base_mp_kg: kgDeUn(5.5694, 50),
        volume_un: 50,
        quantidade: 1000,
        un_min: 6,
        embalagem_un: 6,
      },
      PARAMS,
      t,
    );
    expect(com.margem).toMatchObject({
      aplicada_pct: 40,
      origem: 'escada',
      faixa: 'medio',
    });
    expect(com.resultado.preco_sipi).toBe(25.41);
    expect(com.resultado.preco_produto_sipi).toBe(16.87);
    expect(com.parcelas.embalagem!.markup_pct).toBe(15);
    expect(com.parcelas.embalagem!.taxa_pct).toBe(24.5); // 12 + 2,2 + 10,3

    const sem = calcularCustoMotor2(
      {
        cmp_base_mp_kg: kgDeUn(5.5694, 50),
        volume_un: 50,
        quantidade: 1000,
        un_min: 6,
      },
      PARAMS,
      t,
    );
    expect(sem.resultado.preco_sipi).toBe(16.87);
    expect(sem.parcelas.embalagem).toBeNull();
  });

  it('Leave-in bruma 150 ml: MP 8,632/un + embalagem 14,96 → R$ 45,65 (sem embalagem R$ 24,34)', () => {
    const r = calcularCustoMotor2(
      {
        cmp_base_mp_kg: kgDeUn(8.632, 150),
        volume_un: 150,
        quantidade: 1000,
        un_min: 6,
        embalagem_un: 14.96,
      },
      PARAMS,
      tributosFull(),
    );
    expect(r.resultado.preco_sipi).toBe(45.65);
    expect(r.resultado.preco_produto_sipi).toBe(24.34);
  });

  it.each([
    [300, 45, 21.78],
    [500, 45, 20.55],
    [5000, 35, 14.23],
  ])(
    'Finalizador sem embalagem, lote %i @%i%% → R$ %f',
    (lote, margemEsperada, preco) => {
      const r = calcularCustoMotor2(
        {
          cmp_base_mp_kg: kgDeUn(5.5694, 50),
          volume_un: 50,
          quantidade: lote,
          un_min: 6,
        },
        PARAMS,
        tributosFull(),
      );
      expect(r.margem.aplicada_pct).toBe(margemEsperada);
      expect(r.resultado.preco_sipi).toBe(preco);
    },
  );

  it('lote 300 dispara alerta BLOQUEANTE de lote mínimo (500) sem lançar', () => {
    const r = calcularCustoMotor2(
      {
        cmp_base_mp_kg: kgDeUn(5.5694, 50),
        volume_un: 50,
        quantidade: 300,
        un_min: 6,
      },
      PARAMS,
      tributosFull(),
    );
    expect(r.alertas.lote_minimo).toMatchObject({
      nivel: 'bloqueante',
      quantidade: 300,
      lote_minimo_un: 500,
    });
    const ok = calcularCustoMotor2(
      {
        cmp_base_mp_kg: kgDeUn(5.5694, 50),
        volume_un: 50,
        quantidade: 500,
        un_min: 6,
      },
      PARAMS,
      tributosFull(),
    );
    expect(ok.alertas.lote_minimo).toBeNull();
  });
});

describe('Motor 2 — material líquido de créditos', () => {
  it('MP = última compra × (1+perda) × (1−crédito_mp); embalagem × (1−crédito_emb)', () => {
    const r = calcularCustoMotor2(
      {
        cmp_base_mp_kg: 100,
        volume_un: 100,
        quantidade: 1000,
        un_min: 6,
        embalagem_un: 10,
      },
      PARAMS,
      tributosFull(),
    );
    expect(r.material.mp_bruta).toBe(10);
    expect(r.material.perda).toBe(1);
    expect(r.material.credito_mp).toBeCloseTo(11 * 0.2121, 4);
    expect(r.material.mp_liquida).toBeCloseTo(11 * (1 - 0.2121), 4);
    expect(r.material.credito_emb).toBeCloseTo(1.382, 4);
    expect(r.material.embalagem_liquida).toBeCloseTo(8.618, 4);
    expect(r.material.frete).toBe(0.1);
  });

  it('embalagem NÃO leva a margem do produto: preço da embalagem independe da margem', () => {
    const base = {
      cmp_base_mp_kg: 100,
      volume_un: 100,
      quantidade: 1000,
      un_min: 6,
      embalagem_un: 10,
    };
    const a = calcularCustoMotor2(
      { ...base, margem_pct: 30 },
      PARAMS,
      tributosFull(),
    );
    const b = calcularCustoMotor2(
      { ...base, margem_pct: 60 },
      PARAMS,
      tributosFull(),
    );
    expect(a.parcelas.embalagem!.preco_un).toBe(b.parcelas.embalagem!.preco_un);
    expect(b.parcelas.produto!.preco_un).toBeGreaterThan(
      a.parcelas.produto!.preco_un,
    );
    // 8,618 / (1 − 0,245 − 0,15)
    expect(a.parcelas.embalagem!.preco_un).toBeCloseTo(8.618 / 0.605, 3);
  });
});

describe('Motor 2 — escada de margem e override', () => {
  it('faixas: <1000 → 45; 1000–4999 → 40; ≥5000 → 35', () => {
    expect(margemPorEscada(999, ESCADA).pct).toBe(45);
    expect(margemPorEscada(1000, ESCADA).pct).toBe(40);
    expect(margemPorEscada(4999, ESCADA).pct).toBe(40);
    expect(margemPorEscada(5000, ESCADA).pct).toBe(35);
  });

  it('override manual é aplicado e REGISTRADO como manual, com a escada ao lado', () => {
    const m = resolverMargem(1000, 33, ESCADA);
    expect(m).toMatchObject({
      aplicada_pct: 33,
      origem: 'manual',
      escada_pct: 40,
      faixa: 'medio',
    });
    expect(resolverMargem(1000, null, ESCADA).origem).toBe('escada');
  });
});

describe('Motor 2 — modos híbrido e industrialização', () => {
  const perfilInd: PerfilClienteFiscal = {
    ...RPA_SP,
    finalidade: 'industrializacao',
  };
  const caract = { industrializacao_caracterizada: true, fundamento: 'teste' };

  it('híbrido: embalagem informada entra 0 e vira alerta; MO precificada à parte com a mesma margem', () => {
    const t = resolverTributosSaida(
      'hibrido',
      perfilInd,
      NCM_3305_90,
      FISCAL,
      caract,
    );
    const r = calcularCustoMotor2(
      {
        cmp_base_mp_kg: 100,
        volume_un: 100,
        quantidade: 1000,
        un_min: 6,
        embalagem_un: 5,
      },
      PARAMS,
      t,
    );
    expect(r.material.embalagem_bruta).toBe(0);
    expect(r.parcelas.embalagem).toBeNull();
    expect(r.alertas.embalagem_ignorada).toMatchObject({
      embalagem_un: 5,
      modo: 'hibrido',
    });
    expect(r.parcelas.produto).not.toBeNull();
    expect(r.parcelas.mo).not.toBeNull();
    expect(r.parcelas.mo!.taxa_pct).toBe(0); // diferido + Cosit 53 (caracterizada)
    expect(r.parcelas.mo!.markup_pct).toBe(40);
    expect(r.resultado.preco_sipi).toBe(
      Number(
        (r.parcelas.produto!.preco_un + r.parcelas.mo!.preco_un).toFixed(2),
      ),
    );
  });

  it('industrialização: material residual + fábrica numa única parcela de execução', () => {
    const t = resolverTributosSaida(
      'industrializacao',
      perfilInd,
      NCM_3305_90,
      FISCAL,
      caract,
    );
    const r = calcularCustoMotor2(
      { cmp_base_mp_kg: 20, volume_un: 100, quantidade: 1000, un_min: 6 },
      PARAMS,
      t,
    );
    expect(r.parcelas.produto).toBeNull();
    expect(r.parcelas.embalagem).toBeNull();
    expect(r.parcelas.mo!.custo_un).toBeCloseTo(
      r.material.mp_liquida + r.material.frete + r.mao_de_obra.mo_un,
      3,
    );
    expect(r.resultado.base_ipi).toBe('nao_aplica');
    expect(r.resultado.ipi_un).toBe(0);
  });
});

describe('Motor 2 — falha visível em entradas inválidas', () => {
  it('quantidade/volume/un_min <= 0 lançam (nunca default silencioso)', () => {
    const t = tributosFull();
    expect(() =>
      calcularCustoMotor2(
        { cmp_base_mp_kg: 1, volume_un: 0, quantidade: 10, un_min: 6 },
        PARAMS,
        t,
      ),
    ).toThrow(/volume_un/);
    expect(() =>
      calcularCustoMotor2(
        { cmp_base_mp_kg: 1, volume_un: 10, quantidade: 0, un_min: 6 },
        PARAMS,
        t,
      ),
    ).toThrow(/quantidade/);
    expect(() =>
      calcularCustoMotor2(
        { cmp_base_mp_kg: 1, volume_un: 10, quantidade: 10, un_min: 0 },
        PARAMS,
        t,
      ),
    ).toThrow(/un_min/);
  });
});
