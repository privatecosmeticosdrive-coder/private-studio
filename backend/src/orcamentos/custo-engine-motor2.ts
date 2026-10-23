/**
 * MOTOR 2 10/26 — engine de precificação, função PURA e DETERMINÍSTICA.
 *
 * Convive com o Motor 1 (`custo-engine-fiscal.ts`), que fica congelado para
 * reproduzir snapshots antigos e seus goldens. A seleção do motor acontece em
 * `calculo.service.ts` (parâmetro `motor_precificacao` em parametro_producao
 * ou override explícito no CalcularDto). Documento: docs/precificacao/MOTOR-2-10-26.md.
 *
 * O que muda em relação ao Motor 1 (auditoria financeira 19–20/10/2026):
 *  1. MATERIAL — custo líquido de créditos. A MP entra pelo preço da ÚLTIMA
 *     COMPRA (o que o usuário digita) × (1 + perda) × (1 − crédito_mp). A
 *     embalagem entra × (1 − crédito_emb). Os créditos (ICMS + PIS/COFINS + IPI
 *     recuperáveis) foram MEDIDOS nas NFs de entrada de 2026 e são parâmetros
 *     versionados (parametro_fiscal: credito_mp_pct, credito_emb_pct).
 *     Frete por unidade sempre somado.
 *  2. EMBALAGEM NÃO LEVA A MARGEM DO PRODUTO. Ela tem a própria "taxa de
 *     gestão" (default 15%), grossada com os MESMOS tributos por dentro:
 *       preco_embalagem = emb_liquida / (1 − tributos − taxa_gestao)
 *       preco_produto   = (mp_liquida + frete + fabrica) / (1 − tributos − margem)
 *     preço sem IPI = soma; IPI por fora como no Motor 1.
 *  3. ESCADA DE MARGEM automática por lote (lote < 1.000 → 45%; 1.000–4.999 →
 *     40%; ≥ 5.000 → 35%), com override manual permitido e REGISTRADO no
 *     snapshot (`margem.origem`). Lote mínimo aceito = 500 un: abaixo disso o
 *     engine devolve alerta de nível BLOQUEANTE (não lança — a UI mostra).
 *  4. FÁBRICA — mesmo modelo de 3 componentes do Motor 1 (setup por ordem
 *     diluído + corrida sobre capacidade normal), com a vigência 2026-10 de
 *     parametro_producao (custo fixo = pagamentos REAIS, sem encargos simulados).
 *  5. Tributos por dentro: inalterados (matriz-fiscal.util).
 *
 * Toda saída carrega `motor: "Motor 2 10/26"`. O Motor 1 não grava esse campo —
 * renderers discriminam por PRESENÇA (`isCalculoMotor2`), nunca por string
 * mágica em snapshots antigos.
 */
import {
  avaliarMoq,
  calcularCustoProducao,
  type ParametrosProducao,
} from './custo-producao.util';
import type { TributosSaida, TributosParcela } from './matriz-fiscal.util';

export const MOTOR_2_ID = 'Motor 2 10/26' as const;

export interface InputsMotor2 {
  /** custo de MP por kg de fórmula, preço da ÚLTIMA COMPRA (sem colchão). */
  cmp_base_mp_kg: number;
  volume_un: number; // mL/g por unidade (densidade 1,0 — premissa declarada)
  quantidade: number;
  un_min: number;
  /** margem MANUAL (override). null/undefined => escada automática. */
  margem_pct?: number | null;
  /** preço bruto da embalagem por unidade (catálogo), antes do crédito. */
  embalagem_un?: number;
  mp_sem_preco?: string[];
}

export interface EscadaMargem {
  lote_pequeno_pct: number; // lote < lote_medio_min_un
  lote_medio_pct: number; // lote_medio_min_un <= lote < lote_grande_min_un
  lote_grande_pct: number; // lote >= lote_grande_min_un
  lote_medio_min_un: number; // ex.: 1.000
  lote_grande_min_un: number; // ex.: 5.000
}

