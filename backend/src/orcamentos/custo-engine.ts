/**
 * Motor de custo Private (Doc 1 §6) — DETERMINISTICO.
 * Toda a aritmetica do orcamento mora aqui (numeros "travados"),
 * independentemente de quem estimou os inputs (heuristica MOCK ou IA REAL).
 *
 * Unidades:
 *  - volume_un em mL/g (densidade ~1 => kg = volume_un / 1000)
 *  - precos de MP em R$/kg
 *  - custos finais por UNIDADE (frasco)
 */

export interface ParametrosCusto {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  imposto_mp_pct: number; // 37.5
  imposto_mo_pct: number; // 9.25
  ipi_pct: number; // 4.55
  desvio_mp_pct: number; // 10
  frete_un_brl: number; // 0.10
}

export interface InputsCusto {
  cmp_base_mp_kg: number; // custo de MP por kg da formula
  volume_un: number; // mL/g por unidade
  quantidade: number; // unidades do lote
  un_min: number; // produtividade informada (unidades/minuto) — Doc 2d §A
  margem_pct: number; // margem alvo (%)
  mp_frag_kg?: number; // custo de fragrancia por kg (opcional)
  embalagem_un?: number; // custo de embalagem por unidade (opcional)
}

/** producao diaria a partir de un/min: un_min × 60min × 8h = un_min × 480 (Doc 2d §A3). */
export function producaoDiaria(un_min: number): number {
  return Math.max(0.01, un_min) * 480;
}

const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));

export function calcularCustoPrivate(inputs: InputsCusto, p: ParametrosCusto) {
  const volume_kg = inputs.volume_un / 1000;
  const quantidade = Math.max(1, inputs.quantidade);

  // --- Custo de Materia-Prima por unidade ---
  const mp_base = inputs.cmp_base_mp_kg * volume_kg;
  const mp_frag = (inputs.mp_frag_kg ?? 0) * volume_kg;
  const desvio = (mp_base + mp_frag) * (p.desvio_mp_pct / 100);
  const embalagem = inputs.embalagem_un ?? 0;
  const frete = p.frete_un_brl;

  const cmp_simp = mp_base + mp_frag + desvio + embalagem + frete;
  const cmp_cimp = cmp_simp * (1 + p.imposto_mp_pct / 100);

  // --- Mao de obra por unidade ---
  const mo_diario = p.mo_folha_mensal / p.mo_dias_uteis;
  const un_dia = producaoDiaria(inputs.un_min); // un_min × 480 (Doc 2d §A3)
  const dias_necessarios = Math.ceil(quantidade / un_dia);
  const mo_lote = mo_diario * dias_necessarios;
  const mo_un = mo_lote / quantidade;
  const cmo_cimp = mo_un * (1 + p.imposto_mo_pct / 100);

  // --- Total, margem, IPI ---
  const custo_total = cmp_cimp + cmo_cimp;
  const margem = Math.min(99, Math.max(0, inputs.margem_pct));
  const preco_sipi = custo_total / (1 - margem / 100);
  const ipi_un = preco_sipi * (p.ipi_pct / 100);
  const preco_cipi = preco_sipi + ipi_un;

  return {
    custo_mp: {
      mp_base: r4(mp_base),
      mp_frag: r4(mp_frag),
      desvio_pct: p.desvio_mp_pct,
      desvio: r4(desvio),
      embalagem: r4(embalagem),
      frete: r2(frete),
      cmp_simp: r4(cmp_simp),
      imposto_mp_pct: p.imposto_mp_pct,
      cmp_cimp: r4(cmp_cimp),
    },
    mao_de_obra: {
      mo_folha_mensal: p.mo_folha_mensal,
      mo_dias_uteis: p.mo_dias_uteis,
      mo_diario: r2(mo_diario),
      un_min: inputs.un_min,
      producao_diaria: r2(un_dia),
      dias_necessarios,
      mo_lote: r2(mo_lote),
      mo_un: r4(mo_un),
      imposto_mo_pct: p.imposto_mo_pct,
      cmo_cimp: r4(cmo_cimp),
    },
    resultado: {
      custo_total: r4(custo_total),
      margem_pct: margem,
      preco_sipi: r2(preco_sipi),
      ipi_pct: p.ipi_pct,
      ipi_un: r2(ipi_un),
      preco_cipi: r2(preco_cipi),
    },
  };
}

export type CalculoCusto = ReturnType<typeof calcularCustoPrivate>;
