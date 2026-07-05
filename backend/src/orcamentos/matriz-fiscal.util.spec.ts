/**
 * Specs da MATRIZ FISCAL (F4 Fase A) — cenários do parecer do contador
 * (docs/fiscal/validacao-fiscal-private-studio-objetiva.md §5) + a DANFE real
 * da análise híbrida reconstruída número a número (§4).
 */
import {
  resolverTributosSaida,
  NcmFiscal,
  ParametrosFiscaisVigentes,
  PerfilClienteFiscal,
} from './matriz-fiscal.util';

// Valores VALIDADOS pelo contador (mesmos do seed da parametro_fiscal).
const PARAMS: ParametrosFiscaisVigentes = {
  pis_monofasico_pct: 2.2,
  cofins_monofasico_pct: 10.3,
  pis_comum_pct: 1.65,
  cofins_comum_pct: 7.6,
  icms_carga_art34_pct: 12,
  icms_nominal_padrao_pct: 18,
};

// NCM do perfume da DANFE (3303.00.10 — TIPI 27,3%, monofásico, ICMS nominal SP 25%).
const PERFUME: NcmFiscal = {
  ncm: '3303.00.10', ex_tipi: '', ipi_pct: 27.3, monofasico: true,
  tratamento: 'tributado', icms_nominal_pct: 25,
};
// NCM não-monofásico (3401.30.00 — 6,5%).
const SABONETE_LIQ: NcmFiscal = {
  ncm: '3401.30.00', ex_tipi: '', ipi_pct: 6.5, monofasico: false,
  tratamento: 'tributado', icms_nominal_pct: null,
};

const CLIENTE_RPA_SP: PerfilClienteFiscal = {
  regime_fiscal: 'lucro_real_presumido', finalidade: 'revenda', uf: 'SP', contribuinte_icms: true,
};
const CLIENTE_SIMPLES: PerfilClienteFiscal = {
  regime_fiscal: 'simples', finalidade: 'revenda', uf: 'SP', contribuinte_icms: true,
};
const CONSUMIDOR_FINAL: PerfilClienteFiscal = {
  regime_fiscal: 'consumidor_final_cpf', finalidade: 'uso_proprio', uf: 'SP', contribuinte_icms: false,
};
const PERFIL_VAZIO: PerfilClienteFiscal = {
  regime_fiscal: null, finalidade: null, uf: null, contribuinte_icms: null,
};

const OFF = { industrializacao_caracterizada: false };
const ON = {
  industrializacao_caracterizada: true,
  fundamento: 'suspensão caracterizada — parecer 04/07/2026',
};

describe('matriz fiscal — cenário A: full service (parecer §5-A)', () => {
  it('monofásico p/ cliente RPA: 12,5% mono + art.34 + IPI do NCM sobre o total', () => {
    const t = resolverTributosSaida('full_service', CLIENTE_RPA_SP, PERFUME, PARAMS, OFF);
    expect(t.material!.pis_pct + t.material!.cofins_pct).toBeCloseTo(12.5);
    expect(t.material!.icms.pct).toBe(12); // art.34
    expect(t.material!.icms_base_inclui_ipi).toBe(false); // contribuinte + revenda
    expect(t.material!.ipi).toEqual({ tipo: 'tributado', pct: 27.3 });
    expect(t.base_ipi).toBe('total');
    expect(t.mo).toBeNull();
  });

  it('não-monofásico: 9,25% comum; cliente RPA mantém art.34 (12%)', () => {
    const t = resolverTributosSaida('full_service', CLIENTE_RPA_SP, SABONETE_LIQ, PARAMS, OFF);
    expect(t.material!.pis_pct + t.material!.cofins_pct).toBeCloseTo(9.25);
    expect(t.material!.icms.pct).toBe(12); // art.34 independe do monofásico
  });

  it('NCM sem icms_nominal_pct + cliente não-elegível: fallback no padrão (18)', () => {
    const t = resolverTributosSaida('full_service', CLIENTE_SIMPLES, SABONETE_LIQ, PARAMS, OFF);
    expect(t.material!.icms.pct).toBe(18); // sem nominal no NCM -> icms_nominal_padrao_pct
  });

  it('tratamento aliquota_zero zera o IPI mesmo com pct cadastrado', () => {
    const zero: NcmFiscal = { ...PERFUME, tratamento: 'aliquota_zero' };
    const t = resolverTributosSaida('full_service', CLIENTE_RPA_SP, zero, PARAMS, OFF);
    expect(t.material!.ipi.pct).toBe(0);
    expect(t.base_ipi).toBe('nao_aplica');
  });
});

describe('matriz fiscal — cenário B: industrialização por encomenda (parecer §5-B)', () => {
  it('caracterizada + monofásico + RPA/SP: MO com PIS/COFINS 0% e ICMS diferido', () => {
    const t = resolverTributosSaida('industrializacao', CLIENTE_RPA_SP, PERFUME, PARAMS, ON);
    expect(t.material).toBeNull();
    expect(t.mo!.pis_pct).toBe(0); // Cosit 53/2022
    expect(t.mo!.cofins_pct).toBe(0);
    expect(t.mo!.icms.tipo).toBe('diferido'); // CAT 22/2007
    expect(t.mo!.ipi.tipo).toBe('nao_tributado');
  });

  it('NÃO caracterizada (default): MO conservadora — 9,25% e ICMS tributado', () => {
    const t = resolverTributosSaida('industrializacao', CLIENTE_RPA_SP, PERFUME, PARAMS, OFF);
    expect(t.mo!.pis_pct + t.mo!.cofins_pct).toBeCloseTo(9.25);
    expect(t.mo!.icms.tipo).toBe('tributado');
  });

  it('produto não-monofásico: Cosit 53 não se aplica — MO a 9,25% mesmo caracterizada', () => {
    const t = resolverTributosSaida('industrializacao', CLIENTE_RPA_SP, SABONETE_LIQ, PARAMS, ON);
    expect(t.mo!.pis_pct + t.mo!.cofins_pct).toBeCloseTo(9.25);
    expect(t.mo!.icms.tipo).toBe('diferido'); // diferimento independe do monofásico
  });
});

