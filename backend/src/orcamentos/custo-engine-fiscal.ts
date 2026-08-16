/**
 * ENGINE FISCAL v3 (F4 Fase A) — DETERMINÍSTICO e PURO. NÃO substitui o
 * custo-engine vigente: roda em PARALELO atrás do comparador até o corte
 * aprovado (D6/gate). Diferenças estruturais vs vigente:
 *
 *  - D1: SEM o flat de 37,5% sobre a MP (o custo de material entra pelo valor
 *    da cotação; o "colchão" sai e os tributos de SAÍDA entram corretos).
 *  - SEM o flat de 9,25% sobre a MO como "imposto de custo" (parecer: encargos
 *    de folha são custo operacional, não alíquota; PIS/COFINS incidem sobre a
 *    RECEITA e entram por dentro do preço, por parcela).
 *  - IPI por NCM+EX+tratamento e por MODO (base total vs material), por fora.
 *  - Tributos "por dentro": preço da parcela = custo / (1 − margem − icms −
 *    pis − cofins). ICMS diferido não onera o preço (responsabilidade segue
 *    pro encomendante — análise §4.4).
 *  - Quando o IPI integra a base do ICMS (perfil do cliente), o ICMS sobre o
 *    IPI é somado por fora como componente EXPLÍCITO (icms_sobre_ipi) — nada
 *    embutido silenciosamente.
 *
 * MO — CORTE F3 (rodada 2, ago/2026): modelo de 3 componentes. SAÍRAM a folha
 * inteira como base, o `Math.ceil` de dia inteiro e o 480 fixo. ENTRARAM setup
 * diluído por lote + corrida sobre capacidade normal, com taxa/minuto e minutos
 * produtivos SEMPRE derivados de `parametro_producao` (nunca literais).
 * Decisão auditável em `prisma/comparar-mo-rodada2.ts`.
 */
import { avaliarMoq, calcularCustoProducao, type ParametrosProducao } from './custo-producao.util';
import type { TributosSaida, TributosParcela } from './matriz-fiscal.util';

export interface InputsFiscal {
  cmp_base_mp_kg: number; // custo de MP por kg (cotação — SEM colchão)
  volume_un: number; // mL/g por unidade
  quantidade: number;
  un_min: number;
  margem_pct: number;
  embalagem_un?: number;
  /**
   * MPs da composição SEM preço (regra 6 — falha visível): elas entram no
   * cálculo valendo R$0, então o custo de material sai SUBESTIMADO. Não
   * bloqueia (o comercial às vezes precisa cotar com fórmula incompleta), mas
   * o aviso é propagado para tela e PDF — nunca só o score baixo.
   */
  mp_sem_preco?: string[];
}

/**
 * Parâmetros OPERACIONAIS (não fiscais).
 * `producao` vem de `parametro_producao` (versionado, com fonte) — substituiu
 * mo_folha_mensal/mo_dias_uteis no cálculo da MO no corte F3.
 */
export interface ParametrosOperacionaisFiscal {
  producao: ParametrosProducao;
  desvio_mp_pct: number;
  frete_un_brl: number;
}

const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));

/** % de tributos "por dentro" de uma parcela (diferido/zero não oneram). */
function taxaPorDentro(t: TributosParcela): number {
  const icms = t.icms.tipo === 'tributado' ? t.icms.pct : 0;
  return icms + t.pis_pct + t.cofins_pct;
}

/** preço da parcela com margem e tributos por dentro (gross-up). */
function precoParcela(custo: number, margem: number, taxa: number): number {
  const divisor = 1 - (margem + taxa) / 100;
  if (divisor <= 0.01) {
    throw new Error(`margem (${margem}%) + tributos (${taxa}%) inviabilizam o preço (divisor <= 1%)`);
  }
  return custo / divisor;
}

