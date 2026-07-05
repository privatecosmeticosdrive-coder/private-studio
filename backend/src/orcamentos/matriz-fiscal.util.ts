/**
 * MATRIZ FISCAL DE SAÍDA (F4 Fase A) — função PURA, zero banco.
 *
 * (modo_operacao × perfil do cliente × NCM/EX/tratamento) -> tributos por
 * parcela (material vs mão de obra), com DEFAULTS CONSERVADORES (D4) e
 * benefícios opt-in condicionados. Cada benefício aplicado (ou negado) emite
 * um fundamento auditável — o JSON_CALC carrega o porquê de cada alíquota.
 *
 * Fonte de negócio: docs/fiscal/validacao-fiscal-private-studio-objetiva.md
 * (§2, §4, §5) e docs/fiscal/analise-operacao-hibrida... (§5, §6, §10).
 * NENHUMA alíquota mora aqui: tudo chega via ParametrosFiscaisVigentes
 * (tabela parametro_fiscal) e NcmFiscal (tabela ncm) — D4.
 */

export type ModoOperacao = 'full_service' | 'hibrido' | 'industrializacao';
export type TratamentoIpi = 'tributado' | 'aliquota_zero' | 'suspenso' | 'isento' | 'nao_tributado';

export interface PerfilClienteFiscal {
  regime_fiscal: 'simples' | 'lucro_real_presumido' | 'consumidor_final_cpf' | null;
  finalidade: 'revenda' | 'industrializacao' | 'uso_proprio' | null;
  uf: string | null;
  contribuinte_icms: boolean | null;
}

export interface NcmFiscal {
  ncm: string;
  ex_tipi: string; // '' = sem EX
  ipi_pct: number;
  monofasico: boolean;
  tratamento: TratamentoIpi;
  icms_nominal_pct: number | null; // null -> icms_nominal_padrao_pct
}

/** Valores vigentes lidos da tabela parametro_fiscal (nunca hardcoded). */
export interface ParametrosFiscaisVigentes {
  pis_monofasico_pct: number;
  cofins_monofasico_pct: number;
  pis_comum_pct: number;
  cofins_comum_pct: number;
  icms_carga_art34_pct: number;
  icms_nominal_padrao_pct: number;
}

/**
 * Flags jurídicas documentadas (A3). industrializacao_caracterizada = a operação
 * cumpre os requisitos de industrialização por encomenda (art. 402 RICMS/SP +
 * Cosit 53/2022). Default OFF no sistema; admin liga com fundamento.
 */
export interface CaracterizacaoFiscal {
  industrializacao_caracterizada: boolean;
  fundamento?: string;
}

export interface TributosParcela {
  icms: { tipo: 'tributado' | 'diferido'; pct: number };
  /** IPI integra a base do ICMS? (§4.3 da análise: não integra entre contribuintes p/ revenda/industrialização) */
  icms_base_inclui_ipi: boolean;
  pis_pct: number;
  cofins_pct: number;
  ipi: { tipo: TratamentoIpi; pct: number };
}

export interface TributosSaida {
  modo: ModoOperacao;
  /** full_service: parcela única (produto). hibrido: material próprio. industrializacao: null. */
  material: TributosParcela | null;
  /** mão de obra/execução (hibrido e industrializacao). full_service: null. */
  mo: TributosParcela | null;
  /** base do IPI quando tributado no híbrido: 'total' (sem suspensão) ou 'material' (suspensão caracterizada) — §6 da análise. */
  base_ipi: 'total' | 'material' | 'nao_aplica';
  fundamentos: string[];
}

/** IPI efetivo pelo tratamento do NCM (parecer §4: tratamento manda, não só alíquota). */
function ipiPorTratamento(ncm: NcmFiscal): { tipo: TratamentoIpi; pct: number } {
  return ncm.tratamento === 'tributado'
    ? { tipo: 'tributado', pct: ncm.ipi_pct }
    : { tipo: ncm.tratamento, pct: 0 };
}