describe('matriz fiscal — cenário C: cliente do Simples / consumidor final (parecer §5-C)', () => {
  it('Simples: sem art.34 (nominal 25 do NCM), sem diferimento; federais inalterados', () => {
    const t = resolverTributosSaida('hibrido', CLIENTE_SIMPLES, PERFUME, PARAMS, ON);
    expect(t.material!.icms.pct).toBe(25); // nominal do NCM, não 12
    expect(t.mo!.icms.tipo).toBe('tributado'); // diferimento vedado p/ Simples
    expect(t.material!.pis_pct + t.material!.cofins_pct).toBeCloseTo(12.5); // federal não muda
    expect(t.mo!.pis_pct).toBe(0); // Cosit 53 independe do regime do cliente
  });

  it('consumidor final: sem art.34, IPI integra a base do ICMS', () => {
    const t = resolverTributosSaida('full_service', CONSUMIDOR_FINAL, PERFUME, PARAMS, OFF);
    expect(t.material!.icms.pct).toBe(25);
    expect(t.material!.icms_base_inclui_ipi).toBe(true);
  });

  it('perfil vazio (null): pior caso — sem art.34, sem diferimento, IPI na base', () => {
    const t = resolverTributosSaida('hibrido', PERFIL_VAZIO, PERFUME, PARAMS, ON);
    expect(t.material!.icms.pct).toBe(25);
    expect(t.material!.icms_base_inclui_ipi).toBe(true);
    expect(t.mo!.icms.tipo).toBe('tributado'); // diferimento exige perfil completo
    expect(t.fundamentos.join(' ')).toContain('pior caso');
  });
});

describe('matriz fiscal — DANFE Memoire reconstruída (análise híbrida §2/§4)', () => {
  // Nota real: material R$25 (perfume 3303.00.10) + MO R$45, CFOP 5.124.
  // A reconstrução exata do parecer usa: carga 12% COM IPI na base (redução 52%),
  // monofásico no material com base excluindo o ICMS, MO no regime comum.
  const r2 = (n: number) => Number(n.toFixed(2));
  const MATERIAL = 25.0;
  const MO = 45.0;

  it('reproduz os números da nota como emitida (IPI 6,83; ICMS 3,82; PIS 1,21; COFINS 5,60)', () => {
    // IPI destacado: só sobre o material (como a nota fez)
    const ipi = r2(MATERIAL * (PERFUME.ipi_pct / 100));
    expect(ipi).toBe(6.83); // §4.1

    // ICMS: base com IPI, redução de 52% (carga efetiva 12%), nominal 25%
    const baseComIpi = MATERIAL + ipi; // 31,83
    const icms = r2(Number((baseComIpi * 0.48).toFixed(2)) * 0.25);
    expect(icms).toBe(3.82); // §4.2
    expect(r2(baseComIpi * (PARAMS.icms_carga_art34_pct / 100))).toBe(3.82); // carga efetiva 12%

    // PIS/COFINS do material: monofásico sobre base excluindo o ICMS destacado
    const baseMono = r2(MATERIAL - icms); // 21,18
    const pisMat = r2(baseMono * (PARAMS.pis_monofasico_pct / 100));
    const cofinsMat = r2(baseMono * (PARAMS.cofins_monofasico_pct / 100));
    expect(pisMat).toBe(0.47);
    expect(cofinsMat).toBe(2.18);

    // MO: a nota usou o regime comum (9,25%)
    const pisMo = r2(MO * (PARAMS.pis_comum_pct / 100));
    const cofinsMo = r2(MO * (PARAMS.cofins_comum_pct / 100));
    expect(pisMo).toBe(0.74);
    expect(cofinsMo).toBe(3.42);

    // Fechamento exato do DANFE (§4.5)
    expect(r2(pisMat + pisMo)).toBe(1.21);
    expect(r2(cofinsMat + cofinsMo)).toBe(5.6);
  });

  it('a matriz recomenda 0% na MO (Cosit 53) — a nota tributou R$4,16 a maior (§5)', () => {
    const t = resolverTributosSaida('hibrido', CLIENTE_RPA_SP, PERFUME, PARAMS, ON);
    expect(t.mo!.pis_pct).toBe(0);
    expect(t.mo!.cofins_pct).toBe(0);
    // diferença apontada no parecer: 0,74 + 3,42 = 4,16 pagos a maior na MO
    const aMaior = r2(MO * ((PARAMS.pis_comum_pct + PARAMS.cofins_comum_pct) / 100));
    expect(aMaior).toBe(4.16);
  });

  it('sem suspensão caracterizada, a base do IPI é o TOTAL (risco de R$12,28 apontado no §6)', () => {
    const t = resolverTributosSaida('hibrido', CLIENTE_RPA_SP, PERFUME, PARAMS, OFF);
    expect(t.base_ipi).toBe('total');
    const ipiTotal = r2((MATERIAL + MO) * (PERFUME.ipi_pct / 100));
    expect(ipiTotal).toBe(19.11); // 70 × 27,3%
    expect(r2(ipiTotal - 6.83)).toBe(12.28); // diferença da nota
  });

  it('com suspensão caracterizada, IPI só sobre o material (como a nota fez)', () => {
    const t = resolverTributosSaida('hibrido', CLIENTE_RPA_SP, PERFUME, PARAMS, ON);
    expect(t.base_ipi).toBe('material');
  });
});