export function calcularCustoFiscal(
  inputs: InputsFiscal,
  oper: ParametrosOperacionaisFiscal,
  tributos: TributosSaida,
) {
  const volume_kg = inputs.volume_un / 1000;
  const quantidade = Math.max(1, inputs.quantidade);
  const margem = Math.min(99, Math.max(0, inputs.margem_pct));

  // ---- custo de material por unidade (SEM flat de imposto — D1) ----
  const mp_base = inputs.cmp_base_mp_kg * volume_kg;
  const desvio = mp_base * (oper.desvio_mp_pct / 100);
  const embalagem = inputs.embalagem_un ?? 0;
  const frete = oper.frete_un_brl;
  const custo_material_un = mp_base + desvio + embalagem + frete;

  // ---- custo de PRODUÇÃO por unidade (3 componentes — corte F3) ----
  // setup por ORDEM diluído no lote + corrida em minuto produtivo, ambos sobre
  // a taxa derivada da capacidade NORMAL. Sem ceil de dia, sem 480 fixo.
  const prod = calcularCustoProducao(oper.producao, inputs.un_min, quantidade);
  const mo_un = prod.custo_producao_un;
  const un_dia = prod.producao_dia_linha;

  // ALERTA de MOQ econômico (derivado; não bloqueia, não muda preço).
  // Variável = o que escala com a quantidade: material + corrida (sem setup).
  const alerta_moq = avaliarMoq(
    prod.custo_setup_ordem,
    custo_material_un + prod.corrida_un,
    quantidade,
    oper.producao.moq_economico_valor,
  );

  // ---- parcelas por modo ----
  // industrializacao: custo de material próprio residual (se houver) entra como
  // CUSTO da parcela de execução — não existe parcela de receita de material.
  const parcelas: {
    material: null | { custo_un: number; taxa_pct: number; preco_un: number };
    mo: null | { custo_un: number; taxa_pct: number; preco_un: number };
  } = { material: null, mo: null };

  if (tributos.modo === 'full_service') {
    const taxa = taxaPorDentro(tributos.material!);
    const custo = custo_material_un + mo_un;
    parcelas.material = { custo_un: custo, taxa_pct: taxa, preco_un: precoParcela(custo, margem, taxa) };
  } else if (tributos.modo === 'hibrido') {
    const taxaMat = taxaPorDentro(tributos.material!);
    const taxaMo = taxaPorDentro(tributos.mo!);
    parcelas.material = {
      custo_un: custo_material_un,
      taxa_pct: taxaMat,
      preco_un: precoParcela(custo_material_un, margem, taxaMat),
    };
    parcelas.mo = { custo_un: mo_un, taxa_pct: taxaMo, preco_un: precoParcela(mo_un, margem, taxaMo) };
  } else {
    const taxaMo = taxaPorDentro(tributos.mo!);
    const custo = custo_material_un + mo_un; // material residual vira custo da execução
    parcelas.mo = { custo_un: custo, taxa_pct: taxaMo, preco_un: precoParcela(custo, margem, taxaMo) };
  }

  const preco_sipi =
    (parcelas.material?.preco_un ?? 0) + (parcelas.mo?.preco_un ?? 0);

  // ---- IPI por fora, na base correta do modo ----
  const parcelaIpi = tributos.material; // IPI só existe onde há parcela de produto
  const ipi_pct = parcelaIpi?.ipi.tipo === 'tributado' ? parcelaIpi.ipi.pct : 0;
  const base_ipi_valor =
    tributos.base_ipi === 'total' ? preco_sipi
    : tributos.base_ipi === 'material' ? (parcelas.material?.preco_un ?? 0)
    : 0;
  const ipi_un = base_ipi_valor * (ipi_pct / 100);

  // ---- ICMS sobre o IPI (quando o IPI integra a base do ICMS) — explícito ----
  const icms_sobre_ipi =
    parcelaIpi && parcelaIpi.icms_base_inclui_ipi && parcelaIpi.icms.tipo === 'tributado'
      ? ipi_un * (parcelaIpi.icms.pct / 100)
      : 0;

  const preco_cipi = preco_sipi + ipi_un + icms_sobre_ipi;

  return {
    material: {
      mp_base: r4(mp_base),
      desvio: r4(desvio),
      embalagem: r4(embalagem),
      frete: r2(frete),
      custo_material_un: r4(custo_material_un),
    },
    // ---- ALERTAS derivados no cálculo (não bloqueiam, não mudam preço) ----
    alertas: {
      moq: alerta_moq,
      mp_sem_preco:
        inputs.mp_sem_preco && inputs.mp_sem_preco.length > 0
          ? { quantidade: inputs.mp_sem_preco.length, nomes: inputs.mp_sem_preco }
          : null,
    },
    // Forma 3.1 — MO de 3 componentes. `dias_necessarios` NÃO existe mais
    // (era o artefato do ceil). Snapshots antigos preservam a forma antiga:
    // o renderer e o PDF toleram as duas (fronteira tese 2).
    mao_de_obra: {
      taxa_minuto: prod.taxa_minuto,
      custo_setup_ordem: prod.custo_setup_ordem,
      minutos_produtivos_dia_linha: prod.minutos_produtivos_dia_linha,
      producao_diaria: r2(un_dia),
      setup_un: prod.setup_un,
      corrida_un: prod.corrida_un,
      mo_un: r4(mo_un),
    },
    parcelas: {
      material: parcelas.material && {
        custo_un: r4(parcelas.material.custo_un),
        taxa_pct: r4(parcelas.material.taxa_pct),
        preco_un: r4(parcelas.material.preco_un),
      },
      mo: parcelas.mo && {
        custo_un: r4(parcelas.mo.custo_un),
        taxa_pct: r4(parcelas.mo.taxa_pct),
        preco_un: r4(parcelas.mo.preco_un),
      },
    },
    resultado: {
      margem_pct: margem,
      preco_sipi: r2(preco_sipi),
      ipi_pct,
      base_ipi: tributos.base_ipi,
      ipi_un: r2(ipi_un),
      icms_sobre_ipi: r2(icms_sobre_ipi),
      preco_cipi: r2(preco_cipi),
    },
    fundamentos: tributos.fundamentos,
  };
}

export type CalculoCustoFiscal = ReturnType<typeof calcularCustoFiscal>;