export interface ParametrosMotor2 {
  producao: ParametrosProducao;
  perda_mp_pct: number; // ex.: 10
  frete_un_brl: number; // ex.: 0,10
  credito_mp_pct: number; // ex.: 21,21 (medido nas NFs de entrada 2026)
  credito_emb_pct: number; // ex.: 13,82
  taxa_gestao_embalagem_pct: number; // ex.: 15
  escada: EscadaMargem;
  lote_minimo_un: number; // ex.: 500
}

export type FaixaLote = 'pequeno' | 'medio' | 'grande';

export interface MargemAplicada {
  aplicada_pct: number;
  origem: 'escada' | 'manual';
  escada_pct: number; // o que a escada daria para este lote (sempre informado)
  faixa: FaixaLote;
  faixa_descricao: string;
}

export interface AlertaLoteMinimo {
  nivel: 'bloqueante';
  quantidade: number;
  lote_minimo_un: number;
  mensagem: string;
}

const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));

/** Teto de (tributos + markup) por dentro: acima disso o preco explode (red team M3). */
export const TETO_MARKUP_TRIBUTOS_PCT = 85;

/** % de tributos "por dentro" de uma parcela (diferido/zero não oneram). */
function taxaPorDentro(t: TributosParcela): number {
  const icms = t.icms.tipo === 'tributado' ? t.icms.pct : 0;
  return icms + t.pis_pct + t.cofins_pct;
}

/** gross-up: custo / (1 − tributos − markup). Falha visível se inviável. */
function grossUp(
  custo: number,
  markup_pct: number,
  taxa_pct: number,
  rotulo: string,
): number {
  const divisor = 1 - (markup_pct + taxa_pct) / 100;
  if (markup_pct + taxa_pct > TETO_MARKUP_TRIBUTOS_PCT) {
    throw new Error(
      `${rotulo}: markup (${markup_pct}%) + tributos (${taxa_pct}%) = ${r2(markup_pct + taxa_pct)}% passam do teto de ${TETO_MARKUP_TRIBUTOS_PCT}% por dentro - preco inviavel. Reduza a margem.`,
    );
  }
  return custo / divisor;
}

/** Escada de margem por tamanho de lote — pura, testável isoladamente. */
export function margemPorEscada(
  quantidade: number,
  e: EscadaMargem,
): { pct: number; faixa: FaixaLote; descricao: string } {
  if (quantidade >= e.lote_grande_min_un) {
    return {
      pct: e.lote_grande_pct,
      faixa: 'grande',
      descricao: `>= ${e.lote_grande_min_un} un`,
    };
  }
  if (quantidade >= e.lote_medio_min_un) {
    return {
      pct: e.lote_medio_pct,
      faixa: 'medio',
      descricao: `${e.lote_medio_min_un}-${e.lote_grande_min_un - 1} un`,
    };
  }
  return {
    pct: e.lote_pequeno_pct,
    faixa: 'pequeno',
    descricao: `< ${e.lote_medio_min_un} un`,
  };
}

export function resolverMargem(
  quantidade: number,
  manual: number | null | undefined,
  e: EscadaMargem,
): MargemAplicada {
  const escada = margemPorEscada(quantidade, e);
  const manualValida = manual != null && Number.isFinite(manual);
  const aplicada = manualValida
    ? Math.min(99, Math.max(0, manual))
    : escada.pct;
  return {
    aplicada_pct: aplicada,
    origem: manualValida ? 'manual' : 'escada',
    escada_pct: escada.pct,
    faixa: escada.faixa,
    faixa_descricao: escada.descricao,
  };
}