export function resolverTributosSaida(
  modo: ModoOperacao,
  perfil: PerfilClienteFiscal,
  ncm: NcmFiscal,
  params: ParametrosFiscaisVigentes,
  caracterizacao: CaracterizacaoFiscal,
): TributosSaida {
  const fundamentos: string[] = [];
  const fMaterial: string[] = []; // só entram no output quando há parcela de material

  // ---------- perfil efetivo (null = pior caso, D3/D4) ----------
  const regime = perfil.regime_fiscal;
  const consumidorFinal = regime === 'consumidor_final_cpf' || perfil.finalidade === 'uso_proprio';
  const revendaOuInd = perfil.finalidade === 'revenda' || perfil.finalidade === 'industrializacao';
  if (regime === null) {
    fundamentos.push('Perfil fiscal do cliente não informado — tratado como pior caso (sem benefícios de ICMS).');
  }

  // ---------- ICMS da parcela de produto/material ----------
  // art.34 Anexo II RICMS/SP (carga efetiva 12%): saída interna, destinatário
  // NÃO-Simples e NÃO-consumidor-final, para revenda/industrialização.
  const art34 = regime === 'lucro_real_presumido' && !consumidorFinal && revendaOuInd;
  const icmsNominal = ncm.icms_nominal_pct ?? params.icms_nominal_padrao_pct;
  const icmsMaterialPct = art34 ? params.icms_carga_art34_pct : icmsNominal;
  fMaterial.push(
    art34
      ? `ICMS do material: carga efetiva ${params.icms_carga_art34_pct}% (art. 34, Anexo II, RICMS/SP — cliente RPA, finalidade ${perfil.finalidade}).`
      : `ICMS do material: alíquota nominal ${icmsMaterialPct}% (art. 34 não aplicável: ${regime === 'simples' ? 'cliente do Simples' : consumidorFinal ? 'consumidor final' : 'perfil não elegível/não informado'}).`,
  );

  // IPI na base do ICMS: NÃO integra quando ambos contribuintes e destino
  // revenda/industrialização (§4.3). Conservador: integra nos demais casos.
  const ipiForaDaBase = perfil.contribuinte_icms === true && revendaOuInd;
  if (!ipiForaDaBase) {
    fMaterial.push('IPI integra a base do ICMS (destinatário não-contribuinte, consumidor final ou perfil não informado).');
  }

  // ---------- PIS/COFINS ----------
  // Monofásico (Lei 10.147/2000): só na receita de PRODUTO do fabricante.
  const pisCofinsMaterial = ncm.monofasico
    ? { pis: params.pis_monofasico_pct, cofins: params.cofins_monofasico_pct }
    : { pis: params.pis_comum_pct, cofins: params.cofins_comum_pct };
  fMaterial.push(
    ncm.monofasico
      ? `PIS/COFINS do material: monofásico ${params.pis_monofasico_pct}%+${params.cofins_monofasico_pct}% (Lei 10.147/2000 — NCM ${ncm.ncm}${ncm.ex_tipi ? ' ' + ncm.ex_tipi : ''} abrangido).`
      : `PIS/COFINS do material: regime comum ${params.pis_comum_pct}%+${params.cofins_comum_pct}% (NCM não monofásico).`,
  );

  const ipi = ipiPorTratamento(ncm);
  if (ipi.tipo !== 'tributado') {
    fMaterial.push(`IPI: ${ipi.tipo} (tratamento do NCM ${ncm.ncm}${ncm.ex_tipi ? ' ' + ncm.ex_tipi : ''} na TIPI).`);
  }

  const parcelaMaterial: TributosParcela = {
    icms: { tipo: 'tributado', pct: icmsMaterialPct },
    icms_base_inclui_ipi: !ipiForaDaBase,
    pis_pct: pisCofinsMaterial.pis,
    cofins_pct: pisCofinsMaterial.cofins,
    ipi,
  };

  // ---------- FULL SERVICE: parcela única (material) ----------
  if (modo === 'full_service') {
    fundamentos.push(...fMaterial, 'Full service: tributação integral da venda do produto (parcela única).');
    return { modo, material: parcelaMaterial, mo: null, base_ipi: ipi.tipo === 'tributado' ? 'total' : 'nao_aplica', fundamentos };
  }

  // ---------- MÃO DE OBRA (hibrido e industrializacao) ----------
  const fMo: string[] = [];
  const caract = caracterizacao.industrializacao_caracterizada;
  if (!caract) {
    fMo.push('Industrialização por encomenda NÃO caracterizada (flag OFF) — MO tributada de forma conservadora.');
  } else if (caracterizacao.fundamento) {
    fMo.push(`Industrialização caracterizada: ${caracterizacao.fundamento}`);
  }

  // Diferimento paulista da MO (Portaria CAT 22/2007 + art. 402 RICMS/SP):
  // SP interno + cliente RPA + contribuinte + caracterizada. Simples/consumidor final: NUNCA.
  const diferimento =
    caract &&
    perfil.uf === 'SP' &&
    regime === 'lucro_real_presumido' &&
    perfil.contribuinte_icms === true &&
    !consumidorFinal;
  fMo.push(
    diferimento
      ? 'ICMS da MO: DIFERIDO (Portaria CAT 22/2007 — SP interno, cliente RPA contribuinte, industrialização caracterizada).'
      : 'ICMS da MO: tributado (condições do diferimento CAT 22/2007 não atendidas).',
  );

  // PIS/COFINS da MO: 0% na execução de encomenda de produto MONOFÁSICO
  // caracterizada (Cosit 53/2022); senão regime comum.
  const moZero = caract && ncm.monofasico;
  fMo.push(
    moZero
      ? 'PIS/COFINS da MO: 0% (Cosit 53/2022 — execução de industrialização por encomenda de produto monofásico).'
      : `PIS/COFINS da MO: regime comum ${params.pis_comum_pct}%+${params.cofins_comum_pct}%.`,
  );

  const parcelaMo: TributosParcela = {
    icms: diferimento
      ? { tipo: 'diferido', pct: 0 }
      : { tipo: 'tributado', pct: params.icms_nominal_padrao_pct },
    icms_base_inclui_ipi: false, // MO não tem IPI próprio
    pis_pct: moZero ? 0 : params.pis_comum_pct,
    cofins_pct: moZero ? 0 : params.cofins_comum_pct,
    ipi: { tipo: 'nao_tributado', pct: 0 }, // linha de MO: IPI não tributado (D2)
  };

  // ---------- INDUSTRIALIZAÇÃO PURA: só MO (SEM fundamentos de material) ----------
  if (modo === 'industrializacao') {
    fundamentos.push(
      ...fMo,
      'Industrialização pura: sem parcela de material próprio (insumos do cliente retornam com suspensão, sem receita).',
    );
    return { modo, material: null, mo: parcelaMo, base_ipi: 'nao_aplica', fundamentos };
  }

  // ---------- HÍBRIDO: material próprio + MO ----------
  // Base do IPI (§6 da análise): SEM suspensão caracterizada, a legislação
  // federal indica IPI sobre o valor TOTAL (material + MO). Com caracterização
  // documentada, IPI incide só sobre o material próprio.
  const baseIpi: TributosSaida['base_ipi'] =
    ipi.tipo !== 'tributado' ? 'nao_aplica' : caract ? 'material' : 'total';
  const fBaseIpi =
    baseIpi === 'total'
      ? 'Base do IPI: valor TOTAL da operação (sem suspensão caracterizada — RIPI/Decreto 7.212/2010; conservador).'
      : baseIpi === 'material'
        ? 'Base do IPI: apenas material próprio (suspensão da parcela de encomenda caracterizada e documentada).'
        : 'IPI não tributado nesta operação.';
  fundamentos.push(...fMaterial, ...fMo, fBaseIpi);

  return { modo, material: parcelaMaterial, mo: parcelaMo, base_ipi: baseIpi, fundamentos };
}