export function calcularCustoMotor2(
  inputs: InputsMotor2,
  p: ParametrosMotor2,
  tributos: TributosSaida,
) {
  if (!(inputs.quantidade > 0)) throw new Error('quantidade deve ser > 0.');
  if (!(inputs.volume_un > 0))
    throw new Error('volume_un deve ser > 0 (mL/g por unidade).');
  if (!(inputs.un_min > 0))
    throw new Error('un_min deve ser > 0 (unidades por minuto produtivo).');
  // Faixas dos parametros (red team B2): fora delas o custo liquido fica negativo em silencio.
  if (!(p.credito_mp_pct >= 0 && p.credito_mp_pct < 100))
    throw new Error(`credito_mp_pct = ${p.credito_mp_pct} fora da faixa [0, 100).`);
  if (!(p.credito_emb_pct >= 0 && p.credito_emb_pct < 100))
    throw new Error(`credito_emb_pct = ${p.credito_emb_pct} fora da faixa [0, 100).`);
  if (!(p.perda_mp_pct >= 0)) throw new Error(`perda_mp_pct = ${p.perda_mp_pct} nao pode ser negativa.`);
  if (!(p.frete_un_brl >= 0)) throw new Error(`frete_un_brl = ${p.frete_un_brl} nao pode ser negativo.`);
  if ((inputs.embalagem_un ?? 0) < 0) throw new Error('embalagem_un nao pode ser negativa.');
  if (!(inputs.cmp_base_mp_kg >= 0)) throw new Error('cmp_base_mp_kg nao pode ser negativo.');

  const quantidade = inputs.quantidade;
  const volume_kg = inputs.volume_un / 1000; // premissa: densidade 1,0 g/mL

  // ---- margem: escada automática ou override manual (registrado) ----
  const margem = resolverMargem(quantidade, inputs.margem_pct, p.escada);

  // ---- material: MP líquida de crédito, embalagem líquida de crédito ----
  const mp_bruta = inputs.cmp_base_mp_kg * volume_kg; // preço da última compra × kg/un
  const perda = mp_bruta * (p.perda_mp_pct / 100);
  const mp_com_perda = mp_bruta + perda;
  const credito_mp = mp_com_perda * (p.credito_mp_pct / 100);
  const mp_liquida = mp_com_perda - credito_mp;
  // Frete de MP so existe quando ha MP da Private no preco: na industrializacao
  // pura (cmp = 0, material do cliente) nao se cobra frete de MP (red team A4).
  const frete = mp_bruta > 0 ? p.frete_un_brl : 0;

  // Embalagem só é precificada quando a Private a fornece (full_service). Nos
  // modos híbrido/industrialização o cliente fornece — entra 0 e, se o
  // orçamento trouxe embalagem, isso vira ALERTA (nunca silêncio).
  const embalagem_informada = inputs.embalagem_un ?? 0;
  const embalagemPrecificada = tributos.modo === 'full_service';
  const embalagem_bruta = embalagemPrecificada ? embalagem_informada : 0;
  const credito_emb = embalagem_bruta * (p.credito_emb_pct / 100);
  const embalagem_liquida = embalagem_bruta - credito_emb;

  // ---- fábrica (3 componentes, parametro_producao vigente) ----
  const prod = calcularCustoProducao(p.producao, inputs.un_min, quantidade);
  const fabrica_un = prod.custo_producao_un_exato;

  const custo_produto_un = mp_liquida + frete + fabrica_un; // sem embalagem
  const custo_material_un = mp_liquida + frete + embalagem_liquida;

  // ---- alerta de MOQ econômico (política; não bloqueia) ----
  const alerta_moq = avaliarMoq(
    prod.custo_setup_ordem,
    mp_liquida + frete + embalagem_liquida + prod.corrida_un,
    quantidade,
    p.producao.moq_economico_valor,
  );

  // ---- alerta de lote mínimo (BLOQUEANTE para a UI; o engine não lança) ----
  const alerta_lote_minimo: AlertaLoteMinimo | null =
    quantidade < p.lote_minimo_un
      ? {
          nivel: 'bloqueante',
          quantidade,
          lote_minimo_un: p.lote_minimo_un,
          mensagem: `Lote de ${quantidade} un está ABAIXO DO LOTE MÍNIMO aceito (${p.lote_minimo_un} un). Preço calculado apenas para referência — não enviar ao cliente.`,
        }
      : null;

  // ---- parcelas por modo ----
  type Parcela = {
    custo_un: number;
    taxa_pct: number;
    markup_pct: number;
    preco_un: number;
  };
  const parcelas: {
    produto: Parcela | null;
    embalagem: Parcela | null;
    mo: Parcela | null;
  } = {
    produto: null,
    embalagem: null,
    mo: null,
  };

  if (tributos.modo === 'full_service') {
    const taxa = taxaPorDentro(tributos.material!);
    parcelas.produto = {
      custo_un: custo_produto_un,
      taxa_pct: taxa,
      markup_pct: margem.aplicada_pct,
      preco_un: grossUp(
        custo_produto_un,
        margem.aplicada_pct,
        taxa,
        'parcela produto',
      ),
    };
    if (embalagem_liquida > 0) {
      parcelas.embalagem = {
        custo_un: embalagem_liquida,
        taxa_pct: taxa,
        markup_pct: p.taxa_gestao_embalagem_pct,
        preco_un: grossUp(
          embalagem_liquida,
          p.taxa_gestao_embalagem_pct,
          taxa,
          'parcela embalagem',
        ),
      };
    }
  } else if (tributos.modo === 'hibrido') {
    const taxaMat = taxaPorDentro(tributos.material!);
    const taxaMo = taxaPorDentro(tributos.mo!);
    const custoMat = mp_liquida + frete; // material próprio (sem embalagem: cliente fornece)
    parcelas.produto = {
      custo_un: custoMat,
      taxa_pct: taxaMat,
      markup_pct: margem.aplicada_pct,
      preco_un: grossUp(
        custoMat,
        margem.aplicada_pct,
        taxaMat,
        'parcela material',
      ),
    };
    parcelas.mo = {
      custo_un: fabrica_un,
      taxa_pct: taxaMo,
      markup_pct: margem.aplicada_pct,
      preco_un: grossUp(
        fabrica_un,
        margem.aplicada_pct,
        taxaMo,
        'parcela mão de obra',
      ),
    };
  } else {
    const taxaMo = taxaPorDentro(tributos.mo!);
    // industrialização: material residual (se houver) vira custo da execução
    parcelas.mo = {
      custo_un: custo_produto_un,
      taxa_pct: taxaMo,
      markup_pct: margem.aplicada_pct,
      preco_un: grossUp(
        custo_produto_un,
        margem.aplicada_pct,
        taxaMo,
        'parcela execução',
      ),
    };
  }

  const preco_produto_sipi =
    (parcelas.produto?.preco_un ?? 0) + (parcelas.mo?.preco_un ?? 0);
  const preco_embalagem_sipi = parcelas.embalagem?.preco_un ?? 0;
  const preco_sipi = preco_produto_sipi + preco_embalagem_sipi;

  // ---- IPI por fora, na base do modo (igual ao Motor 1) ----
  const parcelaIpi = tributos.material;
  const ipi_pct = parcelaIpi?.ipi.tipo === 'tributado' ? parcelaIpi.ipi.pct : 0;
  const base_ipi_valor =
    tributos.base_ipi === 'total'
      ? preco_sipi
      : tributos.base_ipi === 'material'
        ? (parcelas.produto?.preco_un ?? 0) + preco_embalagem_sipi
        : 0;
  const ipi_un = base_ipi_valor * (ipi_pct / 100);
  const icms_sobre_ipi =
    parcelaIpi &&
    parcelaIpi.icms_base_inclui_ipi &&
    parcelaIpi.icms.tipo === 'tributado'
      ? ipi_un * (parcelaIpi.icms.pct / 100)
      : 0;
  // Arredondamento UNICO (red team A1): as partes exibidas somam exatamente o
  // total exibido (16,87 + 8,54 = 25,41), e o preco com IPI = sem IPI + IPI
  // arredondados - a aritmetica do PDF fecha ao centavo.
  const preco_sipi_r = r2(preco_sipi);
  const preco_produto_sipi_r = r2(preco_produto_sipi);
  const preco_embalagem_sipi_r = r2(preco_sipi_r - preco_produto_sipi_r);
  const ipi_un_r = r2(ipi_un);
  const icms_sobre_ipi_r = r2(icms_sobre_ipi);
  const preco_cipi = r2(preco_sipi_r + ipi_un_r + icms_sobre_ipi_r);

  const rp = (x: Parcela | null) =>
    x && {
      custo_un: r4(x.custo_un),
      taxa_pct: r4(x.taxa_pct),
      markup_pct: r4(x.markup_pct),
      preco_un: r4(x.preco_un),
    };

  return {
    motor: MOTOR_2_ID,
    material: {
      mp_bruta: r4(mp_bruta),
      perda_pct: p.perda_mp_pct,
      perda: r4(perda),
      credito_mp_pct: p.credito_mp_pct,
      credito_mp: r4(credito_mp),
      mp_liquida: r4(mp_liquida),
      frete: r2(frete),
      embalagem_informada: r4(embalagem_informada),
      embalagem_bruta: r4(embalagem_bruta),
      credito_emb_pct: p.credito_emb_pct,
      credito_emb: r4(credito_emb),
      embalagem_liquida: r4(embalagem_liquida),
      custo_material_un: r4(custo_material_un),
    },
    mao_de_obra: {
      taxa_minuto: prod.taxa_minuto,
      custo_setup_ordem: prod.custo_setup_ordem,
      minutos_produtivos_dia_linha: prod.minutos_produtivos_dia_linha,
      producao_diaria: r2(prod.producao_dia_linha),
      setup_un: prod.setup_un,
      corrida_un: prod.corrida_un,
      mo_un: r4(fabrica_un),
    },
    margem,
    embalagem: {
      precificada: embalagemPrecificada && embalagem_liquida > 0,
      taxa_gestao_pct: p.taxa_gestao_embalagem_pct,
    },
    alertas: {
      moq: alerta_moq,
      mp_sem_preco:
        inputs.mp_sem_preco && inputs.mp_sem_preco.length > 0
          ? {
              quantidade: inputs.mp_sem_preco.length,
              nomes: inputs.mp_sem_preco,
            }
          : null,
      lote_minimo: alerta_lote_minimo,
      embalagem_ignorada:
        !embalagemPrecificada && embalagem_informada > 0
          ? {
              embalagem_un: r4(embalagem_informada),
              modo: tributos.modo,
              mensagem: `Embalagem de ${r2(embalagem_informada).toFixed(2)} informada, mas no modo ${tributos.modo} o cliente fornece a embalagem — entrou R$ 0,00 no preço.`,
            }
          : null,
    },
    parcelas: {
      produto: rp(parcelas.produto),
      embalagem: rp(parcelas.embalagem),
      mo: rp(parcelas.mo),
    },
    resultado: {
      margem_pct: margem.aplicada_pct,
      preco_produto_sipi: preco_produto_sipi_r,
      preco_embalagem_sipi: preco_embalagem_sipi_r,
      preco_sipi: preco_sipi_r,
      ipi_pct,
      base_ipi: tributos.base_ipi,
      ipi_un: ipi_un_r,
      icms_sobre_ipi: icms_sobre_ipi_r,
      preco_cipi,
    },
    premissas: [
      'Densidade 1,0 g/mL: volume_un (mL) tratado como massa (g) para converter R$/kg em R$/un.',
      `MP pelo preço da última compra x (1 + perda ${p.perda_mp_pct}%) x (1 - crédito ${p.credito_mp_pct}%).`,
      `Embalagem x (1 - crédito ${p.credito_emb_pct}%); gross-up com taxa de gestão ${p.taxa_gestao_embalagem_pct}% (sem margem do produto).`,
    ],
    fundamentos: tributos.fundamentos,
  };
}

export type CalculoCustoMotor2 = ReturnType<typeof calcularCustoMotor2>;
